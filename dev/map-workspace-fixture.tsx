import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/sora/800.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import '../src/styles.css'
import './map-workspace-fixture.css'
import type { ItineraryStop, Trip } from '../src/data/types'
import { MapTab } from '../src/pages/trip/MapTab'
import { useSuggestionCache } from '../src/hooks/useSuggestionCache'
import { buildRoadChain, correctionsFromLegs, type TripRoadView } from '../src/lib/tripRoad'
import { legBetween, getAssumptions } from '../src/lib/engine'
import { getSnapshot } from '../src/store/store'
import { placeIdentity } from '../src/lib/placeIdentity'
import { buildDnaVectorAcrossTrips, crewSeedEvents, crewSeedsFromSuggestions, loadDnaLog, type CrewSeed } from '../src/lib/tripDna'
import { useJourneyDays } from '../src/pages/trip/journey/useJourneyDays'
import type { CorridorSnapshot } from '../src/pages/trip/map/corridorSnapshot'
import type { ApplyChange } from '../src/lib/mutationLifecycle'
import type { PlaceHit } from '../src/lib/providers/hits'
import boardRoad from './map-board-day3-road.json'
import { boardLegBetween, fixtureModeFromSearch, installFixtureTransport } from './map-workspace-fixture.transport'

// The page says the provider transport is controlled. This call keeps that
// promise on every dev server, so no lens deck waits on a live place scan.
// The board trip answers its own sample places. A provider query picks another mode.
installFixtureTransport(undefined, new URLSearchParams(location.search).has('provider') ? fixtureModeFromSearch(location.search) : new URLSearchParams(location.search).get('trip') === 'small' ? 'answer' : 'board')

const params = new URLSearchParams(location.search)
const mode = params.get('state') ?? 'ready'
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light'
localStorage.setItem('yatraflow_map_view_mode', '2d')
getSnapshot().sessionUserId = 'fixture-map-user'

