import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient, type Client } from '../../../../packages/api-client/src/client';
import * as operations from '../../../../packages/api-client/src/sdk.gen';
import type { DevicePollResponse, DictionaryResponse, NoteResponse, SyncSnapshot, TranscriptResponse } from '../../../../packages/api-client/src/types.gen';
import type { AppMetric, ConnectionMode, DailyMetric, Metrics, TransformationInput } from '../../shared/contracts';
import { SettingsService, type ApplicationSession } from './SettingsService';
import { signInCode } from '../runtime/SignInCode';

/** Injects the system-trusted transport, secure preferences and browser opener. */
export interface ApiServiceOptions {
  settings: SettingsService;
  /** Electron's session fetch accepts a string or Request, which is all the generated client passes. */
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
  openExternal(url: string): Promise<unknown>;
  onSignOut(): void;
  /** Verified on-device connection, or null. Used only while the connection mode is 'device'. */
  local?: () => { host: string; token: string; generation: number } | null;
}

/** Represents an HTTP failure without retaining response bodies or credentials. */
export class ApiError extends Error {
  /** Args: message is safe display text; status is the HTTP status, if available; code is a stable IPC code. */
  constructor(message: string, readonly status?: number, readonly code?: string) { super(message); this.name = 'ApiError'; }
}

interface DeviceTransaction { host: string; code: string; verifier: string; controller: AbortController; epoch: number; started?: boolean; completion?: DevicePollResponse }
interface Result<T> { data?: T; error?: unknown; response?: Response }

export interface ApiMeetingQuestionAnswer {
  answer: string;
  transcriptRevision: number;
  summaryRevision: number;
  summaryStale: boolean;
  usedSummary: boolean;
}

/** Stable subset of a flattened authoritative meeting response used by the desktop cache. */
export interface ApiMeeting {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  revision?: number;
  transcript?: string;
  transcriptRevision?: number;
  summary?: string;
  summaryRevision?: number;
  summarySourceRevision?: number | null;
  summaryStale?: boolean;
  transcriptStatus?: 'pending' | 'running' | 'complete' | 'failed' | 'idle';
  summaryStatus?: 'pending' | 'running' | 'complete' | 'failed' | 'idle';
  error?: string | null;
  hasAudio?: boolean;
}

/** Adapts the generated contract without mutable global client configuration or renderer tokens. */
export class ApiService {
  private login: DeviceTransaction | null = null;
  private epoch = 0;
  private refreshFlight: Promise<void> | null = null;
  private redemption: { transaction: DeviceTransaction; promise: Promise<DevicePollResponse | null> } | null = null;
  /** Advances on every backend switch so a late response is never applied to the new backend. */
  private routeEpoch = 0;

  /** Args: options supplies all network, browser and persistence side effects. Returns: an inactive service. */
  constructor(private readonly options: ApiServiceOptions) {}

  /** Begin and await one verifier-bound browser transaction. Args: host is the candidate URL; options may cancel it. Returns: completion or null after cancellation. */
  async signIn(host: string, options: { signal?: AbortSignal } = {}): Promise<DevicePollResponse | null> {
    this.cancelLogin();
    const transaction: DeviceTransaction = { host: this.options.settings.normalizeApiHost(host), code: randomUUID(), verifier: randomBytes(32).toString('base64url'), controller: new AbortController(), epoch: this.epoch };
    this.login = transaction;
    const cancel = (): void => transaction.controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    try {
      const health = await this.publicCall<{ service: string }>(transaction.host, (client) => operations.getHealth({ client }), transaction.controller.signal);
      if (!this.active(transaction)) return null;
      if (health.service !== 'whisperer') throw new ApiError('This is not a Whisperer server.');
      const url = new URL(`${transaction.host}/login`);
      url.searchParams.set('device_code', transaction.code);
      url.searchParams.set('verifier_challenge', createHash('sha256').update(transaction.verifier).digest('base64url'));
      await this.options.openExternal(url.href);
      const deadline = Date.now() + 10 * 60 * 1000;
      while (this.active(transaction) && Date.now() < deadline) {
        const completion = await this.poll(transaction);
        if (completion) return completion;
        if (!this.active(transaction)) return null;
        await delay(2000, undefined, { signal: transaction.controller.signal });
      }
      if (this.active(transaction)) throw new ApiError('Sign-in expired. Start again.');
      return null;
    } catch (error) {
      if (!this.active(transaction) || transaction.controller.signal.aborted) return null;
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', cancel);
      if (this.login === transaction) this.login = null;
    }
  }

