import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import Database from 'better-sqlite3';

import type {
  LocalDataExport,
  LocalHistoryEntry,
  LocalMeeting,
  LocalMeetingSegment,
  LocalOutboxItem,
  LocalNote,
  LocalSnippet,
  LocalStoreOptions,
  LocalStoreScope,
  LocalStoreStats,
} from './models';

const SCHEMA_VERSION = 6;
const BUSY_TIMEOUT_MS = 5_000;

/** Represents a history row before conversion from SQLite values. */
interface HistoryRow {
  id: string;
  raw_text: string;
  text: string;
  created_at: number;
  duration_ms: number;
  language: string;
  app_name: string | null;
  pasted: number;
  status: string;
  dictionary_replacements: number;
}

/** Represents a snippet row before conversion from SQLite values. */
interface SnippetRow {
  id: string;
  shortcut: string;
  text: string;
  use_count: number;
  updated_at: number;
}

/** Represents a note row before conversion from SQLite values. */
interface NoteRow {
  id: string;
  title: string;
  content: string;
  summary: string;
  updated_at: number;
  pinned: number;
  sync_state: string;
}

/** Represents a meeting row before conversion from SQLite values. */
interface MeetingRow {
  id: string;
  title: string;
  created_at: number;
  ended_at: number | null;
  duration_ms: number;
  history_entry_ids: string;
  transcript: string;
  transcript_revision: number | null;
  summary: string;
  summary_revision: number | null;
  summary_source_revision: number | null;
  summary_stale: number;
  revision: number | null;
  transcript_status: string;
  summary_status: string;
  audio_relative_path: string | null;
  sync_state: string;
  error: string | null;
  status: string;
}

interface MeetingSegmentRow {
  id: string;
  meeting_id: string;
  audio_relative_path: string | null;
  duration_ms: number;
  content_type: string;
  language: string;
  status: LocalMeetingSegment['status'];
  error: string | null;
  created_at: number;
}

interface OutboxRow {
  id: string;
  kind: LocalOutboxItem['kind'];
  entity_id: string;
  payload: string;
  created_at: number;
  attempts: number;
  error: string | null;
}

/** Represents one count value returned by SQLite. */
interface CountRow {
  count: number;
}

/** Stores scoped desktop data in a local SQLite database without server synchronization. */
export class LocalStore {
  private readonly audioDirectory?: string;
  private readonly database: Database.Database;
  private scopeHash: string | null = null;

