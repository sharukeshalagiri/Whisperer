import { type Client, type ClientMeta, type Options as Options2, type RequestResult, type TDataShape } from './client';
import type { AnswerLocalChallengeData, AnswerLocalChallengeErrors, AnswerLocalChallengeResponses, AskMeetingQuestionData, AskMeetingQuestionErrors, AskMeetingQuestionResponses, BeginBrowserLoginData, BeginBrowserLoginErrors, BeginBrowserLoginResponses, CreateDictionaryEntryData, CreateDictionaryEntryErrors, CreateDictionaryEntryResponses, CreateMeetingData, CreateMeetingErrors, CreateMeetingResponses, CreateNoteData, CreateNoteErrors, CreateNoteResponses, CreateTextTransformationData, CreateTextTransformationErrors, CreateTextTransformationResponses, CreateTranscriptionData, CreateTranscriptionErrors, CreateTranscriptionResponses, DeleteAccountData, DeleteAccountErrors, DeleteAccountResponses, DeleteDictionaryEntryData, DeleteDictionaryEntryErrors, DeleteDictionaryEntryResponses, DeleteLocalDataData, DeleteLocalDataErrors, DeleteLocalDataResponses, DeleteMeetingData, DeleteMeetingErrors, DeleteMeetingResponses, DeleteNoteData, DeleteNoteErrors, DeleteNoteResponses, DeleteTranscriptData, DeleteTranscriptErrors, DeleteTranscriptResponses, DownloadSpeechModelData, DownloadSpeechModelErrors, DownloadSpeechModelResponses, ExportSyncSnapshotData, ExportSyncSnapshotErrors, ExportSyncSnapshotResponses, FinishMeetingData, FinishMeetingErrors, FinishMeetingResponses, GetAppMetricsData, GetAppMetricsErrors, GetAppMetricsResponses, GetCurrentUserData, GetCurrentUserErrors, GetCurrentUserResponses, GetDailyMetricsData, GetDailyMetricsErrors, GetDailyMetricsResponses, GetHealthData, GetHealthErrors, GetHealthResponses, GetInferenceStatusData, GetInferenceStatusErrors, GetInferenceStatusResponses, GetLegacyCurrentUserData, GetLegacyCurrentUserErrors, GetLegacyCurrentUserResponses, GetMeetingAudioData, GetMeetingAudioErrors, GetMeetingAudioResponses, GetMeetingData, GetMeetingErrors, GetMeetingResponses, GetMeetingSummaryData, GetMeetingSummaryErrors, GetMeetingSummaryResponses, GetMeetingTranscriptData, GetMeetingTranscriptErrors, GetMeetingTranscriptResponses, GetMetricsData, GetMetricsErrors, GetMetricsResponses, GetReadinessData, GetReadinessErrors, GetReadinessResponses, ListDictionaryData, ListDictionaryErrors, ListDictionaryResponses, ListMeetingsData, ListMeetingsErrors, ListMeetingsResponses, ListNotesData, ListNotesErrors, ListNotesResponses, ListSpeechModelsData, ListSpeechModelsErrors, ListSpeechModelsResponses, ListTranscriptsData, ListTranscriptsErrors, ListTranscriptsResponses, LogoutApplicationSessionData, LogoutApplicationSessionErrors, LogoutApplicationSessionResponses, MergeSyncSnapshotData, MergeSyncSnapshotErrors, MergeSyncSnapshotResponses, OidcCallbackData, OidcCallbackErrors, OidcCallbackResponses, PatchCurrentUserData, PatchCurrentUserErrors, PatchCurrentUserResponses, PatchDictionaryEntryData, PatchDictionaryEntryErrors, PatchDictionaryEntryResponses, PatchMeetingData, PatchMeetingErrors, PatchMeetingResponses, PatchMeetingSummaryData, PatchMeetingSummaryErrors, PatchMeetingSummaryResponses, PatchMeetingTranscriptData, PatchMeetingTranscriptErrors, PatchMeetingTranscriptResponses, PatchNoteData, PatchNoteErrors, PatchNoteResponses, PollDeviceAuthorizationData, PollDeviceAuthorizationErrors, PollDeviceAuthorizationResponses, PutDictationMetricData, PutDictationMetricErrors, PutDictationMetricResponses, RefreshApplicationSessionData, RefreshApplicationSessionErrors, RefreshApplicationSessionResponses, RegenerateMeetingSummaryData, RegenerateMeetingSummaryErrors, RegenerateMeetingSummaryResponses, ReplaceDictionaryEntryData, ReplaceDictionaryEntryErrors, ReplaceDictionaryEntryResponses, ReplaceNoteData, ReplaceNoteErrors, ReplaceNoteResponses, ResumeMeetingData, ResumeMeetingErrors, ResumeMeetingResponses, RetryMeetingSegmentData, RetryMeetingSegmentErrors, RetryMeetingSegmentResponses, StreamDeviceAuthorizationData, StreamDeviceAuthorizationErrors, StreamDeviceAuthorizationResponses, SummarizeNoteData, SummarizeNoteErrors, SummarizeNoteResponses, TestInferenceData, TestInferenceErrors, TestInferenceResponses, UploadMeetingSegmentData, UploadMeetingSegmentErrors, UploadMeetingSegmentResponses } from './types.gen';
export type Options<TData extends TDataShape = TDataShape, ThrowOnError extends boolean = boolean, TResponse = unknown> = Options2<TData, ThrowOnError, TResponse> & {
    /**
     * You can provide a client instance returned by `createClient()` instead of
     * individual options. This might be also useful if you want to implement a
     * custom client.
     */
    client?: Client;
    /**
     * You can pass arbitrary values through the `meta` object. This can be
     * used to access values that aren't defined as part of the SDK function.
     */
    meta?: keyof ClientMeta extends never ? Record<string, unknown> : ClientMeta;
};
/**
 * Callback
 *
 * Verify a browser OIDC callback and ask the person to approve the sign-in.
 *
 * Args:
 * code: Provider authorization code.
 * state: Server-issued transaction state.
 * session: Injected API database transaction.
 *
 * Returns:
 * No-token confirmation page; nothing completes until the person approves it.
 */
