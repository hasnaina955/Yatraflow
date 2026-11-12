// #420 slice 11: the corridor cache owns the plan freshness and the scans.
//
// The inputs hash, its publish, the fraction fallback and the main corridor
// scan move together. They share one hash value. They share one loading
// latch. Splitting them would hide the latch contract (#544).
//
// The hook takes data and returns data. It returns no callbacks. The render
// must never call a function that a hook returns, so all four returns are
// values the render reads directly. `pois` stays with the caller: the render reads
// it before the inputs this hook needs exist.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Trip } from '../../../data/types'
import { MODE_SPEED } from '../../../lib/engine'
import {
  planJourneyHalts, searchNearbyPoisMulti, routeHash,
  effectiveDrivingDays, drivingPlanFingerprint,
  type DrivingPlan, type NearbyOpts, type PlaceHit, type SegmentHit,
} from '../../../lib/geocode'
import { anchorHash, corridorAnchors, hasCoords, type HaltPurpose, type DiscoveryCoverage } from '../../../lib/providers/hits'
import { leftoverAsSight } from '../../../lib/ridePlan'
import { QuotaExhaustedError, googleEnabled } from '../../../lib/providers/google'
import type { PlaceFamily } from '../../../lib/providers/families'
import { planInputsHash, isMapCacheFresh, useSuggestionCache } from '../../../hooks/useSuggestionCache'
import { loadHaltPinsForTrip } from '../../../lib/uiPrefs'
import { buildDnaVectorAcrossTrips, loadDnaLog, crewSeedEvents, type CrewSeed } from '../../../lib/tripDna'
import type { MapRoadView } from '../../../lib/tripRoad'
import { retainCorridorRowsOnFailure } from './corridorSnapshot'

/**
 * Map V2 ticket 09 AC5: the trip/route-scoped scan asks three place families
 * — one query per family per scan. Water and views stay out until their
 * timing facts are confirmed. Day scans use the same family limit.
 */
const CORRIDOR_FAMILIES: readonly PlaceFamily[] = ['nature', 'faith', 'culture']

export interface DayDiscoveryInput {
  dayIndex: number
  /** Only the selected day's road. Null means no measured day road. */
  routeGeometry: MapRoadView['geometry']
  stayBase: { lat: number; lng: number } | null
  purposes: HaltPurpose[]
  categoryBias?: Record<string, number>
  scopeMinutes?: 15 | 30 | 45 | 60
}

/** Builds search and ranking inputs from the same saved day. Titles do not affect discovery. */
export function dayDiscoveryContext(input: Omit<DayDiscoveryInput, 'dayIndex'> & {
  day: { id: string; index: number; title?: string; stops: { lat: number; lng: number; name?: string; category?: string }[] } | undefined
}) {
  const valid = (p: { lat: number; lng: number }) => hasCoords({ latitude: p.lat, longitude: p.lng, id: '', name: '', kind: 'poi' })
  const stops = (input.day?.stops ?? []).filter(valid).map(({ lat, lng, name, category }) => ({ lat, lng, name, category }))
  const road = input.day ? input.routeGeometry?.filter(([lng, lat]) => valid({ lat, lng })) ?? null : null
  const routeGeometry = road && road.length >= 2 ? road : null
  const stayBase = input.day && input.stayBase && valid(input.stayBase) ? input.stayBase : null
  const anchors = [...stops.map(({ lat, lng }) => ({ lat, lng })), ...(stayBase ? [stayBase] : [])]
  if (anchors.length === 0 && routeGeometry) anchors.push(...routeGeometry.map(([lng, lat]) => ({ lat, lng })))
  const scopeMinutes = input.scopeMinutes ?? 30
  const purposes = [...new Set(input.purposes)].sort()
  return {
    kind: anchors.length > 0 ? 'ready' as const : 'needs-anchor' as const,
    anchors, routeGeometry, purposes, scopeMinutes,
    plannedStops: stops,
    key: JSON.stringify(['day-discovery', input.day?.id ?? null, input.day?.index ?? null, stops, routeGeometry, stayBase, purposes, scopeMinutes, input.categoryBias ?? null]),
  }
}

/**
 * The day's lodging as a search base: the last hotel stop with coordinates on
 * that day, else on the day before. Null when the trip holds none. No base
 * is invented from the start location.
 */
