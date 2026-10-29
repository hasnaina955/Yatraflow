import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { DayWeather } from '../src/lib/weather'
import {
  filterOverviewWeather,
  mergeOverviewWeather,
  overviewHasPlan,
  overviewIssueSummary,
  overviewSliceView,
  overviewSlotTarget,
  overviewWarningTarget,
  overviewWeatherKey,
  overviewWeatherNotice,
  overviewWeatherView,
} from '../src/pages/trip/OverviewTab'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tab = read('../src/pages/trip/OverviewTab.tsx')
const css = read('../src/styles.css')
const count = (source: string, needle: string) => source.split(needle).length - 1
const PRIOR_SECTION = '/* ===== P10: Creator hub — panel titles and moved margins ===== */'
const SECTION = '/* ===== P12: Overview panels and titles ===== */'

const RULES = [
  { selector: '.yf-surface.ovw-panel', declarations: 'border-radius: var(--radius); box-shadow: var(--shadow-card);' },
  { selector: '.yf-surface.ovw-panel:not(.ovw-strip)', declarations: 'padding: var(--space-8);' },
  { selector: '.yf-surface.ovw-panel.ovw-strip', declarations: 'padding: 14px 18px;' },
  { selector: '.ovw-card-title', declarations: 'font-family: var(--font-body); font-size: 18px; font-weight: 800; line-height: 1.3; color: var(--text); margin: 0;' },
  { selector: '.card-head.ovw-card-title', declarations: 'margin-bottom: 14px;' },
  { selector: '.ovw-route-snap svg > text', declarations: 'fill: var(--text);' },
]

const weather = (date: string, tempMaxC: number): DayWeather => ({
  date,
  code: 1,
  tempMaxC,
  tempMinC: tempMaxC - 8,
  rainChancePct: 10,
})

const fulfilled = (forecast?: DayWeather): PromiseFulfilledResult<Record<string, DayWeather>> => ({
  status: 'fulfilled',
  value: forecast ? { [forecast.date]: forecast } : {},
})

const rejected = (): PromiseRejectedResult => ({ status: 'rejected', reason: new Error('read failed') })

