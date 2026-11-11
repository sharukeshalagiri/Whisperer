import type { Note } from '../../../shared/contracts'

/** Returns concise, user-facing copy for a note's synchronization state. */
export function syncStateLabel(syncState: Note['syncState']): string {
  switch (syncState) {
    case 'pending': return 'Sync pending'
    case 'error': return 'Sync error'
    case 'local': return 'Local only'
    case 'synced': return 'Synced'
  }
}
