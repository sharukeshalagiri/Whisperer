import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

import type { InferenceTestResult, LocalServerStatus, PublicSettings } from '../../../shared/contracts'
import { ON_DEVICE_SPEECH_MODELS } from '../../../shared/contracts'
import {
  describeProgress,
  llmDraft,
  llmDraftDirty,
  llmDraftError,
  llmInput,
  llmStatusLabel,
  localServerActions,
  readInference,
  redactLogLine,
  serverStateLabel,
  speechDraft,
  speechDraftDirty,
  speechDraftError,
  speechInput,
  speechStatusLabel,
} from './connection'
import type { EndpointDraft, LlmDraft, LocalServerAction, SpeechDraft } from './connection'
import { messageFromError } from './deviceApi'
import './inference.css'

/** Which surface hosts the controls; it selects existing setup or settings styles. */
export type InferenceVariant = 'setup' | 'settings'

const BUTTON = {
  setup: { primary: 'device-button', secondary: 'device-button device-button--secondary', link: 'device-button device-button--link' },
  settings: { primary: 'settings-primary-button', secondary: 'settings-row-button', link: 'settings-row-button' },
} as const

const INPUT = { setup: 'device-input', settings: 'inference-input' } as const

/** Props shared by the local server panel and the inference form. */
export interface InferenceSurfaceProps {
  /** Current renderer-safe settings. Keys are never part of them. */
  settings: PublicSettings
  /** Live local server status. */
  status: LocalServerStatus
  /** Host surface. */
  variant: InferenceVariant
}

/**
 * Shows the on-device server, speech and language model states with their actions. Only the
 * explicit Set up button downloads the runtime, and only Download model downloads a model.
 */
