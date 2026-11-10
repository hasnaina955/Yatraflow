// ============ Trip workspace — Map tab ============
// Mechanical extraction from src/pages/TripWorkspace.tsx (M3.4) — no behavior changes.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InlineIcon, CatIcon } from '../../components/icons'
import { BedDouble, ChevronDown, Coffee, Fuel, Lightbulb, Pause, Plus, RefreshCw, RotateCcw, Sparkles, Utensils, Route, List, PanelLeftOpen, PanelRightOpen, SlidersHorizontal } from 'lucide-react'
import { uid } from '../../data/seed'
import type { Trip } from '../../data/types'
import { removeStopWithUndo, type ApplyChange } from '../../lib/mutationLifecycle'
import { mapRoadViewFromLegs, mapReturnGeometryFromLegs, outboundLegs, type TripRoadView } from '../../lib/tripRoad'
import type { WriterRoadBinding } from './map/writerRoadBinding'
import { buildJourney, type JourneyPoint, minutesToHM, fmtDur, computeCategoryBias, MODE_SPEED, isRoundTrip, isAirMode, tripJourneyGeometry, type LegEstimate } from '../../lib/engine'
import { useTimeFormat, formatHM, formatHMRange } from '../../lib/timefmt'
import type { MapTarget } from '../../lib/mapTarget'
import { loadPref, savePref, loadHaltPinsForTrip, saveHaltPin, clearHaltPin, clearHaltPinsForTrip } from '../../lib/uiPrefs'
import { DEBOUNCE_MS } from '../../lib/geocode'
import { Modal, Field, toast, undoToast, useInView, useMedia, usePageVisible } from '../../components/ui'
import { Select } from '../../components/Select'
import { DetourWhisk } from '../../components/DetourWhisk'
import { useSuggestionCache } from '../../hooks/useSuggestionCache'
import { openExternal } from '../../lib/native'
import { corridorAnchors, asymmetricDetourKm, asymmetricDetourMinutes, googleEnabled, reasonForSegmentHit, searchPlacesText, kmFromStartForHit, deriveDrivingPlan, effectiveDrivingDays, anchorsForCrew, rainFactorFor, directionalKm, alongRouteKmOf, DEFER_START, type NearbyOpts, type PlaceHit } from '../../lib/geocode'
import { useResolvePick } from '../../components/ResolvePickDialog'
import { clockHM, deriveClockMilestones } from '../../lib/clockOverlay'
import { sheetHiddenClass } from '../../lib/mapSheet'
import { mapScopeNote } from '../../lib/railA11y'
import { plannerDrives } from '../../lib/transportPolicy'
import { fillLabel, pickDayCaveat, voteStatusId } from '../../lib/railA11y'
import { MapOmnibar } from './MapOmnibar'
import { useOmnibarPlacement } from './map/useOmnibarPlacement'
import { useMapSearch } from './map/useMapSearch'
import { useAddModal } from './map/useAddModal'
import { ShortlistTray } from './map/ShortlistTray'
import { useShortlist } from './map/useShortlist'
import { useMapWriters } from './map/useMapWriters'
import { dayStayBase, useCorridorCache } from './map/useCorridorCache'
import { useRailView } from './map/useRailView'
import { useMapEdit } from './map/useMapEdit'
import { MapEditAddPanel, MapEditStopPanel, MapEditLive } from './map/MapEditPanel'
import { MapLensPanel } from './map/MapLensPanel'
import { driveLettersByRoad, useMapLenses, type MapLensId } from './map/useMapLenses'
import { driveCardStrip, driveDeckIntro, scopeBandOf, type DriveTab } from './map/driveLens'
import { STAY_RINGS, ringPolygon, ringRadiusKm } from './map/stayLens'
import { applyFixChangeSet, verifyFixSet } from './map/fixLens'
import { fixIsOffered, type FixChangeSet } from '../../lib/mapLensContracts'
import type { RingId } from '../../components/map/lenses/StayDeck'
import { hiddenDrivePicks } from '../../components/map/lenses/DriveTabs'
import { MinuteScopeControl, type ScopeCountsState } from './map/MinuteScopeControl'
import { MapScopeBand, bandCounts, phoneLensAriaLabel, type ScopeBandCounts } from './map/MapScopeBand'
import { LensRailExtras, fixTargetStopId, driveBudgetBarText, driveBudgetStep } from './map/LensRailExtras'
import { fixMarkLabel } from '../../lib/mapStyles/lensMarks'
import {
  readScopeMinutes, scopeStorageKey, scopeKmForMinutes, nextScopeMinutes, scopeCounts, dayPurposesFor, type ScopeMinutes,
} from './map/minuteScope'
import { useRailContent } from './map/useRailContent'
import { journeyCostLabels } from './map/railLabels'
import { useSlotSearch } from './map/useSlotSearch'
import {
  googleMapsUrl, newStopId, poiVisitMinutes,
} from './map/pageHelpers'
import { activeReadinessLabel, activeDayLabel } from './map/railRows'
import { MapItinerary, MapJourneyRibbon, MapPickCard, MapPhoneDay, MapSheetHandle, type SheetSnap, type SheetSnapSource } from '../../components/map/MapWorkspaceChrome'
import { driveRowForHit, mapAllJourneyRowsForDays, mapCardActions, mapRailRowForHit, mapRowForHit, mapRowsForHit, type MapRowBinding } from './map/mapJourneyRows'
import { hoursCardText, hoursDisplayFor, intendedVisitMinutes, visitDateForDay } from '../../lib/hoursContext'
import { LedgerRow } from './map/RailRowViews'
import { filingOptionsFor } from './map/slotFiling'
import { arcCompletionEffects, arcPickPlan, arcStageLine, arcUndoLine, retryArcAdd, stageArcAdd, type ArcStageOutcome } from './map/arcAdd'
import { guardedUndo, type WriterActionDeps, type WriterCompletion } from './map/mapWriterActions'
import { mapWriterOperationGate } from './map/writerOperationGate'
import { createSlotSearchGuard, searchContextForSlot } from './map/manualSlotContexts'
import { isRoadRetryUnderway, nextRoadLatch, type RoadLatch } from './map/roadRetryLatch'
import { isSlotSearchCurrent, slotSearchResetKey, visibleSlotSearch } from './map/slotSearchView'
import {
  measuredRoadFacts, openSlotAnnouncement, runSlotSearchFlow, SLOT_SEARCH_FAILED_COPY, slotRowsOf, slotSearchScopeKey, slotVoteReady, stableDayIdFor,
} from './map/mapTabPipeline'
import { batchSelection, planCounts } from '../../lib/dayPlan'
import { admitTripPreview, tripById } from '../../store/store'
import {
  dayWeatherJoin, drizzleDayIndex, journeyKmFrom, routePolylineFrom, weatherAnchorFrom, weatherFetchRefusal,
} from './map/weatherGeometry'

/** How many search hits the rail shows before "Show all" (#333 A1). The listbox
 *  grammar needs the same page size the rows are rendered with, so it lives here
 *  once instead of as a bare literal in the label, the slice and the key handler. */
import { isSightCategory, roadProfileFromLegs } from '../../lib/ridePlan'
import { QuotaExhaustedError } from '../../lib/providers/google'
import { isElectric } from '../../lib/vehicleProfile'
import { dayShape, tripDayAttribution, SLOT_URGENCY_MIN, type DaySlot, type DaySlotKind } from '../../lib/daySlots'
import { corridorSnapshotKey, corridorStatusFor, dayAttributionKeyFor, type CorridorSnapshot } from './map/corridorSnapshot'
import { discardedStagedIds, isAlreadyAdded, normalizePlaceName, type PlaceIdentity } from '../../lib/placeIdentity'

import { dayDetourBudgetMin, splitByDetourBudget } from '../../lib/detourBudget'
import type { WorkspaceJourneyDays } from './journey/journeyDays'
import { anyQuotaExhausted } from '../../lib/providers/quota'
import { recordDnaEvent, dnaNoteForHit, crewSeedsToPlannedStops, crewNoteForHit, type CrewSeed, type DnaVector } from '../../lib/tripDna'
import { visitMinutesForCategory } from '../../lib/slackPrompts'
import { scrollBehavior } from '../../lib/motion'
import type { SegmentHit } from '../../lib/geocode'
import { projectOntoPolyline } from '../../lib/providers/hits'
import { fetchDailyWeather, forecastAvailable, isoAddDays, todayISO } from '../../lib/weather'
import { useWeatherRefreshTick } from '../../hooks/useWeatherRefresh'
// MapLibre is heavy (~1MB) — load it only when the Map tab is actually opened.
const TripMap = React.lazy(() => import('../../components/TripMap').then(m => ({ default: m.TripMap })))

// #420 slice 3: the page's module-level constants and pure helpers live in
// ./map/pageHelpers now, where they have direct tests. `clockHM` is NOT among them
// — the page carried a byte-identical copy of lib/clockOverlay's (which is tested),
// so the copy is gone and the lib one is imported below.

// ---- Engine guide: a subtle rotating roll-out of what the suggestion engine ----
// ---- does, so its intelligence is discoverable without a docs trip.          ----
const ENGINE_TIPS = [
  'Breaks are spaced for fatigue - stretch rides your wheel time, lunch holds the 11:30–14:30 window, tuned to your crew size and travel style.',
  'Lunch slides itself into the 11:30–14:30 window based on when each driving day starts.',
  'Self-drive trips get fuel halts on your tank’s rhythm - no “next pump in 300 km” surprises.',
  'Cross-day drives end at a real city - the overnight lands where your honest wheel cap says the day ends.',
  'Every idea is checked against your detour budget - packed days see fewer, closer options.',
  'The engine learns: accepting or declining an idea nudges what future trips suggest (Trip DNA).',
  'Rainy day ahead? Exposed sights step aside for museums, cafes and other sheltered picks.',
  'Ghat sections and slow city crawls are detected from the real road shape - and warned about.',
  'Story arcs bundle nearby sights into one-tap themed detours - temples, waterfalls, viewpoints.',
  'Hover a card to spot it on the map; hover a pin to find its card. Adds always insert in road order.',
]

function EngineTips() {
  const [tip, setTip] = useState(0)
  const tipsRef = useRef<HTMLDivElement>(null)
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const inView = useInView(tipsRef)
  const visible = usePageVisible()
  const running = inView && visible && !reduced
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setTip(i => (i + 1) % ENGINE_TIPS.length), 7000)
    return () => clearInterval(t)
  }, [running])
  return (
    <div className="engine-tips" ref={tipsRef}>
      <span className="engine-tips-ico"><Sparkles size={12} aria-hidden /></span>
      {/* #168: role="status" on rotating text re-announces every 7s — a live
          region that never shuts up. The rotation is decorative; SR users get
          one static summary instead. */}
      <span key={tip} className="engine-tips-text" aria-hidden="true">{ENGINE_TIPS[tip]}</span>
      <span className="sr-only" role="status">Suggestions are spaced for fatigue and checked against your detour budget.</span>
      {/* #333 A4: these were buttons with onClick and a -1 tabIndex INSIDE an
          aria-hidden container — clickable, unreachable by keyboard, and 8px wide.
          (Spelled without the JSX braces on purpose: the suite greps this file for
          that literal, and a comment carrying it would trip its own guard.)
          The strip is ambient decoration: it rotates on its own every 7s, it is
          display:none below 720px, and screen readers already get the static
          summary above instead (#168). So the dots are indicators now, not
          controls: nothing focusable sits inside aria-hidden (that pairing is the
          violation the issue named), and no target below the repo's 40px floor
          remains. If picking a tip is ever wanted back, the shape is ONE
          "next tip" button on the strip — not six 8px dots. */}
      <span className="engine-tips-dots" aria-hidden="true">
        {ENGINE_TIPS.map((_, i) => (
          <span key={i} className={`engine-tips-dot${i === tip ? ' on' : ''}`} />
        ))}
      </span>
    </div>
  )
}

// ================= Map tab =================

// MapTabSkeleton moved to ./MapTabSkeleton (#332 R4) — it is this module's
// Suspense fallback, so importing it from here re-created the static edge the
// lazy boundary exists to cut. Import it from that module instead.

/** Per-slot glyphs (plan P2.1/P6.2): the kind's icon, with the breakfast
 *  special-case on the label — kinds can't tell meals apart, and an unknown
 *  label simply renders no glyph (graceful, never wrong). */