  /** The code the approval page must show for the sign-in in progress, or null when none is. */
  pendingSignInCode(): string | null { return this.login ? signInCode(this.login.code) : null; }

  /** Drops every in-flight result after a backend switch or local server restart. */
  invalidate(): void { this.routeEpoch += 1; }

  /** Cancel pending login without changing an already established session. Args: none. Returns: nothing. */
  cancelLogin(): void { this.login?.controller.abort(); this.login = null; }

  /** Redeem only a matching correlation-only return link. Args: raw is OS-supplied. Returns: completion or null for an irrelevant link. */
  async handleDeepLink(raw: string): Promise<DevicePollResponse | null> {
    let url: URL;
    try { url = new URL(raw); } catch { return null; }
    const transaction = this.login;
    if (!transaction || url.protocol !== 'whisperer:' || url.hostname !== 'auth' || url.pathname !== '/transfer/success' || url.searchParams.get('device_code') !== transaction.code || url.searchParams.has('access_token') || url.searchParams.has('refresh_token')) return null;
    return this.poll(transaction);
  }

  /** Fetch only public profile data. Args: none. Returns: identity without session credentials. */
  async me(): Promise<{ id: string; email?: string | null; displayName?: string }> {
    const result = await this.authorized<{ user: { id: string; firstName?: string | null; lastName?: string | null } }>((client) => operations.getCurrentUser({ client }));
    if (!result.user || typeof result.user.id !== 'string') throw new ApiError('Invalid account response.');
    const displayName = [result.user.firstName, result.user.lastName].filter(Boolean).join(' ');
    return displayName ? { id: result.user.id, displayName } : { id: result.user.id };
  }

  /** Revoke server credentials best effort and always erase local credentials. Args: none. Returns: nothing. Raises: network failure after local cleanup. */
  async signOut(): Promise<void> {
    const session = this.options.settings.getSession();
    const host = this.options.settings.get().apiHost;
    this.epoch += 1;
    this.cancelLogin();
    this.options.settings.setSession(null);
    this.options.onSignOut();
    if (session && host) await this.execute<null>(host, session.accessToken, (client) => operations.logoutApplicationSession({ client }));
  }

  /** Updates only profile fields supported by the connected server. */
  async patchCurrentUser(input: { firstName?: string | null; lastName?: string | null }): Promise<{ id: string; email?: string | null; displayName?: string }> {
    const response = await this.authorized<{ user: { id: string; email?: string | null; firstName?: string | null; lastName?: string | null } }>(
      (client) => operations.patchCurrentUser({ client, body: input }),
    );
    const user = response.user;
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return { displayName: displayName || undefined, email: user.email, id: user.id };
  }

  /** Deletes the connected account server-side and always clears local credentials and scope. */
  async deleteAccount(): Promise<void> {
    await this.authorized<void>((client) => operations.deleteAccount({ client }));
    this.clearSession();
  }

  /** List server notes. Args: none. Returns: owned notes. */
  async listNotes(): Promise<NoteResponse[]> { return (await this.authorized<{ items: NoteResponse[] }>((client) => operations.listNotes({ client }))).items; }

  /** Save supported note fields. Args: input supplies optional remote id and content. Returns: persisted server note. */
  async saveNote(input: { id?: string; title: string; content: string; pinned?: boolean }): Promise<NoteResponse> {
    const body = { title: input.title, content: input.content };
    if (!input.id) return this.authorized((client) => operations.createNote({ client, body }));
    return this.authorized((client) => operations.patchNote({ client, path: { note_id: input.id! }, body: { ...body, ...(input.pinned === undefined ? {} : { pinned: input.pinned }) } }));
  }

