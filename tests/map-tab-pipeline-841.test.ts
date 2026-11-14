// ============ #841 — MapTab wired to the shared day-slot pipeline ============
//
// These tests drive the functions the MapTab page calls, not look-alikes:
//   road grade     -> measuredRoadFacts (real buildRoadChain / resolvedLegs)
//   rows and vote  -> buildDayPlan + slotRowsOf + slotVoteReady + voteSelection
//                     + batchSelection over the stable manual store
//   slot search    -> runSlotSearchFlow + createSlotSearchGuard
//   arc Add all    -> arcPickPlan + stageArcAdd + arcCompletionEffects over the
//                     real stageWriterPicks, operation gate, reviewed planner
//                     and guardedUndo
//
// The workspace, the persistence receipt and the provider transport are
// CONTROLLED: `applyChange` stages the real mutator into a clone and the test
// decides when (and whether) the save is acknowledged; the search transport is
// a deferred promise the test settles late. No placement, grading or guard
// decision is mocked.
//
// Known-bad controls reproduce the shortcuts this wiring replaces (line existence
// read as measured, a sequence-only search guard, the arc's own splice loop with
// success before the save) so a green run cannot hide the defect.
//
// Supplement only: source tripwires at the end confirm MapTab calls these paths.
// Browser, signed-in and native acceptance are NOT claimed here.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { ItineraryDay, ItineraryStop, Trip } from '../src/data/types'
import type { PlaceHit } from '../src/lib/providers/hits'
import type { RoadLeg } from '../src/lib/routing'
import { buildRoadChain, roadChainSig, type RoadStatus } from '../src/lib/tripRoad'
import type { DaySlot } from '../src/lib/daySlots'
import { batchSelection, buildDayPlan, effectiveDaySlotOf, planCounts, voteSelection } from '../src/lib/dayPlan'
import {
  guardedUndo,
  stageWriterPicks,
  type WriterApplyChange,
  type WriterCompletion,
  type WriterReceipt,
} from '../src/pages/trip/map/mapWriterActions'
import { createWriterOperationGate } from '../src/pages/trip/map/writerOperationGate'
import {
  createManualSlotStore,
  createSlotSearchGuard,
  manualContextForSlot,
} from '../src/pages/trip/map/manualSlotContexts'
import {
  arcCompletionEffects,
  arcPickPlan,
  arcStageLine,
  arcUndoLine,
  stageArcAdd,
} from '../src/pages/trip/map/arcAdd'
import {
  measuredRoadFacts,
  runSlotSearchFlow,
  SLOT_SEARCH_FAILED_COPY,
  SLOT_SEARCH_QUOTA_COPY,
  slotRowsOf,
  slotSearchScopeKey,
  slotVoteReady,
  stableDayIdFor,
  type SlotSearchPatch,
} from '../src/pages/trip/map/mapTabPipeline'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const TRIP_ID = 'trip-tab-841'
const DAY_A = 'day-a'
const DAY_B = 'day-b'
const RECEIPT: WriterReceipt = { kind: 'acknowledged', revision: 'rev-3', writeVersion: 3 }
const baseTrip = structuredClone(seedData.trips[0])

function stop(id: string, title: string, lat: number, lng: number, over: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id, title, category: 'sightseeing', locationName: title, lat, lng, visitMinutes: 30,
    entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have', status: 'confirmed',
    orderInDay: 0, ...over,
  }
}
function day(id: string, index: number, stops: ItineraryStop[]): ItineraryDay {
  return { id, index, title: id, stops: stops.map((s, i) => ({ ...s, orderInDay: i + 1 })) }
}
function tripWith(days: ItineraryDay[], over: Partial<Trip> = {}): Trip {
  return {
    ...structuredClone(baseTrip), id: TRIP_ID, name: 'tab 841', transportMode: 'car',
    startLocationCoords: { lat: 9.9, lng: 69.9 }, destinationCoords: [], roundTrip: false, days, ...over,
  } as Trip
}
function hit(id: string, name: string, lat: number, lng: number, over: Partial<PlaceHit> = {}): PlaceHit {
  return { id, name, latitude: lat, longitude: lng, kind: 'poi', category: 'food', ...over }
}
const osrmLeg = (): RoadLeg => ({ distanceKm: 10, durationMinutes: 12, source: 'osrm', geometry: [[70, 10], [70.1, 10.1]] })
const estimateLeg = (): RoadLeg => ({ distanceKm: 10, durationMinutes: 12, source: 'estimate', geometry: [] })

// ---------------------------------------------------------------- road grade