  /**
   * Opens and migrates a local SQLite database.
   *
   * Args:
   *   options: Database location and an optional explicitly enabled audio root.
   */
  public constructor(options: LocalStoreOptions) {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    this.audioDirectory = options.audioDirectory === undefined ? undefined : resolve(options.audioDirectory);
    this.database = new Database(options.databasePath);
    try {
      this.database.pragma('journal_mode = WAL');
      this.database.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
      this.database.pragma('foreign_keys = ON');
      this.migrate();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  /** Whether an account or device scope is attached. */
  public hasScope(): boolean { return this.scopeHash !== null; }

  /**
   * Sets the account scope that can read and write this database.
   *
   * Args:
   *   scope: Signed-in server and user identity, or null after sign-out.
   */
  public setScope(scope: LocalStoreScope | null): void {
    this.scopeHash = scope === null ? null : hashScope(scope);
  }

  /**
   * Returns the opaque per-account directory name for private local files.
   *
   * Returns:
   *   A hex hash that never reveals the server or user identifier.
   * Raises:
   *   Error: If the app is signed out and no local scope is active.
   */
  public scopeDirectory(): string {
    return this.requireScope();
  }

  /**
   * Returns the current SQLite schema revision for diagnostics and migration tests.
   *
   * Returns:
   *   The applied integer schema revision.
   */
  public getSchemaVersion(): number {
    return Number(this.database.pragma('user_version', { simple: true }));
  }

  /**
   * Adds or replaces a local dictation history entry in the active account scope.
   *
   * Args:
   *   entry: Complete local history data to persist.
   */
  public addHistory(entry: LocalHistoryEntry): void {
    const scopeHash = this.requireScope();
    this.database
      .prepare(
        `INSERT INTO history (
          scope_hash, id, raw_text, text, created_at, duration_ms, language, app_name, pasted, status, dictionary_replacements
        ) VALUES (
          @scopeHash, @id, @rawText, @text, @createdAt, @durationMs, @language, @appName, @pasted, @status, @dictionaryReplacements
        ) ON CONFLICT(scope_hash, id) DO UPDATE SET
          raw_text = excluded.raw_text,
          text = excluded.text,
          created_at = excluded.created_at,
          duration_ms = excluded.duration_ms,
          language = excluded.language,
          app_name = excluded.app_name,
          pasted = excluded.pasted,
          status = excluded.status,
          dictionary_replacements = excluded.dictionary_replacements`,
      )
      .run({ ...entry, dictionaryReplacements: entry.dictionaryReplacements ?? 0, pasted: Number(entry.pasted), scopeHash });
  }

  /**
   * Lists local dictation history for the active account, newest first.
   *
   * Returns:
   *   A detached array of scoped local history entries.
   */
  public listHistory(): LocalHistoryEntry[] {
    const scopeHash = this.requireScope();
    const rows = this.database
      .prepare(
        'SELECT id, raw_text, text, created_at, duration_ms, language, app_name, pasted, status, dictionary_replacements FROM history WHERE scope_hash = ? ORDER BY created_at DESC, id DESC',
      )
      .all(scopeHash) as HistoryRow[];
    return rows.map(mapHistoryRow);
  }

  /**
   * Deletes one local dictation history entry from the active account scope.
   *
   * Args:
   *   id: Identifier of the history entry to remove.
   * Returns:
   *   True when an entry was removed; false when it was absent.
   */
  public deleteHistory(id: string): boolean {
    return this.deleteById('history', id);
  }

  /**
   * Removes all local dictation history from the active account scope.
   *
   * Returns:
   *   The number of removed history entries.
   */
  public clearHistory(): number {
    const result = this.database.prepare('DELETE FROM history WHERE scope_hash = ?').run(this.requireScope());
    return result.changes;
  }

  /**
   * Adds or replaces a local text snippet in the active account scope.
   *
   * Args:
   *   snippet: Complete local snippet data to persist.
   */
  public saveSnippet(snippet: LocalSnippet): void {
    const scopeHash = this.requireScope();
    this.database
      .prepare(
        `INSERT INTO snippets (scope_hash, id, shortcut, text, use_count, updated_at)
         VALUES (@scopeHash, @id, @shortcut, @text, @useCount, @updatedAt)
         ON CONFLICT(scope_hash, id) DO UPDATE SET
           shortcut = excluded.shortcut,
           text = excluded.text,
           use_count = excluded.use_count,
           updated_at = excluded.updated_at`,
      )
      .run({ ...snippet, scopeHash });
  }

  /**
   * Lists local snippets for the active account, most recently updated first.
   *
   * Returns:
   *   A detached array of scoped local snippets.
   */
  public listSnippets(): LocalSnippet[] {
    const rows = this.database
      .prepare('SELECT id, shortcut, text, use_count, updated_at FROM snippets WHERE scope_hash = ? ORDER BY updated_at DESC, id DESC')
      .all(this.requireScope()) as SnippetRow[];
    return rows.map(mapSnippetRow);
  }

  /**
   * Deletes one local snippet from the active account scope.
   *
   * Args:
   *   id: Identifier of the snippet to remove.
   * Returns:
   *   True when a snippet was removed; false when it was absent.
   */
  public deleteSnippet(id: string): boolean {
    return this.deleteById('snippets', id);
  }

  /**
   * Adds or replaces a local note in the active account scope.
   *
   * Args:
   *   note: Complete local note data to persist.
   */
  public saveNote(note: LocalNote): void {
    const scopeHash = this.requireScope();
    this.database
      .prepare(
        `INSERT INTO notes (scope_hash, id, title, content, summary, updated_at, pinned, sync_state)
         VALUES (@scopeHash, @id, @title, @content, @summary, @updatedAt, @pinned, @syncState)
         ON CONFLICT(scope_hash, id) DO UPDATE SET
           title = excluded.title,
           content = excluded.content,
           summary = excluded.summary,
           updated_at = excluded.updated_at,
           pinned = excluded.pinned,
           sync_state = excluded.sync_state`,
      )
      .run({ ...note, pinned: Number(note.pinned), scopeHash });
  }

  /**
   * Lists local notes for the active account, pinned notes then recent notes first.
   *
   * Returns:
   *   A detached array of scoped local notes.
   */
  public listNotes(): LocalNote[] {
    const rows = this.database
      .prepare(
        'SELECT id, title, content, summary, updated_at, pinned, sync_state FROM notes WHERE scope_hash = ? ORDER BY pinned DESC, updated_at DESC, id DESC',
      )
      .all(this.requireScope()) as NoteRow[];
    return rows.map(mapNoteRow);
  }

  /**
   * Deletes one local note from the active account scope.
   *
   * Args:
   *   id: Identifier of the note to remove.
   * Returns:
   *   True when a note was removed; false when it was absent.
   */
  public deleteNote(id: string): boolean {
    return this.deleteById('notes', id);
  }

  /**
   * Adds or replaces a local meeting in the active account scope.
   *
   * Args:
   *   meeting: Complete local meeting metadata and optional explicitly enabled audio path.
   * Raises:
   *   Error: If an audio path is supplied without an opt-in directory or outside that directory.
   */
  public saveMeeting(meeting: LocalMeeting): void {
    const scopeHash = this.requireScope();
    const audioRelativePath = this.toAudioRelativePath(meeting.audioPath);
    this.database
      .prepare(
        `INSERT INTO meetings (
          scope_hash, id, title, created_at, ended_at, duration_ms, history_entry_ids,
          transcript, transcript_revision, summary, summary_revision, summary_source_revision,
          summary_stale, revision, transcript_status, summary_status, audio_relative_path,
          sync_state, error, status
        ) VALUES (
          @scopeHash, @id, @title, @createdAt, @endedAt, @durationMs, @historyEntryIds,
          @transcript, @transcriptRevision, @summary, @summaryRevision, @summarySourceRevision,
          @summaryStale, @revision, @transcriptStatus, @summaryStatus, @audioRelativePath,
          @syncState, @error, @status
        ) ON CONFLICT(scope_hash, id) DO UPDATE SET
          title = excluded.title, created_at = excluded.created_at, ended_at = excluded.ended_at,
          duration_ms = excluded.duration_ms, history_entry_ids = excluded.history_entry_ids,
          transcript = excluded.transcript, transcript_revision = excluded.transcript_revision,
          summary = excluded.summary, summary_revision = excluded.summary_revision,
          summary_source_revision = excluded.summary_source_revision, summary_stale = excluded.summary_stale,
          revision = excluded.revision, transcript_status = excluded.transcript_status,
          summary_status = excluded.summary_status,
          audio_relative_path = COALESCE(excluded.audio_relative_path, meetings.audio_relative_path),
          sync_state = excluded.sync_state, error = excluded.error, status = excluded.status`,
      )
      .run({
        ...meeting,
        audioRelativePath,
        endedAt: meeting.endedAt ?? null,
        error: meeting.error ?? null,
        historyEntryIds: JSON.stringify(meeting.historyEntryIds ?? []),
        revision: meeting.revision ?? null,
        scopeHash,
        summaryRevision: meeting.summaryRevision ?? null,
        summarySourceRevision: meeting.summarySourceRevision ?? null,
        summaryStale: Number(meeting.summaryStale ?? false),
        summaryStatus: meeting.summaryStatus ?? 'idle',
        syncState: meeting.syncState ?? 'local',
        transcriptRevision: meeting.transcriptRevision ?? null,
        transcriptStatus: meeting.transcriptStatus ?? 'idle',
      });
  }

  /**
   * Lists local meetings for the active account, newest first.
   *
   * Returns:
   *   A detached array of scoped local meeting metadata.
   */
  public listMeetings(): LocalMeeting[] {
    const rows = this.database
      .prepare(
        'SELECT id, title, created_at, ended_at, duration_ms, history_entry_ids, transcript, transcript_revision, summary, summary_revision, summary_source_revision, summary_stale, revision, transcript_status, summary_status, audio_relative_path, sync_state, error, status FROM meetings WHERE scope_hash = ? ORDER BY created_at DESC, id DESC',
      )
      .all(this.requireScope()) as MeetingRow[];
    return rows.map((row) => mapMeetingRow(row, this.audioDirectory));
  }

  /** Returns one scoped meeting cache record. */
  public getMeeting(id: string): LocalMeeting | null {
    const row = this.database.prepare(
      'SELECT id, title, created_at, ended_at, duration_ms, history_entry_ids, transcript, transcript_revision, summary, summary_revision, summary_source_revision, summary_stale, revision, transcript_status, summary_status, audio_relative_path, sync_state, error, status FROM meetings WHERE scope_hash = ? AND id = ?',
    ).get(this.requireScope(), id) as MeetingRow | undefined;
    return row ? mapMeetingRow(row, this.audioDirectory) : null;
  }

  /** Persists a separate immutable capture segment under a meeting. */
  public saveMeetingSegment(segment: LocalMeetingSegment): void {
    const audioRelativePath = this.toAudioRelativePath(segment.audioPath);
    this.database.prepare(
      `INSERT INTO meeting_segments (scope_hash, id, meeting_id, audio_relative_path, duration_ms, content_type, language, status, error, created_at)
       VALUES (@scopeHash, @id, @meetingId, @audioRelativePath, @durationMs, @contentType, @language, @status, @error, @createdAt)
       ON CONFLICT(scope_hash, id) DO UPDATE SET duration_ms = excluded.duration_ms, content_type = excluded.content_type, language = excluded.language,
       status = excluded.status, error = excluded.error, audio_relative_path = COALESCE(excluded.audio_relative_path, meeting_segments.audio_relative_path)`,
    ).run({ ...segment, audioRelativePath, error: segment.error ?? null, scopeHash: this.requireScope() });
  }

  /** Lists one meeting's separately retained capture segments oldest first. */
  public listMeetingSegments(meetingId: string): LocalMeetingSegment[] {
    const rows = this.database.prepare(
      'SELECT id, meeting_id, audio_relative_path, duration_ms, content_type, language, status, error, created_at FROM meeting_segments WHERE scope_hash = ? AND meeting_id = ? ORDER BY created_at ASC, id ASC',
    ).all(this.requireScope(), meetingId) as MeetingSegmentRow[];
    return rows.map((row) => mapMeetingSegmentRow(row, this.audioDirectory));
  }

  /** Lists this scope's segments still marked as recording, left behind by a crash or a quit. */
  public listRecordingSegments(): LocalMeetingSegment[] {
    const rows = this.database.prepare(
      "SELECT id, meeting_id, audio_relative_path, duration_ms, content_type, language, status, error, created_at FROM meeting_segments WHERE scope_hash = ? AND status = 'recording' ORDER BY created_at ASC, id ASC",
    ).all(this.requireScope()) as MeetingSegmentRow[];
    return rows.map((row) => mapMeetingSegmentRow(row, this.audioDirectory));
  }

  /** Removes a single local segment while keeping all other meeting segments untouched. */
  public deleteMeetingSegment(id: string): boolean {
    const result = this.database.prepare('DELETE FROM meeting_segments WHERE scope_hash = ? AND id = ?').run(this.requireScope(), id);
    return result.changes > 0;
  }

  /** Enqueues an idempotent scoped delivery item for later retry. */
  public enqueueOutbox(item: LocalOutboxItem): void {
    this.database.prepare(
      `INSERT INTO outbox (scope_hash, id, kind, entity_id, payload, created_at, attempts, error)
       VALUES (@scopeHash, @id, @kind, @entityId, @payload, @createdAt, @attempts, @error)
       ON CONFLICT(scope_hash, id) DO NOTHING`,
    ).run({ ...item, error: item.error ?? null, scopeHash: this.requireScope() });
  }

  /** Lists durable delivery items in acceptance order. */
  public listOutbox(): LocalOutboxItem[] {
    const rows = this.database.prepare(
      'SELECT id, kind, entity_id, payload, created_at, attempts, error FROM outbox WHERE scope_hash = ? ORDER BY created_at ASC, rowid ASC',
    ).all(this.requireScope()) as OutboxRow[];
    return rows.map((row) => ({ attempts: row.attempts, createdAt: row.created_at, entityId: row.entity_id, error: row.error, id: row.id, kind: row.kind, payload: row.payload }));
  }

  /** Removes an outbox item only after its authoritative operation succeeds. */
  public acknowledgeOutbox(id: string): void {
    this.database.prepare('DELETE FROM outbox WHERE scope_hash = ? AND id = ?').run(this.requireScope(), id);
  }

  /** Removes unsent operations for a deliberately discarded meeting or segment. */
  public discardOutboxForEntity(entityId: string): void {
    this.database.prepare('DELETE FROM outbox WHERE scope_hash = ? AND entity_id = ?').run(this.requireScope(), entityId);
  }

  /** Records a retry failure without losing the durable outbox item. */
  public failOutbox(id: string, error: string): void {
    this.database.prepare('UPDATE outbox SET attempts = attempts + 1, error = ? WHERE scope_hash = ? AND id = ?')
      .run(error.slice(0, 500), this.requireScope(), id);
  }

  /**
   * Deletes one local meeting from the active account scope.
   *
   * This only removes database metadata; it never deletes audio files.
   *
   * Args:
   *   id: Identifier of the meeting to remove.
   * Returns:
   *   True when a meeting was removed; false when it was absent.
   */
  public deleteMeeting(id: string): boolean {
    return this.deleteById('meetings', id);
  }

  /**
   * Counts local records in the active account scope without contacting a server.
   *
   * Returns:
   *   Scoped local counts for each persisted collection.
   */
  public getStats(): LocalStoreStats {
    const scopeHash = this.requireScope();
    return {
      historyCount: this.count('history', scopeHash),
      meetingCount: this.count('meetings', scopeHash),
      noteCount: this.count('notes', scopeHash),
      snippetCount: this.count('snippets', scopeHash),
    };
  }

  /**
   * Permanently deletes every row in the active scope, in one transaction. Other scopes stay.
   *
   * This removes database rows only; the caller deletes the scope's private audio directory.
   *
   * Returns:
   *   The erased scope's opaque directory name, so its audio files can be removed.
   * Raises:
   *   Error: If no local scope is active.
   */
  public eraseScope(): string {
    const scopeHash = this.requireScope();
    this.database.transaction(() => {
      for (const table of ['outbox', 'meeting_segments', 'meetings', 'notes', 'snippets', 'history']) {
        this.database.prepare(`DELETE FROM ${table} WHERE scope_hash = ?`).run(scopeHash);
      }
    })();
    // Rewrite the file so the deleted text does not linger in free pages or the WAL.
    this.database.exec('VACUUM');
    this.database.pragma('wal_checkpoint(TRUNCATE)');
    return scopeHash;
  }

  /**
   * Exports scoped local data without server credentials or absolute audio paths.
   *
   * Returns:
   *   A JSON-serializable local export object.
   */
  public exportData(): LocalDataExport {
    return {
      exportedAt: Date.now(),
      history: this.listHistory(),
      meetings: this.listMeetings().map(({ audioPath: _audioPath, ...meeting }) => meeting),
      notes: this.listNotes(),
      snippets: this.listSnippets(),
      version: 1,
    };
  }

  /**
   * Runs related local writes atomically in the active SQLite transaction.
   *
   * Args:
   *   operation: Synchronous work that reads or writes through this store.
   * Returns:
   *   The value returned by the operation.
   * Raises:
   *   Error: Any operation error after SQLite has rolled back its writes.
   */
  public transaction<T>(operation: () => T): T {
    return this.database.transaction(operation)();
  }

  /**
   * Closes the SQLite handle after the Electron main process stops using it.
   */
  public close(): void {
    this.database.close();
  }

  /** Applies ordered schema migrations using SQLite's user_version. */
  private migrate(): void {
    const version = this.getSchemaVersion();
    if (version > SCHEMA_VERSION) {
      throw new Error(`Unsupported local storage schema version: ${version}`);
    }
    if (version === SCHEMA_VERSION) {
      return;
    }

    this.database.transaction(() => {
      if (version < 1) {
        this.database.exec(`
          CREATE TABLE history (
            scope_hash TEXT NOT NULL,
            id TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            language TEXT NOT NULL,
            app_name TEXT,
            pasted INTEGER NOT NULL CHECK (pasted IN (0, 1)),
            status TEXT NOT NULL,
            PRIMARY KEY (scope_hash, id)
          );
          CREATE INDEX history_scope_created_at ON history (scope_hash, created_at DESC);

          CREATE TABLE snippets (
            scope_hash TEXT NOT NULL,
            id TEXT NOT NULL,
            shortcut TEXT NOT NULL,
            text TEXT NOT NULL,
            use_count INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (scope_hash, id)
          );
          CREATE INDEX snippets_scope_updated_at ON snippets (scope_hash, updated_at DESC);

          CREATE TABLE notes (
            scope_hash TEXT NOT NULL,
            id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            summary TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
            sync_state TEXT NOT NULL,
            PRIMARY KEY (scope_hash, id)
          );
          CREATE INDEX notes_scope_pinned_updated_at ON notes (scope_hash, pinned DESC, updated_at DESC);

          CREATE TABLE meetings (
            scope_hash TEXT NOT NULL,
            id TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            transcript TEXT NOT NULL,
            summary TEXT NOT NULL,
            audio_relative_path TEXT,
            status TEXT NOT NULL,
            PRIMARY KEY (scope_hash, id)
          );
          CREATE INDEX meetings_scope_created_at ON meetings (scope_hash, created_at DESC);
        `);
        this.database.pragma('user_version = 1');
      }
      if (version < 2) {
        // Version 1 kept only raw text; older rows use it as their final text.
        this.database.exec(`ALTER TABLE history ADD COLUMN text TEXT NOT NULL DEFAULT '';
          UPDATE history SET text = raw_text WHERE text = '';`);
        this.database.pragma('user_version = 2');
      }
      if (version < 3) {
        // Keep existing meeting rows intact while adding the authoritative cache fields.
        this.database.exec(`
          ALTER TABLE meetings ADD COLUMN ended_at INTEGER;
          ALTER TABLE meetings ADD COLUMN history_entry_ids TEXT NOT NULL DEFAULT '[]';
          ALTER TABLE meetings ADD COLUMN transcript_revision INTEGER;
          ALTER TABLE meetings ADD COLUMN summary_revision INTEGER;
          ALTER TABLE meetings ADD COLUMN summary_source_revision INTEGER;
          ALTER TABLE meetings ADD COLUMN summary_stale INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE meetings ADD COLUMN revision INTEGER;
          ALTER TABLE meetings ADD COLUMN transcript_status TEXT NOT NULL DEFAULT 'idle';
          ALTER TABLE meetings ADD COLUMN summary_status TEXT NOT NULL DEFAULT 'idle';
          ALTER TABLE meetings ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'local';
          ALTER TABLE meetings ADD COLUMN error TEXT;
        `);
        this.database.pragma('user_version = 3');
      }
      if (version < 4) {
        this.database.exec(`
          CREATE TABLE meeting_segments (
            scope_hash TEXT NOT NULL, id TEXT NOT NULL, meeting_id TEXT NOT NULL,
            audio_relative_path TEXT, duration_ms INTEGER NOT NULL, content_type TEXT NOT NULL,
            status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL,
            PRIMARY KEY (scope_hash, id)
          );
          CREATE INDEX meeting_segments_scope_meeting_created ON meeting_segments (scope_hash, meeting_id, created_at ASC);
          CREATE TABLE outbox (
            scope_hash TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, entity_id TEXT NOT NULL,
            payload TEXT NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
            PRIMARY KEY (scope_hash, id)
          );
          CREATE INDEX outbox_scope_created ON outbox (scope_hash, created_at ASC);
        `);
        this.database.pragma('user_version = 4');
      }
      if (version < 5) {
        this.database.exec("ALTER TABLE history ADD COLUMN dictionary_replacements INTEGER NOT NULL DEFAULT 0;");
        this.database.pragma('user_version = 5');
      }
      if (version < 6) {
        this.database.exec("ALTER TABLE meeting_segments ADD COLUMN language TEXT NOT NULL DEFAULT 'en';");
        this.database.pragma('user_version = 6');
      }
    })();
  }

  /**
   * Requires the caller to have selected an account scope.
   *
   * Returns:
   *   The hashed scope key used in database predicates.
   * Raises:
   *   Error: If the app is signed out and no local scope is active.
   */
  private requireScope(): string {
    if (this.scopeHash === null) {
      throw new Error('No active local storage scope');
    }
    return this.scopeHash;
  }

  /**
   * Deletes an identified row from an allowed scoped table.
   *
   * Args:
   *   table: Storage table selected by this class, never caller-provided SQL.
   *   id: Identifier of the row to remove.
   * Returns:
   *   True when a row was removed; false when it was absent.
   */
  private deleteById(table: 'history' | 'snippets' | 'notes' | 'meetings', id: string): boolean {
    const result = this.database.prepare(`DELETE FROM ${table} WHERE scope_hash = ? AND id = ?`).run(this.requireScope(), id);
    return result.changes > 0;
  }

  /**
   * Counts rows in an allowed table for the supplied scope hash.
   *
   * Args:
   *   table: Storage table selected by this class, never caller-provided SQL.
   *   scopeHash: Hashed active account key.
   * Returns:
   *   Number of scoped rows in the table.
   */
  private count(table: 'history' | 'snippets' | 'notes' | 'meetings', scopeHash: string): number {
    const row = this.database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE scope_hash = ?`).get(scopeHash) as CountRow;
    return row.count;
  }

  /**
   * Converts an explicitly allowed absolute audio location into database metadata.
   *
   * Args:
   *   audioPath: Optional absolute path supplied by the caller.
   * Returns:
   *   A relative path to store, or null when no audio is associated.
   * Raises:
   *   Error: If audio storage is disabled or the path is outside its configured root.
   */
  private toAudioRelativePath(audioPath: string | undefined): string | null {
    if (audioPath === undefined) {
      return null;
    }
    if (this.audioDirectory === undefined) {
      throw new Error('Meeting audio storage is not enabled');
    }
    if (!isAbsolute(audioPath)) {
      throw new Error('Audio path must be absolute');
    }
    const resolvedPath = resolve(audioPath);
    const relativePath = relative(this.audioDirectory, resolvedPath);
    if (
      relativePath === '' ||
      relativePath === '..' ||
      relativePath.startsWith('../') ||
      relativePath.startsWith('..\\') ||
      isAbsolute(relativePath)
    ) {
      throw new Error('Audio path must be inside the configured audio directory');
    }
    return relativePath;
  }
}

/**
 * Hashes an account scope before it becomes a database partition key.
 *
 * Args:
 *   scope: Signed-in server and user identity.
 * Returns:
 *   A deterministic SHA-256 scope key that does not retain raw account values in tables.
 * Raises:
 *   Error: If either identity component is blank.
 */
function hashScope(scope: LocalStoreScope): string {
  if (scope.server.trim() === '' || scope.userId.trim() === '') {
    throw new Error('Local storage scope requires a server and user id');
  }
  return createHash('sha256').update(scope.server).update('\u0000').update(scope.userId).digest('hex');
}

/**
 * Maps a SQLite history row into the public local model.
 *
 * Args:
 *   row: SQLite result row.
 * Returns:
 *   A typed local history entry.
 */
function mapHistoryRow(row: HistoryRow): LocalHistoryEntry {
  return {
    appName: row.app_name,
    createdAt: row.created_at,
    dictionaryReplacements: row.dictionary_replacements,
    durationMs: row.duration_ms,
    id: row.id,
    language: row.language,
    pasted: row.pasted === 1,
    rawText: row.raw_text,
    status: row.status,
    text: row.text,
  };
}

/**
 * Maps a SQLite snippet row into the public local model.
 *
 * Args:
 *   row: SQLite result row.
 * Returns:
 *   A typed local snippet.
 */
function mapSnippetRow(row: SnippetRow): LocalSnippet {
  return {
    id: row.id,
    shortcut: row.shortcut,
    text: row.text,
    updatedAt: row.updated_at,
    useCount: row.use_count,
  };
}

/**
 * Maps a SQLite note row into the public local model.
 *
 * Args:
 *   row: SQLite result row.
 * Returns:
 *   A typed local note.
 */
function mapNoteRow(row: NoteRow): LocalNote {
  return {
    content: row.content,
    id: row.id,
    pinned: row.pinned === 1,
    summary: row.summary,
    syncState: row.sync_state,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

/**
 * Maps a SQLite meeting row into the public local model.
 *
 * Args:
 *   row: SQLite result row.
 *   audioDirectory: Explicitly enabled local audio directory, when configured.
 * Returns:
 *   A typed local meeting with an audio path only when its metadata is safe to reconstruct.
 */
function mapMeetingRow(row: MeetingRow, audioDirectory: string | undefined): LocalMeeting {
  let historyEntryIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.history_entry_ids);
    if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) historyEntryIds = parsed;
  } catch { /* Invalid legacy cache metadata is treated as empty. */ }
  const meeting: LocalMeeting = {
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    endedAt: row.ended_at,
    error: row.error,
    historyEntryIds,
    id: row.id,
    revision: row.revision ?? undefined,
    status: row.status,
    summary: row.summary,
    summaryRevision: row.summary_revision ?? undefined,
    summarySourceRevision: row.summary_source_revision,
    summaryStale: row.summary_stale === 1,
    summaryStatus: row.summary_status,
    syncState: row.sync_state,
    title: row.title,
    transcript: row.transcript,
    transcriptRevision: row.transcript_revision ?? undefined,
    transcriptStatus: row.transcript_status,
  };
  if (audioDirectory !== undefined && row.audio_relative_path !== null) {
    meeting.audioPath = resolve(audioDirectory, row.audio_relative_path);
  }
  return meeting;
}

/** Maps a scoped segment row and reconstructs its path only under the configured root. */
function mapMeetingSegmentRow(row: MeetingSegmentRow, audioDirectory: string | undefined): LocalMeetingSegment {
  const segment: LocalMeetingSegment = {
    contentType: row.content_type, createdAt: row.created_at, durationMs: row.duration_ms,
    error: row.error, id: row.id, language: row.language, meetingId: row.meeting_id, status: row.status,
  };
  if (audioDirectory !== undefined && row.audio_relative_path !== null) segment.audioPath = resolve(audioDirectory, row.audio_relative_path);
  return segment;
}