const stop = (id: string, title: string, category: ItineraryStop['category'], lat: number, lng: number, orderInDay: number, visitMinutes: number, locationName: string = title): ItineraryStop => ({
  id, title, category, lat, lng, orderInDay, visitMinutes, locationName, status: 'confirmed', priority: 'nice-to-have', entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
})
// The board trip: Kerala loop, 6 days from 14 Nov, Day 3 Munnar to Thekkady. The
// road is one recorded OSRM answer (dev/map-board-day3-road.json). Every stop of
// Day 3 stands on a vertex of that line. All of this is sample data.
const at = (key: keyof typeof boardRoad.stops) => ({ lat: boardRoad.stops[key].at[1], lng: boardRoad.stops[key].at[0] })
const boardTrip = params.get('trip') !== 'small'
const fixScenario = params.get('scenario') === 'fix'
const small = (): Trip => ({
  id: 'fixture-map-local-only', name: 'Kerala loop', startLocation: 'Munnar', startLocationCoords: { lat: 10.088, lng: 77.059 }, destinations: ['Thekkady'], destinationCoords: [{ lat: 9.604, lng: 77.164 }],
  startDate: '2027-11-14', endDate: '2027-11-16', travellers: 2, budgetPerPersonInr: 12000, travelStyle: 'balanced', transportMode: 'car', stayStyle: 'comfort', roundTrip: false,
  createdAt: 1, updatedAt: 1, expenses: [], coverEmoji: '', visibility: 'private', members: [{ userId: 'fixture-map-user', role: 'owner', joinedAt: 1 }],
  fixedCommitments: [{ id: 'fixture-lock', title: 'Periyar boat', type: 'event', dayIndex: 0, time: '15:00', stopId: 'fixture-boat' }],
  days: [{ id: 'fixture-day-1', index: 0, startTime: '10:00', title: 'Munnar to Thekkady', stops: [
    stop('fixture-waterfall', 'Attukad waterfalls', 'nature', 10.057, 77.059, 1, 30),
    stop('fixture-lunch', 'Lunch · Nalla Ruchi Kitchen', 'food', 9.755, 77.116, 2, 45),
    stop('fixture-hotel', 'Check in · Spice Village', 'hotel', 9.604, 77.164, 3, 30),
    stop('fixture-boat', 'Periyar boat', 'nature', 9.585, 77.177, 4, 60),
  ] }, { id: 'fixture-day-2', index: 1, title: 'Around Thekkady', startTime: '09:00', stops: [stop('fixture-forest', 'Forest walk', 'nature', 9.57, 77.18, 1, 60)] }],
})
const board = (): Trip => ({
  id: 'fixture-map-local-only', name: 'Kerala loop', startLocation: 'Kochi', startLocationCoords: { lat: 9.9312, lng: 76.2673 }, destinations: ['Kochi'], destinationCoords: [{ lat: 9.9658, lng: 76.2421 }],
  startDate: '2026-11-14', endDate: '2026-11-19', travellers: 2, budgetPerPersonInr: 24000, travelStyle: 'balanced', transportMode: 'car', stayStyle: 'comfort', roundTrip: false,
  createdAt: 1, updatedAt: 1, expenses: [], coverEmoji: '', visibility: 'private', members: [{ userId: 'fixture-map-user', role: 'owner', joinedAt: 1 }],
  fixedCommitments: [{ id: 'fixture-lock', title: 'Periyar boat', type: 'event', dayIndex: 2, time: '15:30', stopId: 'fixture-boat', notes: 'Paid booking. Boarding closes at 15:00. Sample data.' }],
  days: [
    { id: 'fixture-day-1', index: 0, startTime: '09:00', title: 'Kochi to Munnar', stops: [
      stop('fixture-d1-falls', 'Cheeyappara waterfalls', 'nature', 10.0107, 76.9187, 1, 40),
      stop('fixture-d1-hotel', 'Check in · Tea Valley', 'hotel', at('munnar').lat, at('munnar').lng, 2, 30, 'Munnar'),
    ] },
    { id: 'fixture-day-2', index: 1, startTime: '09:00', title: 'Munnar tea country', stops: [
      stop('fixture-d2-museum', 'Tea museum', 'sightseeing', 10.0865, 77.0647, 1, 60),
      stop('fixture-d2-hotel', 'Check in · Tea Valley', 'hotel', at('munnar').lat, at('munnar').lng, 2, 30, 'Munnar'),
    ] },
    { id: 'fixture-day-3', index: 2, startTime: '10:00', title: 'Munnar to Thekkady', stops: [
      stop('fixture-attukad', 'Attukad waterfalls', 'nature', at('attukad').lat, at('attukad').lng, 1, 30),
      // The fix scenario fills the meal break, so the boat is the one problem.
      ...(fixScenario ? [
        stop('fixture-lunch', 'Lunch · Nalla Ruchi Kitchen', 'food', at('kattappana').lat, at('kattappana').lng, 2, 45),
        stop('fixture-farm', 'Spice farm walk', 'sightseeing', at('anakkara').lat, at('anakkara').lng, 3, 20),
      ] : []),
      stop('fixture-hotel', 'Check in · Spice Village', 'hotel', at('spiceVillage').lat, at('spiceVillage').lng, fixScenario ? 4 : 2, fixScenario ? 81 : 91),
      stop('fixture-boat', 'Periyar boat', 'nature', at('jetty').lat, at('jetty').lng, fixScenario ? 5 : 3, 90),
    ] },
    { id: 'fixture-day-4', index: 3, startTime: '09:00', title: 'Around Thekkady', stops: [
      stop('fixture-d4-walk', 'Forest walk', 'nature', 9.5705, 77.1802, 1, 90),
      stop('fixture-d4-hotel', 'Check in · Spice Village', 'hotel', at('spiceVillage').lat, at('spiceVillage').lng, 2, 30, 'Thekkady'),
    ] },
    { id: 'fixture-day-5', index: 4, startTime: '09:00', title: 'Thekkady to Alleppey', stops: [
      stop('fixture-d5-hotel', 'Check in · Backwater houseboat', 'hotel', 9.4981, 76.3388, 1, 30),
    ] },
    { id: 'fixture-day-6', index: 5, startTime: '09:00', title: 'Alleppey to Kochi', stops: [
      stop('fixture-d6-walk', 'Fort Kochi walk', 'sightseeing', 9.9658, 76.2421, 1, 90),
    ] },
  ],
})
const trip: Trip = boardTrip ? board() : small()
if (params.get('marks') === 'states') trip.days[0].stops[0].status = 'maybe'

// The Day 3 legs follow the recorded road. Their kilometres and minutes are the
// board's sample numbers. Any other leg stays a synthetic straight line.
const chain = buildRoadChain(trip)
const assumptions = getAssumptions(trip)
const legs = chain.points.slice(1).map((point, index) => {
  const estimate = legBetween(chain.points[index], point, assumptions)
  const from = chain.points[index]
  const onRoad = boardTrip ? boardLegBetween(from, point) : null
  return {
    distanceKm: onRoad?.distanceKm ?? estimate.distanceKm,
    durationMinutes: onRoad?.durationMinutes ?? estimate.durationMinutes,
    source: 'osrm' as const,
    geometry: onRoad?.geometry ?? ([[from.lng, from.lat], [point.lng, point.lat]] as [number, number][]),
  }
})
const road: TripRoadView = { chain, legs, status: 'ok', retry: () => undefined }
const corrections = correctionsFromLegs(chain, legs)