describe('Overview panel classes', () => {
  it('uses Surface with a token-staggered entrance on every panel root', () => {
    const surfaces = tab.match(/<Surface\b[\s\S]*?>/g) ?? []
    expect(surfaces).toHaveLength(15)
    expect(surfaces.every(surface => surface.includes('enterIndex={'))).toBe(true)
    expect(count(tab, 'enterIndex={')).toBe(15)
    expect(count(tab, '<div className="card')).toBe(0)
    expect(css).toContain('.yf-surface.is-entering { animation: cardIn var(--motion-slow) var(--ease-out) backwards; }')
    expect(css).toContain('.yf-surface.is-entering { animation: none; }')
    expect(css).toContain('@media (prefers-reduced-motion: reduce) {')
  })

  it('gives each Overview panel heading the R20 title class', () => {
    const titles = tab.match(/<h2\b[^>]*className="[^"]*\bovw-title\b[^"]*"[^>]*>/g) ?? []
    expect(titles).toHaveLength(10)
    expect(tab).toContain('className="ovw-title" id="ovw-pulse-title">The group')
    expect(tab).toContain('className="ovw-card ovw-route ovw2-route" enterIndex={7}')
    expect(tab).toContain('className="ovw-card ovw2-health"')
    expect(tab).not.toContain('className="card route-snap')
  })

  it('uses compact state blocks with separate empty copy', () => {
    const routeCard = read('../src/components/trips/OverviewRouteCard.tsx')
    expect(count(tab, 'kind="empty"')).toBe(7)
    expect(count(routeCard, 'kind="empty"')).toBe(1)
    expect(tab).toContain('title={hasPlan ? \'The plan flows\' : \'Nothing to check yet\'}')
    expect(tab).toContain('title="Nothing planned yet"')
    expect(tab).toContain('body="Add a stop and each day shows its meals, fuel, stretch breaks and night."')
    expect(tab).toContain('title="No open decisions"')
    expect(tab).toContain('title="No fixed commitments yet"')
    expect(tab).toContain('title="No recent activity yet"')
    expect(tab).toContain('title="No forecast yet"')
    expect(tab).toContain('title="No forecast available"')
    expect(routeCard).toContain('title="No route to draw yet"')
  })

  it('keeps only the dynamic health width inline', () => {
    expect(count(tab, 'style={')).toBe(1)
    expect(count(tab, "style={{ '--ovw-score': `${hasPlan ? health.score : 0}%` } as CSSProperties}")).toBe(1)
  })

  it('keeps the Overview rules in one named section', () => {
    expect(count(css, SECTION)).toBe(1)
    expect(count(css, PRIOR_SECTION)).toBe(1)
    const sectionStart = css.indexOf(SECTION)
    expect(css.indexOf(PRIOR_SECTION)).toBeLessThan(sectionStart)
    const nextSection = css.indexOf('\n/*', sectionStart + SECTION.length)
    const section = css.slice(sectionStart, nextSection < 0 ? undefined : nextSection)
    const matches = [...section.matchAll(/(?:^|\n)([^\n{}]+) \{([^}]*)\}/g)].filter(hit => /\.ovw-/.test(hit[1]))
    expect(matches.map(hit => hit[1].trim()).sort()).toEqual(RULES.map(rule => rule.selector).sort())
    for (const rule of RULES) {
      const hits = matches.filter(hit => hit[1].trim() === rule.selector)
      expect(hits).toHaveLength(1)
      expect(hits[0][2].replace(/\s+/g, ' ').trim()).toBe(rule.declarations)
    }
  })

  it('wraps every navigation callback so a React event cannot become a Map target', () => {
    expect(tab).toContain('onClick={() => onOpenTimeline(verdictTarget)}')
    expect(tab).toContain('onClick={() => onOpenTimeline(target)}')
    expect(tab).toContain('onRefreshMatrix={openGenericMap}')
    expect(tab).toContain('const openGenericMap = onOpenMap ? () => onOpenMap() : undefined')
    expect(tab).not.toContain('onClick={onOpenMap}')
    expect(tab).not.toContain('onClick={onOpenTimeline}')
  })

  it('marks schematic connectors and estimated legs honestly', () => {
    const routeCard = read('../src/components/trips/OverviewRouteCard.tsx')
    expect(routeCard).toContain("summary.state === 'schematic' ? ' is-neutral' : ''")
    expect(routeCard).toContain('Straight-line estimate, not a measured road.')
    expect(routeCard).toContain('r={OVERVIEW_PIN_HIT_DIAMETER / 2}')
    expect(tab).toContain('coverUrl={trip.coverImageUrl}')
    expect(routeCard).toContain('className="ovw-map-atmosphere"')
    expect(routeCard).toContain('className="ovw-survey" aria-hidden="true"')
    expect(routeCard).toContain('usePlateSize(compact, routeReady)')
    expect(routeCard).toContain('}, [compact, routeReady])')
    expect(routeCard).not.toContain('Math.round(element.getBoundingClientRect().width)')
    expect(css).toContain('.ovw-map.is-neutral .rm-road')
    expect(css).toContain('.ovw-map .rm-road { stroke: var(--teal-deep); stroke-width: 3.5px; stroke-dasharray: 1; }')
    expect(css).toContain(".mx-cell[data-state='filled'] .mx-chip {")
    expect(css).toContain('background: var(--pw-ok-100);')
    expect(css).toContain(".mx-cell[data-state='auto'] .mx-chip {")
    expect(css).toContain('box-shadow: inset 0 0 0 1.5px var(--pw-lagoon-400);')
  })

  it('keeps weather from creating a second alert before the parent updates', () => {
    expect(tab).toContain("failedRole={weatherView === 'loading'")
    expect(tab).toContain("? 'status'")
    expect(tab).toContain(": overviewReadRole('weather', firstFailed)}")
  })
})

