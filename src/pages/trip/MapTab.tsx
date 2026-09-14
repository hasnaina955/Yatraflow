// ============ Trip workspace — Map tab ============
// Mechanical extraction from src/pages/TripWorkspace.tsx (M3.4) — no behavior changes.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, CircleCheck, Clock, ExternalLink, Fuel, Lightbulb, MapPin, Plus, RotateCcw, Sparkles, Star } from 'lucide-react'
import { MetaIcon } from '../../components/icons'
import { uid } from '../../data/seed'
import type { Trip, ItineraryStop } from '../../data/types'
import type { ImpactResult } from '../../lib/impact'
import { routePath } from '../../lib/routing'
import { getAssumptions, buildJourney, minutesToHM, fmtDur, computeCategoryBias, MODE_SPEED, isRoundTrip } from '../../lib/engine'
import { useTimeFormat, formatHM, formatHMRange } from '../../lib/timefmt'
import { loadPref, savePref } from '../../lib/uiPrefs'
import { Modal, Field, toast, undoToast } from '../../components/ui'
import { Select } from '../../components/Select'
import { useSuggestionCache, isMapCacheFresh } from '../../hooks/useSuggestionCache'
import { openExternal } from '../../lib/native'
import { corridorAnchors, detourKm, detourMinutes, asymmetricDetourMinutes, googleEnabled, planJourneyHalts, reasonForSegmentHit, searchPlaces, searchNearbyPoisMulti, kmFromStartForHit, planDriveDays, planTravelClock, DEFER_START, type NearbyOpts, type PlaceHit, routeHash } from '../../lib/geocode'
import { QuotaExhaustedError } from '../../lib/providers/google'
import { isSightCategory } from '../../lib/ridePlan'
import { railReasonChips, type RailChip } from '../../lib/railReasons'
import { rulerMarks } from '../../lib/railRuler'
import { addDecision, deleteStop, restoreStop } from '../../store/store'
import { dayDetourBudgetMin, budgetSharePct, splitByDetourBudget } from '../../lib/detourBudget'
import { quotaUsed, SOFT_CAPS } from '../../lib/providers/quota'
import { buildDnaVectorAcrossTrips, loadDnaLog, recordDnaEvent, dnaNoteForHit, crewSeedsFromSuggestions, crewSeedsToPlannedStops, crewSeedEvents, crewNoteForHit } from '../../lib/tripDna'
import { clusterStoryArcs } from '../../lib/storyArcs'
import { visitMinutesForCategory } from '../../lib/slackPrompts'
import { prefersReducedMotion, scrollBehavior } from '../../lib/motion'
import type { SegmentHit } from '../../lib/geocode'
import { anchorHash, projectOntoPolyline } from '../../lib/providers/hits'
import { fetchDailyWeather, forecastAvailable, isoAddDays } from '../../lib/weather'
// MapLibre is heavy (~1MB) — load it only when the Map tab is actually opened.
const TripMap = React.lazy(() => import('../../components/TripMap').then(m => ({ default: m.TripMap })))

/** minutes-since-midnight → "HH:MM" for formatHM (minutesToHM is duration-styled). */
function clockHM(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Purposes that are finite by construction — their halts are needs, not sights.
 * Module scope: this is a constant, so it must not be rebuilt on every render.
 */
const NEED_PURPOSES = new Set(['fuel', 'meal', 'food', 'rest', 'stretch', 'overnight', 'stay'])

/** See-rail cards shown before the rest fold behind one expander. */
const SEE_VISIBLE = 4

// ---- Engine guide: a subtle rotating roll-out of what the suggestion engine ----
// ---- does, so its intelligence is discoverable without a docs trip.          ----
const ENGINE_TIPS = [
  'Breaks are spaced for fatigue — stretch rides your wheel time, lunch holds the 11:30–14:30 window, tuned to your crew size and travel style.',
  'Lunch slides itself into the 11:30–14:30 window based on when each driving day starts.',
  'Self-drive trips get fuel halts on your tank’s rhythm — no “next pump in 300 km” surprises.',
  'Cross-day drives end at a real city — the overnight lands where your honest wheel cap says the day ends.',
  'Every idea is checked against your detour budget — packed days see fewer, closer options.',
  'The engine learns: accepting or declining an idea nudges what future trips suggest (Trip DNA).',
  'Rainy day ahead? Exposed sights step aside for museums, cafes and other sheltered picks.',
  'Ghat sections and slow city crawls are detected from the real road shape — and warned about.',
  'Story arcs bundle nearby sights into one-tap themed detours — temples, waterfalls, viewpoints.',
  'Hover a card to spot it on the map; hover a pin to find its card. Adds always insert in road order.',
]

function EngineTips() {
  const [tip, setTip] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) return
    const t = setInterval(() => setTip(i => (i + 1) % ENGINE_TIPS.length), 7000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="engine-tips">
      <span className="engine-tips-ico"><Sparkles size={12} aria-hidden /></span>
      {/* #168: role="status" on rotating text re-announces every 7s — a live
          region that never shuts up. The rotation is decorative; SR users get
          one static summary instead. */}
      <span key={tip} className="engine-tips-text" aria-hidden="true">{ENGINE_TIPS[tip]}</span>
      <span className="sr-only" role="status">Suggestions are spaced for fatigue and checked against your detour budget.</span>
      <span className="engine-tips-dots" aria-hidden="true">
        {ENGINE_TIPS.map((_, i) => (
          <button key={i} type="button" tabIndex={-1} className={`engine-tips-dot${i === tip ? ' on' : ''}`} onClick={() => setTip(i)} />
        ))}
      </span>
    </div>
  )
}

// ================= Map tab =================

/** Wikipedia thumbnail URLs are hotlink-friendly but huge; ask for a small one.
 *  #177: only Wikimedia thumb URLs carry a /<w>px- size segment — rewriting a
 *  path segment that merely LOOKS like a size on any other host mangles it. */
function smallThumb(url: string): string {
  if (!/upload\.wikimedia\.org/.test(url)) return url
  return url.replace(/\/(\d+)px-/, '/120px-')
}

function googleMapsUrl(hit: PlaceHit): string {
  // Real Place page when Google gave us a place_id (reviews, hours, directions)
  if (hit.placeId) return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(hit.placeId)}`
  // Free-stack hits have no place_id — Google's documented pin URL by coords
  // (hand-building /place/<name>/@lat,lng broke on encoded names)
  if (Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude)) {
    return `https://www.google.com/maps/search/?api=1&query=${hit.latitude},${hit.longitude}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hit.name)}`
}

/** Detour-scope presets for nearby suggestions (km off the route). */
const SCOPE_KM_STEPS = [10, 20, 30, 50, 80, 100]
const SCOPE_STORAGE_KEY = 'nearby_scope_km'

/** Sensible visit durations per suggestion category (tourist pacing). */
const poiVisitMinutes = visitMinutesForCategory

