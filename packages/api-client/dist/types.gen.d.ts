export type ClientOptions = {
    baseUrl: `${string}://${string}` | (string & {});
};
/**
 * AppMetricItem
 *
 * Represent one aggregate application label.
 *
 * Args:
 * appName: Focused application label.
 * words: Total output words.
 * durationMs: Total dictation duration.
 * dictationCount: Number of events.
 */
export type AppMetricItem = {
    /**
     * Appname
     */
    appName: string;
    /**
     * Dictationcount
     */
    dictationCount: number;
    /**
     * Durationms
     */
    durationMs: number;
    /**
     * Words
     */
    words: number;
};
/**
 * AppMetricsResponse
 *
 * Wrap application-level aggregates.
 *
 * Args:
 * items: Applications ordered by output words.
 */
export type AppMetricsResponse = {
    /**
     * Items
     */
    items: Array<AppMetricItem>;
};
/**
 * Body_createTranscription
 */
export type BodyCreateTranscription = {
    /**
     * File
     */
    file: Blob | File;
};
/**
 * Body_uploadMeetingSegment
 */
export type BodyUploadMeetingSegment = {
    /**
     * File
     */
    file: Blob | File;
};
/**
 * CurrentUserResponse
 *
 * Wrap the current user under the legacy response key.
 *
 * Args:
 * user: Authenticated public local user.
 */
export type CurrentUserResponse = {
    user: UserResponse;
};
/**
 * DailyMetricItem
 *
 * Represent one local calendar-day aggregate.
 *
 * Args:
 * date: Local calendar date.
 * words: Total output words.
 * durationMs: Total duration.
 * dictationCount: Number of events.
 * dictionaryReplacements: Dictionary replacements applied that day.
 * correctedWords: Raw transcript words changed before output that day.
 */
export type DailyMetricItem = {
    /**
     * Correctedwords
     */
    correctedWords: number;
    /**
     * Date
     */
    date: string;
    /**
     * Dictationcount
     */
    dictationCount: number;
    /**
     * Dictionaryreplacements
     */
    dictionaryReplacements: number;
    /**
     * Durationms
     */
    durationMs: number;
    /**
     * Words
     */
    words: number;
};
/**
 * DailyMetricsResponse
 *
 * Wrap bounded local-day aggregates.
 *
 * Args:
 * days: Ordered local daily metric aggregates.
 */
export type DailyMetricsResponse = {
    /**
     * Days
     */
    days: Array<DailyMetricItem>;
};
/**
 * DevicePollResponse
 *
 * Represent protected device authorization state.
 *
 * Args:
 * status: Pending or atomically redeemed completion state.
 * accessToken: App access token only after completion.
 * refreshToken: App refresh credential only after completion.
 * provider: Generic upstream authentication type.
 * firstName: Public first name when available.
 * lastName: Public last name when available.
 * onboardingCompleted: Application onboarding state.
 */
export type DevicePollResponse = {
    /**
     * Accesstoken
     */
    accessToken?: string | null;
    /**
     * Firstname
     */
    firstName?: string | null;
    /**
     * Lastname
     */
    lastName?: string | null;
    /**
     * Onboardingcompleted
     */
    onboardingCompleted?: boolean | null;
    /**
     * Provider
     */
    provider?: string | null;
    /**
     * Refreshtoken
     */
    refreshToken?: string | null;
    /**
     * Status
     */
    status: 'pending' | 'complete';
};
/**
 * DictationMetricRequest
 *
 * Accept one retry-safe dictation event without transcript content.
 *
 * Args:
 * createdAt: Event timestamp in UTC.
 * durationMs: Full elapsed dictation duration.
 * speechDurationMs: Optional detected speech duration.
 * outputWords: Number of output words.
 * correctedWords: Number of raw transcript words changed before output.
 * dictionaryReplacements: Number of applied dictionary replacements.
 * appName: Optional focused application label.
 * deviceId: Optional opaque local device label.
 * timezone: Event-local IANA time zone.
 */
export type DictationMetricRequest = {
    /**
     * Appname
     */
    appName?: string | null;
    /**
     * Correctedwords
     */
    correctedWords?: number;
    /**
     * Createdat
     */
    createdAt: string;
    /**
     * Deviceid
     */
    deviceId?: string | null;
    /**
     * Dictionaryreplacements
     */
    dictionaryReplacements: number;
    /**
     * Durationms
     */
    durationMs: number;
    /**
     * Outputwords
     */
    outputWords: number;
    /**
     * Speechdurationms
     */
    speechDurationMs?: number | null;
    /**
     * Timezone
     */
    timezone?: string;
};
/**
 * DictionaryCreateRequest
 *
 * Create a private substitution entry.
 *
 * Args:
 * phrase: Required phrase to recognize.
 * replacement: Optional desired text.
 */
export type DictionaryCreateRequest = {
    /**
     * Phrase
     */
    phrase: string;
    /**
     * Replacement
     */
    replacement: string;
};
/**
 * DictionaryListResponse
 *
 * Wrap private dictionary entries.
 *
 * Args:
 * items: Entries ordered by creation time.
 */
export type DictionaryListResponse = {
    /**
     * Items
     */
    items: Array<DictionaryResponse>;
};
/**
 * DictionaryResponse
 *
 * Represent a private dictionary entry.
 *
 * Args:
 * id: Stable entry ID.
 * phrase: Recognized phrase.
 * replacement: Output replacement.
 */
export type DictionaryResponse = {
    /**
     * Id
     */
    id: string;
    /**
     * Phrase
     */
    phrase: string;
    /**
     * Replacement
     */
    replacement: string;
};
/**
 * DictionaryUpdateRequest
 *
 * Partially update a private substitution entry.
 *
 * Args:
 * phrase: Optional phrase replacement.
 * replacement: Optional output replacement.
 */
export type DictionaryUpdateRequest = {
    /**
     * Phrase
     */
    phrase?: string | null;
    /**
     * Replacement
     */
    replacement?: string | null;
};
/**
 * HealthResponse
 *
 * Represent liveness compatible with the former service.
 *
 * Args:
 * status: Fixed healthy indicator.
 * service: Fixed service identifier.
 * version: Fixed API generation number.
 */
export type HealthResponse = {
    /**
     * Instanceid
     *
     * Desktop-assigned instance, present only on an on-device server.
     */
    instanceId?: string | null;
    /**
     * Service
     */
    service?: 'whisperer';
    /**
     * Status
     */
    status?: 'ok';
    /**
     * Version
     */
    version?: 1;
};
/**
 * InferenceEngineStatus
 *
 * Describe one inference engine without credentials.
 *
 * Args:
 * provider: ``http``, ``onnx``, ``off`` or null when not set up.
 * model: Model name or catalog identifier.
 * status: Lifecycle state.
 * message: Safe user-facing explanation.
 */
export type InferenceEngineStatus = {
    /**
     * Message
     */
    message: string;
    /**
     * Model
     */
    model: string | null;
    /**
     * Provider
     */
    provider: string | null;
    /**
     * Status
     */
    status: 'ready' | 'missing' | 'downloading' | 'loading' | 'failed' | 'unconfigured' | 'off';
};
/**
 * InferenceStatusResponse
 *
 * Report speech and language-model readiness separately.
 *
 * Args:
 * speech: Speech engine state.
 * llm: Language-model engine state.
 */