export declare const oidcCallback: <ThrowOnError extends boolean = false>(options: Options<OidcCallbackData, ThrowOnError>) => RequestResult<OidcCallbackResponses, OidcCallbackErrors, ThrowOnError>;
/**
 * Poll Device
 *
 * Redeem a protected device completion once.
 *
 * Args:
 * device_code: Desktop transaction UUID.
 * session: Injected API database transaction.
 * verifier: Raw desktop-only verifier in a request header.
 *
 * Returns:
 * Pending or atomically single-use complete state.
 */
export declare const pollDeviceAuthorization: <ThrowOnError extends boolean = false>(options: Options<PollDeviceAuthorizationData, ThrowOnError>) => RequestResult<PollDeviceAuthorizationResponses, PollDeviceAuthorizationErrors, ThrowOnError>;
/**
 * Stream Device
 *
 * Stream a protected device completion event using the desktop verifier.
 *
 * Args:
 * device_code: Desktop transaction UUID.
 * verifier: Raw desktop-only verifier in a request header.
 *
 * Returns:
 * Server-sent completion event with application tokens only after redemption.
 */
export declare const streamDeviceAuthorization: <ThrowOnError extends boolean = false>(options: Options<StreamDeviceAuthorizationData, ThrowOnError>) => RequestResult<StreamDeviceAuthorizationResponses, StreamDeviceAuthorizationErrors, ThrowOnError>;
/**
 * Login
 *
 * Start an OIDC browser login bound to a desktop device verifier.
 *
 * Args:
 * device_code: Desktop-generated transaction UUID.
 * verifier_challenge: SHA-256 challenge of a desktop secret.
 * session: Injected new API database transaction.
 *
 * Returns:
 * Redirect to generic OIDC authorization.
 */
