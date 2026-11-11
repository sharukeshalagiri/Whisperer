import { useEffect, useRef, useState } from 'react'

import type { TransformReview } from '../../shared/contracts'
import { Dialog } from './Dialog'

/** Legacy document-surface preview request; native selection transformations use TransformReview instead. */
export interface TransformationRequest {
  text: string
  kind: 'polish' | 'shorten' | 'expand' | 'tone' | 'translate' | 'custom'
  instruction?: string
  targetLanguage?: string
}

interface NativeReviewDialogProps {
  review: TransformReview
  onGenerate: (sessionId: string) => Promise<TransformReview>
  onAccept: (sessionId: string) => Promise<void>
  onCopy: (text: string) => void | Promise<void>
  onClose: (sessionId: string) => void | Promise<void>
  initiallyGenerating?: boolean
  initialError?: string
}

/** Props for an explicit preview inside a revision-owning document surface. */
interface DocumentPreviewDialogProps {
  sourceText: string
  onGenerate: (request: TransformationRequest) => Promise<{ id: string; text: string }>
  onCopy: (text: string) => void | Promise<void>
  onApply: (text: string) => void | Promise<void>
  onClose: () => void
}

/** Presents either a main-held native selection review or an explicit document-surface preview. */
export function TextTransformationDialog(props: NativeReviewDialogProps | DocumentPreviewDialogProps): React.JSX.Element {
  return 'review' in props ? <NativeReviewDialog {...props} /> : <DocumentPreviewDialog {...props} />
}

/** Previews a scoped transformation and never mutates the source without acceptance. */
function NativeReviewDialog({ initialError, initiallyGenerating = false, onAccept, onClose, onCopy, onGenerate, review }: NativeReviewDialogProps): React.JSX.Element {
  const [current, setCurrent] = useState(review)
  const [error, setError] = useState<string>()
  const [generating, setGenerating] = useState(initiallyGenerating)
  const [applying, setApplying] = useState(false)
  const [applyUnavailable, setApplyUnavailable] = useState(false)
  const [copied, setCopied] = useState(false)
  const mounted = useRef(true)

  useEffect(() => { mounted.current = true; setCurrent(review); setError(initialError); setApplyUnavailable(false); setGenerating(initiallyGenerating); return () => { mounted.current = false } }, [initialError, initiallyGenerating, review])
  const generate = async (): Promise<void> => { setGenerating(true); setApplyUnavailable(false); setError(undefined); try { const generated = await onGenerate(current.sessionId); if (mounted.current) setCurrent(generated) } catch (reason) { if (mounted.current) setError(message(reason, 'We could not generate this preview. Try again.')) } finally { if (mounted.current) setGenerating(false) } }
  const close = async (): Promise<void> => { try { await onClose(current.sessionId) } catch { /* A stale session is already safely closed. */ } }
  const accept = async (): Promise<void> => { if (!current.proposal || applyUnavailable) return; setApplying(true); setError(undefined); try { await onAccept(current.sessionId); if (mounted.current) await close() } catch (reason) { if (mounted.current) { setApplyUnavailable(true); setError(`${message(reason, 'The text was not applied.')} It was not changed. You can copy the proposal instead.`) } } finally { if (mounted.current) setApplying(false) } }
  const copy = async (): Promise<void> => { if (!current.proposal) return; try { await onCopy(current.proposal); if (mounted.current) setCopied(true) } catch (reason) { if (mounted.current) setError(message(reason, 'We could not copy the preview.')) } }

  return <DialogFrame title={current.definition.name} subtitle="Review the proposed replacement before applying it. Your original selection stays unchanged until then." onClose={close} applying={applying}>
    <section aria-label="Source text" className="transformation-dialog__source"><strong>Original</strong><p>{current.sourceText}</p></section>
    {error ? <p className="ui-alert" role="alert">{error}</p> : null}
    {current.proposal !== null ? <section aria-label="Generated preview" className="transformation-dialog__result"><strong>Proposed replacement</strong><p>{current.proposal}</p></section> : <p className="transformation-dialog__empty">Generate a proposal to review the changes.</p>}
    <footer><button className="ui-button" disabled={applying} onClick={() => void close()} type="button">Cancel</button><button className="ui-button" disabled={generating || applying} onClick={() => void generate()} type="button">{generating ? 'Generating…' : current.proposal ? 'Regenerate' : 'Generate preview'}</button>{current.proposal !== null ? <button className="ui-button" disabled={applying} onClick={() => void copy()} type="button">{copied ? 'Copied' : 'Copy'}</button> : null}{current.proposal !== null ? <button className="ui-button ui-button--dark" disabled={applying || applyUnavailable} onClick={() => void accept()} type="button">{applying ? 'Applying…' : applyUnavailable ? 'Unavailable' : 'Apply'}</button> : null}</footer>
  </DialogFrame>
}