export function LocalServerPanel({ settings, status, variant }: InferenceSurfaceProps): ReactElement {
  const [busy, setBusy] = useState<LocalServerAction['id'] | 'download' | null>(null)
  const [error, setError] = useState<string>()
  const buttons = BUTTON[variant]
  const speech = readInference(settings).speech
  const working = status.state === 'installing' || status.state === 'starting' || status.state === 'stopping'

  async function run(action: LocalServerAction['id']): Promise<void> {
    setBusy(action)
    setError(undefined)
    try {
      if (action === 'setup') await window.whisperer.localServer.setup()
      else if (action === 'restart') await window.whisperer.localServer.restart()
      else await window.whisperer.localServer.cancel()
    } catch (actionError) {
      setError(messageFromError(actionError, 'The on-device server did not respond. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  async function download(): Promise<void> {
    if (speech.provider !== 'onnx') return
    setBusy('download')
    setError(undefined)
    try {
      await window.whisperer.inference.downloadModel(speech.model)
    } catch (downloadError) {
      setError(messageFromError(downloadError, 'The model download did not start. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const actions = localServerActions(status)
  const canDownload =
    speech.provider === 'onnx' &&
    status.state === 'ready' &&
    (status.speech.status === 'missing' || status.speech.status === 'failed')

  return (
    <section className={`local-server local-server--${variant}`} aria-label="On-device server status">
      <div className="local-server__card">
        <dl className="local-server__rows">
          <StatusRow
            label="Local server"
            value={serverStateLabel(status.state)}
            tone={status.state === 'failed' ? 'error' : status.state === 'ready' ? 'ok' : 'idle'}
            busy={working}
          >
            {status.message ? <span className="local-server__message">{status.message}</span> : null}
            {status.state === 'ready' && status.port ? (
              <span className="local-server__message">Listening on 127.0.0.1:{status.port}</span>
            ) : null}
            {working && status.progress ? (
              <ProgressLine label="Runtime download" progress={status.progress} />
            ) : null}
          </StatusRow>
          <StatusRow
            label="Speech"
            value={speechStatusLabel(status.speech.status)}
            tone={status.speech.status === 'failed' ? 'error' : status.speech.status === 'ready' ? 'ok' : 'idle'}
            busy={['downloading', 'verifying', 'loading'].includes(status.speech.status)}
          >
            {status.speech.model ? <code className="local-server__model">{status.speech.model}</code> : null}
            {status.speech.message ? <span className="local-server__message">{status.speech.message}</span> : null}
            {status.speech.progress ? <ProgressLine label="Model download" progress={status.speech.progress} /> : null}
          </StatusRow>
          <StatusRow
            label="Language model"
            value={llmStatusLabel(status.llm.status)}
            tone={status.llm.status === 'failed' ? 'error' : status.llm.status === 'ready' ? 'ok' : 'idle'}
            busy={false}
          >
            {status.llm.model ? <code className="local-server__model">{status.llm.model}</code> : null}
            {status.llm.message ? <span className="local-server__message">{status.llm.message}</span> : null}
          </StatusRow>
        </dl>
        {status.state === 'notInstalled' ? (
          <p className="local-server__hint">
            Setting up downloads the Whisperer server runtime (uv, Python and its packages, about 2 GB
            of disk). Nothing downloads until you choose it.
          </p>
        ) : null}
        {canDownload ? (
          <p className="local-server__hint">
            Downloading fetches <code>{speech.model}</code> from Hugging Face into this device&apos;s
            model cache.
          </p>
        ) : null}
        {error ? (
          <p className="local-server__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="local-server__actions">
          {actions.map((action) => (
            <button
              className={action.id === 'cancel' ? buttons.secondary : buttons.primary}
              disabled={busy !== null && !(action.id === 'cancel' && busy !== 'cancel')}
              key={action.id}
              onClick={() => void run(action.id)}
              type="button"
            >
              {busy === action.id ? 'Working…' : action.label}
            </button>
          ))}
          {canDownload ? (
            <button className={buttons.primary} disabled={busy !== null} onClick={() => void download()} type="button">
              {busy === 'download' ? 'Starting…' : 'Download model'}
            </button>
          ) : null}
        </div>
        <ActivityLog lines={status.log} />
      </div>
    </section>
  )
}

/** Renders one labelled state with optional detail lines. */
function StatusRow({
  busy,
  children,
  label,
  tone,
  value,
}: {
  busy: boolean
  children?: ReactNode
  label: string
  tone: 'ok' | 'error' | 'idle'
  value: string
}): ReactElement {
  return (
    <div className="local-server__row">
      <dt>{label}</dt>
      <dd>
        <span className={`local-server__state local-server__state--${tone}`}>
          {busy ? <span className="device-spinner" aria-hidden="true" /> : <i aria-hidden="true" />}
          {value}
        </span>
        {children}
      </dd>
    </div>
  )
}

/** Shows real byte progress, using a determinate bar only when the total is known. */
function ProgressLine({ label, progress }: { label: string; progress: NonNullable<LocalServerStatus['progress']> }): ReactElement {
  const known = progress.totalBytes !== null && progress.totalBytes > 0
  return (
    <span className="local-server__progress">
      <progress
        aria-label={label}
        max={known ? (progress.totalBytes ?? undefined) : undefined}
        value={known ? progress.completedBytes : undefined}
      />
      <span>{describeProgress(progress)}</span>
    </span>
  )
}

/** Collapsible, sanitized installer and server activity. */
function ActivityLog({ lines }: { lines: readonly string[] }): ReactElement {
  return (
    <details className="local-server__log">
      <summary>Activity ({lines.length})</summary>
      {lines.length ? (
        <ol aria-label="On-device server activity">
          {lines.map((line, index) => (
            <li key={`${index}:${line}`}>{redactLogLine(line)}</li>
          ))}
        </ol>
      ) : (
        <p>No activity yet.</p>
      )}
    </details>
  )
}

/** Props for the inference choice form. */
export interface InferenceFormProps extends InferenceSurfaceProps {
  /** Called after settings are saved, so the host can refresh its state. */
  onSaved?: () => Promise<void> | void
}

/**
 * Edits speech and language model choices. Saved API keys are never shown: the key field only
 * accepts a new key, and a separate control removes the saved one.
 */
export function InferenceForm({ onSaved, settings, status, variant }: InferenceFormProps): ReactElement {
  const saved = readInference(settings)
  const [speech, setSpeech] = useState<SpeechDraft>(() => speechDraft(saved.speech))
  const [llm, setLlm] = useState<LlmDraft>(() => llmDraft(saved.llm))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [testing, setTesting] = useState<'speech' | 'llm' | null>(null)
  const [results, setResults] = useState<Partial<Record<'speech' | 'llm', InferenceTestResult>>>({})
  const buttons = BUTTON[variant]
  const dirty = speechDraftDirty(speech, saved.speech) || llmDraftDirty(llm, saved.llm)
  const validation = speechDraftError(speech) ?? llmDraftError(llm)
  const catalog = ON_DEVICE_SPEECH_MODELS.find((model) => model.id === speech.onnxModel.trim())
  // An id saved by an older build that the server no longer accepts; shown, never offered.
  const unsupportedSaved = speech.provider === 'onnx' && !catalog ? speech.onnxModel.trim() : null

  useEffect(() => {
    // A saved change elsewhere (another window, a mode switch) resets drafts that match nothing typed.
    if (!dirty) {
      setSpeech(speechDraft(saved.speech))
      setLlm(llmDraft(saved.llm))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.speech, saved.llm])

  async function save(): Promise<boolean> {
    if (validation) {
      setError(validation)
      return false
    }
    setSaving(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const next = await window.whisperer.inference.update({ speech: speechInput(speech), llm: llmInput(llm) })
      const nextInference = readInference(next)
      setSpeech(speechDraft(nextInference.speech))
      setLlm(llmDraft(nextInference.llm))
      setResults({})
      setNotice(status.state === 'ready' ? 'Saved. The on-device server is restarting with these choices.' : 'Saved.')
      await onSaved?.()
      return true
    } catch (saveError) {
      setError(messageFromError(saveError, 'We could not save these choices. Try again.'))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function test(target: 'speech' | 'llm'): Promise<void> {
    setTesting(target)
    setError(undefined)
    try {
      const result = await window.whisperer.inference.test(target)
      setResults((current) => ({ ...current, [target]: result }))
    } catch (testError) {
      setResults((current) => ({
        ...current,
        [target]: { ok: false, latencyMs: null, message: messageFromError(testError, 'The test did not run.') },
      }))
    } finally {
      setTesting(null)
    }
  }

  const canTest = status.state === 'ready' && !dirty && !saving

  return (
    <form
      className={`inference-form inference-form--${variant}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <fieldset className="inference-form__group">
        <legend>Speech recognition</legend>
        <ChoiceGroup
          name={`${variant}-speech-provider`}
          onChange={(provider) => setSpeech((current) => ({ ...current, provider }))}
          options={[
            ['onnx', 'On this device'],
            ['http', 'HTTP endpoint'],
          ]}
          value={speech.provider}
        />
        {speech.provider === 'onnx' ? (
          <>
            <label className="inference-form__field">
              Model
              <select
                className={INPUT[variant]}
                onChange={(event) => setSpeech((current) => ({ ...current, onnxModel: event.target.value }))}
                value={speech.onnxModel.trim()}
              >
                {unsupportedSaved !== null ? (
                  <option disabled value={unsupportedSaved}>
                    {unsupportedSaved || 'No model selected'} (not supported)
                  </option>
                ) : null}
                {ON_DEVICE_SPEECH_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} ({model.id})
                  </option>
                ))}
              </select>
            </label>
            {catalog ? (
              <p className="inference-form__hint">
                <code>{catalog.id}</code> · {catalog.languages}. Runs on the CPU in the server on
                this device.
              </p>
            ) : (
              <p className="local-server__error" role="alert">
                The saved model is not supported by the server on this device. Choose a model from
                the list.
              </p>
            )}
            <p className="inference-form__hint">
              Only the models listed here are supported. Other Hugging Face models and importing
              model files from disk are not available.
            </p>
          </>
        ) : (
          <EndpointFields
            endpoint={speech.endpoint}
            hasSavedKey={saved.speech.provider === 'http' && saved.speech.hasApiKey}
            id={`${variant}-speech`}
            inputClass={INPUT[variant]}
            onChange={(endpoint) => setSpeech((current) => ({ ...current, endpoint }))}
          />
        )}
        <TestControl
          buttonClass={buttons.secondary}
          canTest={canTest}
          dirty={dirty}
          onTest={() => void test('speech')}
          ready={status.state === 'ready'}
          result={results.speech}
          testing={testing === 'speech'}
        />
      </fieldset>

      <fieldset className="inference-form__group">
        <legend>Language model</legend>
        <ChoiceGroup
          name={`${variant}-llm-provider`}
          onChange={(provider) => setLlm((current) => ({ ...current, provider }))}
          options={[
            ['http', 'HTTP endpoint'],
            ['off', 'Off'],
          ]}
          value={llm.provider}
        />
        {llm.provider === 'http' ? (
          <>
            <EndpointFields
              endpoint={llm.endpoint}
              hasSavedKey={saved.llm.provider === 'http' && saved.llm.hasApiKey}
              id={`${variant}-llm`}
              inputClass={INPUT[variant]}
              onChange={(endpoint) => setLlm((current) => ({ ...current, endpoint }))}
            />
            <TestControl
              buttonClass={buttons.secondary}
              canTest={canTest}
              dirty={dirty}
              onTest={() => void test('llm')}
              ready={status.state === 'ready'}
              result={results.llm}
              testing={testing === 'llm'}
            />
          </>
        ) : (
          <p className="inference-form__hint">
            Polish and text transforms are unavailable while the language model is off. Dictation
            still works.
          </p>
        )}
      </fieldset>

      {error ? (
        <p className="local-server__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice && !dirty ? (
        <p className="inference-form__notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="local-server__actions">
        <button className={buttons.primary} disabled={!dirty || saving} type="submit">
          {saving ? 'Saving…' : 'Save choices'}
        </button>
      </div>
    </form>
  )
}

/** Accessible radio choice rendered as a segmented control. */
function ChoiceGroup<T extends string>({
  name,
  onChange,
  options,
  value,
}: {
  name: string
  onChange: (value: T) => void
  options: ReadonlyArray<readonly [T, string]>
  value: T
}): ReactElement {
  return (
    <div className="inference-choice" role="radiogroup">
      {options.map(([option, label]) => (
        <label className={option === value ? 'is-selected' : undefined} key={option}>
          <input
            checked={option === value}
            name={name}
            onChange={() => onChange(option)}
            type="radio"
            value={option}
          />
          {label}
        </label>
      ))}
    </div>
  )
}

/** Base URL, model and write-only API key fields for an OpenAI-compatible endpoint. */
function EndpointFields({
  endpoint,
  hasSavedKey,
  id,
  inputClass,
  onChange,
}: {
  endpoint: EndpointDraft
  hasSavedKey: boolean
  id: string
  inputClass: string
  onChange: (endpoint: EndpointDraft) => void
}): ReactElement {
  const keyHint = endpoint.removeKey
    ? 'The saved key will be removed when you save.'
    : hasSavedKey
      ? 'A key is saved in this device’s encrypted storage. Leave this empty to keep it.'
      : 'Optional. Leave empty if the endpoint needs no key.'
  return (
    <>
      <label className="inference-form__field">
        Base URL
        <input
          autoComplete="off"
          className={inputClass}
          inputMode="url"
          onChange={(event) => onChange({ ...endpoint, baseUrl: event.target.value })}
          placeholder="https://inference.example.com/v1"
          spellCheck={false}
          type="url"
          value={endpoint.baseUrl}
        />
      </label>
      <label className="inference-form__field">
        Model
        <input
          autoComplete="off"
          className={inputClass}
          onChange={(event) => onChange({ ...endpoint, model: event.target.value })}
          spellCheck={false}
          value={endpoint.model}
        />
      </label>
      <label className="inference-form__field">
        API key
        <input
          aria-describedby={`${id}-key-hint`}
          autoComplete="off"
          className={inputClass}
          disabled={endpoint.removeKey}
          onChange={(event) => onChange({ ...endpoint, apiKey: event.target.value })}
          placeholder={hasSavedKey ? 'Saved key kept' : ''}
          spellCheck={false}
          type="password"
          value={endpoint.apiKey}
        />
      </label>
      <p className="inference-form__hint" id={`${id}-key-hint`}>
        {keyHint}
      </p>
      {hasSavedKey ? (
        <label className="inference-form__check">
          <input
            checked={endpoint.removeKey}
            onChange={(event) => onChange({ ...endpoint, apiKey: '', removeKey: event.target.checked })}
            type="checkbox"
          />
          Remove the saved key
        </label>
      ) : null}
    </>
  )
}

/** Runs one engine test against saved settings and reports its real result. */
function TestControl({
  buttonClass,
  canTest,
  dirty,
  onTest,
  ready,
  result,
  testing,
}: {
  buttonClass: string
  canTest: boolean
  dirty: boolean
  onTest: () => void
  ready: boolean
  result: InferenceTestResult | undefined
  testing: boolean
}): ReactElement {
  const reason = !ready ? 'Start the on-device server to test.' : dirty ? 'Save your choices to test them.' : null
  return (
    <div className="inference-form__test">
      <button className={buttonClass} disabled={!canTest || testing} onClick={onTest} type="button">
        {testing ? 'Testing…' : 'Test'}
      </button>
      <span aria-live="polite" className={result && !result.ok ? 'is-error' : undefined}>
        {result
          ? `${result.ok ? 'Passed' : 'Failed'}${result.latencyMs !== null ? `, ${result.latencyMs} ms` : ''}: ${result.message}`
          : reason}
      </span>
    </div>
  )
}
