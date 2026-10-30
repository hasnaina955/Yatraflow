// ============ The route card's height curve ============
// Paints the geometry `elevationPlot.ts` returns. The curve is illustrative:
// it joins the public terrain estimates at the trip's own places and never
// claims the ground between them.
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RouteHeightCurveRun, RouteHeightPoint, RouteHeightStats } from '../../lib/elevation'
import { buildRouteHeightPlot } from '../../lib/elevationPlot'
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
}: {
  points: readonly RouteHeightPoint[]
  runs: readonly RouteHeightCurveRun[]
  stats: RouteHeightStats
  compact: boolean
  /** The trip's true shape, drawn small in the corner. Null hides it. */
  insetPath?: string | null
}) {
  const { ref, width } = useDrawableWidth(compact ? 420 : 720)
  const height = Math.max(compact ? 150 : 170, Math.min(280, Math.round(width * 0.42)))
  const plot = useMemo(
    () => buildRouteHeightPlot(points, runs, stats, width, height),
    [points, runs, stats, width, height],
  )
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const skyId = `ovw-sky-${uid}`
  const landId = `ovw-land-${uid}`

  // No text labels on the curve: the peak callout names the highest place and
  // the stop list names every place, so the drawing stays clean.
  const labelled = useMemo(() => [] as typeof plot.marks, [plot])

  const peak = plot.peak
  const peakBoxH = 34
  const peakLabel = peak ? overviewPinText(peak.title, compact ? 18 : 24) : ''
  const peakBoxW = Math.min(
    Math.max(80, width - 20),
    Math.max(compact ? 132 : 156, Math.round(peakLabel.length * 6.4) + 24),
  )
  const peakBoxX = Math.max(6, width - peakBoxW - 10)
  const peakBoxY = 8

  return (
    <div ref={ref} className="ovw-elev">
      <svg
        className="ovw-elev-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={[
          'Illustrative route heights from public terrain estimates.',
          `Lowest place ${Math.round(stats.minM)} metres, highest place ${Math.round(stats.maxM)} metres.`,
          peak ? `The highest is ${peak.title}.` : '',
        ].filter(Boolean).join(' ')}
      >
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="ovw-elev-sky-top" />
            <stop offset="1" className="ovw-elev-sky-bottom" />
          </linearGradient>
          <linearGradient id={landId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="ovw-elev-land-top" />
            <stop offset="1" className="ovw-elev-land-bottom" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={width} height={height} fill={`url(#${skyId})`} />
        <circle className="ovw-elev-sun" cx={width * 0.52} cy={height * 0.16} r={compact ? 9 : 12} aria-hidden="true" />
        <rect className="ovw-elev-band" x="0" y={plot.baseY} width={width} height={height - plot.baseY} aria-hidden="true" />

        {plot.runs.map((run, index) => (
          <g key={`run-${index}`}>
            <path className="ovw-elev-area" d={run.area} fill={`url(#${landId})`} />
            <path className="ovw-elev-line" d={run.line} />
          </g>
        ))}

        {plot.marks.map(mark => (
          <circle
            key={`${mark.kind}-${mark.distanceKm}-${mark.title}`}
            className={`ovw-elev-dot is-${mark.kind}`}
            cx={mark.x}
            cy={mark.y}
            r={mark.kind === 'start' || mark.kind === 'destination' ? 4 : 3}
          />
        ))}

        {labelled.map(mark => {
          const anchor = mark.x > width * 0.72 ? 'end' : 'start'
          const dx = anchor === 'end' ? -7 : 7
          return (
            <text
              key={`label-${mark.title}-${mark.distanceKm}`}
              className="ovw-elev-name"
              x={mark.x + dx}
              y={Math.max(plot.pad.top + 8, mark.y - 8)}
              textAnchor={anchor}
            >
              {overviewPinText(mark.title, compact ? 14 : 20)}
            </text>
          )
        })}

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

        {plot.ticksX.map((tick, index) => (
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
      </svg>
    </div>
  )
}