  /** Delete a remote note. Args: id is the owned note identifier. Returns: nothing. */
  async deleteNote(id: string): Promise<void> { await this.authorized((client) => operations.deleteNote({ client, path: { note_id: id } })); }

  /** Generate a real gateway-backed summary. Args: id is a previously synchronized note. Returns: updated note. */
  summarizeNote(id: string): Promise<NoteResponse> { return this.authorized((client) => operations.summarizeNote({ client, path: { note_id: id } })); }

  /** List private dictionary substitutions. Args: none. Returns: owned entries. */
  async listDictionary(): Promise<DictionaryResponse[]> { return (await this.authorized<{ items: DictionaryResponse[] }>((client) => operations.listDictionary({ client }))).items; }

  /** Save a private substitution. Args: input is the phrase/replacement and optional id. Returns: persisted entry. */
  saveDictionary(input: { id?: string; phrase: string; replacement: string }): Promise<DictionaryResponse> {
    const body = { phrase: input.phrase, replacement: input.replacement };
    return input.id ? this.authorized((client) => operations.replaceDictionaryEntry({ client, path: { entry_id: input.id! }, body })) : this.authorized((client) => operations.createDictionaryEntry({ client, body }));
  }

  /** Delete a private substitution. Args: id is the owned entry identifier. Returns: nothing. */
  async deleteDictionary(id: string): Promise<void> { await this.authorized((client) => operations.deleteDictionaryEntry({ client, path: { entry_id: id } })); }

  /** Upload capture through the generated multipart contract. Args: input contains audio; signal cancels HTTP. Returns: server transcript, never a history fetch. */
  transcribe(input: { audio: Uint8Array; filename: string; contentType: string }, signal: AbortSignal): Promise<TranscriptResponse> {
    const settings = this.options.settings.get();
    const audio = Uint8Array.from(input.audio);
    const file = new File([audio], input.filename, { type: input.contentType });
    return this.authorized((client) => operations.createTranscription({ client, body: { file }, query: { ...(settings.language ? { language: settings.language } : {}), polish: settings.polish } }), signal, 120000);
  }

  /** Creates an authoritative meeting under a caller-stable UUID. */
  createMeeting(input: { id: string; title: string; startedAt: string }): Promise<ApiMeeting> {
    return this.authorized((client) => operations.createMeeting({ client, body: input }));
  }

  /** Lists authoritative meetings without widening renderer network access. */
  async listMeetings(): Promise<ApiMeeting[]> {
    return (await this.authorized<{ items: ApiMeeting[] }>((client) => operations.listMeetings({ client }))).items;
  }

  /** Retrieves one authoritative meeting. */
  getMeeting(id: string): Promise<ApiMeeting> {
    return this.authorized((client) => operations.getMeeting({ client, path: { meeting_id: id } }));
  }

  /** Asks against only the backend-owned saved meeting text with a bounded interactive timeout. */
  askMeetingQuestion(input: { id: string; question: string; transcriptRevision?: number; summaryRevision?: number }): Promise<ApiMeetingQuestionAnswer> {
    return this.authorized<ApiMeetingQuestionAnswer>((client) => operations.askMeetingQuestion({
      client,
      path: { meeting_id: input.id },
      body: {
        question: input.question,
        ...(input.transcriptRevision === undefined ? {} : { transcriptRevision: input.transcriptRevision }),
        ...(input.summaryRevision === undefined ? {} : { summaryRevision: input.summaryRevision }),
      },
    }), undefined, 30_000);
  }

  /** Saves backend-owned metadata under the latest meeting revision. */
  patchMeeting(input: { id: string; title: string; revision: number }): Promise<ApiMeeting> {
    return this.authorized((client) => operations.patchMeeting({ client, path: { meeting_id: input.id }, body: { title: input.title }, headers: { 'If-Match': String(input.revision) } }));
  }

  /** Deletes a backend meeting before local audio cleanup. */
  async deleteMeeting(id: string): Promise<void> {
    await this.authorized<void>((client) => operations.deleteMeeting({ client, path: { meeting_id: id } }));
  }

  /** Finishes a meeting without replacing earlier uploaded segments. */
  finishMeeting(id: string): Promise<ApiMeeting> {
    return this.authorized((client) => operations.finishMeeting({ client, path: { meeting_id: id } }));
  }

