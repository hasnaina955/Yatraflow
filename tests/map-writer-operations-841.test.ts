// ============ #841 — the ACTUAL map writer operations ============
//
// These tests drive the production factories the hooks call:
//   planForDay is `buildDayPlan` (the effective candidate projection),
//   placement is the reviewed `planSlotPlacements`,
//   staging/completion is `stageWriterPicks` + `completeWriterOperation`,
//   entry is `writerOperationGate`, Undo is `guardedUndo`.
//
// The workspace, the store and the provider resolver are CONTROLLED TRANSPORTS:
// `applyChange` stages into a captured proposal and acknowledges on command,
// `resolvePick` returns pinned hits, and `currentTrip` reads the captured
// proposal after an acknowledgement. No business decision is mocked: the same
// functions the page calls decide the outcome.
//
// Known-bad controls reproduce the pre-repair shortcuts (absent receipt read as
// success, raw-id candidate merge, duplicate batch picks, Day 1 / end append,
// blind delete Undo) so a green run cannot hide the defect this file pins.
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { ItineraryDay, ItineraryStop, Trip } from '../src/data/types'
import type { PlaceHit } from '../src/lib/providers/hits'
import { buildDayPlan, voteSelection, batchSelection, effectiveDaySlotOf } from '../src/lib/dayPlan'
import { daySlots, type DaySlot, type SlotCandidate } from '../src/lib/daySlots'
import type { SegmentHit } from '../src/lib/ridePlan'
import { isSameEntity } from '../src/lib/placeIdentity'
import { manualCandidateFor } from '../src/pages/trip/map/slotFiling'
import {
  acknowledgedStopsFrom,
  applyPlannedStops,
  checkUndoTargets,
  completeWriterOperation,
  guardedUndo,
  inverseWithoutStops,
  isWriterReceipt,
  stageWriterPicks,
  stopCategoryOf,
  writerContextFor,
  type WriterApplyChange,
  type WriterCompletion,
  type WriterPlannedItem,
  type WriterReceipt,
  type WriterStageResult,
} from '../src/pages/trip/map/mapWriterActions'
import { createWriterOperationGate, writerRequestKey } from '../src/pages/trip/map/writerOperationGate'
import {
  createManualSlotStore,
  createSlotSearchGuard,
  manualContextForSlot,
} from '../src/pages/trip/map/manualSlotContexts'
import {
  buildSlotVoteOption,
  createSlotVoteRequest,
  optionHoldsPlace,
  slotVoteOptionId,
} from '../src/pages/trip/map/slotVoteOptions'

const TRIP_ID = 'trip-841'
const DAY_A = 'day-a'
const DAY_B = 'day-b'
const ROUTE = 'route-measured-841'
const RECEIPT: WriterReceipt = { kind: 'acknowledged', revision: 'rev-9', writeVersion: 9 }

const baseTrip = structuredClone(seedData.trips[0])

function stop(
  id: string,
  title: string,
  lat: number,
  lng: number,
  over: Partial<ItineraryStop> = {},
): ItineraryStop {
  return {
    id,
    title,
    category: 'sightseeing',
    locationName: title,
    lat,
    lng,
    visitMinutes: 30,
    entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0,
    priority: 'nice-to-have',
    status: 'confirmed',
    orderInDay: 0,
    ...over,
  }
}

function day(id: string, index: number, stops: ItineraryStop[]): ItineraryDay {
  return { id, index, title: id, stops: stops.map((s, i) => ({ ...s, orderInDay: i + 1 })) }
}

function tripWith(days: ItineraryDay[]): Trip {
  return { ...structuredClone(baseTrip), id: TRIP_ID, name: '841 writer trip', days }
}

function hit(id: number | string, name: string, lat: number, lng: number, over: Partial<PlaceHit> = {}): PlaceHit {
  return { id, name, latitude: lat, longitude: lng, kind: 'poi', category: 'food', ...over }
}

/** A real measured-route position table. A place absent from the table is
 *  explicitly OFF the measured route (null), never a guessed km. */
function routeTable(entries: Array<[number, number, number]>): {
  routeKmOf: (lat: number, lng: number) => number | null
} {
  const positions = new Map(entries.map(([lat, lng, km]) => [`${lat},${lng}`, km]))
  return { routeKmOf: (lat, lng) => positions.get(`${lat},${lng}`) ?? null }
}

/** A controlled workspace transport: it stages the real mutator into a clone,
 *  and acknowledges only when the test decides. This is the seam the hook's
 *  `applyChange` reaches in production. */
function createWorkspace(initial: Trip) {
  let current = initial
  let pending: {
    proposed: Trip
    kind: string
    dayIndex: number
    onKept?: (receipt?: WriterReceipt) => void
    operation?: { id: string; onDiscard?: () => void; onStoreDiscarded?: () => void; onUncertain?: () => void }
  } | null = null
  const stages: Array<{ proposed: Trip; dayIndex: number; operationId: string | null }> = []
  const applyChange: WriterApplyChange = (mutator, kind, dayIndex, onKept, operation) => {
    const proposed = structuredClone(current)
    mutator(proposed)
    pending = { proposed, kind, dayIndex, ...(onKept ? { onKept } : {}), ...(operation ? { operation } : {}) }
    stages.push({ proposed, dayIndex, operationId: operation?.id ?? null })
  }
  return {
    applyChange,
    current: () => current,
    pending: () => pending,
    stages,
    /** Persist the staged proposal, then run the kept callback with a receipt.
     *  Without a validated receipt the admitted save is unconfirmed: the real
     *  workspace delivers that through the operation's own uncertainty
     *  notification, never through the kept callback. */
    acknowledge: (receipt?: WriterReceipt) => {
      const staged = pending
      if (!staged) throw new Error('nothing is staged')
      current = staged.proposed
      pending = null
      if (receipt) staged.onKept?.(receipt)
      else staged.operation?.onUncertain?.()
    },
    /** A pre-admission discard: release the operation, write nothing. */
    discard: () => {
      const staged = pending
      staged?.operation?.onDiscard?.()
      pending = null
    },
  }
}

type Harness = ReturnType<typeof createWorkspace> & {
  gate: ReturnType<typeof createWriterOperationGate>
  completions: WriterCompletion[]
  stage: (input: {
    picks: Array<{ hit: PlaceHit; slotKey: string | null; dayId?: string; dayIndex?: number }>
    intent?: 'single' | 'batch' | 'shortlist' | 'arc'
    context?: { tripId: string; dayId: string | null; dayIndex: number }
    road?: { routeKey: string } | null
    allowRepeatVisit?: boolean
    operationId?: string
  }) => Promise<WriterStageResult>
}

function harness(input: {
  trip: Trip
  routeKmOf?: (lat: number, lng: number) => number | null
  resolvePick?: (hit: PlaceHit) => Promise<PlaceHit | null>
  road?: { routeKey: string } | null
  allowRepeatVisit?: boolean
}): Harness {
  const workspace = createWorkspace(input.trip)
  const gate = createWriterOperationGate()
  const completions: WriterCompletion[] = []
  const routeKmOf = input.routeKmOf ?? (() => null)
  let stopSequence = 0
  const mintStopId = () => `stop-new-${++stopSequence}`
  const stage: Harness['stage'] = async request => stageWriterPicks({
    trip: input.trip,
    applyChange: workspace.applyChange,
    resolvePick: input.resolvePick ?? (async pick => pick),
    mintStopId,
    gate,
    routeKmOf,
    road: request.road !== undefined ? request.road : ('road' in input ? input.road ?? null : { routeKey: ROUTE }),
    currentTrip: workspace.current,
    onCompletion: completion => { completions.push(completion) },
    poiVisitMinutes: () => 45,
    ...(input.allowRepeatVisit ? { allowRepeatVisit: true } : {}),
  }, {
    context: request.context ?? { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 },
    intent: request.intent ?? 'single',
    picks: request.picks,
    ...(request.operationId ? { operationId: request.operationId } : {}),
    ...(request.allowRepeatVisit ? { allowRepeatVisit: true } : {}),
  })
  return { ...workspace, gate, completions, stage }
}