describe('Overview view models', () => {
  it('keeps a plan verdict honest about an empty trip and the issue count', () => {
    expect(overviewHasPlan({ days: [{ stops: [{ status: 'rejected' }] }] } as never)).toBe(false)
    expect(overviewHasPlan({ days: [{ stops: [{ status: 'confirmed' }] }] } as never)).toBe(true)
    expect(overviewIssueSummary([])).toBe('No schedule issues detected.')
    expect(overviewIssueSummary([
      { severity: 'low' },
      { severity: 'high' },
    ] as never)).toBe('2 issues, high severity.')
  })

  it('targets a day warning and a trip-wide warning differently', () => {
    expect(overviewWarningTarget({ dayIndex: 2 } as never)).toEqual({ dayIndex: 2 })
    expect(overviewWarningTarget({ dayIndex: null } as never)).toEqual({ block: 'trip-wide' })
  })

  it('targets a filled slot by stop, and every other slot by its day only', () => {
    expect(overviewSlotTarget({ state: 'filled', filledStop: { id: 'stop-a' } } as never)).toBe('stop-a')
    expect(overviewSlotTarget({ state: 'empty', filledStop: null } as never)).toBeNull()
    expect(overviewSlotTarget({ state: 'auto', filledStop: null } as never)).toBeNull()
  })

  it('reports loading, failed, empty, ready and retained weather distinctly', () => {
    const base = { anchored: true, loading: false, failed: false, forecastCount: 2, partialFailed: false, refreshFailed: false }
    expect(overviewWeatherView({ ...base, anchored: false, forecastCount: 0 })).toBe('empty')
    expect(overviewWeatherView({ ...base, loading: true })).toBe('loading')
    expect(overviewWeatherView({ ...base, failed: true, forecastCount: 0 })).toBe('failed')
    expect(overviewWeatherView({ ...base, forecastCount: 0 })).toBe('empty')
    expect(overviewWeatherView({ ...base, partialFailed: true })).toBe('failed')
    expect(overviewWeatherView({ ...base, refreshFailed: true })).toBe('kept')
    expect(overviewWeatherView(base)).toBe('ready')
  })

  it('names retained days when a partial failure keeps some forecasts', () => {
    expect(overviewWeatherNotice({ partialFailed: false, retainedDays: 0, refreshFailed: false })).toBeNull()
    expect(overviewWeatherNotice({ partialFailed: true, retainedDays: 0, refreshFailed: false })).toBe('partial')
    expect(overviewWeatherNotice({ partialFailed: true, retainedDays: 2, refreshFailed: true })).toBe('partial-retained')
    expect(overviewWeatherNotice({ partialFailed: false, retainedDays: 2, refreshFailed: true })).toBe('retained')
  })

  it('renders one weather notice, so a retained forecast is never hidden', () => {
    expect(count(tab, 'weatherNotice ===')).toBe(3)
    expect(tab).toContain('title="Couldn’t refresh some forecasts. The last saved values stay on screen."')
    expect(tab).toContain('show the last saved forecast.')
    expect(tab).not.toContain('refreshFailedNow && !partialFailureNow')
  })

  it('wires the matrix as a roving grid and keeps the phone day summary', () => {
    expect(tab).toContain('role="grid" aria-label="Planned parts per day"')
    expect(tab).toContain('onKeyDown={event => onCellKeyDown(event, rowIndex, colIndex)}')
    expect(tab).toContain('tabIndex={active ? 0 : -1}')
    expect(tab).toContain("event.key === 'ArrowLeft'")
    expect(tab).toContain("event.key === 'End'")
    expect(tab).toContain('onClick={() => onSelectCell(day.index, overviewSlotTarget(slot))}')
    expect(tab).toContain('aria-label={dayStatesLabel(day.index, slots)}')
    expect(tab).toContain('className="mx-compact"')
  })
})

describe('Overview read states', () => {
  it('keeps activity and decision reads separate from loading, failed and empty states', () => {
    expect(overviewSliceView({}, 'activity', 0)).toBe('reading')
    expect(overviewSliceView({ activity: 'failed' }, 'activity', 0)).toBe('failed')
    expect(overviewSliceView({ activity: 'failed' }, 'activity', 2)).toBe('kept')
    expect(overviewSliceView({ decisions: 'ok' }, 'decisions', 0)).toBe('empty')
    expect(overviewSliceView({ decisions: 'ok' }, 'decisions', 2)).toBe('rows')
  })
})