export declare const beginBrowserLogin: <ThrowOnError extends boolean = false>(options: Options<BeginBrowserLoginData, ThrowOnError>) => RequestResult<BeginBrowserLoginResponses, BeginBrowserLoginErrors, ThrowOnError>;
/**
 * Logout
 *
 * Accept a locally authenticated logout request.
 *
 * Args:
 * session: Injected API database transaction.
 * user: Authenticated user used to validate the bearer token.
 * authorization: Validated Bearer header whose linked session is revoked.
 *
 * Returns:
 * Empty logout response.
 */
export declare const logoutApplicationSession: <ThrowOnError extends boolean = false>(options?: Options<LogoutApplicationSessionData, ThrowOnError>) => RequestResult<LogoutApplicationSessionResponses, LogoutApplicationSessionErrors, ThrowOnError>;
/**
 * Current User
 *
 * Return the currently authenticated user in the legacy wrapper.
 *
 * Args:
 * user: Authenticated linked local user.
 *
 * Returns:
 * Safe current user response.
 */
export declare const getLegacyCurrentUser: <ThrowOnError extends boolean = false>(options?: Options<GetLegacyCurrentUserData, ThrowOnError>) => RequestResult<GetLegacyCurrentUserResponses, GetLegacyCurrentUserErrors, ThrowOnError>;
/**
 * Refresh
 *
 * Rotate a local refresh token only after revalidation capability exists.
 *
 * Args:
 * request_body: Opaque local refresh token.
 * session: Injected API database transaction.
 *
 * Returns:
 * Rotated application session pair.
 */
export declare const refreshApplicationSession: <ThrowOnError extends boolean = false>(options: Options<RefreshApplicationSessionData, ThrowOnError>) => RequestResult<RefreshApplicationSessionResponses, RefreshApplicationSessionErrors, ThrowOnError>;
/**
 * Put Dictation Metric
 *
 * Record a retry-safe dictation metric event without retaining text.
 *
 * Args:
 * event_id: Client-stable idempotency identifier.
 * body: Validated numerical metric event.
 * session: Injected API database transaction.
 * user: Authenticated metric owner.
 *
 * Returns:
 * Empty 200 acknowledgement for new and identical retried events.
 */
export declare const putDictationMetric: <ThrowOnError extends boolean = false>(options: Options<PutDictationMetricData, ThrowOnError>) => RequestResult<PutDictationMetricResponses, PutDictationMetricErrors, ThrowOnError>;
/**
 * List Dictionary
 *
 * List caller-owned private dictionary entries.
 *
 * Args:
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Dictionary entries ordered by creation.
 */
export declare const listDictionary: <ThrowOnError extends boolean = false>(options?: Options<ListDictionaryData, ThrowOnError>) => RequestResult<ListDictionaryResponses, ListDictionaryErrors, ThrowOnError>;
/**
 * Create Dictionary
 *
 * Create a caller-owned dictionary replacement.
 *
 * Args:
 * body: Strict dictionary create representation.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Persisted dictionary entry.
 */
export declare const createDictionaryEntry: <ThrowOnError extends boolean = false>(options: Options<CreateDictionaryEntryData, ThrowOnError>) => RequestResult<CreateDictionaryEntryResponses, CreateDictionaryEntryErrors, ThrowOnError>;
/**
 * Delete Dictionary
 *
 * Delete one caller-owned dictionary entry.
 *
 * Args:
 * entry_id: UUID target dictionary entry.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Empty deletion response.
 */
export declare const deleteDictionaryEntry: <ThrowOnError extends boolean = false>(options: Options<DeleteDictionaryEntryData, ThrowOnError>) => RequestResult<DeleteDictionaryEntryResponses, DeleteDictionaryEntryErrors, ThrowOnError>;
/**
 * Update Dictionary
 *
 * Partially update one owned dictionary entry through legacy PUT.
 *
 * Args:
 * entry_id: UUID target dictionary entry.
 * body: Strict replacement representation.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Updated dictionary entry.
 */
export declare const patchDictionaryEntry: <ThrowOnError extends boolean = false>(options: Options<PatchDictionaryEntryData, ThrowOnError>) => RequestResult<PatchDictionaryEntryResponses, PatchDictionaryEntryErrors, ThrowOnError>;
/**
 * Update Dictionary
 *
 * Partially update one owned dictionary entry through legacy PUT.
 *
 * Args:
 * entry_id: UUID target dictionary entry.
 * body: Strict replacement representation.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Updated dictionary entry.
 *
 * @deprecated
 */