export type InferenceStatusResponse = {
    llm: InferenceEngineStatus;
    speech: InferenceEngineStatus;
};
/**
 * InferenceTestRequest
 *
 * Choose which engine to probe.
 *
 * Args:
 * target: ``speech`` or ``llm``.
 */
export type InferenceTestRequest = {
    /**
     * Target
     */
    target: 'speech' | 'llm';
};
/**
 * InferenceTestResponse
 *
 * Report one engine probe.
 *
 * Args:
 * ok: Whether the engine answered correctly.
 * latencyMs: Elapsed milliseconds.
 * message: Safe explanation.
 */
export type InferenceTestResponse = {
    /**
     * Latencyms
     */
    latencyMs: number;
    /**
     * Message
     */
    message: string;
    /**
     * Ok
     */
    ok: boolean;
};
/**
 * LocalChallengeRequest
 *
 * Carry a desktop nonce for proof of boot-token possession.
 *
 * Args:
 * nonce: 16 to 256 base64url characters chosen by the desktop.
 */
export type LocalChallengeRequest = {
    /**
     * Nonce
     */
    nonce: string;
};
/**
 * LocalChallengeResponse
 *
 * Prove the server holds the boot token without revealing it.
 *
 * Args:
 * hmac: Unpadded base64url HMAC-SHA256 of the nonce, keyed by the token text.
 */
export type LocalChallengeResponse = {
    /**
     * Hmac
     */
    hmac: string;
};
/**
 * MeetingCreateRequest
 *
 * Create one meeting, optionally using a client-generated stable identifier.
 *
 * Args:
 * id: Optional idempotent client-generated meeting UUID.
 * title: Initial display title.
 * startedAt: Device capture start timestamp.
 */
export type MeetingCreateRequest = {
    /**
     * Id
     */
    id?: string | null;
    /**
     * Startedat
     */
    startedAt: string;
    /**
     * Title
     */
    title?: string;
};
/**
 * MeetingListResponse
 *
 * Represent a cursor-paged meeting listing.
 *
 * Args:
 * items: Meetings in descending capture-start order.
 * nextCursor: Cursor for the next page or absent at the end.
 */
export type MeetingListResponse = {
    /**
     * Items
     */
    items: Array<MeetingResponse>;
    /**
     * Nextcursor
     */
    nextCursor: string | null;
};
/**
 * MeetingMetadataPatchRequest
 *
 * Change editable meeting metadata under the meeting revision precondition.
 *
 * Args:
 * title: Optional replacement display title.
 * startedAt: Optional replacement capture start timestamp.
 * endedAt: Optional replacement capture end timestamp.
 */
export type MeetingMetadataPatchRequest = {
    /**
     * Endedat
     */
    endedAt?: string | null;
    /**
     * Startedat
     */
    startedAt?: string | null;
    /**
     * Title
     */
    title?: string | null;
};
/**
 * MeetingQuestionRequest
 *
 * Ask one question against an owned meeting's saved text.
 *
 * Args:
 * question: The user's single question; it never supplies meeting context.
 * transcriptRevision: Optional saved transcript revision the caller expects.
 * summaryRevision: Optional saved summary revision the caller expects.
 */
export type MeetingQuestionRequest = {
    /**
     * Question
     */
    question: string;
    /**
     * Summaryrevision
     */
    summaryRevision?: number | null;
    /**
     * Transcriptrevision
     */
    transcriptRevision?: number | null;
};
/**
 * MeetingQuestionResponse
 *
 * Return an ephemeral answer and the saved snapshot that grounded it.
 *
 * Args:
 * answer: Generated answer based only on the saved meeting snapshot.
 * transcriptRevision: Saved transcript revision sent to inference.
 * summaryRevision: Saved summary revision sent to inference.
 * summaryStale: Whether the saved summary predates the saved transcript.
 * usedSummary: Whether a saved summary was present in the complete context.
 */
export type MeetingQuestionResponse = {
    /**
     * Answer
     */
    answer: string;
    /**
     * Summaryrevision
     */
    summaryRevision: number;
    /**
     * Summarystale
     */
    summaryStale: boolean;
    /**
     * Transcriptrevision
     */
    transcriptRevision: number;
    /**
     * Usedsummary
     */
    usedSummary: boolean;
};
/**
 * MeetingResponse
 *
 * Represent the flattened meeting state returned by every meeting operation.
 *
 * Args:
 * id: Stable meeting UUID.
 * title: Display title.
 * startedAt: Capture start timestamp.
 * endedAt: Optional capture finish timestamp.
 * durationMs: Sum of accepted audio segment durations.
 * revision: Metadata/state revision used for metadata concurrency.
 * transcript: Current editable transcript.
 * transcriptRevision: Transcript concurrency revision.
 * summary: Current editable or generated summary.
 * summaryRevision: Summary concurrency revision.
 * summarySourceRevision: Transcript revision used to generate the summary.
 * summaryStale: Whether the summary predates the current transcript.
 * transcriptStatus: Pending, running, complete, failed, or idle state.
 * summaryStatus: Pending, running, complete, failed, or idle state.
 * error: Safe latest processing error, if any.
 * hasAudio: Whether private stored audio exists.
 */
export type MeetingResponse = {
    /**
     * Durationms
     */
    durationMs: number;
    /**
     * Endedat
     */
    endedAt: string | null;
    /**
     * Error
     */
    error: string | null;
    /**
     * Hasaudio
     */
    hasAudio: boolean;
    /**
     * Id
     */
    id: string;
    /**
     * Revision
     */
    revision: number;
    /**
     * Startedat
     */
    startedAt: string;
    /**
     * Summary
     */
    summary: string | null;
    /**
     * Summaryrevision
     */
    summaryRevision: number;
    /**
     * Summarysourcerevision
     */
    summarySourceRevision: number | null;
    /**
     * Summarystale
     */
    summaryStale: boolean;
    /**
     * Summarystatus
     */
    summaryStatus: 'pending' | 'running' | 'complete' | 'failed' | 'idle';
    /**
     * Title
     */
    title: string;
    /**
     * Transcript
     */
    transcript: string;
    /**
     * Transcriptrevision
     */
    transcriptRevision: number;
    /**
     * Transcriptstatus
     */
    transcriptStatus: 'pending' | 'running' | 'complete' | 'failed' | 'idle';
};
/**
 * MeetingSegmentResponse
 *
 * Represent accepted segment processing state for upload and retry operations.
 *
 * Args:
 * id: Stable client-generated segment UUID.
 * status: Segment processing state.
 * durationMs: Accepted audio duration.
 * error: Safe segment error, if any.
 */
export type MeetingSegmentResponse = {
    /**
     * Durationms
     */
    durationMs: number;
    /**
     * Error
     */
    error: string | null;
    /**
     * Id
     */
    id: string;
    /**
     * Status
     */
    status: 'pending' | 'running' | 'complete' | 'failed' | 'idle';
};
/**
 * MeetingSummaryResponse
 *
 * Represent independently versioned summary state.
 *
 * Args:
 * text: Current summary, if one exists.
 * revision: Summary concurrency revision.
 * sourceRevision: Transcript revision on which this summary is based.
 * stale: Whether transcript changes superseded the summary.
 * status: Summary processing state.
 * error: Safe latest summary error, if any.
 */
