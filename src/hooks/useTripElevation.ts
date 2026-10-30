// ============ Route heights for one trip ============
// One measurement feeds both the card's curve and its "Highest stop" tile, so
// the two cannot disagree.
//
// The heights are public terrain estimates at the trip's own places. A trip
// that is flown or railed keeps the schematic route: a road-height curve says
// nothing about a flight.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Trip } from '../data/types'
import type { OverviewRouteRow } from '../lib/overviewTruth'
import {
  measureRouteHeights,
  type RouteHeightPoint,
  type RouteHeightsResult,
} from '../lib/elevation'
import { activeElevationTileLoader } from '../lib/elevationTiles'

/** Modes whose route is a road, so a height curve describes the journey. */
export const ELEVATION_ROAD_MODES: ReadonlySet<string> = new Set([
  'car', 'rental', 'motorcycle', 'taxi', 'bus',
])

export type ElevationView = 'unsupported' | 'loading' | 'measured' | 'empty' | 'failed' | 'retained'

export type MeasuredRouteHeights = Extract<RouteHeightsResult, { kind: 'measured' }>

export interface TripElevation {
  view: ElevationView
  result: MeasuredRouteHeights | null
  /** The real places, with a height where one could be read. */
  points: RouteHeightPoint[]
  retry: () => void
}

export function elevationSupportsMode(mode: string): boolean {
  return ELEVATION_ROAD_MODES.has(mode)
}

export function routeHeightSignature(inputs: readonly Pick<OverviewRouteRow, 'key' | 'title' | 'kind' | 'dayIndex' | 'lat' | 'lng' | 'chainIndex'>[]): string {
  return JSON.stringify(inputs)
}

/** True when a finished request belongs to the places and the count on screen. */
export function elevationResultApplies(
  settled: { signature: string; attempt: number } | null,
  signature: string,
  attempt: number,
): boolean {
  return !!settled && settled.signature === signature && settled.attempt === attempt
}

export function useTripElevation(
  trip: Pick<Trip, 'transportMode'>,
  rows: readonly OverviewRouteRow[],
): TripElevation {
  const supported = elevationSupportsMode(trip.transportMode) && rows.length >= 2

  const inputs = useMemo(() => rows.map(row => ({
    key: row.key,
    title: row.title,
    kind: row.kind,
    dayIndex: row.dayIndex,
    lat: row.lat,
    lng: row.lng,
    chainIndex: row.chainIndex,
  })), [rows])

  const signature = useMemo(
    () => routeHeightSignature(inputs),
    [inputs],
  )

  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<{
    signature: string
    attempt: number
    view: 'measured' | 'empty' | 'failed' | 'retained'
    result: MeasuredRouteHeights | null
  } | null>(null)
  // The last good result, tagged with the places it belongs to. Written only
  // from the request callback, never during render.
  const lastGood = useRef<{ signature: string; result: MeasuredRouteHeights } | null>(null)
  const inputsRef = useRef(inputs)
  useEffect(() => { inputsRef.current = inputs }, [inputs])

  useEffect(() => {
    if (!supported) return
    const controller = new AbortController()
    let cancelled = false
    const kept = lastGood.current?.signature === signature ? lastGood.current.result : null
    measureRouteHeights(inputsRef.current, activeElevationTileLoader(), controller.signal)
      .then(outcome => {
        if (cancelled) return
        if (outcome.kind === 'measured') {
          lastGood.current = { signature, result: outcome }
          setSettled({ signature, attempt, view: 'measured', result: outcome })
          return
        }
        setSettled({
          signature,
          attempt,
          view: kept ? 'retained' : outcome.kind === 'empty' ? 'empty' : 'failed',
          result: kept,
        })
      })
      .catch(() => {
        if (cancelled) return
        setSettled({ signature, attempt, view: kept ? 'retained' : 'failed', result: kept })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [signature, attempt, supported])

  const samePlaces = settled?.signature === signature
  const fresh = elevationResultApplies(settled, signature, attempt)
  const view: ElevationView = !supported
    ? 'unsupported'
    : fresh
      ? settled!.view
      : 'loading'
  const result = !supported || !samePlaces ? null : settled!.result

  const retry = useCallback(() => setAttempt(count => count + 1), [])

  return { view, result, points: result?.points ?? [], retry }
}
