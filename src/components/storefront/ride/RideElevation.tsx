import { useEffect, useMemo, useState } from 'react'
import type { Trip } from '../../../data/types'
import { ELEVATION_ATTRIBUTION, ELEVATION_CREDIT_URL, measureRouteHeights, type RouteHeightInput, type RouteHeightPoint, type RouteHeightsResult } from '../../../lib/elevation'
import { activeElevationTileLoader } from '../../../lib/elevationTiles'
import { buildRouteHeightPlot, type RouteHeightPlot } from '../../../lib/elevationPlot'

type HeightState = { kind: 'loading' } | RouteHeightsResult

export function rideHeightPoints(trip: Trip, freeIndexes: readonly number[]): RouteHeightInput[] {
  return [...trip.days].sort((a, b) => a.index - b.index)
    .flatMap(day => [...day.stops].filter(stop => stop.status !== 'rejected').sort((a, b) => a.orderInDay - b.orderInDay)
      .map(stop => ({ stop, dayIndex: day.index })))
    .map((row, chainIndex) => ({ ...row, chainIndex }))
    .filter(row => freeIndexes.includes(row.dayIndex))
    .map(({ stop, dayIndex, chainIndex }) => ({ key: stop.id, title: stop.title, kind: 'stop', dayIndex, lat: stop.lat, lng: stop.lng, chainIndex }))
}

export interface PaidHeightBand {
  x: number
  width: number
  /** "Days 5–8 · paid plan". Built from day numbers only, never from a place. */
  label: string
}

/** "Day 5" for one day, "Days 5–8" for a run. */
export function paidDaysLabel(first: number, last: number): string {
  return first === last ? `Day ${first + 1} · paid plan` : `Days ${first + 1}–${last + 1} · paid plan`
}

/**
 * One band for each stretch of paid days that sits between two free places.
 * The band spans the chart's own gap, so it carries no height and no name.
 * Paid days at the very start or end have no gap to mark and get no band.
 */
export function paidHeightBands(
  points: readonly RouteHeightPoint[],
  plot: Pick<RouteHeightPlot, 'width' | 'pad' | 'maxDistanceKm'>,
  paidIndexes: readonly number[],
): PaidHeightBand[] {
  const plotW = Math.max(1, plot.width - plot.pad.left - plot.pad.right)
  const xOf = (km: number) => plot.pad.left + (km / plot.maxDistanceKm) * plotW
  const bands: PaidHeightBand[] = []
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1].dayIndex
    const after = points[i].dayIndex
    if (before == null || after == null || after - before < 2) continue
    const between = paidIndexes.filter(day => day > before && day < after).sort((a, b) => a - b)
    if (between.length === 0) continue
    const x = xOf(points[i - 1].distanceKm)
    bands.push({ x, width: Math.max(0, xOf(points[i].distanceKm) - x), label: paidDaysLabel(between[0], between[between.length - 1]) })
  }
  return bands
}

export function RideElevation({ trip, freeIndexes }: { trip: Trip; freeIndexes: readonly number[] }) {
  const points = useMemo(() => rideHeightPoints(trip, freeIndexes), [trip, freeIndexes])
  const paidIndexes = useMemo(() => trip.days.map(day => day.index).filter(index => !freeIndexes.includes(index)), [trip, freeIndexes])
  const [loaded, setLoaded] = useState<{ points: readonly RouteHeightInput[]; result: RouteHeightsResult } | null>(null)
  const result: HeightState = loaded?.points === points ? loaded.result : { kind: 'loading' }
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      controller.abort()
      setLoaded({ points, result: { kind: 'failed', reason: 'tiles' } })
    }, 12_000)
    void measureRouteHeights(points, activeElevationTileLoader(), controller.signal).then(value => {
      if (!controller.signal.aborted) setLoaded({ points, result: value })
    }).catch(() => { if (!controller.signal.aborted) setLoaded({ points, result: { kind: 'failed', reason: 'tiles' } }) })
      .finally(() => window.clearTimeout(timer))
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [points])
  if (result.kind === 'empty') return null
  if (result.kind === 'loading') return <p className="pi-height-state" role="status">Loading route heights…</p>
  if (result.kind === 'failed') return <p className="pi-height-state">Route heights are not available.</p>
  if (result.runs.length === 0) return null
  const plot = buildRouteHeightPlot(result.points, result.runs, result.stats, 320, 104)
  const bands = paidHeightBands(result.points, plot, paidIndexes)
  const bandTop = 8
  return <section className="pi-card pi-ride-height" aria-labelledby="pi-ride-height-title">
    <div className="pi-height-heading"><h3 id="pi-ride-height-title">The road, by height</h3><span>{Math.round(result.stats.minM).toLocaleString()} to {Math.round(result.stats.maxM).toLocaleString()} m</span></div>
    <svg viewBox="0 0 320 104" role="img" aria-label={`Heights at the free days' places.${bands.length ? ` ${bands.map(band => band.label).join(', ')}: no height data.` : ''} Gaps have no height data.`}>
      {bands.map(band => {
        const centre = band.x + band.width / 2
        const mid = (bandTop + plot.baseY) / 2
        const [days, plan] = band.label.split(' · ')
        const oneLine = band.width >= 112
        return <g key={band.x} className="pi-height-paid">
          <rect className="pi-height-paid-band" x={band.x} y={bandTop} width={band.width} height={plot.baseY - bandTop} />
          <text className="pi-height-paid-label" x={centre} y={mid} textAnchor="middle">
            {oneLine ? <tspan x={centre} dy="0.35em">{band.label}</tspan> : <><tspan x={centre} dy="-0.35em">{days}</tspan><tspan x={centre} dy="1.2em">{plan}</tspan></>}
          </text>
        </g>
      })}
      {plot.runs.map((run, index) => <g key={index}><path className="pi-height-fill" d={run.area} /><path className="pi-height-line" d={run.line} pathLength={1} /></g>)}
    </svg>
    <p>Public terrain heights at the free days&apos; places. The line between places is illustrative.</p>
    <details><summary>Elevation source</summary><p>{ELEVATION_ATTRIBUTION}</p><a href={ELEVATION_CREDIT_URL} target="_blank" rel="noreferrer">Source credits</a></details>
  </section>
}
