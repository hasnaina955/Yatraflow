import { useEffect, useMemo, useState } from 'react'
import type { Trip } from '../../../data/types'
import { ELEVATION_ATTRIBUTION, ELEVATION_CREDIT_URL, measureRouteHeights, type RouteHeightInput, type RouteHeightsResult } from '../../../lib/elevation'
import { activeElevationTileLoader } from '../../../lib/elevationTiles'
import { buildRouteHeightPlot } from '../../../lib/elevationPlot'

type HeightState = { kind: 'loading' } | RouteHeightsResult

export function rideHeightPoints(trip: Trip, freeIndexes: readonly number[]): RouteHeightInput[] {
  return [...trip.days].sort((a, b) => a.index - b.index)
    .flatMap(day => [...day.stops].filter(stop => stop.status !== 'rejected').sort((a, b) => a.orderInDay - b.orderInDay)
      .map(stop => ({ stop, dayIndex: day.index })))
    .map((row, chainIndex) => ({ ...row, chainIndex }))
    .filter(row => freeIndexes.includes(row.dayIndex))
    .map(({ stop, dayIndex, chainIndex }) => ({ key: stop.id, title: stop.title, kind: 'stop', dayIndex, lat: stop.lat, lng: stop.lng, chainIndex }))
}

export function RideElevation({ trip, freeIndexes }: { trip: Trip; freeIndexes: readonly number[] }) {
  const points = useMemo(() => rideHeightPoints(trip, freeIndexes), [trip, freeIndexes])
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
  return <section className="pi-card pi-ride-height" aria-labelledby="pi-ride-height-title">
    <div className="pi-height-heading"><h3 id="pi-ride-height-title">The road, by height</h3><span>{Math.round(result.stats.minM).toLocaleString()} to {Math.round(result.stats.maxM).toLocaleString()} m</span></div>
    <svg viewBox="0 0 320 104" role="img" aria-label="Heights at the free days' places. Gaps have no height data.">
      {plot.runs.map((run, index) => <g key={index}><path className="pi-height-fill" d={run.area} /><path className="pi-height-line" d={run.line} /></g>)}
    </svg>
    <p>Public terrain heights at the free days&apos; places. The line between places is illustrative.</p>
    <details><summary>Elevation source</summary><p>{ELEVATION_ATTRIBUTION}</p><a href={ELEVATION_CREDIT_URL} target="_blank" rel="noreferrer">Source credits</a></details>
  </section>
}