export type MeetingSummaryResponse = {
    /**
     * Error
     */
    error: string | null;
    /**
     * Revision
     */
    revision: number;
    /**
     * Sourcerevision
     */
    sourceRevision: number | null;
    /**
     * Stale
     */
    stale: boolean;
    /**
     * Status
     */
    status: 'pending' | 'running' | 'complete' | 'failed' | 'idle';
    /**
     * Text
     */
    text: string | null;
};
/**
 * MeetingTextPatchRequest
 *
 * Replace a meeting transcript or summary under its dedicated revision.
 *
 * Args:
 * text: Full replacement user-authored text.
 */
export type MeetingTextPatchRequest = {
    /**
     * Text
     */
    text: string;
};
/**
 * MeetingTranscriptResponse
 *
 * Represent independently versioned transcript state.
 *
 * Args:
 * text: Current transcript text.
 * revision: Transcript concurrency revision.
 * status: Transcript processing state.
 * error: Safe latest transcription error, if any.
 */
export type MeetingTranscriptResponse = {
    /**
     * Error
     */
    error: string | null;
    /**
     * Revision
     */
    revision: number;
    /**
     * Status
     */
    status: 'pending' | 'running' | 'complete' | 'failed' | 'idle';
    /**
     * Text
     */
    text: string;
};
/**
 * MetricsResponse
 *
 * Represent account-wide dictation totals and current local activity.
 *
 * Args:
 * totalWords: Lifetime output words.
 * totalDurationMs: Lifetime dictation duration.
 * dictationCount: Lifetime event count.
 * dictionaryReplacements: Lifetime replacement count.
 * correctedWords: Lifetime raw transcript words changed before output.
 * wordsPerMinute: Weighted rate from the recent eligible events.
 * wordsToday: Output words on the local current day.
 * wordsThisWeek: Output words since the local Sunday.
 * wordsThisMonth: Output words since the first of the local month.
 * wordsLastMonth: Output words across the previous local month.
 * activeDays: Local days with at least one dictation.
 * dayStreak: Consecutive local days with dictation.
 * longestDayStreak: Longest run of consecutive local days with dictation.
 * weekStreak: Consecutive Sunday-based local weeks with dictation.
 * timeZone: Time zone used for local calendar values.
 */
export type MetricsResponse = {
    /**
     * Activedays
     */
    activeDays: number;
    /**
     * Correctedwords
     */
    correctedWords: number;
    /**
     * Daystreak
     */
    dayStreak: number;
    /**
     * Dictationcount
     */
    dictationCount: number;
    /**
     * Dictionaryreplacements
     */
    dictionaryReplacements: number;
    /**
     * Longestdaystreak
     */
    longestDayStreak: number;
    /**
     * Timezone
     */
    timeZone: string;
    /**
     * Totaldurationms
     */
    totalDurationMs: number;
    /**
     * Totalwords
     */
    totalWords: number;
    /**
     * Weekstreak
     */
    weekStreak: number;
    /**
     * Wordslastmonth
     */
    wordsLastMonth: number;
    /**
     * Wordsperminute
     */
    wordsPerMinute: number;
    /**
     * Wordsthismonth
     */
    wordsThisMonth: number;
    /**
     * Wordsthisweek
     */
    wordsThisWeek: number;
    /**
     * Wordstoday
     */
    wordsToday: number;
};
/**
 * ModelDownloadRequest
 *
 * Request one explicit catalog model download.
 *
 * Args:
 * model: Catalog identifier.
 */
export type ModelDownloadRequest = {
    /**
     * Model
     */
    model: string;
};
/**
 * ModelDownloadResponse
 *
 * Acknowledge a started model download.
 *
 * Args:
 * model: Catalog identifier.
 * status: Always ``downloading``.
 */
export type ModelDownloadResponse = {
    /**
     * Model
     */
    model: string;
    /**
     * Status
     */
    status?: 'downloading';
};
/**
 * NoteCreateRequest
 *
 * Create a note from a title and content.
 *
 * Args:
 * title: Note title, possibly empty.
 * content: Note content, possibly empty.
 */
export type NoteCreateRequest = {
    /**
     * Content
     */
    content: string;
    /**
     * Title
     */
    title: string;
};
/**
 * NoteListResponse
 *
 * Wrap a list of owned notes.
 *
 * Args:
 * items: Notes ordered by update time descending.
 */
export type NoteListResponse = {
    /**
     * Items
     */
    items: Array<NoteResponse>;
};
/**
 * NoteResponse
 *
 * Represent an owned note.
 *
 * Args:
 * id: Stable note ID.
 * title: Display title.
 * content: Note content.
 * summary: Generated summary or absent value.
 * pinned: Pin state.
 * createdAt: Creation timestamp.
 * updatedAt: Last mutation timestamp.
 */
export type NoteResponse = {
    /**
     * Content
     */
    content: string;
    /**
     * Createdat
     */
    createdAt: string;
    /**
     * Id
     */
    id: string;
    /**
     * Pinned
     */
    pinned: boolean;
    /**
     * Summary
     */
    summary: string | null;
    /**
     * Title
     */
    title: string;
    /**
     * Updatedat
     */
    updatedAt: string;
};
/**
 * NoteUpdateRequest
 *
 * Partially update a note title, content or pin state.
 *
 * Args:
 * title: Optional replacement title.
 * content: Optional replacement content.
 * pinned: Optional pin state.
 */
export type NoteUpdateRequest = {
    /**
     * Content
     */
    content?: string | null;
    /**
     * Pinned
     */
    pinned?: boolean | null;
    /**
     * Title
     */
    title?: string | null;
};
/**
 * ReadyResponse
 *
 * Represent safe external dependency readiness.
 *
 * Args:
 * status: Ready or unavailable state.
 * missingConfiguration: Required setting names only.
 * failures: Sanitized dependency errors.
 */
export type ReadyResponse = {
    /**
     * Failures
     */
    failures: Array<string>;
    /**
     * Missingconfiguration
     */
    missingConfiguration: Array<string>;
    /**
     * Status
     */
    status: 'ready' | 'unavailable';
};
/**
 * RefreshRequest
 *
 * Request local application refresh-token rotation.
 *
 * Args:
 * refreshToken: Opaque refresh credential issued by this API.
 */
export type RefreshRequest = {
    /**
     * Refresh Token
     */
    refresh_token: string;
};
/**
 * RefreshResponse
 *
 * Return a short app access token and rotated refresh credential.
 *
 * Args:
 * accessToken: Short-lived API JWT.
 * refreshToken: Newly issued opaque local refresh credential.
 */
export type RefreshResponse = {
    /**
     * Accesstoken
     */
    accessToken: string;
    /**
     * Refreshtoken
     */
    refreshToken: string;
};
/**
 * SpeechModelListResponse
 *
 * List supported on-device speech models.
 *
 * Args:
 * items: Catalog entries.
 */
export type SpeechModelListResponse = {
    /**
     * Items
     */
    items: Array<SpeechModelResponse>;
};
/**
 * SpeechModelResponse
 *
 * Describe one supported on-device speech model.
 *
 * Args:
 * id: Catalog identifier shown to users.
 * title: Display name.
 * revision: Pinned upstream commit.
 * license: Weights license.
 * languages: Supported language codes.
 * sizeBytes: Total download size.
 * installed: Whether a complete copy is installed.
 */
