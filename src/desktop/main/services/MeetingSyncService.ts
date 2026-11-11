import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import { ApiError, type ApiMeeting, type ApiService } from './ApiService';
import type { LocalMeeting, LocalMeetingSegment, LocalOutboxItem } from '../storage/models';
import { LocalStore } from '../storage/LocalStore';

type MeetingApi = Pick<ApiService, 'createMeeting' | 'patchMeeting' | 'getMeeting' | 'listMeetings' | 'resumeMeeting' | 'finishMeeting' | 'uploadMeetingSegment' | 'patchMeetingTranscript' | 'patchMeetingSummary' | 'putDictationMetric'>;

/** Coordinates account-scoped durable delivery and authoritative meeting cache refreshes. */
export class MeetingSyncService {
  private flight: { scope: string; promise: Promise<void> } | null = null;

  /** Args: api delivers generated requests; store owns pending work; readSegment checks containment; scopeToken identifies the active account. */
  public constructor(
    private readonly api: MeetingApi,
    private readonly store: LocalStore,
    private readonly readSegment: (segment: LocalMeetingSegment) => Uint8Array | null,
    private readonly scopeToken: () => string | null,
    private readonly removeAudio: (path: string) => void = () => undefined,
  ) {}

  /** Enqueues retry-safe creation with a caller-stable meeting identity. */
  public queueCreate(meeting: LocalMeeting): void {
    this.enqueue('meeting-create', meeting.id, { id: meeting.id, title: meeting.title, startedAt: new Date(meeting.createdAt).toISOString() });
  }

  /** Enqueues a backend metadata edit rather than renaming only the local cache. */
  public queueMetadata(input: { id: string; title: string; revision: number }): void {
    this.enqueue('meeting-metadata', input.id, input);
  }

  /** Enqueues one separately retained recording segment. */
  public queueSegment(meetingId: string, segmentId: string): void {
    this.enqueue('meeting-segment', segmentId, { meetingId, segmentId });
  }

  /** Enqueues resume before uploading the next segment. */
  public queueResume(meetingId: string): void { this.enqueue('meeting-resume', meetingId, { meetingId }); }

  /** Enqueues finish after completed recording segments. */
  public queueFinish(meetingId: string): void { this.enqueue('meeting-finish', meetingId, { meetingId }); }

  /** Enqueues a revisioned edit without losing the local draft while offline. */
  public queueText(kind: 'meeting-transcript' | 'meeting-summary', input: { id: string; text: string; revision: number }): void {
    this.enqueue(kind, input.id, input);
  }

  /** Serializes delivery per account, including operations queued while a request is in flight. */
  public async sync(): Promise<void> {
    const scope = this.scopeToken();
    if (!scope) return;
    if (this.flight?.scope === scope) return this.flight.promise;
    const promise = this.flush(scope);
    this.flight = { scope, promise };
    try { await promise; }
    finally { if (this.flight?.promise === promise) this.flight = null; }
  }

  /** Retrieves one remote meeting while preserving pending local edits and account isolation. */
  public async refresh(id: string): Promise<void> {
    const scope = this.scopeToken();
    if (!scope) return;
    const remote = await this.api.getMeeting(id);
    if (this.currentScope(scope)) this.cache(remote);
  }

  /** Drains durable operations in insertion order before fetching the authoritative listing. */
  private async flush(scope: string): Promise<void> {
    while (this.currentScope(scope)) {
      const item = this.store.listOutbox()[0];
      if (!item) break;
      try {
        await this.deliver(item, scope);
        if (!this.currentScope(scope)) return;
        this.store.acknowledgeOutbox(item.id);
      } catch (error) {
        if (!this.currentScope(scope)) return;
        this.store.failOutbox(item.id, safeError(error));
        const meetingId = item.kind === 'meeting-segment'
          ? stringAt(JSON.parse(item.payload) as Record<string, unknown>, 'meetingId') : item.entityId;
        const meeting = this.store.getMeeting(meetingId);
        if (meeting) this.store.saveMeeting({ ...meeting, error: safeError(error), syncState: 'error' });
        // A revision conflict, a rejected upload or missing audio will never succeed on retry. Drop
        // the item (the meeting shows the error) so it cannot block every later item forever.
        if (isPermanentFailure(error)) { this.store.acknowledgeOutbox(item.id); continue; }
        return;
      }
    }
    if (!this.currentScope(scope)) return;
    try {
      const remote = await this.api.listMeetings();
      if (!this.currentScope(scope)) return;
      for (const item of remote) this.cache(item);
      this.pruneDeleted(new Set(remote.map((item) => item.id)));
    } catch {
      // A failed refresh does not make a valid scoped cache disappear.
    }
  }