const KIND_GLYPH = { meal: Utensils, fuel: Fuel, overnight: BedDouble, stretch: Pause } as const
function SlotGlyph({ kind, label }: { kind: DaySlotKind; label: string }) {
  const G = label === 'Breakfast' ? Coffee : KIND_GLYPH[kind]
  return G ? <InlineIcon icon={G} size={12} /> : null
}
export function MapTab({ trip, editable, applyChange, suggestionCache, onInputsHash, onCorridorState, journeyDays, presence, crewSeeds, dnaVector, dnaTick, setDnaTick, setAddedIds, dismissedIds, setDismissedIds, setStagedSnapshot, stagedIdsRef, slotManual, setSlotManual, road, roadBinding, currentRoad, onOpenTimeline, onOpenBoard, onOpenDay, onOpenGroupInput, previewOpen, dayFocus, onDayFocusChange, mapTarget, onMapTargetConsumed, legCorrections }: {
  trip: Trip
  editable: boolean
  /** #841: the workspace's shared write type. The first four arguments keep
   *  their old meaning; the kept callback may receive the acknowledged receipt
   *  and the fifth argument names the operation (id plus discard callback). */
  applyChange: ApplyChange
  suggestionCache: ReturnType<typeof useSuggestionCache>
  /** #404: the Map publishes the freshness it scanned under, so the Overview's
   *  slot matrix can qualify stale numbers instead of printing them as current.
   *  The hash cannot be recomputed outside this component — it reads the OSRM
   *  geometry and the weather join, both of which are this tab's state. */
  onInputsHash?: (inputsHash: string, scopeKm: number) => void
  /** S2: publish the corridor facts the workspace producer reads. The callback
   *  identity alone never republishes; only a changed snapshot key does. */
  onCorridorState?: (snapshot: CorridorSnapshot | null) => void
  /** S3: the one shared per-day model, built above the tabs. */
  journeyDays: WorkspaceJourneyDays
  /** S3: the shared presence identity (committed plan + session sets). */
  presence: PlaceIdentity
  /** S3: crew seeds, lifted so the producer and the scan use the same list. */
  crewSeeds: CrewSeed[]
  /** S3: the shared DNA vector; the Map no longer re-reads the log itself. */
  dnaVector?: DnaVector
  /** S3: lifted DNA freshness token. */
  dnaTick: number
  setDnaTick: React.Dispatch<React.SetStateAction<number>>
  /** S3: lifted session identity. */
  setAddedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  dismissedIds: ReadonlySet<string>
  setDismissedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setStagedSnapshot: React.Dispatch<React.SetStateAction<ReadonlyMap<string, string>>>
  stagedIdsRef: React.MutableRefObject<Map<string, string>>
  slotManual: Record<string, PlaceHit[]>
  setSlotManual: React.Dispatch<React.SetStateAction<Record<string, PlaceHit[]>>>
  /** #188: the workspace's ONE road measurement — the Map tab no longer measures. */
  road: TripRoadView
  /** Strict measured-road bytes from the Workspace's one road measurement. */
  roadBinding?: WriterRoadBinding | null
  /** Live measured-road bytes for strict post-await revalidation. */
  currentRoad?: () => WriterRoadBinding | null
  onOpenTimeline?: (stopId: string) => void
  onOpenBoard?: () => void
  /** Phase 3: tapping a halt label asks the workspace to open that day's plan
   *  in the Timeline. Undefined = halt labels stay decorative labels. */
  onOpenDay?: (dayIndex: number) => void
  /** The part's live vote opens the crew's Group input to resolve it (P4). */
  onOpenGroupInput?: () => void
  /** true while the workspace holds a staged change — a direct cache write
   *  (the popup's stop delete) would make Keep refuse as stale, so it refuses
   *  instead (#334, same policy as the timeline and Group input). */
  previewOpen?: boolean

  /** #425 PR 2: the shared day-focus axis (same value the Board's columns
   *  read). The map's day-filter chips and the slots rail's day strip report
   *  their choice through it, so the Board and this tab agree whichever was
   *  touched. Optional — the tab keeps working when a host has not adopted it. */
  dayFocus?: number | 'all'
  /** reports the tab's day-axis choice back up to the workspace. */
  onDayFocusChange?: (day: number | 'all') => void
  /** A one-shot request from the Overview route card. */
  mapTarget?: MapTarget | null
  /** Clears the request after TripMap selects or frames the target. */
  onMapTargetConsumed?: () => void
  /** The workspace's measured road data — pin clocks read it (#611). */
  legCorrections?: Record<string, LegEstimate>
}) {
  const [pois, setPois] = useState<SegmentHit[]>([])
  const timeFormat = useTimeFormat()

  // bump to force a corridor re-search — the only refetch path besides a
  // detour-scope change or a first-ever load (empty cache)
  const [refreshTick, setRefreshTick] = useState(0)
  // #143: overnight segment ids the user told to "stay at the pin" — the
  // drift proposal hides for the session (the pin holds; it re-asks next open)
  const [driftDismissed, setDriftDismissed] = useState<Set<number>>(new Set())
  // P1 ("search lands in its slot"): the open part's own search. Keyed to the
  // slot it was typed in, so a query resolved after switching slots can never
  // render its rows into the wrong slot (seq guard + key check), and the
  // manual picks live per slot, re-validated at render like the tray (#179).
  // #841: the cell is scoped to the trip + stable day it was typed on. The view
  // below returns null for any other day, so a lunch query never shows on
  // another day's lunch slot, even for one render.
  const [slotSearchCell, setSlotSearch] = useState<{ key: string; q: string; busy: boolean; hits: PlaceHit[]; err: string | null } | null>(null)
  const [slotSearchScope, setSlotSearchScope] = useState<string | null>(null)

  const addingIdsRef = useRef(new Set<string>())
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set())
  const [addingAny, setAddingAny] = useState(false)
  const slotGuard = useRef(createSlotSearchGuard())
  // #898: the scope is minutes of EXTRA driving (15 / 30 / 45 / 60, default 30),
  // saved per trip. The engine still searches by distance, so `scopeKm` is the
  // one-way radius those minutes allow. #181: loadPref never throws in private mode.
  const [scopeMinutes, setScopeMinutes] = useState<ScopeMinutes>(() => readScopeMinutes(loadPref(scopeStorageKey(trip.id), '')))
  // The control shows the chosen step at once. The re-plan waits for the debounce.
  const [scopeChoice, setScopeChoice] = useState<ScopeMinutes>(scopeMinutes)
  const scopeTripRef = useRef(trip.id)
  useEffect(() => {
    if (scopeTripRef.current === trip.id) return
    scopeTripRef.current = trip.id
    const saved = readScopeMinutes(loadPref(scopeStorageKey(trip.id), ''))
    setScopeMinutes(saved)
    setScopeChoice(saved)
  }, [trip.id])
  const scopeKm = scopeKmForMinutes(scopeMinutes)
  const scopeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function changeScope(next: ScopeMinutes) {
    if (scopeTimer.current) clearTimeout(scopeTimer.current)
    setScopeChoice(next)
    scopeTimer.current = setTimeout(() => {
      setScopeMinutes(next)
      savePref(scopeStorageKey(trip.id), String(next))
    }, DEBOUNCE_MS)
  }
  useEffect(() => () => { if (scopeTimer.current) clearTimeout(scopeTimer.current) }, [])
  // #420 slice 16: widening stays a page callback — the gap row calls it,
  // and the corridor re-plans through the same state it always did.
  const widenScope = () => {
    const next = nextScopeMinutes(scopeMinutes)
    setScopeMinutes(next)
    setScopeChoice(next)
    savePref(scopeStorageKey(trip.id), String(next))
    toast('Widened the search - the corridor will re-plan')
  }
  // #420 slice 9: the add draft moved with the opener into
  // ./map/useAddModal (called after dayForKm below) — the modal JSX stays.
  // cross-highlighting: the suggestion currently hovered/selected in EITHER the
  // side panels or the map. Panel hover/click sets it (map flies to the pin);
  // map hover/click sets it (panel row highlights and scrolls into view).
  const [activeHitId, setActiveHitId] = useState<string | number | null>(null)
  // Keyboard/touch parity for the cross-highlight (the critique's P1: it was
  // mouse-only): a click or Enter pins the row — the map holds that place —
  // hover and focus still peek, and leaving falls back to the pin.
  const [pinnedHitId, setPinnedHitId] = useState<string | number | null>(null)
  // Shortlist: the rail collects picks before anything lands in the plan, so the
  // group can vote on them. The tray under the grid owns the actions. The whole
  // feature (collection, filter, both writers) lives in map/useShortlist.ts since
  // #420 slice 2; the hook is called below, after the helpers it needs.
  // #420 slice 12: the rail view (filter, fold, day, sheet, return) lives in
  // ./map/useRailView. States return with their setters; the page calls those
  // from event handlers only, never during render.
  const { chipFilter, setChipFilter, folded, setFolded, mapFilter, setMapFilter,
    setLocalDay, activeDayIndex, sheetTab, setSheetTab, sheetApplies,
    showReturn, setShowReturn } = useRailView({ dayFocus, dayIndexes: trip.days.map(d => d.index) })
  // #841: the persisted id of the day the rail is planning, found by the day's
  // own index (indexes can skip after a deletion). Undefined = no stable day,
  // and the writers then refuse instead of guessing one.
  const activeDayId = stableDayIdFor(trip, activeDayIndex)
  const searchScopeNow = slotSearchScopeKey(trip.id, activeDayId)
  const slotSearch = visibleSlotSearch(slotSearchCell, slotSearchScope, searchScopeNow)

  // #420 slice 8: the search state moved with the runner into
  // ./map/useMapSearch (called after routeKmOf below) — the list refs and the
  // slot abort stay here with the slot search that owns them.
  const listRef = useRef<HTMLDivElement | null>(null)
  const searchListRef = useRef<HTMLDivElement | null>(null)
  const slotAbort = useRef<AbortController | null>(null)
  // Shared resolve-or-prompt guard (product decision 2026-09-25, #424): every
  // unknown-position pick below resolves through resolvePick — retry / manual
  // coordinates / explicit skip — before anything is written. Lives with the
  // other hooks, above every path out of this component (AGENTS §6e).
  const { resolvePick, dialog: resolvePickDialog } = useResolvePick()
  useEffect(() => {
    const guard = slotGuard.current
    return () => {
      slotAbort.current?.abort()
      guard.reset()
    }
  }, [])
  // S3: one shared identity owner. The workspace builds it; the Map reads it.
  const identity = presence

  // OSRM road geometry of the whole route — feeds Google Search-Along-Route
  // (the report's killer feature); the free stack ignores it. #188: the
  // WORKSPACE owns this measurement now (one routePath chain per trip, one
  // retry) and hands the result down — the Map tab used to measure the same
  // chain a second time, doubling the load on the shared OSRM demo server and
  // letting the drawn line disagree with the detour math.
  const roadView = useMemo(
    () => mapRoadViewFromLegs(road?.chain ?? null, road?.legs ?? null, trip.days.map(d => d.index)),
    [road, trip.days],
  )
  // A flight trip draws its JOURNEY, not the road chain: the ground legs either
  // side of the sector take the measured road shape where one exists, and the
  // sector takes a great-circle arc. The road chain is never even measured for
  // this mode (see useTripRoad), so without this the map would draw nothing at
  // all — and before that gate it drew the driving directions OSRM answered.
  // The derivation lives in the engine (`tripJourneyGeometry`), not here.
  const airPlan = useMemo(
    () => (isAirMode(trip.transportMode) ? tripJourneyGeometry(trip, legCorrections) : null),
    [trip, legCorrections],
  )
  const routeGeometry = airPlan?.geometry ?? roadView.geometry
  const returnRouteGeometry = useMemo(
    () => mapReturnGeometryFromLegs(road?.chain ?? null, road?.legs ?? null),
    [road],
  )
  const routeTotalKm = airPlan ? airPlan.km : roadView.totalKm
  const routeTotalMin = airPlan ? airPlan.min : roadView.totalMin
  const dayRoadKm = roadView.dayRoadKm
  // The measurement's outcome, handed down from the workspace: when the road
  // can't be measured (rate limits, very long routes — exactly where the banner
  // matters most), the Day Planner still speaks, from the haversine estimate,
  // flagged as rough.
  const routeFailed = road?.status === 'failed'
  // #road-retry: this banner is the one surface that says the road failed, so it
  // also owns the retry. A latch holds the failure while the re-measure is in
  // flight - status flips to 'pending' the moment Retry is clicked, and a gate
  // keyed on `failed` alone would drop the banner mid-retry. The latch lives in
  // state and steps while the page renders (map/roadRetryLatch), so a same-tick
  // flip never reads stale and no ref is touched during render. A resolved
  // measurement clears it. The latch is keyed to the trip that failed: this
  // workspace outlives trips, and a carried failure must not read as "measuring
  // the road again" on a trip that never failed.
  const [roadLatch, setRoadLatch] = useState<RoadLatch>({ tripId: trip.id, failedEver: false })
  const roadLatched = nextRoadLatch(roadLatch, trip.id, road?.status)
  if (roadLatched !== roadLatch) setRoadLatch(roadLatched)
  const roadRetryUnderway = isRoadRetryUnderway(roadLatched.failedEver, road?.status)
  const roadNeedsRetry = routeFailed || roadRetryUnderway
  // The terrain profile (#124): the clock and the split convert time↔km
  // through the REAL mix of the road just measured, instead of one blended
  // rate that placed lunch and the night halt too far along a ghat day and
  // too short a highway day. Null until the road resolves — then everything
  // falls back to the blended rate exactly as before.
  const roadProfile = useMemo(
    () => roadProfileFromLegs(outboundLegs(road?.chain ?? null, road?.legs ?? null)),
    [road],
  )

  // Stop signature (#135): stable string key over what buildJourney actually
  // reads (stop ids, road order, coords) — the days ARRAY identity changes on
  // every store commit, so memoising the whole-trip budget on `trip` re-fired
  // this on unrelated keystrokes.
  // day start signature: the clock walk reads every day's startTime (rest days
  // stamped 08:30 by #133 shells), never the days array itself.
  const dayStartSig = trip.days.map(d => d.startTime ?? '').join(',')
  // whole-trip wheel distance & time (journey sums) — the plan budget for the
  // fatigue math. OSRM's road totals win when resolved (same legs the map
  // draws); the journey sums are the haversine estimate fallback.
  // #213 Phase 3: `trip` IS in deps — `mutateTrip` clones it on every save so
  // any settings change re-runs. Without this, transportMode / roundTrip /
  // driverCount / vulnerable tweaks kept the old plan totals and the
  // split/clock verdicts read stale numbers.
  const wholeTrip = useMemo(() => {
    let km = 0
    let min = 0
    for (const d of trip.days) {
      const j = buildJourney(trip, d)
      km += j.distanceKm
      min += j.driveMinutes
    }
    return { km: routeTotalKm ?? km, min: routeTotalMin ?? min }
  }, [trip, routeTotalKm, routeTotalMin])



  // search the WHOLE route corridor (start → stops → destination); the home
  // zone around the starting point is excluded inside the engine
  const anchors = useMemo(() => {
    const pts = trip.days
      .flatMap(d => d.stops)
      .filter(s => s.status !== 'rejected')
      .map(s => ({ lat: s.lat, lng: s.lng }))
    return corridorAnchors(pts, trip.startLocationCoords ?? null, scopeKm * 1000)
  }, [trip, scopeKm])

  // Per-day rain chance and WMO code (#141, which separates a drizzle chance
  // from a storm chance in the cap multiplier) - best-effort, null until loaded.
  // The fetched join is keyed to the forecast it was asked for, so a trip that
  // loses its forecast, or moves to another one, reads as not loaded with no
  // reset effect.
  const [fetchedWeather, setFetchedWeather] = useState<{ key: string; rainPct: (number | null)[] | null; codes: (number | null)[] | null } | null>(null)
  // Keep the rain join fresh: re-pull on the cadence and when the tab returns.
  const weatherTick = useWeatherRefreshTick()
  // #420 slice 6: which stops the forecast may be centred on, and whether it may
  // be fetched at all, are rules with their own tests now (map/weatherGeometry).
  const weatherStops = trip.days.flatMap(d => d.stops)
  const weatherAnchor = weatherAnchorFrom(weatherStops)
  const weatherBlocked = !weatherAnchor || !!weatherFetchRefusal({ stops: weatherStops, startDate: trip.startDate, forecastAvailable })
  const weatherKey = weatherAnchor ? `${weatherAnchor.lat},${weatherAnchor.lng}|${trip.startDate}|${trip.days.length}` : ''
  const shownWeather = !weatherBlocked && fetchedWeather?.key === weatherKey ? fetchedWeather : null
  const dayRainPct = shownWeather?.rainPct ?? null
  const dayWeatherCode = shownWeather?.codes ?? null
  useEffect(() => {
    const stops = trip.days.flatMap(d => d.stops)
    const anchor = weatherAnchorFrom(stops)
    if (!anchor || weatherFetchRefusal({ stops, startDate: trip.startDate, forecastAvailable })) return
    const key = `${anchor.lat},${anchor.lng}|${trip.startDate}|${trip.days.length}`
    let cancelled = false
    fetchDailyWeather(anchor.lat, anchor.lng, trip.startDate, trip.days.length || 1, { force: weatherTick > 0 })
      .then(w => {
        if (cancelled) return
        const join = dayWeatherJoin({ dayCount: trip.days.length, startDate: trip.startDate, byDate: w, isoAddDays })
        setFetchedWeather({ key, rainPct: join.rainPct, codes: join.codes })
      })
      .catch(() => { if (!cancelled) setFetchedWeather({ key, rainPct: null, codes: null }) })
    return () => { cancelled = true }
  }, [trip, weatherTick])
  // OSRM's road total (when resolved AND worth trusting) is the most accurate
  // journey budget for the fatigue math; otherwise the journey-summed estimate.
  const planKm = journeyKmFrom(routeTotalKm, wholeTrip.km)

  // Route polyline in {lat,lng} form (from the OSRM route geometry) — feeds the
  // asymmetric detour measure so on-the-way hits cost ~0 and spurs pay round trip.
  const routePolyline = useMemo(() => routePolylineFrom(routeGeometry), [routeGeometry])




  // The wheel decides whether a fuel or charge halt exists (2026-10-19). This
  // is the planner boundary, so it is asked HERE, once, and not by the form:
  // the stored vehicle profile stays on the row for a later driving trip.
  // Memoized because `nearbyOpts` reads it; a fresh object every render would
  // invalidate the corridor cache's input identity and re-arm the scan effect.
  const wheel = useMemo(
    () => plannerDrives({ transportMode: trip.transportMode, drivesPart: trip.drivesPart }),
    [trip.transportMode, trip.drivesPart],
  )

  const nearbyOpts: NearbyOpts = useMemo(() => ({
    // The wheel answer rides every planner call (2026-10-19); without it a
    // Mixed-No trip keeps getting a driving plan from this seam.
    drivesPart: trip.drivesPart,
    // #144B: an electric profile charges instead of fuelling — the segment
    // cadence and the hit queries both read this flag. A passenger trip asks
    // for neither: a bus with a stored EV profile does not charge.
    includeFuel: wheel && !isElectric(trip.vehicleProfile) && (trip.transportMode === 'car' || trip.transportMode === 'motorcycle'),
    includeCharge: wheel && isElectric(trip.vehicleProfile),
    // #189 + 20260915_trip_party_prefs.sql: the persisted vehicle profile is
    // the one owner of fuel-stop cadence. Without it here, geocode.ts falls
    // through to FUEL_INTERVAL_KM (450) and a 60 L / 20 km-L bike is planned
    // at car cadence. The profile is JSONB-validated on read, so a junk
    // value never reaches this planner.
    vehicleProfile: trip.vehicleProfile,
    // #143: accepted night-halt pins (night ordinal → route-km) — the planner
    // snaps those halts and surfaces drift as a proposal instead of moving.
    haltPins: loadHaltPinsForTrip(trip.id),
    homeCenter: trip.startLocationCoords ?? null,
    // fill what the itinerary lacks, demote what it already covers
    categoryBias: computeCategoryBias(trip),
    // Google mode: bias the search along the real road polyline; free mode ignores it
    routeCoords: routeGeometry,
    // NOTE (#335): this is the corridor CADENCE crew, not the vote quorum —
    // cadenceForCrew reads how many people are riding, so `travellers` stays.
    // The vote denominator lives in daySlots' `memberCount` below.
    travellers: trip.travellers,
    travelStyle: trip.travelStyle,
    speedKmph: MODE_SPEED[trip.transportMode] ?? 40,
    // Trip DNA: EVERY trip on the device leans corridor ties toward kinds the
    // user keeps picking (cross-trip learning) — scoped per-trip would forget a
    // waterfall hire on a past journey.
    // dnaTick re-reads the log after every accept/decline on this tab.
    ...(dnaVector ? { dnaVector } : {}),
    plannedStops: [
      ...trip.days.flatMap(d => d.stops)
        .filter(s => s.status !== 'rejected' && Number.isFinite(s.lat) && Number.isFinite(s.lng))
        .map(s => ({ lat: s.lat, lng: s.lng, name: s.title })),
      // crew-proposed ideas suppress duplicate corridor suggestions near them
      ...crewSeedsToPlannedStops(crewSeeds),
    ],
    dayStartTimes: trip.days.map(d => d.startTime ?? '08:30'),
    dayRainPct: dayRainPct ?? undefined,
    dayWeatherCode: dayWeatherCode ?? undefined,
    transportMode: trip.transportMode,
  }), [trip, routeGeometry, dayRainPct, dayWeatherCode, crewSeeds, dnaVector, wheel])

  // #143 — overnight ordinal by position: the planner keys accepted-halt pins
  // on WHICH night (in route order), not the segment's slot, so the map here
  // must save/clear the same key the engine reads.
  const overnightOrdinals = useMemo(() => {
    const map = new Map<number, number>()
    pois
      .filter(x => x.segment.purpose === 'overnight')
      .sort((a, b) => a.segment.targetKm - b.segment.targetKm)
      .forEach((x, i) => map.set(x.segment.index, i))
    return map
  }, [pois])
  // Pins are promises about a ROAD: their km-space lives between the trip's
  // endpoints — move A or B and every accepted halt is voided (with a toast,
  // never silently). A stop added along the way does NOT void pins: the
  // re-derived halt drifts, and hysteresis + the drift proposal handle that
  // honestly (#143's whole point — "it won't move unless the road does").
  const endpointHash = `${trip.startLocation}|${trip.startLocationCoords?.lat ?? ''},${trip.startLocationCoords?.lng ?? ''}|${trip.destinations.join('|')}`
  useEffect(() => {
    const key = `halt_shape_${trip.id}`
    const prev = loadPref(key, '')
    if (prev && prev !== endpointHash) {
      clearHaltPinsForTrip(trip.id)
      toast('Route re-shaped - accepted halt pins cleared')
      suggestionCache.clearMap()
      // The pins bag is now empty: the planner and the corridor must re-read it.
      // The request runs after this effect has finished, not from inside it.
      queueMicrotask(() => { setRefreshTick(t => t + 1); setDnaTick(t => t + 1) })
    }
    savePref(key, endpointHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointHash, trip.id])

  // Day Planner verdicts (PLAN-DAY-PLANNER P1-B/C): the drive-day split the
  // ROUTE demands (duration cap, load-balanced) and the travel-clock verdict
  // for the trip's real start time (defer / hop / ok). Pure — recomputed from
  // route facts, never stored, so every stop mutation re-derives them (the
  // ripple re-plan) and the night-halt position stays honest.
  // #141: the scalar gets the same severity weighting as the per-day array —
  // drizzle-class codes damp it, storms weight it up (rainFactorFor).
  const rainFactor = dayRainPct?.[0] != null ? rainFactorFor(dayRainPct[0], dayWeatherCode?.[0] ?? undefined) : undefined
  const tripIsRoundTrip = isRoundTrip(trip)
  // #126 party + #142 inputs + #122 anchors, one bag both verdicts read. Timetable
  // modes (train/bus/flight/mixed) get NO fatigue cap → splitVerdict null → no
  // banner; there is no wheel to fatigue. Vulnerable party pulls dinner an hour
  // early; the drive-after-dinner allowance (#122) extends days past the meal.
  const partyOpts = {
    travelStyle: trip.travelStyle,
    transportMode: trip.transportMode,
    drivesPart: trip.drivesPart,
    driverCount: trip.driverCount,
    hasVulnerable: trip.hasVulnerable,
  }
  const tripAnchors = anchorsForCrew({
    hasVulnerable: trip.hasVulnerable,
    driveAfterDinnerMin: trip.driveAfterDinnerMin,
  })
  // A round trip's SPLIT demands days for the whole loop (2× the outbound
  // corridor — the return re-traces the same road). The CLOCK walk (#145) now
  // models it honestly instead: one outbound walk + a directed return walk
  // from the destination, whose day count feeds the banner.
  const loopFactor = tripIsRoundTrip ? 2 : 1
  // #126: conducted modes (train/bus/flight/taxi) have no driving fatigue —
  // the split verdict stays null and every banner/chip/arming consumer below
  // goes quiet through that single gate.
  const drivingPlan = useMemo(
    () => deriveDrivingPlan({
      totalKm: planKm, driveMinutes: wholeTrip.min, dayStart: trip.days[0]?.startTime,
      dayStartTimes: trip.days.map(d => d.startTime ?? '08:30'),
      rainFactor, dayRainPct: dayRainPct ?? undefined, dayWeatherCode: dayWeatherCode ?? undefined,
      roundTrip: tripIsRoundTrip, profile: roadProfile, ...partyOpts, anchors: tripAnchors,
    }),
    // #213 Phase 3: dayWeatherCode IS a dep (rainFactor reads it for severity
    // weighting, #141) — same omission the clockVerdict had. The two verdicts
    // now invalidate together on a forecast fetch.
    [planKm, wholeTrip.min, trip.travelStyle, trip.transportMode, trip.drivesPart, trip.driverCount, trip.hasVulnerable, trip.driveAfterDinnerMin, dayStartSig, dayRainPct, dayWeatherCode, tripIsRoundTrip, roadProfile],
  )
  const clockVerdict = drivingPlan.clock
  const splitVerdict = drivingPlan.split
  // The travel clock drawn ON the route as clean road LABELS: one text pair per
  // planned clock anchor (meal / overnight / destination) — its wall-clock time
  // + calendar date on the LEFT of the road, its road km on the RIGHT. No pins,
  // no dots. FIX-1: not a second walk — this projects MapTab's own `clockVerdict`
  // (the banner's walk) onto the road that just resolved, so the map and the
  // banner can never disagree. Phase 1: `todayISO` is the device calendar day,
  // so each label knows whether its day is driven history, the active day, or
  // still plan. Only renders once the geometry is in, because a label planted
  // on a straight chord would lie about where the stop lands. Return-leg labels
  // carry leg:'return'; the map shows them only while its Return home toggle
  // is on.
  const clockMilestones = useMemo(
    () => deriveClockMilestones({
      verdict: clockVerdict,
      polyline: routePolyline,
      tripStartDate: trip.startDate,
      // anchors the return pass's dates at the trip's tail and decides which
      // labels have an honest itinerary day behind them (tap targets)
      tripDaysCount: trip.days.length,
      todayISO: todayISO(),
      // Phase 2: the corridor's overnight hits name the halt labels. `pois` is
      // SegmentHit[] — the annotated hits carry haltPurpose + cumKm from
      // annotateSegmentHits, which is exactly the join key the label layer
      // asks for.
      haltCandidates: pois.map(s => s.hit).filter((h): h is PlaceHit => h != null),
    }),
    [clockVerdict, routePolyline, trip.startDate, trip.days.length, pois],
  )
  // One clock story (#123): the banner count comes from the clock walk that
  // knows the start time; planDriveDays stays the geometry-free estimator.
  // defer → 0 usable days today; hop → tonight's hop + full days from tomorrow.
  // #145: a round trip needs BOTH walks counted — out + back.
  const travelDayNeed = drivingPlan.dayCount
  // #141: drizzle-grade rain (a 40%+ chance whose WMO code says drizzle or
  // light rain) damps the cap gently — the note keeps it a "slow day", never
  // a verdict flip; storms damp fully and the split banner flips honestly.
  const drizzleDay = drizzleDayIndex(dayRainPct, dayWeatherCode)
  // The split wants more days than planned: propose applying it. Declining is
  // respected — with the honest red fatigue verdict stated, never hidden.
  // The decline is keyed to the single-source count (#123): apply -> recompute
  // -> same count -> the banner stays dismissed instead of re-firing on its own
  // mutation, and a new count reads as not declined with no reset effect.
  const [splitDeclinedAt, setSplitDeclinedAt] = useState<number | null>(null)
  const splitDeclined = splitDeclinedAt === travelDayNeed
  const setSplitDeclined = (declined: boolean) => setSplitDeclinedAt(declined ? travelDayNeed : null)
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
    toast(`Added ${add} travel day${add !== 1 ? 's' : ''} (08:30 starts) - accept a night halt to pin them`)
  }

  // #420 slice 11: the corridor cache (hash, publish, both scans) lives in
  // ./map/useCorridorCache. It returns values only, never callbacks.
  const { fractionPois, corridorQuotaOut, loadingPois, poisFailed, scanFailed, scanQuotaOut, mapInputsHash, corridorSource, poisInputsHash, poisScopeKm, fetchedAt: scanFetchedAt, coverage: scanCoverage, discoveryDayIndex } = useCorridorCache({
    trip, anchors, routeGeometry, scopeKm, dayRainPct, dayWeatherCode, crewSeeds,
    dnaTick, onInputsHash, pois, setPois, nearbyOpts, planKm,
    wholeTripMin: wholeTrip.min, drivingPlan,
    refreshTick, suggestionCache,
    // One selected day scans on its own. Show-all keeps the trip-wide scan.
    discoveryDay: mapFilter === 'all' || dayFocus === 'all' ? undefined : {
      dayIndex: activeDayIndex, routeGeometry: null, stayBase: dayStayBase(trip, activeDayIndex),
      purposes: dayPurposesFor([...drivingPlan.outbound, ...(drivingPlan.return ?? [])].find(d => d.dayIndex === activeDayIndex)),
      categoryBias: nearbyOpts.categoryBias, scopeMinutes,
    },
  })

  // #832: attribution reads the EFFECTIVE plan projection (accepted pins and
  // drift included), not a second POI-derived guess. A halt the plan needs
  // beyond the created days stays unassigned until the user applies it.
  const effectiveDays = useMemo(
    () => effectiveDrivingDays(drivingPlan, pois),
    [drivingPlan, pois],
  )
  const dayAttribution = useMemo(
    () => tripDayAttribution(trip, dayRoadKm, effectiveDays),
    [trip, dayRoadKm, effectiveDays],
  )
  const dayForKm = dayAttribution.dayForKm
  /** The exact data the attribution closures close over. */
  const dayAttributionKey = useMemo(
    () => dayAttributionKeyFor(dayRoadKm, effectiveDays),
    [dayRoadKm, effectiveDays],
  )
  // #420 slice 9: the add draft reads the same attribution. A known km with no
  // derived plan day still discloses its pick-day guess.
  const {
    poiDraft, setPoiDraft, pickDay, setPickDay,
    pickDayGuessed, setPickDayGuessed, openAddModal,
  } = useAddModal({ identity, dayForKm, days: trip.days })

  // When the activation came from the map (pin hover/click), bring the matching
  // panel row into view so the two surfaces visibly point at the same place.
  // The search-results card is the other scroll container a pin can answer to.
  //
  // #333 A3: keyboard and focus only. This ran for EVERY activation, including
  // mouse hover, so reading one row yanked the list back to whatever row the
  // pointer had just crossed — the list fought the person reading it. Focus (Tab,
  // or the arrow keys in the row handler) raises the flag; `onMouseEnter` never
  // does, and a click needs no scroll because that row is already on screen.
  const keyboardScrollRef = useRef(false)
  useEffect(() => {
    if (activeHitId == null) return
    if (!keyboardScrollRef.current) return
    keyboardScrollRef.current = false
    const sel = `[data-hit-id="${activeHitId}"]`
    const row = listRef.current?.querySelector(sel) ?? searchListRef.current?.querySelector(sel)
    row?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() })
  }, [activeHitId])

  /** Along-route km for any point on the current route (null off-polyline). */
  function routeKmOf(lat: number, lng: number): number | null {
    if (!routePolyline) return null
    const snap = projectOntoPolyline({ latitude: lat, longitude: lng }, routePolyline)
    return snap?.km ?? null
  }
  /** Directional km label: honours the Return-home toggle (#polylines). With
   *  the return hidden, a place on the way back reads its distance from home
   *  instead of a misleading 90%+ of the loop. Null off-polyline. */
  function kmLabelFor(km: number | null | undefined): number | null {
    if (km == null || !Number.isFinite(km)) return null
    if (!routePolyline) return km
    const span = alongRouteKmOf(routePolyline[0].lat, routePolyline[0].lng, routePolyline) // total = span of the drawn road
    const total = span?.totalKm ?? km
    return directionalKm(km, total, showReturn)
  }

  // #420 slice 8: the shared route-aware search lives in ./map/useMapSearch
  // now — same inputs in, same outputs out, no behavior change. Called here
  // (not at the top) because it closes over the road and scope above; the two
  // memos below move with it since they render its rows on the map. Hook order
  // changes once, then stays fixed — every hook here runs each render.
  const {
    searchResults, searching, omniQ, setOmniQ, omniResults,
    setOmniResults, omniPicked, setOmniPicked, searchQuotaOut,
    onOmniSearch,
  } = useMapSearch({ routeGeometry, anchors, routePolyline, scopeKm, routeKmOf })
  // Search hits join the corridor ideas on the map so a hovered result row
  // eases the camera to its pin and draws its spur — the same cross-highlight
  // the suggestion rail already has. Deduped by id (a place can be BOTH a
  // corridor idea and a search hit) and empty until a search lands, so the map
  // is unchanged when nobody is searching.
  const mapPois = useMemo(() => {
    const corridor = pois.flatMap(p => (p.hit ? [p.hit] : []))
    const seen = new Set(corridor.map(h => h.id))
    return [
      ...corridor,
      ...searchResults.map(r => r.h).filter(h => !seen.has(h.id)),
      // #418: an omnibar hit is a discovery like any other — it draws the same
      // selectable marker, so the map never hides a place the user just found.
      ...omniResults.map(r => r.h).filter(h => !seen.has(h.id) && !searchResults.some(s => s.h.id === h.id)),
    ]
  }, [pois, searchResults, omniResults])

  // The subset of map pins that came from a search — the map draws them as
  // distinct selectable markers (solid teal, not the dashed gold ideas), and
  // they vanish with the results list when the search bar clears. Both searches
  // feed it: a row found in either box is a search result on the map.
  const searchHitIds = useMemo(
    () => new Set<string | number>([
      ...searchResults.map(r => r.h.id),
      ...omniResults.map(r => r.h.id),
    ]),
    [searchResults, omniResults],
  )

  /** #345: mark the ids a staged change will add — at the moment it is STAGED,
   *  not when Keep lands. All three add paths call this, so the window in which
   *  the same place can slip in twice stops existing; `stagedIdsRef` lets the
   *  preview-close effect release them again if the change is discarded. */
  const markStaged = useCallback((hits: Array<Pick<PlaceHit, 'id' | 'name'>>) => {
    if (hits.length === 0) return
    for (const h of hits) stagedIdsRef.current.set(String(h.id), normalizePlaceName(h.name))
    setStagedSnapshot(new Map(stagedIdsRef.current))
    setAddedIds(prev => {
      const next = new Set(prev)
      for (const h of hits) next.add(String(h.id))
      return next
    })
  }, [setAddedIds, setStagedSnapshot, stagedIdsRef])

  // A preview that is DISCARDED must not leave a ghost: when the preview slot
  // closes, release every id this tab staged whose place is not in the plan.
  // (After Keep the stop is in `trip`, so its name is in `identity` and the id
  // stays — which is the invariant: added ⟺ visible-in-preview-or-committed.)
  useEffect(() => {
    if (previewOpen || stagedIdsRef.current.size === 0) return
    const staged = stagedIdsRef.current
    stagedIdsRef.current = new Map()
    const release = new Set(discardedStagedIds(staged, identity.names))
    // EVERY close must publish a fresh staged map to the identity memo: a Keep
    // whose name is already in the plan releases nothing, so setAddedIds alone
    // would bail out on an unchanged Set and leave the memo attached to the old
    // Map - a staged namesake of a kept place stayed hidden forever after its
    // preview was discarded (#839 review P2).
    setStagedSnapshot(new Map())
    if (release.size === 0) return
    setAddedIds(prev => {
      const next = new Set(prev)
      for (const id of release) next.delete(id)
      return next
    })
  }, [previewOpen, identity, setAddedIds, setStagedSnapshot, stagedIdsRef])

  /** P2: fill one empty part of the day with a candidate. The stop id is
   *  minted here so Undo can delete exactly what was added (addPoiToDay's
   *  own undo hooks into toasts we do not own). Coord resolution stays. */
  /** P3.1: fill every empty part of the day with its top candidate in ONE
   *  batched write. Undo removes exactly the stops the fill added; `deleteStop`
   *  renumbers the day, so the stops that were already there land back in their
   *  original sequence without needing a separate snapshot. */
  /** P4: raise the crew's vote for this part - the candidates become the
   *  options (each carrying its place), and resolving it lands the winner. */
  /** P5.4: routing for a search result - a place whose own category can serve a
   *  part of the day can be filed straight into it, or added plainly as an
   *  extra. The kinds mirror the category claims `fillStopFor` already makes
   *  (food -> meals, transport-hub -> fuel, hotel -> stay), so the search box
   *  covers every category-claimable part rather than meals alone.
   *
   *  #420 slice 5: the mapping, the no-cap rule and the copy live in
   *  ./map/slotFiling now, with their tests; this only supplies the day's slots. */
  const filingOptionsForPicked = (h: PlaceHit) => filingOptionsFor(h, activeDaySlots)

  /** The mockup's headline interaction: find inside the open part. Mirrors
   *  onSearch's guards (2-char floor, scope rank, quota class) but answers into
   *  slot-local state, so the top search card keeps owning corridor-wide
   *  discovery. #841: the query captures its exact trip, stable day and slot.
   *  The flow (./map/mapTabPipeline) commits an answer only while that context
   *  is still current, so a late answer, error or busy reset from another day
   *  or part is dropped. The provider call and the quota mapping stay here. */
  async function runSlotSearch(slot: DaySlot) {
    const q = (slotSearch?.key === slot.key ? slotSearch.q : '').trim()
    if (q.length < 2 || slotSearch?.busy) return
    if (!searchContextForSlot(slot)) {
      toast('This part has no stable day yet - reload the trip before searching inside it.', 'err')
      return
    }
    slotAbort.current?.abort()
    const controller = new AbortController()
    slotAbort.current = controller
    setSlotSearchScope(searchScopeNow)
    setSlotSearch({ key: slot.key, q, busy: true, hits: [], err: null })
    try {
      await runSlotSearchFlow({
        guard: slotGuard.current,
        slot,
        query: q,
        controller,
        search: (query, signal) => searchPlacesText(query, { routeCoords: routeGeometry, anchors, signal }),
        rank: hits => hits
          .map(h => ({ h, off: asymmetricDetourKm(h, anchors, routePolyline) }))
          .sort((a, b) => (a.off ?? 9999) - (b.off ?? 9999))
          .map(x => x.h),
        isQuotaError: err => err instanceof QuotaExhaustedError,
        commit: patch => setSlotSearch(s => (s && s.key === slot.key ? { ...s, ...patch } : s)),
        onEmpty: query => toast(`No places found for "${query}".`),
      })
    } catch (err) {
      // The flow reports its own failures. A throw from the commit or toast
      // callbacks must not leave the box busy for the current context.
      console.error('[yatraflow] slot search flow threw', err)
      if (slotGuard.current.current()) {
        setSlotSearch(cell => (cell && cell.key === slot.key ? { ...cell, busy: false, err: SLOT_SEARCH_FAILED_COPY } : cell))
      }
    }
  }

  /** Delete straight from the map pin's popup. Since #424 this is THE
   *  destructive-stop path, shared with the Timeline's day row and the Board's
   *  card: the removal is staged as an impact preview (so Keep/Remove is the
   *  confirmation) and the Keep moment leaves an Undo that restores the stop on
   *  its day at its old order. It used to write the cache directly and refuse
   *  while a preview was open, which is precisely the divergence the shared path
   *  removes — the same delete now behaves the same way wherever it is clicked,
   *  and it chains onto an open preview instead of declining to act.
   *
   *  `meta.title` stays part of this popup's contract (it labels the pin), but
   *  the toast is built from the row's own title, because that is the object the
   *  Undo restores.
   *
   *  The stop's row still drops out through the local re-derivation once the
   *  write lands (#346: stopSig → slots, identity/altPool → pool cards). The
   *  corridor plan is still true — deleting one planned stop does not unplan the
   *  road — so no forced re-search fires and no spinner flashes. */
  function removeStopFromMap(stopId: string, meta: { title: string; dayIndex: number }) {
    removeStopWithUndo({ trip, stopId, dayIndex: meta.dayIndex, applyChange })
  }

  // #905-#907: the add preview, the stop editor and the keyboard reorder. Every
  // write still goes through `applyChange`; removal stays on `removeStopWithUndo`.
  // `edit.previewRoad` is the proposed road TripMap draws as a dashed ghost line.
  const keepWriterRef = useRef<((hit: PlaceHit, dayIndex: number) => Promise<void>) | null>(null)
  const edit = useMapEdit({
    trip, editable, applyChange, legCorrections, routeKmOf,
    removeStop: removeStopFromMap,
    onAddKept: hit => {
      recordDnaEvent({ tripId: trip.id, action: 'accept', haltKind: hit.haltPurpose, category: hit.category, detourMin: asymmetricDetourMinutes(hit, anchors, routePolyline ?? null, MODE_SPEED[trip.transportMode] ?? 40) ?? undefined, visitMin: visitMinutesForCategory(hit.category) })
      setDnaTick(t => t + 1)
    },
    keepWithWriter: (hit, dayIndex) => keepWriterRef.current ? keepWriterRef.current(hit, dayIndex) : Promise.reject(new Error('writer not ready')),
  })
  /** The facts of the open add preview. Null when no preview is open. */
  const openPreview = edit.session.phase === 'previewing' || edit.session.phase === 'saving' ? edit.session.preview : null
  // The chip finds its row by the day's stop id, never by a stop title.
  const previewChip = openPreview
    ? {
      index: openPreview.insertion.index,
      stopIds: (trip.days.find(day => day.index === openPreview.dayIndex)?.stops ?? []).map(stop => stop.id),
      label: openPreview.road.legIn?.toTitle ?? openPreview.road.legOut?.fromTitle ?? null,
    }
    : null

  /** #841: a route arc's "Add all" stages through the shared writer: one
   *  operation gate, the shared planner, a stable day target per place and a
   *  guarded Undo. Staging changes nothing the traveller sees as added. Only the
   *  places the acknowledged save verified become added ids, DNA events and
   *  Undo targets; the rest stay on the rail with their reason. */
  async function addArc(arc: { label: string; hitIds: readonly (string | number)[] }) {
    const label = arc.label.split(':')[0]
    const plan = arcPickPlan({
      hitIds: arc.hitIds,
      arcHits,
      isAdded: h => isAlreadyAdded(h, identity),
      dayForKm,
      dayIdForIndex: index => stableDayIdFor(trip, index),
    })
    const arcDeps = (): WriterActionDeps => ({
      trip,
      applyChange,
      resolvePick,
      mintStopId: newStopId,
      gate: mapWriterOperationGate,
      routeKmOf,
      road: roadGrade.measured ? { routeKey: roadGrade.routeKey } : null,
      currentTrip: () => tripById(trip.id),
      poiVisitMinutes,
      onCompletion: onArcCompletion,
      ...(roadBinding ? { roadBinding } : {}),
      ...(currentRoad ? { currentRoad } : {}),
    })
    const report = (staged: ArcStageOutcome) => {
      const line = arcStageLine(label, staged)
      toast(line.text, line.tone === 'err' ? 'err' : undefined)
    }
    function onArcCompletion(completion: WriterCompletion) {
      const done = arcCompletionEffects(label, completion)
      if (done.addedIds.length > 0) {
        setAddedIds(prev => new Set([...prev, ...done.addedIds]))
        for (const placed of done.dnaHits) {
          recordDnaEvent({ tripId: trip.id, action: 'accept', haltKind: placed.haltPurpose, category: placed.category, detourMin: asymmetricDetourMinutes(placed, anchors, routePolyline ?? null, MODE_SPEED[trip.transportMode] ?? 40) ?? undefined, visitMin: visitMinutesForCategory(placed.category) })
        }
        setDnaTick(t => t + 1)
      }
      if (done.line.tone === 'err') {
        // F2: an uncertain arc carries the gate's exact retry ticket. The
        // retry replays the captured operation and payload; it never rebuilds
        // the picks from the current rail.
        const ticket = completion.retry
        if (ticket) {
          toast(done.line.text, 'err', { label: 'Retry', run: () => { void retryArcAdd(arcDeps(), plan, ticket).then(report).catch(err => { console.error('[yatraflow] arc retry threw', err); toast('The retry could not start. Check the day before you try again; Saved edits can still recover the trip.', 'err') }) } })
          return
        }
        toast(done.line.text, 'err')
        return
      }
      undoToast(done.line.text, () => {
        void guardedUndo(
          { currentTrip: () => tripById(trip.id), admit: admitTripPreview },
          { tripId: trip.id, operationId: completion.operationId, stops: done.undoStops },
        ).then(result => {
          const undone = arcUndoLine(label, result)
          toast(undone.text, undone.tone === 'err' ? 'err' : undefined)
        })
      })
    }
    report(await stageArcAdd(arcDeps(), { tripId: trip.id, plan }))
  }

  const dayOptions = trip.days.map(d => ({ index: d.index }))

  // #420 slice 13: the rail content (split, pool, arcs)
  // lives in ./map/useRailContent. Values only, never callbacks — the
  // render-called helpers stay with the page for the rails slice.
  // #08 AC5: the upstream detour km. The rail reads this same function
  // through the hook, and so does the corridor snapshot. Defined before the hook.
  const detourKmFor = useCallback(
    (hit: PlaceHit): number | null => asymmetricDetourKm(hit, anchors, routePolyline),
    [anchors, routePolyline],
  )
  const { needs, seeAndDoLive, altPool, arcHits, arcs } = useRailContent({
    pois, identity, detourKmFor,
  })

  // #08 AC5: the ONE per-hit detour computation. It is upstream of the
  // corridor snapshot, so the drive rows and every covered surface read the
  // same number. It is no longer re-derived inside the rail hook.
  const hitEngine = useMemo(() => {
    const speedK = MODE_SPEED[trip.transportMode] ?? 40
    const m = new Map<string, { detourMin: number | null }>()
    for (const sh of pois) {
      if (!sh.hit) continue
      m.set(String(sh.hit.id), { detourMin: asymmetricDetourMinutes(sh.hit, anchors, routePolyline ?? null, speedK) })
    }
    return m
  }, [pois, anchors, routePolyline, trip.transportMode])

  // A hit outside the corridor (a search or omnibar hit) has no drive row, so
  // its detour is measured here once. This is the honest uncovered fallback,
  // not a parallel cost path for covered hits.
  const detourMinFor = useCallback((hit: PlaceHit): number | null =>
    hitEngine.get(String(hit.id))?.detourMin
      ?? asymmetricDetourMinutes(hit, anchors, routePolyline ?? null, MODE_SPEED[trip.transportMode] ?? 40),
  [hitEngine, anchors, routePolyline, trip.transportMode])
  // #841: the writers' measured-road grade, read from the workspace's finished
  // measurement. It starts no routing call. A pending, failed, estimate-only or
  // stale chain (a stop moved or was added since it was measured) grades as
  // unmeasured and every placement refuses with a reason, so a line that merely
  // exists on the map is never presented to the planner as a measured road.
  const roadGrade = measuredRoadFacts({
    trip,
    road,
    hasLine: !!routePolyline && routePolyline.length > 1,
  })

  // #420 slice 2: the shortlist feature lives in its own hook now — the collection,
  // the shared "already mine?" filter, and both batch writers. Called here rather
  // than at the top because it composes with `detourMinFor` (and `dayForKm`,
  // `identity`), and a hook below an early return is the crash AGENTS §6e names —
  // this component has none, so the position is safe and the order is stable.
  const {
    shortlist, trayShortlist, isShortlisted, toggleShortlist, addShortlisted, raiseShortlistVote, clearShortlist,
  } = useShortlist({
    tripId: trip.id,
    identity,
    resolvePick,
    applyChange,
    setAddedIds,
    newStopId,
    dayForKm,
    dayIdForIndex: index => stableDayIdFor(trip, index),
    poiVisitMinutes,
    routeKmOf,
    detourMinFor,
    roadBinding,
    currentRoad,
    busy: addingAny,
    setBusy: setAddingAny,
    // #841: the measured grade and the chain signature the planner binds to.
    // A line on the map alone never makes a write "measured".
    roadMeasured: roadGrade.measured,
    ...(roadGrade.measured ? { routeKey: roadGrade.routeKey } : {}),
  })
  const filterActive = chipFilter != null
  // Detour-budget enforcement (Horizon 3.2's "finite, honest menu"): the
  // see-&-do list is the endless one — need halts are finite by construction,
  // so the budget gates only sights. Per day: walk the journey-ordered sight
  // hits, spend each one's detour minutes against that day's budget, and mark
  // whatever no longer fits as HELD BACK — counted and shown as a line, never
  // offered as an addable card.
  const { budgetHeldIds, budgetHeldCount } = useMemo(() => {
    const heldIds = new Set<string>()
    let heldCount = 0
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
        rows.map(sh => ({ sh, detourMin: detourMinFor(sh.hit!) })),
        budget,
      )
      for (const { sh } of deferred) {
        heldIds.add(sh.hit!.id as string)
        heldCount += 1
      }
    }
    return { budgetHeldIds: heldIds, budgetHeldCount: heldCount }
  }, [seeAndDoLive, dayForKm, detourMinFor, trip.travelStyle, trip.days])
  // S2: publish the corridor facts the future workspace producer reads. The
  // callback is read through a ref, so a parent re-render cannot republish.
  // Only a changed snapshot key reaches the workspace.
  const corridorStatus: CorridorSnapshot['status'] = corridorStatusFor({ quota: scanQuotaOut, scanFailed, loading: loadingPois })
  const onCorridorStateRef = useRef(onCorridorState)
  useEffect(() => { onCorridorStateRef.current = onCorridorState }, [onCorridorState])
  const publishedCorridorKeyRef = useRef<string | null>(null)
  const corridorSnapshot = useMemo<CorridorSnapshot | null>(() => {
    if (corridorSource === 'none') return null
    return {
      tripId: trip.id,
      inputsHash: poisInputsHash ?? mapInputsHash,
      scopeKm: poisScopeKm ?? scopeKm,
      status: corridorStatus,
      source: corridorSource,
      pois,
      anchors,
      routePolyline: routePolyline ?? null,
      drivingPlan,
      dayAttribution,
      dayAttributionKey,
      altPool: altPool.all.map(entry => entry.h),
      detourMinFor,
      detourKmFor,
      heldBackIds: budgetHeldIds,
      fetchedAt: scanFetchedAt,
      coverage: scanCoverage,
      discoveryDayIndex,
    }
  }, [scanFetchedAt, scanCoverage, discoveryDayIndex, corridorSource, trip.id, mapInputsHash, scopeKm, poisInputsHash, poisScopeKm, corridorStatus, pois, anchors, routePolyline, drivingPlan, dayAttribution, dayAttributionKey, altPool, detourMinFor, detourKmFor, budgetHeldIds])
  useEffect(() => {
    const next = corridorSnapshot
    // P2: an initial `none` while a route exists is "not initialized yet", not
    // a clear. Only a genuinely route-less Map clears the workspace snapshot.
    const clear = !next && corridorSource === 'none' && anchors.length === 0
    if (!next && !clear) return
    const key = next ? corridorSnapshotKey(next) : 'none'
    if (publishedCorridorKeyRef.current === key) return
    publishedCorridorKeyRef.current = key
    onCorridorStateRef.current?.(next)
  }, [corridorSnapshot, corridorSource, anchors.length])
  // S3: the rail reads the shared producer's one drive-row assembly. The page
  // no longer re-assembles the same rows.
  const driveRows = journeyDays.allDriveRows
  // #08 AC5: the marker's cost sentence formats the canonical drive-row facts,
  // never a second detour/arrival/budget computation of its own.
  const hitCosts = useMemo(() => journeyCostLabels(driveRows), [driveRows])
  const seeForRail = chipFilter
    ? seeAndDoLive.filter(sh => sh.hit && (driveRowForHit(driveRows, sh.hit)?.chips ?? []).some(c => c.key === chipFilter))
    : seeAndDoLive
  // Quota honesty (Google-only directive): when the textSearchPro soft cap is
  // hit, every Google-mode corridor scan returns [] — say why instead of
  // rendering an empty state that reads like "nothing around".
  const corridorQuotaBlocked = corridorQuotaOut || searchQuotaOut || anyQuotaExhausted('textSearchPro', 'nearbySearch', 'placeDetails')
  const quotaOut = googleEnabled() && corridorQuotaBlocked
  // #898: the scope counts read the rows already held. Loading, failed, paused and
  // retained stay apart, so a failed read never shows as "0 inside".
  const scopeState: ScopeCountsState = useMemo(() => {
    if (loadingPois) return { kind: 'loading' }
    if (quotaOut) return { kind: 'unavailable', reason: 'Counts paused by the provider limit' }
    if (poisFailed || scanFailed) return { kind: 'unavailable', reason: 'Counts unavailable: the search failed' }
    const scoped = discoveryDayIndex == null ? driveRows : driveRows.filter(row => row.dayIndex === discoveryDayIndex)
    return {
      kind: 'ready',
      counts: scopeCounts(scoped, scopeMinutes),
      ...(corridorSource === 'retained' ? { note: 'from the last good search' } : {}),
    }
  }, [loadingPois, quotaOut, poisFailed, scanFailed, driveRows, discoveryDayIndex, scopeMinutes, corridorSource])

  /**
   * "Also nearby" candidates, pre-grouped once per render instead of per row.
   * Detour distance is the expensive part (it walks the anchor list), so it is
   * computed once per hit here; rows only rank the already-filtered pool.
   */

  // ---- P2: the day's plan (slots rail) ----
  // S3: the shared producer derives every day once. The Map reads its active
  // entry; it does not call `daySlots`, `tripReadiness` or `useDaySlots`.
  const journeyDay = journeyDays.byDay.get(activeDayIndex)
  const activeDayStops = journeyDay?.dayStops ?? []
  const activeDaySlots = journeyDay?.slots ?? []
  const activeDayReadiness = journeyDays.readinessByDay.get(activeDayIndex)
    ?? { dayIndex: activeDayIndex, filled: 0, total: 0, auto: 0, required: 0 }
  const tripReadinessRows = journeyDays.readinessRows
  const dnaSlotHints = journeyDays.dnaSlotHints
  const slotPins = journeyDays.slotPinsByDay.get(activeDayIndex) ?? []
  const daySlotDeps = journeyDays.daySlotDeps

  // #I-41: the day the stop editor opens on lives in ./map/useOmnibarPlacement
  // now (moved there by #420 slice 7) — one lookup feeds the placement label
  // and the click, so the label and the editor cannot name two different days.
  // An unknown road position falls back to the trip's first day — the same
  // fallback the editor applies.
  const { omniPlacement, placeOmnibarHit } = useOmnibarPlacement({
    picked: omniPicked,
    activeDayIndex,
    days: trip.days,
    dayForKm,
    activeDaySlots,
    shortlist,
    trayShortlist,
    identity,
    openAddModal,
    addManualCandidate: (slot, h) => addManualCandidate(slot, h),
    toggleShortlist,
    raiseShortlistVote,
  })
  const [openSlotKey, setOpenSlotKey] = useState<string | null>(null)
  // #420 slice 17: the slot filing writer lives in ./map/useSlotSearch —
  // the query state, the manual picks and the runner stay page cells (see
  // the hook's header for why the split falls here). Handler-only output,
  // called from event handlers and the placement hook below, never render.
  const { addManualCandidate } = useSlotSearch({
    slotManual, setSlotManual, setSlotSearch, identity,
    // #841: a filing is accepted only from the search typed on THIS trip and day.
    isSearchCurrent: slotKey => isSlotSearchCurrent(slotSearchCell, slotSearchScope, searchScopeNow, slotKey),
  })
  // P1: closing or switching parts, days or trips drops the in-flight search.
  // #841: the guard reset retires the captured context, so a query still in the
  // air cannot file rows, an error or a busy reset into the new context.
  const searchResetKey = slotSearchResetKey(searchScopeNow, openSlotKey)
  const [searchResetSeen, setSearchResetSeen] = useState(searchResetKey)
  if (searchResetSeen !== searchResetKey) {
    setSearchResetSeen(searchResetKey)
    setSlotSearch(null)
  }
  useEffect(() => {
    slotGuard.current.reset()
    slotAbort.current?.abort()
  }, [openSlotKey, activeDayId, trip.id])
  // Plan P2.5's mobile slots summary: collapsed to a count + open on phones,
  // desktop hides the summary so this state never touches it there.
  const [slotsPeek, setSlotsPeek] = useState(false)
  /** m5: `DaySlotKind` is exactly the four keys the hints are built for, so an
   *  unknown kind yields nothing. The old ternary's last branch fell through to
   *  the stretch hint, which would quietly mislabel any future kind. */
  const slotPattern = (kind: DaySlotKind): string | null => dnaSlotHints[kind] ?? null
  const [fillingDay, setFillingDay] = useState(false)
  // #841: the writers get the stable day, the shared presence identity, the
  // measured-road grade and the detour measures. `dayPlan` is the day's ONE
  // effective plan: the rows, the counts, the vote button and the batch all read
  // it, so a pair on screen is the pair the vote and the fill select from.
  const { addPoiToDay, fillSlot, fillTheDay, raiseSlotVote, dayPlan } = useMapWriters({
    resolvePick, applyChange, trip, pois, routeKmOf, anchors, routePolyline,
    roadBinding, currentRoad,
    activeDayIndex, activeDaySlots, markStaged, addingAny, addingIdsRef,
    setAddingIds, setAddingAny, fillingDay, setFillingDay, setDnaTick,
    setOpenSlotKey, onOpenGroupInput,
    dayId: journeyDay?.dayId ?? activeDayId ?? null,
    presence: identity,
    roadMeasured: roadGrade.measured,
    ...(roadGrade.measured ? { routeKey: roadGrade.routeKey } : {}),
    detourMinFor,
    detourKmFor,
    displayDayPlan: journeyDay?.dayPlan,
    slotManual,
  })
  // The Keep button reads this ref on a click, after the commit.
  useEffect(() => { keepWriterRef.current = addPoiToDay })
  const dayCounts = planCounts(dayPlan)
  // The open part's live-region line reads the same effective rows the cards show.
  const openAnnouncement = openSlotAnnouncement(dayPlan, openSlotKey)
  /** The day's detour budget, read by the itinerary. */
  const mapBudget = journeyDay?.budgetMin ?? dayDetourBudgetMin({ travelStyle: trip.travelStyle, plannedStops: activeDayStops.filter(stop => stop.status !== 'rejected').length })
  // P1: the rail and card read the whole-trip producer, not only the active day.
  const mapRows = mapAllJourneyRowsForDays(journeyDays.byDay.values(), journeyDays.allDriveRows)
  // #420 slice 16: thin JSX factory — one rail row's data lives here, its
  // rendering lives in map/RailRowViews. Every fact below comes from the shared
  // projection row; chips and rail state are the only presentation extras.
  const ledgerRow = (sh: SegmentHit) => {
    const hit = sh.hit
    const row = hit ? mapRailRowForHit(mapRows, hit, dayForKm(hit.cumKm)) : undefined
    // Unknown/out-of-range rows keep the existing unprojected search facts and
    // are never guessed onto a day. The whole-trip adapter covers other days.
    const drive = hit ? driveRowForHit(journeyDays.allDriveRows, hit) : undefined
    const detourMin = row ? row.detourMin : drive?.detourMin ?? (hit ? detourMinFor(hit) : undefined)
    const dismissHit = () => {
      if (!hit) return
      recordDnaEvent({ tripId: trip.id, action: 'decline', haltKind: sh.segment.purpose, category: hit.category, detourMin: detourMin ?? undefined })
      // Dismiss is a local rail decision: keep the current plan visible
      // and do not invalidate/rebill the corridor. DNA is persisted and
      // will be read by the next explicit replan.
      setDismissedIds(prev => new Set(prev).add(hit.id as string))
    }
    return (
      <LedgerRow
        key={hit ? String(hit.id) : `gap-${sh.segment.index}`}
        sh={sh}
        dismissed={row ? row.state === 'dismissed' : drive ? drive.state === 'dismissed' : !!hit && dismissedIds.has(hit.id as string)}
        added={row ? row.state === 'added' : hit ? isAlreadyAdded(hit, identity) : false}
        detourMin={detourMin}
        hitDay={row ? row.dayIndex : hit ? dayForKm(hit.cumKm) : null}
        chips={row?.chips ?? drive?.chips ?? []}
        altPool={altPool}
        chipFilter={chipFilter}
        presentation="deck"
        editable={editable}
        shortlisted={hit ? isShortlisted(hit) : false}
        onSelectChip={key => setChipFilter(prev => (prev === key ? null : key))}
        onAdd={() => { if (hit) openAddModal(hit) }}
        onDismiss={dismissHit}
        onToggleShortlist={() => { if (hit) toggleShortlist(hit) }}
        onOpenAlt={h => openAddModal(h)}
        onWiden={widenScope}
        onInspect={() => { if (hit) inspectHit(hit, { slotKey: row?.slotKey ?? null, slotRef: row?.slotRef ?? null, stopId: row?.stopId ?? null }) }}
      />
    )
  }
  /** P6.1: the rail's second reading - the day as a shape on one clock. */
  const [shapeView, setShapeView] = useState(false)
  // Derived only while the Shape view is open, and handed the slots already
  // computed for the rail so the day is not derived a third time. The call is
  // plain (no manual memo) because a manual memo here made the render-compiler
  // lint treat the slot list as mutated later.
  const shapeBlocks = shapeView && daySlotDeps
    ? dayShape(activeDayIndex, { ...daySlotDeps, dayStops: activeDayStops }, activeDaySlots)
    : []
  const phoneSheet = useMedia('(max-width: 760px)')
  const compactMap = useMedia('(max-width: 1180px)')
  const [itineraryOpen, setItineraryOpen] = useState(true)
  const [deckOpen, setDeckOpen] = useState(true)
  const [snap, setSnap] = useState<SheetSnap>('peek')
  // The one lens pill owns the map marks and the rail deck (W3-W).
  const [lens, setLens] = useState<MapLensId>('drive')
  const [driveTab, setDriveTab] = useState<DriveTab | null>(null)
  const [stayWindow, setStayWindow] = useState<string | null>(null)
  const [stayRing, setStayRing] = useState<RingId>('walk-15')

  // W3-W: one lens model for the active day. A count stays null until its lens
  // is ready, so a failed read never shows zero.
  const lensClock = useCallback((min: number) => formatHM(clockHM(min), timeFormat), [timeFormat])
  const lensDayLabel = `Day ${activeDayIndex + 1} · ${activeDayLabel(trip.days, activeDayIndex)}`
  const lenses = useMapLenses({
    trip,
    dayIndex: activeDayIndex,
    status: journeyDays.status,
    rows: journeyDay?.projection.rows ?? [],
    slots: activeDaySlots,
    budgetMin: mapBudget,
    schedule: journeyDay?.daySchedule ?? null,
    clock: lensClock,
    dayLabel: lensDayLabel,
  })
  const activeStayWindowId = stayWindow != null && lenses.stay.windows.some(window => window.id === stayWindow)
    ? stayWindow
    : lenses.stay.windows[0]?.id ?? null
  const stayRingDef = STAY_RINGS.find(ring => ring.id === stayRing) ?? STAY_RINGS[0]
  const stayRings = lens === 'stay' && lenses.stay.base != null
    ? [{
      id: stayRingDef.id,
      label: `${stayRingDef.minutes} min ${stayRingDef.mode}`,
      ring: ringPolygon(lenses.stay.base, ringRadiusKm(stayRingDef.mode, stayRingDef.minutes)),
    }]
    : undefined
  const gapRings = lens === 'gap'
    ? lenses.gap.view.rows.flatMap(row => {
      const hit = row.candidates[0]?.hit
      if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return []
      return [{
        key: row.slotKey,
        lat: hit.latitude,
        lng: hit.longitude,
        windowText: row.windowMin == null
          ? null
          : `${lensClock(row.windowMin[0])}–${lensClock(row.windowMin[1])}`,
      }]
    })
    : undefined
  const onGapRing = lens === 'gap'
    ? () => { setSheetTab('see'); setDetailId(null); setDeckOpen(true); setSnap('half') }
    : undefined
  const driveGroup = lenses.drive.tabs.tabs.find(group => group.tab === driveTab) ?? lenses.drive.tabs.tabs[0]
  const shownDriveIds = new Set(lens === 'drive' ? (driveGroup?.shown ?? []).map(row => String(row.row.hit.id)) : [])
  const hiddenRows = hiddenDrivePicks(seeForRail, shownDriveIds)
  const drivePickLetters: Record<string, 'A' | 'B' | 'C'> = lens === 'drive'
    ? driveLettersByRoad(driveGroup?.shown ?? [])
    : {}
  const stayPickLetters: Record<string, 'A' | 'B' | 'C'> = {}
  const activeStayPicks = activeStayWindowId == null ? undefined : lenses.stay.picks[activeStayWindowId]
  if (lens === 'stay' && activeStayPicks?.kind === 'ready') {
    for (const pick of activeStayPicks.picks) stayPickLetters[String(pick.row.row.hit.id)] = pick.letter
  }
  const gapPickLetters: Record<string, 'A' | 'B' | 'C'> = {}
  if (lens === 'gap') {
    for (const pick of lenses.gap.gaps[0]?.picks.picks ?? []) {
      gapPickLetters[String(pick.candidate.hit.id)] = pick.letter
    }
  }
  const pickLetters = lens === 'drive'
    ? drivePickLetters
    : lens === 'stay'
      ? stayPickLetters
      : lens === 'gap' ? gapPickLetters : undefined
  const pickBands: Record<string, 'just-past' | 'over-budget'> = {}
  if (lens === 'drive') {
    for (const row of lenses.drive.view.rows) {
      const band = scopeBandOf(row, scopeMinutes, budgetHeldIds)
      if (band === 'just-past' || band === 'over-budget') pickBands[String(row.row.hit.id)] = band
    }
  }
  // W4-B: the scope band reads the same rows and the same band rule as the deck.
  const driveCounts: ScopeBandCounts | null = lens === 'drive' && lenses.drive.phase === 'ready'
    ? bandCounts(lenses.drive.view.rows.map(row => scopeBandOf(row, scopeMinutes, budgetHeldIds)))
    : null
  // W7-E: the Stay lens shows every window of the day. Each window gets one
  // row. Only the active window carries the outline. The Gap lens keeps its
  // own single window row.
  const stayWindowRows = lens === 'stay'
    ? lenses.stay.windows.map(window => ({
      label: window.label, startMin: window.startMin, endMin: window.endMin,
      active: window.id === activeStayWindowId,
    }))
    : null
  const gapWindowRow = lens === 'gap'
    ? (() => {
      const row = lenses.gap.view.rows[0]
      const gap = lenses.gap.gaps[0]
      if (!row || !gap || row.windowMin == null) return null
      return { label: gap.title, startMin: row.windowMin[0], endMin: row.windowMin[1] }
    })()
    : null
  const windowRow = gapWindowRow
  const fixStopId = lens === 'fix'
    ? fixTargetStopId(lenses.fix.target, trip.fixedCommitments, activeDayIndex)
    : null
  const problemStop = fixStopId == null
    ? null
    : trip.days.flatMap(day => day.stops).find(stop => stop.id === fixStopId) ?? null
  const problemStopIndex = problemStop != null && journeyDay?.daySchedule
    ? journeyDay.daySchedule.activeStops.findIndex(entry => entry.id === fixStopId)
    : -1
  const problemTime = problemStopIndex >= 0
    ? journeyDay?.daySchedule?.arrivalTimes[problemStopIndex] ?? null
    : null
  const commitmentTime = trip.fixedCommitments.find(entry => entry.dayIndex === activeDayIndex)?.time ?? null
  const fixWarningMarks = lens === 'fix' && problemStop != null
    && Number.isFinite(problemStop.lat) && Number.isFinite(problemStop.lng)
    && problemStop.lat !== 0 && problemStop.lng !== 0
    ? [{
      id: `fix-${fixStopId}`,
      lat: problemStop.lat,
      lng: problemStop.lng,
      label: fixMarkLabel(problemStop.title, problemTime, commitmentTime) ?? problemStop.title,
      severe: true,
    }]
    : []
  const driveBudget = lens === 'drive' && lenses.drive.phase === 'ready'
    ? {
      usedMin: Math.round(lenses.drive.view.rows.reduce((sum, row) => {
        const detour = row.detourMin
        return sum + (detour != null && Number.isFinite(detour) && detour > 0 ? detour : 0)
      }, 0)),
      budgetMin: mapBudget,
      freeStops: lenses.drive.view.rows.filter(row => scopeBandOf(row, scopeMinutes, budgetHeldIds) === 'inside').length,
    }
    : null
  // The bar reads only known facts. Unknown facts keep the rail's two old lines.
  const budgetBarText = driveBudgetBarText(driveBudget)
  const budgetBar = budgetBarText == null ? null : {
    text: budgetBarText,
    step: driveBudgetStep(driveBudget?.usedMin ?? null, driveBudget?.budgetMin ?? null) ?? 0,
  }
  function addLensHit(hit: PlaceHit, dayIndex: number) {
    if (!editable || isAlreadyAdded(hit, identity)) return
    edit.startAdd(hit, dayIndex)
  }
  function applyLensFix(set: FixChangeSet) {
    // Check the real plan first. A fix that does not pass its check never writes.
    const checked = verifyFixSet(trip, set)
    if (!fixIsOffered(checked)) {
      toast('This fix did not pass its check. Nothing changed.')
      return
    }
    const next = applyFixChangeSet(trip, checked)
    const day = next?.days.find(entry => entry.index === checked.dayIndex)
    if (!day) {
      toast('This fix could not apply to this trip. Nothing changed.')
      return
    }
    applyChange(draft => {
      const target = draft.days.find(entry => entry.index === checked.dayIndex)
      if (!target) return
      target.stops = day.stops.map(stop => ({ ...stop }))
      target.startTime = day.startTime
    }, 'edit', checked.dayIndex)
    toast('Fix applied to this day.')
  }
  function previewLensFix(set: FixChangeSet) {
    // Preview draws nothing new: it selects the day and shows the Fix lens.
    chooseDay(set.dayIndex)
    setLens('fix')
    setSheetTab('see')
    setDeckOpen(true)
  }
  const [detailSelection, setDetailSelection] = useState<{ tripId: string; id: string | number; binding: MapRowBinding | null } | null>(null)
  const detailId = detailSelection?.tripId === trip.id ? detailSelection.id : null
  const detailBinding = detailSelection?.tripId === trip.id ? detailSelection.binding : null
  const [targetRequest, setTargetRequest] = useState<{ contextKey: string; target: MapTarget; instant: boolean } | null>(null)
  const [scrubCursor, setScrubCursor] = useState<{ contextKey: string; coordinate: { lat: number; lng: number }; minute: number } | null>(null)
  function setDetailId(id: string | number | null, binding: MapRowBinding | null = null) { setDetailSelection(id == null ? null : { tripId: trip.id, id, binding }) }
  function setLocalTarget(target: MapTarget | null, instant = false) { setTargetRequest(target ? { contextKey: scrubContext, target, instant } : null) }
  const [selectedStop, setSelectedStop] = useState<string | null>(null)
  const detailOpener = useRef<HTMLElement | null>(null)
  const detailOpenerSnap = useRef<SheetSnap>('peek')
  const journey = useMemo(() => {
    const day = trip.days.find(item => item.index === activeDayIndex)
    return day ? buildJourney(trip, day, legCorrections) : null
  }, [trip, activeDayIndex, legCorrections])
  const scrubContext = `${trip.id}:${activeDayIndex}:${journey?.points.map(point => `${point.stop.id}:${point.lat}:${point.lng}:${point.arrive}:${point.depart}`).join('|') ?? ''}`
  const localTarget = targetRequest?.contextKey === scrubContext ? targetRequest.target : null
  useEffect(() => {
    const canvas = listRef.current
    if (!canvas) return
    const update = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const height = `${Math.max(320, Math.floor(viewportHeight - canvas.getBoundingClientRect().top - 16))}px`
      if (canvas.style.getPropertyValue('--mv2-canvas-height') !== height) canvas.style.setProperty('--mv2-canvas-height', height)
    }
    const observer = new ResizeObserver(update)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    const header = canvas.closest('.yf-workspace')?.querySelector('header')
    if (header) observer.observe(header)
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    const frame = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])
  const selectedHit = mapPois.find(hit => hit.id === detailId) ?? null
  const detailDay = selectedHit ? dayForKm(selectedHit.cumKm) : null
  // A projected row is the card's fact source. The rail selection names its
  // slot occurrence; a map pin names only the place, so repeated slot
  // occurrences stay ambiguous instead of borrowing another row's facts.
  const selectedMatches = selectedHit ? mapRowsForHit(mapRows, selectedHit, detailDay) : []
  const selectedProjected = selectedMatches.length > 0
  const selectedRow = selectedHit ? mapRowForHit(mapRows, selectedHit, detailDay, detailBinding) : undefined
  const mapShowsAll = mapFilter === 'all' || dayFocus === 'all'
  // Only the all-days view draws other days thin.
  const thinDays = mapShowsAll ? { selectedDay: activeDayIndex } : {}
  // A thin line has no click handler. The short copy states only what is true.
  const daysCaption = mapShowsAll ? 'Other days draw thin.' : null
  function showAllMapDays() { setMapFilter('all'); onDayFocusChange?.('all') }
  function chooseDay(index: number) {
    setLocalDay(index)
    setMapFilter(index)
    onDayFocusChange?.(index)
    setDetailId(null)
    setSelectedStop(null)
  }
  function inspectHit(hit: PlaceHit, binding: MapRowBinding | null = null) {
    detailOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    detailOpenerSnap.current = snap
    setDetailId(hit.id, binding)
    setActiveHitId(hit.id)
    setDeckOpen(true)
    setSnap('half')
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('.mv2-pick-card')?.focus({ preventScroll: true }))
  }
  function closeDetails() {
    setDetailId(null)
    setSnap(detailOpenerSnap.current)
    requestAnimationFrame(() => {
      const opener = detailOpener.current
      const target = opener?.isConnected && opener.getClientRects().length ? opener : listRef.current?.querySelector<HTMLButtonElement>('.mv2-lenses > button')
      target?.focus({ preventScroll: true })
    })
  }
  function foldDeck() {
    setDeckOpen(false)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>('.mv2-lenses > button')?.focus({ preventScroll: true }))
  }
  function toggleItinerary(open: boolean) {
    setItineraryOpen(open)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(open ? '.mv2-fold-day' : '.mv2-reopen-day')?.focus({ preventScroll: true }))
  }
  /** Ticket 07: only a keyboard snap moves focus into the sheet region it just
   *  revealed. A pointer or touch snap keeps focus on the handle. The guard
   *  refuses a hidden panel, so focus never lands in content that is not shown. */
  function settleSheetSnap(source: SheetSnapSource, panelId: string) {
    if (source !== 'keyboard') return
    requestAnimationFrame(() => {
      const panel = document.getElementById(panelId)
      if (panel?.isConnected && !panel.hasAttribute('hidden') && panel.getClientRects().length) panel.focus({ preventScroll: true })
    })
  }
  function selectPoint(point: JourneyPoint) {
    setSelectedStop(point.stop.id)
    setLocalTarget({ kind: 'coordinate', coordinate: { lat: point.lat, lng: point.lng } })
  }
  /** P5.3: the selected day's empty parts as hollow amber pins - their top
   *  candidate's real position, with P5.2's cost line in the tooltip. */
  return (
    <div className={`mv2-workspace${itineraryOpen ? '' : ' is-day-folded'}${deckOpen ? '' : ' is-deck-folded'}`} data-snap={snap}>
      <details className="mv2-tools">
        <summary><SlidersHorizontal size={15} aria-hidden />Search settings and route advice<ChevronDown size={14} aria-hidden /></summary>
        <div className="mv2-tools-body">
        <EngineTips />
        <div className="row-between">
          <h3 style={{ margin: 0 }}><InlineIcon icon={Lightbulb} size={16} gap={4} vAlign="-3px" />Nearby ideas</h3>
          <div className="row-between" style={{ gap: 10 }}>
            <span className="small muted" aria-live="polite">{loadingPois ? 'searching…' : `${pois.filter(p => p.hit).length} suggested stops - spaced for fatigue & anchored on cities`}</span>
            <button
              className="btn btn-outline btn-sm suggestion-refresh-btn"
              title="Refresh suggestions"
              onClick={() => { suggestionCache.clearMap(); setRefreshTick(t => t + 1) }}
              disabled={loadingPois}
            >
              <InlineIcon icon={RotateCcw} size={12} gap={3} />Refresh
            </button>
          </div>
        </div>
        <div className="hint-text" style={{ margin: '4px 0 6px' }}>
          Live data from {googleEnabled() ? 'Google Places' : 'OpenStreetMap, Wikipedia & Mappls'} — every idea is clock-anchored, budget-checked, and never around your starting point.{' '}
          <details className="hint-more">
            <summary>How suggestions work</summary>
            Lunch lands in the 11:30–14:30 window, stretch breaks follow wheel time, fuel rides your tank’s rhythm, and long drives end at a real city for the night. Every pick is checked against your detour budget.
          </details>
        </div>
        <div className="row-between" style={{ gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <MinuteScopeControl
            value={scopeChoice}
            onChange={next => changeScope(next)}
            disabled={loadingPois || quotaOut}
            state={scopeState}
          />
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
            <b>Late start - a short hop, then rest.</b>
            <span className="small muted">{clockVerdict.reason}</span>
          </div>
        )}
        {(routeTotalKm != null || roadNeedsRetry) && splitVerdict && clockVerdict.verdict === 'ok' && travelDayNeed > trip.days.length && (
          <div className="dayplanner-banner" role="status">
            <b>This drive needs {travelDayNeed} travel days{tripIsRoundTrip ? ' - there and back' : ''}.</b>
            <span className="small muted">
              {routeFailed && 'Rough estimate - the road measurement did not resolve. '}≈{Math.round(splitVerdict.perDay)} km a day keeps wheel time ≈{minutesToHM(splitVerdict.maxDailyWheelMin)} - the honest cap for {(trip.travelStyle ?? 'balanced')} pace.
            </span>
            {roadRetryUnderway && (
              <span className="small muted">
                <InlineIcon icon={RefreshCw} size={12} gap={3} />Measuring the road again — the estimates hold until it resolves.
              </span>
            )}
            {!splitDeclined ? (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={applySplitDays}>
                  Apply - add {travelDayNeed - trip.days.length} day{travelDayNeed - trip.days.length !== 1 ? 's' : ''}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSplitDeclined(true)}>Keep my {trip.days.length}-day plan</button>
              </div>
            ) : (
              <span className="small dayplanner-red">
                Keeping {trip.days.length} day{trip.days.length !== 1 ? 's' : ''}: ≈{minutesToHM(wholeTrip.min * loopFactor)} behind the wheel in a single stretch is past the honest cap - the fatigue verdict stays red.
              </span>
            )}
            {roadNeedsRetry && road && !roadRetryUnderway && (
              <button className="btn btn-outline btn-sm" onClick={road.retry}
                title="Ask the routing provider again — the first tries may have been rate-limited">
                <InlineIcon icon={RefreshCw} size={12} gap={3} />Retry road measurement
              </button>
            )}
            {drizzleDay >= 0 && dayRainPct && (
              <span className="small muted">☁ {Math.round(dayRainPct[drizzleDay]!)}% rain chance on day {drizzleDay + 1} - {travelDayNeed !== 1 ? travelDayNeed : 'one'} day{travelDayNeed !== 1 ? 's' : ''} planned stays, but pack a buffer for one more.</span>
            )}
          </div>
        )}
        {/* #141 standalone: drizzle-grade rain never flips the verdict, so it
            says itself when no split banner is up. */}
        {drizzleDay >= 0 && dayRainPct && !(splitVerdict && clockVerdict.verdict === 'ok' && travelDayNeed > trip.days.length) && clockVerdict.verdict === 'ok' && (
          <p className="hint-text" role="status">☁ {Math.round(dayRainPct[drizzleDay]!)}% rain chance on day {drizzleDay + 1} - a slow day, not a new plan. The split holds; carry the umbrella.</p>
        )}
        {!loadingPois && pois.length === 0 && (
          fractionPois && fractionPois.length > 0 ? (
            <div>
              <p className="muted small" style={{ marginBottom: 6 }}>
                Below the fatigue-plan floor, but the corridor has places - the closest to each quarter of the drive:
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
                        ~{Math.round(targetKm)} km - <b>{near.h.name}</b>
                        {editable && <button className="btn btn-ghost btn-sm" disabled={addingAny} style={{ marginLeft: 8 }} onClick={() => openAddModal(near.h)}>+ Add</button>}
                      </span>
                    ) : (
                      // #128c: a non-empty pool with no fit here is a scope/
                      // purpose miss, not an empty corridor — say the honest thing.
                      <span className="muted small">{fractionPois.length > 0
                        ? 'no sight or meal near this quarter - try widening the detour scope.'
                        : 'no corridor stop found - add a stop on the Timeline and suggestions will pin themselves here.'}</span>
                    )}
                  </div>
                )
                })
              })()}
            </div>
          ) : quotaOut ? (
            // #176: under quota-out the empty strip must not blame the plan.
            <p className="muted small">Google search quota reached - corridor fallback suggestions are paused until the counter rolls over (this is not about your route).</p>
          ) : poisFailed ? (
            // #704: a failed search is not an empty one, so the route is not blamed.
            <p className="muted small">Stops along the route could not be loaded just now.</p>
          ) : (
            <p className="muted small">This route is too short for a fatigue plan. The drive lens has little to show, so try Around the stay.</p>
          )
        )}
        </div>
      </details>
      {(clockVerdict.verdict !== 'ok' || (splitVerdict && clockVerdict.verdict === 'ok' && travelDayNeed > trip.days.length)) && <div className="mv2-provider-status" role="status">
        {clockVerdict.verdict !== 'ok' ? clockVerdict.reason : `This drive needs ${travelDayNeed} travel days. The current plan has ${trip.days.length}.`}
        {' '}<button type="button" className="mv2-route-advice" onClick={() => { const tools = listRef.current?.parentElement?.querySelector('details.mv2-tools'); if (tools instanceof HTMLDetailsElement) { tools.open = true; tools.querySelector('summary')?.focus() } }}>Review route advice</button>
      </div>}
      {(poisFailed || quotaOut) && <p className="mv2-provider-status" role="status">{quotaOut ? 'New Google searches are paused by the provider limit.' : 'Route suggestions could not be loaded. Open search settings to retry.'}</p>}
      {filterActive && (
        <div className="poi-filterbar" role="status">
          {/* #162: the bar reads the label, the filter keys on the stable key. */}
          <span>Showing only suggestions that are {{ 'over-budget': 'over budget', 'lunch-window': 'in the lunch window', stretch: 'a long stretch from the last stop', rating: 'rated 4.0+', 'budget-share': 'using a big share of the day budget', 'first-stop': 'the day’s first stop' }[chipFilter as string] ?? chipFilter}</span>
          <button type="button" onClick={() => setChipFilter(null)}>Clear filter</button>
        </div>
      )}
      <div className={'map-ideas-grid' + (folded.needs ? ' is-needs-folded' : '') + (folded.see ? ' is-see-folded' : '')} ref={listRef}>
        <MapPhoneDay trip={trip} journey={journey} activeDay={activeDayIndex} allDays={mapShowsAll} onShowAll={showAllMapDays} onDayChange={chooseDay} />
        {itineraryOpen && <div className="map-edit-keys" onKeyDown={e => edit.onReorderKey(e, selectedStop, selectedStop == null ? null : trip.days.find(d => d.stops.some(st => st.id === selectedStop))?.index ?? null)}><MapItinerary trip={trip} journey={journey} corrections={legCorrections} activeDay={activeDayIndex} budgetMin={mapBudget} selectedStop={selectedStop} allDays={mapShowsAll} onShowAll={showAllMapDays} onDayChange={chooseDay} onSelect={selectPoint} onOpenDay={onOpenDay} onFold={() => toggleItinerary(false)} railExtras={<LensRailExtras lens={lens} ringId={stayRing} onRing={setStayRing} />} windowRows={stayWindowRows} windowRow={windowRow} daysCaption={daysCaption} fixStopId={fixStopId} budgetBar={budgetBar} clock={lensClock} previewChip={previewChip} /></div>}
        {!itineraryOpen && <button className="mv2-reopen-day mv2-icon-btn" type="button" aria-label="Show day itinerary" onClick={() => toggleItinerary(true)}><PanelLeftOpen size={19} /></button>}
        <div className="mv2-lenses mv2-lens-pill" role="group" aria-label="Map planning panels">
          <button type="button" aria-label={phoneLensAriaLabel('Along the drive', lenses.counts.drive)} aria-controls="rail-see" aria-pressed={lens === 'drive' && sheetTab === 'see' && deckOpen && !selectedHit} onClick={() => { setLens('drive'); setSheetTab('see'); setDetailId(null); setDeckOpen(true); setSnap('half') }}><Route size={16} aria-hidden /><span>Drive</span>{lenses.counts.drive != null && <b>{lenses.counts.drive}</b>}</button>
          <button type="button" aria-label={phoneLensAriaLabel('Around the stay', lenses.counts.stay)} aria-controls="rail-see" aria-pressed={lens === 'stay' && sheetTab === 'see' && deckOpen && !selectedHit} onClick={() => { setLens('stay'); setSheetTab('see'); setDetailId(null); setDeckOpen(true); setSnap('half') }}><BedDouble size={16} aria-hidden /><span>Stay</span>{lenses.counts.stay != null && <b>{lenses.counts.stay}</b>}</button>
          <button type="button" aria-label={phoneLensAriaLabel('Gaps in this day', lenses.counts.gap)} aria-controls="rail-see" aria-pressed={lens === 'gap' && sheetTab === 'see' && deckOpen && !selectedHit} onClick={() => { setLens('gap'); setSheetTab('see'); setDetailId(null); setDeckOpen(true); setSnap('half') }}><Sparkles size={16} aria-hidden /><span>Gap</span>{lenses.counts.gap != null && <b>{lenses.counts.gap}</b>}</button>
          <button type="button" aria-label={phoneLensAriaLabel('Fix this day', lenses.counts.fix)} aria-controls="rail-see" aria-pressed={lens === 'fix' && sheetTab === 'see' && deckOpen && !selectedHit} onClick={() => { setLens('fix'); setSheetTab('see'); setDetailId(null); setDeckOpen(true); setSnap('half') }}><Lightbulb size={16} aria-hidden /><span>Fix</span>{lenses.counts.fix != null && <b>{lenses.counts.fix}</b>}</button>
          <button type="button" aria-label={phoneLensAriaLabel('Day plan', activeDaySlots.length)} aria-controls="rail-needs" aria-pressed={sheetTab === 'needs' && deckOpen && !selectedHit} onClick={() => { setSheetTab('needs'); setDetailId(null); setDeckOpen(true); setSnap('half') }}><List size={16} aria-hidden /><span>Plan</span><b>{activeDaySlots.length}</b></button>
          {!deckOpen && <button type="button" aria-label="Show suggestions" onClick={() => setDeckOpen(true)}><PanelRightOpen size={18} /></button>}
        </div>
        <div tabIndex={-1} className={'poi-col poi-col--needs' + sheetHiddenClass('needs', sheetTab, sheetApplies)} id="rail-needs" hidden={!deckOpen || sheetTab !== 'needs' || !!selectedHit}>
            <MapSheetHandle snap={snap} onChange={setSnap} onSnapSettled={(_next, source) => settleSheetSnap(source, 'rail-needs')} />
            <div className="poi-col-head">
              <span className="poi-col-head-ico"><Fuel size={13} aria-hidden /></span>
              <div className="poi-col-head-txt">
                <b>Day {activeDayIndex + 1} · {activeDayLabel(trip.days, activeDayIndex)}</b>
                <span className="small muted">{activeDaySlots.length === 0 ? 'the day takes shape as you plan the drive' : `${activeReadinessLabel(activeDayReadiness)}`}</span>
              </div>
              <button
                type="button"
                className="chip chip-sm"
                aria-pressed={shapeView}
                title={shapeView ? 'Back to the list' : 'See the day as a shape - drives and parts on one clock'}
                onClick={() => setShapeView(v => !v)}
              >{shapeView ? 'List' : 'Shape'}</button>
              {editable && dayCounts.fillable > 0 && batchSelection(dayPlan).items.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={fillingDay}
                  onClick={() => { void fillTheDay() }}
                  title="Add the top candidate for every empty part of the day"
                >{fillingDay ? 'Planning.' : 'Fill the day'}</button>
              )}
              <span className="poi-col-count">{`${activeDayReadiness.filled}/${activeDayReadiness.required}`}</span>
              <button
                type="button"
                className="poi-fold"
                aria-expanded={!folded.needs}
                aria-controls="rail-needs"
                title={folded.needs ? 'Expand the needs rail' : 'Collapse the needs rail - the map gains the space'}
                onClick={foldDeck}
              >
                <ChevronDown size={13} aria-hidden />
              </button>
            </div>
            {/* S9: this was `role="tablist"` / `role="tab"` with no tabpanel and
                no arrow-key roving focus — a screen reader was told these are
                tabs and told to use the arrow keys, and nothing happened. A
                group of pressed buttons says what is actually true. */}
            <div className="slots-daystrip" role="group" aria-label="Which day to plan">
              <span className="map-scope-lbl">Plan this day</span>
              {trip.days.map(d => {
                const r = tripReadinessRows.find(x => x.dayIndex === d.index)
                const filled = r?.filled ?? 0
                // `required` (total minus engine-managed) is the honest
                // denominator: a stretch break the user is told demands nothing
                // should not sit in the count they are measured against.
                const required = r?.required ?? 0
                const auto = r?.auto ?? 0
                return (
                  <button
                    key={d.index}
                    type="button"
                    aria-pressed={d.index === activeDayIndex}
                    aria-label={`Day ${d.index + 1}: ${filled} of ${required} planned${auto > 0 ? `, ${auto} added by the app` : ''}`}
                    className={'slots-daychip' + (d.index === activeDayIndex ? ' is-on' : '')}
                    onClick={() => { setLocalDay(d.index); onDayFocusChange?.(d.index); setOpenSlotKey(null) }}
                  >
                    Day {d.index + 1} <span className="slots-daychip-rd">{filled}/{required}</span>
                    {dayRainPct?.[d.index] != null && dayRainPct[d.index]! >= 40 && (
                      <span className="slots-daychip-rain" title={`${Math.round(dayRainPct[d.index]!)}% rain chance`}>rain</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="slots-railmeta">
              {quotaOut && (
                <span className="chip chip-sm" title="Google search quota reached - suggestions pause until the counter rolls over">Suggestions paused</span>
              )}
              <details className="slots-legend">
                <summary className="chip chip-sm">Legend</summary>
                <div className="slots-legend-body">
                  <p><b>✓</b> a planned part - one quiet line</p>
                  <p><b>○</b> an unplanned part - candidates inside</p>
                  <p><b>dashed ring</b> a stretch break the app added</p>
                  <p><b>violet dot</b> an extra worth adding</p>
                </div>
              </details>
            </div>
            {activeDaySlots.length > 0 && (
              <div className="slots-meter" role="status" aria-label={`Day ${activeDayIndex + 1}: ${activeDayReadiness.filled} of ${activeDayReadiness.required} parts of the day planned${activeDayReadiness.auto > 0 ? `, ${activeDayReadiness.auto} added by the app` : ''}`}>
                {activeDaySlots.map(s => (
                  <i key={s.key} className={s.state === 'filled' ? 'is-filled' : s.state === 'auto' ? 'is-auto' : 'is-empty'} />
                ))}
                <span className="slots-meter-lbl">{activeDayReadiness.filled} of {activeDayReadiness.required} planned{activeDayReadiness.auto > 0 ? ` · ${activeDayReadiness.auto} auto` : ''}</span>
              </div>
            )}
            {activeDaySlots.length > 0 && (
              <div className="slots-mobile-sum">
                <button
                  type="button"
                  className="chip chip-sm"
                  aria-expanded={slotsPeek}
                  aria-controls="slots-list"
                  onClick={() => setSlotsPeek(p => !p)}
                >
                  {slotsPeek ? 'Hide' : activeDaySlots.some(s => s.state === 'empty')
                    ? `${activeDaySlots.filter(s => s.state === 'empty').length} empty — open`
                    : 'Open'}
                </button>
              </div>
            )}
            {shapeView && shapeBlocks.length > 0 ? (
              <div className="dayshape">
                {shapeBlocks.map((b, i) => (
                  <div
                    key={`${b.kind}-${i}`}
                    className={`shape-block shape-${b.kind} shape-state-${b.state}`}
                    style={{ height: `${Math.max(18, Math.round(b.minutes * 0.45))}px` }}
                    title={b.startMin != null
                      ? `${b.label} - ${Math.round(b.minutes)} min from ${clockHM(b.startMin)}`
                      : `${b.label} - ${Math.round(b.minutes)} min`}
                  >
                    <span className="shape-name">{b.label}</span>
                    <span className="shape-min">{Math.round(b.minutes)}m</span>
                  </div>
                ))}
              </div>
            ) : activeDaySlots.length === 0 ? (
              <div className="poi-plan-list is-emptyday">
                <p className="muted small">{quotaOut
                  ? 'Google Places reached its 80% safety pause - corridor suggestions resume next UTC month.'
                  : needs.length === 0
                    ? 'No driving plan yet - the day takes shape as you add driving days.'
                    : `Nothing scheduled for Day ${activeDayIndex + 1} yet - its halts belong to other days.`}</p>
              </div>
            ) : (
              <div className={'slots-list' + (slotsPeek ? ' is-peek' : '')} id="slots-list">
              {mapScopeNote(mapFilter, activeDayIndex) && (
                <p className="hint-text" role="status">{mapScopeNote(mapFilter, activeDayIndex)}</p>
              )}
              {/* #333 A5: the slot's candidates had no live region, so a screen-reader
                  user opening a part heard nothing about what was in reach. Mounted even
                  when a part opens: it starts empty by design, and a region that MOUNTS already carrying its text is never announced. */}
              <span className="sr-only" role="status" aria-live="polite">{openAnnouncement}</span>
                {activeDaySlots.map(slot => {
                  const isOpen = openSlotKey === slot.key
                  // `urgencyMin` is window-end minus ETA, so it goes NEGATIVE
                  // once the window has passed. Both cases were swept up by the
                  // old `<= SLOT_URGENCY_MIN` test, so a slot 40 minutes past
                  // its window said "closes 14:30" — telling the user to hurry
                  // for a door that had already shut.
                  const closing = slot.state === 'empty' && slot.urgencyMin != null && slot.urgencyMin >= 0 && slot.urgencyMin <= SLOT_URGENCY_MIN
                  const missed = slot.state === 'empty' && slot.urgencyMin != null && slot.urgencyMin < 0
                  // Read the window, don't slice the formatted label.
                  const windowEnd = slot.windowMin ? clockHM(slot.windowMin[1]) : ''
                  return (
                    <div
                      key={slot.key}
                      className={'day-slot' + (slot.state === 'filled' ? ' is-filled' : slot.state === 'auto' ? ' is-auto' : ' is-empty') + (isOpen ? ' is-open' : '') + (closing ? ' is-urgent' : '') + (missed ? ' is-missed' : '')}
                    >
                      {slot.state === 'empty' ? (
                        <>
                          <button
                            type="button"
                            className="day-slot-top"
                            aria-expanded={slot.vote ? undefined : isOpen}
                            aria-describedby={slot.vote ? voteStatusId(slot.key) : undefined}
                            onClick={() => {
                              if (slot.vote) { onOpenGroupInput?.(); return }
                              setOpenSlotKey(prev => (prev === slot.key ? null : slot.key))
                            }}
                          >
                            <span className="day-slot-st" aria-hidden />
                            <span className="day-slot-lab"><SlotGlyph kind={slot.kind} label={slot.label} />{slot.label}</span>
                            {slot.windowLabel && <span className="day-slot-win">{slot.windowLabel}</span>}
                            {closing && <span className="day-slot-urgent">Closes {windowEnd}</span>}
                            {missed && <span className="day-slot-missed">Closed {windowEnd}</span>}
                          </button>
                          {slot.state === 'empty' && slotPattern(slot.kind) && (
                            <p className="day-slot-pattern">{slotPattern(slot.kind)}</p>
                          )}
                          {/* #143: the drift proposal's home that the P2 rewrite
                              orphaned - shown while the slot is open; Stay hides it
                              for the session (the pin holds, it re-asks next open),
                              Move here accepts the re-derived position. */}
                          {slot.drift && !driftDismissed.has(slot.segment?.index ?? -1) && (
                            <div className="day-slot-drift" role="group" aria-label="Pinned rest drifted">
                              <span className="day-slot-drift-t">
                                The plan now puts your pinned rest {Math.abs(Math.round(slot.drift.toKm - slot.drift.fromKm))} km from your pin.
                              </span>
                              <span className="day-slot-drift-a">
                                <button
                                  type="button"
                                  className="day-slot-fill"
                                  title="Accept the new spot - it stops being pinned"
                                  onClick={() => {
                                    const drift = slot.drift
                                    const segIdx = slot.segment?.index ?? -1
                                    if (!drift || segIdx < 0) return
                                    const ords = pois
                                      .filter(x => x.segment.purpose === 'overnight')
                                      .sort((a, b) => a.segment.targetKm - b.segment.targetKm)
                                      .findIndex(x => x.segment.index === segIdx)
                                    if (ords < 0) { setDriftDismissed(prev => new Set(prev).add(segIdx)); return }
                                    clearHaltPin(trip.id, ords)
                                    // #346: haltPins is inside mapInputsHash, so the plan
                                    // re-derives through the hash — the extra forced re-search
                                    // (spinner flash) is gone.
                                    setDnaTick(t => t + 1)
                                    undoToast('Moved the pinned rest to its new spot', () => saveHaltPin(trip.id, ords, drift.fromKm))
                                  }}
                                >Move here</button>
                                <button
                                  type="button"
                                  className="chip chip-sm"
                                  title="The pin holds - this asks again next open"
                                  onClick={() => setDriftDismissed(prev => new Set(prev).add(slot.segment?.index ?? -1))}
                                >Stay</button>
                              </span>
                            </div>
                          )}
                          {slot.vote ? (
                            <div className="day-slot-vote" id={voteStatusId(slot.key)}>
                              <span className="chip chip-sm">{slot.vote.voters > 0
                                ? `Voting · ${slot.vote.votesCast} of ${slot.vote.voters}`
                                // #335: the denominator is members now, and a trip with no
                                // member rows has none — say so instead of printing "2 of 0".
                                : `Voting · ${slot.vote.votesCast} vote${slot.vote.votesCast === 1 ? '' : 's'}`
                              }</span>
                              <span className="day-slot-vote-lead">
                                {slot.vote.leadingLabel ? `${slot.vote.leadingLabel} leads` : 'no votes yet'} · open Group input
                              </span>
                            </div>
                          ) : (
                            <div className="day-slot-hint">
                              Nothing planned yet
                              <span className="n">
                                {slotRowsOf(dayPlan, slot.key).length > 0
                                  ? ` · ${slotRowsOf(dayPlan, slot.key).length} candidate${slotRowsOf(dayPlan, slot.key).length === 1 ? '' : 's'} inside, tap to compare`
                                  : ' · search the map to source one'}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="day-slot-top">
                          <span className="day-slot-st" aria-hidden>{slot.state === 'filled' ? '\u2713' : ''}</span>
                          <span className="day-slot-lab"><SlotGlyph kind={slot.kind} label={slot.label} />{slot.label}</span>
                          <span className="day-slot-win">{slot.windowLabel ?? ''}</span>
                          <span className="day-slot-val">
                            {slot.state === 'filled'
                              ? <b>{slot.filledStop?.title ?? slot.segment?.label ?? 'Planned'}</b>
                              : <small>{slot.reason ?? 'Engine-managed'}</small>}
                          </span>
                        </div>
                      )}
                      {slot.state === 'empty' && isOpen && (
                        <div className="day-slot-cands">
                          {/* P1: search lands in its slot - find inside the open
                              part; a picked result becomes ITS candidate (real
                              detour + budget share), never a direct plan write. */}
                          <div className="day-slot-search">
                            <input
                              className="input"
                              type="search"
                              placeholder="Find a place for this slot..."
                              aria-label={`Search to source the ${slot.label.toLowerCase()} slot`}
                              disabled={quotaOut}
                              value={slotSearch?.key === slot.key ? slotSearch.q : ''}
                              onChange={e => { setSlotSearchScope(searchScopeNow); setSlotSearch({ key: slot.key, q: e.target.value, busy: false, hits: [], err: null }) }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void runSlotSearch(slot) } }}
                            />
                            <button
                              type="button"
                              className="day-slot-fill"
                              disabled={quotaOut || !!slotSearch?.busy || slotSearch?.key !== slot.key || slotSearch.q.trim().length < 2}
                              onClick={() => void runSlotSearch(slot)}
                            >{slotSearch?.key === slot.key && slotSearch.busy ? 'Finding…' : 'Find'}</button>
                          </div>
                          {slotSearch?.key === slot.key && slotSearch.q.trim().length === 1 && !slotSearch.busy && (
                            <p className="muted small" style={{ margin: '0 0 6px' }}>Keep typing - search starts at 2 characters.</p>
                          )}
                          {slotSearch?.key === slot.key && slotSearch.err && (
                            <p className="muted small" role="status" style={{ margin: '0 0 6px' }}>{slotSearch.err}</p>
                          )}
                          {slotSearch?.key === slot.key && !slotSearch.busy && slotSearch.hits.length > 0 && (
                            <div className="day-slot-search-hits">
                              {slotSearch.hits.slice(0, 6).map(h => (
                                <div key={String(h.id)} className="day-slot-search-hit">
                                  <span className="day-slot-search-hit-nm">{h.name}{h.nearestCity ? ` · ${h.nearestCity}` : ''}</span>
                                  <button type="button" className="day-slot-fill" onClick={() => addManualCandidate(slot, h)}>Use</button>
                                </div>
                              ))}
                              {slotSearch.hits.length > 6 && (
                                <p className="muted small" style={{ margin: '4px 2px 0' }}>{slotSearch.hits.length - 6} more - refine the search to narrow it.</p>
                              )}
                            </div>
                          )}
                          {slotRowsOf(dayPlan, slot.key).map(c => (
                            <div key={String(c.hit.id)} className="day-slot-cand">
                              <span className="day-slot-cand-nm">
                                <b>{c.hit.name}</b>
                                <span>
                                  {c.detourMin == null ? 'position unknown' : `+${Math.round(c.detourMin)} min`}
                                  {c.arriveLabel ? ` · arrive ${c.arriveLabel}` : ''}
                                  {/* Runtime hours (repair of #887): the candidate's own day
                                      date and intended visit length decide the shown intervals
                                      and the closed note. Structured hours never fall back to
                                      the first legacy period; no structured hours keeps it. */}
                                  {(() => {
                                    if (c.hit.hours) {
                                      const shown = hoursDisplayFor(c.hit, {
                                        date: visitDateForDay(trip.startDate, activeDayIndex),
                                        arrivalMin: c.arriveMin,
                                        visitMin: intendedVisitMinutes(c.hit),
                                      })
                                      // The verdict note renders even when no interval is
                                      // provable: a known closure is a fact, not a blank.
                                      // Repair of the recheck P2: ranges no longer gate the note.
                                      const text = hoursCardText(shown, (a, b) => formatHMRange(a, b, timeFormat))
                                      return text ? ` · ${text}` : ''
                                    }
                                    return (c.hit.openTime || c.hit.closeTime) ? ` · ${formatHMRange(c.hit.openTime, c.hit.closeTime, timeFormat)}` : ''
                                  })()}
                                  {c.detourMin == null ? 'position unknown' : c.budgetSharePct > 0 ? ` · ${c.budgetSharePct}% of day detours` : ' · on route'}
                                  {c.reason ? ` · ${c.reason}` : ''}
                                </span>
                                {c.budgetSharePct > 0 && (
                                  <span className="day-slot-cand-bar"><i className={c.budgetSharePct > 100 ? 'is-over' : ''} style={{ width: `${Math.min(100, c.budgetSharePct)}%` }} /></span>
                                )}
                              </span>
                              <button
                                type="button"
                                className="day-slot-fill"
                                disabled={addingAny}
                                onClick={() => { void fillSlot(slot, c.hit) }}
                              aria-label={fillLabel(c.hit.name, slot.label)}
                              >Fill</button>
                            </div>
                          ))}
                          {slotRowsOf(dayPlan, slot.key).length === 0 && (
                            <p className="muted small" style={{ margin: '4px 0 0' }}>
                              No candidates in reach{slot.windowLabel ? ` inside ${slot.windowLabel}` : ''} - add one on the Timeline, or search the map.
                            </p>
                          )}
                          {editable && !slot.vote && slotVoteReady(dayPlan, slot.key) && (
                            <button type="button" className="chip chip-sm" disabled={addingAny} onClick={() => void raiseSlotVote(slot)}>
                              Ask the crew to vote
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="map-ideas-map">
            {/* #418: the map's own search, above the canvas and outside both rails.
                Discovery here is route-aware (the shared runner), and filing is an
                explicit choice — this surface writes nothing on its own. */}
            <MapOmnibar
              editable={editable}
              query={omniQ}
              onQueryChange={q => {
                setOmniQ(q)
                // Same discipline as the rail's box: stale rows from a previous
                // query must not sit under the new one while typing.
                if (omniResults.length > 0) setOmniResults([])
                if (omniPicked) setOmniPicked(null)
              }}
              onSubmit={onOmniSearch}
              busy={searching}
              quotaOut={quotaOut}
              results={omniResults}
              selectedId={omniPicked?.h.id ?? null}
              placement={omniPlacement}
              scopeKm={scopeKm}
              scopeMinutes={scopeMinutes}
              onSelect={id => {
                const row = omniResults.find(r => r.h.id === id) ?? null
                setOmniPicked(row)
                // …and the map agrees about which pin is being decided.
                setActiveHitId(id)
              }}
              onClear={() => { setOmniQ(''); setOmniResults([]); setOmniPicked(null) }}
              onPlace={placeOmnibarHit}
            />
            <TripMap
              trip={trip}
              dedicated
              nearbyPois={mapPois}
              onAddNearby={editable ? (hit) => openAddModal(hit) : undefined}
              activeHitId={activeHitId}
              onActivateHit={id => { setActiveHitId(id); const hit = mapPois.find(item => item.id === id); if (hit) inspectHit(hit) }}
              onOpenInTimeline={onOpenTimeline}
              onOpenInBoard={onOpenBoard ? () => onOpenBoard() : undefined}
              focusDay={mapShowsAll ? 'all' : activeDayIndex}
              {...thinDays}
              legCorrections={legCorrections}
              tripReadinessRows={tripReadinessRows}
              onDayFilterChange={day => {
      // #416: the map reports its own scope, including 'all' — the rail records it
      // so it can say when the two disagree (it cannot plan a whole trip itself).
      setMapFilter(day)
                // The rail always plans exactly one day, so the map's "All days"
                // leaves it where it is; a day chip moves the rail onto that day.
                // #425 PR 2: the same choice rides the shared day-focus axis, so
                // the Board's columns and this rail agree whichever was touched.
                // #610: 'all' publishes too — scope rides the axis, the rail
                // keeps its day and the map reads 'all' straight from dayFocus.
                onDayFocusChange?.(day)
                if (typeof day === 'number') setLocalDay(day)
              }}
              slotPins={slotPins}
              hitCosts={hitCosts}
              searchHitIds={searchHitIds}
              onOpenSlot={(key) => {
                // Tapping a pin on the map has to actually reveal the part.
                // With the rail folded the expansion was invisible, so the pin
                // appeared to do nothing at all.
                setFolded(f => (f.needs ? { ...f, needs: false } : f))
                setOpenSlotKey(key)
                setSheetTab('needs')
                setDetailId(null)
                setDeckOpen(true)
                setSnap('half')
                // After the unfold has painted.
                requestAnimationFrame(() => {
                  document.getElementById('rail-needs')?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' })
                })
              }}
              onOpenHaltDay={onOpenDay}
              clockMilestones={clockMilestones}
              onDeleteStop={editable ? removeStopFromMap : undefined}
              mapTarget={localTarget ?? mapTarget}
              onMapTargetConsumed={() => { if (localTarget) setLocalTarget(null); else onMapTargetConsumed?.() }}
              workspaceChrome
              instantTarget={!!localTarget && targetRequest?.instant === true}
              journeyCursor={scrubCursor?.contextKey === scrubContext ? { coordinate: scrubCursor.coordinate, label: formatHM(clockHM(scrubCursor.minute), timeFormat) } : null}
              overlayInsets={{ left: itineraryOpen && !phoneSheet ? (compactMap ? 298 : 404) : 24, right: deckOpen && !phoneSheet ? (compactMap ? 306 : 396) : 70, top: 90, bottom: phoneSheet ? (snap === 'peek' ? 224 : snap === 'half' ? 460 : 560) : 90 }}
              enableMapViewModes
              mainRouteGeometry={routeGeometry}
              returnRouteGeometry={returnRouteGeometry}
              allowSelfMeasurement={false}
              onShowReturnChange={setShowReturn}
              {...(stayRings ? { stayRings } : {})}
              frameStayRing={lens === 'stay' && lenses.stay.base != null}
              {...(gapRings ? { gapRings } : {})}
              {...(onGapRing ? { onGapRing } : {})}
              {...(Object.keys(pickBands).length > 0 ? { pickBands } : {})}
              {...(pickLetters && Object.keys(pickLetters).length > 0 ? { pickLetters } : {})}
              {...(fixWarningMarks.length > 0 ? { warningMarks: fixWarningMarks } : {})}
              {...(edit.previewRoad ? { previewRoad: edit.previewRoad } : {})}
            />
            {lens === 'drive' && <MapScopeBand minutes={scopeChoice} onMinutes={changeScope} counts={driveCounts} snap={snap} phone={phoneSheet} />}
          </div>
          <div tabIndex={-1} className={'poi-col poi-col--see' + sheetHiddenClass('see', sheetTab, sheetApplies)} id="rail-see" hidden={!deckOpen || sheetTab !== 'see' || !!selectedHit}>
            <MapSheetHandle snap={snap} onChange={setSnap} onSnapSettled={(_next, source) => settleSheetSnap(source, 'rail-see')} />
            {lens === 'drive' && <div className="mv2-peek">
              {seeForRail[0]?.hit ? <>
                <span className="mv2-peek-mark"><CatIcon category={seeForRail[0].hit.category} size={22} /></span>
                <button type="button" className="mv2-peek-place" onClick={() => { const hit = seeForRail[0]?.hit; if (hit) inspectHit(hit) }}><small>Along the drive</small><strong>{seeForRail[0].hit.name}</strong></button>
                {editable && <button type="button" className="btn btn-primary" disabled={addingAny || !!previewOpen} onClick={() => { const hit = seeForRail[0]?.hit; if (hit) openAddModal(hit) }}>Add</button>}
              </> : <p>{loadingPois ? 'Finding picks along the drive…' : poisFailed ? 'Picks could not be loaded. Open search settings to retry.' : quotaOut ? 'Search is paused. Available results stay here.' : 'No extra picks yet. Search for a place or open the day plan.'}</p>}
            </div>}
            <MapLensPanel
              lens={lens}
              onFold={foldDeck}
              lenses={lenses}
              dayLabel={lensDayLabel}
              dayNumber={activeDayIndex + 1}
              clock={lensClock}
              activeDriveTab={driveTab}
              onDriveTab={setDriveTab}
              stripOf={row => driveCardStrip(row, lensClock)}
              bandOf={row => scopeBandOf(row, scopeMinutes, budgetHeldIds)}
              introOf={row => driveDeckIntro(row, lensClock)}
              onOpenDrive={row => inspectHit(row.row.hit)}
              onAddDrive={row => addLensHit(row.row.hit, activeDayIndex)}
              activeStayWindow={activeStayWindowId}
              onStayWindow={setStayWindow}
              stayRing={stayRing}
              onStayRing={setStayRing}
              onOpenStayPick={pick => inspectHit(pick.row.row.hit)}
              onAddStayPick={pick => addLensHit(pick.row.row.hit, activeDayIndex)}
              onSetStay={() => { setSheetTab('needs'); setDetailId(null); setDeckOpen(true); setSnap('half') }}
              onOpenGapPick={pick => inspectHit(pick.candidate.hit)}
              onAddGapPick={pick => addLensHit(pick.candidate.hit, activeDayIndex)}
              onApplyFix={applyLensFix}
              onPreviewFix={previewLensFix}
            />
            {lens === 'drive' && <div className="poi-plan-list is-ledger">
              {!filterActive && arcs.slice(0, 2).length > 0 && (
                <div className="poi-grp mv2-deck-arc-group">
                  <span className="poi-grp-k">Route arcs</span>
                  <span className="poi-grp-n">{arcs.slice(0, 2).length}</span>
                  <span className="poi-grp-ln" />
                </div>
              )}
              {arcs.slice(0, 2).map(arc => (
                <div key={arc.theme} className="poi-plan-row poi-plan-arc mv2-deck-arc">
                  <div className="ride-spot-title">
                    <span className="ride-purpose ride-purpose-sight">{arc.theme}</span>
                    <b>{arc.arcBody}</b>
                  </div>
                  <div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => { void addArc(arc) }}
                    >Add all ({arc.hitIds.length})</button>
                  </div>
                </div>
              ))}
              {quotaOut && (
                <p className="hint-text" role="status">⚠ Google Places reached its 80% safety pause for this month - corridor suggestions resume next UTC month. Remove the key in Settings and reload to use the free stack.</p>
              )}
              {seeForRail.length === 0
                ? <p className="muted small" role="status">{loadingPois ? 'Finding stops along the drive…' : poisFailed ? 'Route suggestions could not be loaded. Open search settings to retry.' : quotaOut ? 'New Google searches are paused by the provider limit.' : 'No extra picks yet. Search for a place or open the day plan.'}</p>
                : hiddenRows.length > 0 && (
                    <details className="poi-more mv2-deck-more mv2-lens-more">
                      <summary>More like this · {hiddenRows.length}</summary>
                      <div className="poi-more-list">{hiddenRows.map(ledgerRow)}</div>
                    </details>
                  )}
              {budgetHeldCount > 0 && (
                <p className="hint-text">{budgetHeldCount} idea{budgetHeldCount === 1 ? '' : 's'} held back - beyond the day&apos;s detour budget. Add fewer stops, or raise the scope, and the engine will offer them again.</p>
              )}
            </div>}
          </div>
          {selectedHit && deckOpen && <div className="mv2-detail" onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); closeDetails() } }}>
            <MapSheetHandle snap={snap} onChange={setSnap} onSnapSettled={(_next, source) => settleSheetSnap(source, 'rail-detail')} />
            <MapPickCard hit={selectedHit} trip={trip} dayIndex={detailDay} detourMin={selectedRow ? selectedRow.detourMin : selectedProjected ? null : detourMinFor(selectedHit) ?? null} reason={selectedRow?.reason ?? null}
              visitMin={selectedRow ? selectedRow.visitMin : selectedProjected ? null : undefined}
              budgetSharePct={selectedRow ? selectedRow.budgetSharePct : selectedProjected ? null : undefined}
              source={selectedRow ? selectedRow.source : selectedProjected ? null : undefined}
              freshness={selectedRow ? selectedRow.freshness : selectedProjected ? 'unknown' : undefined}
              actions={mapCardActions(selectedRow, selectedProjected)}
              arriveMin={selectedRow ? selectedRow.arriveMin : selectedProjected ? null : undefined}
              fetchedAt={selectedRow ? scanFetchedAt : undefined} coverage={selectedRow ? scanCoverage : undefined}
              added={isAlreadyAdded(selectedHit, identity)} editable={editable} busy={addingAny || !!previewOpen} shortlisted={isShortlisted(selectedHit)}
              onAdd={() => { if (editable && detailDay != null && !isAlreadyAdded(selectedHit, identity)) edit.startAdd(selectedHit, detailDay); else openAddModal(selectedHit) }} onShortlist={() => toggleShortlist(selectedHit)} onClose={closeDetails} onDirections={() => openExternal(googleMapsUrl(selectedHit))} />
            <MapEditAddPanel edit={edit} onChooseDay={() => openAddModal(selectedHit)} />
          </div>}
          {deckOpen && !selectedHit && editable && selectedStop != null && <div className="mv2-detail"><MapEditStopPanel edit={edit} trip={trip} stopId={selectedStop} editable={editable} /></div>}
          <MapEditLive edit={edit} />
          <MapJourneyRibbon journey={journey} corrections={legCorrections} {...(openPreview ? { preview: openPreview } : {})} onScrub={(position, minute) => {
            if (position.grade === 'estimated') { setScrubCursor(null); return }
            setScrubCursor({ contextKey: scrubContext, coordinate: position.coordinate, minute })
            setLocalTarget({ kind: 'coordinate', coordinate: position.coordinate }, true)
          }} />
      </div>
      {/* Shortlist tray: the rail collects, the tray decides. Sticky so it stays
          reachable while the rails scroll. #420 slice 1 moved the markup into
          map/ShortlistTray.tsx; the actions below stay here until slice 2. */}
      <ShortlistTray
        count={trayShortlist.length}
        busy={addingAny}
        onAddAll={() => void addShortlisted()}
        onVote={() => void raiseShortlistVote()}
        onClear={clearShortlist}
      />
      {/* pick-a-day modal for adding a suggested POI — explicit confirm */}
      <Modal open={!!poiDraft} onClose={() => setPoiDraft(null)} title={`Add “${poiDraft?.hit.name ?? ''}”`}>
        {poiDraft && (
          <div>
            {poiDraft.hit.description && <p className="small muted" style={{ marginTop: 0 }}>{poiDraft.hit.description}</p>}
            <Field label="Add to which day?">
              <Select
                value={String(pickDay)}
                onChange={v => { setPickDay(Number(v)); setPickDayGuessed(false) }}
                options={dayOptions.map(d => ({ value: String(d.index), label: `Day ${d.index + 1}` }))}
              />
                {/* #333 A9: said out loud, beside the control it qualifies. The Select
                    component forwards no extra props, so this cannot ride on describedby. */}
                {pickDayCaveat(pickDay, !pickDayGuessed) && (
                  <p className="hint-text" role="status">{pickDayCaveat(pickDay, !pickDayGuessed)}</p>
                )}
            </Field>
            <p className="hint-text">You can fine-tune duration, fees and timings in the Timeline afterwards.</p>
            <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-outline" onClick={() => setPoiDraft(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { recordDnaEvent({ tripId: trip.id, action: 'accept', haltKind: poiDraft.hit.haltPurpose, category: poiDraft.hit.category, detourMin: asymmetricDetourMinutes(poiDraft.hit, anchors, routePolyline ?? null, MODE_SPEED[trip.transportMode] ?? 40) ?? undefined, visitMin: visitMinutesForCategory(poiDraft.hit.category) }); setDnaTick(t => t + 1); addPoiToDay(poiDraft.hit, pickDay); setPoiDraft(null) }}>
                Add to timeline
              </button>
            </div>
          </div>
        )}
      </Modal>
      {/* resolve-or-prompt dialog — one instance serves every pick guard */}
      {resolvePickDialog}
    </div>
  )
}
