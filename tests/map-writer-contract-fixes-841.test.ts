// ============ #841 — writer contract fixes F1/F2/F3/F5 ============
//
// These tests reproduce the independent writer review findings against the
// ACTUAL exports the hooks and arcAdd call:
//   F1  `writerRequestKey`/gate resume identity must be unambiguous, and a
//       matching key alone never proves the same payload;
//   F2  an uncertain retry reuses the EXACT payload captured on the first
//       operation — a changed request or a second resolver result can never be
//       restaged under the old operation id / stop id;
//   F3  a valid receipt with zero verified stops is not a landed save: every
//       item stays unresolved and the reservation is held;
//   F5  the direct add rides the shared stage/planner/gate/verify/undo
//       pipeline with the same request shape the hook builds.
//
// The workspace and the resolver are controlled transports; every decision
// under test runs through the production factories.
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { ItineraryDay, ItineraryStop, Trip } from '../src/data/types'
import type { PlaceHit } from '../src/lib/providers/hits'
import {
  ZERO_VERIFIED_SAVE_MESSAGE,
  guardedUndo,
  stageWriterPicks,
  writerContextFor,
  type WriterApplyChange,
  type WriterCompletion,
  type WriterReceipt,
  type WriterStageResult,
} from '../src/pages/trip/map/mapWriterActions'
import {
  createWriterOperationGate,
  writerRequestKey,
  type WriterOperationIntent,
} from '../src/pages/trip/map/writerOperationGate'

const TRIP_ID = 'trip-841'
const DAY_A = 'day-a'
const DAY_B = 'day-b'
const ROUTE = 'route-measured-841'
const RECEIPT: WriterReceipt = { kind: 'acknowledged', revision: 'rev-9', writeVersion: 9 }
const KEY_CONTEXT = { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 }

const baseTrip = structuredClone(seedData.trips[0])

function stop(id: string, title: string, lat: number, lng: number, over: Partial<ItineraryStop> = {}): ItineraryStop {
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
  return { ...structuredClone(baseTrip), id: TRIP_ID, name: '841 writer contract trip', days }
}

function hit(id: number | string, name: string, lat: number, lng: number, over: Partial<PlaceHit> = {}): PlaceHit {
  return { id, name, latitude: lat, longitude: lng, kind: 'poi', category: 'food', ...over }
}

function routeTable(entries: Array<[number, number, number]>): { routeKmOf: (lat: number, lng: number) => number | null } {
  const positions = new Map(entries.map(([lat, lng, km]) => [`${lat},${lng}`, km]))
  return { routeKmOf: (lat, lng) => positions.get(`${lat},${lng}`) ?? null }
}

const START = stop('s-start', 'Start', 10, 70)
const LUNCH_A = stop('s-lunch', 'Existing lunch', 10.2, 70.2)
const END = stop('s-end', 'Night halt', 10.6, 70.6)

function dayATrip(): Trip {
  return tripWith([day(DAY_A, 0, [START, LUNCH_A, END]), day(DAY_B, 1, [stop('b-start', 'B start', 11, 71)])])
}

const ON_ROUTE = routeTable([
  [10, 70, 0],
  [10.2, 70.2, 20],
  [10.4, 70.4, 40],
  [10.6, 70.6, 60],
  [11, 71, 80],
])

const PICK_50 = hit('p-50', 'Highway Cafe', 10.4, 70.4, { placeId: 'P-50', source: 'google' })
/** A genuinely different entity: different provider key, name and position. */
const OTHER_PICK = hit('p-51', 'Riverside Dhaba', 10.5, 70.5, { placeId: 'P-51', source: 'google' })

interface PendingStage {
  proposed: Trip
  kind: string
  dayIndex: number
  onKept?: (receipt?: WriterReceipt) => void
  operation?: { id: string; onDiscard?: () => void; onStoreDiscarded?: () => void; onUncertain?: () => void }
}

/** A controlled workspace transport. `acknowledgeWithoutChange` hands the kept
 *  callback a VALID receipt for a DIFFERENT patch — the operation's own stops
 *  never reach the saved trip (the F3 receipt fact). `abandon` reports no
 *  receipt: the admitted generation is unconfirmed, which the real workspace
 *  delivers through the operation's uncertainty notification (the F2 retry). */