describe('#841 MapTab grades the measured road from the workspace measurement', () => {
  const trip = tripWith([day(DAY_A, 0, [stop('a1', 'A1', 10, 70), stop('a2', 'A2', 10.6, 70.6)])])
  const chain = buildRoadChain(trip)
  const legs = chain.points.slice(1).map(osrmLeg)
  const ok = (over: Partial<{ status: RoadStatus; chain: typeof chain | null; legs: RoadLeg[] | null }> = {}) => ({
    status: 'ok' as RoadStatus, chain, legs, ...over,
  })

  it('is measured only for a finished, real, current measurement, and carries the chain signature', () => {
    const grade = measuredRoadFacts({ trip, road: ok(), hasLine: true })
    expect(grade).toEqual({ measured: true, routeKey: roadChainSig(trip) })
  })

  it('a line that merely exists is never measured (known-bad control: line = measured)', () => {
    // The pre-wiring guess: "there is a polyline, so the road is measured".
    const lineMeansMeasured = (hasLine: boolean) => hasLine
    for (const road of [
      ok({ status: 'pending' }),
      ok({ status: 'failed' }),
      ok({ legs: null }),
      ok({ chain: null }),
      ok({ legs: chain.points.slice(1).map(estimateLeg) }),
    ]) {
      expect(lineMeansMeasured(true)).toBe(true)
      const grade = measuredRoadFacts({ trip, road, hasLine: true })
      expect(grade.measured).toBe(false)
      expect(grade.routeKey).toBeNull()
    }
    expect(measuredRoadFacts({ trip, road: null, hasLine: true }).measured).toBe(false)
    expect(measuredRoadFacts({ trip, road: undefined, hasLine: true }).measured).toBe(false)
  })

  it('names why it is not measured', () => {
    const reason = (road: Parameters<typeof measuredRoadFacts>[0]['road'], hasLine = true) => {
      const grade = measuredRoadFacts({ trip, road, hasLine })
      return grade.measured ? 'measured' : grade.reason
    }
    expect(reason(ok({ status: 'pending' }))).toBe('pending')
    expect(reason(ok({ status: 'failed' }))).toBe('failed')
    expect(reason(ok({ legs: chain.points.slice(1).map(estimateLeg) }))).toBe('estimate-only')
    expect(reason(ok(), false)).toBe('no-line')
    expect(reason(null)).toBe('no-measurement')
  })

  it('a chain measured before a stop was added is stale and refuses', () => {
    const edited = tripWith([day(DAY_A, 0, [stop('a1', 'A1', 10, 70), stop('a1b', 'New', 10.3, 70.3), stop('a2', 'A2', 10.6, 70.6)])])
    const grade = measuredRoadFacts({ trip: edited, road: ok(), hasLine: true })
    expect(grade).toMatchObject({ measured: false, reason: 'stale-chain' })
  })

  it('a stop that moved after the measurement is stale', () => {
    const moved = tripWith([day(DAY_A, 0, [stop('a1', 'A1', 10, 70), stop('a2', 'A2', 10.7, 70.7)])])
    expect(measuredRoadFacts({ trip: moved, road: ok(), hasLine: true })).toMatchObject({ measured: false, reason: 'stale-chain' })
  })

  it('an air journey never counts as a measured road', () => {
    const air = tripWith(trip.days, { transportMode: 'flight' } as Partial<Trip>)
    expect(measuredRoadFacts({ trip: air, road: ok(), hasLine: true })).toMatchObject({ measured: false, reason: 'air-journey' })
  })

  it('maps day index to the persisted day id by the day own index, not its position', () => {
    const sparse = tripWith([day('first', 0, []), day('third', 2, []), day('fourth', 3, [])])
    expect(stableDayIdFor(sparse, 2)).toBe('third')
    expect(stableDayIdFor(sparse, 1)).toBeUndefined()
    expect(stableDayIdFor(sparse, null)).toBeUndefined()
    expect(stableDayIdFor(sparse, undefined)).toBeUndefined()
  })
})

// ------------------------------------------------- rows, vote and batch parity

function emptySlot(key: 'lunch' | 'dinner', dayId: string, candidates: DaySlot['candidates'] = []): DaySlot {
  return {
    key, kind: 'meal', label: key === 'lunch' ? 'Lunch' : 'Dinner', state: 'empty',
    windowMin: key === 'lunch' ? [720, 900] : [1140, 1320],
    windowLabel: key === 'lunch' ? '12:00 - 15:00' : '19:00 - 22:00',
    segment: null, filledStop: null, auto: false, drift: null, urgencyMin: null,
    ref: { tripId: TRIP_ID, dayId, key }, reason: null, candidates,
  }
}

