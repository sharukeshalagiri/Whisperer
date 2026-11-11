import { useCallback, useEffect, useState } from 'react'

/** Loads a local content collection and exposes explicit reload and replacement operations. */
export function useContentList<T>(
  load: () => Promise<T[]>,
  subscribe?: (listener: () => void) => () => void,
) {
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  /** Refreshes the collection and leaves the prior result visible when it fails. */
  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(undefined)
    try {
      setItems(await load())
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setIsLoading(false)
    }
  }, [load])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return subscribe?.(() => {
      void reload()
    })
  }, [reload, subscribe])

  return { error, isLoading, items, reload, setItems }
}

/** Converts an unknown rejected value into a useful screen-reader-safe message. */
export function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The requested local data could not be loaded.'
}
