// ============ The route at a glance ============
// The Look inside card from the editorial mockup: a dark panel with one road.
// The road is the real height line at the free days' places, so the shape is
// data and not decoration. Paid stretches carry day numbers only.
import type { Trip } from '../../data/types'
import type { RouteHeightsResult } from '../../lib/elevation'
import { buildRouteHeightPlot, type RouteHeightPlotMark } from '../../lib/elevationPlot'
import { paidHeightBands, useRouteHeights, type PaidHeightBand } from './ride/RideElevation'

export const GLANCE_W = 520
export const GLANCE_H = 190
/** Badges closer than this skip, so the road shows a few clear milestones. */
const BADGE_GAP = 44

export interface GlanceBadge { x: number; y: number; day: number }

/** One badge at the first marked place of each day, spaced along the road. */
export function glanceBadges(marks: readonly RouteHeightPlotMark[], minGap = BADGE_GAP): GlanceBadge[] {
  const badges: GlanceBadge[] = []
  const seen = new Set<number>()
  for (const mark of [...marks].sort((a, b) => a.x - b.x)) {
    if (mark.dayIndex == null || seen.has(mark.dayIndex)) continue
    seen.add(mark.dayIndex)
    const last = badges[badges.length - 1]
    if (last && mark.x - last.x < minGap) continue
    badges.push({ x: mark.x, y: mark.y, day: mark.dayIndex })
  }
  return badges
}

/** The day part of a paid band label: "Days 5–8". */
export function glanceGapLabel(band: PaidHeightBand): string {
  return band.label.split(' · ')[0]
}

type GlanceState = { kind: 'loading' } | RouteHeightsResult

export function RouteGlanceView({ state, paidIndexes, places, onRide }: {
  state: GlanceState
  paidIndexes: readonly number[]
  /** The stop line under the road. Null when a name could open a paid day. */
  places: string | null
  onRide?: () => void
}) {
  const measured = state.kind === 'measured' && state.runs.length > 0 ? state : null
  const plot = measured ? buildRouteHeightPlot(measured.points, measured.runs, measured.stats, GLANCE_W, GLANCE_H) : null
  const bands = measured && plot ? paidHeightBands(measured.points, plot, paidIndexes) : []
  const badges = plot ? glanceBadges(plot.marks) : []
  return (
    <section className="pi-glance" aria-labelledby="pi-glance-title">
      <div className="pi-glance-head">
        <span className="pi-glance-kicker" id="pi-glance-title">The route at a glance</span>
        {measured && <span className="pi-glance-range">{Math.round(measured.stats.minM).toLocaleString('en-IN')} to {Math.round(measured.stats.maxM).toLocaleString('en-IN')} m</span>}
      </div>
      {state.kind === 'loading' && <p className="pi-glance-state" role="status">Loading the road…</p>}
      {state.kind === 'failed' && <p className="pi-glance-state">The road heights are not available.</p>}
      {(state.kind === 'empty' || (state.kind === 'measured' && !measured)) && <p className="pi-glance-state">The free days have no saved places to measure.</p>}
      {plot && (
        <svg className="pi-glance-road" viewBox={`0 0 ${GLANCE_W} ${GLANCE_H}`} role="img"
          aria-label={`The road by height at the free days' places.${bands.length ? ` ${bands.map(glanceGapLabel).join(', ')} are in the paid plan.` : ''}`}>
          {bands.map(band => {
            const y = plot.baseY - 6
            const x = band.edge === 'start' ? 6 : band.x
            const width = band.edge ? Math.max(28, band.width) : band.width
            return <g key={`${band.edge ?? 'gap'}-${band.x}`} className="pi-glance-paid">
              <line x1={x} y1={y} x2={x + width - (band.edge === 'start' ? 6 : 0)} y2={y} />
              <text x={band.edge === 'start' ? 6 : band.edge === 'end' ? GLANCE_W - 6 : x + width / 2} y={y + 18}
                textAnchor={band.edge === 'start' ? 'start' : band.edge === 'end' ? 'end' : 'middle'}>{glanceGapLabel(band)} · paid</text>
            </g>
          })}
          {plot.runs.map((run, index) => <g key={index} className="pi-glance-run">
            <path className="pi-glance-casing" d={run.line} />
            <path className="pi-glance-centre" d={run.line} />
          </g>)}
          {badges.map(badge => <g key={badge.day} className="pi-glance-badge">
            <circle cx={badge.x} cy={badge.y} r="14" />
            <text x={badge.x} y={badge.y} dy=".35em" textAnchor="middle">{badge.day + 1}</text>
          </g>)}
        </svg>
      )}
      <div className="pi-glance-foot">
        {places ? <span className="pi-glance-places">{places}</span> : <span />}
        {onRide && <button type="button" className="pi-glance-ride" onClick={onRide}>Ride along the route <span aria-hidden>→</span></button>}
      </div>
    </section>
  )
}

export function RouteGlance({ trip, freeIndexes, places, onRide }: {
  trip: Trip
  freeIndexes: readonly number[]
  places: string | null
  onRide?: () => void
}) {
  const { result, paidIndexes } = useRouteHeights(trip, freeIndexes)
  return <RouteGlanceView state={result} paidIndexes={paidIndexes} places={places} onRide={onRide} />
}
