import { useEffect, useMemo, useState } from 'react'
import { OverviewElevationProfile } from '../../trips/OverviewElevationProfile'
import type { Trip } from '../../../data/types'
import { ELEVATION_ATTRIBUTION, ELEVATION_CREDIT_URL, measureRouteHeights, type RouteHeightInput, type RouteHeightPoint, type RouteHeightsResult } from '../../../lib/elevation'
import { activeElevationTileLoader } from '../../../lib/elevationTiles'

type HeightState = { kind: 'loading' } | RouteHeightsResult

export function rideHeightPoints(trip: Trip, freeIndexes: readonly number[]): RouteHeightInput[] {
  return [...trip.days].sort((a, b) => a.index - b.index)
    .flatMap(day => [...day.stops].filter(stop => stop.status !== 'rejected').sort((a, b) => a.orderInDay - b.orderInDay)
      .map(stop => ({ stop, dayIndex: day.index })))
    .map((row, chainIndex) => ({ ...row, chainIndex }))
    .filter(row => freeIndexes.includes(row.dayIndex))
    .map(({ stop, dayIndex, chainIndex }) => ({ key: stop.id, title: stop.title, kind: 'stop', dayIndex, lat: stop.lat, lng: stop.lng, chainIndex }))
}

// The paid-band helpers live in `elevationPlot.ts`, next to the plot they read.
export { paidDaysLabel, paidHeightBands, type PaidHeightBand } from '../../../lib/elevationPlot'

/**
 * Measures the heights at the free days' places. The result is loading,
 * failed, empty or measured. These states stay separate.
 */
export function useRouteHeights(trip: Trip, freeIndexes: readonly number[]) {
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
  return { result, paidIndexes }
}

/** One caption line from the highest measured free place. It never names a paid day. */
export function rideHeightCaption(peak: RouteHeightPoint | null, maxM: number): string | null {
  if (!peak) return null
  const day = peak.dayIndex != null ? `, day ${peak.dayIndex + 1}` : ''
  return `The free days reach ${Math.round(maxM).toLocaleString('en-IN')} m at ${peak.title}${day}. Paid days are not measured.`
}

/** The Ride along side card. It paints the Overview height chart with paid bands and day labels. */
export function RideElevation({ trip, freeIndexes }: { trip: Trip; freeIndexes: readonly number[] }) {
  const { result, paidIndexes } = useRouteHeights(trip, freeIndexes)
  if (result.kind === 'empty') return null
  if (result.kind === 'loading') return <p className="pi-height-state" role="status">Loading route heights…</p>
  if (result.kind === 'failed') return <p className="pi-height-state">Route heights are not available.</p>
  if (result.runs.length === 0) return null
  const caption = rideHeightCaption(result.stats.peak, result.stats.maxM)
  return <section className="pi-card pi-ride-height" aria-labelledby="pi-ride-height-title">
    <div className="pi-height-heading"><h3 id="pi-ride-height-title">The road, by height</h3><span>{Math.round(result.stats.minM).toLocaleString('en-IN')}–{Math.round(result.stats.maxM).toLocaleString('en-IN')} m</span></div>
    <OverviewElevationProfile points={result.points} runs={result.runs} stats={result.stats} compact paidIndexes={paidIndexes} dayLabels hidePlaces />
    {caption && <p>{caption}</p>}
    <details><summary>Elevation source</summary><p>The line between places is illustrative. {ELEVATION_ATTRIBUTION}</p><a href={ELEVATION_CREDIT_URL} target="_blank" rel="noreferrer">Source credits</a></details>
  </section>
}
