import { rankWordsPerMinute } from './insights-model'

const RADIUS = 42
const STROKE = 11
/** Length of the half-circle arc, used to dash the filled portion. */
const ARC_LENGTH = Math.PI * RADIUS

/** A half-ring gauge that fills with the account's dictation rate relative to fast speech. */
export function WpmGauge({ wordsPerMinute }: { wordsPerMinute: number }): React.JSX.Element {
  const rank = rankWordsPerMinute(wordsPerMinute)
  const arc = `M ${50 - RADIUS} 50 A ${RADIUS} ${RADIUS} 0 0 1 ${50 + RADIUS} 50`
  return (
    <figure className="wpm-gauge" aria-label={`${wordsPerMinute} words per minute, ${rank.caption}`}>
      <svg viewBox={`0 ${50 - RADIUS - STROKE / 2} 100 ${RADIUS + STROKE}`} aria-hidden="true">
        <path className="wpm-gauge__track" d={arc} strokeWidth={STROKE} />
        <path
          className="wpm-gauge__fill"
          d={arc}
          strokeWidth={STROKE}
          strokeDasharray={ARC_LENGTH}
          strokeDashoffset={ARC_LENGTH * (1 - rank.fill)}
        />
      </svg>
      <figcaption>
        <span>Pace</span>
        <strong>{rank.caption}</strong>
      </figcaption>
    </figure>
  )
}
