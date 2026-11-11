import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ApiError, type ApiMeeting } from './ApiService';
import { MeetingSyncService } from './MeetingSyncService';
import { LocalStore } from '../storage/LocalStore';

const ownerA = { server: 'https://api.example.test', userId: 'owner-a' };
const ownerB = { ...ownerA, userId: 'owner-b' };
const remote: ApiMeeting = {
  id: 'meeting', title: 'Meeting', startedAt: '2026-10-13T00:00:00Z', endedAt: null,
  durationMs: 0, revision: 1, transcript: '', transcriptRevision: 0, summary: '',
  summaryRevision: 0, summarySourceRevision: null, summaryStale: false,
  transcriptStatus: 'pending', summaryStatus: 'idle', error: null, hasAudio: false,
};
const stores: Array<{ store: LocalStore; directory: string }> = [];

/** Creates isolated scoped storage and a fake API at the real service boundary. */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'whisperer-sync-'));
  const store = new LocalStore({ databasePath: join(directory, 'desktop.sqlite') });
  store.setScope(ownerA);
  stores.push({ store, directory });
  let scope: string | null = 'a';
  const api = {
    createMeeting: vi.fn(async () => remote),
    patchMeeting: vi.fn(async () => remote),
    getMeeting: vi.fn(async () => remote),
    listMeetings: vi.fn(async () => [remote]),
    resumeMeeting: vi.fn(async () => remote),
    finishMeeting: vi.fn(async () => ({ ...remote, endedAt: '2026-10-13T00:01:00Z', durationMs: 60000 })),
    uploadMeetingSegment: vi.fn(async () => ({ ...remote, durationMs: 60000 })),
    patchMeetingTranscript: vi.fn(async () => remote),
    patchMeetingSummary: vi.fn(async () => remote),
    putDictationMetric: vi.fn(async () => undefined),
  };
  const service = new MeetingSyncService(api, store, () => new Uint8Array([1]), () => scope);
  return { store, service, api, changeScope: () => { scope = 'b'; store.setScope(ownerB); } };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const { store, directory } of stores.splice(0)) { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

describe('MeetingSyncService', () => {
  test('keeps same-millisecond operations in insertion order and serializes concurrent flushes', async () => {
    const { store, service, api } = fixture();
    store.saveMeeting({ id: 'meeting', title: 'Meeting', createdAt: Date.parse(remote.startedAt), durationMs: 60000, transcript: '', summary: '', status: 'complete' });
    store.saveMeetingSegment({ id: 'segment', meetingId: 'meeting', createdAt: 1, durationMs: 60000, contentType: 'audio/webm', language: 'en', status: 'pending' });
    vi.spyOn(Date, 'now').mockReturnValue(1);
    service.queueCreate(store.getMeeting('meeting')!);
    service.queueSegment('meeting', 'segment');
    service.queueFinish('meeting');
    await Promise.all([service.sync(), service.sync()]);
    expect(api.createMeeting).toHaveBeenCalledTimes(1);
    expect(api.uploadMeetingSegment).toHaveBeenCalledTimes(1);
    expect(api.finishMeeting).toHaveBeenCalledTimes(1);
    expect(api.createMeeting.mock.invocationCallOrder[0]!).toBeLessThan(api.uploadMeetingSegment.mock.invocationCallOrder[0]!);
    expect(api.uploadMeetingSegment.mock.invocationCallOrder[0]!).toBeLessThan(api.finishMeeting.mock.invocationCallOrder[0]!);
    expect(store.listOutbox()).toEqual([]);
    expect(store.listMeetingSegments('meeting')[0]!.status).toBe('synced');
  });

  test('does not cache a late response or acknowledge work in a replacement account', async () => {
    const { store, service, api, changeScope } = fixture();
    let finish!: (meeting: ApiMeeting) => void;
    api.createMeeting.mockImplementation(() => new Promise<ApiMeeting>((resolve) => { finish = resolve; }));
    store.saveMeeting({ id: 'meeting', title: 'Meeting', createdAt: 1, durationMs: 0, transcript: '', summary: '', status: 'complete' });
    service.queueCreate(store.getMeeting('meeting')!);
    const flight = service.sync();
    changeScope();
    finish(remote);
    await flight;
    expect(store.listMeetings()).toEqual([]);
    expect(store.listOutbox()).toEqual([]);
    store.setScope(ownerA);
    expect(store.listOutbox()).toHaveLength(1);
  });

  test('retains an offline draft instead of replacing it with older server content', async () => {
    const { store, service, api } = fixture();
    store.saveMeeting({ id: 'meeting', title: 'Meeting', createdAt: 1, durationMs: 0, transcript: 'Local draft', summary: '', status: 'complete', syncState: 'pending' });
    api.patchMeetingTranscript.mockRejectedValue(new ApiError('Offline'));
    service.queueText('meeting-transcript', { id: 'meeting', text: 'Local draft', revision: 1 });
    await service.sync();
    await service.refresh('meeting');
    expect(store.getMeeting('meeting')?.transcript).toBe('Local draft');
    expect(store.listOutbox()).toHaveLength(1);
  });

  test('does not regress an accumulated duration when a rename response is stale', async () => {
    const { store, service, api } = fixture();
    store.saveMeeting({ id: 'meeting', title: 'Meeting', createdAt: 1, durationMs: 60000, transcript: '', summary: '', status: 'complete' });
    api.patchMeeting.mockResolvedValue({ ...remote, title: 'Renamed meeting', revision: 2 });
    service.queueMetadata({ id: 'meeting', title: 'Renamed meeting', revision: 1 });

    await service.sync();

    expect(store.getMeeting('meeting')?.durationMs).toBe(60000);
  });

  test('makes a stale revision visible and permits subsequent events to be delivered', async () => {
    const { store, service, api } = fixture();
    store.saveMeeting({ id: 'meeting', title: 'Meeting', createdAt: 1, durationMs: 0, transcript: 'Conflict draft', summary: '', status: 'complete', syncState: 'pending' });
    api.patchMeetingTranscript.mockRejectedValue(new ApiError('The meeting changed.', 412));
    service.queueText('meeting-transcript', { id: 'meeting', text: 'Conflict draft', revision: 1 });
    store.enqueueOutbox({ id: 'metric', kind: 'metric', entityId: 'metric', createdAt: Date.now() + 1, attempts: 0, payload: JSON.stringify({ id: 'event', createdAt: remote.startedAt, durationMs: 1, outputWords: 1, dictionaryReplacements: 0, timeZone: 'UTC' }) });
    await service.sync();
    expect(store.getMeeting('meeting')?.syncState).toBe('error');
    await service.sync();
    expect(api.putDictationMetric).toHaveBeenCalledTimes(1);
    expect(store.getMeeting('meeting')?.transcript).toBe('Conflict draft');
  });

  test('drops a permanently rejected upload and still delivers later work', async () => {
    const { store, service, api } = fixture();
    queueSegmentAndMetric(store, service);
    api.uploadMeetingSegment.mockRejectedValue(new ApiError('Audio uploads are limited to 25 MB.', 413));
    await service.sync();
    expect(api.putDictationMetric).toHaveBeenCalledTimes(1);
    expect(store.listOutbox()).toHaveLength(0);
    expect(store.getMeeting('meeting')?.syncState).toBe('error');
    expect(store.getMeeting('meeting')?.error).toContain('25 MB');
  });

  test('treats missing segment audio as permanent', async () => {
    const { store, api } = fixture();
    const service = new MeetingSyncService(api, store, () => null, () => 'a');
    queueSegmentAndMetric(store, service);
    await service.sync();
    expect(api.uploadMeetingSegment).not.toHaveBeenCalled();
    expect(api.putDictationMetric).toHaveBeenCalledTimes(1);
    expect(store.listOutbox()).toHaveLength(0);
  });

  test('keeps order and retries after a transient failure', async () => {
    const { store, service, api } = fixture();
    queueSegmentAndMetric(store, service);
    for (const failure of [new Error('fetch failed'), new ApiError('Busy', 429), new ApiError('Bad gateway', 502), new ApiError('Expired', 401)]) {
      api.uploadMeetingSegment.mockRejectedValueOnce(failure);
      await service.sync();
      expect(api.putDictationMetric).not.toHaveBeenCalled();
      expect(store.listOutbox()).toHaveLength(2);
    }
    await service.sync();
    expect(api.putDictationMetric).toHaveBeenCalledTimes(1);
    expect(store.listOutbox()).toHaveLength(0);
  });
});

describe('server deletions', () => {
  test('drop a synced meeting from the local cache, with its audio', async () => {
    const { store, api } = fixture();
    const removed: string[] = [];
    const service = new MeetingSyncService(api, store, () => new Uint8Array([1]), () => 'a', (path) => removed.push(path));
    store.saveMeeting({ id: 'gone', title: 'Deleted elsewhere', createdAt: 1, durationMs: 0, transcript: 'private words', summary: '', status: 'complete', syncState: 'synced' });
    store.saveMeeting({ id: 'draft', title: 'Not uploaded yet', createdAt: 2, durationMs: 0, transcript: '', summary: '', status: 'complete', syncState: 'pending' });
    await service.sync();
    expect(store.getMeeting('gone')).toBeNull();
    expect(store.getMeeting('draft')).not.toBeNull();
    expect(store.getMeeting('meeting')).not.toBeNull();
  });

  test('keep the cache when the listing fails offline', async () => {
    const { store, api, service } = fixture();
    api.listMeetings.mockRejectedValue(new Error('offline'));
    store.saveMeeting({ id: 'kept', title: 'Cached', createdAt: 1, durationMs: 0, transcript: 't', summary: '', status: 'complete', syncState: 'synced' });
    await service.sync();
    expect(store.getMeeting('kept')).not.toBeNull();
  });
});

/** Queues one finished meeting segment followed by an unrelated dictation metric. */
function queueSegmentAndMetric(store: LocalStore, service: MeetingSyncService): void {
  store.saveMeeting({ id: 'meeting', title: 'Meeting', createdAt: 1, durationMs: 0, transcript: '', summary: '', status: 'complete', syncState: 'pending' });
  store.saveMeetingSegment({ id: 'segment', meetingId: 'meeting', contentType: 'audio/webm', createdAt: 1, durationMs: 1000, language: 'en', status: 'pending' });
  service.queueSegment('meeting', 'segment');
  store.enqueueOutbox({ id: 'metric', kind: 'metric', entityId: 'metric', createdAt: Date.now() + 1, attempts: 0, payload: JSON.stringify({ id: 'event', createdAt: remote.startedAt, durationMs: 1, outputWords: 1, dictionaryReplacements: 0, timeZone: 'UTC' }) });
}