  /** Starts server processing for an existing stable meeting identity. */
  resumeMeeting(id: string): Promise<ApiMeeting> {
    return this.authorized((client) => operations.resumeMeeting({ client, path: { meeting_id: id } }));
  }

  /** Uploads an immutable separately captured segment to its existing meeting. */
  async uploadMeetingSegment(input: { meetingId: string; segmentId: string; audio: Uint8Array; filename: string; contentType: string; durationMs: number; language: string }): Promise<ApiMeeting> {
    const file = new File([Uint8Array.from(input.audio)], input.filename, { type: input.contentType });
    await this.authorized((client) => operations.uploadMeetingSegment({
      client,
      path: { meeting_id: input.meetingId, segment_id: input.segmentId },
      body: { file },
      query: { durationMs: input.durationMs, language: input.language },
    }), undefined, 120000);
    return this.getMeeting(input.meetingId);
  }

  /** Saves an authoritative transcript with its caller-observed revision. */
  async patchMeetingTranscript(input: { id: string; text: string; revision: number }): Promise<ApiMeeting> {
    await this.authorized((client) => operations.patchMeetingTranscript({
      client, path: { meeting_id: input.id }, body: { text: input.text }, headers: { 'If-Match': String(input.revision) },
    }));
    return this.getMeeting(input.id);
  }

  /** Saves an authoritative summary with its caller-observed revision. */
  async patchMeetingSummary(input: { id: string; text: string; revision: number }): Promise<ApiMeeting> {
    await this.authorized((client) => operations.patchMeetingSummary({
      client, path: { meeting_id: input.id }, body: { text: input.text }, headers: { 'If-Match': String(input.revision) },
    }));
    return this.getMeeting(input.id);
  }

  /** Requests summary regeneration without client-side text fabrication. */
  regenerateMeetingSummary(id: string): Promise<ApiMeeting> {
    return this.authorized((client) => operations.regenerateMeetingSummary({ client, path: { meeting_id: id } }));
  }

  /** Retries failed server processing for a segment or meeting as the backend permits. */
  async retryMeetingSegment(meetingId: string, segmentId: string): Promise<ApiMeeting> {
    await this.authorized((client) => operations.retryMeetingSegment({ client, path: { meeting_id: meetingId, segment_id: segmentId } }));
    return this.getMeeting(meetingId);
  }

  /** Delivers one stable accepted-dictation metric event exactly once at the API boundary. */
  putDictationMetric(event: { id: string; createdAt: string; durationMs: number; outputWords: number; correctedWords: number; dictionaryReplacements: number; appName?: string; deviceId?: string; timeZone: string }): Promise<void> {
    const { id, timeZone, ...body } = event;
    return this.authorized<void>((client) => operations.putDictationMetric({
      client, path: { event_id: id }, body: { ...body, timezone: timeZone },
    }));
  }

  /** Retrieves authoritative meeting audio metadata or a stream response as generated by the SDK. */
  getMeetingAudio(id: string, segmentId?: string): Promise<unknown> {
    return this.authorized((client) => operations.getMeetingAudio({ client, path: { meeting_id: id }, query: segmentId ? { segmentId } : {} }));
  }

