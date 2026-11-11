import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, test } from 'vitest';

import { LocalStore } from './LocalStore';
import type { LocalStoreScope } from './models';

const scopeA: LocalStoreScope = {
  server: 'https://api.example.test',
  userId: 'user-a',
};

const scopeB: LocalStoreScope = {
  server: 'https://api.example.test',
  userId: 'user-b',
};

/** Tracks stores and their temporary directories for test cleanup. */
interface TestStore {
  directory: string;
  store: LocalStore;
}

const testStores: TestStore[] = [];

/** Creates a LocalStore backed by an isolated temporary database. */
function createTestStore(options: { audioDirectory?: string } = {}): LocalStore {
  const directory = mkdtempSync(join(tmpdir(), 'whisperer-local-store-'));
  const store = new LocalStore({
    databasePath: join(directory, 'desktop.sqlite'),
    ...options,
  });
  testStores.push({ directory, store });
  return store;
}

afterEach(() => {
  for (const testStore of testStores.splice(0)) {
    testStore.store.close();
    rmSync(testStore.directory, { force: true, recursive: true });
  }
});

describe('LocalStore', () => {
  test('upgrades version 1 history so final text defaults to the raw transcript', () => {
    const directory = mkdtempSync(join(tmpdir(), 'whisperer-local-store-v1-'));
    const databasePath = join(directory, 'desktop.sqlite');
    const legacy = new Database(databasePath);
    legacy.exec(`CREATE TABLE history (scope_hash TEXT NOT NULL, id TEXT NOT NULL, raw_text TEXT NOT NULL, created_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL, language TEXT NOT NULL, app_name TEXT, pasted INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY (scope_hash, id));
      CREATE TABLE snippets (scope_hash TEXT, id TEXT, shortcut TEXT, text TEXT, use_count INTEGER, updated_at INTEGER);
      CREATE TABLE notes (scope_hash TEXT, id TEXT, title TEXT, content TEXT, summary TEXT, updated_at INTEGER, pinned INTEGER, sync_state TEXT);
      CREATE TABLE meetings (scope_hash TEXT, id TEXT, title TEXT, created_at INTEGER, duration_ms INTEGER, transcript TEXT, summary TEXT, audio_relative_path TEXT, status TEXT);
      PRAGMA user_version = 1;`);
    const scopeHash = createHash('sha256').update(scopeA.server).update('\u0000').update(scopeA.userId).digest('hex');
    legacy.prepare('INSERT INTO history VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(scopeHash, 'legacy', 'Legacy words', 1, 2, 'en', null, 0, 'completed');
    legacy.close();
    const store = new LocalStore({ databasePath });
    testStores.push({ directory, store });
    store.setScope(scopeA);
    store.addHistory({ id: 'new', rawText: 'raw words', text: 'Final words.', createdAt: 2, durationMs: 1, language: 'en', appName: null, pasted: false, status: 'completed' });

    expect(store.getSchemaVersion()).toBe(6);
    expect(store.listHistory()[0]).toMatchObject({ rawText: 'raw words', text: 'Final words.' });
    expect(store.listHistory()[1]).toMatchObject({ id: 'legacy', rawText: 'Legacy words', text: 'Legacy words' });
  });

  test('migrates an empty database and uses local scoped statistics', () => {
    const store = createTestStore();
    store.setScope(scopeA);

    expect(store.getSchemaVersion()).toBe(6);
    expect(store.getStats()).toEqual({
      historyCount: 0,
      meetingCount: 0,
      noteCount: 0,
      snippetCount: 0,
    });
  });

  test('reopens a migrated database without losing scoped data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'whisperer-local-store-reopen-'));
    const databasePath = join(directory, 'desktop.sqlite');
    const firstStore = new LocalStore({ databasePath });
    firstStore.setScope(scopeA);
    firstStore.addHistory({
      appName: null,
      createdAt: 100,
      durationMs: 1,
      id: 'persisted-history',
      language: 'en',
      pasted: false,
      rawText: 'survives migration check',
      text: 'survives migration check',
      status: 'complete',
    });
    firstStore.close();

    const reopenedStore = new LocalStore({ databasePath });
    testStores.push({ directory, store: reopenedStore });
    reopenedStore.setScope(scopeA);

    expect(reopenedStore.getSchemaVersion()).toBe(6);
    expect(reopenedStore.listHistory()).toMatchObject([{ id: 'persisted-history' }]);
  });

  test('adds, lists, deletes, and clears only the active scope history', () => {
    const store = createTestStore();
    store.setScope(scopeA);
    store.addHistory({
      appName: 'Editor',
      createdAt: 100,
      durationMs: 35,
      id: 'history-a',
      language: 'en',
      pasted: true,
      rawText: 'first local dictation',
      text: 'first local dictation',
      status: 'complete',
    });
    store.setScope(scopeB);
    store.addHistory({
      appName: null,
      createdAt: 200,
      durationMs: 40,
      id: 'history-a',
      language: 'en',
      pasted: false,
      rawText: 'second local dictation',
      text: 'second local dictation',
      status: 'complete',
    });

    expect(store.listHistory()).toMatchObject([{ id: 'history-a', rawText: 'second local dictation' }]);
    expect(store.deleteHistory('history-a')).toBe(true);
    expect(store.clearHistory()).toBe(0);

    store.setScope(scopeA);
    expect(store.listHistory()).toMatchObject([{ id: 'history-a', rawText: 'first local dictation' }]);
    expect(store.clearHistory()).toBe(1);
    expect(store.listHistory()).toEqual([]);
  });

  test('keeps notes, snippets, and meetings inside the active account scope', () => {
    const store = createTestStore();
    store.setScope(scopeA);
    store.saveNote({
      content: 'draft body',
      id: 'note-1',
      pinned: true,
      summary: 'draft',
      syncState: 'local',
      title: 'A draft',
      updatedAt: 100,
    });
    store.saveSnippet({
      id: 'snippet-1',
      shortcut: 'addr',
      text: '123 Main Street',
      updatedAt: 100,
      useCount: 3,
    });
    store.saveMeeting({
      createdAt: 100,
      durationMs: 1200,
      id: 'meeting-1',
      status: 'complete',
      summary: 'summary',
      title: 'Planning',
      transcript: 'transcript',
    });

    store.setScope(scopeB);
    expect(store.listNotes()).toEqual([]);
    expect(store.listSnippets()).toEqual([]);
    expect(store.listMeetings()).toEqual([]);

    store.setScope(scopeA);
    expect(store.listNotes()).toMatchObject([{ id: 'note-1', pinned: true }]);
    expect(store.listSnippets()).toMatchObject([{ id: 'snippet-1', shortcut: 'addr' }]);
    expect(store.listMeetings()).toMatchObject([{ id: 'meeting-1', title: 'Planning' }]);
    expect(store.deleteNote('note-1')).toBe(true);
    expect(store.deleteSnippet('snippet-1')).toBe(true);
    expect(store.deleteMeeting('meeting-1')).toBe(true);
  });

  test('erases every row in the active scope and leaves other scopes untouched', () => {
    const store = createTestStore();
    const seed = (): void => {
      store.addHistory({ appName: null, createdAt: 100, durationMs: 1, id: 'h', language: 'en', pasted: false, rawText: 'r', text: 't', status: 'complete' });
      store.saveNote({ content: 'c', id: 'n', pinned: false, summary: '', syncState: 'local', title: 't', updatedAt: 100 });
      store.saveSnippet({ id: 's', shortcut: 'x', text: 'y', updatedAt: 100, useCount: 0 });
      store.saveMeeting({ createdAt: 100, durationMs: 1, id: 'm', status: 'complete', summary: '', title: 't', transcript: 'secret' });
      store.saveMeetingSegment({ contentType: 'audio/webm', createdAt: 100, durationMs: 1, id: 'seg', language: 'en', meetingId: 'm', status: 'pending' });
      store.enqueueOutbox({ attempts: 0, createdAt: 100, entityId: 'm', id: 'o', kind: 'meeting-create', payload: '{}' });
    };
    store.setScope(scopeA);
    seed();
    store.setScope(scopeB);
    seed();
    const directoryB = store.scopeDirectory();

    expect(store.eraseScope()).toBe(directoryB);
    expect(store.getStats()).toEqual({ historyCount: 0, meetingCount: 0, noteCount: 0, snippetCount: 0 });
    expect(store.listOutbox()).toEqual([]);
    expect(store.listMeetingSegments('m')).toEqual([]);

    store.setScope(scopeA);
    expect(store.getStats()).toEqual({ historyCount: 1, meetingCount: 1, noteCount: 1, snippetCount: 1 });
    expect(store.listOutbox()).toHaveLength(1);
    expect(store.listMeetingSegments('m')).toHaveLength(1);

    store.setScope(null);
    expect(() => store.eraseScope()).toThrow('No active local storage scope');
  });

  test('leaves no erased text in the database file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'whisperer-local-store-'));
    const databasePath = join(directory, 'desktop.sqlite');
    const store = new LocalStore({ databasePath });
    testStores.push({ directory, store });
    store.setScope(scopeA);
    store.saveNote({ content: 'UNIQUE-ERASE-MARKER '.repeat(200), id: 'n', pinned: false, summary: '', syncState: 'local', title: 't', updatedAt: 1 });
    store.eraseScope();
    const bytes = readFileSync(databasePath).toString('latin1') + (existsSync(`${databasePath}-wal`) ? readFileSync(`${databasePath}-wal`).toString('latin1') : '');
    expect(bytes).not.toContain('UNIQUE-ERASE-MARKER');
  });

  test('does not expose account data when the scope is cleared', () => {
    const store = createTestStore();
    store.setScope(scopeA);
    store.addHistory({
      appName: null,
      createdAt: 100,
      durationMs: 1,
      id: 'history-a',
      language: 'en',
      pasted: false,
      rawText: 'private dictation',
      text: 'private dictation',
      status: 'complete',
    });
    store.setScope(null);

    expect(() => store.listHistory()).toThrow('No active local storage scope');

    store.setScope(scopeA);
    expect(store.listHistory()).toHaveLength(1);
  });

  test('rolls back all locally scoped writes when a transaction fails', () => {
    const store = createTestStore();
    store.setScope(scopeA);

    expect(() =>
      store.transaction(() => {
        store.addHistory({
          appName: null,
          createdAt: 100,
          durationMs: 1,
          id: 'history-a',
          language: 'en',
          pasted: false,
          rawText: 'discarded dictation',
      text: 'discarded dictation',
          status: 'complete',
        });
        throw new Error('abort');
      }),
    ).toThrow('abort');

    expect(store.listHistory()).toEqual([]);
  });

  test('stores opt-in meeting audio as safe relative metadata and omits it from exports', () => {
    const directory = mkdtempSync(join(tmpdir(), 'whisperer-local-store-audio-'));
    const audioDirectory = join(directory, 'audio');
    const store = new LocalStore({
      audioDirectory,
      databasePath: join(directory, 'desktop.sqlite'),
    });
    testStores.push({ directory, store });
    store.setScope(scopeA);
    store.saveMeeting({
      audioPath: join(audioDirectory, 'meeting-1.wav'),
      createdAt: 100,
      durationMs: 1200,
      id: 'meeting-1',
      status: 'complete',
      summary: 'summary',
      title: 'Planning',
      transcript: 'transcript',
    });

    expect(store.listMeetings()).toMatchObject([{ audioPath: join(audioDirectory, 'meeting-1.wav') }]);
    expect(store.exportData().meetings).toEqual([
      expect.not.objectContaining({ audioPath: expect.any(String) }),
    ]);
    expect(() =>
      store.saveMeeting({
        audioPath: join(directory, 'outside.wav'),
        createdAt: 200,
        durationMs: 1,
        id: 'outside',
        status: 'complete',
        summary: '',
        title: 'Outside',
        transcript: '',
      }),
    ).toThrow('Audio path must be inside the configured audio directory');
  });
});