export declare const replaceDictionaryEntry: <ThrowOnError extends boolean = false>(options: Options<ReplaceDictionaryEntryData, ThrowOnError>) => RequestResult<ReplaceDictionaryEntryResponses, ReplaceDictionaryEntryErrors, ThrowOnError>;
/**
 * Health
 *
 * Return legacy-compatible process liveness.
 *
 * Args:
 * None.
 *
 * Returns:
 * Public liveness response; an on-device server adds its instance id.
 */
export declare const getHealth: <ThrowOnError extends boolean = false>(options?: Options<GetHealthData, ThrowOnError>) => RequestResult<GetHealthResponses, GetHealthErrors, ThrowOnError>;
/**
 * List Speech Models
 *
 * List supported on-device speech models and whether each is installed.
 *
 * Args:
 * user: Authenticated device owner.
 *
 * Returns:
 * Pinned catalog entries.
 */
export declare const listSpeechModels: <ThrowOnError extends boolean = false>(options?: Options<ListSpeechModelsData, ThrowOnError>) => RequestResult<ListSpeechModelsResponses, ListSpeechModelsErrors, ThrowOnError>;
/**
 * Download Speech Model
 *
 * Start one explicit catalog model download; progress goes to stdout events.
 *
 * Args:
 * body: Catalog model identifier.
 * user: Authenticated device owner.
 *
 * Returns:
 * Acknowledgement of the started download.
 */
export declare const downloadSpeechModel: <ThrowOnError extends boolean = false>(options: Options<DownloadSpeechModelData, ThrowOnError>) => RequestResult<DownloadSpeechModelResponses, DownloadSpeechModelErrors, ThrowOnError>;
/**
 * Inference Status
 *
 * Report speech and language-model readiness separately.
 *
 * Args:
 * user: Authenticated device owner.
 *
 * Returns:
 * Engine states without credentials.
 */
export declare const getInferenceStatus: <ThrowOnError extends boolean = false>(options?: Options<GetInferenceStatusData, ThrowOnError>) => RequestResult<GetInferenceStatusResponses, GetInferenceStatusErrors, ThrowOnError>;
/**
 * Test Inference
 *
 * Probe one engine with a tiny synthetic request.
 *
 * Args:
 * body: Engine to probe.
 * user: Authenticated device owner.
 *
 * Returns:
 * Probe outcome and latency.
 */
export declare const testInference: <ThrowOnError extends boolean = false>(options: Options<TestInferenceData, ThrowOnError>) => RequestResult<TestInferenceResponses, TestInferenceErrors, ThrowOnError>;
/**
 * Local Challenge
 *
 * Prove this process received the desktop's boot token.
 *
 * Args:
 * body: Desktop-chosen nonce.
 *
 * Returns:
 * HMAC of the nonce keyed by the boot token text.
 */
export declare const answerLocalChallenge: <ThrowOnError extends boolean = false>(options: Options<AnswerLocalChallengeData, ThrowOnError>) => RequestResult<AnswerLocalChallengeResponses, AnswerLocalChallengeErrors, ThrowOnError>;
/**
 * Delete Local Data
 *
 * Permanently erase everything the device user stored on this server.
 *
 * Transcripts, notes, dictionary entries, meetings, their audio and metrics go. The
 * runtime, downloaded models and configuration stay, so the server keeps working; the
 * next request starts a fresh, empty device user.
 *
 * Args:
 * session: Request transaction that also resolved the device user.
 * user: Authenticated device owner.
 *
 * Returns:
 * Empty acknowledgement once the data is gone.
 */
export declare const deleteLocalData: <ThrowOnError extends boolean = false>(options?: Options<DeleteLocalDataData, ThrowOnError>) => RequestResult<DeleteLocalDataResponses, DeleteLocalDataErrors, ThrowOnError>;
/**
 * Delete Account
 *
 * Delete all local account content without touching upstream identity.
 *
 * Args:
 * session: Injected API database transaction.
 * user: Authenticated local account.
 *
 * Returns:
 * Empty local deletion acknowledgement.
 */
