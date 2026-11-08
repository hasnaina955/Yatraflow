// ============ Shared journey-projection fixture (#08 L1) ============
// One reusable fact set for L1 tests and for the later L2/L3 consumers. Every
// value is built through the real `buildDayPlan` and `placeIdentity` helpers, so
// the fixture pins the app's own identity rules rather than a mock.
//
// The fixture covers: a corridor pick, a manual slot pick, an engine slot pick,
// a filled slot, one place in both a slot and the drive rows, two providers that
// share a raw id, an unknown detour, a known on-road zero, repeated visits, a
// retained freshness entry, viewer eligibility and one legacy vote.
import { buildDayPlan, type DayPlan } from '../../src/lib/dayPlan'
import type { DaySlot, SlotCandidate, SlotVote } from '../../src/lib/daySlots'
import type { PlaceHit } from '../../src/lib/providers/hits'
import type { DriveSuggestionRow } from '../../src/pages/trip/map/driveSuggestionView'
import {
  placeIdentity,
  type PlaceIdentity,
} from '../../src/lib/placeIdentity'
import type { ItineraryStop } from '../../src/data/types'

export const JOURNEY_FIXTURE = {
  tripId: 'trip-08',
  dayId: 'day-08-a',
  dayIndex: 0,
  contextKey: 'trip-08/day-08-a/route-a',
  budgetMin: 45,
} as const

/** A provider hit with only the fields the projection reads. */
export function makeHit(overrides: Partial<PlaceHit> & Pick<PlaceHit, 'id' | 'name'>): PlaceHit {
  return {
    latitude: 10.1,
    longitude: 76.2,
    kind: 'poi',
    ...overrides,
  }
}

/** A slot candidate carrying only facts the engine would have computed. */
export function makeCandidate(
  hit: PlaceHit,
  overrides: Partial<SlotCandidate> = {},
): SlotCandidate {
  return {
    hit,
    detourMin: null,
    detourKm: null,
    budgetSharePct: 0,
    posKm: null,
    arriveMin: null,
    arriveLabel: null,
    inWindow: false,
    score: 1,
    reason: 'Fixture reason',
    ...overrides,
  }
}

/** One derived slot; only the named facts are set. */
export function makeSlot(overrides: Partial<DaySlot> & Pick<DaySlot, 'key' | 'kind' | 'label'>): DaySlot {
  return {
    state: 'empty',
    windowMin: [720, 900],
    windowLabel: '12:00 - 15:00',
    segment: null,
    filledStop: null,
    auto: false,
    drift: null,
    urgencyMin: null,
    ref: { tripId: JOURNEY_FIXTURE.tripId, dayId: JOURNEY_FIXTURE.dayId, key: overrides.key },
    candidates: [],
    reason: null,
    ...overrides,
  }
}

function makeStop(overrides: Partial<ItineraryStop> & Pick<ItineraryStop, 'id' | 'title'>): ItineraryStop {
  return {
    category: 'food',
    locationName: overrides.title,
    lat: 10.2,
    lng: 76.3,
    visitMinutes: 30,
    entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0,
    priority: 'nice-to-have',
    status: 'confirmed',
    orderInDay: 0,
    ...overrides,
  }
}

function makeDriveRow(
  hit: PlaceHit,
  overrides: Partial<DriveSuggestionRow> = {},
): DriveSuggestionRow {
  return {
    id: String(hit.id),
    hit,
    lane: 'need',
    purpose: 'meal',
    segmentIndex: 0,
    dayIndex: JOURNEY_FIXTURE.dayIndex,
    detourMin: null,
    arriveMin: null,
    arriveLabel: null,
    budgetSharePct: null,
    inWindow: null,
    reason: null,
    chips: [],
    state: 'live',
    ...overrides,
  }
}

export interface JourneyFixture {
  contextKey: string
  budgetMin: number
  tripId: string
  dayId: string
  dayIndex: number
  dayPlan: DayPlan
  driveRows: DriveSuggestionRow[]
  presence: PlaceIdentity
  hits: {
    corridor: PlaceHit
    manual: PlaceHit
    engine: PlaceHit
    unknown: PlaceHit
    sharedGoogle: PlaceHit
    sharedOsm: PlaceHit
    zero: PlaceHit
    fuel: PlaceHit
    stay: PlaceHit
  }
  stops: { fuel: ItineraryStop; stay: ItineraryStop }
  vote: SlotVote
}

/**
 * Build a fresh fixture. Inputs are new objects on every call, so a test can
 * freeze or mutate its copy without affecting another test.
 */