function createWorkspace(initial: Trip) {
  let current = initial
  let pending: PendingStage | null = null
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
    acknowledge: (receipt?: WriterReceipt) => {
      const staged = pending
      if (!staged) throw new Error('nothing is staged')
      current = staged.proposed
      pending = null
      // A validated receipt is the only acknowledgement. Without one the real
      // workspace sends the operation's separate uncertainty notification.
      if (receipt) staged.onKept?.(receipt)
      else staged.operation?.onUncertain?.()
    },
    acknowledgeWithoutChange: (receipt: WriterReceipt) => {
      const staged = pending
      if (!staged) throw new Error('nothing is staged')
      staged.onKept?.(receipt)
      pending = null
    },
    abandon: () => {
      const staged = pending
      if (!staged) throw new Error('nothing is staged')
      pending = null
      staged.operation?.onUncertain?.()
    },
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
  resolverCalls: () => number
  stage: (input: {
    picks: Array<{ hit: PlaceHit; slotKey: string | null; notes?: string }>
    intent?: 'single' | 'batch' | 'shortlist' | 'arc'
    context?: { tripId: string; dayId: string | null; dayIndex: number }
    road?: { routeKey: string } | null
    operationId?: string
  }) => Promise<WriterStageResult>
}

function harness(input: {
  trip: Trip
  routeKmOf?: (lat: number, lng: number) => number | null
  resolvePick?: (hit: PlaceHit) => Promise<PlaceHit | null>
  road?: { routeKey: string } | null
}): Harness {
  const workspace = createWorkspace(input.trip)
  const gate = createWriterOperationGate()
  const completions: WriterCompletion[] = []
  let resolverCalls = 0
  const resolve = async (pick: PlaceHit) => {
    resolverCalls += 1
    return (input.resolvePick ?? (async requested => requested))(pick)
  }
  let stopSequence = 0
  const stage: Harness['stage'] = async request => stageWriterPicks({
    trip: input.trip,
    applyChange: workspace.applyChange,
    resolvePick: resolve,
    mintStopId: () => `stop-new-${++stopSequence}`,
    gate,
    routeKmOf: input.routeKmOf ?? (() => null),
    road: request.road !== undefined ? request.road : input.road !== undefined ? input.road : { routeKey: ROUTE },
    currentTrip: workspace.current,
    onCompletion: completion => { completions.push(completion) },
    poiVisitMinutes: () => 45,
  }, {
    context: request.context ?? KEY_CONTEXT,
    intent: request.intent ?? 'single',
    picks: request.picks,
    ...(request.operationId ? { operationId: request.operationId } : {}),
  })
  return { ...workspace, gate, completions, resolverCalls: () => resolverCalls, stage }
}

const keyOf = (
  slotKeys: ReadonlyArray<string | null>,
  hits: readonly PlaceHit[],
  intent: WriterOperationIntent = 'single',
): string => writerRequestKey({ intent, context: KEY_CONTEXT, slotKeys, hits })

// ---- F1: canonical request identity ----