  /**
   * Removes synced meetings the server no longer has (deleted elsewhere, or by a sync tombstone),
   * with their transcripts and local recordings. Unsent and recording meetings stay.
   */
  private pruneDeleted(remoteIds: ReadonlySet<string>): void {
    for (const local of this.store.listMeetings()) {
      if (local.syncState !== 'synced' || local.status === 'recording' || remoteIds.has(local.id)) continue;
      for (const segment of this.store.listMeetingSegments(local.id)) {
        if (segment.audioPath) this.removeAudio(segment.audioPath);
        this.store.deleteMeetingSegment(segment.id);
      }
      if (local.audioPath) this.removeAudio(local.audioPath);
      this.store.discardOutboxForEntity(local.id);
      this.store.deleteMeeting(local.id);
    }
  }

  /** Confirms a response belongs to the account which started its request. */
  private currentScope(scope: string): boolean { return this.scopeToken() === scope; }

  /** Delivers one operation without permitting late responses to write into another account. */
  private async deliver(item: LocalOutboxItem, scope: string): Promise<void> {
    const payload = JSON.parse(item.payload) as Record<string, unknown>;
    let response: ApiMeeting;
    switch (item.kind) {
      case 'meeting-create':
        response = await this.api.createMeeting({ id: stringAt(payload, 'id'), title: stringAt(payload, 'title'), startedAt: stringAt(payload, 'startedAt') });
        break;
      case 'meeting-metadata':
        response = await this.api.patchMeeting({ id: stringAt(payload, 'id'), title: stringAt(payload, 'title'), revision: numberAt(payload, 'revision') });
        break;
      case 'meeting-resume': response = await this.api.resumeMeeting(stringAt(payload, 'meetingId')); break;
      case 'meeting-finish': response = await this.api.finishMeeting(stringAt(payload, 'meetingId')); break;
      case 'meeting-segment': {
        const meetingId = stringAt(payload, 'meetingId');
        const segmentId = stringAt(payload, 'segmentId');
        const segment = this.store.listMeetingSegments(meetingId).find((candidate) => candidate.id === segmentId);
        if (!segment) throw new PermanentSyncError('Meeting segment was not found.');
        const audio = this.readSegment(segment);
        if (!audio) throw new PermanentSyncError('Meeting segment audio is unavailable.');
        response = await this.api.uploadMeetingSegment({
          audio, contentType: segment.contentType, durationMs: segment.durationMs,
          filename: segment.audioPath ? basename(segment.audioPath) : `${segment.id}.webm`, language: segment.language, meetingId, segmentId,
        });
        if (!this.currentScope(scope)) return;
        this.store.saveMeetingSegment({ ...segment, error: null, status: 'synced' });
        break;
      }
      case 'meeting-transcript':
        response = await this.api.patchMeetingTranscript({ id: stringAt(payload, 'id'), text: stringAt(payload, 'text'), revision: numberAt(payload, 'revision') });
        break;
      case 'meeting-summary':
        response = await this.api.patchMeetingSummary({ id: stringAt(payload, 'id'), text: stringAt(payload, 'text'), revision: numberAt(payload, 'revision') });
        break;
      case 'metric':
        await this.api.putDictationMetric({
          id: stringAt(payload, 'id'), createdAt: stringAt(payload, 'createdAt'), durationMs: numberAt(payload, 'durationMs'),
          outputWords: numberAt(payload, 'outputWords'), dictionaryReplacements: numberAt(payload, 'dictionaryReplacements'),
          // Items queued before corrections were counted carry no field; the server treats absence as zero.
          correctedWords: typeof payload.correctedWords === 'number' ? payload.correctedWords : 0,
          ...(typeof payload.appName === 'string' ? { appName: payload.appName } : {}),
          ...(typeof payload.deviceId === 'string' ? { deviceId: payload.deviceId } : {}), timeZone: stringAt(payload, 'timeZone'),
        });
        return;
    }
    if (this.currentScope(scope)) this.cache(response, item.id);
  }