// ---- Fixtures ----

const START = stop('s-start', 'Start', 10, 70)
const LUNCH_A = stop('s-lunch', 'Existing lunch', 10.2, 70.2)
const END = stop('s-end', 'Night halt', 10.6, 70.6)

function dayATrip(): Trip {
  return tripWith([day(DAY_A, 0, [START, LUNCH_A, END]), day(DAY_B, 1, [stop('b-start', 'B start', 11, 71)])])
}

const ON_ROUTE = routeTable([
  [10, 70, 0],
  [10.2, 70.2, 20],
  [10.6, 70.6, 60],
  [11, 71, 80],
])

const PICK_50 = hit('p-50', 'Highway Cafe', 10.4, 70.4)
const ROUTE_WITH_PICK = { ...ON_ROUTE, routeKmOf: (lat: number, lng: number) => lat === 10.4 && lng === 70.4 ? 40 : ON_ROUTE.routeKmOf(lat, lng) }

function engineSlot(key: 'lunch' | 'dinner', candidate: PlaceHit): DaySlot {
  return {
    key,
    kind: 'meal',
    label: key === 'lunch' ? 'Lunch' : 'Dinner',
    state: 'empty',
    windowMin: key === 'lunch' ? [720, 900] : [1140, 1320],
    windowLabel: key === 'lunch' ? '12:00 - 15:00' : '19:00 - 22:00',
    segment: null,
    filledStop: null,
    auto: false,
    drift: null,
    urgencyMin: null,
    ref: { tripId: TRIP_ID, dayId: DAY_A, key },
    reason: null,
    candidates: [{
      hit: candidate,
      detourMin: 8,
      detourKm: 3,
      budgetSharePct: 20,
      posKm: 40,
      arriveMin: 780,
      arriveLabel: '13:00',
      inWindow: true,
      score: 10,
      reason: 'engine row',
    }],
  }
}

function manual(h: PlaceHit, over: Partial<SlotCandidate> = {}): SlotCandidate {
  return { ...manualCandidateFor({ hit: h, detourMin: null, detourKm: null, budgetMin: 1, sharePct: () => 100 }), ...over }
}

describe('#841 operation gate prevents double entry before a re-render', () => {
  it('a second writer is refused while the first has not awaited its resolver', async () => {
    const trip = dayATrip()
    const route = routeTable([[10.4, 70.4, 40], [10, 70, 0], [10.2, 70.2, 20], [10.6, 70.6, 60]])
    let release: (value: PlaceHit | null) => void = () => {}
    const resolver = new Promise<PlaceHit | null>(resolve => { release = resolve })
    const h = harness({ trip, routeKmOf: route.routeKmOf, resolvePick: () => resolver })
    const first = h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    // The first call has entered the gate and is waiting on the resolver.
    const second = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(second.status).toBe('refused')
    if (second.status === 'refused') expect(second.reason).toBe('gate-busy')
    expect(h.gate.reservations()).toHaveLength(1)
    release(PICK_50)
    await expect(first).resolves.toMatchObject({ status: 'staged' })
    expect(h.stages).toHaveLength(1)
  })

  it('an explicit repeat is a separate operation, and a repeat inside one operation is skipped with a reason', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf, allowRepeatVisit: true })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    h.acknowledge(RECEIPT)
    // A DELIBERATE repeat is allowed by policy, but a second slot in one batch
    // that selects the same place is a duplicate and must be reported.
    const batch = await h.stage({
      intent: 'batch',
      picks: [
        { hit: PICK_50, slotKey: 'lunch' },
        { hit: PICK_50, slotKey: 'dinner' },
      ],
      allowRepeatVisit: true,
    })
    expect(batch.status).toBe('staged')
    if (batch.status !== 'staged') return
    expect(batch.planned).toHaveLength(1)
    expect(batch.skipped.map(item => item.reason)).toContain('duplicate-in-operation')
  })

  it('a resolver failure releases the reservation instead of leaving the day unusable', async () => {
    const trip = dayATrip()
    const h = harness({
      trip,
      routeKmOf: ROUTE_WITH_PICK.routeKmOf,
      resolvePick: async () => { throw new Error('provider offline') },
    })
    await expect(h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })).rejects.toThrow('provider offline')
    expect(h.gate.reservations()).toHaveLength(0)
    expect(h.stages).toHaveLength(0)
  })

  it('a reservation in one trip does not block the same place in another trip', () => {
    const gate = createWriterOperationGate()
    const contextA = { tripId: 'trip-a', dayId: DAY_A, dayIndex: 0 }
    const contextB = { tripId: 'trip-b', dayId: DAY_A, dayIndex: 0 }
    const entry = { slotKey: 'lunch', hit: PICK_50 }
    let n = 0
    const request = (context: typeof contextA) => ({
      context,
      intent: 'single' as const,
      requestKey: writerRequestKey({ intent: 'single', context, slotKeys: ['lunch'], hits: [PICK_50] }),
      entries: [entry],
      mintStopId: () => `stop-${++n}`,
    })
    expect(gate.begin(request(contextA)).status).toBe('entered')
    expect(gate.begin(request(contextB)).status).toBe('entered')
    expect(gate.isReserved(PICK_50, 'trip-a')).toBe(true)
    expect(gate.isReserved(PICK_50, 'trip-b')).toBe(true)
    expect(gate.isReserved(PICK_50, 'trip-c')).toBe(false)
  })

  it('a refused entry releases its reservations, so the same place can be retried', async () => {
    const trip = dayATrip()
    const h = harness({ trip, road: null, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const refused = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(refused.status).toBe('refused')
    if (refused.status === 'refused') expect(refused.reason).toBe('road-evidence-unavailable')
    expect(h.gate.reservations()).toHaveLength(0)
    expect(h.stages).toHaveLength(0)
    const retry = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }], road: { routeKey: ROUTE } })
    expect(retry.status).toBe('staged')
  })
})