/** Keeps explicit document previews review-first, leaving resource revisions to their owner. */
function DocumentPreviewDialog({ onApply, onClose, onCopy, onGenerate, sourceText }: DocumentPreviewDialogProps): React.JSX.Element {
  const [kind, setKind] = useState<TransformationRequest['kind']>('polish')
  const [instruction, setInstruction] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('')
  const [result, setResult] = useState<string>()
  const [error, setError] = useState<string>()
  const [generating, setGenerating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [copied, setCopied] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const generate = async (): Promise<void> => { setGenerating(true); setError(undefined); try { const generated = await onGenerate({ text: sourceText, kind, ...(instruction.trim() ? { instruction: instruction.trim() } : {}), ...(targetLanguage.trim() ? { targetLanguage: targetLanguage.trim() } : {}) }); if (mounted.current) setResult(generated.text) } catch (reason) { if (mounted.current) setError(message(reason, 'We could not generate this preview. Try again.')) } finally { if (mounted.current) setGenerating(false) } }
  const apply = async (): Promise<void> => { if (!result) return; setApplying(true); try { await onApply(result); if (mounted.current) onClose() } catch (reason) { if (mounted.current) setError(message(reason, 'The text was not applied. Try again.')) } finally { if (mounted.current) setApplying(false) } }
  const copy = async (): Promise<void> => { if (!result) return; try { await onCopy(result); if (mounted.current) setCopied(true) } catch (reason) { if (mounted.current) setError(message(reason, 'We could not copy the preview.')) } }
  return <DialogFrame title="Transform text" subtitle="Your original text will not change until you apply this preview." onClose={onClose} applying={applying}>
    <label>Transformation<select onChange={(event) => { setKind(event.target.value as TransformationRequest['kind']); setResult(undefined) }} value={kind}><option value="polish">Polish</option><option value="shorten">Shorten</option><option value="expand">Expand</option><option value="tone">Change tone</option><option value="translate">Translate</option><option value="custom">Custom</option></select></label>
    {kind === 'translate' ? <label>Target language<input onChange={(event) => setTargetLanguage(event.target.value)} placeholder="For example, Spanish" value={targetLanguage} /></label> : null}
    {kind === 'tone' || kind === 'custom' ? <label>{kind === 'tone' ? 'Tone' : 'Instruction'}<input onChange={(event) => setInstruction(event.target.value)} placeholder="Describe the change you want" value={instruction} /></label> : null}
    <section aria-label="Source text" className="transformation-dialog__source"><strong>Original</strong><p>{sourceText}</p></section>{error ? <p className="ui-alert" role="alert">{error}</p> : null}{result !== undefined ? <section aria-label="Generated preview" className="transformation-dialog__result"><strong>Preview</strong><textarea aria-label="Generated preview" onChange={(event) => setResult(event.target.value)} value={result} /></section> : null}
    <footer><button className="ui-button" disabled={generating || applying} onClick={onClose} type="button">Cancel</button><button className="ui-button" disabled={generating || applying || !sourceText.trim()} onClick={() => void generate()} type="button">{generating ? 'Generating…' : 'Generate preview'}</button>{result !== undefined ? <button className="ui-button" disabled={applying} onClick={() => void copy()} type="button">{copied ? 'Copied' : 'Copy'}</button> : null}{result !== undefined ? <button className="ui-button ui-button--dark" disabled={applying} onClick={() => void apply()} type="button">{applying ? 'Applying…' : 'Apply'}</button> : null}</footer>
  </DialogFrame>
}

/** Provides shared modal framing without granting a presentation component desktop access. */
function DialogFrame({ applying, children, onClose, subtitle, title }: { applying: boolean; children: React.ReactNode; onClose: () => void | Promise<void>; subtitle: string; title: string }): React.JSX.Element {
  return <Dialog hideHeader onClose={() => { if (!applying) void onClose() }} open title={title}><section aria-labelledby="transformation-dialog-title" className="transformation-dialog"><header><div><h2 id="transformation-dialog-title">{title}</h2><p>{subtitle}</p></div></header>{children}</section></Dialog>
}

function message(reason: unknown, fallback: string): string { return reason instanceof Error && reason.message ? reason.message : fallback }