export declare const deleteAccount: <ThrowOnError extends boolean = false>(options?: Options<DeleteAccountData, ThrowOnError>) => RequestResult<DeleteAccountResponses, DeleteAccountErrors, ThrowOnError>;
/**
 * Current User
 *
 * Return the currently authenticated user in the legacy wrapper.
 *
 * Args:
 * user: Authenticated linked local user.
 *
 * Returns:
 * Safe current user response.
 */
export declare const getCurrentUser: <ThrowOnError extends boolean = false>(options?: Options<GetCurrentUserData, ThrowOnError>) => RequestResult<GetCurrentUserResponses, GetCurrentUserErrors, ThrowOnError>;
/**
 * Patch Current User
 *
 * Update optional local profile display names only.
 *
 * Args:
 * body: Strict local profile fields.
 * session: Injected API database transaction.
 * user: Authenticated local account.
 *
 * Returns:
 * Updated public account representation.
 */
export declare const patchCurrentUser: <ThrowOnError extends boolean = false>(options: Options<PatchCurrentUserData, ThrowOnError>) => RequestResult<PatchCurrentUserResponses, PatchCurrentUserErrors, ThrowOnError>;
/**
 * List Meetings
 *
 * List owned meetings using a stable opaque cursor.
 *
 * Args:
 * cursor: Optional opaque continuation cursor.
 * limit: Bounded maximum number of meetings.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * One meeting page.
 */
export declare const listMeetings: <ThrowOnError extends boolean = false>(options?: Options<ListMeetingsData, ThrowOnError>) => RequestResult<ListMeetingsResponses, ListMeetingsErrors, ThrowOnError>;
/**
 * Create Meeting
 *
 * Create an owned meeting.
 *
 * Args:
 * body: Meeting metadata and optional stable identifier.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Created or idempotently existing meeting.
 */
export declare const createMeeting: <ThrowOnError extends boolean = false>(options: Options<CreateMeetingData, ThrowOnError>) => RequestResult<CreateMeetingResponses, CreateMeetingErrors, ThrowOnError>;
/**
 * Delete Meeting
 *
 * Delete an owned meeting and all private audio.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Empty deletion acknowledgement.
 */
export declare const deleteMeeting: <ThrowOnError extends boolean = false>(options: Options<DeleteMeetingData, ThrowOnError>) => RequestResult<DeleteMeetingResponses, DeleteMeetingErrors, ThrowOnError>;
/**
 * Get Meeting
 *
 * Return one owned meeting.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Flattened meeting state.
 */
export declare const getMeeting: <ThrowOnError extends boolean = false>(options: Options<GetMeetingData, ThrowOnError>) => RequestResult<GetMeetingResponses, GetMeetingErrors, ThrowOnError>;
/**
 * Patch Meeting
 *
 * Conditionally update owned meeting metadata.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * body: Partial meeting metadata.
 * if_match: Required metadata revision precondition.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Updated meeting representation.
 */
export declare const patchMeeting: <ThrowOnError extends boolean = false>(options: Options<PatchMeetingData, ThrowOnError>) => RequestResult<PatchMeetingResponses, PatchMeetingErrors, ThrowOnError>;
/**
 * Get Meeting Audio
 *
 * Download one authenticated private meeting audio segment.
 *
 * Args:
 * meeting_id: Parent meeting UUID.
 * segment_id: Optional segment UUID when there is only one recording.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Range-capable private audio file response.
 */
export declare const getMeetingAudio: <ThrowOnError extends boolean = false>(options: Options<GetMeetingAudioData, ThrowOnError>) => RequestResult<GetMeetingAudioResponses, GetMeetingAudioErrors, ThrowOnError>;
/**
 * Finish Meeting
 *
 * Finish capture and queue eligible durable summary work.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Finished meeting state.
 */
