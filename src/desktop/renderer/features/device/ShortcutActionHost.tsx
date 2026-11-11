import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

import type { TransformReview } from '../../../shared/contracts'
import { TextTransformationDialog } from '../../components/TextTransformationDialog'

/** Hosts native shortcut review sessions without ever reading or replacing native selections. */
export function ShortcutActionHost(): ReactElement | null {
  const [review, setReview] = useState<TransformReview | null>(null)
  const [notice, setNotice] = useState<string>()
  const [autoGeneratingId, setAutoGeneratingId] = useState<string>()
  const [generationError, setGenerationError] = useState<string>()
  const generating = useRef(new Set<string>())

  useEffect(() => {
    const unsubscribeShortcut = window.whisperer.events.onShortcutAction((action) => {
      if (action === 'startMeeting') window.location.hash = '#/meetings'
    })
    const unsubscribeReview = window.whisperer.events.onTransformReview((next) => {
      setNotice(undefined)
      setGenerationError(undefined)
      setReview(next)
      if (next.proposal !== null || generating.current.has(next.sessionId)) return
      generating.current.add(next.sessionId)
      setAutoGeneratingId(next.sessionId)
      void window.whisperer.transformations.generate(next.sessionId).then((generated) => {
        setReview((current) => current?.sessionId === generated.sessionId ? generated : current)
      }).catch((reason) => {
        setGenerationError(reason instanceof Error ? reason.message : 'The Transform proposal could not be generated.')
      }).finally(() => { generating.current.delete(next.sessionId); setAutoGeneratingId((current) => current === next.sessionId ? undefined : current) })
    })
    return () => { unsubscribeShortcut(); unsubscribeReview() }
  }, [])

  if (notice) return <p className="ui-alert shortcut-action-notice" role="status" onClick={() => setNotice(undefined)}>{notice}</p>
  if (!review) return null
  return <TextTransformationDialog
    onAccept={(sessionId: string) => window.whisperer.transformations.accept(sessionId)}
    onClose={async (sessionId: string) => { await window.whisperer.transformations.reject(sessionId); setReview(null) }}
    onCopy={(text) => window.whisperer.clipboard.copy(text)}
    onGenerate={async (sessionId: string) => {
      const next = await window.whisperer.transformations.generate(sessionId)
      setReview(next)
      return next
    }}
    review={review}
    initialError={generationError}
    initiallyGenerating={autoGeneratingId === review.sessionId}
  />
}
