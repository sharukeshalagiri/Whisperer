Parent instructions: [features AGENTS.md](../AGENTS.md).

- Every figure on this page comes from the typed `window.whisperer.metrics` bridge. Derive display values only in `insights-model.ts`, which stays pure and tested; never compute totals, rates or streaks from local history.
- Keep the heat map on `heat-graph` with styling in `insights.css`. Its cell colours are the `--heat-*` tokens so both themes stay readable; do not inline hex colours in components.
- Cards are bounded `MetricCard`s with little padding. Add a figure as a card row or a fact, not as free prose, and keep labels on one line.
- A missing value stays honest: show a zero, an empty-state sentence or the offline notice. Never invent "time saved", accuracy or comparative claims the API does not provide.

## Learnings

None yet.