export declare const finishMeeting: <ThrowOnError extends boolean = false>(options: Options<FinishMeetingData, ThrowOnError>) => RequestResult<FinishMeetingResponses, FinishMeetingErrors, ThrowOnError>;
/**
 * Ask Meeting Question
 *
 * Answer one question from an owned meeting's complete saved snapshot.
 *
 * The transaction ends before inference so a slow configured provider cannot
 * hold an SQLite write lock. The request carries no transcript or summary;
 * only the owned saved record can supply the model context.
 *
 * Args:
 * meeting_id: Target owned meeting UUID.
 * body: Question and optional revision expectations.
 * user_id: Detached authenticated meeting owner ID.
 *
 * Returns:
 * Ephemeral answer and the revisions used to ground it.
 *
 * Raises:
 * HTTPException: If the meeting cannot be used or the provider fails.
 */
export declare const askMeetingQuestion: <ThrowOnError extends boolean = false>(options: Options<AskMeetingQuestionData, ThrowOnError>) => RequestResult<AskMeetingQuestionResponses, AskMeetingQuestionErrors, ThrowOnError>;
/**
 * Resume Meeting
 *
 * Reopen an owned meeting for more audio.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Reopened meeting state.
 */
export declare const resumeMeeting: <ThrowOnError extends boolean = false>(options: Options<ResumeMeetingData, ThrowOnError>) => RequestResult<ResumeMeetingResponses, ResumeMeetingErrors, ThrowOnError>;
/**
 * Upload Meeting Segment
 *
 * Stream a bounded audio segment into private meeting storage.
 *
 * Args:
 * meeting_id: Target active meeting UUID.
 * segment_id: Stable segment retry identifier.
 * file: Multipart audio stream.
 * duration_ms: Device-measured segment duration.
 * language: Optional spoken-language hint.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Accepted or identical prior segment state.
 */
export declare const uploadMeetingSegment: <ThrowOnError extends boolean = false>(options: Options<UploadMeetingSegmentData, ThrowOnError>) => RequestResult<UploadMeetingSegmentResponses, UploadMeetingSegmentErrors, ThrowOnError>;
/**
 * Retry Meeting Segment
 *
 * Requeue a failed owned meeting segment.
 *
 * Args:
 * meeting_id: Parent meeting UUID.
 * segment_id: Failed segment UUID.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Requeued segment state.
 */
export declare const retryMeetingSegment: <ThrowOnError extends boolean = false>(options: Options<RetryMeetingSegmentData, ThrowOnError>) => RequestResult<RetryMeetingSegmentResponses, RetryMeetingSegmentErrors, ThrowOnError>;
/**
 * Get Meeting Summary
 *
 * Return independently versioned owned summary state.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Summary state.
 */
export declare const getMeetingSummary: <ThrowOnError extends boolean = false>(options: Options<GetMeetingSummaryData, ThrowOnError>) => RequestResult<GetMeetingSummaryResponses, GetMeetingSummaryErrors, ThrowOnError>;
/**
 * Patch Meeting Summary
 *
 * Conditionally replace an owned meeting summary.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * body: Full summary replacement.
 * if_match: Required summary revision precondition.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Updated summary state.
 */
export declare const patchMeetingSummary: <ThrowOnError extends boolean = false>(options: Options<PatchMeetingSummaryData, ThrowOnError>) => RequestResult<PatchMeetingSummaryResponses, PatchMeetingSummaryErrors, ThrowOnError>;
/**
 * Regenerate Meeting Summary
 *
 * Queue a new summary for a completed meeting.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Meeting state with queued summary work.
 */
export declare const regenerateMeetingSummary: <ThrowOnError extends boolean = false>(options: Options<RegenerateMeetingSummaryData, ThrowOnError>) => RequestResult<RegenerateMeetingSummaryResponses, RegenerateMeetingSummaryErrors, ThrowOnError>;
/**
 * Get Meeting Transcript
 *
 * Return independently versioned owned transcript state.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Transcript state.
 */