export function dayStayBase(trip: Pick<Trip, 'days'>, dayIndex: number): { lat: number; lng: number } | null {
  const days = [...trip.days].sort((a, b) => b.index - a.index).filter(day => day.index <= dayIndex)
  for (const day of days.slice(0, 2)) {
    const hotel = [...day.stops].reverse().find(stop => stop.category === 'hotel' && stop.status !== 'rejected'
      && hasCoords({ latitude: stop.lat, longitude: stop.lng, id: '', name: '', kind: 'poi' }))
    if (hotel) return { lat: hotel.lat, lng: hotel.lng }
  }
  return null
}

export type CorridorCacheArgs = {
  discoveryDay?: DayDiscoveryInput
  trip: Trip
  anchors: { lat: number; lng: number }[]
  routeGeometry: MapRoadView['geometry']
  scopeKm: number
  dayRainPct: (number | null)[] | null
  dayWeatherCode: (number | null)[] | null
  crewSeeds: CrewSeed[]
  dnaTick: number
  onInputsHash?: (inputsHash: string, scopeKm: number) => void
  /** The live plan rows. Owned by the caller, written by the scan below. */
  pois: SegmentHit[]
  setPois: React.Dispatch<React.SetStateAction<SegmentHit[]>>
  nearbyOpts: NearbyOpts
  planKm: number
  wholeTripMin: number
  drivingPlan: DrivingPlan
  refreshTick: number
  suggestionCache: ReturnType<typeof useSuggestionCache>
}