export function journeyFixture(): JourneyFixture {
  const corridor = makeHit({
    id: 'g-corridor',
    name: 'Corridor Cafe',
    placeId: 'g-corridor',
    source: 'google',
    category: 'cafe',
    cumKm: 41,
  })
  const manual = makeHit({ id: 'o-tea', name: 'Manual Tea Stop', source: 'osm', cumKm: 12 })
  const engine = makeHit({ id: 'w-falls', name: 'Engine Falls', source: 'wikipedia', cumKm: 28 })
  const unknown = makeHit({ id: 'u-unknown', name: 'Unknown Detour Dhaba', source: 'osm', cumKm: 55 })
  const sharedGoogle = makeHit({
    id: 1,
    name: 'Provider One Cafe',
    placeId: 'g-one',
    source: 'google',
    latitude: 10.4,
    longitude: 76.5,
  })
  const sharedOsm = makeHit({
    id: 1,
    name: 'Provider Two Fuel',
    source: 'osm',
    latitude: 9.1,
    longitude: 77.7,
  })
  const zero = makeHit({
    id: 'm-zero',
    name: 'On Route Fuel',
    eLoc: 'm-zero',
    source: 'mappls',
  })
  const fuel = makeHit({
    id: 'g-fuel',
    name: 'Filled Fuel Stop',
    placeId: 'g-fuel',
    source: 'google',
  })
  const stay = makeHit({
    id: 'g-stay',
    name: 'Filled Stay',
    placeId: 'g-stay',
    source: 'google',
  })

  const stayStop = makeStop({
    id: 'stop-stay',
    title: 'Filled Stay',
    category: 'hotel',
    placeId: 'g-stay',
    placeSource: 'google',
    lat: stay.latitude,
    lng: stay.longitude,
    visitMinutes: 600,
    arrivalTime: '20:00',
    orderInDay: 1,
  })
  const fuelStop = makeStop({
    id: 'stop-fuel',
    title: 'Filled Fuel Stop',
    category: 'rest',
    placeId: 'g-fuel',
    placeSource: 'google',
    lat: fuel.latitude,
    lng: fuel.longitude,
    visitMinutes: 25,
    arrivalTime: '13:05',
    orderInDay: 2,
  })

  const vote: SlotVote = {
    decisionId: 'dec-legacy-lunch',
    question: 'Lunch near the corridor?',
    optionCount: 2,
    votesCast: 1,
    voters: 3,
    leadingLabel: 'Corridor Cafe',
  }

  const breakfast = makeSlot({
    key: 'breakfast',
    kind: 'meal',
    label: 'Breakfast',
    windowMin: [420, 540],
    windowLabel: '07:00 - 09:00',
    candidates: [makeCandidate(engine, { detourMin: 6, budgetSharePct: 13, arriveMin: 470, arriveLabel: '07:50', inWindow: true })],
  })
  const lunch = makeSlot({
    key: 'lunch',
    kind: 'meal',
    label: 'Lunch',
    windowMin: [720, 900],
    windowLabel: '12:00 - 15:00',
    candidates: [
      makeCandidate(corridor, { detourMin: 12, detourKm: 8, budgetSharePct: 27, arriveMin: 770, arriveLabel: '12:50', inWindow: true, reason: 'Breaks a 2 h drive' }),
      makeCandidate(unknown, { detourMin: null, detourKm: null, budgetSharePct: 0 }),
    ],
    vote,
  })
  const dinner = makeSlot({
    key: 'dinner',
    kind: 'meal',
    label: 'Dinner',
    windowMin: [1140, 1320],
    windowLabel: '19:00 - 22:00',
    candidates: [makeCandidate(corridor, { detourMin: 14, detourKm: 9, budgetSharePct: 31, arriveMin: 1180, arriveLabel: '19:40', inWindow: true })],
  })
  const fuelSlot = makeSlot({
    key: 'fuel',
    kind: 'fuel',
    label: 'Fuel',
    state: 'filled',
    windowMin: null,
    windowLabel: null,
    filledStop: fuelStop,
    candidates: [],
  })
  const staySlot = makeSlot({
    key: 'stay',
    kind: 'overnight',
    label: 'Stay',
    state: 'filled',
    windowMin: null,
    windowLabel: null,
    filledStop: stayStop,
    candidates: [],
  })
  const stretch = makeSlot({
    key: 'stretch',
    kind: 'stretch',
    label: 'Stretch',
    state: 'auto',
    auto: true,
    windowMin: null,
    windowLabel: 'auto',
    reason: 'Engine-managed stretch',
    candidates: [],
  })

  const dayPlan = buildDayPlan({
    dayIndex: JOURNEY_FIXTURE.dayIndex,
    slots: [breakfast, lunch, dinner, fuelSlot, staySlot, stretch],
    tripId: JOURNEY_FIXTURE.tripId,
    dayId: JOURNEY_FIXTURE.dayId,
    manual: { breakfast: [makeCandidate(manual, { detourMin: 3, budgetSharePct: 7, arriveMin: 445, arriveLabel: '07:25', inWindow: true })] },
    identity: null,
  })

  const driveRows: DriveSuggestionRow[] = [
    makeDriveRow(corridor, { purpose: 'meal', segmentIndex: 1, detourMin: 12, reason: 'Breaks a 2 h drive' }),
    makeDriveRow(fuel, { purpose: 'fuel', segmentIndex: 2, detourMin: 4 }),
    makeDriveRow(sharedGoogle, { purpose: 'sight', segmentIndex: 3, detourMin: null }),
    makeDriveRow(sharedOsm, { purpose: 'fuel', segmentIndex: 4, detourMin: 0 }),
    makeDriveRow(zero, { purpose: 'fuel', segmentIndex: 5, detourMin: 0 }),
  ]

  const presence = placeIdentity({
    days: [{ id: JOURNEY_FIXTURE.dayId, index: JOURNEY_FIXTURE.dayIndex, stops: [stayStop] }],
  })

  return {
    contextKey: JOURNEY_FIXTURE.contextKey,
    budgetMin: JOURNEY_FIXTURE.budgetMin,
    tripId: JOURNEY_FIXTURE.tripId,
    dayId: JOURNEY_FIXTURE.dayId,
    dayIndex: JOURNEY_FIXTURE.dayIndex,
    dayPlan,
    driveRows,
    presence,
    hits: { corridor, manual, engine, unknown, sharedGoogle, sharedOsm, zero, fuel, stay },
    stops: { fuel: fuelStop, stay: stayStop },
    vote,
  }
}

/** Freeze an input graph so a projection run that mutated it would throw. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) {
      const child = (value as Record<string, unknown>)[key]
      if (child && typeof child === 'object') deepFreeze(child)
    }
  }
  return value
}