describe('F1 the writer request key is unambiguous', () => {
  it('delimiter-bearing slot keys never fold two requests into one key', () => {
    expect(keyOf(['lunch,x'], [PICK_50])).not.toBe(keyOf(['lunch', 'x'], [PICK_50]))
    expect(keyOf(['lunch|x'], [PICK_50])).not.toBe(keyOf(['lunch', 'x'], [PICK_50]))
  })

  it('delimiter-bearing provider values keep every distinct entity apart', () => {
    const colon = hit('h1', 'Colon Cafe', 10.3, 70.3, { placeId: 'p:1', source: 'google' })
    const plus = hit('h2', 'Plus Cafe', 10.3, 70.3, { placeId: 'p+1', source: 'google' })
    const pipe = hit('h3', 'Pipe Cafe', 10.3, 70.3, { placeId: 'p|1', source: 'google' })
    const comma = hit('h4', 'Comma Cafe', 10.3, 70.3, { placeId: 'p,1', source: 'google' })
    const group = [colon, plus, pipe, comma]
    for (const left of group) {
      for (const right of group) {
        if (left === right) continue
        expect(keyOf(['lunch'], [left])).not.toBe(keyOf(['lunch'], [right]))
      }
    }
  })

  it('one entity under a different raw id and name spelling keeps one key', () => {
    const alias = hit('999', 'HIGHWAY  cafe', 10.4, 70.4, { placeId: 'P-50', source: 'google' })
    expect(keyOf(['lunch'], [alias])).toBe(keyOf(['lunch'], [PICK_50]))
  })

  it('two providers at one name and position keep two keys', () => {
    const rival = hit('p-50', 'Highway Cafe', 10.4, 70.4, { placeId: 'P-rival', source: 'google' })
    expect(keyOf(['lunch'], [rival])).not.toBe(keyOf(['lunch'], [PICK_50]))
  })

  it('a matching request key alone never resumes a different payload', async () => {
    const h = harness({ trip: dayATrip(), routeKmOf: ON_ROUTE.routeKmOf })
    const requestKey = keyOf(['lunch'], [PICK_50])
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstOperationId = first.operationId
    h.abandon()
    const forged = h.gate.begin({
      context: KEY_CONTEXT,
      intent: 'single',
      requestKey,
      entries: [{ slotKey: 'lunch', hit: OTHER_PICK }],
      mintStopId: () => 'stop-forged',
    })
    expect(forged.status).toBe('busy')
    if (forged.status === 'busy') {
      expect(forged.reason).toBe('payload-mismatch')
      expect(forged.operationId).toBe(firstOperationId)
    }
    expect(h.gate.operation(firstOperationId)?.phase).toBe('uncertain')
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(true)
  })
})

// ---- F2: uncertain retries reuse the captured payload ----