describe('#841 one effective candidate list feeds single and batch', () => {
  it('single fill and batch fill choose the same displayed row', async () => {
    const trip = dayATrip()
    const r = routeTable([[10.4, 70.4, 40], [10.5, 70.5, 45], [10, 70, 0], [10.2, 70.2, 20], [10.6, 70.6, 60]])
    const engineHit = hit('engine-1', 'Engine pick', 10.4, 70.4)
    const plan = buildDayPlan({
      dayIndex: 0,
      slots: [engineSlot('lunch', engineHit)],
      tripId: TRIP_ID,
      dayId: DAY_A,
    })
    const effective = effectiveDaySlotOf(plan, 'lunch')
    expect(effective).toBeDefined()
    expect(effective?.candidates[0].hit.id).toBe(engineHit.id)
    const batch = batchSelection(plan)
    expect(batch.items).toHaveLength(1)
    expect(batch.items[0].candidate.hit.id).toBe(effective?.candidates[0].hit.id)

    const h = harness({ trip, routeKmOf: r.routeKmOf })
    const single = await h.stage({ picks: [{ hit: effective!.candidates[0].hit, slotKey: 'lunch' }] })
    expect(single.status).toBe('staged')
    h.acknowledge(RECEIPT)
    const second = await h.stage({
      intent: 'batch',
      picks: batch.items.map(item => ({ hit: item.candidate.hit, slotKey: item.slotKey })),
      allowRepeatVisit: true,
    })
    expect(second.status).toBe('staged')
    // Same place, same chosen row: the operation reports it as in-plan (or a
    // deliberate repeat when allowed), never as a different place.
    if (second.status === 'staged') {
      for (const item of second.planned) expect(isSameEntity(item.hit, engineHit)).toBe(true)
    }
  })

  it('a manual-only pair is a valid vote and keeps the legacy slot option ids', () => {
    const manualA = hit('m-1', 'Manual Cafe', 10.3, 70.3)
    const manualB = hit('m-2', 'Manual Dhaba', 10.4, 70.4)
    // The engine sourced nothing for this slot: the only two rows are the
    // user's own picks, and the vote must still be offered.
    const slots = [{ ...engineSlot('lunch', hit('engine-x', 'Not shown', 10.9, 70.9)), candidates: [] }]
    const plan = buildDayPlan({
      dayIndex: 0,
      slots,
      tripId: TRIP_ID,
      dayId: DAY_A,
      manual: { lunch: [manual(manualA), manual(manualB)] },
    })
    const effective = effectiveDaySlotOf(plan, 'lunch')
    const selection = voteSelection(effective!)
    expect(selection.canRaise).toBe(true)
    expect(selection.options.map(o => o.hit.id)).toEqual(['m-1', 'm-2'])

    const taken = new Set<string>()
    const options = selection.options.map(candidate => {
      const option = buildSlotVoteOption({
        slotKey: 'lunch',
        hit: candidate.hit,
        detourMin: candidate.detourMin,
        taken,
        place: {
          title: candidate.hit.name,
          category: stopCategoryOf(candidate.hit.category),
          locationName: candidate.hit.name,
          lat: candidate.hit.latitude,
          lng: candidate.hit.longitude,
          visitMinutes: 45,
          dayIndex: 0,
          dayId: DAY_A,
        },
      })
      taken.add(String(option.id))
      return option
    })
    const request = createSlotVoteRequest({
      question: 'Day 1 lunch - where?',
      context: 'Voting from the day plan (Day 1)',
      options,
    })
    expect(request.ok).toBe(true)
    if (!request.ok) return
    expect(request.request.options.map(o => o.id)).toEqual(['slot:lunch:m-1', 'slot:lunch:m-2'])
    expect(request.request.options.every(o => o.place?.dayId === DAY_A)).toBe(true)
  })

  it('a raw-id collision between two provider entities stays two options inside the slot prefix', () => {
    const first = hit('7', 'Twin Cafe', 10.3, 70.3, { placeId: 'P-A', source: 'google' })
    const second = hit('7', 'Twin Cafe', 10.3, 70.3, { placeId: 'P-B', source: 'google' })
    const taken = new Set<string>()
    const idA = slotVoteOptionId({ slotKey: 'lunch', hit: first, taken })
    taken.add(idA)
    const idB = slotVoteOptionId({ slotKey: 'lunch', hit: second, taken })
    expect(idA).toBe('slot:lunch:7')
    expect(idB).toBe('slot:lunch:7~2')
    const request = createSlotVoteRequest({
      question: 'q',
      context: 'ctx',
      options: [
        { id: idA, label: first.name, place: { title: first.name, category: 'food', locationName: first.name, lat: 10.3, lng: 70.3, visitMinutes: 45, dayId: DAY_A, place: { source: 'google', placeId: 'P-A', exposure: 'unknown' } } },
        { id: idB, label: second.name, place: { title: second.name, category: 'food', locationName: second.name, lat: 10.3, lng: 70.3, visitMinutes: 45, dayId: DAY_A, place: { source: 'google', placeId: 'P-B', exposure: 'unknown' } } },
      ],
    })
    expect(request.ok).toBe(true)
    if (!request.ok) return
    expect(request.request.options).toHaveLength(2)
    expect(request.request.options.map(o => o.id)).toEqual([idA, idB])
    expect(optionHoldsPlace(request.request.options[0], first)).toBe(true)
    expect(optionHoldsPlace(request.request.options[1], second)).toBe(true)

    // KNOWN BAD: a raw-id merge collapses the two entities that share id "7".
    expect(isSameEntity(first, second)).toBe(false)
  })
})

describe('#841 placement uses measured road order, or an explicit reason', () => {
  it('inserts before the next measured stop and never after a fixed endpoint', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const result = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(result.status).toBe('staged')
    if (result.status !== 'staged') return
    const planned = result.planned[0]
    expect(planned.plan.stop.id).toBe('stop-new-1')
    expect(planned.plan.beforeStopId).toBe(END.id)
    expect(planned.plan.ordering.kind).toBe('measured-road-km')
    expect(planned.plan.ordering.km).toBe(40)
    h.acknowledge(RECEIPT)
    const saved = h.current().days.find(d => d.id === DAY_A)!
    const order = saved.stops.map(s => s.id)
    expect(order).toEqual([START.id, LUNCH_A.id, 'stop-new-1', END.id])
  })

  it('an unmeasured road refuses without appending to Day 1 or to the end of a day', async () => {
    const trip = dayATrip()
    const h = harness({ trip, road: null })
    const result = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(result.status).toBe('refused')
    if (result.status === 'refused') {
      expect(result.reason).toBe('road-evidence-unavailable')
      expect(result.unresolved.map(item => item.reason)).toContain('unknown-road-position')
    }
    expect(h.stages).toHaveLength(0)
    expect(h.current().days[0].stops.map(s => s.id)).toEqual([START.id, LUNCH_A.id, END.id])
    // KNOWN BAD: the pre-repair fallback appended the stop to whichever day was
    // active; no such stop exists here.
    expect(h.current().days.flatMap(d => d.stops).some(s => s.title === PICK_50.name)).toBe(false)
  })

  it('keeps a partial result: the on-route pick is planned, the off-route pick keeps its reason', async () => {
    const trip = dayATrip()
    const offRoute = hit('off-1', 'Off route cafe', 12.9, 77.9)
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const result = await h.stage({
      intent: 'batch',
      picks: [
        { hit: PICK_50, slotKey: 'lunch' },
        { hit: offRoute, slotKey: 'dinner' },
      ],
    })
    expect(result.status).toBe('staged')
    if (result.status !== 'staged') return
    expect(result.planned).toHaveLength(1)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('unknown-road-position')
    h.acknowledge(RECEIPT)
    const completion = h.completions.at(-1)!
    expect(completion.placed.map(item => item.itemId)).toEqual(['item-1'])
    expect(completion.skipped.map(item => item.reason)).toEqual(['unknown-road-position'])
    // The unresolved place is still available to the caller (shortlist/tray).
    expect(completion.skipped[0].slotKey).toBe('dinner')
  })

  it('refuses a deleted target day instead of placing on Day 1', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const result = await h.stage({
      picks: [{ hit: PICK_50, slotKey: 'lunch' }],
      context: { tripId: TRIP_ID, dayId: 'day-gone', dayIndex: 0 },
    })
    if (result.status === 'staged') {
      // The planner reports the missing day per item; nothing was written.
      expect(result.planned).toHaveLength(0)
    } else {
      expect(result.reason).toBe('missing-day')
    }
    expect(h.stages).toHaveLength(0)
  })
})

