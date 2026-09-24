// ============ Recorded-traffic trend ============
//
// The one chart on the creator hub, and deliberately only one: visits (area),
// forks (line) and unlocks (marks) over the selected window, drawn from the
// SAME series the table below reads (`buildDailySeries`), so the panel and the
// rows cannot describe different periods.
//
// Choices worth naming:
//   * ONE shared scale for all three steps. A second axis would make unlocks
//     look healthy next to a visits collapse, which is the opposite of what a
//     conversion chart is for. Unlocks are sparse by nature and honestly read
//     as marks near the floor.
//   * EMPTY DAYS STAY. The series carries them (see `buildDailySeries`), so a
//     quiet week draws a quiet line instead of being compressed into a slope
//     that never happened.
//   * MONOTONE CUBIC smoothing, not Catmull-Rom: a smoothed line must never
//     overshoot between two points, because on a chart of counts an overshoot
//     draws traffic that never happened and an area that dips below zero.
//     Fritsch–Carlson tangents keep the curve inside the data.
//   * No gridline furniture: the peak and the zero are the only numbers the
//     line needs, and both are stated in the panel head, the axis row and the
//     hover guide. The window's date span is labelled underneath.
//   * Colour comes from CSS classes, never hex here, so the panel follows the
//     theme like every other surface.
import { useId, useState } from 'react'
import type { FunnelDayPoint } from '../lib/pubFunnel'

const W = 600
const H = 150
const PAD_X = 8
const PAD_Y = 12

type Pt = { x: number; y: number }

/** One point's position. `n === 1` has no span to divide by, so it centres. */
function xAt(i: number, n: number): number {
  if (n <= 1) return W / 2
  return PAD_X + (i / (n - 1)) * (W - PAD_X * 2)
}

function yAt(v: number, peak: number): number {
  const usable = H - PAD_Y * 2
  return H - PAD_Y - (peak > 0 ? (v / peak) * usable : 0)
}

/**
 * A monotone cubic through the points (Fritsch–Carlson tangents).
 *
 * Plain straight segments read as a spreadsheet; a naive Catmull-Rom spline
 * reads as marketing and *lies* — it bulges past the data between spikes, so a
 * bar chart of counts would show visits that never happened and the filled area
 * would dip below the zero line. Monotone tangents give the same smoothness
 * with the guarantee that the curve stays inside the points it connects.
 */
function smoothPath(pts: Pt[]): string {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`

  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x
    slope[i] = dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]
  }

  // Tangents: flat at local extrema, weighted mean elsewhere.
  const tan: number[] = new Array(n)
  tan[0] = slope[0]
  tan[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      tan[i] = 0
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      tan[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i])
    }
  }

  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3
    const c1y = pts[i].y + (tan[i] * dx[i]) / 3
    const c2x = pts[i + 1].x - dx[i] / 3
    const c2y = pts[i + 1].y - (tan[i + 1] * dx[i]) / 3
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`
  }
  return d
}

function seriesPoints(points: FunnelDayPoint[], peak: number, pick: (p: FunnelDayPoint) => number): Pt[] {
  return points.map((p, i) => ({ x: xAt(i, points.length), y: yAt(pick(p), peak) }))
}

/** "23 Sep" — the axis wants a date, not a timestamp. */
function axisDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** How the unlock stage's only source — the sales ledger — is doing. Unlocks
 *  come from sales, so an unread ledger means the unlocks are UNKNOWN, and a
 *  blank or a zero in that slot would read as "nobody bought". Three states
 *  rather than a boolean because waiting and failing are different sentences. */
export type UnlockRead = 'ready' | 'reading' | 'failed'