const syntheticSeeds: CrewSeed[] = [
  { name: 'Synthetic cardamom walk', category: 'nature', lat: 9.71, lng: 77.14 },
  { name: 'Synthetic tea break', category: 'food', lat: 9.79, lng: 77.09 },
]
const crewSuggestions = syntheticSeeds.map((seed, index) => ({
  status: 'open', title: seed.name, category: seed.category, lat: seed.lat, lng: seed.lng, id: `fixture-seed-${index}`,
}))

function Fixture() {
  const cache = useSuggestionCache(trip.id, trip.days.length)
  const [day, setDay] = useState<number | 'all'>(boardTrip ? 2 : 0)
  const [message, setMessage] = useState('Synthetic local data. Provider and write transports are controlled. Map tiles are external.')
  const [corridorSnapshot, setCorridorSnapshot] = useState<CorridorSnapshot | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set())
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())
  const [stagedSnapshot, setStagedSnapshot] = useState<ReadonlyMap<string, string>>(() => new Map())
  const stagedIdsRef = useRef(new Map<string, string>())
  const [slotManual, setSlotManual] = useState<Record<string, PlaceHit[]>>({})
  const [dnaTick, setDnaTick] = useState(0)

  const publishCorridor = useCallback((incoming: CorridorSnapshot | null) => {
    if (!incoming || incoming.tripId !== trip.id) { setCorridorSnapshot(null); return }
    setCorridorSnapshot(incoming)
  }, [])
  const crewSeeds = useMemo(() => crewSeedsFromSuggestions(crewSuggestions), [])
  const dnaVector = useMemo(() => {
    void dnaTick
    return buildDnaVectorAcrossTrips(loadDnaLog(), crewSeedEvents(trip.id, crewSeeds))
  }, [crewSeeds, dnaTick])
  const journeyPresence = useMemo(
    () => placeIdentity(trip, addedIds, dismissedIds, stagedSnapshot),
    [addedIds, dismissedIds, stagedSnapshot],
  )
  const journeyDays = useJourneyDays({
    trip,
    committedTrip: trip,
    snapshot: corridorSnapshot,
    presence: journeyPresence,
    editable: params.get('role') !== 'viewer',
    decisions: [],
    dnaVector,
    legCorrections: corrections,
    slotManual,
    dnaTick,
    identityGeneration: 0,
  })
  const applyChange = useCallback<ApplyChange>(() => {
    setMessage('A local preview was requested. No trip or backend was changed.')
  }, [])
  return <div className="container yf-workspace" data-map-active="true" data-map-fullscreen="true">
    <header className="map-fixture-header"><div><strong>Kerala loop</strong><span>{trip.days.length} days · sample trip · {mode} mode</span></div><nav aria-label="Fixture trip sections"><span>Overview</span><span>Timeline</span><strong aria-current="page">Map</strong><span>Budget</span></nav></header>
    <p className="map-fixture-status" role="status">{message}</p>
    <Suspense fallback={<p>Loading map workspace…</p>}><MapTab trip={trip} editable={params.get('role') !== 'viewer'} road={road} legCorrections={corrections} suggestionCache={cache} dayFocus={day} onDayFocusChange={setDay}
      onCorridorState={publishCorridor} journeyDays={journeyDays} presence={journeyDays.presence} crewSeeds={crewSeeds}
      dnaVector={dnaVector} dnaTick={dnaTick} setDnaTick={setDnaTick} setAddedIds={setAddedIds}
      dismissedIds={dismissedIds} setDismissedIds={setDismissedIds} setStagedSnapshot={setStagedSnapshot}
      stagedIdsRef={stagedIdsRef} slotManual={slotManual} setSlotManual={setSlotManual}
      applyChange={applyChange}
      onOpenDay={index => setMessage(`Timeline day ${index + 1} requested. No navigation outside the fixture.`)}
      onBackToTrip={() => setMessage('Back to trip requested. No navigation outside the fixture.')} /></Suspense>
  </div>
}
const root = document.getElementById('root')
if (!root) throw new Error('Map fixture root is missing')
createRoot(root).render(<Fixture />)