describe('#841 staging is not acknowledgement', () => {
  it('an absent receipt leaves every planned item unresolved and never claims placed', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    h.acknowledge(undefined)
    const completion = h.completions.at(-1)!
    expect(completion.acknowledged).toBe(false)
    expect(completion.phase).toBe('uncertain')
    expect(completion.placed).toHaveLength(0)
    expect(completion.unresolved[0].reason).toBe('acknowledgement-missing')
    expect(isWriterReceipt(undefined)).toBe(false)
    // The operation stays reserved for a retry with the same identity.
    expect(h.gate.operation(completion.operationId)?.phase).toBe('uncertain')
  })

  it('an acknowledged receipt whose stop is absent is not a placement', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    // Acknowledge without persisting the proposal: the stop is not on the trip.
    const pending = h.pending()
    expect(pending).not.toBeNull()
    pending!.onKept?.(RECEIPT)
    const completion = h.completions.at(-1)!
    expect(completion.acknowledged).toBe(true)
    expect(completion.phase).toBe('partial')
    expect(completion.placed).toHaveLength(0)
    expect(completion.unresolved[0].reason).toBe('stop-not-in-saved-trip')
  })

  it('an acknowledged stop with edited content is not removed from the caller list', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const staged = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(staged.status).toBe('staged')
    // Persist the proposal with an edited title, then acknowledge it.
    const pending = h.pending()!
    pending.proposed.days.find(d => d.id === DAY_A)!.stops.find(s => s.id === 'stop-new-1')!.title = 'Someone edited this'
    h.acknowledge(RECEIPT)
    const completion = h.completions.at(-1)!
    expect(completion.placed).toHaveLength(0)
    expect(completion.unresolved[0].reason).toBe('stop-content-changed')
  })

  it('a retried uncertain operation reuses its operation id and its proposed stop id', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstStopId = first.planned[0].plan.stop.id
    // A failed save keeps the preview: the committed trip is unchanged and the
    // operation stays recoverable.
    h.gate.uncertain(first.operationId)
    // The SAME logical request (no explicit id) resumes the uncertain
    // operation: same operation id, same proposed stop id.
    const retry = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(retry.status).toBe('staged')
    if (retry.status !== 'staged') return
    expect(retry.operationId).toBe(first.operationId)
    expect(retry.planned[0].plan.stop.id).toBe(firstStopId)
    // The retry never inserts the same stop twice into the retained preview.
    h.acknowledge(RECEIPT)
    const dayA = h.current().days.find(d => d.id === DAY_A)!
    expect(dayA.stops.filter(s => s.id === firstStopId)).toHaveLength(1)
  })

  it('a retry after an acknowledged save without a receipt refuses instead of duplicating the stop', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstStopId = first.planned[0].plan.stop.id
    // The workspace cleared the preview but handed no receipt: the save landed
    // in the trip. A replay must not insert a second stop.
    h.acknowledge(undefined)
    const retry = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(retry.status).toBe('refused')
    const dayA = h.current().days.find(d => d.id === DAY_A)!
    expect(dayA.stops.filter(s => s.id === firstStopId)).toHaveLength(1)
  })

  it('a discard releases only its reservations and writes nothing', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const staged = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(staged.status).toBe('staged')
    expect(h.gate.reservations()).toHaveLength(1)
    h.discard()
    expect(h.gate.reservations()).toHaveLength(0)
    expect(h.current().days[0].stops.some(s => s.title === PICK_50.name)).toBe(false)
    const again = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(again.status).toBe('staged')
  })
})

describe('#841 guarded Undo checks the current trip', () => {
  async function placedOperation() {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const staged = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(staged.status).toBe('staged')
    h.acknowledge(RECEIPT)
    const completion = h.completions.at(-1)!
    expect(completion.placed).toHaveLength(1)
    return { h, completion }
  }

  it('removes exactly the acknowledged stop and preserves unrelated edits', async () => {
    const { h, completion } = await placedOperation()
    let admitted: { expectedBase: Trip; patch: Trip } | null = null
    const outcome = await guardedUndo({
      currentTrip: h.current,
      admit: async input => {
        admitted = { expectedBase: input.expectedBase, patch: input.patch }
        return RECEIPT
      },
    }, {
      tripId: TRIP_ID,
      operationId: completion.operationId,
      stops: completion.placed.map(item => ({
        itemId: item.itemId,
        dayId: item.dayId,
        stopId: item.stopId,
        expected: item.stop,
      })),
    })
    expect(outcome.status).toBe('undone')
    expect(admitted).not.toBeNull()
    const patched = admitted!.patch.days.find(d => d.id === DAY_A)!
    expect(patched.stops.map(s => s.id)).toEqual([START.id, LUNCH_A.id, END.id])
    // The other day is untouched, and a concurrent unrelated stop survives.
    expect(admitted!.patch.days.find(d => d.id === DAY_B)).toEqual(h.current().days.find(d => d.id === DAY_B))
  })

  it('refuses a changed target and does not admit an inverse', async () => {
    const { h, completion } = await placedOperation()
    const edited = structuredClone(h.current())
    edited.days.find(d => d.id === DAY_A)!.stops.find(s => s.id === completion.placed[0].stopId)!.title = 'Moved on'
    let admitted = false
    const outcome = await guardedUndo({
      currentTrip: () => edited,
      admit: async () => { admitted = true; return RECEIPT },
    }, {
      tripId: TRIP_ID,
      operationId: completion.operationId,
      stops: completion.placed.map(item => ({ itemId: item.itemId, dayId: item.dayId, stopId: item.stopId, expected: item.stop })),
    })
    expect(outcome.status).toBe('refused')
    if (outcome.status === 'refused') {
      expect(outcome.reason).toBe('changed-target')
      expect(outcome.changedStopIds).toEqual([completion.placed[0].stopId])
    }
    expect(admitted).toBe(false)
  })

  it('refuses a stop that moved to another day, and a missing day', async () => {
    const { h, completion } = await placedOperation()
    const moved = structuredClone(h.current())
    const dayA = moved.days.find(d => d.id === DAY_A)!
    const target = dayA.stops.find(s => s.id === completion.placed[0].stopId)!
    dayA.stops = dayA.stops.filter(s => s.id !== target.id)
    moved.days.find(d => d.id === DAY_B)!.stops.push(target)
    expect(checkUndoTargets(moved, [{
      itemId: 'item-1', dayId: DAY_A, stopId: target.id, expected: completion.placed[0].stop,
    }])).toMatchObject({ reason: 'changed-target', changedStopIds: [target.id] })

    const withoutDay = structuredClone(h.current())
    withoutDay.days = withoutDay.days.filter(d => d.id !== DAY_A)
    const outcome = await guardedUndo({ currentTrip: () => withoutDay, admit: async () => RECEIPT }, {
      tripId: TRIP_ID,
      operationId: completion.operationId,
      stops: completion.placed.map(item => ({ itemId: item.itemId, dayId: item.dayId, stopId: item.stopId, expected: item.stop })),
    })
    expect(outcome.status).toBe('refused')
    if (outcome.status === 'refused') expect(outcome.reason).toBe('missing-day')
  })

  it('reports a conflicted admission as not admitted, never undone', async () => {
    const { h, completion } = await placedOperation()
    const outcome = await guardedUndo({
      currentTrip: h.current,
      admit: async () => ({ kind: 'conflict' }),
    }, {
      tripId: TRIP_ID,
      operationId: completion.operationId,
      stops: completion.placed.map(item => ({ itemId: item.itemId, dayId: item.dayId, stopId: item.stopId, expected: item.stop })),
    })
    expect(outcome).toEqual({ status: 'not-admitted', reason: 'conflict' })
  })

  it('without an admission transport it never claims the inverse applied', async () => {
    const { h, completion } = await placedOperation()
    const outcome = await guardedUndo({ currentTrip: h.current }, {
      tripId: TRIP_ID,
      operationId: completion.operationId,
      stops: completion.placed.map(item => ({ itemId: item.itemId, dayId: item.dayId, stopId: item.stopId, expected: item.stop })),
    })
    expect(outcome).toEqual({ status: 'not-admitted', reason: 'admission-unavailable' })
  })
})