describe('Overview weather anchors', () => {
  it('uses the date and coordinates as the cache key', () => {
    const first = { date: '2026-10-20', lat: 28.6, lng: 77.2 }
    const moved = { ...first, lat: 19.1, lng: 72.9 }
    expect(overviewWeatherKey(first)).not.toBe(overviewWeatherKey(moved))
  })

  it('filters visible weather when a same-date anchor moves', () => {
    const oldAnchor = { date: '2026-10-20', lat: 28.6, lng: 77.2 }
    const newAnchor = { date: oldAnchor.date, lat: 19.1, lng: 72.9 }
    const cached = { [overviewWeatherKey(oldAnchor)]: weather(oldAnchor.date, 30) }
    expect(filterOverviewWeather(cached, [newAnchor])).toEqual({})
  })

  it('filters visible weather when the date changes at the same coordinates', () => {
    const oldAnchor = { date: '2026-10-20', lat: 28.6, lng: 77.2 }
    const newAnchor = { date: '2026-10-21', lat: oldAnchor.lat, lng: oldAnchor.lng }
    const cached = { [overviewWeatherKey(oldAnchor)]: weather(oldAnchor.date, 30) }
    expect(filterOverviewWeather(cached, [newAnchor])).toEqual({})
  })

  it('keeps a failed day only at its matching anchor and keeps successful days', () => {
    const keptAnchor = { date: '2026-10-20', lat: 28.6, lng: 77.2 }
    const freshAnchor = { date: '2026-10-21', lat: 19.1, lng: 72.9 }
    const keptForecast = weather(keptAnchor.date, 30)
    const freshForecast = weather(freshAnchor.date, 31)
    const result = mergeOverviewWeather(
      [keptAnchor, freshAnchor],
      [rejected(), fulfilled(freshForecast)],
      { [overviewWeatherKey(keptAnchor)]: keptForecast },
    )

    expect(result.byDate).toEqual({
      [overviewWeatherKey(keptAnchor)]: keptForecast,
      [overviewWeatherKey(freshAnchor)]: freshForecast,
    })
    expect(result.failedKeys).toEqual([overviewWeatherKey(keptAnchor)])
    expect(result.retainedKeys).toEqual([overviewWeatherKey(keptAnchor)])
  })

  it('keeps a successful day during an initial partial read without claiming a cached row', () => {
    const available = { date: '2026-10-20', lat: 28.6, lng: 77.2 }
    const missing = { date: '2026-10-21', lat: 19.1, lng: 72.9 }
    const forecast = weather(available.date, 30)
    const result = mergeOverviewWeather(
      [available, missing],
      [fulfilled(forecast), rejected()],
      {},
    )

    expect(result.byDate).toEqual({ [overviewWeatherKey(available)]: forecast })
    expect(result.failedKeys).toEqual([overviewWeatherKey(missing)])
    expect(result.retainedKeys).toEqual([])
  })

  it('reports an initial all-failed read without inventing forecast rows', () => {
    const anchor = { date: '2026-10-20', lat: 28.6, lng: 77.2 }
    const result = mergeOverviewWeather([anchor], [rejected()], {})

    expect(result.byDate).toEqual({})
    expect(result.failedKeys).toEqual([overviewWeatherKey(anchor)])
    expect(result.retainedKeys).toEqual([])
  })

  it('does not keep a failed forecast from a different location on the same date', () => {
    const oldAnchor = { date: '2026-10-20', lat: 28.6, lng: 77.2 }
    const currentAnchor = { date: oldAnchor.date, lat: 19.1, lng: 72.9 }
    const result = mergeOverviewWeather(
      [currentAnchor],
      [rejected()],
      { [overviewWeatherKey(oldAnchor)]: weather(oldAnchor.date, 30) },
    )

    expect(result.byDate).toEqual({})
    expect(result.failedKeys).toEqual([overviewWeatherKey(currentAnchor)])
    expect(result.retainedKeys).toEqual([])
  })

  it('removes an old forecast when its current anchor succeeds without a forecast', () => {
    const anchor = { date: '2026-10-20', lat: 28.6, lng: 77.2 }
    const result = mergeOverviewWeather(
      [anchor],
      [fulfilled()],
      { [overviewWeatherKey(anchor)]: weather(anchor.date, 30) },
    )

    expect(result.byDate).toEqual({})
    expect(result.failedKeys).toEqual([])
    expect(result.retainedKeys).toEqual([])
  })
})
