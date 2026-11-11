import type {
  BootstrapState,
  DictionaryEntry,
  DictionarySaveInput,
  HistoryEntry,
  Meeting,
  MeetingSaveInput,
  Note,
  NoteSaveInput,
  PublicSettings,
  PublicSettingsUpdate,
  Snippet,
  SnippetSaveInput,
  Unsubscribe,
} from '../../../shared/contracts'

export type {
  DictionaryEntry,
  DictionarySaveInput,
  HistoryEntry,
  Meeting,
  MeetingSaveInput,
  Note,
  NoteSaveInput,
  Snippet,
  SnippetSaveInput,
  Unsubscribe,
}

/** Subscribes to main-process note invalidations. */
export function onNotesChanged(listener: () => void): Unsubscribe {
  return window.whisperer.events.onNotesChanged(listener)
}

/** Subscribes to main-process history invalidations. */
export function onHistoryChanged(listener: () => void): Unsubscribe {
  return window.whisperer.events.onHistoryChanged(listener)
}

/** Lists locally stored notes. */
export function listNotes(): Promise<Note[]> {
  return window.whisperer.notes.list()
}

/** Persists a local note. */
export function saveNote(note: NoteSaveInput): Promise<Note> {
  return window.whisperer.notes.save(note)
}

/** Removes a local note. */
export function deleteNote(id: string): Promise<void> {
  return window.whisperer.notes.delete(id)
}

/** Produces a summary after the caller has persisted its current draft. */
export function summarizeNote(id: string): Promise<Note> {
  return window.whisperer.notes.summarize(id)
}

/** Opens the standalone scratchpad window, optionally focused on a note. */
export function openNote(id?: string): Promise<void> {
  return window.whisperer.notes.open(id)
}

/** Reads renderer-safe settings and capabilities required by the Scratchpad landing. */
export function bootstrapScratchpad(): Promise<BootstrapState> {
  return window.whisperer.bootstrap()
}

/** Persists only the desktop preferences owned by the Scratchpad landing. */
export function updateScratchpadSettings(
  partial: Pick<PublicSettingsUpdate, 'scratchpadInBar' | 'scratchpadShortcut'>,
): Promise<PublicSettings> {
  return window.whisperer.settings.update(partial)
}

/** Copies note text through the narrow desktop clipboard bridge. */
export function copyNoteText(text: string): Promise<void> {
  return window.whisperer.clipboard.copy(text)
}

/** Toggles the standalone Scratchpad window maximized state. */
export function maximizeCurrentWindow(): Promise<void> {
  return window.whisperer.window.maximize().then(() => undefined)
}

/** Closes the current content window through the narrow host capability. */
export function closeCurrentWindow(): Promise<void> {
  return window.whisperer.window.close()
}

/** Lists local dictation history. */
export function listHistory(): Promise<HistoryEntry[]> {
  return window.whisperer.history.list()
}

/** Deletes one local dictation record. */
export function deleteHistoryEntry(id: string): Promise<void> {
  return window.whisperer.history.delete(id)
}

/** Deletes all local dictation records. */
export function clearHistory(): Promise<void> {
  return window.whisperer.history.clear()
}

/** Copies one local dictation record through the desktop host. */
export function copyHistoryEntry(id: string): Promise<void> {
  return window.whisperer.history.copy(id)
}

/** Lists personal dictionary entries. */
export function listDictionary(): Promise<DictionaryEntry[]> {
  return window.whisperer.dictionary.list()
}

/** Saves a personal dictionary entry. */
export function saveDictionaryEntry(entry: DictionarySaveInput): Promise<DictionaryEntry> {
  return window.whisperer.dictionary.save(entry)
}

/** Deletes a personal dictionary entry. */
export function deleteDictionaryEntry(id: string): Promise<void> {
  return window.whisperer.dictionary.delete(id)
}

/** Lists local text snippets. */
export function listSnippets(): Promise<Snippet[]> {
  return window.whisperer.snippets.list()
}

/** Saves a local text snippet. */
export function saveSnippet(snippet: SnippetSaveInput & Pick<Snippet, 'text'>): Promise<Snippet> {
  return window.whisperer.snippets.save(snippet)
}

/** Deletes a local text snippet. */
export function deleteSnippet(id: string): Promise<void> {
  return window.whisperer.snippets.delete(id)
}

/** Subscribes to scoped local-meeting invalidations from the desktop host. */
export function onMeetingsChanged(listener: () => void): Unsubscribe {
  return window.whisperer.events.onMeetingsChanged(listener)
}

/** Lists locally held meeting metadata. */
export function listMeetings(): Promise<Meeting[]> {
  return window.whisperer.meetings.list()
}

/** Saves only locally supported meeting metadata. */
export function saveMeeting(meeting: MeetingSaveInput): Promise<Meeting> {
  return window.whisperer.meetings.save(meeting)
}

/** Deletes local meeting metadata. */
export function deleteMeeting(id: string): Promise<void> {
  return window.whisperer.meetings.delete(id)
}

/** Opens the native picker to import local audio as a meeting, or returns null when cancelled. */
export function importMeetingAudio(): Promise<Meeting | null> {
  return window.whisperer.meetings.importAudio()
}

/** Exports a locally retained meeting-audio artifact through the desktop host. */
export function exportMeetingAudio(id: string): Promise<void> {
  return window.whisperer.meetings.exportAudio(id)
}