describe('#841 manual and search state are day-scoped', () => {
  it('a pick filed on Day A survives a switch away and back, and never appears on Day B', () => {
    const store = createManualSlotStore()
    const a = { tripId: TRIP_ID, dayId: DAY_A, slotKey: 'lunch' }
    const b = { tripId: TRIP_ID, dayId: DAY_B, slotKey: 'lunch' }
    const pick = hit('pick-a', 'A lunch', 10.4, 70.4)
    expect(store.file(a, pick)).toBe('filed')
    expect(store.file(a, pick)).toBe('duplicate')
    expect(store.picksFor(b)).toHaveLength(0)
    expect(store.picksFor(a).map(h => h.id)).toEqual(['pick-a'])
    const shapes = store.candidatesBySlot({ tripId: TRIP_ID, dayId: DAY_A }, {})
    expect(Object.keys(shapes)).toEqual(['lunch'])
    expect(store.candidatesBySlot({ tripId: TRIP_ID, dayId: DAY_B }, {})).toEqual({})
    // A verified placement removes that place; a skipped one stays.
    const other = hit('pick-other', 'A other', 10.5, 70.5)
    store.file(a, other)
    store.dropPlaced(a, [pick])
    expect(store.picksFor(a).map(h => h.id)).toEqual(['pick-other'])
  })

  it('the page legacy bucket is read only for the day it was filed under', () => {
    const store = createManualSlotStore()
    const a = { tripId: TRIP_ID, dayId: DAY_A, slotKey: 'lunch' }
    const b = { tripId: TRIP_ID, dayId: DAY_B, slotKey: 'lunch' }
    store.file(a, hit('legacy-a', 'Legacy A', 10.4, 70.4))
    expect(store.legacyPicksFor('lunch', a).map(h => h.id)).toEqual(['legacy-a'])
    store.file(b, hit('legacy-b', 'Legacy B', 11.4, 71.4))
    expect(store.legacyPicksFor('lunch', a)).toHaveLength(0)
    expect(store.legacyPicksFor('lunch', b).map(h => h.id)).toEqual(['legacy-b'])
  })

  it('a late search response from the previous day is ignored after a switch', () => {
    const guard = createSlotSearchGuard()
    const dayA = { tripId: TRIP_ID, dayId: DAY_A, slotKey: 'lunch' }
    const dayB = { tripId: TRIP_ID, dayId: DAY_B, slotKey: 'lunch' }
    const seqA = guard.begin(dayA)
    const seqB = guard.begin(dayB)
    expect(guard.isCurrent(dayA, seqA)).toBe(false)
    expect(guard.isCurrent(dayB, seqB)).toBe(true)
    expect(guard.isCurrent(dayB, seqA)).toBe(false)
    expect(guard.current()?.context.dayId).toBe(DAY_B)
  })

  it('an effective plan on Day A never shows Day B manual picks with the same slot key', () => {
    const store = createManualSlotStore()
    const pickA = hit('pick-a', 'Only Day A', 10.4, 70.4)
    store.file({ tripId: TRIP_ID, dayId: DAY_A, slotKey: 'lunch' }, pickA)
    const slotsA = [engineSlot('lunch', hit('engine-a', 'Engine A', 10.9, 70.9))]
    const planA = buildDayPlan({
      dayIndex: 0, slots: slotsA, tripId: TRIP_ID, dayId: DAY_A,
      manual: store.candidatesBySlot({ tripId: TRIP_ID, dayId: DAY_A }, {}),
    })
    const planB = buildDayPlan({
      dayIndex: 1, slots: [engineSlot('lunch', hit('engine-b', 'Engine B', 11.9, 71.9))], tripId: TRIP_ID, dayId: DAY_B,
      manual: store.candidatesBySlot({ tripId: TRIP_ID, dayId: DAY_B }, {}),
    })
    expect(effectiveDaySlotOf(planA, 'lunch')!.candidates[0].hit.id).toBe('pick-a')
    expect(effectiveDaySlotOf(planB, 'lunch')!.candidates.map(c => c.hit.id)).toEqual(['engine-b'])
  })

  it('a slot without a stable day is refused rather than guessed onto a day', () => {
    const legacy = { ...engineSlot('lunch', hit('e', 'E', 10, 70)), ref: null }
    expect(manualContextForSlot(legacy)).toBeNull()
  })
})

describe('#841 day identity helpers', () => {
  it('uses the persisted day id, never the array position or the title', () => {
    const trip = tripWith([
      { id: 'reordered-day', index: 7, title: 'Edited title', stops: [] },
    ])
    const context = writerContextFor(trip, 7)
    expect(context).toEqual({ tripId: TRIP_ID, dayId: 'reordered-day', dayIndex: 7 })
    expect(writerContextFor(trip, 0)).toBeNull()
  })

  it('the request key is stable for one logical write', () => {
    const context = { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 }
    const first = writerRequestKey({ intent: 'single', context, slotKeys: ['lunch'], hits: [PICK_50] })
    const second = writerRequestKey({ intent: 'single', context, slotKeys: ['lunch'], hits: [PICK_50] })
    const changed = writerRequestKey({ intent: 'single', context, slotKeys: ['lunch'], hits: [hit('other', 'Other', 10.4, 70.4)] })
    expect(second).toBe(first)
    expect(changed).not.toBe(first)
  })

  it('keeps a provider cafe category at runtime so a filled cafe still fills a meal slot', () => {
    expect(String(stopCategoryOf('cafe'))).toBe('cafe')
    expect(stopCategoryOf('unknown-value')).toBe('sightseeing')
  })

  it('applyPlannedStops and inverseWithoutStops touch only their targets', () => {
    const trip = dayATrip()
    const draft = structuredClone(trip)
    const insert = stop('inserted', 'Inserted', 10.4, 70.4, { orderInDay: 99 })
    const applied = applyPlannedStops(draft, [{
      itemId: 'item-1', slotKey: 'lunch', dayId: DAY_A, dayIndex: 0, hit: PICK_50,
      plan: {
        itemId: 'item-1', phase: 'planned', stop: insert, insertAt: 2, beforeStopId: END.id,
        ordering: { kind: 'measured-road-km', km: 40, beforeStopId: END.id },
      },
    }])
    expect(applied.status).toBe('applied')
    expect(draft.days[0].stops.map(s => s.id)).toEqual([START.id, LUNCH_A.id, 'inserted', END.id])
    const inverse = inverseWithoutStops(draft, [{ itemId: 'item-1', dayId: DAY_A, stopId: 'inserted', expected: insert }])
    expect(inverse.days[0].stops.map(s => s.id)).toEqual([START.id, LUNCH_A.id, END.id])
    expect(inverse.days[1]).toEqual(draft.days[1])
  })

  it('completing an operation twice with the same items is idempotent for verification', () => {
    const trip = dayATrip()
    const planned = [{
      itemId: 'item-1', slotKey: 'lunch', dayId: DAY_A, dayIndex: 0, hit: PICK_50,
      plan: {
        itemId: 'item-1', phase: 'planned' as const,
        stop: stop('stop-x', 'Placed', 10.4, 70.4), insertAt: 2, beforeStopId: END.id,
        ordering: { kind: 'measured-road-km' as const, km: 40, beforeStopId: END.id },
      },
    }]
    const saved = structuredClone(trip)
    saved.days[0].stops.splice(2, 0, planned[0].plan.stop)
    const first = completeWriterOperation({
      operationId: 'op', context: { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 },
      receipt: RECEIPT, planned, skipped: [], savedTrip: saved,
    })
    const second = completeWriterOperation({
      operationId: 'op', context: { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 },
      receipt: RECEIPT, planned, skipped: [], savedTrip: saved,
    })
    expect(first.placed).toHaveLength(1)
    expect(second.placed.map(item => item.stopId)).toEqual(first.placed.map(item => item.stopId))
  })
})