export declare const getMeetingTranscript: <ThrowOnError extends boolean = false>(options: Options<GetMeetingTranscriptData, ThrowOnError>) => RequestResult<GetMeetingTranscriptResponses, GetMeetingTranscriptErrors, ThrowOnError>;
/**
 * Patch Meeting Transcript
 *
 * Conditionally replace an owned meeting transcript.
 *
 * Args:
 * meeting_id: Target meeting UUID.
 * body: Full transcript replacement.
 * if_match: Required transcript revision precondition.
 * session: Injected API database transaction.
 * user: Authenticated meeting owner.
 *
 * Returns:
 * Updated transcript state.
 */
export declare const patchMeetingTranscript: <ThrowOnError extends boolean = false>(options: Options<PatchMeetingTranscriptData, ThrowOnError>) => RequestResult<PatchMeetingTranscriptResponses, PatchMeetingTranscriptErrors, ThrowOnError>;
/**
 * Get Metrics
 *
 * Return lifetime and local-calendar metrics from maintained aggregates.
 *
 * Args:
 * timezone: IANA zone defining local day and Sunday-based week boundaries.
 * session: Injected API database transaction.
 * user: Authenticated metric owner.
 *
 * Returns:
 * Account metric dashboard representation.
 */
export declare const getMetrics: <ThrowOnError extends boolean = false>(options?: Options<GetMetricsData, ThrowOnError>) => RequestResult<GetMetricsResponses, GetMetricsErrors, ThrowOnError>;
/**
 * Get App Metrics
 *
 * Return words and dictation count by focused application.
 *
 * Args:
 * session: Injected API database transaction.
 * user: Authenticated metric owner.
 *
 * Returns:
 * Application metric aggregates.
 */
export declare const getAppMetrics: <ThrowOnError extends boolean = false>(options?: Options<GetAppMetricsData, ThrowOnError>) => RequestResult<GetAppMetricsResponses, GetAppMetricsErrors, ThrowOnError>;
/**
 * Get Daily Metrics
 *
 * List a bounded inclusive calendar-date range of metric rollups.
 *
 * Args:
 * from_date: Optional first date, defaulting to 29 days ago.
 * until_date: Optional last date, defaulting to today.
 * timezone: IANA zone that decides which date is today.
 * session: Injected API database transaction.
 * user: Authenticated metric owner.
 *
 * Returns:
 * Daily account metric aggregates.
 */
export declare const getDailyMetrics: <ThrowOnError extends boolean = false>(options?: Options<GetDailyMetricsData, ThrowOnError>) => RequestResult<GetDailyMetricsResponses, GetDailyMetricsErrors, ThrowOnError>;
/**
 * List Notes
 *
 * List caller-owned notes.
 *
 * Args:
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Private notes ordered by update time.
 */
export declare const listNotes: <ThrowOnError extends boolean = false>(options?: Options<ListNotesData, ThrowOnError>) => RequestResult<ListNotesResponses, ListNotesErrors, ThrowOnError>;
/**
 * Create Note
 *
 * Create an owned note.
 *
 * Args:
 * body: Strict note creation representation.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Persisted note representation.
 */
export declare const createNote: <ThrowOnError extends boolean = false>(options: Options<CreateNoteData, ThrowOnError>) => RequestResult<CreateNoteResponses, CreateNoteErrors, ThrowOnError>;
/**
 * Delete Note
 *
 * Delete one caller-owned note.
 *
 * Args:
 * note_id: UUID target note.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Empty deletion response.
 */
export declare const deleteNote: <ThrowOnError extends boolean = false>(options: Options<DeleteNoteData, ThrowOnError>) => RequestResult<DeleteNoteResponses, DeleteNoteErrors, ThrowOnError>;
/**
 * Update Note
 *
 * Partially update an owned note through either PATCH or PUT.
 *
 * Args:
 * note_id: UUID target note.
 * body: Strict update representation.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Updated note representation.
 */
export declare const patchNote: <ThrowOnError extends boolean = false>(options: Options<PatchNoteData, ThrowOnError>) => RequestResult<PatchNoteResponses, PatchNoteErrors, ThrowOnError>;
/**
 * Update Note
 *
 * Partially update an owned note through either PATCH or PUT.
 *
 * Args:
 * note_id: UUID target note.
 * body: Strict update representation.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Updated note representation.
 */
