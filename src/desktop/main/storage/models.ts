/** Identifies the signed-in account that owns locally persisted content. */
export interface LocalStoreScope {
  /** The authenticated API server URL for the account. */
  server: string;
  /** The authenticated account identifier supplied by the API. */
  userId: string;
}

/** Configures a local SQLite database and optional opt-in audio root. */
export interface LocalStoreOptions {
  /** Absolute path to the SQLite file. Tests and non-Electron hosts provide this directly. */
  databasePath: string;
  /** Optional directory that explicitly permits persisted local meeting audio references. */
  audioDirectory?: string;
}

/** A completed or failed dictation retained only on the desktop. */
export interface LocalHistoryEntry {
  /** Stable local identifier for this entry. */
  id: string;
  /** Unmodified local dictation text. */
  rawText: string;
  /** Final text after server polish and dictionary replacements. */
  text: string;
  /** Unix epoch milliseconds when the dictation was created. */
  createdAt: number;
  /** Captured audio duration in milliseconds. */
  durationMs: number;
  /** Language used while dictating. */
  language: string;
  /** Frontmost application name when known. */
  appName: string | null;
  /** Whether the text was pasted into the target application. */
  pasted: boolean;
  /** Local processing status for the dictation. */
  status: string;
  /** Authoritative dictionary substitutions applied during transcription. */
  dictionaryReplacements?: number;
}

/** A reusable text expansion stored only on this desktop. */
export interface LocalSnippet {
  /** Stable local identifier for this snippet. */
  id: string;
  /** Trigger text that expands the snippet. */
  shortcut: string;
  /** Text inserted when the shortcut is used. */
  text: string;
  /** Number of times the snippet has been used locally. */
  useCount: number;
  /** Unix epoch milliseconds when this snippet was last edited or used. */
  updatedAt: number;
}

/** A locally cached or drafted note. */
export interface LocalNote {
  /** Stable local identifier for this note. */
  id: string;
  /** User-facing note title. */
  title: string;
  /** Full local note content. */
  content: string;
  /** Short local summary. */
  summary: string;
  /** Unix epoch milliseconds when this note was last modified. */
  updatedAt: number;
  /** Whether the note should be surfaced first locally. */
  pinned: boolean;
  /** Local synchronization state such as draft, cached, or local. */
  syncState: string;
}

/** Metadata and authoritative cache for a locally stored meeting. */
export interface LocalMeeting {
  /** Stable client-generated identifier shared with the authoritative API. */
  id: string;
  title: string;
  /** Unix epoch milliseconds when the meeting began. */
  createdAt: number;
  /** Unix epoch milliseconds when the meeting ended, if it has ended. */
  endedAt?: number | null;
  durationMs: number;
  historyEntryIds?: string[];
  transcript: string;
  transcriptRevision?: number;
  summary: string;
  summaryRevision?: number;
  summarySourceRevision?: number | null;
  summaryStale?: boolean;
  revision?: number;
  transcriptStatus?: string;
  summaryStatus?: string;
  /** Legacy single-file audio reference; never exposes an absolute path outside main. */
  audioPath?: string;
  /** Delivery state: local, pending, synced, or error. */
  syncState?: string;
  /** Safe last synchronization error. */
  error?: string | null;
  /** Legacy broad local processing status retained for existing data. */
  status: string;
}

/** A separately recorded segment under a stable meeting identity. */
export interface LocalMeetingSegment {
  id: string;
  meetingId: string;
  /** Absolute path reconstructed only within the configured audio root. */
  audioPath?: string;
  durationMs: number;
  contentType: string;
  /** Language captured for this immutable upload, retained for idempotent retry. */
  language: string;
  status: 'recording' | 'pending' | 'uploading' | 'synced' | 'error';
  error?: string | null;
  createdAt: number;
}

/** A durable, scoped mutation that can be retried after an offline failure. */
export interface LocalOutboxItem {
  id: string;
  kind: 'meeting-create' | 'meeting-metadata' | 'meeting-resume' | 'meeting-finish' | 'meeting-segment' | 'meeting-transcript' | 'meeting-summary' | 'metric';
  entityId: string;
  payload: string;
  createdAt: number;
  attempts: number;
  error?: string | null;
}

/** Counts locally stored records for the active account scope. */
export interface LocalStoreStats {
  /** Number of retained local dictation history records. */
  historyCount: number;
  /** Number of retained local snippets. */
  snippetCount: number;
  /** Number of retained local notes. */
  noteCount: number;
  /** Number of retained local meetings. */
  meetingCount: number;
}

/** A portable local-data export without credentials or absolute audio paths. */
export interface LocalDataExport {
  /** Export format revision. */
  version: 1;
  /** Unix epoch milliseconds when the export was generated. */
  exportedAt: number;
  /** Scoped local dictation history. */
  history: LocalHistoryEntry[];
  /** Scoped local snippets. */
  snippets: LocalSnippet[];
  /** Scoped local notes. */
  notes: LocalNote[];
  /** Scoped local meeting metadata without an audio location. */
  meetings: Array<Omit<LocalMeeting, 'audioPath'>>;
}