describe('#841 known-bad controls', () => {
  it('treating the kept callback as success regardless of receipt is the defect this suite rejects', () => {
    // The old writers cleared the shortlist inside onKept. Here the callback
    // runs with NO receipt: the completion records nothing placed.
    const trip = dayATrip()
    const planned = [{
      itemId: 'item-1', slotKey: 'lunch', dayId: DAY_A, dayIndex: 0, hit: PICK_50,
      plan: {
        itemId: 'item-1', phase: 'planned' as const,
        stop: stop('stop-y', 'Placed', 10.4, 70.4), insertAt: 2, beforeStopId: END.id,
        ordering: { kind: 'measured-road-km' as const, km: 40, beforeStopId: END.id },
      },
    }]
    const completion = completeWriterOperation({
      operationId: 'op', context: { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 },
      receipt: undefined, planned, skipped: [], savedTrip: trip,
    })
    expect(completion.placed).toHaveLength(0)
    expect(completion.phase).toBe('uncertain')
  })

  it('a second identical request cannot silently mint a second stop while the first is live', async () => {
    const h = harness({ trip: dayATrip(), routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    // Same request key while the operation is live: busy, not a second stop.
    const duplicate = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(duplicate.status).toBe('refused')
    if (duplicate.status === 'refused') expect(duplicate.reason).toBe('gate-busy')
    expect(h.stages).toHaveLength(1)
  })
})

// ---- Defect 1: a final plan may name a stop that another planned item inserts.
//
// The planner reports the final `beforeStopId` of every planned stop, so an
// early stop can anchor on a LATE planned stop that is not in the draft yet.
// Processing input order appended the early stop to the end of the day. These
// regressions drive the actual `stageWriterPicks` action and the acknowledged
// saved day, for ascending, descending and interleaved multi-day batches.

const EARLY_25 = hit('p-early', 'Early stop', 10.1, 70.1)
const LATE_40 = hit('p-late', 'Late stop', 10.4, 70.4)
const B_EARLY = hit('p-b-early', 'B early', 11.1, 71.1)
const B_LATE = hit('p-b-late', 'B late', 11.4, 71.4)

const ORDER_ROUTE = routeTable([
  [10, 70, 0],
  [10.2, 70.2, 20],
  [10.1, 70.1, 25],
  [10.4, 70.4, 40],
  [10.6, 70.6, 60],
  [11, 71, 80],
  [11.1, 71.1, 110],
  [11.4, 71.4, 125],
  [11.6, 71.6, 140],
])

function orderTrip(): Trip {
  return tripWith([
    day(DAY_A, 0, [START, LUNCH_A, END]),
    day(DAY_B, 1, [
      stop('b-start', 'B start', 11, 71),
      stop('b-end', 'B end', 11.6, 71.6),
    ]),
  ])
}

function orderedItem(input: {
  itemId: string
  stopId: string
  title: string
  lat: number
  lng: number
  beforeStopId: string | null
  km: number
  insertAt: number
  dayId?: string
}): WriterPlannedItem {
  return {
    itemId: input.itemId,
    slotKey: 'lunch',
    dayId: input.dayId ?? DAY_A,
    dayIndex: input.dayId === DAY_B ? 1 : 0,
    hit: hit(input.itemId, input.title, input.lat, input.lng),
    plan: {
      itemId: input.itemId,
      phase: 'planned',
      stop: stop(input.stopId, input.title, input.lat, input.lng),
      insertAt: input.insertAt,
      beforeStopId: input.beforeStopId,
      ordering: { kind: 'measured-road-km', km: input.km, beforeStopId: input.beforeStopId },
    },
  }
}

describe('#841 planned stops apply in dependency order, never by input order', () => {
  it('ascending input keeps the planner order (early before late)', async () => {
    const trip = orderTrip()
    const h = harness({ trip, routeKmOf: ORDER_ROUTE.routeKmOf })
    const result = await h.stage({
      intent: 'batch',
      picks: [
        { hit: EARLY_25, slotKey: 'lunch' },
        { hit: LATE_40, slotKey: 'dinner' },
      ],
    })
    expect(result.status).toBe('staged')
    h.acknowledge(RECEIPT)
    const dayA = h.current().days.find(d => d.id === DAY_A)!
    expect(dayA.stops.map(s => s.title)).toEqual([
      'Start', 'Existing lunch', 'Early stop', 'Late stop', 'Night halt',
    ])
  })

  it('descending input keeps the same planner order', async () => {
    const trip = orderTrip()
    const h = harness({ trip, routeKmOf: ORDER_ROUTE.routeKmOf })
    const result = await h.stage({
      intent: 'batch',
      picks: [
        { hit: LATE_40, slotKey: 'dinner' },
        { hit: EARLY_25, slotKey: 'lunch' },
      ],
    })
    expect(result.status).toBe('staged')
    h.acknowledge(RECEIPT)
    const dayA = h.current().days.find(d => d.id === DAY_A)!
    expect(dayA.stops.map(s => s.title)).toEqual([
      'Start', 'Existing lunch', 'Early stop', 'Late stop', 'Night halt',
    ])
  })

  it('interleaved multi-day batches keep each day in dependency order', async () => {
    const trip = orderTrip()
    const h = harness({ trip, routeKmOf: ORDER_ROUTE.routeKmOf })
    const result = await h.stage({
      intent: 'batch',
      picks: [
        { hit: LATE_40, slotKey: 'dinner', dayId: DAY_A, dayIndex: 0 },
        { hit: B_EARLY, slotKey: 'lunch', dayId: DAY_B, dayIndex: 1 },
        { hit: EARLY_25, slotKey: 'lunch', dayId: DAY_A, dayIndex: 0 },
        { hit: B_LATE, slotKey: 'dinner', dayId: DAY_B, dayIndex: 1 },
      ],
    })
    expect(result.status).toBe('staged')
    if (result.status !== 'staged') return
    expect(result.planned).toHaveLength(4)
    h.acknowledge(RECEIPT)
    const savedA = h.current().days.find(d => d.id === DAY_A)!
    const savedB = h.current().days.find(d => d.id === DAY_B)!
    expect(savedA.stops.map(s => s.title)).toEqual([
      'Start', 'Existing lunch', 'Early stop', 'Late stop', 'Night halt',
    ])
    expect(savedB.stops.map(s => s.title)).toEqual(['B start', 'B early', 'B late', 'B end'])
    expect(savedA.stops.map(s => s.orderInDay)).toEqual([1, 2, 3, 4, 5])
    expect(savedB.stops.map(s => s.orderInDay)).toEqual([1, 2, 3, 4])
  })

  it('refuses a missing anchor and leaves the WHOLE draft untouched (no partial insert)', () => {
    const draft = structuredClone(orderTrip())
    const before = structuredClone(draft.days)
    const valid = orderedItem({
      itemId: 'item-1', stopId: 'new-early', title: 'Early stop', lat: 10.1, lng: 70.1,
      beforeStopId: END.id, km: 25, insertAt: 2,
    })
    const missing = orderedItem({
      itemId: 'item-2', stopId: 'new-late', title: 'Late stop', lat: 10.4, lng: 70.4,
      beforeStopId: 'ghost-anchor', km: 40, insertAt: 3,
    })
    const result = applyPlannedStops(draft, [valid, missing])
    expect(result.status).toBe('refused')
    if (result.status === 'refused') {
      expect(result.reason).toBe('missing-anchor')
      expect(result.refusedItemIds).toContain('item-2')
    }
    // The valid item must not survive a refused batch, and nothing is appended.
    expect(draft.days).toEqual(before)
    expect(draft.days.flatMap(d => d.stops).some(s => s.id === 'new-early')).toBe(false)
    expect(draft.days.flatMap(d => d.stops).some(s => s.id === 'new-late')).toBe(false)
  })

  it('a stop whose anchor is absent on its own day is never appended', () => {
    const draft = structuredClone(orderTrip())
    const before = structuredClone(draft.days)
    const result = applyPlannedStops(draft, [orderedItem({
      itemId: 'item-1', stopId: 'new-late', title: 'Late stop', lat: 10.4, lng: 70.4,
      beforeStopId: 'ghost-anchor', km: 40, insertAt: 3,
    })])
    expect(result.status).toBe('refused')
    expect(draft.days).toEqual(before)
  })

  it('propagates an actual-draft anchor refusal instead of reporting staged success', async () => {
    const trip = orderTrip()
    const workspace = createWorkspace(trip)
    const completions: WriterCompletion[] = []
    const gate = createWriterOperationGate()
    let sequence = 0
    // The page's preflight sees the staged base. The actual mutator draft is the
    // authority: this transport drops the anchor after planning, as a concurrent
    // edit could.
    const applyChange: WriterApplyChange = (mutator, kind, dayIndex, onKept, operation) => {
      workspace.applyChange(draft => {
        const dayA = draft.days.find(d => d.id === DAY_A)!
        dayA.stops = dayA.stops.filter(s => s.id !== END.id)
        mutator(draft)
      }, kind, dayIndex, onKept, operation)
    }
    const result = await stageWriterPicks({
      trip,
      applyChange,
      resolvePick: async pick => pick,
      mintStopId: () => `stop-${++sequence}`,
      gate,
      routeKmOf: ORDER_ROUTE.routeKmOf,
      road: { routeKey: ROUTE },
      currentTrip: workspace.current,
      onCompletion: completion => { completions.push(completion) },
      poiVisitMinutes: () => 45,
    }, {
      context: { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 },
      intent: 'single',
      picks: [{ slotKey: 'lunch', hit: EARLY_25 }],
    })
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.reason).toBe('no-placements')
    expect(result.apply).toEqual({ reason: 'missing-anchor', itemIds: ['item-1'] })
    // The existing preview is retained and the refused stop is not appended.
    const pending = workspace.pending()
    expect(pending).not.toBeNull()
    expect(pending!.proposed.days.find(d => d.id === DAY_A)!.stops.map(s => s.id)).toEqual([START.id, LUNCH_A.id])
    expect(completions).toHaveLength(0)
    // Keeping that untouched preview must not fabricate a completion.
    workspace.acknowledge(RECEIPT)
    expect(completions).toHaveLength(0)
  })
})

// ---- Defect 2: Undo must compare the full saved CONTENT, not four fields.

describe('#841 guarded Undo preserves every user-edited stop field', () => {
  async function placed() {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const staged = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(staged.status).toBe('staged')
    h.acknowledge(RECEIPT)
    const completion = h.completions.at(-1)!
    expect(completion.placed).toHaveLength(1)
    return { h, completion }
  }

  type Edit = (target: ItineraryStop) => void
  const CONTENT_EDITS: Array<[string, Edit]> = [
    ['visitMinutes', target => { target.visitMinutes = 95 }],
    ['notes', target => { target.notes = 'Added a note in the editor' }],
    ['category', target => { target.category = 'temple' }],
    ['status', target => { target.status = 'rejected' }],
    ['openTime', target => { target.openTime = '09:15' }],
    ['closeTime', target => { target.closeTime = '17:45' }],
    ['entryFeeInrPerPerson', target => { target.entryFeeInrPerPerson = 250 }],
    ['transportCostInrTotal', target => { target.transportCostInrTotal = 180 }],
    ['priority', target => { target.priority = 'must-do' }],
    ['description', target => { target.description = 'Edited description' }],
    ['sourceUrl', target => { target.sourceUrl = 'https://example.test/edited' }],
    ['placeSource', target => { target.placeSource = 'osm' }],
    ['exposure', target => { target.exposure = 'indoor' }],
    ['locationName', target => { target.locationName = 'Edited location' }],
    ['lat', target => { target.lat += 0.001 }],
    ['lng', target => { target.lng += 0.001 }],
    ['departTime', target => { target.departTime = '09:30' }],
    ['arrivalTime', target => { target.arrivalTime = '10:00' }],
    ['legDistanceKm', target => { target.legDistanceKm = 12.5 }],
    ['legTravelMinutes', target => { target.legTravelMinutes = 25 }],
    ['auto', target => { target.auto = true }],
    ['weatherSensitive', target => { target.weatherSensitive = true }],
  ]

  it.each(CONTENT_EDITS)('refuses Undo when the saved stop changed %s', async (_field, edit) => {
    const { h, completion } = await placed()
    const edited = structuredClone(h.current())
    const target = edited.days.find(d => d.id === DAY_A)!.stops
      .find(s => s.id === completion.placed[0].stopId)!
    edit(target)
    let admitted = false
    const outcome = await guardedUndo({
      currentTrip: () => edited,
      admit: async () => { admitted = true; return RECEIPT },
    }, {
      tripId: TRIP_ID,
      operationId: completion.operationId,
      stops: acknowledgedStopsFrom(completion),
    })
    expect(outcome.status).toBe('refused')
    if (outcome.status === 'refused') {
      expect(outcome.reason).toBe('changed-target')
      expect(outcome.changedStopIds).toEqual([completion.placed[0].stopId])
    }
    // No admission may run for a refused changed target.
    expect(admitted).toBe(false)
  })

  it('takes the Undo expectation from the acknowledged saved stop', async () => {
    const { h, completion } = await placed()
    const saved = h.current().days.find(d => d.id === DAY_A)!.stops
      .find(s => s.id === completion.placed[0].stopId)!
    expect(completion.placed[0].stop).toEqual(saved)
    const acknowledged = acknowledgedStopsFrom(completion)
    expect(acknowledged).toHaveLength(1)
    expect(acknowledged[0].expected).toEqual(saved)

    // A renumber from an unrelated insert is bookkeeping, not content.
    const renumbered = structuredClone(h.current())
    const target = renumbered.days.find(d => d.id === DAY_A)!.stops
      .find(s => s.id === completion.placed[0].stopId)!
    target.orderInDay = 99
    expect(checkUndoTargets(renumbered, acknowledged)).toEqual({ changedStopIds: [], reason: null })
  })

  it('allows an unrelated add and an unrelated edit, removing only the acknowledged stop', async () => {
    const { h, completion } = await placed()
    const edited = structuredClone(h.current())
    const dayA = edited.days.find(d => d.id === DAY_A)!
    dayA.stops.unshift(stop('unrelated', 'Unrelated add', 10.05, 70.05))
    const dayB = edited.days.find(d => d.id === DAY_B)!
    dayB.stops[0]!.title = 'Renamed on another day'
    dayA.stops.forEach((s, index) => { s.orderInDay = index + 1 })
    let admitted: { patch: Trip } | null = null
    const outcome = await guardedUndo({
      currentTrip: () => edited,
      admit: async input => { admitted = { patch: input.patch }; return RECEIPT },
    }, {
      tripId: TRIP_ID,
      operationId: completion.operationId,
      stops: acknowledgedStopsFrom(completion),
    })
    expect(outcome.status).toBe('undone')
    expect(admitted).not.toBeNull()
    const patchedA = admitted!.patch.days.find(d => d.id === DAY_A)!
    expect(patchedA.stops.some(s => s.id === completion.placed[0].stopId)).toBe(false)
    expect(patchedA.stops.some(s => s.id === 'unrelated')).toBe(true)
    expect(patchedA.stops.map(s => s.orderInDay)).toEqual([1, 2, 3, 4])
    expect(admitted!.patch.days.find(d => d.id === DAY_B)!.stops[0]!.title).toBe('Renamed on another day')
  })
})

describe('#841 the receipt contract is the validated store contract', () => {
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a write version of %s',
    version => {
      expect(isWriterReceipt({ kind: 'acknowledged', revision: 'rev-1', writeVersion: version })).toBe(false)
    },
  )

  it('accepts a version of 0 and rejects an empty revision', () => {
    expect(isWriterReceipt({ kind: 'acknowledged', revision: 'rev-0', writeVersion: 0 })).toBe(true)
    expect(isWriterReceipt({ kind: 'acknowledged', revision: '', writeVersion: 0 })).toBe(false)
  })

  it('never treats an invalid version as placed', () => {
    const trip = dayATrip()
    const planned: WriterPlannedItem[] = [orderedItem({
      itemId: 'item-1', stopId: 'stop-invalid', title: 'Placed', lat: 10.4, lng: 70.4,
      beforeStopId: END.id, km: 40, insertAt: 2,
    })]
    const saved = structuredClone(trip)
    saved.days[0].stops.splice(2, 0, { ...planned[0].plan.stop })
    const completion = completeWriterOperation({
      operationId: 'op', context: { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 },
      receipt: { kind: 'acknowledged', revision: 'rev', writeVersion: 1.5 },
      planned, skipped: [], savedTrip: saved,
    })
    expect(completion.phase).toBe('uncertain')
    expect(completion.acknowledged).toBe(false)
    expect(completion.placed).toHaveLength(0)
  })
})