describe('F2 an uncertain retry reuses the original resolved payload', () => {
  it('a true retry reuses the original stop id and payload without resolving again', async () => {
    const original = PICK_50
    const changed = hit('p-50', 'Highway Cafe MOVED', 11.9, 71.9, { placeId: 'P-changed', source: 'mappls' })
    let calls = 0
    const h = harness({
      trip: dayATrip(),
      routeKmOf: ON_ROUTE.routeKmOf,
      resolvePick: async () => {
        calls += 1
        return calls === 1 ? original : changed
      },
    })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstStop = first.planned[0].plan.stop
    h.abandon()
    const retry = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(retry.status).toBe('staged')
    if (retry.status !== 'staged') return
    expect(retry.operationId).toBe(first.operationId)
    expect(retry.planned[0].plan.stop.id).toBe(firstStop.id)
    expect(retry.planned[0].plan.stop.lat).toBe(firstStop.lat)
    expect(retry.planned[0].plan.stop.lng).toBe(firstStop.lng)
    expect(retry.planned[0].plan.stop.title).toBe(firstStop.title)
    expect(h.resolverCalls()).toBe(1)
    h.acknowledge(RECEIPT)
    const saved = h.current().days.find(d => d.id === DAY_A)!
    expect(saved.stops.filter(s => s.id === firstStop.id)).toHaveLength(1)
  })

  it('a changed pick is refused as a distinct operation, never restaged under the old id', async () => {
    const h = harness({ trip: dayATrip(), routeKmOf: ON_ROUTE.routeKmOf })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstOperationId = first.operationId
    h.abandon()
    const retry = await h.stage({ picks: [{ hit: OTHER_PICK, slotKey: 'lunch' }], operationId: firstOperationId })
    expect(retry.status).toBe('refused')
    if (retry.status === 'refused') {
      expect(retry.resume?.disposition).toBe('payload-changed')
      expect(retry.resume?.operationId).toBe(firstOperationId)
    }
    expect(h.resolverCalls()).toBe(1)
    expect(h.stages).toHaveLength(1)
    expect(h.gate.operation(firstOperationId)?.phase).toBe('uncertain')
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(true)
  })

  it('a changed slot or day assignment cannot be restaged under the old id', async () => {
    const h = harness({ trip: dayATrip(), routeKmOf: ON_ROUTE.routeKmOf })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    h.abandon()
    const changedSlot = await h.stage({
      picks: [{ hit: PICK_50, slotKey: 'dinner' }],
      operationId: first.operationId,
    })
    expect(changedSlot.status).toBe('refused')
    if (changedSlot.status === 'refused') expect(changedSlot.resume?.disposition).toBe('payload-changed')
    const changedDay = await h.stage({
      context: { tripId: TRIP_ID, dayId: DAY_B, dayIndex: 1 },
      picks: [{ hit: PICK_50, slotKey: 'lunch' }],
      operationId: first.operationId,
    })
    expect(changedDay.status).toBe('refused')
    if (changedDay.status === 'refused') expect(changedDay.resume?.disposition).toBe('payload-changed')
    expect(h.resolverCalls()).toBe(1)
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(true)
  })

  it('an uncertain record without a captured payload refuses instead of re-resolving', async () => {
    const h = harness({ trip: dayATrip(), routeKmOf: ON_ROUTE.routeKmOf })
    const requestKey = keyOf(['lunch'], [PICK_50])
    const entered = h.gate.begin({
      context: KEY_CONTEXT,
      intent: 'single',
      requestKey,
      entries: [{ slotKey: 'lunch', hit: PICK_50 }],
      mintStopId: () => 'stop-orphan',
    })
    expect(entered.status).toBe('entered')
    if (entered.status !== 'entered') return
    h.gate.uncertain(entered.operation.id)
    const result = await h.stage({
      picks: [{ hit: PICK_50, slotKey: 'lunch' }],
      operationId: entered.operation.id,
    })
    expect(result.status).toBe('refused')
    if (result.status === 'refused') expect(result.resume?.disposition).toBe('resume-unverifiable')
    expect(h.resolverCalls()).toBe(0)
    expect(h.stages).toHaveLength(0)
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(true)
  })

  it('a retry after a landed-but-unconfirmed save reports the stop in the plan, never a second visit', async () => {
    const h = harness({ trip: dayATrip(), routeKmOf: ON_ROUTE.routeKmOf })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstStopId = first.planned[0].plan.stop.id
    h.acknowledge(undefined)
    const savedBefore = h.current().days.find(d => d.id === DAY_A)!.stops
    expect(savedBefore.some(s => s.id === firstStopId)).toBe(true)
    const retry = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(retry.status).toBe('refused')
    if (retry.status === 'refused') {
      expect(retry.reason).toBe('no-placements')
      expect(retry.skipped.map(item => item.reason)).toContain('already-in-plan')
    }
    const savedAfter = h.current().days.find(d => d.id === DAY_A)!.stops
    expect(savedAfter.filter(s => s.id === firstStopId)).toHaveLength(1)
    expect(h.resolverCalls()).toBe(1)
  })
})

// ---- F3: an acknowledged receipt with zero verified stops ----

describe('F3 a valid receipt with zero verified stops is not a landed save', () => {
  it('keeps every item unresolved and holds the reservation', async () => {
    const h = harness({ trip: dayATrip(), routeKmOf: ON_ROUTE.routeKmOf })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    h.acknowledgeWithoutChange(RECEIPT)
    const completion = h.completions.at(-1)!
    expect(completion.acknowledged).toBe(true)
    expect(completion.receipt).toEqual(RECEIPT)
    expect(completion.phase).toBe('partial')
    expect(completion.placed).toHaveLength(0)
    expect(completion.unresolved.map(item => item.itemId)).toEqual(['item-1'])
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(true)
  })

  it('the shared zero-verified message never claims the save landed', () => {
    expect(ZERO_VERIFIED_SAVE_MESSAGE.toLowerCase()).not.toContain('landed')
    expect(ZERO_VERIFIED_SAVE_MESSAGE).toContain('Saved edits')
  })

  it('a retry after a zero-verified receipt reuses the stop id and lands exactly one visit', async () => {
    const h = harness({ trip: dayATrip(), routeKmOf: ON_ROUTE.routeKmOf })
    const first = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstStopId = first.planned[0].plan.stop.id
    h.acknowledgeWithoutChange(RECEIPT)
    const retry = await h.stage({ picks: [{ hit: PICK_50, slotKey: 'lunch' }] })
    expect(retry.status).toBe('staged')
    if (retry.status !== 'staged') return
    expect(retry.operationId).toBe(first.operationId)
    expect(retry.planned[0].plan.stop.id).toBe(firstStopId)
    expect(h.resolverCalls()).toBe(1)
    h.acknowledge(RECEIPT)
    const saved = h.current().days.find(d => d.id === DAY_A)!
    expect(saved.stops.filter(s => s.id === firstStopId)).toHaveLength(1)
    expect(h.completions.at(-1)!.placed).toHaveLength(1)
  })
})

