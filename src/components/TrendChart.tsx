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
//   * No gridline furniture: the peak and the zero are the only numbers the
//     line needs, and both are stated in the panel head and the caption. The
//     window's date span is labelled underneath.
//   * Colour comes from CSS classes, never hex here, so the panel follows the
//     theme like every other surface.
import type { FunnelDayPoint } from '../lib/pubFunnel'
import { formatInr } from '../lib/engine'

const W = 600
const H = 150
const PAD_X = 8
const PAD_Y = 12

/** One point's position. `n === 1` has no span to divide by, so it centres. */
function xAt(i: number, n: number): number {
  if (n <= 1) return W / 2
  return PAD_X + (i / (n - 1)) * (W - PAD_X * 2)
}

function yAt(v: number, peak: number): number {
  const usable = H - PAD_Y * 2
  return H - PAD_Y - (peak > 0 ? (v / peak) * usable : 0)
}

function linePath(points: FunnelDayPoint[], peak: number, pick: (p: FunnelDayPoint) => number): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i, points.length).toFixed(2)},${yAt(pick(p), peak).toFixed(2)}`)
    .join(' ')
}

function areaPath(points: FunnelDayPoint[], peak: number, pick: (p: FunnelDayPoint) => number): string {
  const top = linePath(points, peak, pick)
  const lastX = xAt(points.length - 1, points.length).toFixed(2)
  const firstX = xAt(0, points.length).toFixed(2)
  return `${top} L${lastX},${H - PAD_Y} L${firstX},${H - PAD_Y} Z`
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
  const peak = points.reduce((m, p) => Math.max(m, p.views, p.forks, p.unlocks), 0)
  const totalViews = points.reduce((s, p) => s + p.views, 0)
  const totalForks = points.reduce((s, p) => s + p.forks, 0)
  const totalUnlocks = points.reduce((s, p) => s + p.unlocks, 0)
  const quiet = peak === 0
  const first = points[0]?.day
  const last = points[points.length - 1]?.day

  return (
    <figure className="hub-chart">
      <svg
        className={`hub-chart-svg${quiet ? ' is-quiet' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Recorded traffic over ${label}: ${totalViews} visits, ${totalForks} forks${unlockRead === 'ready' ? `, ${totalUnlocks} unlocks` : unlockRead === 'reading' ? '; unlocks still being read' : '; unlocks could not be read'}.`}
      >
        <line className="hc-zero" x1="0" y1={H - PAD_Y} x2={W} y2={H - PAD_Y} vectorEffect="non-scaling-stroke" />
        {!quiet && (
          <>
            <path className="hc-views-area" d={areaPath(points, peak, p => p.views)} />
            <path className="hc-views-line" d={linePath(points, peak, p => p.views)} vectorEffect="non-scaling-stroke" />
            <path className="hc-forks-line" d={linePath(points, peak, p => p.forks)} vectorEffect="non-scaling-stroke" />
            {/* Only marks we actually read: an unread ledger draws no unlock
                dots rather than dots at zero. */}
            {unlockRead === 'ready' && points.map((p, i) => (p.unlocks > 0 ? (
              <circle key={p.day} className="hc-unlock" cx={xAt(i, points.length)} cy={yAt(p.unlocks, peak)} r="4" />
            ) : null))}
          </>
        )}
      </svg>

      {/* Axis: the window's own span, so the line can be read without a legend
          of dates. Kept as DOM text (not SVG) so it stays crisp at any width. */}
      <div className="hub-chart-axis">
        <span>{first ? axisDay(first) : ''}</span>
        <span className="hub-chart-peak">
          {quiet ? 'Nothing recorded in this window' : `peak ${peak.toLocaleString('en-IN')} a day`}
        </span>
        <span>{last ? axisDay(last) : ''}</span>
      </div>

      <figcaption className="hub-chart-key">
        <span className="hc-key"><i className="hc-swatch hc-swatch-views" aria-hidden />Visits <b className="num">{totalViews.toLocaleString('en-IN')}</b></span>
        <span className="hc-key"><i className="hc-swatch hc-swatch-forks" aria-hidden />Forks <b className="num">{totalForks.toLocaleString('en-IN')}</b></span>
        <span className="hc-key"><i className="hc-swatch hc-swatch-unlocks" aria-hidden />Unlocks <b className="num">{unlockRead === 'ready' ? totalUnlocks.toLocaleString('en-IN') : unlockRead === 'reading' ? 'reading…' : 'not read'}</b></span>
      </figcaption>
    </figure>
  )
}

/** Rupee form used by the KPI strip's money cell — kept beside the chart so the
 *  hub imports one money formatter, not two spellings of the same figure. */
export const formatHubInr = formatInr