describe('#841 request identity keeps provider entities apart and retries stable', () => {
  const context = { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 }
  const keyOf = (candidate: PlaceHit) => writerRequestKey({
    intent: 'single', context, slotKeys: ['lunch'], hits: [candidate],
  })

  it('two provider ids at one name and position do not collide', () => {
    const first = hit('7', 'Twin Cafe', 10.3, 70.3, { placeId: 'P-A', source: 'google' })
    const second = hit('7', 'Twin Cafe', 10.3, 70.3, { placeId: 'P-B', source: 'google' })
    expect(isSameEntity(first, second)).toBe(false)
    expect(keyOf(first)).not.toBe(keyOf(second))
  })

  it('one provider key under a different raw id and name spelling stays one request', () => {
    const first = hit('7', 'Twin Cafe', 10.3, 70.3, { placeId: 'P-A', source: 'google' })
    const alias = hit('99', 'TWIN  cafe', 10.3, 70.3, { placeId: 'P-A', source: 'google' })
    expect(keyOf(alias)).toBe(keyOf(first))
  })

  it('the gate lets two different provider entities at one name and position enter', () => {
    const gate = createWriterOperationGate()
    const first = hit('7', 'Twin Cafe', 10.3, 70.3, { placeId: 'P-A', source: 'google' })
    const second = hit('7', 'Twin Cafe', 10.3, 70.3, { placeId: 'P-B', source: 'google' })
    const begin = (candidate: PlaceHit, requestKey: string) => gate.begin({
      context, intent: 'single', requestKey,
      entries: [{ slotKey: 'lunch', hit: candidate }],
      mintStopId: () => `stop-${requestKey}`,
    })
    expect(begin(first, keyOf(first)).status).toBe('entered')
    expect(begin(second, keyOf(second)).status).toBe('entered')
    expect(gate.reservations()).toHaveLength(2)
  })

  it('one logical retry reuses the same request key', () => {
    expect(keyOf(PICK_50)).toBe(keyOf({ ...PICK_50 }))
  })
})