export function TrendChart({ points, label, unlockRead = 'ready' }: { points: FunnelDayPoint[]; label: string; unlockRead?: UnlockRead }) {
  // Unique per instance: the hub renders more than one chart (a fixture page,
  // or a future comparison), and duplicate SVG gradient ids would cross-wire.
  const fadeId = useId()
  const [hover, setHover] = useState<number | null>(null)

  // WHICH series peaked, not just how high: "peak 131 a day" named no series on
  // a chart that draws three, so the panel's only quantified number was the one
  // thing a reader could not attribute.
  const peakPoint = points.reduce<{ v: number; series: 'visits' | 'forks' | 'unlocks'; day: string }>(
    (best, p) => {
      let next = best
      const candidates: Array<[typeof best.series, number]> = [['visits', p.views], ['forks', p.forks], ['unlocks', p.unlocks]]
      for (const [series, v] of candidates) if (v > next.v) next = { v, series, day: p.day }
      return next
    },
    { v: 0, series: 'visits', day: points[0]?.day ?? '' },
  )
  const peak = peakPoint.v
  const totalViews = points.reduce((s, p) => s + p.views, 0)
  const totalForks = points.reduce((s, p) => s + p.forks, 0)
  const totalUnlocks = points.reduce((s, p) => s + p.unlocks, 0)
  const quiet = peak === 0
  const first = points[0]?.day
  const last = points[points.length - 1]?.day
  const active = hover !== null && !quiet ? points[hover] : null

  /** Nearest day to the pointer. The SVG scales to its container, so the mouse
   *  position is converted through the rendered box rather than assumed. */
  const trackPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (quiet || points.length === 0) return
    const box = e.currentTarget.getBoundingClientRect()
    if (box.width === 0) return
    const xView = ((e.clientX - box.left) / box.width) * W
    const t = (xView - PAD_X) / (W - PAD_X * 2)
    const i = Math.round(t * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }

  const tipPct = active ? Math.max(6, Math.min(94, (xAt(hover!, points.length) / W) * 100)) : 0

  return (
    <figure className="hub-chart">
      <svg
        className={`hub-chart-svg${quiet ? ' is-quiet' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Recorded traffic over ${label}: ${totalViews} visits, ${totalForks} forks${unlockRead === 'ready' ? `, ${totalUnlocks} unlocks` : unlockRead === 'reading' ? '; unlocks still being read' : '; unlocks could not be read'}.`}
        onPointerMove={trackPointer}
        onPointerDown={trackPointer}
        // A tap must LATCH the readout — a finger has no hover, and clearing on
        // lift would make the panel unusable on the phone this app ships to.
        // Only a departing mouse dismisses it.
        onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null) }}
        // Keyboard parity with the pointer: the chart is a reading tool, and a
        // readout only a mouse can reach is a readout half the users never see.
        tabIndex={0}
        onKeyDown={e => {
          if (quiet || points.length === 0) return
          const last = points.length - 1
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setHover(i => Math.min(last, (i ?? -1) + 1)); e.preventDefault() }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setHover(i => Math.max(0, (i ?? last + 1) - 1)); e.preventDefault() }
          else if (e.key === 'Home') { setHover(0); e.preventDefault() }
          else if (e.key === 'End') { setHover(last); e.preventDefault() }
          else if (e.key === 'Escape') setHover(null)
        }}
        onBlur={() => setHover(null)}
      >
        <defs>
          <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="hc-fade-top" />
            <stop offset="100%" className="hc-fade-bottom" />
          </linearGradient>
        </defs>
        <line className="hc-zero" x1="0" y1={H - PAD_Y} x2={W} y2={H - PAD_Y} vectorEffect="non-scaling-stroke" />
        {!quiet && (
          <>
            <path
              className="hc-views-area"
              fill={`url(#${fadeId})`}
              d={`${smoothPath(seriesPoints(points, peak, p => p.views))} L${xAt(points.length - 1, points.length).toFixed(2)},${H - PAD_Y} L${xAt(0, points.length).toFixed(2)},${H - PAD_Y} Z`}
            />
            <path className="hc-views-line" d={smoothPath(seriesPoints(points, peak, p => p.views))} vectorEffect="non-scaling-stroke" />
            <path className="hc-forks-line" d={smoothPath(seriesPoints(points, peak, p => p.forks))} vectorEffect="non-scaling-stroke" />
            {/* Only marks we actually read: an unread ledger draws no unlock
                dots rather than dots at zero. The mark wears the SAME hue as
                the row's unlock figure (`--ink-amber`), so the unlock stage is
                one colour everywhere on the page and saffron stays reserved for
                publish/invite actions. */}
            {unlockRead === 'ready' && points.map((p, i) => (p.unlocks > 0 ? (
              <circle key={p.day} className="hc-unlock" cx={xAt(i, points.length)} cy={yAt(p.unlocks, peak)} r="4" />
            ) : null))}
            {/* The guide: one vertical line and one dot per series at the day
                under the pointer. Drawn last so it sits over the fills. */}
            {active && (
              <>
                <line className="hc-guide" x1={xAt(hover!, points.length)} y1={PAD_Y} x2={xAt(hover!, points.length)} y2={H - PAD_Y} vectorEffect="non-scaling-stroke" />
                <circle className="hc-hover-dot" cx={xAt(hover!, points.length)} cy={yAt(active.views, peak)} r="4.5" />
                <circle className="hc-hover-dot is-forks" cx={xAt(hover!, points.length)} cy={yAt(active.forks, peak)} r="3.5" />
              </>
            )}
          </>
        )}
      </svg>

      {/* Axis: the window's own span, so the line can be read without a legend
          of dates. Kept as DOM text (not SVG) so it stays crisp at any width. */}
      <div className="hub-chart-axis">
        <span>{first ? axisDay(first) : ''}</span>
        <span className="hub-chart-peak">
          {quiet ? 'Nothing recorded in this window' : `peak ${peak.toLocaleString('en-IN')} ${peakPoint.series} on ${axisDay(peakPoint.day)}`}
        </span>
        <span>{last ? axisDay(last) : ''}</span>
      </div>

      {/* The hover readout. DOM, not SVG, so the type stays crisp on a phone
          where the drawing itself is scaled down. */}
      {active && (
        <div className="hub-chart-tip" style={{ left: `clamp(72px, ${tipPct}%, calc(100% - 72px))` }}>
          <b>{axisDay(active.day)}</b>
          <span>Visits {active.views.toLocaleString('en-IN')}</span>
          <span>Forks {active.forks.toLocaleString('en-IN')}</span>
          {unlockRead === 'ready'
            ? <span>Unlocks {active.unlocks.toLocaleString('en-IN')}</span>
            : <span className="muted">{unlockRead === 'reading' ? 'Unlocks reading…' : 'Unlocks not read'}</span>}
        </div>
      )}

      <figcaption className="hub-chart-key">
        <span className="hc-key"><i className="hc-swatch hc-swatch-views" aria-hidden />Visits <b className="num">{totalViews.toLocaleString('en-IN')}</b></span>
        <span className="hc-key"><i className="hc-swatch hc-swatch-forks" aria-hidden />Forks <b className="num">{totalForks.toLocaleString('en-IN')}</b></span>
        <span className="hc-key"><i className="hc-swatch hc-swatch-unlocks" aria-hidden />Unlocks <b className="num">{unlockRead === 'ready' ? totalUnlocks.toLocaleString('en-IN') : unlockRead === 'reading' ? 'reading…' : 'not read'}</b></span>
      </figcaption>
    </figure>
  )
}