export type SpeechModelResponse = {
    /**
     * Id
     */
    id: string;
    /**
     * Installed
     */
    installed: boolean;
    /**
     * Languages
     */
    languages: Array<string>;
    /**
     * License
     */
    license: string;
    /**
     * Revision
     */
    revision: string;
    /**
     * Sizebytes
     */
    sizeBytes: number;
    /**
     * Title
     */
    title: string;
};
/**
 * SyncDeletion
 *
 * Carry one deletion so the other server removes its older copy too.
 *
 * Args:
 * kind: Record family.
 * key: Note or meeting UUID, or dictionary phrase.
 * deletedAt: Deletion timestamp; a copy changed after it survives.
 */
export type SyncDeletion = {
    /**
     * Deletedat
     */
    deletedAt: string;
    /**
     * Key
     */
    key: string;
    /**
     * Kind
     */
    kind: 'note' | 'dictionary' | 'meeting';
};
/**
 * SyncDictionaryEntry
 *
 * Carry one dictionary entry, matched across servers by its phrase.
 *
 * Args:
 * phrase: Recognized phrase, unique per user.
 * replacement: Output replacement.
 * createdAt: Creation timestamp.
 * updatedAt: Last change timestamp; the newer copy wins.
 */
export type SyncDictionaryEntry = {
    /**
     * Createdat
     */
    createdAt: string;
    /**
     * Phrase
     */
    phrase: string;
    /**
     * Replacement
     */
    replacement: string;
    /**
     * Updatedat
     */
    updatedAt: string;
};
/**
 * SyncMeeting
 *
 * Carry the finished text of one meeting. Audio never moves between servers.
 *
 * Args:
 * id: Stable meeting UUID shared by both servers.
 * title: Display title.
 * startedAt: Capture start timestamp.
 * endedAt: Capture finish timestamp, if known.
 * durationMs: Recorded duration.
 * transcript: Saved transcript text.
 * summary: Saved summary text, if any.
 * createdAt: Creation timestamp.
 * updatedAt: Last change timestamp; the newer copy wins.
 */
export type SyncMeeting = {
    /**
     * Createdat
     */
    createdAt: string;
    /**
     * Durationms
     */
    durationMs: number;
    /**
     * Endedat
     */
    endedAt: string | null;
    /**
     * Id
     */
    id: string;
    /**
     * Startedat
     */
    startedAt: string;
    /**
     * Summary
     */
    summary: string | null;
    /**
     * Title
     */
    title: string;
    /**
     * Transcript
     */
    transcript: string;
    /**
     * Updatedat
     */
    updatedAt: string;
};
/**
 * SyncMergeResponse
 *
 * Report how many records a merge added, replaced or removed.
 *
 * Args:
 * changes: Count of records changed on this server.
 */
export type SyncMergeResponse = {
    /**
     * Changes
     */
    changes: number;
};
/**
 * SyncMetric
 *
 * Carry one immutable dictation metric event under its stable event id.
 *
 * Args:
 * eventId: Client-stable event UUID.
 */
export type SyncMetric = {
    /**
     * Appname
     */
    appName?: string | null;
    /**
     * Correctedwords
     */
    correctedWords?: number;
    /**
     * Createdat
     */
    createdAt: string;
    /**
     * Deviceid
     */
    deviceId?: string | null;
    /**
     * Dictionaryreplacements
     */
    dictionaryReplacements: number;
    /**
     * Durationms
     */
    durationMs: number;
    /**
     * Eventid
     */
    eventId: string;
    /**
     * Outputwords
     */
    outputWords: number;
    /**
     * Speechdurationms
     */
    speechDurationMs?: number | null;
    /**
     * Timezone
     */
    timezone?: string;
};
/**
 * SyncNote
 *
 * Carry one note with the time it last changed.
 *
 * Args:
 * id: Stable note UUID shared by both servers.
 * title: Display title.
 * content: Note content.
 * summary: Saved summary or absent value.
 * pinned: Pin state.
 * createdAt: Creation timestamp.
 * updatedAt: Last change timestamp; the newer copy wins.
 */
export type SyncNote = {
    /**
     * Content
     */
    content: string;
    /**
     * Createdat
     */
    createdAt: string;
    /**
     * Id
     */
    id: string;
    /**
     * Pinned
     */
    pinned?: boolean;
    /**
     * Summary
     */
    summary?: string | null;
    /**
     * Title
     */
    title: string;
    /**
     * Updatedat
     */
    updatedAt: string;
};
/**
 * SyncSnapshot
 *
 * Represent everything of one user that two servers keep in step.
 *
 * Args:
 * notes: Every note.
 * dictionary: Every dictionary entry.
 * meetings: Every meeting with no transcription or summary in progress.
 * metrics: Every dictation metric event.
 * deletions: Every remembered deletion.
 */
export type SyncSnapshot = {
    /**
     * Deletions
     */
    deletions?: Array<SyncDeletion>;
    /**
     * Dictionary
     */
    dictionary?: Array<SyncDictionaryEntry>;
    /**
     * Meetings
     */
    meetings?: Array<SyncMeeting>;
    /**
     * Metrics
     */
    metrics?: Array<SyncMetric>;
    /**
     * Notes
     */
    notes?: Array<SyncNote>;
};
/**
 * TextTransformationRequest
 *
 * Request one proposed rewrite without changing its source.
 *
 * Args:
 * text: Inline source text, used when no owned resource is referenced.
 * kind: Fixed transformation to perform.
 * instruction: Required for tone and custom requests, otherwise optional guidance.
 * targetLanguage: Language name or tag, required for translation.
 * resourceType: Owned server resource whose stored text is transformed.
 * resourceId: Identifier of the owned resource.
 * sourceRevision: Revision the caller expects the resource to have.
 */
export type TextTransformationRequest = {
    /**
     * Instruction
     */
    instruction?: string | null;
    /**
     * Kind
     */
    kind: 'polish' | 'shorten' | 'expand' | 'tone' | 'translate' | 'custom';
    /**
     * Resourceid
     */
    resourceId?: string | null;
    /**
     * Resourcetype
     */
    resourceType?: 'note' | 'meeting-transcript' | 'meeting-summary' | null;
    /**
     * Sourcerevision
     */
    sourceRevision?: number | null;
    /**
     * Targetlanguage
     */
    targetLanguage?: string | null;
    /**
     * Text
     */
    text?: string | null;
};
/**
 * TextTransformationResponse
 *
 * Return a proposed rewrite for the caller to review.
 *
 * Args:
 * id: Opaque identifier for this generated proposal.
 * text: Proposed replacement text.
 * sourceRevision: Revision that was transformed, or null for inline text.
 */
export type TextTransformationResponse = {
    /**
     * Id
     */
    id: string;
    /**
     * Sourcerevision
     */
    sourceRevision: number | null;
    /**
     * Text
     */
    text: string;
};
/**
 * TranscriptListResponse
 *
 * Wrap caller-owned transcripts.
 *
 * Args:
 * items: Transcripts ordered newest first.
 */