export function MapTab({ trip, editable, applyChange, suggestionCache, crewSuggestions, onOpenTimeline, onOpenBoard }: {
  trip: Trip
  editable: boolean
  applyChange: (mutator: (d: Trip) => void, kind: ImpactResult['kind'], dayIndex: number) => void
  suggestionCache: ReturnType<typeof useSuggestionCache>
  crewSuggestions?: { status: string; title: string; category?: string; lat: number; lng: number }[]
  onOpenTimeline?: (stopId: string) => void
  onOpenBoard?: () => void
}) {
  const [pois, setPois] = useState<SegmentHit[]>([])
  const timeFormat = useTimeFormat()
  const [loadingPois, setLoadingPois] = useState(false)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  // dismissed suggestion ids — logged as DNA declines, hidden for the session
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  // DNA freshness: bumped on every accept/decline so scoring + notes re-read
  // the log instead of serving the memoised vector
  const [dnaTick, setDnaTick] = useState(0)
  // bump to force a corridor re-search — the only refetch path besides a
  // detour-scope change or a first-ever load (empty cache)
  const [refreshTick, setRefreshTick] = useState(0)
  // detour-scope control — how far off the route suggestions may sit.
  // #181: guarded through uiPrefs (private-mode throw crashes a useState
  // initializer); namespace follows the app's yatraflow_* convention.
  const [scopeIdx, setScopeIdx] = useState(() => {
    const saved = Number(loadPref(SCOPE_STORAGE_KEY, ''))
    const i = SCOPE_KM_STEPS.indexOf(saved)
    return i >= 0 ? i : 1 // default 20 km
  })
  const scopeKm = SCOPE_KM_STEPS[scopeIdx]
  function changeScope(i: number) {
    setScopeIdx(i)
    savePref(SCOPE_STORAGE_KEY, String(SCOPE_KM_STEPS[i]))
  }
  // pending "add from map / nearby" — pick a day, then confirm
  const [poiDraft, setPoiDraft] = useState<{ hit: PlaceHit } | null>(null)
  const [pickDay, setPickDay] = useState<number>(0)
  // cross-highlighting: the suggestion currently hovered/selected in EITHER the
  // side panels or the map. Panel hover/click sets it (map flies to the pin);
  // map hover/click sets it (panel row highlights and scrolls into view).
  const [activeHitId, setActiveHitId] = useState<string | number | null>(null)
  // Shortlist: the rail collects picks before anything lands in the plan, so the
  // group can vote on them. The tray under the grid owns the actions.
  const [shortlist, setShortlist] = useState<PlaceHit[]>([])
  // One reason chip can narrow the rail, so "where are the lunch options?" is a
  // tap instead of a scroll.
  const [chipFilter, setChipFilter] = useState<string | null>(null)
  // Fold-to-spines: either rail can step back to a 48px spine so the map gains
  // the room. Session state on purpose - a layout whim should not persist.
  const [folded, setFolded] = useState<{ needs: boolean; see: boolean }>({ needs: false, see: false })
  // In-map place search (§6.5): a free-text query over the provider facade,
  // plus the results to add straight from the Map tab.
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<{ h: PlaceHit; km: number | null; off: number | null }[]>([])
  const [searching, setSearching] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const existingNames = useMemo(() => {
    const names = new Set<string>()
    for (const d of trip.days) for (const s of d.stops) names.add(s.title.toLowerCase())
    return names
  }, [trip])

  // OSRM road geometry of the whole route — feeds Google Search-Along-Route
  // (the report's killer feature); the free stack ignores it. TripMap draws
  // the same legs independently, so this is one extra free OSRM call per route.
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null)
  const [routeTotalKm, setRouteTotalKm] = useState<number | null>(null)
  // The OSRM attempt's outcome: when the road can't be measured (rate limits,
  // very long routes — exactly where the banner matters most), the Day Planner
  // still speaks, from the haversine estimate, flagged as rough.
  const [routeFailed, setRouteFailed] = useState(false)
  // Road-true whole-trip wheel time and per-day road km, sliced from the same
  // legs — the journey sums are haversine estimates and undercount curvy roads.
  const [routeTotalMin, setRouteTotalMin] = useState<number | null>(null)
  const [dayRoadKm, setDayRoadKm] = useState<number[] | null>(null)

  // Stop signature (#135): stable string key over what buildJourney actually
  // reads (stop ids, road order, coords) — the days ARRAY identity changes on
  // every store commit, so memoising the whole-trip budget on `trip` re-fired
  // this on unrelated keystrokes.
  const stopSig = trip.days.map(d => d.stops.map(s => `${s.id}@${s.lat},${s.lng}`).join('+')).join('|')
  // day start signature: the clock walk reads every day's startTime (rest days
  // stamped 08:30 by #133 shells), never the days array itself.
  const dayStartSig = trip.days.map(d => d.startTime ?? '').join(',')
  // whole-trip wheel distance & time (journey sums) — the plan budget for the
  // fatigue math. OSRM's road totals win when resolved (same legs the map
  // draws); the journey sums are the haversine estimate fallback.
  const wholeTrip = useMemo(() => {
    let km = 0
    let min = 0
    for (const d of trip.days) {
      const j = buildJourney(trip, d)
      km += j.distanceKm
      min += j.driveMinutes
    }
    return { km: routeTotalKm ?? km, min: routeTotalMin ?? min }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopSig, routeTotalKm, routeTotalMin])

  /** Which day's cumulative drive covers a given along-route km (for pick-a-day defaults). */
  const dayForKm = (km: number | null | undefined): number | null => {
    // #161: unknown km used to silently attribute to Day 1 — an off-polyline
    // hit's budget, day lookup and pick-day default all lied. Return null and
    // let each consumer decide honestly (day ?/clamped/default).
    if (km == null || !Number.isFinite(km)) return null
    // Road-true per-day km from the routing legs when resolved — chord-scale
    // day sums undercount curvy roads and attribute the km to the wrong day.
    const perDay = dayRoadKm ?? trip.days.map(d => buildJourney(trip, d).distanceKm)
    // #161: walk positionally (dayRoadKm is aligned with trip.days) but key
    // the RESULT by the day's own index — indexes can skip (deleted day), and
    // position ≠ index.
    let covered = 0
    for (let i = 0; i < trip.days.length; i++) {
      covered += perDay[i] ?? 0
      if (km <= covered) return trip.days[i].index
    }
    return trip.days[trip.days.length - 1]?.index ?? null
  }

  // search the WHOLE route corridor (start → stops → destination); the home
  // zone around the starting point is excluded inside the engine
  const anchors = useMemo(() => {
    const pts = trip.days
      .flatMap(d => d.stops)
      .filter(s => s.status !== 'rejected')
      .map(s => ({ lat: s.lat, lng: s.lng }))
    return corridorAnchors(pts, trip.startLocationCoords ?? null, scopeKm * 1000)
  }, [trip, scopeKm])

  // Per-day rain chance for the weather join — best-effort, null until loaded.
  const [dayRainPct, setDayRainPct] = useState<(number | null)[] | null>(null)
  useEffect(() => {
    const stops = trip.days.flatMap(d => d.stops).filter(s => s.status !== 'rejected' && Number.isFinite(s.lat) && Number.isFinite(s.lng))
    if (stops.length === 0 || !forecastAvailable(trip.startDate)) { setDayRainPct(null); return }
    let cancelled = false
    const anchor = {
      lat: stops.reduce((a, s) => a + s.lat, 0) / stops.length,
      lng: stops.reduce((a, s) => a + s.lng, 0) / stops.length,
    }
    fetchDailyWeather(anchor.lat, anchor.lng, trip.startDate, trip.days.length || 1)
      .then(w => {
        if (cancelled) return
        setDayRainPct(trip.days.map((_, i) => w[isoAddDays(trip.startDate, i)]?.rainChancePct ?? null))
      })
      .catch(() => { if (!cancelled) setDayRainPct(null) })
    return () => { cancelled = true }
  }, [trip])
  // OSRM's road total (when resolved) is the most accurate journey budget for
  // the fatigue math; until then use the journey-summed estimate.
  const planKm = routeTotalKm && routeTotalKm >= 90 ? routeTotalKm : wholeTrip.km
  useEffect(() => {
    let cancelled = false
    const pts: { lat: number; lng: number }[] = []
    // Parallel to pts: the day each point's leg ARRIVAL belongs to (null for
    // the start). A chain leg is ridden on the day of its destination — the
    // drive to day d+1's first stop happens on day d+1's morning.
    const ptDay: (number | null)[] = []
    if (trip.startLocationCoords) { pts.push(trip.startLocationCoords); ptDay.push(null) }
    trip.days.forEach(d => d.stops.filter(s => s.status !== 'rejected')
      .forEach(s => { pts.push({ lat: s.lat, lng: s.lng }); ptDay.push(d.index) }))
    if (pts.length < 2) { setRouteGeometry(null); setRouteTotalKm(null); setRouteTotalMin(null); setDayRoadKm(null); return }
    routePath(pts, getAssumptions(trip))
      .then(legs => {
        if (cancelled) return
        setRouteFailed(false)
        setRouteGeometry(legs.flatMap(l => l.geometry))
        // Google's routingSummaries legs are origin→place and place→destination,
        // so the real detour per hit is (leg0 + leg1) − this total.
        setRouteTotalKm(legs.reduce((sum, l) => sum + l.distanceKm, 0))
        setRouteTotalMin(legs.reduce((sum, l) => sum + l.durationMinutes, 0))
        const perDay = new Map<number, number>()
        legs.forEach((l, i) => {
          const day = ptDay[i + 1]
          if (day != null) perDay.set(day, (perDay.get(day) ?? 0) + l.distanceKm)
        })
        setDayRoadKm(trip.days.map(d => perDay.get(d.index) ?? 0))
      })
      .catch(() => { if (!cancelled) { setRouteGeometry(null); setRouteTotalKm(null); setRouteTotalMin(null); setDayRoadKm(null); setRouteFailed(true) } })
    return () => { cancelled = true }
  }, [trip])

  // Route polyline in {lat,lng} form (from the OSRM route geometry) — feeds the
  // asymmetric detour measure so on-the-way hits cost ~0 and spurs pay round trip.
  const routePolyline = useMemo<{ lat: number; lng: number }[] | null>(() => {
    if (!routeGeometry) return null
    const pts = routeGeometry
      .filter(c => Number.isFinite(c[0]) && Number.isFinite(c[1]))
      .map(c => ({ lat: c[1], lng: c[0] }))
    return pts.length >= 2 ? pts : null
  }, [routeGeometry])

  // Crew seeds: open group-input ideas suppress near-duplicates and bias the
  // corridor toward crew-proposed kinds.
  const crewSeeds = useMemo(() => crewSeedsFromSuggestions(crewSuggestions ?? []), [crewSuggestions])

  const nearbyOpts: NearbyOpts = useMemo(() => ({

    includeFuel: trip.transportMode === 'car' || trip.transportMode === 'motorcycle',
    homeCenter: trip.startLocationCoords ?? null,
    // fill what the itinerary lacks, demote what it already covers
    categoryBias: computeCategoryBias(trip),
    // Google mode: bias the search along the real road polyline; free mode ignores it
    routeCoords: routeGeometry,
    routeTotalKm,
    travellers: trip.travellers,
    travelStyle: trip.travelStyle,
    speedKmph: MODE_SPEED[trip.transportMode] ?? 40,
    // Trip DNA: EVERY trip on the device leans corridor ties toward kinds the
    // user keeps picking (cross-trip learning) — scoped per-trip would forget a
    // waterfall hire on a past journey.
    // dnaTick re-reads the log after every accept/decline on this tab.
    dnaVector: buildDnaVectorAcrossTrips(loadDnaLog(), crewSeedEvents(trip.id, crewSeeds)),
    plannedStops: [
      ...trip.days.flatMap(d => d.stops)
        .filter(s => s.status !== 'rejected' && Number.isFinite(s.lat) && Number.isFinite(s.lng))
        .map(s => ({ lat: s.lat, lng: s.lng, name: s.title })),
      // crew-proposed ideas suppress duplicate corridor suggestions near them
      ...crewSeedsToPlannedStops(crewSeeds),
    ],
    dayStartTimes: trip.days.map(d => d.startTime ?? '08:30'),
    dayRainPct: dayRainPct ?? undefined,
  }), [trip, routeGeometry, routeTotalKm, dayRainPct, crewSeeds, dnaTick])

  // Day Planner verdicts (PLAN-DAY-PLANNER P1-B/C): the drive-day split the
  // ROUTE demands (duration cap, load-balanced) and the travel-clock verdict
  // for the trip's real start time (defer / hop / ok). Pure — recomputed from
  // route facts, never stored, so every stop mutation re-derives them (the
  // ripple re-plan) and the night-halt position stays honest.
  const rainFactor = dayRainPct?.[0] != null ? 1 - (dayRainPct[0] as number) / 200 : undefined
  const tripIsRoundTrip = isRoundTrip(trip)
  // A round trip bills the drive home too: the split demands days for the
  // whole loop, matching the CreateTrip verdict (its bill.roadKm doubles the
  // outbound when roundTrip is on). The return re-traces the same corridor,
  // so the loop is 2× the outbound measurement.
  const loopFactor = tripIsRoundTrip ? 2 : 1
  const splitVerdict = useMemo(
    () => planDriveDays({ totalKm: planKm * loopFactor, driveMinutes: wholeTrip.min * loopFactor, travelStyle: trip.travelStyle, rainFactor }),
    [planKm, wholeTrip.min, trip.travelStyle, loopFactor, dayRainPct],
  )
  const clockVerdict = useMemo(
    // #127: the clock walk takes the per-day rain array (day 1 wet ≠ day 3 wet);
    // the scalar rainFactor below stays for the start-time-blind split estimate.
    // The walk bills the loop like the split does — a round trip's clock days
    // are there AND back (same 2× model the clock overlay already draws).
    () => planTravelClock({ totalKm: planKm * loopFactor, driveMinutes: wholeTrip.min * loopFactor, dayStart: trip.days[0]?.startTime, travelStyle: trip.travelStyle, rainFactor, dayRainPct: dayRainPct ?? undefined }),
    // Stable keys only (#135): the walk reads startTimes + day count, never the
    // days array identity. Day starts string + length cover it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planKm, wholeTrip.min, trip.travelStyle, dayStartSig, dayRainPct, loopFactor],
  )
  // One clock story (#123): the banner count comes from the clock walk that
  // knows the start time; planDriveDays stays the geometry-free estimator.
  // defer → 0 usable days today; hop → tonight's hop + full days from tomorrow.
  const travelDayNeed = clockVerdict.verdict === 'ok'
    ? clockVerdict.days.length
    : clockVerdict.verdict === 'hop'
      ? 1
      : splitVerdict?.driveDayCount ?? 1
  // The split wants more days than planned: propose applying it. Declining is
  // respected — with the honest red fatigue verdict stated, never hidden.
  const [splitDeclined, setSplitDeclined] = useState(false)
  // Reset on the single-source count (#123): apply → recompute → same count →
  // the banner stays dismissed instead of re-firing on its own mutation.
  useEffect(() => { setSplitDeclined(false) }, [travelDayNeed])
  const applySplitDays = () => {
    if (clockVerdict.verdict !== 'ok') return // defer/hop: nothing honest to stamp
    const add = travelDayNeed - trip.days.length // #123 single source
    if (add <= 0) return
    applyChange(draft => {
      let next = Math.max(...draft.days.map(d => d.index)) + 1
      for (let i = 0; i < add; i++) {
        // #133 — stamp real shells: title + startTime so clockVerdict and
        // computeTotals never fall back to undefined. Dates are derived from
        // the day index (ItineraryDay carries no date), so extending endDate
        // is what keeps the new shells inside the trip.
        const dayNo = trip.days.length + i + 1
        draft.days.push({
          id: uid('day'),
          index: next,
          title: `Travel day ${dayNo}`,
          startTime: '08:30',
          stops: [],
        })
        next += 1
      }
      draft.days.sort((a, b) => a.index - b.index)
      if (trip.endDate) draft.endDate = isoAddDays(trip.endDate, add)
    }, 'add', -1)
    setSplitDeclined(true) // own mutation must not re-fire the banner
    toast(`Added ${add} travel day${add !== 1 ? 's' : ''} (08:30 starts) — accept a night halt to pin them`)
  }

  // Fraction fallback pool (P1-C): below the fatigue floor the planner is
  // honestly silent, but the strip must never read as "nothing around" —
  // one light corridor fetch feeds the ¼/½/¾ rows.
  const [fractionPois, setFractionPois] = useState<PlaceHit[] | null>(null)
  useEffect(() => {
    if (loadingPois || pois.length > 0 || anchors.length < 2) { setFractionPois(null); return }
    let cancelled = false
    searchNearbyPoisMulti(anchors, scopeKm * 1000, 12, { ...nearbyOpts, purposes: ['sight' as const, 'meal' as const] })
      .then(hits => { if (!cancelled) setFractionPois(hits) })
      // #176: a quota outage must not wear the 'short trip' costume. Google
      // errors surface as QuotaExhaustedError; the pool goes null (unknown)
      // so the rows speak about the outage, not the plan.
      .catch((err: unknown) => { if (!cancelled) setFractionPois(err instanceof QuotaExhaustedError ? null : []) })
    return () => { cancelled = true }
  }, [loadingPois, pois, anchors, nearbyOpts, scopeKm, refreshTick])

  useEffect(() => {
    if (anchors.length === 0) return
    const cached = suggestionCache.cache.map
    // The hash covers everything that changes WHAT the search should return:
    // anchors (route shape), OSRM geometry (Google along-route), detour scope,
    // and the crew cadence inputs — travel style (relaxed/packed segment
    // spacing) and transport mode (fuel on/off). Style/mode changes are
    // explicit user controls, so they bust the cache and re-search in
    // real time instead of serving results tuned for the old settings.
    const hash = anchorHash(anchors) + '|' + routeHash(routeGeometry) + '|' + trip.travelStyle + '|' + trip.transportMode
    // Persisted results always win: returning to this tab, editing the trip, or
    // OSRM resolving after mount must NOT silently re-run the expensive corridor
    // search. Only ↻ Refresh, a detour-scope change, new anchors, or an empty
    // cache does.
    if (cached && isMapCacheFresh(cached, scopeKm, hash)) {
      setPois(cached.segments)
      return
    }
    let cancelled = false
    setLoadingPois(true)
    // Day Planner arming (P1-B/#121): the ROUTE arms the split — the clock
    // walk when it speaks ('ok' → its day count), the drive-day split when the
    // clock defers, tonight's hop otherwise. NEVER the planned day count: a
    // 700 km 1-day plan still needs its night halt; a 3-day 200 km trip none.
    const derivedMultiDay = clockVerdict.verdict === 'ok'
      ? travelDayNeed > 1
      : splitVerdict
        ? splitVerdict.driveDayCount > 1
        : clockVerdict.verdict === 'hop'
    planJourneyHalts(anchors, planKm, wholeTrip.min, { ...nearbyOpts, multiDay: derivedMultiDay }, scopeKm * 1000)
      .then(plan => {
        if (!cancelled) {
          setPois(plan)
          // Never cache an empty plan: the first search can run before the
          // route resolves, and a persisted [] would stick until Refresh.
          if (plan.length > 0) suggestionCache.setMapCache(plan, hash, scopeKm)
        }
      })
      .catch(() => { /* suggestions are best-effort */ })
      .finally(() => { if (!cancelled) setLoadingPois(false) })
    return () => { cancelled = true }
  }, [anchors, nearbyOpts, scopeKm, planKm, wholeTrip.min, travelDayNeed, clockVerdict.verdict, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // When the activation came from the map (pin hover/click), bring the matching
  // panel row into view so the two surfaces visibly point at the same place.
  useEffect(() => {
    if (activeHitId == null) return
    const row = listRef.current?.querySelector(`[data-hit-id="${activeHitId}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() })
  }, [activeHitId])

  /** Along-route km for any point on the current route (null off-polyline). */
  function routeKmOf(lat: number, lng: number): number | null {
    if (!routePolyline) return null
    const snap = projectOntoPolyline({ latitude: lat, longitude: lng }, routePolyline)
    return snap?.km ?? null
  }

  function addPoiToDay(hit: PlaceHit, dayIndex: number) {
    applyChange(draft => {
      const day = draft.days.find(d => d.index === dayIndex)!
      const newStop = {
        id: 'pending_' + Math.random().toString(36).slice(2),
        title: hit.name,
        category: (hit.category as ItineraryStop['category']) ?? 'sightseeing',
        locationName: hit.description ?? hit.name,
        lat: hit.latitude,
        lng: hit.longitude,
        description: hit.description ?? '',
        notes: hit.haltPurpose ? 'Added from the ride plan' : 'Added from nearby suggestions',
        visitMinutes: poiVisitMinutes(hit.category),
        // reported hours arrive on Google suggestion hits; free hits stay blank
        openTime: hit.openTime ?? '', closeTime: hit.closeTime ?? '',
        entryFeeInrPerPerson: 0,
        transportCostInrTotal: 0,
        priority: 'nice-to-have',
        sourceUrl: '',
        status: 'suggested',
        orderInDay: day.stops.length + 1,
      } as unknown as ItineraryStop
      // Route-ordered insertion: a new stop lands BETWEEN its road neighbours,
      // not at the end — adding B after A and C are confirmed yields A→B→C.
      const newKm = routeKmOf(hit.latitude, hit.longitude)
      let at = day.stops.length
      if (newKm != null) {
        at = day.stops.findIndex(s => {
          const km = routeKmOf(s.lat, s.lng)
          return km != null && km > newKm
        })
        if (at === -1) at = day.stops.length
        day.stops.splice(at, 0, newStop)
        // renumber so the Timeline's orderInDay sort matches road order
        day.stops.forEach((s, i) => { s.orderInDay = i + 1 })
      } else {
        day.stops.push(newStop)
      }
    }, 'add', dayIndex)
    setAddedIds(prev => new Set(prev).add(hit.id as string))
    toast(`“${hit.name}” added to Day ${dayIndex + 1}`)
  }

  function openAddModal(hit: PlaceHit) {
    // Pick-day default: an unknown position can't preselect honestly, so fall
    // back to the first day — the picker is user-adjustable, so nothing is
    // attributed silently (unlike the old dayForKm Day-1 fallback).
    setPickDay(dayForKm(hit.cumKm) ?? 0)
    setPoiDraft({ hit })
  }

  /** Shortlisting never edits the plan; it collects for the tray to act on. */
  function toggleShortlist(hit: PlaceHit) {
    setShortlist(prev =>
      prev.some(h => h.id === hit.id) ? prev.filter(h => h.id !== hit.id) : [...prev, hit],
    )
  }

  function addShortlisted() {
    for (const hit of shortlist) addPoiToDay(hit, dayForKm(hit.cumKm) ?? 0)
    setShortlist([])
  }

  /** Delete straight from the map pin's popup — with Undo (restoreStop puts
   *  the stop back on its day at its old order). The stop object must be
   *  captured BEFORE the delete, since the cache drops it immediately. */
  function removeStopFromMap(stopId: string, meta: { title: string; dayIndex: number }) {
    const stop = trip.days.find(d => d.stops.some(s => s.id === stopId))?.stops.find(s => s.id === stopId)
    deleteStop(trip.id, stopId)
    suggestionCache.clearMap()
    setRefreshTick(t => t + 1)
    if (stop) {
      undoToast(`Removed “${meta.title}” from the trip`, () => restoreStop(trip.id, stop, meta.dayIndex))
    } else {
      toast(`Removed “${meta.title}” from the trip`)
    }
  }

  /** Turn the shortlist into an open group decision, reusing the poll shape.
   *  Each option carries the place it stands for, so RESOLVING the decision
   *  lands the winner on the timeline as a confirmed stop (store's
   *  resolveDecision reads the payload) — shortlist → vote → resolved →
   *  on the board, timeline and map, with the rail's row dropping out. */
  function raiseShortlistVote() {
    if (shortlist.length === 0) return
    addDecision(trip.id, {
      question: shortlist.length === 1
        ? `Should we add "${shortlist[0].name}"?`
        : 'Which of these should we add?',
      context: 'Shortlisted from the Map rail',
      options: shortlist.map((h, i) => ({
        id: `tmp_${i}`,
        label: h.name,
        place: {
          title: h.name,
          category: (h.category as ItineraryStop['category']) ?? 'sightseeing',
          locationName: h.description ?? h.name,
          lat: h.latitude,
          lng: h.longitude,
          description: h.description,
          visitMinutes: poiVisitMinutes(h.category),
          ...(h.openTime ? { openTime: h.openTime } : {}),
          ...(h.closeTime ? { closeTime: h.closeTime } : {}),
          dayIndex: dayForKm(h.cumKm) ?? 0,
        },
      })),
    })
    toast('Decision posted for the group — resolving it adds the winner to the plan')
    setShortlist([])
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = searchQ.trim()
    if (q.length < 2) return
    setSearching(true)
    try {
      const hits = await searchPlaces(q)
      // Trip/route/map aware (user ask): "coffee on my route", not coffee
      // everywhere in India. Each hit is projected onto this trip's road and
      // ranked by detour (then road position); anything beyond the current
      // detour scope renders muted and the toast says why.
      const ranked = hits
        .map(h => ({ h, km: routeKmOf(h.latitude, h.longitude), off: detourKm(h, anchors) }))
        .sort((a, b) => (a.off ?? 9999) - (b.off ?? 9999) || (a.km ?? 0) - (b.km ?? 0))
      setSearchResults(ranked)
      const onScope = ranked.filter(e => e.off != null && e.off <= scopeKm)
      if (hits.length === 0) toast('No places found for that search.')
      else if (onScope.length === 0) toast(`Nothing for “${q}” within your ${scopeKm} km detour scope — widen the slider and search again.`)
    } catch {
      toast('Search failed — try again.', 'err')
    } finally {
      setSearching(false)
    }
  }

  const dayOptions = trip.days.map(d => ({ index: d.index }))

  // Split corridor suggestions into two curated columns: need-based halts
  // (fuel/food/rest/stretch/overnight/stay) on the LEFT in teal-amber, and
  // see-&-do / sightseeing + detours on the RIGHT in scenic purple — so the
  // map tab needs no scrolling to reach either kind (§6.10 CTI tone coding).
  const needs = pois.filter(sh => sh.segment && NEED_PURPOSES.has(sh.segment.purpose))
  const seeAndDo = pois.filter(sh => sh.segment && !NEED_PURPOSES.has(sh.segment.purpose))
  // #175: "Best fit" must DISTINGUISH — the top-scoring pick per purpose group
  // (SegmentHit.score, lower = better), not a participation badge on every
  // need card. Ties within epsilon earn no badge at all, honestly.
  const bestFitIds = useMemo(() => {
    const byPurpose = new Map<string, SegmentHit[]>()
    for (const sh of needs) {
      if (!sh.hit) continue
      const list = byPurpose.get(sh.segment.purpose) ?? []
      list.push(sh)
      byPurpose.set(sh.segment.purpose, list)
    }
    const ids = new Set<string>()
    const EPSILON = 1e-9
    for (const [, list] of byPurpose) {
      const best = list.reduce((a, b) => (b.score < a.score ? b : a), list[0])
      if (list.filter(sh => sh.score - best.score <= EPSILON).length === 1) ids.add(best.hit!.id as string)
    }
    return ids
  }, [needs])
  // Rail derivations for the V2 pass: one chip filter narrows both rails, and the
  // ruler marks reuse each card's own cumulative km so a dot never disagrees with
  // the number printed on its card.
  const needsForRail = chipFilter ? needs.filter(sh => sh.hit && chipsFor(sh, sh.hit).some(c => c.label === chipFilter)) : needs
  // A resolved group vote lands its winner on the timeline; those stops then
  // drop out of the see-&-do rail entirely (count included), same as the
  // “Added” state does for need halts. Name-match matches the rail's dedupe.
  const voteResolvedOut = (sh: { hit?: PlaceHit | null }) =>
    !!sh.hit && existingNames.has(sh.hit.name.toLowerCase())
  const seeAndDoLive = seeAndDo.filter(sh => !voteResolvedOut(sh))
  const seeForRail = chipFilter ? seeAndDoLive.filter(sh => sh.hit && chipsFor(sh, sh.hit).some(c => c.label === chipFilter)) : seeAndDoLive
  // #157: the ruler reads the SAME km the card prints — targetKm fallback
  // included. An off-polyline halt can never again be a card-dot disagreement.
  const needMarks = rulerMarks(needs.filter(sh => sh.hit).map(sh => ({ id: String(sh.hit!.id), km: sh.hit!.cumKm ?? sh.segment.targetKm, purpose: sh.segment.purpose })), planKm)
  const seeMarks = rulerMarks(seeAndDoLive.filter(sh => sh.hit).map(sh => ({ id: String(sh.hit!.id), km: sh.hit!.cumKm ?? sh.segment.targetKm, purpose: sh.segment.purpose })), planKm)
  const filterActive = chipFilter != null
  // Detour-budget enforcement (Horizon 3.2's "finite, honest menu"): the
  // see-&-do list is the endless one — need halts are finite by construction,
  // so the budget gates only sights. Per day: walk the journey-ordered sight
  // hits, spend each one's detour minutes against that day's budget, and mark
  // whatever no longer fits as HELD BACK — counted and shown as a line, never
  // offered as an addable card.
  const budgetHeldIds = new Set<string>()
  let budgetHeldCount = 0
  {
    const speedK = MODE_SPEED[trip.transportMode] ?? 40
    const byDay = new Map<number, SegmentHit[]>()
    for (const sh of seeAndDoLive) {
      if (!sh.hit) continue
      const d = dayForKm(sh.hit.cumKm) ?? 0
      const list = byDay.get(d) ?? []
      list.push(sh)
      byDay.set(d, list)
    }
    for (const [d, rows] of byDay) {
      const budget = dayDetourBudgetMin({
        travelStyle: trip.travelStyle,
        plannedStops: (trip.days.find(x => x.index === d)?.stops ?? []).filter(s => s.status !== 'rejected').length,
      })
      const { deferred } = splitByDetourBudget(
        rows.map(sh => ({ sh, detourMin: asymmetricDetourMinutes(sh.hit!, anchors, routePolyline ?? null, speedK) })),
        budget,
      )
      for (const { sh } of deferred) {
        budgetHeldIds.add(sh.hit!.id as string)
        budgetHeldCount += 1
      }
    }
  }
  // Quota honesty (Google-only directive): when the textSearchPro soft cap is
  // hit, every Google-mode corridor scan returns [] — say why instead of
  // rendering an empty state that reads like "nothing around".
  const quotaOut = googleEnabled() && quotaUsed('textSearchPro') >= SOFT_CAPS.textSearchPro
  // Story arcs: themed bundles from live, not-yet-added sights.
  const arcHits = seeAndDoLive.flatMap(sh => {
    const h = sh.hit
    if (!h || addedIds.has(h.id as string) || dismissedIds.has(h.id as string)) return []
    return [h]
  })
  const arcs = clusterStoryArcs(arcHits)

  /**
   * "Also nearby" candidates, pre-grouped once per render instead of per row.
   * Detour distance is the expensive part (it walks the anchor list), so it is
   * computed once per hit here; rows only rank the already-filtered pool.
   */
  const altPool = useMemo(() => {
    type AltEntry = { h: PlaceHit; dKm: number | null }
    const all: AltEntry[] = []
    const byPurpose = new Map<string, AltEntry[]>()
    const byCategory = new Map<string, AltEntry[]>()
    const push = (map: Map<string, AltEntry[]>, key: string, e: AltEntry) => {
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    for (const r of pois) {
      const h = r.hit
      if (!h) continue
      const id = h.id as string
      if (dismissedIds.has(id) || addedIds.has(id) || existingNames.has(h.name.toLowerCase())) continue
      const e: AltEntry = { h, dKm: detourKm(h, anchors) }
      all.push(e)
      if (h.haltPurpose) push(byPurpose, h.haltPurpose, e)
      if (h.category) push(byCategory, h.category, e)
    }
    return { all, byPurpose, byCategory }
  }, [pois, dismissedIds, addedIds, existingNames, anchors])

  /** One corridor-suggestion row (gap or hit). Shared by both split columns. */
  // Group need halts by purpose, keeping engine order. The header label comes
  // from the segment itself ("Fuel", "Lunch", ...) so no extra label map is
  // needed and the copy stays in sync with the planner.
  function groupByPurpose(list: SegmentHit[]): Array<[string, SegmentHit[]]> {
    const groups: Array<[string, SegmentHit[]]> = []
    for (const sh of list) {
      const key = sh.segment.purpose
      const found = groups.find(([k]) => k === key)
      if (found) found[1].push(sh)
      else groups.push([key, [sh]])
    }
    return groups.map(([key, items]) => [items[0]?.segment.label ?? key, items])
  }

  /** Closest alternatives for a halt: next 2 by road position plus detour. */
  function alternativesFor(sh: SegmentHit, hit: PlaceHit): Array<{ h: PlaceHit; dKm: number | null }> {
    // keep same family: need halts prefer same purpose, sights accept any sight
    const family = NEED_PURPOSES.has(sh.segment.purpose)
      ? [...(altPool.byPurpose.get(sh.segment.purpose) ?? []), ...(altPool.byCategory.get(hit.category ?? '') ?? [])]
      : altPool.all
    const seen = new Set<string>()
    return family
      .filter(e => {
        const id = e.h.id as string
        if (id === hit.id || seen.has(id)) return false
        seen.add(id)
        return true
      })
      .map(e => {
        const pos = e.h.cumKm ?? sh.segment.targetKm
        return { h: e.h, dKm: e.dKm, dist: Math.abs(pos - sh.segment.targetKm) + (e.dKm ?? 0) * 2 }
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2)
      .map(e => ({ h: e.h, dKm: e.dKm ?? null }))
  }

  /** Reason chips for one suggestion, shared by the card and the rail filter. */
  function chipsFor(sh: SegmentHit, hit: PlaceHit): RailChip[] {
    const detourMin = asymmetricDetourMinutes(hit, anchors, routePolyline ?? null, MODE_SPEED[trip.transportMode] ?? 40)
    const hitDay = trip.days.find(d => d.index === dayForKm(hit.cumKm))
    const dayBudget = dayDetourBudgetMin({
      travelStyle: trip.travelStyle,
      plannedStops: (hitDay?.stops ?? []).filter(s => s.status !== 'rejected').length,
    })
    return railReasonChips({
      purpose: sh.segment.purpose,
      etaMinutes: sh.segment.etaMinutes ?? null,
      minutesFromPrev: sh.segment.minutesFromPrev,
      isFirstSegment: sh.segment.index === 0,
      detourMinutes: detourMin,
      budgetSharePct: detourMin > 0.5 ? budgetSharePct(detourMin, dayBudget) : null,
      // #163: same predicate as the fact strip (round-half-up display math),
      // so a budget-exact halt can't be 'fine' on the card and 'held back' on
      // the rail — or flip between them on a display-rounding nudge.
      overBudget: Math.round(detourMin) > dayBudget,
      rating: hit.rating,
    })
  }

  function renderPoi(sh: SegmentHit) {
    const hit = sh.hit
    // dismissed stays hidden for the session (logged as a DNA decline)
    if (hit && dismissedIds.has(hit.id as string)) return null
    if (!hit) {
      return (
        <div key={`gap-${sh.segment.index}`} className="poi-plan-row poi-plan-gap">
              <span className={`ride-purpose ride-purpose-${sh.segment.purpose} ride-purpose-muted`}>{sh.segment.label}</span>
              <span className="muted small">No good match near ~{sh.segment.targetKm.toFixed(0)} km yet.</span>
              {/* A gap has no place to add, so the action raises the corridor's
                  detour scope - the honest lever the engine actually has. */}
              <button
                type="button"
                className="poi-gap-add"
                title="Raises the detour scope so more stops qualify. You can also add a stop on the Timeline and it will pin itself here."
                onClick={() => {
                  setScopeIdx(i => Math.min(i + 1, SCOPE_KM_STEPS.length - 1))
                  toast('Widened the search - the corridor will re-plan')
                }}
              >
                Widen search
              </button>
            </div>
      )
    }
    const added = addedIds.has(hit.id as string) || existingNames.has(hit.name.toLowerCase())
    // A resolved group vote puts the winner ON the timeline — the losing rows
    // and the winner's own suggestion row must not keep offering it. Name-match
    // is the same convention the rest of the rail uses for dedupe.
    if (added && !NEED_PURPOSES.has(sh.segment.purpose)) return null
    const offRoute = detourKm(hit, anchors)
    const detourMin = asymmetricDetourMinutes(hit, anchors, routePolyline ?? null, MODE_SPEED[trip.transportMode] ?? 40)
    // per-day budget: the hit's own day sets the density, not the whole trip
    const hitDay = trip.days.find(d => d.index === dayForKm(hit.cumKm))
    const dayBudget = dayDetourBudgetMin({
      travelStyle: trip.travelStyle,
      plannedStops: (hitDay?.stops ?? []).filter(s => s.status !== 'rejected').length,
    })
    // Trip DNA is already built once per render in nearbyOpts (it reads and
    // parses the localStorage log) — never rebuild it per row.
    const dnaNote = (nearbyOpts.dnaVector ? dnaNoteForHit(hit, nearbyOpts.dnaVector) : null)
      ?? crewNoteForHit(hit, crewSeeds)
    const alts = alternativesFor(sh, hit)
    // Structured reasons: every chip traces back to a number the engine already
    // produced (clock, detour budget, hours, rating) - nothing is invented here.
    const chips = chipsFor(sh, hit)
    const shortlisted = shortlist.some(h => h.id === hit.id)
    // Over the day's detour budget: shown as a counted line, not an offer.
    if (budgetHeldIds.has(hit.id as string)) {
      return (
        <div key={hit.id} className="poi-plan-row poi-plan-gap">
          <span className={`ride-purpose ride-purpose-${sh.segment.purpose} ride-purpose-muted`}>{sh.segment.label}</span>
          <span className="muted small">{hit.name} — held back: its ≈{fmtDur(detourMin)} detour exceeds what&apos;s left of Day {(dayForKm(hit.cumKm) ?? 0) + 1}&apos;s detour budget. Add it from the map pin if it is worth it.</span>
        </div>
      )
    }
    return (
      <div
        key={hit.id}
        data-hit-id={hit.id}
        className={`poi-plan-row${activeHitId === hit.id ? ' poi-plan-row--active' : ''}`}
        onClick={() => setActiveHitId(hit.id as string | number)}
        title="Show this stop on the map"
      >
        <div className="ride-spot-title">
          {hit.thumb && <img className="poi-thumb" src={smallThumb(hit.thumb)} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} />}
          <b>{hit.name}</b>
          {NEED_PURPOSES.has(sh.segment.purpose) && !added && bestFitIds.has(hit.id as string) && <span className="poi-best">Best fit</span>}
          <button
            type="button"
            className={shortlisted ? 'poi-short is-on' : 'poi-short'}
            aria-pressed={shortlisted}
            title={shortlisted ? `Remove ${hit.name} from the shortlist` : `Shortlist ${hit.name} for the group`}
            aria-label={shortlisted ? `Remove ${hit.name} from the shortlist` : `Shortlist ${hit.name} for the group`}
            onClick={(e) => { e.stopPropagation(); toggleShortlist(hit) }}
          >
            {shortlisted ? <CircleCheck size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
          </button>
        </div>
        {/* The planner is clock-first (PLAN-DAY-PLANNER section 4), so the strip
            leads with the wall clock it derived the halt from, not just km. */}
        <div className="poi-facts">
          <span className="poi-fact">{hit.cumKm ?? sh.segment.targetKm.toFixed(0)} km in</span>
          {sh.segment.etaMinutes != null && (
            <span className="poi-fact"><i>·</i>arrive {formatHM(clockHM(sh.segment.etaMinutes), timeFormat)}</span>
          )}
          {(hit.openTime || hit.closeTime) && (
            <span className="poi-fact" title="Reported hours"><i>·</i>{formatHMRange(hit.openTime, hit.closeTime, timeFormat)}</span>
          )}
          {detourMin > 0.5 && (
            <span className={'poi-fact' + (Math.round(detourMin) > dayBudget ? ' poi-fact--warn' : detourMin <= 10 ? ' poi-fact--fine' : '')}>
              <i>·</i>{fmtDur(detourMin)} detour
            </span>
          )}
          {sh.segment.purpose === 'overnight' && (
            <span className="poi-fact"><i>·</i>day ends here</span>
          )}
          {/* Detour whisker: the route line with this halt's spur. The spur turns
              amber when the detour is heavy, so cost is visible before the
              number is read. */}
          <svg className="poi-whisk" width={54} height={20} viewBox="0 0 54 20" aria-hidden>
            <path className="poi-whisk-route" d="M1 14h52" />
            <path
              className={detourMin > dayBudget ? 'poi-whisk-spur poi-whisk-spur--heavy' : 'poi-whisk-spur'}
              d={`M32 14 L45 ${detourMin > 20 ? 3 : 6}`}
            />
            <circle
              className={detourMin > dayBudget ? 'poi-whisk-pin poi-whisk-pin--heavy' : 'poi-whisk-pin'}
              cx={45}
              cy={detourMin > 20 ? 3 : 6}
              r={3}
            />
          </svg>
        </div>
        {/* Day Planner chips (P1-D/P1-F): which derived day the hit lands on,
            whether it sits past a night halt, and — on round trips — whether
            you only ever pass it on the drive back. */}
        {hit.cumKm != null && (
          <div className="poi-desc small">
            {splitVerdict && splitVerdict.driveDayCount > 1 && (
              <span className="ride-day-chip">
                Day {splitVerdict.nightHalts.filter(n => hit.cumKm! > n).length + 1}
                {splitVerdict.nightHalts.some(n => hit.cumKm! > n) ? ' · after your night stop' : ''}
              </span>
            )}
            {tripIsRoundTrip && hit.cumKm != null && planKm > 0 && hit.cumKm > planKm * 0.75 && (
              <span className="ride-day-chip" title="You pass this point again on the drive back">return leg</span>
            )}
          </div>
        )}
        {/* Structured reasons first. The prose why only stands in when there are
            none, and a learned DNA or crew note keeps its own labelled line. */}
        {chips.length > 0 && (
          <div className="poi-rchips">
            {chips.map(c => (
              <button
                key={c.label}
                type="button"
                className={(c.tone === 'warn' ? 'poi-rchip poi-rchip--warn' : 'poi-rchip') + (chipFilter === c.label ? ' is-on' : '')}
                aria-pressed={chipFilter === c.label}
                title={chipFilter === c.label ? 'Stop filtering by this reason' : 'Show only suggestions with this reason'}
                onClick={(e) => { e.stopPropagation(); setChipFilter(prev => (prev === c.label ? null : c.label)) }}
              >
                {c.icon === 'star' && <Star size={11} aria-hidden />}
                {c.label}
              </button>
            ))}
          </div>
        )}
        {dnaNote && (
          <div className="poi-reason">
            <span className="poi-reason-k">For you</span>
            <span>{dnaNote}</span>
          </div>
        )}
        {!dnaNote && chips.length === 0 && (
          <div className="poi-reason">
            <span className="poi-reason-k">Why</span>
            <span>{reasonForSegmentHit(sh, offRoute)}</span>
          </div>
        )}
        {sh.segment.roadWarning && (
          <div className="poi-desc small">⚠ {sh.segment.roadWarning}</div>
        )}
        {/* Closest alternatives: need halts show them as candidate rows under the
            recommended pick; sights keep them folded behind an expander. */}
        {alts.length > 0 && NEED_PURPOSES.has(sh.segment.purpose) && (
          <div className="poi-cands">
            {alts.map(({ h, dKm }) => (
              <div key={h.id as string} className="poi-cand">
                <b>{h.name}</b>
                <span className="poi-cand-f">{dKm != null ? `${dKm.toFixed(1)} km off` : 'on route'}</span>
                <button
                  type="button"
                  className={shortlist.some(s => s.id === h.id) ? 'poi-cand-add is-on' : 'poi-cand-add'}
                  onClick={(e) => { e.stopPropagation(); toggleShortlist(h) }}
                  aria-pressed={shortlist.some(s => s.id === h.id)}
                  title={shortlist.some(s => s.id === h.id) ? `Remove ${h.name} from the shortlist` : `Shortlist ${h.name}`}
                  aria-label={shortlist.some(s => s.id === h.id) ? `Remove ${h.name} from the shortlist` : `Shortlist ${h.name}`}
                >{shortlist.some(s => s.id === h.id) ? <CircleCheck size={12} aria-hidden /> : <Plus size={12} aria-hidden />}</button>
              </div>
            ))}
          </div>
        )}
        {alts.length > 0 && !NEED_PURPOSES.has(sh.segment.purpose) && (
          <details className="poi-alts">
            <summary onClick={(e) => e.stopPropagation()}><ChevronDown className="poi-chev" size={12} aria-hidden />{alts.length} alternative{alts.length === 1 ? '' : 's'}</summary>
            <div className="poi-alt-list">
              {alts.map(({ h, dKm }) => (
                <button key={h.id as string} className="chip chip-sm" onClick={(e) => { e.stopPropagation(); openAddModal(h) }} title={h.name}>
                  {h.name}{dKm != null ? ` · ${dKm.toFixed(1)} km off` : ''}
                </button>
              ))}
            </div>
          </details>
        )}
        <div className="poi-actions">
          {editable && (
            added
              ? <span className="chip chip-teal"><CircleCheck size={11} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />Added</span>
              : <>
                  <button className="btn btn-primary btn-sm" onClick={() => openAddModal(hit)}>+ Add</button>
                  {' '}
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Not interested — hide this and teach the engine"
                    onClick={() => {
                      recordDnaEvent({ tripId: trip.id, action: 'decline', category: hit.category, detourMin })
                      suggestionCache.clearMap()
                      setDnaTick(t => t + 1)
                      // House rule: a cache clear must pair with a tick that is
                      // IN the fetch effect's dep array, or nothing refills it.
                      setRefreshTick(t => t + 1)
                      setDismissedIds(prev => new Set(prev).add(hit.id as string))
                    }}
                  >Not for us</button>
                  {' '}
                  <a
                    href={googleMapsUrl(hit)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    title="Open in Google Maps"
                    onClick={e => { e.preventDefault(); openExternal(googleMapsUrl(hit)) }}
                  >
                    <ExternalLink size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />Maps
                  </a>
                </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="card">
        <div className="row-between">
          <h3 style={{ margin: 0 }}><Lightbulb size={16} aria-hidden style={{ verticalAlign: '-3px', marginRight: 4 }} />Nearby ideas</h3>
          <div className="row-between" style={{ gap: 10 }}>
            <span className="small muted">{loadingPois ? 'searching…' : `${pois.filter(p => p.hit).length} suggested stops — spaced for fatigue & anchored on cities`}</span>
            <button
              className="btn btn-outline btn-sm suggestion-refresh-btn"
              title="Refresh suggestions"
              onClick={() => { suggestionCache.clearMap(); setRefreshTick(t => t + 1) }}
              disabled={loadingPois}
            >
              <RotateCcw size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />Refresh
            </button>
          </div>
        </div>
        <p className="hint-text" style={{ margin: '4px 0 6px' }}>
          Live data from {googleEnabled() ? 'Google Places' : 'OpenStreetMap, Wikipedia & Mappls'}: ideas are clock-anchored — lunch lands in the 11:30–14:30 window, stretch breaks follow wheel time, fuel rides your tank’s rhythm, and long drives end at a real city for the night. Every pick is checked against your detour budget. Never around your starting point.
        </p>
        <form className="row-between" style={{ gap: 8, marginBottom: 8 }} onSubmit={onSearch}>
          <input className="input" value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search anything to add — a trek, a homestay, a petrol pump…"
            aria-label="Search places to add to the trip" style={{ flex: 1 }} />
          <button className="btn btn-outline btn-sm" type="submit" disabled={searching} style={{ flex: '0 0 auto' }}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        {searchResults.length > 0 && (
          <div className="map-search-results" style={{ marginBottom: 10 }}>
            {searchResults.slice(0, 5).map(({ h, km, off }) => {
              const inScope = off != null && off <= scopeKm
              return (
                <div key={h.id as string} className="row-between" style={{ padding: '5px 2px', borderBottom: '1px solid var(--line)', opacity: inScope ? undefined : 0.6 }}>
                  <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.name}{h.nearestCity ? ` · ${h.nearestCity}` : ''}
                    <span className="muted">{' — '}
                      {km != null ? `~${Math.round(km)} km into the trip` : 'off the road'}
                      {off != null ? ` · ${off < 0.5 ? 'on route' : `${Math.round(off)} km off-route`}` : ''}
                      {!inScope && ' · beyond your detour scope'}
                    </span>
                  </span>
                  {editable && <button className="btn btn-primary btn-sm" type="button" style={{ flex: '0 0 auto', marginLeft: 8 }} onClick={() => openAddModal(h)}>+ Add</button>}
                </div>
              )
            })}
          </div>
        )}
        <div className="row-between" style={{ gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 230 }}>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>Detour scope</span>
            <input
              type="range"
              min={0}
              max={SCOPE_KM_STEPS.length - 1}
              step={1}
              value={scopeIdx}
              onChange={e => changeScope(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-label="How far from the route to search suggestions"
            />
            <b style={{ whiteSpace: 'nowrap', minWidth: 46, textAlign: 'right' }}>{scopeKm} km</b>
          </label>
        </div>
        {/* Day Planner proposals (P1-B/P1-C) — the split the route demands,
            the defer/hop verdict for the real start time. They sit above the
            strip because they change WHAT the strip plans. */}
        {clockVerdict.verdict === 'defer' && (
          <div className="dayplanner-banner" role="status">
            <b>Too late to drive honestly today.</b>
            <span className="small muted">{clockVerdict.reason}</span>
            {editable && (
              <button className="btn btn-primary btn-sm" onClick={() => applyChange(draft => { const d0 = draft.days[0]; if (d0) d0.startTime = DEFER_START }, 'edit', 0)}>
                Set a {DEFER_START} start
              </button>
            )}
          </div>
        )}
        {clockVerdict.verdict === 'hop' && (
          <div className="dayplanner-banner" role="status">
            <b>Late start — a short hop, then rest.</b>
            <span className="small muted">{clockVerdict.reason}</span>
          </div>
        )}
        {(routeTotalKm != null || routeFailed) && splitVerdict && clockVerdict.verdict === 'ok' && travelDayNeed > trip.days.length && (
          <div className="dayplanner-banner" role="status">
            <b>This drive needs {travelDayNeed} travel days{tripIsRoundTrip ? ' — there and back' : ''}.</b>
            <span className="small muted">
              {routeTotalKm == null && 'Rough estimate — the road measurement did not resolve. '}≈{Math.round(splitVerdict.perDay)} km a day keeps wheel time ≈{minutesToHM(splitVerdict.maxDailyWheelMin)} — the honest cap for {(trip.travelStyle ?? 'balanced')} pace.
            </span>
            {!splitDeclined ? (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={applySplitDays}>
                  Apply — add {travelDayNeed - trip.days.length} day{travelDayNeed - trip.days.length !== 1 ? 's' : ''}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSplitDeclined(true)}>Keep my {trip.days.length}-day plan</button>
              </div>
            ) : (
              <span className="small dayplanner-red">
                Keeping {trip.days.length} day{trip.days.length !== 1 ? 's' : ''}: ≈{minutesToHM(wholeTrip.min * loopFactor)} behind the wheel in a single stretch is past the honest cap — the fatigue verdict stays red.
              </span>
            )}
          </div>
        )}
        {!loadingPois && pois.length === 0 && (
          fractionPois && fractionPois.length > 0 ? (
            <div>
              <p className="muted small" style={{ marginBottom: 6 }}>
                Below the fatigue-plan floor, but the corridor has places — the closest to each quarter of the drive:
              </p>
              {(() => {
                // One Set across all three rows (#128a): a place can't win two quarters.
                const usedFracIds = new Set<string>()
                return [0.25, 0.5, 0.75].map(frac => {
                const targetKm = planKm * frac
                // Purpose-fit first (#128a): sights and food serve a quarter
                // stop — fuel/rest are errands, not destinations. Each place
                // wins at most ONE quarter (usedFracIds), so ½ doesn't repeat ¼.
                const ranked = fractionPois
                  .filter(h => !usedFracIds.has(h.id as string))
                  .filter(h => isSightCategory(h.category) || (h.category ?? '') === 'food' || (h.category ?? '') === 'cafe')
                  .map(h => ({ h, km: h.cumKm ?? kmFromStartForHit(h, anchors, { routePolyline: routePolyline ?? undefined }) }))
                  .filter(e => e.km != null)
                  .sort((a, b) => Math.abs((a.km as number) - targetKm) - Math.abs((b.km as number) - targetKm))
                const near = ranked[0]
                if (near) usedFracIds.add(near.h.id as string)
                const label = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : '¾'
                return (
                  <div key={frac} className="poi-plan-row poi-plan-gap">
                    <span className="ride-purpose ride-purpose-sight ride-purpose-muted">{label} of the drive</span>
                    {near ? (
                      <span className="small">
                        ~{Math.round(targetKm)} km — <b>{near.h.name}</b>
                        {editable && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => openAddModal(near.h)}>+ Add</button>}
                      </span>
                    ) : (
                      // #128c: a non-empty pool with no fit here is a scope/
                      // purpose miss, not an empty corridor — say the honest thing.
                      <span className="muted small">{fractionPois.length > 0
                        ? 'no sight or meal near this quarter — try widening the detour scope.'
                        : 'no corridor stop found — add a stop on the Timeline and suggestions will pin themselves here.'}</span>
                    )}
                  </div>
                )
                })
              })()}
            </div>
          ) : quotaOut ? (
            // #176: under quota-out the empty strip must not blame the plan.
            <p className="muted small">Google search quota reached — corridor fallback suggestions are paused until the counter rolls over (this is not about your route).</p>
          ) : (
            <p className="muted small">Not enough driving distance yet for a fatigue plan — add a longer route (90+ km) in the Timeline and segmented stop suggestions will appear here.</p>
          )
        )}
      </div>
      {filterActive && (
        <div className="poi-filterbar" role="status">
          <span>Showing only suggestions that are {chipFilter}</span>
          <button type="button" onClick={() => setChipFilter(null)}>Clear filter</button>
        </div>
      )}
      <div className={'map-ideas-grid' + (folded.needs ? ' is-needs-folded' : '') + (folded.see ? ' is-see-folded' : '')} ref={listRef}>
        <EngineTips />
        <div className="poi-col poi-col--needs" id="rail-needs">
            <div className="poi-col-head">
              <span className="poi-col-head-ico"><Fuel size={13} aria-hidden /></span>
              <div>
                <b>Need-based halts</b>
                <span className="small muted">{needs.length === 0 ? 'fuel · food · rest · stretch · overnight' : `${needs.length} halts on this corridor`}</span>
              </div>
              <span className="poi-col-count">{needsForRail.length}</span>
              <button
                type="button"
                className="poi-fold"
                aria-expanded={!folded.needs}
                aria-controls="rail-needs"
                title={folded.needs ? 'Expand the needs rail' : 'Collapse the needs rail — the map gains the space'}
                onClick={() => setFolded(f => ({ ...f, needs: !f.needs }))}
              >
                <ChevronDown size={13} aria-hidden />
              </button>
            </div>
            <div className="poi-ruler" aria-hidden>
              <span className="poi-ruler-axis" />
              {needMarks.map(m => (
                <span key={m.id} className={`poi-ruler-dot poi-ruler-dot--${m.tone}`} style={{ left: `${m.pct}%` }} />
              ))}
              <span className="poi-ruler-km">{Math.round(planKm)} km</span>
            </div>
            <div className="poi-plan-list">
              {needsForRail.length === 0
                ? <p className="muted small">{quotaOut
                  ? 'Google search quota reached — need-based halts are paused until the counter rolls over.'
                  : 'No need-based halts surfaced yet — they appear as you add driving days.'}</p>
                : groupByPurpose(needsForRail).map(([label, items]) => (
                    <div key={label}>
                      <div className="poi-grp">
                        <span className="poi-grp-k">{label}</span>
                        <span className="poi-grp-n">{items.length}</span>
                        <span className="poi-grp-ln" />
                      </div>
                      {items.map(renderPoi)}
                    </div>
                  ))}
            </div>
          </div>
          <div className="map-ideas-map">
            <TripMap
              trip={trip}
              nearbyPois={pois.flatMap(p => p.hit ? [p.hit] : [])}
              onAddNearby={editable ? (hit) => openAddModal(hit) : undefined}
              activeHitId={activeHitId}
              onActivateHit={setActiveHitId}
              onOpenInTimeline={onOpenTimeline}
              onOpenInBoard={onOpenBoard ? () => onOpenBoard() : undefined}
              onDeleteStop={editable ? removeStopFromMap : undefined}
              enableMapViewModes
            />
          </div>
          <div className="poi-col poi-col--see" id="rail-see">
            <div className="poi-col-head">
              <span className="poi-col-head-ico"><MapPin size={13} aria-hidden /></span>
              <div>
                <b>See &amp; do</b>
                <span className="small muted">{arcs.slice(0, 2).length + seeAndDoLive.length === 0 ? 'sightseeing · detours · scenic stops' : `${arcs.slice(0, 2).length} arcs · ${seeAndDoLive.length} picks on this corridor`}</span>
              </div>
              <span className="poi-col-count">{filterActive ? seeForRail.length : arcs.slice(0, 2).length + seeAndDoLive.length}</span>
              <button
                type="button"
                className="poi-fold"
                aria-expanded={!folded.see}
                aria-controls="rail-see"
                title={folded.see ? 'Expand the see-&-do rail' : 'Collapse the see-&-do rail — the map gains the space'}
                onClick={() => setFolded(f => ({ ...f, see: !f.see }))}
              >
                <ChevronDown size={13} aria-hidden />
              </button>
            </div>
            <div className="poi-ruler" aria-hidden>
              <span className="poi-ruler-axis" />
              {seeMarks.map(m => (
                <span key={m.id} className={`poi-ruler-dot poi-ruler-dot--${m.tone}`} style={{ left: `${m.pct}%` }} />
              ))}
              <span className="poi-ruler-km">{Math.round(planKm)} km</span>
            </div>
            <div className="poi-plan-list">
              {!filterActive && arcs.slice(0, 2).length > 0 && (
                <div className="poi-grp">
                  <span className="poi-grp-k">Route arcs</span>
                  <span className="poi-grp-n">{arcs.slice(0, 2).length}</span>
                  <span className="poi-grp-ln" />
                </div>
              )}
              {arcs.slice(0, 2).map(arc => (
                <div key={arc.theme} className="poi-plan-row poi-plan-arc">
                  <div className="ride-spot-title">
                    <span className="ride-purpose ride-purpose-sight">{arc.label.split(':')[0]}</span>
                    <b>{arc.label.split(':').slice(1).join(':').trim()}</b>
                  </div>
                  <div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        let n = 0
                        const toAdd: { hit: PlaceHit; dayIndex: number }[] = []
                        for (const id of arc.hitIds) {
                          const m = arcHits.find(h => (h.id as string) === (id as string))
                          if (!m || addedIds.has(m.id as string)) continue
                          recordDnaEvent({ tripId: trip.id, action: 'accept', category: m.category, detourMin: asymmetricDetourMinutes(m, anchors, routePolyline ?? null, MODE_SPEED[trip.transportMode] ?? 40), visitMin: visitMinutesForCategory(m.category) })
                          const mDay = dayForKm(m.cumKm)
                          toAdd.push({ hit: m, dayIndex: mDay ?? 0 })
                          n += 1
                        }
                        suggestionCache.clearMap()
                        // Batch apply all stops in a single change — each one
                        // inserted at its road position (same rule as single adds)
                        if (n > 0) {
                          applyChange(draft => {
                            const byDay = new Map<number, { hit: PlaceHit }[]>()
                            for (const item of toAdd) {
                              const list = byDay.get(item.dayIndex) ?? []
                              list.push(item)
                              byDay.set(item.dayIndex, list)
                            }
                            for (const [dayIndex, items] of byDay) {
                              const day = draft.days.find(d => d.index === dayIndex)!
                              // new stops sorted by road position so sequential
                              // splices land in journey order
                              const sorted = [...items].sort((a, b) =>
                                (routeKmOf(a.hit.latitude, a.hit.longitude) ?? Infinity) -
                                (routeKmOf(b.hit.latitude, b.hit.longitude) ?? Infinity))
                              for (const { hit } of sorted) {
                                const stop = {
                                  id: 'pending_' + Math.random().toString(36).slice(2),
                                  title: hit.name,
                                  category: (hit.category as ItineraryStop['category']) ?? 'sightseeing',
                                  locationName: hit.description ?? hit.name,
                                  lat: hit.latitude,
                                  lng: hit.longitude,
                                  description: hit.description ?? '',
                                  notes: hit.haltPurpose ? 'Added from the ride plan' : 'Added from nearby suggestions',
                                  visitMinutes: poiVisitMinutes(hit.category),
                                  openTime: hit.openTime ?? '', closeTime: hit.closeTime ?? '',
                                  entryFeeInrPerPerson: 0,
                                  transportCostInrTotal: 0,
                                  priority: 'nice-to-have',
                                  sourceUrl: '',
                                  status: 'suggested',
                                  orderInDay: day.stops.length + 1,
                                } as unknown as ItineraryStop
                                const km = routeKmOf(hit.latitude, hit.longitude)
                                let at = -1
                                if (km != null) {
                                  at = day.stops.findIndex(s => {
                                    const skm = routeKmOf(s.lat, s.lng)
                                    return skm != null && skm > km
                                  })
                                }
                                if (at === -1) day.stops.push(stop)
                                else day.stops.splice(at, 0, stop)
                              }
                              day.stops.forEach((s, i) => { s.orderInDay = i + 1 })
                            }
                          }, 'add', toAdd[0].dayIndex)
                        }
                        setAddedIds(prev => {
                          const next = new Set(prev)
                          for (const id of arc.hitIds) next.add(id as string)
                          return next
                        })
                        toast(n > 0 ? `“${arc.label.split(':')[0]}” added (${n} stops)` : 'All of those are already added')
                      }}
                    >Add all ({arc.hitIds.length})</button>
                  </div>
                </div>
              ))}
              {quotaOut && (
                <p className="hint-text" role="status">⚠ Google search quota reached for this month — corridor suggestions are paused until the counter rolls over. Removing the key from settings serves the free stack instead.</p>
              )}
              {seeForRail.length === 0
                ? <p className="muted small">Sightseeing &amp; detour stops will appear here along the corridor.</p>
                : (
                    <>
                      <div className="poi-grp">
                        <span className="poi-grp-k">Individual picks</span>
                        <span className="poi-grp-n">{seeForRail.length}</span>
                        <span className="poi-grp-ln" />
                      </div>
                      {seeForRail.slice(0, SEE_VISIBLE).map(renderPoi)}
                      {seeForRail.length > SEE_VISIBLE && (
                        <details className="poi-more">
                          <summary><ChevronDown className="poi-chev" size={12} aria-hidden />{seeForRail.length - SEE_VISIBLE} more picks</summary>
                          <div className="poi-more-list">{seeForRail.slice(SEE_VISIBLE).map(renderPoi)}</div>
                        </details>
                      )}
                    </>
                  )}
              {budgetHeldCount > 0 && (
                <p className="hint-text">{budgetHeldCount} idea{budgetHeldCount === 1 ? '' : 's'} held back — beyond the day&apos;s detour budget. Add fewer stops, or raise the scope, and the engine will offer them again.</p>
              )}
            </div>
          </div>
      </div>
      {/* Shortlist tray: the rail collects, the tray decides. Sticky so it stays
          reachable while the rails scroll. */}
      {shortlist.length > 0 && (
        <div className="poi-tray" role="region" aria-label="Shortlisted stops">
          <span className="poi-tray-n">{shortlist.length} shortlisted</span>
          <span className="poi-tray-actions">
            <button className="btn btn-primary btn-sm" type="button" onClick={addShortlisted}>Add all</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={raiseShortlistVote}>Send to a vote</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShortlist([])}>Clear</button>
          </span>
        </div>
      )}
      {/* pick-a-day modal for adding a suggested POI — explicit confirm */}
      <Modal open={!!poiDraft} onClose={() => setPoiDraft(null)} title={`Add “${poiDraft?.hit.name ?? ''}”`}>
        {poiDraft && (
          <div>
            {poiDraft.hit.description && <p className="small muted" style={{ marginTop: 0 }}>{poiDraft.hit.description}</p>}
            <Field label="Add to which day?">
              <Select
                value={String(pickDay)}
                onChange={v => setPickDay(Number(v))}
                options={dayOptions.map(d => ({ value: String(d.index), label: `Day ${d.index + 1}` }))}
              />
            </Field>
            <p className="hint-text">You can fine-tune duration, fees and timings in the Timeline afterwards.</p>
            <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-outline" onClick={() => setPoiDraft(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { recordDnaEvent({ tripId: trip.id, action: 'accept', category: poiDraft.hit.category, detourMin: asymmetricDetourMinutes(poiDraft.hit, anchors, routePolyline ?? null, MODE_SPEED[trip.transportMode] ?? 40), visitMin: visitMinutesForCategory(poiDraft.hit.category) }); suggestionCache.clearMap(); setDnaTick(t => t + 1); addPoiToDay(poiDraft.hit, pickDay); setPoiDraft(null) }}>
                Add to timeline
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