export function useCorridorCache({
  trip, anchors: tripAnchors, routeGeometry: tripRouteGeometry, scopeKm, dayRainPct, dayWeatherCode, crewSeeds,
  dnaTick, onInputsHash, pois, setPois, nearbyOpts: rawNearbyOpts, planKm, wholeTripMin,
  drivingPlan, refreshTick, suggestionCache, discoveryDay,
}: CorridorCacheArgs) {
  const dayContext = discoveryDay ? dayDiscoveryContext({
    ...discoveryDay, day: trip.days.find(day => day.index === discoveryDay.dayIndex),
  }) : null
  const dayKey = dayContext?.key ?? null
  const anchorsKey = dayKey ?? anchorHash(tripAnchors)
  const anchors = useMemo(() => dayContext?.anchors ?? tripAnchors, [anchorsKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const optionsKey = JSON.stringify(rawNearbyOpts)
  const nearbyOpts = useMemo(() => rawNearbyOpts, [optionsKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const routeGeometry = dayContext?.routeGeometry ?? (dayContext ? null : tripRouteGeometry)
  const scanOpts = {
    ...nearbyOpts,
    ...(dayContext ? { routeCoords: routeGeometry, homeCenter: null, plannedStops: dayContext.plannedStops, purposes: dayContext.purposes, categoryBias: discoveryDay?.categoryBias } : {}),
  }
  const [loadingPois, setLoadingPois] = useState(false)
  /** Which branch produced the current corridor rows: cache, scan, retained or none. */
  const [corridorSource, setCorridorSource] = useState<'cache' | 'scan' | 'none' | 'retained'>('none')
  /** The query the CURRENT rows came from. Never relabelled by a newer query. */
  const [poisMeta, setPoisMeta] = useState<{ hash: string; scopeKm: number; fetchedAt: number | null; coverage: DiscoveryCoverage | null; rows: SegmentHit[]; dayIndex: number | null } | null>(null)
  const poisMetaRef = useRef<typeof poisMeta>(null)
  const lastRefreshRef = useRef(refreshTick)

  // #331: one hash is shared by the main plan and the light fraction fallback.
  // Missing fields stay optional for older callers/tests; the Map tab passes all
  // current engine inputs explicitly.
  const mapInputsHash = useMemo(() => planInputsHash({
    anchorsHash: anchorHash(anchors),
    routeHash: routeHash(routeGeometry),
    travelStyle: trip.travelStyle,
    transportMode: trip.transportMode,
    drivesPart: trip.drivesPart,
    scopeKm,
    // #335: planInputsHash keys the suggestion cache on the same cadence crew
    // the nearby fetch above reads — `travellers`, never the member list.
    travellers: trip.travellers,
    driverCount: trip.driverCount,
    hasVulnerable: trip.hasVulnerable,
    driveAfterDinnerMin: trip.driveAfterDinnerMin,
    dayStartTimes: trip.days.map(d => d.startTime ?? '08:30'),
    dayRainPct,
    dayWeatherCode,
    haltPins: loadHaltPinsForTrip(trip.id),
    dnaVector: buildDnaVectorAcrossTrips(loadDnaLog(), crewSeedEvents(trip.id, crewSeeds)),
    speedKmph: MODE_SPEED[trip.transportMode] ?? 40,
    budgetPerPersonInr: trip.budgetPerPersonInr,
    fuelEconomyKmL: trip.fuelEconomyKmL,
    fuelPricePerL: trip.fuelPricePerL,
    roundTrip: trip.roundTrip,
    vehicleProfile: trip.vehicleProfile,
    planFingerprint: dayContext ? dayKey ?? undefined : `${drivingPlanFingerprint(drivingPlan)}|${planKm}|${wholeTripMin}`,
    // Ticket 09 AC5: the family set is part of the scan the cache answers,
    // so a changed set must never serve the previous set's rows.
    families: CORRIDOR_FAMILIES,
    // #842 F18: the scan reads these ranking inputs — hash them, or a
    // category-only edit re-runs the scan but the fresh-cache check still
    // serves the old ranked pool.
    purposes: scanOpts.purposes,
    categoryBias: scanOpts.categoryBias,
    plannedStops: scanOpts.plannedStops,
    providerMode: googleEnabled() ? 'google' : 'free',
    discoveryContext: JSON.stringify([trip.id, dayKey]),
    // dnaTick re-reads the DNA log after each accept or decline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [anchors, routeGeometry, trip, scopeKm, dayRainPct, dayWeatherCode, crewSeeds, dnaTick, drivingPlan, nearbyOpts, dayKey])

  // #404: the Overview's slot matrix gates on the SAME freshness this tab's cache
  // was written with — `isMapCacheFresh(cache.map, scopeKm, mapInputsHash)` — and
  // it cannot recompute the hash: `routeHash(routeGeometry)` needs the measured
  // road, and the rain/code arrays are this tab's state. A partial hash computed
  // workspace-side would never equal this one, so its comparison would report
  // "stale" forever — worse than today's silence. Publishing the pair is the fix.
  // The ref makes the call idempotent per VALUE: a parent re-rendering with a
  // fresh callback identity must not be re-notified, or the two tabs ping-pong
  // state at each other.
  const publishedInputsRef = useRef('')
  useEffect(() => {
    if (!onInputsHash) return
    const key = `${mapInputsHash}|${scopeKm}`
    if (publishedInputsRef.current === key) return
    publishedInputsRef.current = key
    onInputsHash(mapInputsHash, scopeKm)
  }, [mapInputsHash, scopeKm, onInputsHash])

  // Fraction fallback pool (P1-C): below the fatigue floor the planner is
  // honestly silent, but the strip must never read as "nothing around" —
  // one light corridor fetch feeds the ¼/½/¾ rows.
  const [fractionPois, setFractionPois] = useState<PlaceHit[] | null>(null)
  const [corridorQuotaOut, setCorridorQuotaOut] = useState(false)
  /** Main-scan quota only. The fraction fallback has its own note. */
  const [scanQuotaOut, setScanQuotaOut] = useState(false)
  // #704: a failed search is not an empty one. The Map tab shows a note for it.
  const [scanFailed, setScanFailed] = useState(false)
  const [fractionFailed, setFractionFailed] = useState(false)
  const corridorAbort = useRef<AbortController | null>(null)
  useEffect(() => {
    if (dayKey || loadingPois || pois.length > 0 || anchors.length < 2) { setFractionPois(null); setFractionFailed(false); return } // eslint-disable-line react-hooks/set-state-in-effect -- the guard clears stale fallback rows before the fetch below runs
    const cached = suggestionCache.cache.fraction
    if (cached && isMapCacheFresh(cached, scopeKm, mapInputsHash)) {
      setFractionPois(cached.hits)
      return
    }
    const controller = new AbortController()
    corridorAbort.current?.abort()
    corridorAbort.current = controller
    let cancelled = false
    searchNearbyPoisMulti(anchors, scopeKm * 1000, 12, { ...nearbyOpts, purposes: ['sight' as const, 'meal' as const], signal: controller.signal, rejectOnFailure: true })
      .then(hits => {
        if (cancelled) return
        setFractionFailed(false)
        setFractionPois(hits)
        if (hits.length > 0) suggestionCache.setFractionCache(hits, mapInputsHash, scopeKm)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof QuotaExhaustedError) { setCorridorQuotaOut(true); setFractionPois(null) }
        else if (!controller.signal.aborted) { setFractionFailed(true); setFractionPois([]) }
      })
    return () => { cancelled = true; controller.abort() }
  }, [loadingPois, pois, anchors, nearbyOpts, scopeKm, refreshTick, mapInputsHash, suggestionCache, dayKey])

  useEffect(() => {
    if (anchors.length === 0) {
      // No route means no current corridor. Clear the rows and their query after
      // the render commits so an old snapshot cannot survive as if it belonged
      // to this trip state.
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        setScanFailed(false)
        setScanQuotaOut(false)
        setCorridorQuotaOut(false)
        setCorridorSource('none')
        setPois([])
        poisMetaRef.current = null
        setPoisMeta(null)
        setLoadingPois(false)
      })
      return () => { cancelled = true }
    }
    const cached = suggestionCache.cache.map
    // #331: the shared hash covers route shape, weather/time cadence, pinned
    // halts, DNA preferences, speed, crew/fuel/budget and scope. Cache hits
    // therefore survive tab switches but never serve a stale engine plan.
    const inputsHash = mapInputsHash
    // Persisted results win across tab switches and unrelated saves. When the
    // route resolves after mount, the effect intentionally re-runs once through
    // the degraded-scan path so a starved pre-geometry plan is replaced by the
    // real road corridor; only ↻ Refresh, a scope change, new anchors, or an
    // empty cache starts another paid scan.
    if (cached && isMapCacheFresh(cached, scopeKm, inputsHash) && refreshTick === lastRefreshRef.current) {
      // A fresh cache answers at once: publish it instead of starting a paid
      // scan. Deferred one microtask so the effect commits no state inline.
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        setCorridorQuotaOut(false); setScanQuotaOut(false); setScanFailed(false)
        setCorridorSource('cache')
        setPois(cached.segments)
        poisMetaRef.current = { hash: inputsHash, scopeKm, fetchedAt: cached.fetchedAt ?? null, coverage: cached.coverage ?? null, rows: cached.segments, dayIndex: discoveryDay?.dayIndex ?? null }
        setPoisMeta(poisMetaRef.current)
      })
      return () => { cancelled = true }
    }
    let cancelled = false
    const controller = new AbortController()
    lastRefreshRef.current = refreshTick
    let coverage: DiscoveryCoverage | null = null
    const failurePolicy = { rejectOnFailure: true }
    queueMicrotask(() => {
      if (cancelled) return
      setLoadingPois(true)
      setScanFailed(false)
      setScanQuotaOut(false)
      setCorridorSource('scan')
      if (poisMetaRef.current?.hash !== inputsHash) {
        setPois([])
        poisMetaRef.current = null
        setPoisMeta(null)
      }
    })
    // Day Planner arming (P1-B/#121): the ROUTE arms the split — the clock
    // walk when it speaks ('ok' → its day count), the drive-day split when the
    // clock defers, tonight's hop otherwise. NEVER the planned day count: a
    // 700 km 1-day plan still needs its night halt; a 3-day 200 km trip none.
    const scan = dayContext
      ? searchNearbyPoisMulti(
          corridorAnchors(routeGeometry?.map(([lng, lat]) => ({ lat, lng })) ?? anchors, null, scopeKm * 1000),
          scopeKm * 1000, 16,
          { ...scanOpts, ...failurePolicy, signal: controller.signal, families: CORRIDOR_FAMILIES, onCoverage: value => { coverage = value } },
        ).then(hits => leftoverAsSight(hits, [], anchors, { routePolyline: routeGeometry?.map(([lng, lat]) => ({ lat, lng })) }))
      : planJourneyHalts(anchors, planKm, wholeTripMin, {
      ...nearbyOpts, plan: drivingPlan, signal: controller.signal,
      ...failurePolicy,
      families: CORRIDOR_FAMILIES,
      // Runtime hours (repair of #887): the corridor scores each halt against
      // its own trip day date. The trip's own start date, never today's date.
      tripStartDate: trip.startDate,
      onCoverage: value => { coverage = value },
    }, scopeKm * 1000)
    scan
      .then(plan => {
        if (!cancelled && !controller.signal.aborted) {
          setCorridorQuotaOut(false)
          setScanQuotaOut(false)
          setScanFailed(false)
          setPois(plan)
          const fetchedAt = dayContext || coverage ? Date.now() : null
          poisMetaRef.current = { hash: inputsHash, scopeKm, fetchedAt, coverage, rows: plan, dayIndex: discoveryDay?.dayIndex ?? null }
          setPoisMeta(poisMetaRef.current)
          // Never cache an empty plan: the first search can run before the
          // route resolves, and a persisted [] would stick until Refresh.
          // #185: also never cache a DEGRADED plan — when the road hasn't
          // resolved for a multi-anchor trip, the scan ran start-area point
          // searches only; persisting it would serve the starved corridor for
          // the full 4 h TTL. The scan effect re-fires when geometry arrives
          // (nearbyOpts depends on it), and the fresh plan then caches.
          const degradedScan = routeGeometry == null && anchors.length >= 2
          if (plan.length > 0 && !degradedScan) {
            const setMapCache = (rows: SegmentHit[], hash: string, scope: number, days?: ReturnType<typeof effectiveDrivingDays>) => {
              suggestionCache.setMapCache(rows, hash, scope, days, { fetchedAt, coverage })
            }
            if (dayContext) setMapCache(plan, inputsHash, scopeKm)
            else setMapCache(plan, inputsHash, scopeKm, effectiveDrivingDays(drivingPlan, plan))
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        // Approved decision #3: retain valid rows for the SAME query. A changed
        // route/scope is never relabelled as current.
        const retain = retainCorridorRowsOnFailure({
          hasRows: (poisMetaRef.current?.rows.length ?? 0) > 0,
          meta: poisMetaRef.current,
          inputsHash,
          scopeKm,
        })
        if (retain) setCorridorSource('retained')
        else {
          setPois([])
          poisMetaRef.current = null
          setPoisMeta(null)
          setCorridorSource('scan')
        }
        if (err instanceof QuotaExhaustedError) { setCorridorQuotaOut(true); setScanQuotaOut(true) }
        // #704: a failed scan is not an empty one, so the Map tab shows a note for it.
        else { setScanQuotaOut(false); setScanFailed(true) }
      })
      .finally(() => { if (!cancelled) setLoadingPois(false) })
    return () => {
      cancelled = true
      controller.abort()
      // #544: the cancelled run was the flag's owner, so the cleanup releases
      // it. The re-run re-raises it only when it truly starts a new scan; a
      // fresh-cache early return must not inherit a phantom in-flight flag —
      // that latch read as a permanent "searching…" and disabled Refresh and
      // the detour-scope slider until a full reload.
      setLoadingPois(false)
    }
    // The cache identity and raw geometry stay out; nearbyOpts covers geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchors, nearbyOpts, mapInputsHash, refreshTick])

  return {
    mapInputsHash,
    fractionPois,
    corridorQuotaOut,
    loadingPois,
    // The page note keeps the old "any search failed" meaning; the snapshot
    // status uses `scanFailed` only (P7).
    poisFailed: scanFailed || fractionFailed,
    scanFailed,
    scanQuotaOut,
    corridorSource,
    poisInputsHash: poisMeta?.hash ?? null,
    poisScopeKm: poisMeta?.scopeKm ?? null,
    fetchedAt: poisMeta?.hash === mapInputsHash ? poisMeta.fetchedAt : null,
    coverage: poisMeta?.hash === mapInputsHash ? poisMeta.coverage : null,
    // The day the CURRENT rows were scanned for. A day change keeps the old
    // rows labelled with their own day until the new scan replaces them.
    discoveryDayIndex: poisMeta ? poisMeta.dayIndex : discoveryDay?.dayIndex ?? null,
    discoveryRows: poisMeta?.hash === mapInputsHash ? poisMeta.rows : [],
    discoveryStatus: anchors.length === 0 ? 'needs-anchor' as const
      : loadingPois ? 'loading' as const
      : corridorSource === 'retained' ? 'retained' as const
      : scanQuotaOut ? 'quota' as const
      : scanFailed ? 'failed' as const
      : poisMeta?.hash !== mapInputsHash ? 'unscanned' as const
      : poisMeta.rows.length === 0 ? 'empty' as const : 'ready' as const,
  }
}