export type TranscriptListResponse = {
    /**
     * Items
     */
    items: Array<TranscriptResponse>;
};
/**
 * TranscriptResponse
 *
 * Represent a persisted transcription.
 *
 * Args:
 * id: Stable transcript ID.
 * text: Final presentation text.
 * rawText: Upstream text before substitutions.
 * language: Optional spoken language tag.
 * createdAt: Creation timestamp.
 * dictionaryReplacements: Number of substitutions applied before polish.
 */
export type TranscriptResponse = {
    /**
     * Createdat
     */
    createdAt: string;
    /**
     * Dictionaryreplacements
     */
    dictionaryReplacements?: number;
    /**
     * Id
     */
    id: string;
    /**
     * Language
     */
    language: string | null;
    /**
     * Rawtext
     */
    rawText: string;
    /**
     * Text
     */
    text: string;
};
/**
 * UserResponse
 *
 * Represent public local user information.
 *
 * Args:
 * id: Opaque local account ID.
 * firstName: Identity provider profile given name when supplied.
 * lastName: Identity provider profile family name when supplied.
 * onboardingCompleted: User's application onboarding state.
 */
export type UserResponse = {
    /**
     * Firstname
     */
    firstName: string | null;
    /**
     * Id
     */
    id: string;
    /**
     * Lastname
     */
    lastName: string | null;
    /**
     * Onboardingcompleted
     */
    onboardingCompleted: boolean;
};
/**
 * UserUpdateRequest
 *
 * Partially update the local profile fields without changing OIDC identity.
 *
 * Args:
 * firstName: Optional local first name.
 * lastName: Optional local last name.
 */