describe('#841 the rendered rows, the vote button and the batch read one effective list', () => {
  const PLACE_ONE = hit('m-1', 'Tea House', 10.2, 70.2)
  const PLACE_TWO = hit('m-2', 'Spice Kitchen', 10.3, 70.3)
  const shapes = { detourMin: () => 7, detourKm: () => 2 }

  function planFor(store: ReturnType<typeof createManualSlotStore>, dayId: string, dayIndex: number) {
    return buildDayPlan({
      dayIndex,
      slots: [emptySlot('lunch', dayId), emptySlot('dinner', dayId)],
      tripId: TRIP_ID,
      dayId,
      manual: store.candidatesBySlot({ tripId: TRIP_ID, dayId }, shapes),
    })
  }

  it('a manual-only pair renders two rows, offers the vote, and the vote and batch name those places', () => {
    const store = createManualSlotStore()
    const context = manualContextForSlot(emptySlot('lunch', DAY_A))!
    expect(store.file(context, PLACE_ONE)).toBe('filed')
    expect(store.file(context, PLACE_TWO)).toBe('filed')
    const plan = planFor(store, DAY_A, 0)

    const rows = slotRowsOf(plan, 'lunch')
    expect(rows.map(row => row.hit.id)).toEqual(['m-1', 'm-2'])
    expect(planCounts(plan).fillable).toBe(1)
    expect(slotVoteReady(plan, 'lunch')).toBe(true)

    const effective = effectiveDaySlotOf(plan, 'lunch')!
    const vote = voteSelection(effective)
    expect(vote.canRaise).toBe(true)
    expect(vote.options.map(option => option.hit.id)).toEqual(rows.map(row => row.hit.id))

    const batch = batchSelection(plan)
    expect(batch.items.map(item => [item.slotKey, item.candidate.hit.id])).toEqual([['lunch', 'm-1']])
  })

  it('one manual pick is a row and a fill candidate but does not offer a vote of one', () => {
    const store = createManualSlotStore()
    store.file(manualContextForSlot(emptySlot('lunch', DAY_A))!, PLACE_ONE)
    const plan = planFor(store, DAY_A, 0)
    expect(slotRowsOf(plan, 'lunch')).toHaveLength(1)
    expect(slotVoteReady(plan, 'lunch')).toBe(false)
    expect(batchSelection(plan).items).toHaveLength(1)
  })

  it('a pick filed on one day never appears in another day (known-bad: bare slot key)', () => {
    const store = createManualSlotStore()
    store.file(manualContextForSlot(emptySlot('lunch', DAY_A))!, PLACE_ONE)
    store.file(manualContextForSlot(emptySlot('lunch', DAY_A))!, PLACE_TWO)
    // The pre-wiring bucket: keyed by the slot key alone, shared by every day.
    const bareBucket: Record<string, PlaceHit[]> = { lunch: [PLACE_ONE, PLACE_TWO] }
    expect(bareBucket.lunch).toHaveLength(2)
    const planB = planFor(store, DAY_B, 1)
    expect(slotRowsOf(planB, 'lunch')).toHaveLength(0)
    expect(slotVoteReady(planB, 'lunch')).toBe(false)
    expect(batchSelection(planB).items).toHaveLength(0)
  })

  it('switching away and back keeps the picks', () => {
    const store = createManualSlotStore()
    store.file(manualContextForSlot(emptySlot('lunch', DAY_A))!, PLACE_ONE)
    planFor(store, DAY_B, 1)
    expect(slotRowsOf(planFor(store, DAY_A, 0), 'lunch').map(row => row.hit.id)).toEqual(['m-1'])
  })

  it('a verified placement drops only the placed pick', () => {
    const store = createManualSlotStore()
    const context = manualContextForSlot(emptySlot('lunch', DAY_A))!
    store.file(context, PLACE_ONE)
    store.file(context, PLACE_TWO)
    store.dropPlaced(context, [PLACE_ONE])
    expect(slotRowsOf(planFor(store, DAY_A, 0), 'lunch').map(row => row.hit.id)).toEqual(['m-2'])
  })
})