  /** Merges remote content while keeping unacknowledged edits and unsent recording durations. */
  private cache(remote: ApiMeeting, acknowledgedId?: string): void {
    const previous = this.store.getMeeting(remote.id);
    const outbox = this.store.listOutbox().filter((item) => item.id !== acknowledgedId);
    const pending = outbox.filter((item) => item.entityId === remote.id);
    const unsentDuration = this.store.listMeetingSegments(remote.id)
      .filter((segment) => segment.status !== 'synced').reduce((sum, segment) => sum + segment.durationMs, 0);
    const transcriptPending = pending.some((item) => item.kind === 'meeting-transcript');
    const summaryPending = pending.some((item) => item.kind === 'meeting-summary');
    const hasPending = pending.length > 0 || unsentDuration > 0;
    // A conflict retains the draft until explicit user save against a refreshed revision.
    const retainConflict = previous?.syncState === 'error';
    this.store.saveMeeting({
      // A delayed response must not erase a completed local capture after its segment is acknowledged.
      createdAt: previous?.createdAt ?? Date.parse(remote.startedAt), durationMs: Math.max(remote.durationMs, previous?.durationMs ?? 0),
      endedAt: remote.endedAt ? Date.parse(remote.endedAt) : null,
      error: retainConflict ? previous.error : remote.error ?? null, historyEntryIds: previous?.historyEntryIds ?? [], id: remote.id,
      revision: remote.revision, status: previous?.status === 'recording' ? 'recording' : remote.transcriptStatus === 'failed' || remote.summaryStatus === 'failed' ? 'error' : 'complete',
      summary: (summaryPending || retainConflict) && previous ? previous.summary : remote.summary ?? '', summaryRevision: remote.summaryRevision,
      summarySourceRevision: remote.summarySourceRevision, summaryStale: remote.summaryStale,
      summaryStatus: remote.summaryStatus ?? 'idle', syncState: retainConflict ? 'error' : hasPending ? 'pending' : 'synced', title: pending.some((item) => item.kind === 'meeting-metadata') && previous ? previous.title : remote.title,
      transcript: (transcriptPending || retainConflict) && previous ? previous.transcript : remote.transcript ?? '', transcriptRevision: remote.transcriptRevision,
      transcriptStatus: remote.transcriptStatus ?? 'idle', audioPath: previous?.audioPath,
    });
  }

  /** Persists an ordered operation before attempting its network side effect. */
  private enqueue(kind: LocalOutboxItem['kind'], entityId: string, payload: unknown): void {
    this.store.enqueueOutbox({ attempts: 0, createdAt: Date.now(), entityId, id: `${kind}:${entityId}:${randomUUID()}`, kind, payload: JSON.stringify(payload) });
  }
}

/** Reads a validated string from locally generated durable data. */
function stringAt(value: Record<string, unknown>, key: string): string {
  const item = value[key];
  if (typeof item !== 'string' || item.length === 0) throw new Error('Invalid durable meeting operation.');
  return item;
}

/** Reads a finite number from locally generated durable data. */
function numberAt(value: Record<string, unknown>, key: string): number {
  const item = value[key];
  if (typeof item !== 'number' || !Number.isFinite(item)) throw new Error('Invalid durable meeting operation.');
  return item;
}

/** Returns a bounded display error without retaining API bodies. */
function safeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message.slice(0, 500) : 'Meeting synchronization failed.';
}

/** A local condition that no retry can fix, such as a segment whose audio file is gone. */
class PermanentSyncError extends Error {}

/**
 * Whether an outbox failure can never succeed on retry.
 *
 * Client errors are permanent, except an expired session (401), a timeout (408) and rate limiting
 * (429). Network failures and server errors are transient and keep their place in the queue.
 */
function isPermanentFailure(error: unknown): boolean {
  if (error instanceof PermanentSyncError) return true;
  if (!(error instanceof ApiError) || error.status === undefined) return false;
  return error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status);
}
