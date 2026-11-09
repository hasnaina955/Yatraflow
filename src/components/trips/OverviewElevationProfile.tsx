// ============ The route card's height curve ============
// Paints the geometry `elevationPlot.ts` returns. The curve is illustrative:
// it joins the public terrain estimates at the trip's own places and never
// claims the ground between them.
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RouteHeightCurveRun, RouteHeightPoint, RouteHeightStats } from '../../lib/elevation'
import { buildRouteHeightPlot, paidHeightBands } from '../../lib/elevationPlot'
import { overviewPinText } from '../../lib/overviewRouteMap'

/** The SVG fills the CONTENT box of its frame, so measure that box only. */
function useDrawableWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const read = (entry?: ResizeObserverEntry) => {
      if (entry) return Math.max(1, entry.contentRect.width)
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const border = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      return Math.max(1, rect.width - border - padding)
    }
    setWidth(read())
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => setWidth(read(entries[0])))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

export function OverviewElevationProfile({
  points,
  runs,
  stats,
  compact,
  insetPath,
  paidIndexes,
  dayLabels,
  hidePlaces,
}: {
  points: readonly RouteHeightPoint[]
  runs: readonly RouteHeightCurveRun[]
  stats: RouteHeightStats
  compact: boolean
  /** The trip's true shape, drawn small in the corner. Null hides it. */
  insetPath?: string | null
  /** Days with no measured height. Each paid run between free places gets a band with day numbers only. */
  paidIndexes?: readonly number[]
  /** Label the two ends of the axis with day numbers, not distances. */
  dayLabels?: boolean
  /** Draw no place dots, names or peak box. The public page uses this so a paid day never leaks a name. */
  hidePlaces?: boolean
}) {
  const { ref, width } = useDrawableWidth(compact ? 420 : 720)
  const height = Math.max(compact ? 150 : 170, Math.min(280, Math.round(width * 0.45)))
  const plot = useMemo(
    () => buildRouteHeightPlot(points, runs, stats, width, height),
    [points, runs, stats, width, height],
  )
  const bands = useMemo(
    () => (paidIndexes && paidIndexes.length > 0 ? paidHeightBands(points, plot, paidIndexes) : []),
    [points, plot, paidIndexes],
  )
  const dayTicks = useMemo(() => {
    if (!dayLabels) return null
    const owned = plot.marks.filter(mark => mark.dayIndex != null).sort((a, b) => a.x - b.x)
    if (owned.length === 0) return []
    const first = owned[0]
    const last = owned[owned.length - 1]
    return first.dayIndex === last.dayIndex
      ? [{ x: first.x, label: `Day ${first.dayIndex! + 1}`, anchor: 'start' as const }]
      : [{ x: first.x, label: `Day ${first.dayIndex! + 1}`, anchor: 'start' as const }, { x: last.x, label: `Day ${last.dayIndex! + 1}`, anchor: 'end' as const }]
  }, [dayLabels, plot])
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const skyId = `ovw-sky-${uid}`
  const landId = `ovw-land-${uid}`

  // Only the two ends of the trip carry a label on the curve, each with its
  // real place name and real height. The stop list names every other place.
  const labelled = useMemo(
    () => plot.marks.filter(mark => mark.kind === 'start' || mark.kind === 'destination'),
    [plot],
  )

  const peak = hidePlaces ? null : plot.peak
  const peakBoxH = 34
  const peakLabel = peak ? overviewPinText(peak.title, compact ? 18 : 24) : ''
  const peakBoxW = Math.min(
    Math.max(80, width - 20),
    Math.max(compact ? 132 : 156, Math.round(peakLabel.length * 6.4) + 24),
  )
  const peakBoxX = Math.max(6, width - peakBoxW - 10)
  const peakBoxY = 8
  // The first point of the true-shape path, where the inset's start dot sits.
  const insetStart = insetPath?.match(/^M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/)

  return (
    <div ref={ref} className={hidePlaces ? 'ovw-elev ovw-elev--side' : 'ovw-elev'}>
      <svg
        className="ovw-elev-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={[
          'Illustrative route heights from public terrain estimates.',
          `Lowest place ${Math.round(stats.minM)} metres, highest place ${Math.round(stats.maxM)} metres.`,
          peak ? `The highest is ${peak.title}.` : '',
          bands.length > 0 ? `${bands.map(band => band.label).join(', ')}: no height data.` : '',
        ].filter(Boolean).join(' ')}
      >
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="ovw-elev-sky-top" />
            <stop offset="0.6" className="ovw-elev-sky-bottom" />
          </linearGradient>
          <linearGradient id={landId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="ovw-elev-land-top" />
            <stop offset="1" className="ovw-elev-land-bottom" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={width} height={height} fill={`url(#${skyId})`} />
        <circle className="ovw-elev-sun-halo" cx={width * 0.141} cy={height * 0.207} r={24} aria-hidden="true" />
        <circle className="ovw-elev-sun" cx={width * 0.141} cy={height * 0.207} r={15} aria-hidden="true" />
        <rect className="ovw-elev-band" x="0" y={plot.baseY} width={width} height={height - plot.baseY} aria-hidden="true" />

        {bands.map(band => {
          if (band.edge) return <rect key={band.edge} className="ovw-elev-paid-band" x={band.x} y={0} width={band.width} height={plot.baseY} aria-hidden="true" />
          const centre = band.x + band.width / 2
          const mid = plot.baseY / 2
          return (
            <g key={band.x} className="ovw-elev-paid" aria-hidden="true">
              <rect className="ovw-elev-paid-band" x={band.x} y={0} width={band.width} height={plot.baseY} />
              <text className="ovw-elev-paid-label" x={centre} y={mid} textAnchor="middle">
                <tspan x={centre} dy="-0.35em">{band.label.split(' · ')[0]}</tspan>
                <tspan x={centre} dy="1.25em">paid days</tspan>
              </text>
            </g>
          )
        })}

        {/* Two far ranges are the same plotted curve scaled up from the baseline.
            They add depth behind the route and carry no height of their own. */}
        {plot.runs.map((run, index) => (
          <g key={`run-${index}`}>
            <path className="ovw-elev-hill-far" d={run.area} transform={`translate(0 ${plot.baseY}) scale(1 1.12) translate(0 ${-plot.baseY})`} aria-hidden="true" />
            <path className="ovw-elev-hill-near" d={run.area} transform={`translate(0 ${plot.baseY}) scale(1 1.04) translate(0 ${-plot.baseY})`} aria-hidden="true" />
            <path className="ovw-elev-area" d={run.area} fill={`url(#${landId})`} />
            {/* `pathLength={1}` lets the CSS dash draw run the whole curve once,
                instead of leaving it dotted at its real length. */}
            <path className="ovw-elev-line" d={run.line} pathLength={1} />
            <path className="ovw-elev-line-centre" d={run.line} aria-hidden="true" />
          </g>
        ))}

        {/* One group, so the marks arrive as one beat in the CSS cascade. */}
        {!hidePlaces && <g className="ovw-elev-marks">
          {plot.marks.map(mark => (
            <circle
              key={`${mark.kind}-${mark.distanceKm}-${mark.title}`}
              className={`ovw-elev-dot is-${mark.kind}`}
              cx={mark.x}
              cy={mark.y}
              r={mark.kind === 'destination' ? 7 : mark.kind === 'start' ? 6 : 4.5}
            />
          ))}
        </g>}

        {!hidePlaces && <g className="ovw-elev-labels">
          {labelled.map(mark => {
            const anchor = mark.x > width * 0.72 ? 'end' : 'start'
            const dx = anchor === 'end' ? -7 : 7
            const nameY = Math.max(plot.pad.top + 8, mark.y - 24)
            return (
              <g key={`label-${mark.title}-${mark.distanceKm}`}>
                <text className="ovw-elev-name" x={mark.x + dx} y={nameY} textAnchor={anchor}>
                  {overviewPinText(mark.title, compact ? 14 : 20)}
                </text>
                <text className="ovw-elev-height" x={mark.x + dx} y={nameY + 13} textAnchor={anchor}>
                  {Math.round(mark.elevationM).toLocaleString('en-IN')} m
                </text>
              </g>
            )
          })}
        </g>}

        {peak && (
          <g className="ovw-elev-peak">
            <line
              className="ovw-elev-leader"
              x1={peak.x}
              y1={peak.y}
              x2={peakBoxX + 16}
              y2={peakBoxY + peakBoxH}
            />
            <rect x={peakBoxX} y={peakBoxY} width={peakBoxW} height={peakBoxH} rx="8" />
            <text className="ovw-elev-peak-title" x={peakBoxX + 10} y={peakBoxY + 14}>
              {peakLabel}
            </text>
            <text className="ovw-elev-peak-value" x={peakBoxX + 10} y={peakBoxY + 27}>
              {Math.round(peak.elevationM).toLocaleString('en-IN')} m
              {peak.dayIndex != null ? ` · Day ${peak.dayIndex + 1}` : ''}
            </text>
          </g>
        )}

        <g className="ovw-elev-axes">
          {dayTicks && dayTicks.map(tick => (
            <text key={tick.label} className="ovw-elev-axis is-x" x={tick.x} y={plot.baseY + 18} textAnchor={tick.anchor}>{tick.label}</text>
          ))}
          {!dayTicks && plot.ticksX.map((tick, index) => (
            <text
              key={`x-${tick.label}`}
              className="ovw-elev-axis is-x"
              x={tick.x}
              y={plot.baseY + 18}
              textAnchor={index === 0 ? 'start' : index === plot.ticksX.length - 1 ? 'end' : 'middle'}
            >
              {tick.label}
            </text>
          ))}
        </g>
      </svg>

      {insetPath && (
        <div className="ovw-elev-inset">
          <svg className="ovw-elev-inset-svg" viewBox="0 0 112 96" width="112" height="96" aria-hidden="true" focusable="false">
            <g className="ovw-elev-inset-grid">
              <path d="M0 24 Q56 22 112 24" />
              <path d="M0 48 Q56 46 112 48" />
              <path d="M0 72 Q56 70 112 72" />
              <path d="M28 0 Q26 48 28 96" />
              <path d="M56 0 Q54 48 56 96" />
              <path d="M84 0 Q82 48 84 96" />
            </g>
            <path className="ovw-elev-inset-case" d={insetPath} />
            <path className="ovw-elev-inset-line" d={insetPath} />
            {insetStart && <circle className="ovw-elev-inset-start" cx={+insetStart[1]} cy={+insetStart[2]} r={3.6} />}
            <circle className="ovw-elev-inset-n" cx={104} cy={8} r={7} />
            <text className="ovw-elev-inset-n-text" x={104} y={11.2} textAnchor="middle">N</text>
          </svg>
          <span>True shape · north up</span>
        </div>
      )}
    </div>
  )
}