// -------------------------------------------------------- slot search by context

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('#841 the slot search drops answers that belong to another context', () => {
  const lunchA = emptySlot('lunch', DAY_A)
  const lunchB = emptySlot('lunch', DAY_B)
  const FOUND = [hit('s-1', 'Found Cafe', 10, 70)]

  function run(input: {
    guard: ReturnType<typeof createSlotSearchGuard>
    slot: DaySlot
    transport: ReturnType<typeof deferred<PlaceHit[]>>
    patches: SlotSearchPatch[]
    controller?: AbortController
    quota?: boolean
    empty?: string[]
  }) {
    return runSlotSearchFlow({
      guard: input.guard,
      slot: input.slot,
      query: 'cafe',
      controller: input.controller ?? new AbortController(),
      search: () => input.transport.promise,
      rank: hits => hits,
      isQuotaError: () => input.quota === true,
      commit: patch => { input.patches.push(patch) },
      onEmpty: query => { input.empty?.push(query) },
    })
  }

  it('commits rows for the current context', async () => {
    const guard = createSlotSearchGuard()
    const transport = deferred<PlaceHit[]>()
    const patches: SlotSearchPatch[] = []
    const flow = run({ guard, slot: lunchA, transport, patches })
    transport.resolve(FOUND)
    await expect(flow).resolves.toBe('found')
    expect(patches).toEqual([{ busy: false, hits: FOUND }])
  })

  it('a day switch retires the query: late rows are not filed (same slot key on another day)', async () => {
    const guard = createSlotSearchGuard()
    const transport = deferred<PlaceHit[]>()
    const patches: SlotSearchPatch[] = []
    const flow = run({ guard, slot: lunchA, transport, patches })
    // The page effect on [openSlotKey, activeDayId, trip.id] resets the guard.
    guard.reset()
    transport.resolve(FOUND)
    await expect(flow).resolves.toBe('stale')
    expect(patches).toEqual([])
  })

  it('a late error from the old day does not overwrite the new day (no error, no busy reset)', async () => {
    const guard = createSlotSearchGuard()
    const oldTransport = deferred<PlaceHit[]>()
    const newTransport = deferred<PlaceHit[]>()
    const oldPatches: SlotSearchPatch[] = []
    const newPatches: SlotSearchPatch[] = []
    const oldFlow = run({ guard, slot: lunchA, transport: oldTransport, patches: oldPatches })
    // The user moves to Day B and searches that day's lunch right away.
    guard.reset()
    const newFlow = run({ guard, slot: lunchB, transport: newTransport, patches: newPatches })
    newTransport.resolve(FOUND)
    await expect(newFlow).resolves.toBe('found')
    oldTransport.reject(new Error('boom'))
    await expect(oldFlow).resolves.toBe('stale')
    expect(oldPatches).toEqual([])
    expect(newPatches).toEqual([{ busy: false, hits: FOUND }])
  })

  it('a newer query in the same context supersedes the older one', async () => {
    const guard = createSlotSearchGuard()
    const first = deferred<PlaceHit[]>()
    const second = deferred<PlaceHit[]>()
    const firstPatches: SlotSearchPatch[] = []
    const secondPatches: SlotSearchPatch[] = []
    const firstFlow = run({ guard, slot: lunchA, transport: first, patches: firstPatches })
    const secondFlow = run({ guard, slot: lunchA, transport: second, patches: secondPatches })
    second.resolve(FOUND)
    first.resolve([hit('old', 'Old Result', 1, 1)])
    await expect(secondFlow).resolves.toBe('found')
    await expect(firstFlow).resolves.toBe('stale')
    expect(firstPatches).toEqual([])
    expect(secondPatches).toEqual([{ busy: false, hits: FOUND }])
  })

  it('an aborted request is stale, never an error', async () => {
    const guard = createSlotSearchGuard()
    const transport = deferred<PlaceHit[]>()
    const patches: SlotSearchPatch[] = []
    const controller = new AbortController()
    const flow = run({ guard, slot: lunchA, transport, patches, controller })
    controller.abort()
    transport.reject(new DOMException('aborted', 'AbortError'))
    await expect(flow).resolves.toBe('stale')
    expect(patches).toEqual([])
  })

  it('keeps the quota and failure copy for the current context', async () => {
    const quotaGuard = createSlotSearchGuard()
    const quota = deferred<PlaceHit[]>()
    const quotaPatches: SlotSearchPatch[] = []
    const quotaFlow = run({ guard: quotaGuard, slot: lunchA, transport: quota, patches: quotaPatches, quota: true })
    quota.reject(new Error('cap'))
    await expect(quotaFlow).resolves.toBe('failed')
    expect(quotaPatches).toEqual([{ busy: false, err: SLOT_SEARCH_QUOTA_COPY }])
    expect(SLOT_SEARCH_QUOTA_COPY).toBe('Google Places · Monthly limit reached')

    const failGuard = createSlotSearchGuard()
    const failure = deferred<PlaceHit[]>()
    const failPatches: SlotSearchPatch[] = []
    const failFlow = run({ guard: failGuard, slot: lunchA, transport: failure, patches: failPatches })
    failure.reject(new Error('network'))
    await expect(failFlow).resolves.toBe('failed')
    expect(failPatches).toEqual([{ busy: false, err: SLOT_SEARCH_FAILED_COPY }])
    expect(SLOT_SEARCH_FAILED_COPY).toBe('Search · Failed · Retry')
  })

  it('an empty answer reports the query once and commits an empty list', async () => {
    const guard = createSlotSearchGuard()
    const transport = deferred<PlaceHit[]>()
    const patches: SlotSearchPatch[] = []
    const empty: string[] = []
    const flow = run({ guard, slot: lunchA, transport, patches, empty })
    transport.resolve([])
    await expect(flow).resolves.toBe('empty')
    expect(empty).toEqual(['cafe'])
    expect(patches).toEqual([{ busy: false, hits: [] }])
  })

  it('a slot without a stable day does not start a search', async () => {
    const guard = createSlotSearchGuard()
    const patches: SlotSearchPatch[] = []
    const outcome = await runSlotSearchFlow({
      guard,
      slot: { ...lunchA, ref: null },
      query: 'cafe',
      controller: new AbortController(),
      search: async () => { throw new Error('must not be called') },
      rank: hits => hits,
      isQuotaError: () => false,
      commit: patch => { patches.push(patch) },
    })
    expect(outcome).toBe('no-context')
    expect(guard.current()).toBeNull()
    expect(patches).toEqual([])
  })

  it('known-bad control: a sequence-only guard files a day-A answer into day B', async () => {
    // The pre-wiring rule: bump a counter when the OPEN PART changes. A day
    // switch keeps the same part key, so the counter never moved.
    let seq = 0
    const stateByKey: Record<string, string[]> = { lunch: [] }
    const mySeq = ++seq
    const answer = deferred<string[]>()
    const oldRunner = answer.promise.then(rows => { if (mySeq === seq) stateByKey.lunch = rows })
    // Day switch: same slot key 'lunch', openSlotKey unchanged, no bump.
    answer.resolve(['Day A cafe'])
    await oldRunner
    expect(stateByKey.lunch).toEqual(['Day A cafe'])
  })

  it('scopes the rendered query by trip and stable day', () => {
    expect(slotSearchScopeKey(TRIP_ID, DAY_A)).not.toBe(slotSearchScopeKey(TRIP_ID, DAY_B))
    expect(slotSearchScopeKey('other', DAY_A)).not.toBe(slotSearchScopeKey(TRIP_ID, DAY_A))
    expect(slotSearchScopeKey(TRIP_ID, undefined)).toBe(slotSearchScopeKey(TRIP_ID, undefined))
  })
})

