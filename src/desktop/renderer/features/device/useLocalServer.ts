import { useEffect, useState } from 'react'

import type { LocalServerStatus, PublicSettings } from '../../../shared/contracts'
import { readLocalServer } from './connection'

/**
 * Tracks the live local server status. Settings snapshots seed it and progress events keep it
 * current between snapshots. Subscribing never starts or downloads anything.
 */
export function useLocalServer(settings: PublicSettings): LocalServerStatus {
  const snapshot = readLocalServer(settings)
  const [status, setStatus] = useState<LocalServerStatus>(snapshot)

  useEffect(() => {
    setStatus(snapshot)
  }, [snapshot])

  useEffect(() => window.whisperer.events.onLocalServerChanged(setStatus), [])

  return status
}