describe('#841 operation ids come from the platform CSPRNG', () => {
  it('mints a random operation id with no time or weak-generator fallback', () => {
    const context = { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 }
    const begin = () => createWriterOperationGate().begin({
      context,
      intent: 'single',
      requestKey: writerRequestKey({ intent: 'single', context, slotKeys: ['lunch'], hits: [PICK_50] }),
      entries: [{ slotKey: 'lunch', hit: PICK_50 }],
      mintStopId: () => 'stop-random',
    })
    const first = begin()
    const second = begin()
    expect(first.status).toBe('entered')
    expect(second.status).toBe('entered')
    if (first.status !== 'entered' || second.status !== 'entered') return
    expect(first.operation.id).toMatch(/^wop_[0-9a-f]{32}$/)
    expect(second.operation.id).toMatch(/^wop_[0-9a-f]{32}$/)
    expect(first.operation.id).not.toBe(second.operation.id)
  })
})

describe('#841 production stageWriterPicks wires the exact uncertainty notification', () => {
  it('an admitted unconfirmed operation becomes uncertain with its captured ticket, and is terminal after a proven discard', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const staged = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(staged.status).toBe('staged')
    const operation = h.pending()!.operation!
    // The PRODUCTION metadata carries a notification separate from both the
    // acknowledgement (onKept, not in the metadata) and the two discard paths.
    expect(operation.onUncertain, 'stageWriterPicks must supply onUncertain').toBeTypeOf('function')
    expect(operation.onUncertain, 'not the pre-admission onDiscard').not.toBe(operation.onDiscard)
    expect(operation.onUncertain, 'not the proven-discard settlement').not.toBe(operation.onStoreDiscarded)

    const id = operation.id
    operation.onUncertain!()
    expect(h.gate.operation(id)?.phase).toBe('uncertain')
    const completion = h.completions.at(-1)!
    expect(completion.acknowledged).toBe(false)
    expect(completion.phase).toBe('uncertain')
    expect(completion.retry?.operationId).toBe(id)
    expect(completion.retry?.picks[0]?.hit).toEqual(PICK_50)
    expect(h.gate.isReserved(PICK_50, TRIP_ID), 'uncertainty keeps every reservation').toBe(true)

    // Once Saved edits proves the write gone, a late uncertainty cannot reopen
    // the operation or deliver a second completion.
    operation.onStoreDiscarded!()
    expect(h.gate.operation(id)?.phase).toBe('abandoned')
    operation.onUncertain!()
    expect(h.gate.operation(id)?.phase).toBe('abandoned')
    expect(h.completions).toHaveLength(1)
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(false)
  })
})

describe('#841 production stageWriterPicks wires the proven-discard settlement', () => {
  it('releases only this operation and refuses a late kept acknowledgement', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    const staged = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(staged.status).toBe('staged')

    // The PRODUCTION operation metadata carries the new, distinct settlement.
    const operation = h.pending()!.operation!
    expect(operation.onStoreDiscarded, 'stageWriterPicks must supply onStoreDiscarded').toBeTypeOf('function')
    expect(operation.onStoreDiscarded, 'not the pre-admission onDiscard').not.toBe(operation.onDiscard)
    expect(operation.onDiscard, 'the pre-admission discard is still present').toBeTypeOf('function')

    const id = operation.id
    expect(h.gate.operation(id)?.phase).toBe('staged')
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(true)

    // Saved edits proved this exact admitted write discarded. The production
    // callback reaches the REAL gate's exact-operation settlement.
    operation.onStoreDiscarded!()
    expect(h.gate.operation(id)?.phase, 'truthful terminal, not staged').toBe('abandoned')
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(false)
    expect(h.gate.reservations()).toHaveLength(0)

    // A late acknowledged receipt cannot re-acknowledge an abandoned operation:
    // the production kept callback returns before completeWriterOperation.
    h.acknowledge(RECEIPT)
    expect(h.completions, 'no fabricated completion after an abandoned write').toHaveLength(0)
    expect(h.gate.operation(id)?.phase).toBe('abandoned')
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(false)
  })

  it('a pre-admission onDiscard is a separate outcome from the proven-discard settlement', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ROUTE_WITH_PICK.routeKmOf })
    await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    const operation = h.pending()!.operation!
    // The ordinary pre-admission discard still reaches the old terminal phase.
    operation.onDiscard!()
    expect(h.gate.operation(operation.id)?.phase).toBe('discarded')
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(false)
    // A later proven-discard callback on an already-terminal record is a no-op:
    // it never re-settles and never touches another operation.
    operation.onStoreDiscarded!()
    expect(h.gate.operation(operation.id)?.phase).toBe('discarded')
  })
})