export declare const replaceNote: <ThrowOnError extends boolean = false>(options: Options<ReplaceNoteData, ThrowOnError>) => RequestResult<ReplaceNoteResponses, ReplaceNoteErrors, ThrowOnError>;
/**
 * Summarize Note
 *
 * Generate and persist a summary for an owned unchanged note.
 *
 * Args:
 * note_id: UUID target note.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Complete note including generated summary.
 */
export declare const summarizeNote: <ThrowOnError extends boolean = false>(options: Options<SummarizeNoteData, ThrowOnError>) => RequestResult<SummarizeNoteResponses, SummarizeNoteErrors, ThrowOnError>;
/**
 * Ready
 *
 * Return sanitized external dependency readiness.
 *
 * Args:
 * None.
 *
 * Returns:
 * 200 when ready or 503 without secrets or upstream response bodies.
 */
export declare const getReadiness: <ThrowOnError extends boolean = false>(options?: Options<GetReadinessData, ThrowOnError>) => RequestResult<GetReadinessResponses, GetReadinessErrors, ThrowOnError>;
/**
 * Export Sync Snapshot
 *
 * Export the caller's notes, dictionary, finished meetings, metrics and deletions.
 *
 * Args:
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * The caller's complete snapshot. Audio is never included.
 */
export declare const exportSyncSnapshot: <ThrowOnError extends boolean = false>(options?: Options<ExportSyncSnapshotData, ThrowOnError>) => RequestResult<ExportSyncSnapshotResponses, ExportSyncSnapshotErrors, ThrowOnError>;
/**
 * Merge Sync Snapshot
 *
 * Merge another server's snapshot of the same person into the caller's data.
 *
 * The newer copy of each record wins and remembered deletions are applied.
 *
 * Args:
 * body: Snapshot exported by the other server.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Number of records changed here.
 */
export declare const mergeSyncSnapshot: <ThrowOnError extends boolean = false>(options: Options<MergeSyncSnapshotData, ThrowOnError>) => RequestResult<MergeSyncSnapshotResponses, MergeSyncSnapshotErrors, ThrowOnError>;
/**
 * Create Text Transformation
 *
 * Generate a review-only transformation outside a long database transaction.
 *
 * Args:
 * body: Validated inline or owned-resource transformation request.
 * user: Authenticated transformation owner.
 *
 * Returns:
 * Proposed output without mutating source text, dictionary, or metrics.
 */
export declare const createTextTransformation: <ThrowOnError extends boolean = false>(options: Options<CreateTextTransformationData, ThrowOnError>) => RequestResult<CreateTextTransformationResponses, CreateTextTransformationErrors, ThrowOnError>;
/**
 * Create Transcription
 *
 * Transcribe a bounded audio upload for the authenticated owner.
 *
 * Args:
 * file: Required audio file upload.
 * language: Optional language hint.
 * polish: Whether to polish returned transcription text.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Persisted transcript representation.
 *
 * Raises:
 * HTTPException: If upload constraints or inference fail.
 */
export declare const createTranscription: <ThrowOnError extends boolean = false>(options: Options<CreateTranscriptionData, ThrowOnError>) => RequestResult<CreateTranscriptionResponses, CreateTranscriptionErrors, ThrowOnError>;
/**
 * List Transcripts
 *
 * List caller-owned transcripts newest first.
 *
 * Args:
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Owned transcript representations.
 *
 * @deprecated
 */
export declare const listTranscripts: <ThrowOnError extends boolean = false>(options?: Options<ListTranscriptsData, ThrowOnError>) => RequestResult<ListTranscriptsResponses, ListTranscriptsErrors, ThrowOnError>;
/**
 * Delete Transcript
 *
 * Delete one caller-owned transcript.
 *
 * Args:
 * transcript_id: UUID target transcript.
 * session: Injected API database transaction.
 * user: Authenticated owner.
 *
 * Returns:
 * Empty deletion response.
 *
 * @deprecated
 */
export declare const deleteTranscript: <ThrowOnError extends boolean = false>(options: Options<DeleteTranscriptData, ThrowOnError>) => RequestResult<DeleteTranscriptResponses, DeleteTranscriptErrors, ThrowOnError>;