  /** Retrieves authoritative aggregate metrics. */
  getMetrics(): Promise<Metrics> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return this.authorized((client) => operations.getMetrics({ client, query: { timeZone } }));
  }

  /** Retrieves daily authoritative metric buckets for an inclusive YYYY-MM-DD range. */
  async getDailyMetrics(range: { from: string; until: string }): Promise<DailyMetric[]> {
    const response = await this.authorized<{ days: DailyMetric[] }>((client) => operations.getDailyMetrics({ client, query: range }));
    return response.days;
  }

  /** Retrieves app-label aggregate metric buckets. */
  async getAppMetrics(): Promise<AppMetric[]> {
    const response = await this.authorized<{ items: AppMetric[] }>((client) => operations.getAppMetrics({ client }));
    return response.items;
  }

  /** Requests an explicit text-only transformation with no clipboard side effects. */
  async transform(input: TransformationInput, options: { signal?: AbortSignal } = {}): Promise<{ id: string; text: string }> {
    const result = await this.authorized<{ id: string; text: string }>((client) => operations.createTextTransformation({ client, body: input }), options.signal);
    return { id: result.id, text: result.text };
  }

  /** Exports one side's snapshot for a sync. Args: side is the on-device or the signed-in remote server. Returns: that side's records and deletions. */
  exportSyncSnapshot(side: ConnectionMode): Promise<SyncSnapshot> {
    return this.authorized((client) => operations.exportSyncSnapshot({ client }), undefined, 60_000, side);
  }

  /** Merges a snapshot into one side. Args: side receives the snapshot; snapshot came from the other side. Returns: records changed there. */
  async mergeSyncSnapshot(side: ConnectionMode, snapshot: SyncSnapshot): Promise<number> {
    const result = await this.authorized<{ changes: number }>((client) => operations.mergeSyncSnapshot({ client, body: snapshot }), undefined, 60_000, side);
    return result.changes;
  }

  /** Check a transaction has not been cancelled, replaced or signed out. Args: transaction is captured before I/O. Returns: whether it may persist. */
  private active(transaction: DeviceTransaction): boolean { return this.login === transaction && transaction.epoch === this.epoch && !transaction.controller.signal.aborted; }

  /** Share a protected redemption between polling and deep-link delivery. Args: transaction identifies one login. Returns: completion or pending. */
  private async poll(transaction: DeviceTransaction): Promise<DevicePollResponse | null> {
    if (this.redemption?.transaction === transaction) return this.redemption.promise;
    const promise = this.redeem(transaction);
    this.redemption = { transaction, promise };
    try { return await promise; } finally { if (this.redemption?.promise === promise) this.redemption = null; }
  }

  /** Persist a completion only if its exact transaction is still active. Args: transaction is verifier-bound. Returns: completion or null. */
  private async redeem(transaction: DeviceTransaction): Promise<DevicePollResponse | null> {
    // A deep link may already have redeemed this single-use login while the poll loop slept.
    if (transaction.completion) return transaction.completion;
    let result: DevicePollResponse;
    try {
      result = await this.publicCall<DevicePollResponse>(transaction.host, (client) => operations.pollDeviceAuthorization({ client, query: { device_code: transaction.code }, headers: { 'X-Whisperer-Device-Verifier': transaction.verifier } }), transaction.controller.signal);
    } catch (error) {
      // The server only knows the device code once the browser reaches /login, so earlier polls are still pending.
      if (error instanceof ApiError && error.status === 401 && !transaction.started) return null;
      throw error;
    }
    if (!this.active(transaction)) return null;
    if (result.status === 'pending') { transaction.started = true; return null; }
    if (result.status !== 'complete' || !result.accessToken || !result.refreshToken) throw new ApiError('Invalid sign-in response.');
    this.options.settings.setConnection(transaction.host, { accessToken: result.accessToken, refreshToken: result.refreshToken });
    transaction.completion = result;
    return result;
  }

  /** Invoke one authorized operation and refresh once on HTTP 401. Args: run is generated code; signal/timeout bound I/O; side overrides the selected backend for a sync. Returns: generated data. */
  private async authorized<T>(run: (client: Client) => Promise<unknown>, signal?: AbortSignal, timeout = 15000, side = this.options.settings.get().connectionMode): Promise<T> {
    if (side === 'device') return this.local<T>(run, signal, timeout);
    const routeEpoch = this.routeEpoch;
    const result = await this.remote<T>(run, signal, timeout);
    if (routeEpoch !== this.routeEpoch) throw new ApiError('The connection changed.', 409, 'CONFLICT');
    return result;
  }

  /** Calls the owned on-device server with its per-launch boot token. No refresh, no remote session changes. */
  private async local<T>(run: (client: Client) => Promise<unknown>, signal?: AbortSignal, timeout = 15000): Promise<T> {
    const connection = this.options.local?.() ?? null;
    if (!connection) throw new ApiError("The on-device server isn't running.", 503, 'LOCAL_SERVER_UNAVAILABLE');
    const routeEpoch = this.routeEpoch;
    try {
      const result = await this.execute<T>(connection.host, connection.token, run, signal, timeout);
      if (routeEpoch !== this.routeEpoch || this.options.local?.()?.generation !== connection.generation) throw new ApiError('The connection changed.', 409, 'CONFLICT');
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && /language model is off/i.test(error.message)) throw new ApiError('Language model is off.', 409, 'LLM_OFF');
      throw error;
    }
  }

  /** Invoke one remote operation and refresh once on HTTP 401. */
  private async remote<T>(run: (client: Client) => Promise<unknown>, signal?: AbortSignal, timeout = 15000): Promise<T> {
    const saved = this.options.settings.getSession();
    if (!saved) throw new ApiError('Sign in via browser first.', 401);
    const host = this.options.settings.requireApiHost();
    const epoch = this.epoch;
    try {
      const result = await this.execute<T>(host, saved.accessToken, run, signal, timeout);
      if (epoch !== this.epoch) throw new ApiError('The session changed.', 401);
      return result;
    }
    catch (error) { if (!(error instanceof ApiError) || error.status !== 401) throw error; }
    if (epoch !== this.epoch) throw new ApiError('The session changed.', 401);
    if (this.options.settings.getSession()?.accessToken === saved.accessToken) await this.refresh(saved, host, epoch);
    const rotated = this.options.settings.getSession();
    if (!rotated || epoch !== this.epoch) throw new ApiError('Sign in again.', 401);
    try {
      const result = await this.execute<T>(host, rotated.accessToken, run, signal, timeout);
      if (epoch !== this.epoch) throw new ApiError('The session changed.', 401);
      return result;
    }
    catch (error) { if (error instanceof ApiError && error.status === 401 && epoch === this.epoch) this.clearSession(); throw error; }
  }

  /** Rotate credentials with single-flight concurrency and epoch protection. Args: saved/host identify the original session; epoch prevents resurrection. Returns: nothing. */
  private async refresh(saved: ApplicationSession, host: string, epoch: number): Promise<void> {
    if (this.refreshFlight) return this.refreshFlight;
    const promise = (async (): Promise<void> => {
      try {
        const result = await this.publicCall<ApplicationSession>(host, (client) => operations.refreshApplicationSession({ client, body: { refresh_token: saved.refreshToken } }));
        if (epoch === this.epoch && this.options.settings.getSession()?.refreshToken === saved.refreshToken) this.options.settings.setSession(result);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && epoch === this.epoch) this.clearSession();
        throw error;
      }
    })();
    this.refreshFlight = promise;
    try { await promise; } finally { if (this.refreshFlight === promise) this.refreshFlight = null; }
  }

  /** Clear rejected credentials before notifying runtime. Args: none. Returns: nothing. */
  private clearSession(): void { this.epoch += 1; this.cancelLogin(); this.options.settings.setSession(null); this.options.onSignOut(); }

  /** Perform a credential-free generated operation. Args: host/run identify a public request; signal cancels it. Returns: generated data. */
  private publicCall<T>(host: string, run: (client: Client) => Promise<unknown>, signal?: AbortSignal): Promise<T> { return this.execute(host, null, run, signal); }

  /** Build an immutable per-request client and unwrap its response. Args: host/token/run supply transport; signal/timeout bound request. Returns: generated data. */
  private async execute<T>(host: string, token: string | null, run: (client: Client) => Promise<unknown>, signal?: AbortSignal, timeout = 15000): Promise<T> {
    const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    const transport = ((input: RequestInfo | URL, init?: RequestInit) => this.options.fetch(input instanceof URL ? input.href : input, init)) as typeof fetch;
    const client = createClient({ baseUrl: host, fetch: transport, headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: boundedSignal });
    const result = await run(client) as Result<T>;
    if (result.error) {
      if (!result.response && result.error instanceof Error) throw result.error;
      const problem = result.error as { detail?: unknown };
      throw new ApiError(typeof problem.detail === 'string' ? problem.detail.slice(0, 300) : 'The server request failed.', result.response?.status);
    }
    if (result.response && !result.response.ok) throw new ApiError('The server request failed.', result.response.status);
    return (result.data ?? null) as T;
  }
}
