import { useQuery } from '@tanstack/react-query'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'

import { ActivityHeatMap } from './ActivityHeatMap'
import { addDays, booksWritten, formatDuration, heatMapWindow, isoDate, monthDelta } from './insights-model'
import { MetricCard, MetricRow } from './MetricCard'
import { WpmGauge } from './WpmGauge'

/** Shows server-authoritative account-wide dictation progress as a grid of bounded metric cards. */
export function InsightsScreen(): React.JSX.Element {
  const [pagesBack, setPagesBack] = useState(0)
  const today = new Date()
  const page = heatMapWindow(today, pagesBack)
  const metricsQuery = useQuery({
    queryKey: ['metrics'],
    queryFn: () => window.whisperer.metrics.get(),
    staleTime: 60_000,
  })
  const range = { from: isoDate(page.start), until: isoDate(page.end) }
  const dailyQuery = useQuery({
    queryKey: ['metrics', 'daily', range],
    queryFn: () => window.whisperer.metrics.daily(range),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  })
  const appsQuery = useQuery({
    queryKey: ['metrics', 'apps'],
    queryFn: () => window.whisperer.metrics.apps(),
    staleTime: 60_000,
  })
  const metrics = metricsQuery.data
  const streakDates = new Set<string>()
  if (metrics) {
    // The streak counts back from today, or from yesterday when today has no dictation yet.
    const last = metrics.wordsToday > 0 ? today : addDays(today, -1)
    for (let offset = 0; offset < metrics.dayStreak; offset += 1) streakDates.add(isoDate(addDays(last, -offset)))
  }

  return (
    <div className="page insights-page">
      <header className="insights-page__heading">
        <h1>Insights</h1>
        <p>Your account-wide dictation progress.</p>
      </header>
      {metricsQuery.isLoading ? <p className="insights-page__status">Loading account metrics…</p> : null}
      {metricsQuery.isError && !metrics ? <p className="insights-page__status" role="alert">Account metrics are unavailable while you are offline.</p> : null}
      {metricsQuery.isError && metrics ? <p className="insights-page__status" role="status">Showing cached account metrics while you are offline.</p> : null}
      {metrics ? (
        <div className="insights-grid">
          <MetricCard className="insights-grid__pace" value={metrics.wordsPerMinute} label="Words per minute" hint="Your rate across your last 100 dictations, measured while you were speaking.">
            <WpmGauge wordsPerMinute={metrics.wordsPerMinute} />
          </MetricCard>
          <MetricCard className="insights-grid__fixes" value={(metrics.correctedWords + metrics.dictionaryReplacements).toLocaleString()} label="Fixes made by Whisperer">
            <MetricRow value={metrics.correctedWords.toLocaleString()} label="words corrected" hint="Transcript words changed by cleanup before they reached your screen." />
            <MetricRow value={metrics.dictionaryReplacements.toLocaleString()} label="dictionary fixes" hint="Words replaced from your personal dictionary." />
          </MetricCard>
          <MetricCard className="insights-grid__total" value={metrics.totalWords.toLocaleString()} label="Total words dictated" badge={<MonthBadge metrics={metrics} />}>
            <p className="insights-books">{booksWritten(metrics.totalWords)}</p>
            <dl className="insights-facts">
              <div><dt>Dictations</dt><dd>{metrics.dictationCount.toLocaleString()}</dd></div>
              <div><dt>Time speaking</dt><dd>{formatDuration(metrics.totalDurationMs)}</dd></div>
              <div><dt>Active days</dt><dd>{metrics.activeDays.toLocaleString()}</dd></div>
              <div><dt>This week</dt><dd>{metrics.wordsThisWeek.toLocaleString()}</dd></div>
            </dl>
          </MetricCard>
          <MetricCard className="insights-grid__apps" value={appsQuery.data?.length ?? 0} label="Apps dictated into">
            {appsQuery.data?.length ? (
              <ol className="insights-apps">
                {appsQuery.data.slice(0, 6).map((app) => (
                  <li key={app.appName}>
                    <span>{app.appName}</span>
                    <strong>{app.words.toLocaleString()}</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="insights-page__status">No app names recorded yet.</p>
            )}
          </MetricCard>
          <MetricCard className="insights-grid__streak" value={`${metrics.dayStreak} day streak`} label={`Week streak | ${metrics.weekStreak} ${metrics.weekStreak === 1 ? 'week' : 'weeks'}`} badge={<span className="insights-streak__longest">Longest streak | {metrics.longestDayStreak} days</span>}>
            <ActivityHeatMap
              canGoLater={pagesBack > 0}
              days={dailyQuery.data ?? []}
              onEarlier={() => setPagesBack((pages) => pages + 1)}
              onLater={() => setPagesBack((pages) => Math.max(0, pages - 1))}
              streakDates={streakDates}
              window={page}
            />
          </MetricCard>
        </div>
      ) : null}
    </div>
  )
}

/** The month-over-month change pill in the total-words card. */
function MonthBadge({ metrics }: { metrics: Parameters<typeof monthDelta>[0] }): React.JSX.Element {
  const delta = monthDelta(metrics)
  const Icon = delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : null
  return (
    <span className="insights-month" data-direction={delta.direction}>
      {Icon ? <Icon aria-hidden="true" size={14} /> : null}
      {delta.label}
    </span>
  )
}