export type UserUpdateRequest = {
    /**
     * Firstname
     */
    firstName?: string | null;
    /**
     * Lastname
     */
    lastName?: string | null;
};
export type OidcCallbackData = {
    body?: never;
    path?: never;
    query: {
        /**
         * Code
         */
        code: string;
        /**
         * State
         */
        state: string;
    };
    url: '/auth/callback';
};
export type OidcCallbackErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type OidcCallbackError = OidcCallbackErrors[keyof OidcCallbackErrors];
export type OidcCallbackResponses = {
    /**
     * Successful Response
     */
    200: unknown;
};
export type PollDeviceAuthorizationData = {
    body?: never;
    headers?: {
        /**
         * X-Whisperer-Device-Verifier
         */
        'X-Whisperer-Device-Verifier'?: string | null;
    };
    path?: never;
    query: {
        /**
         * Device Code
         */
        device_code: string;
    };
    url: '/device/poll';
};
export type PollDeviceAuthorizationErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type PollDeviceAuthorizationError = PollDeviceAuthorizationErrors[keyof PollDeviceAuthorizationErrors];
export type PollDeviceAuthorizationResponses = {
    /**
     * Successful Response
     */
    200: DevicePollResponse;
};
export type PollDeviceAuthorizationResponse = PollDeviceAuthorizationResponses[keyof PollDeviceAuthorizationResponses];
export type StreamDeviceAuthorizationData = {
    body?: never;
    headers?: {
        /**
         * X-Whisperer-Device-Verifier
         */
        'X-Whisperer-Device-Verifier'?: string | null;
    };
    path?: never;
    query: {
        /**
         * Device Code
         */
        device_code: string;
    };
    url: '/device/stream';
};
export type StreamDeviceAuthorizationErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type StreamDeviceAuthorizationError = StreamDeviceAuthorizationErrors[keyof StreamDeviceAuthorizationErrors];
export type StreamDeviceAuthorizationResponses = {
    /**
     * Successful Response
     */
    200: unknown;
};
export type BeginBrowserLoginData = {
    body?: never;
    path?: never;
    query: {
        /**
         * Device Code
         */
        device_code: string;
        /**
         * Verifier Challenge
         */
        verifier_challenge: string;
    };
    url: '/login';
};
export type BeginBrowserLoginErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type BeginBrowserLoginError = BeginBrowserLoginErrors[keyof BeginBrowserLoginErrors];
export type BeginBrowserLoginResponses = {
    /**
     * Successful Response
     */
    200: unknown;
};
export type LogoutApplicationSessionData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/auth/logout';
};
export type LogoutApplicationSessionErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type LogoutApplicationSessionError = LogoutApplicationSessionErrors[keyof LogoutApplicationSessionErrors];
export type LogoutApplicationSessionResponses = {
    /**
     * Successful Response
     */
    204: void;
};
export type LogoutApplicationSessionResponse = LogoutApplicationSessionResponses[keyof LogoutApplicationSessionResponses];
export type GetLegacyCurrentUserData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/auth/me';
};
export type GetLegacyCurrentUserErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetLegacyCurrentUserError = GetLegacyCurrentUserErrors[keyof GetLegacyCurrentUserErrors];
export type GetLegacyCurrentUserResponses = {
    /**
     * Successful Response
     */
    200: CurrentUserResponse;
};
export type GetLegacyCurrentUserResponse = GetLegacyCurrentUserResponses[keyof GetLegacyCurrentUserResponses];
export type RefreshApplicationSessionData = {
    body: RefreshRequest;
    path?: never;
    query?: never;
    url: '/v1/auth/refresh';
};
export type RefreshApplicationSessionErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type RefreshApplicationSessionError = RefreshApplicationSessionErrors[keyof RefreshApplicationSessionErrors];
export type RefreshApplicationSessionResponses = {
    /**
     * Successful Response
     */
    200: RefreshResponse;
};
export type RefreshApplicationSessionResponse = RefreshApplicationSessionResponses[keyof RefreshApplicationSessionResponses];
export type PutDictationMetricData = {
    body: DictationMetricRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Event Id
         */
        event_id: string;
    };
    query?: never;
    url: '/v1/dictation-metrics/{event_id}';
};
export type PutDictationMetricErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type PutDictationMetricError = PutDictationMetricErrors[keyof PutDictationMetricErrors];
export type PutDictationMetricResponses = {
    /**
     * Successful Response
     */
    200: unknown;
};
export type ListDictionaryData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/dictionary';
};
export type ListDictionaryErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type ListDictionaryError = ListDictionaryErrors[keyof ListDictionaryErrors];
export type ListDictionaryResponses = {
    /**
     * Successful Response
     */
    200: DictionaryListResponse;
};
export type ListDictionaryResponse = ListDictionaryResponses[keyof ListDictionaryResponses];
export type CreateDictionaryEntryData = {
    body: DictionaryCreateRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/dictionary';
};
export type CreateDictionaryEntryErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type CreateDictionaryEntryError = CreateDictionaryEntryErrors[keyof CreateDictionaryEntryErrors];
export type CreateDictionaryEntryResponses = {
    /**
     * Successful Response
     */
    201: DictionaryResponse;
};
export type CreateDictionaryEntryResponse = CreateDictionaryEntryResponses[keyof CreateDictionaryEntryResponses];
export type DeleteDictionaryEntryData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Entry Id
         */
        entry_id: string;
    };
    query?: never;
    url: '/v1/dictionary/{entry_id}';
};
export type DeleteDictionaryEntryErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type DeleteDictionaryEntryError = DeleteDictionaryEntryErrors[keyof DeleteDictionaryEntryErrors];
export type DeleteDictionaryEntryResponses = {
    /**
     * Successful Response
     */
    204: void;
};
export type DeleteDictionaryEntryResponse = DeleteDictionaryEntryResponses[keyof DeleteDictionaryEntryResponses];
export type PatchDictionaryEntryData = {
    body: DictionaryUpdateRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Entry Id
         */
        entry_id: string;
    };
    query?: never;
    url: '/v1/dictionary/{entry_id}';
};
export type PatchDictionaryEntryErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type PatchDictionaryEntryError = PatchDictionaryEntryErrors[keyof PatchDictionaryEntryErrors];
export type PatchDictionaryEntryResponses = {
    /**
     * Successful Response
     */
    200: DictionaryResponse;
};
export type PatchDictionaryEntryResponse = PatchDictionaryEntryResponses[keyof PatchDictionaryEntryResponses];
export type ReplaceDictionaryEntryData = {
    body: DictionaryUpdateRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Entry Id
         */
        entry_id: string;
    };
    query?: never;
    url: '/v1/dictionary/{entry_id}';
};
export type ReplaceDictionaryEntryErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type ReplaceDictionaryEntryError = ReplaceDictionaryEntryErrors[keyof ReplaceDictionaryEntryErrors];
export type ReplaceDictionaryEntryResponses = {
    /**
     * Successful Response
     */
    200: DictionaryResponse;
};
export type ReplaceDictionaryEntryResponse = ReplaceDictionaryEntryResponses[keyof ReplaceDictionaryEntryResponses];
export type GetHealthData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/v1/health';
};
export type GetHealthErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetHealthError = GetHealthErrors[keyof GetHealthErrors];
export type GetHealthResponses = {
    /**
     * Successful Response
     */
    200: HealthResponse;
};
export type GetHealthResponse = GetHealthResponses[keyof GetHealthResponses];
export type ListSpeechModelsData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/inference/models';
};
export type ListSpeechModelsErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type ListSpeechModelsError = ListSpeechModelsErrors[keyof ListSpeechModelsErrors];
export type ListSpeechModelsResponses = {
    /**
     * Successful Response
     */
    200: SpeechModelListResponse;
};
export type ListSpeechModelsResponse = ListSpeechModelsResponses[keyof ListSpeechModelsResponses];
export type DownloadSpeechModelData = {
    body: ModelDownloadRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/inference/models/download';
};
export type DownloadSpeechModelErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type DownloadSpeechModelError = DownloadSpeechModelErrors[keyof DownloadSpeechModelErrors];
export type DownloadSpeechModelResponses = {
    /**
     * Successful Response
     */
    202: ModelDownloadResponse;
};
export type DownloadSpeechModelResponse = DownloadSpeechModelResponses[keyof DownloadSpeechModelResponses];
export type GetInferenceStatusData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/inference/status';
};
export type GetInferenceStatusErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetInferenceStatusError = GetInferenceStatusErrors[keyof GetInferenceStatusErrors];
export type GetInferenceStatusResponses = {
    /**
     * Successful Response
     */
    200: InferenceStatusResponse;
};
export type GetInferenceStatusResponse = GetInferenceStatusResponses[keyof GetInferenceStatusResponses];
export type TestInferenceData = {
    body: InferenceTestRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/inference/test';
};
export type TestInferenceErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type TestInferenceError = TestInferenceErrors[keyof TestInferenceErrors];
export type TestInferenceResponses = {
    /**
     * Successful Response
     */
    200: InferenceTestResponse;
};
export type TestInferenceResponse = TestInferenceResponses[keyof TestInferenceResponses];
export type AnswerLocalChallengeData = {
    body: LocalChallengeRequest;
    path?: never;
    query?: never;
    url: '/v1/local/challenge';
};
export type AnswerLocalChallengeErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type AnswerLocalChallengeError = AnswerLocalChallengeErrors[keyof AnswerLocalChallengeErrors];
export type AnswerLocalChallengeResponses = {
    /**
     * Successful Response
     */
    200: LocalChallengeResponse;
};
export type AnswerLocalChallengeResponse = AnswerLocalChallengeResponses[keyof AnswerLocalChallengeResponses];
export type DeleteLocalDataData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/local/data';
};
export type DeleteLocalDataErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type DeleteLocalDataError = DeleteLocalDataErrors[keyof DeleteLocalDataErrors];
export type DeleteLocalDataResponses = {
    /**
     * Successful Response
     */
    204: void;
};
export type DeleteLocalDataResponse = DeleteLocalDataResponses[keyof DeleteLocalDataResponses];
export type DeleteAccountData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/me';
};
export type DeleteAccountErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type DeleteAccountError = DeleteAccountErrors[keyof DeleteAccountErrors];
export type DeleteAccountResponses = {
    /**
     * Successful Response
     */
    204: void;
};
export type DeleteAccountResponse = DeleteAccountResponses[keyof DeleteAccountResponses];
export type GetCurrentUserData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/me';
};
export type GetCurrentUserErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetCurrentUserError = GetCurrentUserErrors[keyof GetCurrentUserErrors];
export type GetCurrentUserResponses = {
    /**
     * Successful Response
     */
    200: CurrentUserResponse;
};
export type GetCurrentUserResponse = GetCurrentUserResponses[keyof GetCurrentUserResponses];
export type PatchCurrentUserData = {
    body: UserUpdateRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/me';
};
export type PatchCurrentUserErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type PatchCurrentUserError = PatchCurrentUserErrors[keyof PatchCurrentUserErrors];
export type PatchCurrentUserResponses = {
    /**
     * Successful Response
     */
    200: CurrentUserResponse;
};
export type PatchCurrentUserResponse = PatchCurrentUserResponses[keyof PatchCurrentUserResponses];
export type ListMeetingsData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: {
        /**
         * Cursor
         */
        cursor?: string | null;
        /**
         * Limit
         */
        limit?: number;
    };
    url: '/v1/meetings';
};
export type ListMeetingsErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type ListMeetingsError = ListMeetingsErrors[keyof ListMeetingsErrors];
export type ListMeetingsResponses = {
    /**
     * Successful Response
     */
    200: MeetingListResponse;
};
export type ListMeetingsResponse = ListMeetingsResponses[keyof ListMeetingsResponses];
export type CreateMeetingData = {
    body: MeetingCreateRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/meetings';
};
export type CreateMeetingErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type CreateMeetingError = CreateMeetingErrors[keyof CreateMeetingErrors];
export type CreateMeetingResponses = {
    /**
     * Successful Response
     */
    201: MeetingResponse;
};
export type CreateMeetingResponse = CreateMeetingResponses[keyof CreateMeetingResponses];
export type DeleteMeetingData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}';
};
export type DeleteMeetingErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type DeleteMeetingError = DeleteMeetingErrors[keyof DeleteMeetingErrors];
export type DeleteMeetingResponses = {
    /**
     * Successful Response
     */
    204: void;
};
export type DeleteMeetingResponse = DeleteMeetingResponses[keyof DeleteMeetingResponses];
export type GetMeetingData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}';
};
export type GetMeetingErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetMeetingError = GetMeetingErrors[keyof GetMeetingErrors];
export type GetMeetingResponses = {
    /**
     * Successful Response
     */
    200: MeetingResponse;
};
export type GetMeetingResponse = GetMeetingResponses[keyof GetMeetingResponses];
export type PatchMeetingData = {
    body: MeetingMetadataPatchRequest;
    headers?: {
        /**
         * If-Match
         */
        'If-Match'?: string | null;
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}';
};
export type PatchMeetingErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type PatchMeetingError = PatchMeetingErrors[keyof PatchMeetingErrors];
export type PatchMeetingResponses = {
    /**
     * Successful Response
     */
    200: MeetingResponse;
};
export type PatchMeetingResponse = PatchMeetingResponses[keyof PatchMeetingResponses];
export type GetMeetingAudioData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: {
        /**
         * Segmentid
         */
        segmentId?: string | null;
    };
    url: '/v1/meetings/{meeting_id}/audio';
};
export type GetMeetingAudioErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetMeetingAudioError = GetMeetingAudioErrors[keyof GetMeetingAudioErrors];
export type GetMeetingAudioResponses = {
    /**
     * Successful Response
     */
    200: unknown;
};
export type FinishMeetingData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}/finish';
};
export type FinishMeetingErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type FinishMeetingError = FinishMeetingErrors[keyof FinishMeetingErrors];
export type FinishMeetingResponses = {
    /**
     * Successful Response
     */
    200: MeetingResponse;
};
export type FinishMeetingResponse = FinishMeetingResponses[keyof FinishMeetingResponses];
export type AskMeetingQuestionData = {
    body: MeetingQuestionRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}/questions';
};
export type AskMeetingQuestionErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type AskMeetingQuestionError = AskMeetingQuestionErrors[keyof AskMeetingQuestionErrors];
export type AskMeetingQuestionResponses = {
    /**
     * Successful Response
     */
    200: MeetingQuestionResponse;
};
export type AskMeetingQuestionResponse = AskMeetingQuestionResponses[keyof AskMeetingQuestionResponses];
export type ResumeMeetingData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}/resume';
};
export type ResumeMeetingErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type ResumeMeetingError = ResumeMeetingErrors[keyof ResumeMeetingErrors];
export type ResumeMeetingResponses = {
    /**
     * Successful Response
     */
    200: MeetingResponse;
};
export type ResumeMeetingResponse = ResumeMeetingResponses[keyof ResumeMeetingResponses];
export type UploadMeetingSegmentData = {
    body: BodyUploadMeetingSegment;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
        /**
         * Segment Id
         */
        segment_id: string;
    };
    query: {
        /**
         * Durationms
         */
        durationMs: number;
        /**
         * Language
         */
        language?: string | null;
    };
    url: '/v1/meetings/{meeting_id}/segments/{segment_id}';
};
export type UploadMeetingSegmentErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type UploadMeetingSegmentError = UploadMeetingSegmentErrors[keyof UploadMeetingSegmentErrors];
export type UploadMeetingSegmentResponses = {
    /**
     * Successful Response
     */
    201: MeetingSegmentResponse;
};
export type UploadMeetingSegmentResponse = UploadMeetingSegmentResponses[keyof UploadMeetingSegmentResponses];
export type RetryMeetingSegmentData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
        /**
         * Segment Id
         */
        segment_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}/segments/{segment_id}/retry';
};
export type RetryMeetingSegmentErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type RetryMeetingSegmentError = RetryMeetingSegmentErrors[keyof RetryMeetingSegmentErrors];
export type RetryMeetingSegmentResponses = {
    /**
     * Successful Response
     */
    200: MeetingSegmentResponse;
};
export type RetryMeetingSegmentResponse = RetryMeetingSegmentResponses[keyof RetryMeetingSegmentResponses];
export type GetMeetingSummaryData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}/summary';
};
export type GetMeetingSummaryErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetMeetingSummaryError = GetMeetingSummaryErrors[keyof GetMeetingSummaryErrors];
export type GetMeetingSummaryResponses = {
    /**
     * Successful Response
     */
    200: MeetingSummaryResponse;
};
export type GetMeetingSummaryResponse = GetMeetingSummaryResponses[keyof GetMeetingSummaryResponses];
export type PatchMeetingSummaryData = {
    body: MeetingTextPatchRequest;
    headers?: {
        /**
         * If-Match
         */
        'If-Match'?: string | null;
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}/summary';
};
export type PatchMeetingSummaryErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type PatchMeetingSummaryError = PatchMeetingSummaryErrors[keyof PatchMeetingSummaryErrors];
export type PatchMeetingSummaryResponses = {
    /**
     * Successful Response
     */
    200: MeetingSummaryResponse;
};
export type PatchMeetingSummaryResponse = PatchMeetingSummaryResponses[keyof PatchMeetingSummaryResponses];
export type RegenerateMeetingSummaryData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}/summary/regenerate';
};
export type RegenerateMeetingSummaryErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type RegenerateMeetingSummaryError = RegenerateMeetingSummaryErrors[keyof RegenerateMeetingSummaryErrors];
export type RegenerateMeetingSummaryResponses = {
    /**
     * Successful Response
     */
    200: MeetingResponse;
};
export type RegenerateMeetingSummaryResponse = RegenerateMeetingSummaryResponses[keyof RegenerateMeetingSummaryResponses];
export type GetMeetingTranscriptData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}/transcript';
};
export type GetMeetingTranscriptErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetMeetingTranscriptError = GetMeetingTranscriptErrors[keyof GetMeetingTranscriptErrors];
export type GetMeetingTranscriptResponses = {
    /**
     * Successful Response
     */
    200: MeetingTranscriptResponse;
};
export type GetMeetingTranscriptResponse = GetMeetingTranscriptResponses[keyof GetMeetingTranscriptResponses];
export type PatchMeetingTranscriptData = {
    body: MeetingTextPatchRequest;
    headers?: {
        /**
         * If-Match
         */
        'If-Match'?: string | null;
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Meeting Id
         */
        meeting_id: string;
    };
    query?: never;
    url: '/v1/meetings/{meeting_id}/transcript';
};
export type PatchMeetingTranscriptErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type PatchMeetingTranscriptError = PatchMeetingTranscriptErrors[keyof PatchMeetingTranscriptErrors];
export type PatchMeetingTranscriptResponses = {
    /**
     * Successful Response
     */
    200: MeetingTranscriptResponse;
};
export type PatchMeetingTranscriptResponse = PatchMeetingTranscriptResponses[keyof PatchMeetingTranscriptResponses];
export type GetMetricsData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: {
        /**
         * Timezone
         */
        timeZone?: string;
    };
    url: '/v1/metrics';
};
export type GetMetricsErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetMetricsError = GetMetricsErrors[keyof GetMetricsErrors];
export type GetMetricsResponses = {
    /**
     * Successful Response
     */
    200: MetricsResponse;
};
export type GetMetricsResponse = GetMetricsResponses[keyof GetMetricsResponses];
export type GetAppMetricsData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/metrics/apps';
};
export type GetAppMetricsErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetAppMetricsError = GetAppMetricsErrors[keyof GetAppMetricsErrors];
export type GetAppMetricsResponses = {
    /**
     * Successful Response
     */
    200: AppMetricsResponse;
};
export type GetAppMetricsResponse = GetAppMetricsResponses[keyof GetAppMetricsResponses];
export type GetDailyMetricsData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: {
        /**
         * From
         */
        from?: string | null;
        /**
         * Until
         */
        until?: string | null;
        /**
         * Timezone
         */
        timeZone?: string;
    };
    url: '/v1/metrics/daily';
};
export type GetDailyMetricsErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetDailyMetricsError = GetDailyMetricsErrors[keyof GetDailyMetricsErrors];
export type GetDailyMetricsResponses = {
    /**
     * Successful Response
     */
    200: DailyMetricsResponse;
};
export type GetDailyMetricsResponse = GetDailyMetricsResponses[keyof GetDailyMetricsResponses];
export type ListNotesData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/notes';
};
export type ListNotesErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type ListNotesError = ListNotesErrors[keyof ListNotesErrors];
export type ListNotesResponses = {
    /**
     * Successful Response
     */
    200: NoteListResponse;
};
export type ListNotesResponse = ListNotesResponses[keyof ListNotesResponses];
export type CreateNoteData = {
    body: NoteCreateRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/notes';
};
export type CreateNoteErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type CreateNoteError = CreateNoteErrors[keyof CreateNoteErrors];
export type CreateNoteResponses = {
    /**
     * Successful Response
     */
    201: NoteResponse;
};
export type CreateNoteResponse = CreateNoteResponses[keyof CreateNoteResponses];
export type DeleteNoteData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Note Id
         */
        note_id: string;
    };
    query?: never;
    url: '/v1/notes/{note_id}';
};
export type DeleteNoteErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type DeleteNoteError = DeleteNoteErrors[keyof DeleteNoteErrors];
export type DeleteNoteResponses = {
    /**
     * Successful Response
     */
    204: void;
};
export type DeleteNoteResponse = DeleteNoteResponses[keyof DeleteNoteResponses];
export type PatchNoteData = {
    body: NoteUpdateRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Note Id
         */
        note_id: string;
    };
    query?: never;
    url: '/v1/notes/{note_id}';
};
export type PatchNoteErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type PatchNoteError = PatchNoteErrors[keyof PatchNoteErrors];
export type PatchNoteResponses = {
    /**
     * Successful Response
     */
    200: NoteResponse;
};
export type PatchNoteResponse = PatchNoteResponses[keyof PatchNoteResponses];
export type ReplaceNoteData = {
    body: NoteUpdateRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Note Id
         */
        note_id: string;
    };
    query?: never;
    url: '/v1/notes/{note_id}';
};
export type ReplaceNoteErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type ReplaceNoteError = ReplaceNoteErrors[keyof ReplaceNoteErrors];
export type ReplaceNoteResponses = {
    /**
     * Successful Response
     */
    200: NoteResponse;
};
export type ReplaceNoteResponse = ReplaceNoteResponses[keyof ReplaceNoteResponses];
export type SummarizeNoteData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Note Id
         */
        note_id: string;
    };
    query?: never;
    url: '/v1/notes/{note_id}/summary';
};
export type SummarizeNoteErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type SummarizeNoteError = SummarizeNoteErrors[keyof SummarizeNoteErrors];
export type SummarizeNoteResponses = {
    /**
     * Successful Response
     */
    200: NoteResponse;
};
export type SummarizeNoteResponse = SummarizeNoteResponses[keyof SummarizeNoteResponses];
export type GetReadinessData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/v1/ready';
};
export type GetReadinessErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type GetReadinessError = GetReadinessErrors[keyof GetReadinessErrors];
export type GetReadinessResponses = {
    /**
     * Successful Response
     */
    200: ReadyResponse;
};
export type GetReadinessResponse = GetReadinessResponses[keyof GetReadinessResponses];
export type ExportSyncSnapshotData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/sync';
};
export type ExportSyncSnapshotErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type ExportSyncSnapshotError = ExportSyncSnapshotErrors[keyof ExportSyncSnapshotErrors];
export type ExportSyncSnapshotResponses = {
    /**
     * Successful Response
     */
    200: SyncSnapshot;
};
export type ExportSyncSnapshotResponse = ExportSyncSnapshotResponses[keyof ExportSyncSnapshotResponses];
export type MergeSyncSnapshotData = {
    body: SyncSnapshot;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/sync';
};
export type MergeSyncSnapshotErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type MergeSyncSnapshotError = MergeSyncSnapshotErrors[keyof MergeSyncSnapshotErrors];
export type MergeSyncSnapshotResponses = {
    /**
     * Successful Response
     */
    200: SyncMergeResponse;
};
export type MergeSyncSnapshotResponse = MergeSyncSnapshotResponses[keyof MergeSyncSnapshotResponses];
export type CreateTextTransformationData = {
    body: TextTransformationRequest;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/text-transformations';
};
export type CreateTextTransformationErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type CreateTextTransformationError = CreateTextTransformationErrors[keyof CreateTextTransformationErrors];
export type CreateTextTransformationResponses = {
    /**
     * Successful Response
     */
    200: TextTransformationResponse;
};
export type CreateTextTransformationResponse = CreateTextTransformationResponses[keyof CreateTextTransformationResponses];
export type CreateTranscriptionData = {
    body: BodyCreateTranscription;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: {
        /**
         * Language
         */
        language?: string | null;
        /**
         * Polish
         */
        polish?: boolean;
    };
    url: '/v1/transcriptions';
};
export type CreateTranscriptionErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type CreateTranscriptionError = CreateTranscriptionErrors[keyof CreateTranscriptionErrors];
export type CreateTranscriptionResponses = {
    /**
     * Successful Response
     */
    200: TranscriptResponse;
};
export type CreateTranscriptionResponse = CreateTranscriptionResponses[keyof CreateTranscriptionResponses];
export type ListTranscriptsData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path?: never;
    query?: never;
    url: '/v1/transcripts';
};
export type ListTranscriptsErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type ListTranscriptsError = ListTranscriptsErrors[keyof ListTranscriptsErrors];
export type ListTranscriptsResponses = {
    /**
     * Successful Response
     */
    200: TranscriptListResponse;
};
export type ListTranscriptsResponse = ListTranscriptsResponses[keyof ListTranscriptsResponses];
export type DeleteTranscriptData = {
    body?: never;
    headers?: {
        /**
         * Authorization
         */
        authorization?: string | null;
    };
    path: {
        /**
         * Transcript Id
         */
        transcript_id: string;
    };
    query?: never;
    url: '/v1/transcripts/{transcript_id}';
};
export type DeleteTranscriptErrors = {
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    400: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    401: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    403: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    404: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    409: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    412: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    413: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    415: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    422: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    428: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    502: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
    /**
     * Problem
     *
     * Represent an RFC 9457-compatible safe API error.
     *
     * Args:
     * type: Stable machine-readable problem URI.
     * title: HTTP status title.
     * status: HTTP response status.
     * detail: Safe client-readable explanation.
     * instance: Request path which produced the error.
     */
    503: {
        /**
         * Detail
         */
        detail: string;
        /**
         * Instance
         */
        instance: string;
        /**
         * Status
         */
        status: number;
        /**
         * Title
         */
        title: string;
        /**
         * Type
         */
        type: string;
    };
};
export type DeleteTranscriptError = DeleteTranscriptErrors[keyof DeleteTranscriptErrors];
export type DeleteTranscriptResponses = {
    /**
     * Successful Response
     */
    204: void;
};
export type DeleteTranscriptResponse = DeleteTranscriptResponses[keyof DeleteTranscriptResponses];