// ------------------------------------------------------------------ arc Add all

describe('#841 the arc Add all goes through the shared writer', () => {
  const START = stop('a-start', 'Start', 10, 70)
  const END = stop('a-end', 'Night halt', 10.8, 70.8)
  const B_START = stop('b-start', 'B start', 11.2, 71.2)
  const B_END = stop('b-end', 'B end', 11.8, 71.8)
  const ARC_EARLY = hit('arc-early', 'Early Fort', 10.2, 70.2, { category: 'sightseeing', cumKm: 20 })
  const ARC_LATE = hit('arc-late', 'Late Falls', 10.6, 70.6, { category: 'sightseeing', cumKm: 60 })
  const ARC_B = hit('arc-b', 'Day B Temple', 11.5, 71.5, { category: 'sightseeing', cumKm: 90 })
  const ARC_NO_POS = hit('arc-lost', 'Unplaced Viewpoint', 12, 72, { category: 'sightseeing' })

  const km = new Map<string, number>([
    ['10,70', 0], ['10.2,70.2', 20], ['10.6,70.6', 60], ['10.8,70.8', 80],
    ['11.2,71.2', 85], ['11.5,71.5', 90], ['11.8,71.8', 100],
  ])
  const routeKmOf = (lat: number, lng: number) => km.get(`${lat},${lng}`) ?? null
  const dayForKm = (value: number | null | undefined): number | null => {
    if (value == null) return null
    return value < 82 ? 0 : 1
  }
  const dayIdForIndex = (index: number) => ({ 0: DAY_A, 1: DAY_B } as Record<number, string>)[index]

  function trip2(): Trip {
    return tripWith([day(DAY_A, 0, [START, END]), day(DAY_B, 1, [B_START, B_END])])
  }

  function workspace(initial: Trip) {
    let current = initial
    let pending: { proposed: Trip; onKept?: (receipt?: WriterReceipt) => void; operation?: { id: string; onDiscard?: () => void; onUncertain?: () => void } } | null = null
    let staged = 0
    const applyChange: WriterApplyChange = (mutator, _kind, _dayIndex, onKept, operation) => {
      const proposed = structuredClone(current)
      mutator(proposed)
      pending = { proposed, ...(onKept ? { onKept } : {}), ...(operation ? { operation } : {}) }
      staged += 1
    }
    return {
      applyChange,
      current: () => current,
      staged: () => staged,
      hasPending: () => pending != null,
      /** Persist the staged proposal (or a test-edited copy), then run Keep. */
      keep: (receipt?: WriterReceipt, edit?: (saved: Trip) => void) => {
        const open = pending
        if (!open) throw new Error('nothing staged')
        current = open.proposed
        if (edit) { current = structuredClone(current); edit(current) }
        pending = null
        open.onKept?.(receipt)
      },
      discard: () => { const open = pending; pending = null; open?.operation?.onDiscard?.() },
      /** The admitted save is not confirmed (offline, refused, slow). The real
       *  workspace delivers this through the operation's uncertainty
       *  notification, never through the kept callback. */
      unconfirmed: () => {
        const open = pending
        if (!open) throw new Error('nothing staged')
        pending = null
        open.operation?.onUncertain?.()
      },
    }
  }

  function setup(input: { road?: { routeKey: string } | null } = {}) {
    const ws = workspace(trip2())
    const gate = createWriterOperationGate()
    const completions: WriterCompletion[] = []
    let n = 0
    const deps = {
      trip: ws.current(),
      applyChange: ws.applyChange,
      resolvePick: async (h: PlaceHit) => h,
      mintStopId: () => `arc-stop-${++n}`,
      gate,
      routeKmOf,
      road: input.road === undefined ? { routeKey: 'route-1' } : input.road,
      currentTrip: ws.current,
      poiVisitMinutes: () => 40,
      onCompletion: (completion: WriterCompletion) => { completions.push(completion) },
    }
    const plan = (hits = [ARC_LATE, ARC_EARLY, ARC_B]) => arcPickPlan({
      hitIds: hits.map(h => h.id),
      arcHits: [ARC_EARLY, ARC_LATE, ARC_B, ARC_NO_POS],
      isAdded: () => false,
      dayForKm,
      dayIdForIndex,
    })
    return { ws, gate, completions, deps, plan }
  }

  const titlesOf = (trip: Trip, dayId: string) => trip.days.find(d => d.id === dayId)!.stops.map(s => s.title)

  it('targets each place at its own stable day and never falls back to Day 1', () => {
    const { plan } = setup()
    const built = arcPickPlan({
      hitIds: ['arc-early', 'arc-b', 'arc-lost', 'missing', 'arc-late'],
      arcHits: [ARC_EARLY, ARC_LATE, ARC_B, ARC_NO_POS],
      isAdded: h => h.id === 'arc-late',
      dayForKm,
      dayIdForIndex,
    })
    expect(built.picks.map(p => [p.hit.id, p.dayId, p.dayIndex])).toEqual([
      ['arc-early', DAY_A, 0],
      ['arc-b', DAY_B, 1],
    ])
    expect(built.unresolved).toEqual([
      { id: 'arc-lost', name: 'Unplaced Viewpoint', reason: 'no-road-position' },
      { id: 'missing', name: null, reason: 'not-found' },
    ])
    expect(built.alreadyPlanned).toBe(1)
    expect(plan().picks).toHaveLength(3)

    const noStableDay = arcPickPlan({
      hitIds: ['arc-early'], arcHits: [ARC_EARLY], isAdded: () => false, dayForKm, dayIdForIndex: () => undefined,
    })
    expect(noStableDay.picks).toEqual([])
    expect(noStableDay.unresolved[0].reason).toBe('no-stable-day')
  })

  it('stages in road order for every day, and staging alone adds nothing', async () => {
    const { ws, gate, completions, deps, plan } = setup()
    const outcome = await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan() })
    expect(outcome.status).toBe('staged')
    expect(ws.staged()).toBe(1)
    expect(ws.hasPending()).toBe(true)
    // No completion yet: nothing is added, no DNA, no Undo, no success line.
    expect(completions).toHaveLength(0)
    expect(gate.reservations().length).toBeGreaterThan(0)
    // The saved trip is untouched until the save is acknowledged.
    expect(titlesOf(ws.current(), DAY_A)).toEqual(['Start', 'Night halt'])
    expect(arcStageLine('Fort trail', outcome).text).toContain('Keep to save')
    expect(arcStageLine('Fort trail', outcome).text).not.toMatch(/added/)
  })

  it('an acknowledged save adds exactly the verified places, in road order, and Undo is guarded', async () => {
    const { ws, completions, deps, plan } = setup()
    // Pass the late place first: the shared planner must still order by road km.
    await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan([ARC_LATE, ARC_EARLY, ARC_B]) })
    ws.keep(RECEIPT)
    expect(completions).toHaveLength(1)
    const completion = completions[0]
    expect(completion.acknowledged).toBe(true)
    expect(titlesOf(ws.current(), DAY_A)).toEqual(['Start', 'Early Fort', 'Late Falls', 'Night halt'])
    expect(titlesOf(ws.current(), DAY_B)).toEqual(['B start', 'Day B Temple', 'B end'])

    const effects = arcCompletionEffects('Fort trail', completion)
    expect(effects.addedIds.sort()).toEqual(['arc-b', 'arc-early', 'arc-late'])
    expect(effects.dnaHits.map(h => h.id).sort()).toEqual(['arc-b', 'arc-early', 'arc-late'])
    expect(effects.line).toEqual({ text: '“Fort trail” added (3 stops)', tone: 'ok' })
    expect(effects.undoStops.map(s => s.stopId).sort()).toEqual(['arc-stop-1', 'arc-stop-2', 'arc-stop-3'])

    // Undo removes only the acknowledged stops and keeps an unrelated edit.
    const savedWithEdit = structuredClone(ws.current())
    savedWithEdit.days[0].stops.find(s => s.title === 'Night halt')!.notes = 'booked'
    let admitted: Trip | null = null
    const undone = await guardedUndo(
      { currentTrip: () => savedWithEdit, admit: async ({ patch }) => { admitted = patch; return RECEIPT } },
      { tripId: TRIP_ID, operationId: completion.operationId, stops: effects.undoStops },
    )
    expect(undone.status).toBe('undone')
    expect(titlesOf(admitted!, DAY_A)).toEqual(['Start', 'Night halt'])
    expect(admitted!.days[0].stops.find(s => s.title === 'Night halt')!.notes).toBe('booked')
    expect(arcUndoLine('Fort trail', undone).tone).toBe('ok')
  })

  it('Undo refuses a stop that was edited after the save', async () => {
    const { ws, completions, deps, plan } = setup()
    await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan([ARC_EARLY]) })
    ws.keep(RECEIPT)
    const effects = arcCompletionEffects('Fort trail', completions[0])
    const edited = structuredClone(ws.current())
    // A stop that was renamed is no longer the one the operation saved. (Edits to
    // visit minutes and notes are the writer guard's own contract, not MapTab's.)
    edited.days[0].stops.find(s => s.title === 'Early Fort')!.title = 'Renamed Fort'
    let called = false
    const outcome = await guardedUndo(
      { currentTrip: () => edited, admit: async () => { called = true; return RECEIPT } },
      { tripId: TRIP_ID, operationId: completions[0].operationId, stops: effects.undoStops },
    )
    expect(outcome.status).toBe('refused')
    expect(called).toBe(false)
    expect(arcUndoLine('Fort trail', outcome)).toMatchObject({ tone: 'err' })
  })

  it('a missing receipt is not success: no added ids, no DNA, no Undo', async () => {
    const { ws, completions, deps, plan } = setup()
    await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan() })
    ws.unconfirmed()
    const effects = arcCompletionEffects('Fort trail', completions[0])
    expect(completions[0].acknowledged).toBe(false)
    expect(effects.addedIds).toEqual([])
    expect(effects.dnaHits).toEqual([])
    expect(effects.undoStops).toEqual([])
    expect(effects.line.tone).toBe('err')
    expect(effects.line.text).toMatch(/Unconfirmed/)
  })

  it('an acknowledged receipt with zero verified stops does not say the save landed (F3)', async () => {
    const { ws, completions, deps, plan } = setup()
    await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan([ARC_EARLY]) })
    ws.keep(RECEIPT, saved => {
      // The receipt is real, but the saved trip carries none of this operation's stops.
      saved.days[0].stops = saved.days[0].stops.filter(s => s.title !== 'Early Fort')
    })
    const effects = arcCompletionEffects('Fort trail', completions[0])
    expect(completions[0].placed).toHaveLength(0)
    expect(effects.addedIds).toEqual([])
    expect(effects.undoStops).toEqual([])
    expect(effects.line.tone).toBe('err')
    expect(effects.line.text).not.toMatch(/landed/)
    expect(effects.line.text).toMatch(/Stops unverified/)
  })

  it('an unconfirmed Undo never promises the plan is unchanged (F4)', () => {
    const line = arcUndoLine('Fort trail', { status: 'not-admitted', reason: 'unconfirmed' })
    expect(line.tone).toBe('err')
    expect(line.text).not.toMatch(/not changed|unchanged/i)
    expect(line.text).toContain('Saved edits')
  })

  it('an acknowledged save where one stop did not arrive only counts the verified one', async () => {
    const { ws, completions, deps, plan } = setup()
    await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan([ARC_EARLY, ARC_LATE]) })
    ws.keep(RECEIPT, saved => {
      // The saved trip lost the late stop (for example a concurrent edit).
      saved.days[0].stops = saved.days[0].stops.filter(s => s.title !== 'Late Falls')
    })
    const effects = arcCompletionEffects('Fort trail', completions[0])
    expect(completions[0].phase).toBe('partial')
    expect(effects.addedIds).toEqual(['arc-early'])
    expect(effects.dnaHits.map(h => h.id)).toEqual(['arc-early'])
    expect(effects.undoStops).toHaveLength(1)
    expect(effects.retained).toBe(1)
    expect(effects.line.text).toContain('stayed in the list with a reason')
  })

  it('a discarded preview leaves no ghost: nothing was added, the reservation is released, the arc can run again', async () => {
    const { ws, gate, completions, deps, plan } = setup()
    await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan() })
    expect(gate.reservations().length).toBeGreaterThan(0)
    ws.discard()
    expect(completions).toHaveLength(0)
    expect(gate.reservations()).toHaveLength(0)
    expect(titlesOf(ws.current(), DAY_A)).toEqual(['Start', 'Night halt'])
    const again = await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan() })
    expect(again.status).toBe('staged')
  })

  it('a second Add all for the same places is refused while the first is open', async () => {
    const { gate, deps, plan } = setup()
    await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan() })
    const second = await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan() })
    expect(second.status === 'refused' ? second.reason : second.status).toBe('gate-busy')
    expect(arcStageLine('Fort trail', second).tone).toBe('err')
    expect(gate.reservations().length).toBeGreaterThan(0)
  })

  it('retrying an unconfirmed save resumes the same operation and mints no new stop ids', async () => {
    const { ws, completions, deps, plan } = setup()
    const first = await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan([ARC_EARLY]) })
    ws.unconfirmed()
    expect(completions[0].acknowledged).toBe(false)
    const retry = await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan([ARC_EARLY]) })
    expect(first.status).toBe('staged')
    expect(retry.status).toBe('staged')
    if (first.status !== 'staged' || retry.status !== 'staged') return
    expect(retry.result.operationId).toBe(first.result.operationId)
    expect(retry.result.planned.map(p => p.plan.stop.id)).toEqual(first.result.planned.map(p => p.plan.stop.id))
  })

  it('without measured road evidence nothing is staged and the places stay (known-bad: own splice loop)', async () => {
    const { ws, gate, deps, plan } = setup({ road: null })
    const outcome = await stageArcAdd(deps, { tripId: TRIP_ID, plan: plan() })
    expect(outcome.status).toBe('refused')
    if (outcome.status === 'refused') expect(outcome.reason).toBe('road-evidence-unavailable')
    expect(ws.staged()).toBe(0)
    expect(gate.reservations()).toHaveLength(0)

    // The removed loop appended at the end of the day when it had no position.
    const day = structuredClone(trip2().days[0])
    day.stops.push(stop('old', 'Old append', 10.2, 70.2))
    expect(day.stops.map(s => s.title)).toEqual(['Start', 'Night halt', 'Old append'])
  })

  it('places that cannot be targeted stay unresolved and the staged result still reports the rest', async () => {
    const { deps } = setup()
    const mixed = arcPickPlan({
      hitIds: ['arc-early', 'arc-lost'],
      arcHits: [ARC_EARLY, ARC_NO_POS],
      isAdded: () => false,
      dayForKm,
      dayIdForIndex,
    })
    const outcome = await stageArcAdd(deps, { tripId: TRIP_ID, plan: mixed })
    expect(outcome.status).toBe('staged')
    expect(arcStageLine('Fort trail', outcome).text).toMatch(/Picks retained: 1/)
    const onlyLost = arcPickPlan({ hitIds: ['arc-lost'], arcHits: [ARC_NO_POS], isAdded: () => false, dayForKm, dayIdForIndex })
    const nothing = await stageArcAdd(deps, { tripId: TRIP_ID, plan: onlyLost })
    expect(nothing.status).toBe('nothing')
    expect(arcStageLine('Fort trail', nothing)).toMatchObject({ tone: 'err' })
  })

  it('a day that reconcile removed mid-scan is skipped with a reason and the rest still lands (#563)', async () => {
    const { ws, completions, deps } = setup()
    const withGhostDay = arcPickPlan({
      hitIds: ['arc-early', 'arc-b'],
      arcHits: [ARC_EARLY, ARC_B],
      isAdded: () => false,
      dayForKm,
      dayIdForIndex: index => (index === 0 ? DAY_A : 'day-removed'),
    })
    const outcome = await stageArcAdd(deps, { tripId: TRIP_ID, plan: withGhostDay })
    expect(outcome.status).toBe('staged')
    if (outcome.status !== 'staged') return
    expect(outcome.result.planned.map(item => item.hit.id)).toEqual(['arc-early'])
    expect(outcome.result.skipped.map(item => item.reason)).toContain('missing-day')
    ws.keep(RECEIPT)
    expect(arcCompletionEffects('Fort trail', completions[0]).addedIds).toEqual(['arc-early'])
    expect(titlesOf(ws.current(), DAY_A)).toEqual(['Start', 'Early Fort', 'Night halt'])
  })

  it('stageWriterPicks is the call the arc makes (one planner, one gate)', async () => {
    // The same exported factory, same context shape the shortlist uses.
    const { ws, deps, plan } = setup()
    const direct = await stageWriterPicks(deps, {
      context: { tripId: TRIP_ID, dayId: null, dayIndex: -1 },
      intent: 'arc',
      picks: plan([ARC_EARLY]).picks,
    })
    expect(direct.status).toBe('staged')
    expect(ws.staged()).toBe(1)
  })
})

