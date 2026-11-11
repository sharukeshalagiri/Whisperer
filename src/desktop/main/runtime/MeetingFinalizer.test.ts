import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { LocalStore } from '../storage/LocalStore';
import { cancelCaptureRecords, finalizeCapture, recoverInterruptedMeetings } from './MeetingFinalizer';

const directories: string[] = [];
const stores: LocalStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A scoped store with an audio root and a recording meeting whose file holds `bytes` bytes. */
function recordingMeeting(bytes: number) {
  const directory = mkdtempSync(join(tmpdir(), 'whisperer-finalize-'));
  directories.push(directory);
  const audio = join(directory, 'meeting-audio');
  mkdirSync(audio);
  const store = new LocalStore({ databasePath: join(directory, 'desktop.sqlite'), audioDirectory: audio });
  stores.push(store);
  store.setScope({ server: 'https://api.example.test', userId: 'u' });
  const file = join(audio, 'm-s.webm');
  writeFileSync(file, Buffer.alloc(bytes, 1));
  store.saveMeeting({ id: 'm', title: 'Standup', createdAt: 1_000, durationMs: 0, transcript: '', summary: '', status: 'recording', audioPath: file, syncState: 'pending' });
  store.saveMeetingSegment({ id: 's', meetingId: 'm', audioPath: file, contentType: 'audio/webm', createdAt: 1_000, durationMs: 0, language: 'en', status: 'recording' });
  const queued: string[] = [];
  const queue = { queueSegment: (meeting: string, segment: string) => queued.push(`segment:${meeting}/${segment}`), queueFinish: (meeting: string) => queued.push(`finish:${meeting}`) };
  return { store, file, queue, queued };
}

describe('finalizeCapture', () => {
  test('keeps the audio and queues the upload of a capture that ended without Stop', () => {
    const { store, file, queue, queued } = recordingMeeting(4096);
    finalizeCapture(store, queue, { id: 'm', title: 'Standup', file, bytes: 4096, createdAt: 1_000, segmentId: 's' }, 61_000, 'audio/webm', 'en', 62_000);
    expect(store.getMeeting('m')).toMatchObject({ status: 'complete', durationMs: 61_000, endedAt: 62_000 });
    expect(store.listMeetingSegments('m')[0]).toMatchObject({ status: 'pending', durationMs: 61_000 });
    expect(statSync(file).size).toBe(4096);
    expect(queued).toEqual(['segment:m/s', 'finish:m']);
  });
});

describe('recoverInterruptedMeetings', () => {
  test('finishes a segment a crash left recording, using the file as the record', () => {
    const { store, file, queue, queued } = recordingMeeting(2048);
    const discarded: string[] = [];
    const recovered = recoverInterruptedMeetings(store, queue, () => ({ size: 2048, modifiedAt: 31_000 }), (meeting) => discarded.push(meeting));
    expect(recovered).toEqual(['m']);
    expect(discarded).toEqual([]);
    expect(store.listRecordingSegments()).toEqual([]);
    expect(store.getMeeting('m')).toMatchObject({ status: 'complete', durationMs: 30_000 });
    expect(statSync(file).size).toBe(2048);
    expect(queued).toEqual(['segment:m/s', 'finish:m']);
  });

  test('discards a segment with no audio instead of uploading it', () => {
    const { store, queue, queued } = recordingMeeting(0);
    const discarded: string[] = [];
    recoverInterruptedMeetings(store, queue, () => ({ size: 0, modifiedAt: 2_000 }), (meeting, segment) => discarded.push(`${meeting}/${segment}`));
    expect(discarded).toEqual(['m/s']);
    expect(queued).toEqual([]);
  });
});

describe('cancelCaptureRecords', () => {
  test('a cancelled resume closes the meeting on the server again and keeps earlier audio', () => {
    const { store, file, queue, queued } = recordingMeeting(1024);
    store.saveMeetingSegment({ id: 'earlier', meetingId: 'm', audioPath: file, contentType: 'audio/webm', createdAt: 500, durationMs: 1000, language: 'en', status: 'synced' });
    const removed = cancelCaptureRecords(store, queue, { id: 'm', title: 'Standup', file, bytes: 1024, createdAt: 1_000, segmentId: 's' });
    expect(removed).toBe(false);
    expect(store.listMeetingSegments('m').map((segment) => segment.id)).toEqual(['earlier']);
    expect(store.getMeeting('m')?.status).toBe('complete');
    expect(queued).toEqual(['finish:m']);
  });

  test('a cancelled new meeting disappears with its queued work', () => {
    const { store, file, queue, queued } = recordingMeeting(1024);
    const removed = cancelCaptureRecords(store, queue, { id: 'm', title: 'Standup', file, bytes: 1024, createdAt: 1_000, segmentId: 's' });
    expect(removed).toBe(true);
    expect(store.getMeeting('m')).toBeNull();
    expect(queued).toEqual([]);
  });
});
