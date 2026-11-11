import * as HeatGraph from 'heat-graph'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import type { DailyMetric } from '../../../shared/contracts'
import { Button } from '../../components'
import { isoDate, type HeatMapWindow } from './insights-model'

/** Cell fills from quiet to busy; index 0 is a day with no dictation. */
const LEVELS = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)']

export interface ActivityHeatMapProps {
  /** Daily buckets inside the window; days without dictation may be absent. */
  days: readonly DailyMetric[]
  /** Inclusive calendar window the grid shows. */
  window: HeatMapWindow
  /** Local dates, YYYY-MM-DD, that belong to the current day streak. */
  streakDates: ReadonlySet<string>
  /** Moves one page back in time. */
  onEarlier(): void
  /** Moves one page forward; disabled on the current page. */
  onLater(): void
  /** Whether a later page exists. */
  canGoLater: boolean
}

/** A Sunday-first, week-per-column calendar of daily words with paging, a legend and hover detail. */
export function ActivityHeatMap({ days, window, streakDates, onEarlier, onLater, canGoLater }: ActivityHeatMapProps): React.JSX.Element {
  const data = days.map((day) => ({ date: day.date, count: day.words }))
  return (
    <HeatGraph.Root className="heat-map" data={data} start={window.start} end={window.end} weekStart="sunday" colorScale={LEVELS}>
      <div className="heat-map__months">
        <Button aria-label="Earlier weeks" className="heat-map__page" onClick={onEarlier} tone="quiet">
          <ChevronLeft aria-hidden="true" size={16} />
        </Button>
        <div className="heat-map__month-track">
          <HeatGraph.MonthLabels>
            {({ label, totalWeeks }) => <span style={{ left: `${(label.column / totalWeeks) * 100}%` }}>{HeatGraph.MONTH_SHORT[label.month]}</span>}
          </HeatGraph.MonthLabels>
        </div>
        <Button aria-label="Later weeks" className="heat-map__page" disabled={!canGoLater} onClick={onLater} tone="quiet">
          <ChevronRight aria-hidden="true" size={16} />
        </Button>
      </div>
      <div className="heat-map__body">
        <div className="heat-map__days">
          <HeatGraph.DayLabels>{({ label }) => <span>{HeatGraph.DAY_SHORT[label.dayOfWeek]}</span>}</HeatGraph.DayLabels>
        </div>
        <HeatGraph.Grid className="heat-map__grid">
          {({ cell }) => <HeatGraph.Cell className="heat-map__cell" data-streak={streakDates.has(isoDate(cell.date)) || undefined} />}
        </HeatGraph.Grid>
      </div>
      <footer className="heat-map__footer">
        <div className="heat-map__legend">
          <span>More</span>
          {LEVELS.slice(1).reverse().map((color) => <span className="heat-map__cell" key={color} style={{ backgroundColor: color }} aria-hidden="true" />)}
          <span>Less</span>
        </div>
        <div className="heat-map__legend">
          <span className="heat-map__cell" data-streak="true" aria-hidden="true" />
          <span>Current streak</span>
        </div>
      </footer>
      <HeatGraph.Tooltip className="heat-map__tooltip" side="top" sideOffset={6}>
        {({ cell }) => (
          <span>
            <strong>{cell.count.toLocaleString()}</strong> words on {cell.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </HeatGraph.Tooltip>
    </HeatGraph.Root>
  )
}