// ------------------------------------------------- production wiring tripwires

describe('#841 MapTab production wiring (supplement to the behavior above)', () => {
  const tab = read('../src/pages/trip/MapTab.tsx')
  const arcBlock = tab.slice(tab.indexOf('async function addArc('), tab.indexOf('const dayOptions'))

  it('takes the shared write type and the plan the writers expose', () => {
    expect(tab).toContain("import { removeStopWithUndo, type ApplyChange } from '../../lib/mutationLifecycle'")
    expect(tab).toMatch(/applyChange: ApplyChange\n/)
    expect(tab).toMatch(/const \{ addPoiToDay, fillSlot, fillTheDay, raiseSlotVote, dayPlan \} = useMapWriters\(\{/)
  })

  it('passes the stable day, presence and the measured road grade to the writers and the shortlist', () => {
    expect(tab).toContain('dayId: journeyDay?.dayId ?? activeDayId ?? null')
    expect(tab).toContain('presence: identity')
    expect(tab).toContain('roadMeasured: roadGrade.measured')
    expect(tab).toContain('routeKey: roadGrade.routeKey')
    expect(tab).toContain('measuredRoadFacts({')
    expect(tab).toContain('dayIdForIndex: index => stableDayIdFor(trip, index)')
    // A line is never the grade: the page does not derive "measured" from it.
    expect(tab).not.toMatch(/roadMeasured:\s*!!routePolyline/)
    expect(tab).not.toMatch(/roadMeasured:\s*routePolyline/)
  })

  it('renders rows, counts and the vote button from the effective plan', () => {
    expect(tab).toContain('slotRowsOf(dayPlan, slot.key)')
    expect(tab).toContain('slotVoteReady(dayPlan, slot.key)')
    expect(tab).toContain('planCounts(dayPlan)')
    expect(tab).toContain('batchSelection(dayPlan)')
    expect(tab).not.toContain('mergeSlotCandidates')
    expect(tab).not.toContain('slotCands')
    expect(tab).not.toContain('makeManualCandidate')
    // The bare bucket stays a render notification only: nothing reads rows from it.
    expect(tab).not.toMatch(/slotManual\[/)
  })

  it('runs the slot search through the captured-context flow', () => {
    expect(tab).toContain('createSlotSearchGuard()')
    expect(tab).toContain('await runSlotSearchFlow({')
    expect(tab).toContain('guard: slotGuard.current')
    expect(tab).not.toContain('slotSeq')
    expect(tab).toContain('}, [openSlotKey, activeDayId, trip.id])')
    expect(tab).toContain('visibleSlotSearch(slotSearchCell, slotSearchScope, searchScopeNow)')
  })

  it('the arc button stages through the shared writer and no longer builds stops itself', () => {
    expect(tab).toContain('onClick={() => { void addArc(arc) }}')
    expect(arcBlock).toContain('stageArcAdd(')
    expect(arcBlock).toContain('gate: mapWriterOperationGate')
    expect(arcBlock).toContain('guardedUndo(')
    expect(arcBlock).not.toContain('markStaged(')
    expect(arcBlock).not.toContain('.splice(')
    expect(arcBlock).not.toContain('.push(')
    expect(arcBlock).not.toContain('applyChange(draft')
    // ids, DNA and Undo come from the verified completion only
    expect(arcBlock).toContain('arcCompletionEffects(')
    expect(arcBlock).toContain('done.undoStops')
    expect(tab).not.toContain('Batch apply all stops in a single change')
  })
})