// ---- F5: the direct add rides the shared pipeline ----

describe('F5 the direct add rides the shared stage/verify/undo pipeline', () => {
  /** The exact request shape `addPoiToDay` builds for one nearby hit. */
  function stageDirectAdd(h: Harness, hitToAdd: PlaceHit, dayIndex = 0) {
    const context = writerContextFor(h.current(), dayIndex)
    expect(context).not.toBeNull()
    return h.stage({
      context: context!,
      intent: 'single',
      picks: [{ slotKey: null, hit: hitToAdd, notes: 'Added from nearby suggestions' }],
    })
  }

  it('places in road order, verifies the saved stop, and undoes through the shared path', async () => {
    const trip = dayATrip()
    const h = harness({ trip, routeKmOf: ON_ROUTE.routeKmOf })
    const result = await stageDirectAdd(h, PICK_50)
    expect(result.status).toBe('staged')
    if (result.status !== 'staged') return
    expect(result.planned).toHaveLength(1)
    expect(result.planned[0].plan.beforeStopId).toBe(END.id)
    expect(result.planned[0].plan.stop.notes).toBe('Added from nearby suggestions')
    h.acknowledge(RECEIPT)
    const saved = h.current().days.find(d => d.id === DAY_A)!
    expect(saved.stops.map(s => s.id)).toEqual([START.id, LUNCH_A.id, result.planned[0].plan.stop.id, END.id])
    const completion = h.completions.at(-1)!
    expect(completion.placed).toHaveLength(1)
    let admitted: { patch: Trip } | null = null as { patch: Trip } | null
    const outcome = await guardedUndo(
      {
        currentTrip: h.current,
        admit: async input => {
          admitted = { patch: input.patch }
          return RECEIPT
        },
      },
      {
        tripId: TRIP_ID,
        operationId: completion.operationId,
        stops: completion.placed.map(item => ({
          itemId: item.itemId,
          dayId: item.dayId,
          stopId: item.stopId,
          expected: structuredClone(item.stop),
        })),
      },
    )
    expect(outcome.status).toBe('undone')
    if (outcome.status !== 'undone') return
    expect(outcome.removedStopIds).toEqual([result.planned[0].plan.stop.id])
    const patch = admitted ? admitted.patch : null
    expect(patch).not.toBeNull()
    if (!patch) return
    expect(patch.days.find(d => d.id === DAY_A)!.stops.map(s => s.id))
      .toEqual([START.id, LUNCH_A.id, END.id])
  })

  it('a discard releases the reservation and writes nothing', async () => {
    const h = harness({ trip: dayATrip(), routeKmOf: ON_ROUTE.routeKmOf })
    const result = await stageDirectAdd(h, PICK_50)
    expect(result.status).toBe('staged')
    h.discard()
    expect(h.gate.isReserved(PICK_50, TRIP_ID)).toBe(false)
    expect(h.completions).toHaveLength(0)
    expect(h.current().days.find(d => d.id === DAY_A)!.stops.map(s => s.id))
      .toEqual([START.id, LUNCH_A.id, END.id])
    const again = await stageDirectAdd(h, PICK_50)
    expect(again.status).toBe('staged')
  })

  it('an unmeasured road refuses the direct add instead of appending', async () => {
    const h = harness({ trip: dayATrip(), road: null })
    const result = await stageDirectAdd(h, PICK_50)
    expect(result.status).toBe('refused')
    if (result.status === 'refused') {
      expect(result.reason).toBe('road-evidence-unavailable')
      expect(result.unresolved.map(item => item.reason)).toContain('unknown-road-position')
    }
    expect(h.stages).toHaveLength(0)
    expect(h.current().days.find(d => d.id === DAY_A)!.stops.map(s => s.id))
      .toEqual([START.id, LUNCH_A.id, END.id])
  })
})
