// ============ #841 — the production writers retry one uncertain operation ====
//
// This is the caller-contract regression for the final writer review's High
// finding: the repaired payload-bound resume path existed, but no production
// caller ever supplied the uncertain operation's identity, so the UI could not
// reach it.
//
// Every decision below runs through the ACTUAL production exports:
//   - `stageWriterPicks` stages the first write and marks its completion;
//   - `retryWriterStage` is the single retry admission the hooks and the arc
//     call, with the gate's captured `WriterRetryTicket`;
//   - `useMapWriters` is mounted through `react-dom/server` (the node-env
//     render precedent this repo already uses) and its real `addPoiToDay` and
//     `retryUncertain` actions are driven with a controlled resolver,
//     persistence and preview transport.
//
// Known-bad controls prove the guard: a changed note, provider, slot, day,
// intent or trip under the old operation id is refused as `payload-changed`;
// a settled operation is refused as `operation-settled`; a forgotten record is
// refused as `operation-unknown` and creates no new write.
//
// SCOPE LABEL: the preview transport below is a CONTROLLED STAND-IN for the
// workspace, so this file proves the caller and payload contract only. It is
// NOT proof that the real workspace reaches uncertainty. That composition is
// proved against the real store and observer in
// `tests/workspace-uncertainty-bridge-841.test.ts`; a Keep that fails here
// reaches the operation through the same uncertainty notification the real
// workspace uses, never through `onKept` with no receipt.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { seedData } from '../src/data/seed'
import type { ItineraryDay, ItineraryStop, Trip } from '../src/data/types'
import type { PlaceHit } from '../src/lib/providers/hits'
import {
  retryWriterStage,
  stageWriterPicks,
  type WriterActionDeps,
  type WriterApplyChange,
  type WriterCompletion,
  type WriterReceipt,
  type WriterRetryTicket,
} from '../src/pages/trip/map/mapWriterActions'
import { createWriterOperationGate } from '../src/pages/trip/map/writerOperationGate'
import { useMapWriters } from '../src/pages/trip/map/useMapWriters'
import { arcStageLine, retryArcAdd, stageArcAdd, type ArcPickPlan } from '../src/pages/trip/map/arcAdd'

const TRIP_ID = 'trip-retry-841'
const DAY_A = 'day-retry-a'
const DAY_B = 'day-retry-b'
const ROUTE = 'route-retry-841'
const RECEIPT: WriterReceipt = { kind: 'acknowledged', revision: 'rev-retry-9', writeVersion: 9 }

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
  return { id, index, title: id, stops: stops.map((entry, at) => ({ ...entry, orderInDay: at + 1 })) }
}

function hit(id: number | string, name: string, lat: number, lng: number, over: Partial<PlaceHit> = {}): PlaceHit {
  return { id, name, latitude: lat, longitude: lng, kind: 'poi', category: 'food', ...over }
}

const START = stop('s-start', 'Start', 10, 70)
const LUNCH = stop('s-lunch', 'Existing lunch', 10.2, 70.2)
const END = stop('s-end', 'Night halt', 10.6, 70.6)
const B_START = stop('b-start', 'B start', 11, 71)
const B_END = stop('b-end', 'B end', 12, 72)

function tripFixture(): Trip {
  return {
    ...structuredClone(baseTrip),
    id: TRIP_ID,
    name: 'retry caller trip',
    days: [day(DAY_A, 0, [START, LUNCH, END]), day(DAY_B, 1, [B_START, B_END])],
  }
}

const PICK_A = hit('p-retry-a', 'Highway Cafe', 10.4, 70.4, { placeId: 'P-RETRY-A', source: 'google' })
const PICK_B = hit('p-retry-b', 'Roadside Dhaba', 10.3, 70.3, { placeId: 'P-RETRY-B', source: 'google' })
const B_PICK = hit('p-retry-c', 'Hill Viewpoint', 10.9, 70.9, { placeId: 'P-RETRY-C', source: 'google' })

const ROUTE_KM = new Map<string, number>([
  ['10,70', 0],
  ['10.2,70.2', 20],
  ['10.3,70.3', 30],
  ['10.4,70.4', 40],
  ['10.5,70.5', 50],
  ['10.6,70.6', 60],
  ['10.9,70.9', 90],
  ['11,71', 80],
  ['12,72', 120],
])
const routeKmOf = (lat: number, lng: number): number | null => ROUTE_KM.get(`${lat},${lng}`) ?? null

interface PendingStage {
  proposed: Trip
  kind: string
  dayIndex: number
  onKept?: (receipt?: WriterReceipt) => void
  operation?: { id: string; onDiscard?: () => void; onStoreDiscarded?: () => void; onUncertain?: () => void }
}

/** A controlled preview/persistence transport. It runs the REAL mutator and
 *  hands back the exact receipt the test chooses, like the workspace does. A
 *  Keep with no validated receipt reaches the operation through the workspace's
 *  separate uncertainty notification — never through `onKept`. */
function createWorkspace(initial: Trip) {
  let current = initial
  let pending: PendingStage | null = null
  const stages: Array<{ proposed: Trip; operationId: string | null }> = []
  const applyChange: WriterApplyChange = (mutator, kind, dayIndex, onKept, operation) => {
    const proposed = structuredClone(current)
    mutator(proposed)
    pending = { proposed, kind, dayIndex, ...(onKept ? { onKept } : {}), ...(operation ? { operation } : {}) }
    stages.push({ proposed, operationId: operation?.id ?? null })
  }
  return {
    applyChange,
    current: () => current,
    stages,
    hasPending: () => pending != null,
    acknowledge: (receipt?: WriterReceipt) => {
      const staged = pending
      if (!staged) throw new Error('nothing is staged')
      current = staged.proposed
      pending = null
      staged.onKept?.(receipt)
    },
    /** The write may have landed, but no validated receipt came back: the
     *  workspace notifies the captured operation as uncertain. */
    saveWithoutReceipt: () => {
      const staged = pending
      if (!staged) throw new Error('nothing is staged')
      current = staged.proposed
      pending = null
      staged.operation?.onUncertain?.()
    },
    /** The admitted save was not confirmed and the preview is closed. */
    abandon: () => {
      const staged = pending
      if (!staged) throw new Error('nothing is staged')
      pending = null
      staged.operation?.onUncertain?.()
    },
    discard: () => {
      const staged = pending
      pending = null
      staged?.operation?.onDiscard?.()
    },
  }
}

type Intent = 'single' | 'batch' | 'shortlist' | 'arc'

function requestFor(intent: Intent) {
  if (intent === 'single') {
    return {
      context: { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 },
      picks: [{ hit: PICK_A, slotKey: 'lunch', notes: 'Added from nearby suggestions' }],
    }
  }
  if (intent === 'batch') {
    return {
      context: { tripId: TRIP_ID, dayId: DAY_A, dayIndex: 0 },
      picks: [
        { hit: PICK_A, slotKey: 'lunch' },
        { hit: PICK_B, slotKey: 'dinner' },
      ],
    }
  }
  return {
    context: { tripId: TRIP_ID, dayId: null, dayIndex: -1 },
    picks: [
      { hit: PICK_A, slotKey: null, dayId: DAY_A, dayIndex: 0 },
      { hit: B_PICK, slotKey: null, dayId: DAY_B, dayIndex: 1 },
    ],
  }
}

function createHarness() {
  const workspace = createWorkspace(tripFixture())
  const gate = createWriterOperationGate()
  const completions: WriterCompletion[] = []
  let resolverCalls = 0
  let mintCalls = 0
  const resolvePick = async (requested: PlaceHit) => {
    resolverCalls += 1
    return requested
  }
  const deps: WriterActionDeps = {
    trip: workspace.current(),
    applyChange: workspace.applyChange,
    resolvePick,
    mintStopId: () => `retry-stop-${++mintCalls}`,
    gate,
    routeKmOf,
    road: { routeKey: ROUTE },
    currentTrip: workspace.current,
    onCompletion: completion => { completions.push(completion) },
    poiVisitMinutes: () => 30,
  }
  return { ...workspace, gate, deps, completions, resolverCalls: () => resolverCalls, mintCalls: () => mintCalls }
}

type Harness = ReturnType<typeof createHarness>

async function stageIntent(harness: Harness, intent: Intent) {
  const request = requestFor(intent)
  return stageWriterPicks(harness.deps, {
    context: request.context,
    intent,
    picks: request.picks,
  })
}

function stopIdsOf(harness: Harness, operationId: string): string[] {
  return harness.gate.operation(operationId)?.items.map(item => item.stopId) ?? []
}

function savedStopCount(trip: Trip, stopId: string): number {
  return trip.days.reduce((total, entry) => total + entry.stops.filter(saved => saved.id === stopId).length, 0)
}

describe('one production retry admission serves every writer intent', () => {
  const intents: Intent[] = ['single', 'batch', 'shortlist', 'arc']

  it.each(intents)('an uncertain %s retries the captured operation and lands once', async intent => {
    const h = createHarness()
    const first = await stageIntent(h, intent)
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstStopIds = stopIdsOf(h, first.operationId)
    expect(firstStopIds).toHaveLength(requestFor(intent).picks.length)
    expect(h.resolverCalls()).toBe(requestFor(intent).picks.length)
    const mintedAtFirst = h.mintCalls()

    h.abandon()
    const uncertain = h.completions.at(-1)!
    expect(uncertain.acknowledged).toBe(false)
    expect(uncertain.retry?.operationId).toBe(first.operationId)
    expect(h.gate.retryTicket(first.operationId)?.operationId).toBe(first.operationId)

    const ticket = uncertain.retry as WriterRetryTicket
    const retried = await retryWriterStage(h.deps, ticket)
    expect(retried.status).toBe('staged')
    if (retried.status !== 'staged') return

    // The SAME logical operation: same id, same stop ids, no new resolver call,
    // no new minted stop.
    expect(retried.operationId).toBe(first.operationId)
    expect(stopIdsOf(h, retried.operationId)).toEqual(firstStopIds)
    expect(retried.planned.map(item => item.plan.stop.id).sort()).toEqual([...firstStopIds].sort())
    expect(h.resolverCalls()).toBe(requestFor(intent).picks.length)
    expect(h.mintCalls()).toBe(mintedAtFirst)
    expect(h.stages).toHaveLength(2)
    expect(h.stages[1].operationId).toBe(first.operationId)

    h.acknowledge(RECEIPT)
    const completion = h.completions.at(-1)!
    expect(completion.acknowledged).toBe(true)
    expect(completion.retry).toBeUndefined()
    expect(completion.placed).toHaveLength(firstStopIds.length)
    for (const stopId of firstStopIds) expect(savedStopCount(h.current(), stopId)).toBe(1)
    if (intent === 'single') {
      // The saved note is the FIRST operation's note, byte for byte.
      expect(completion.placed[0].stop.notes).toBe('Added from nearby suggestions')
    }
  })
})

describe('a retry refuses a payload that is not the captured one', () => {
  it('changed notes, provider, slot, day, intent, trip or hit never resume', async () => {
    const h = createHarness()
    const request = requestFor('single')
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    h.abandon()
    const ticket = h.completions.at(-1)!.retry as WriterRetryTicket
    expect(ticket.picks[0].notes).toBe('Added from nearby suggestions')

    const forged: Array<[string, WriterRetryTicket]> = [
      ['notes', { ...ticket, picks: [{ ...ticket.picks[0], notes: 'different note' }] }],
      ['slot', { ...ticket, picks: [{ ...ticket.picks[0], slotKey: 'dinner' }] }],
      ['day', {
        ...ticket,
        context: { tripId: TRIP_ID, dayId: DAY_B, dayIndex: 1 },
        picks: [{ ...ticket.picks[0], dayId: DAY_B, dayIndex: 1 }],
      }],
      ['intent', { ...ticket, intent: 'batch' }],
      ['trip', { ...ticket, context: { ...ticket.context, tripId: 'trip-other' } }],
      ['provider', {
        ...ticket,
        picks: [{ ...ticket.picks[0], hit: { ...PICK_A, placeId: 'P-OTHER', source: 'mappls' } }],
      }],
      // A keyless hit has no provider identity, so a changed name/position is a
      // genuinely different place under the shared fallback rule.
      ['hit', {
        ...ticket,
        picks: [{
          ...ticket.picks[0],
          hit: { id: 'p-retry-a', name: 'Other Cafe', latitude: 10.5, longitude: 70.5, kind: 'poi', category: 'food' },
        }],
      }],
    ]

    for (const [label, candidate] of forged) {
      const result = await retryWriterStage(h.deps, candidate)
      expect(result.status, label).toBe('refused')
      if (result.status === 'refused') {
        expect(result.reason, label).toBe('gate-busy')
        expect(result.resume?.disposition, label).toBe('payload-changed')
      }
      expect(h.stages, label).toHaveLength(1)
    }
    expect(h.resolverCalls()).toBe(request.picks.length)
    expect(h.gate.operation(first.operationId)?.phase).toBe('uncertain')
    expect(h.gate.isReserved(PICK_A, TRIP_ID)).toBe(true)
  })

  it('a changed note is captured as content, not overwritten on a true retry', async () => {
    const h = createHarness()
    const original = { ...PICK_A }
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    h.abandon()
    const ticket = h.completions.at(-1)!.retry as WriterRetryTicket

    // The ticket is a snapshot: mutating the caller's hit cannot rewrite it.
    expect(ticket.picks[0].hit).not.toBe(original)
    original.name = 'Mutated after staging'
    expect(ticket.picks[0].hit.name).toBe('Highway Cafe')

    // A different note under the old id is refused, and the original note is
    // still what the exact retry stages.
    const forged = await retryWriterStage(h.deps, {
      ...ticket,
      picks: [{ ...ticket.picks[0], notes: 'Changed content' }],
    })
    expect(forged.status).toBe('refused')
    if (forged.status === 'refused') expect(forged.resume?.disposition).toBe('payload-changed')

    const retried = await retryWriterStage(h.deps, ticket)
    expect(retried.status).toBe('staged')
    if (retried.status !== 'staged') return
    expect(retried.planned[0].plan.stop.notes).toBe('Added from nearby suggestions')
    expect(retried.planned[0].plan.stop.title).toBe('Highway Cafe')
  })
  it('a provider alias resumes the captured hit, never the alias text or position', async () => {
    const h = createHarness()
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    h.abandon()
    const ticket = h.completions.at(-1)!.retry as WriterRetryTicket
    // Same placeId/source is the same entity under isSameEntity; the lock is
    // that the write uses the FIRST captured payload, not this alias's text.
    const aliasTicket: WriterRetryTicket = {
      ...ticket,
      picks: [{
        ...ticket.picks[0],
        hit: {
          ...ticket.picks[0].hit,
          id: 'alias-raw-id',
          name: 'HIGHWAY  cafe',
          latitude: 11.1,
          longitude: 71.1,
        },
      }],
    }
    const retried = await retryWriterStage(h.deps, aliasTicket)
    expect(retried.status).toBe('staged')
    if (retried.status !== 'staged') return
    expect(retried.planned[0].plan.stop.title).toBe('Highway Cafe')
    expect(retried.planned[0].plan.stop.lat).toBe(10.4)
    expect(retried.planned[0].plan.stop.lng).toBe(70.4)
    expect(h.resolverCalls()).toBe(1)
  })
})

describe('a retry never resumes settled, in-flight or forgotten work', () => {
  it('a settled operation offers no ticket and a stale ticket is refused', async () => {
    const h = createHarness()
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstStopId = stopIdsOf(h, first.operationId)[0]
    h.abandon()
    const uncertain = h.completions.at(-1)!
    const ticket = uncertain.retry as WriterRetryTicket
    expect(ticket).toBeDefined()

    // The retry actually lands exactly one visit.
    const retried = await retryWriterStage(h.deps, ticket)
    expect(retried.status).toBe('staged')
    h.acknowledge(RECEIPT)
    expect(savedStopCount(h.current(), firstStopId)).toBe(1)
    expect(h.completions.at(-1)!.retry).toBeUndefined()
    expect(h.gate.retryTicket(first.operationId)).toBeNull()

    const again = await retryWriterStage(h.deps, ticket)
    expect(again.status).toBe('refused')
    if (again.status === 'refused') expect(again.resume?.disposition).toBe('operation-settled')
    expect(h.stages).toHaveLength(2)
    expect(savedStopCount(h.current(), firstStopId)).toBe(1)
  })

  it('a same-choice production stage hands the gate the uncertain operation id', async () => {
    const h = createHarness()
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    h.abandon()
    const ticket = h.completions.at(-1)!.retry as WriterRetryTicket
    const originalBegin = h.gate.begin
    let seenOperationId: string | undefined
    h.gate.begin = request => {
      seenOperationId = request.operationId
      return originalBegin(request)
    }
    // No explicit operationId in this request: the production caller repeats
    // the same choice, and the caller boundary resolves the captured identity.
    const resumed = await stageWriterPicks(h.deps, {
      context: ticket.context,
      intent: ticket.intent,
      picks: ticket.picks,
    })
    expect(resumed.status).toBe('staged')
    if (resumed.status !== 'staged') return
    expect(seenOperationId).toBe(first.operationId)
    expect(resumed.operationId).toBe(first.operationId)
    expect(h.resolverCalls()).toBe(1)
  })

  it('a notes-only change without an explicit id is refused, never resumed', async () => {
    const h = createHarness()
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    h.abandon()
    const ticket = h.completions.at(-1)!.retry as WriterRetryTicket
    const changed = await stageWriterPicks(h.deps, {
      context: ticket.context,
      intent: ticket.intent,
      picks: [{ ...ticket.picks[0], notes: 'Changed content' }],
    })
    expect(changed.status).toBe('refused')
    if (changed.status === 'refused') expect(changed.resume?.disposition).toBe('payload-changed')
    expect(h.stages).toHaveLength(1)
    expect(h.gate.isReserved(PICK_A, TRIP_ID)).toBe(true)
  })

  it('an admitted in-flight operation is not retried and starts no write', async () => {
    const h = createHarness()
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    expect(h.gate.retryTicket(first.operationId)).toBeNull()
    const request = requestFor('single')
    const ticket: WriterRetryTicket = {
      operationId: first.operationId,
      context: request.context,
      intent: 'single',
      picks: request.picks.map(pick => ({
        hit: pick.hit,
        slotKey: pick.slotKey,
        dayId: pick.dayId ?? null,
        dayIndex: pick.dayIndex ?? request.context.dayIndex,
        ...(pick.notes ? { notes: pick.notes } : {}),
      })),
    }
    const result = await retryWriterStage(h.deps, ticket)
    expect(result.status).toBe('refused')
    if (result.status === 'refused') expect(result.reason).toBe('gate-busy')
    expect(h.stages).toHaveLength(1)
    expect(h.resolverCalls()).toBe(1)
  })

  it('a retry refused by missing road keeps the uncertain identity and reservation', async () => {
    const h = createHarness()
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    h.abandon()
    const ticket = h.completions.at(-1)!.retry as WriterRetryTicket
    const road = h.deps.road
    h.deps.road = null
    const refused = await retryWriterStage(h.deps, ticket)
    expect(refused.status).toBe('refused')
    if (refused.status === 'refused') expect(refused.reason).toBe('road-evidence-unavailable')
    // A retry is not a new operation: a planning refusal must not discard the
    // original uncertainty or release the place.
    expect(h.gate.operation(first.operationId)?.phase).toBe('uncertain')
    expect(h.gate.retryTicket(first.operationId)).not.toBeNull()
    expect(h.gate.isReserved(PICK_A, TRIP_ID)).toBe(true)
    expect(h.stages).toHaveLength(1)

    h.deps.road = road
    const retried = await retryWriterStage(h.deps, ticket)
    expect(retried.status).toBe('staged')
  })

  it('a retry preview keeps the operation uncertain and discard stays retryable', async () => {
    const h = createHarness()
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    h.abandon()
    const ticket = h.completions.at(-1)!.retry as WriterRetryTicket
    const retried = await retryWriterStage(h.deps, ticket)
    expect(retried.status).toBe('staged')
    // An open retry preview is not an acknowledgement: the write stays
    // uncertain and no longer becomes unreachable after a discard.
    expect(h.gate.operation(first.operationId)?.phase).toBe('uncertain')
    expect(h.gate.retryTicket(first.operationId)).not.toBeNull()

    h.discard()
    // The original write may still be pending: closing the retry preview
    // returns to uncertain instead of releasing the reservation.
    expect(h.gate.operation(first.operationId)?.phase).toBe('uncertain')
    expect(h.gate.retryTicket(first.operationId)).not.toBeNull()
    expect(h.gate.isReserved(PICK_A, TRIP_ID)).toBe(true)

    const again = await retryWriterStage(h.deps, ticket)
    expect(again.status).toBe('staged')
    expect(h.stages).toHaveLength(3)
  })

  it('a forgotten operation is refused as unknown and mints no new work under the id', async () => {
    const h = createHarness()
    const first = await stageIntent(h, 'single')
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    h.abandon()
    const ticket = h.completions.at(-1)!.retry as WriterRetryTicket
    h.gate.reset()
    expect(h.gate.retryTicket(first.operationId)).toBeNull()

    const result = await retryWriterStage(h.deps, ticket)
    expect(result.status).toBe('refused')
    if (result.status === 'refused') {
      expect(result.reason).toBe('gate-busy')
      expect(result.resume?.disposition).toBe('operation-unknown')
    }
    expect(h.stages).toHaveLength(1)
    expect(h.gate.operation(first.operationId)).toBeUndefined()
  })
})

describe('the arc caller stages and retries through the same contract', () => {
  it('retryArcAdd replays the captured arc and speaks a changed payload', async () => {
    const h = createHarness()
    const plan: ArcPickPlan = {
      picks: [{ hit: PICK_A, slotKey: null, dayId: DAY_A, dayIndex: 0 }],
      unresolved: [],
      alreadyPlanned: 0,
    }
    const first = await stageArcAdd(h.deps, { tripId: TRIP_ID, plan })
    expect(first.status).toBe('staged')
    if (first.status !== 'staged') return
    const firstStopId = first.result.planned[0].plan.stop.id
    h.abandon()
    const ticket = h.completions.at(-1)!.retry as WriterRetryTicket
    expect(ticket.operationId).toBe(first.result.operationId)

    // A changed slot under the old arc id is refused and its line says so.
    const changed = await retryArcAdd(h.deps, plan, {
      ...ticket,
      picks: [{ ...ticket.picks[0], slotKey: 'unexpected-slot' }],
    })
    expect(changed.status).toBe('refused')
    if (changed.status === 'refused') {
      expect(changed.resume?.disposition).toBe('payload-changed')
      expect(arcStageLine('Fort trail', changed).text).toContain('replaced this save')
    }
    expect(h.stages).toHaveLength(1)

    const retried = await retryArcAdd(h.deps, plan, ticket)
    expect(retried.status).toBe('staged')
    if (retried.status !== 'staged') return
    expect(retried.result.operationId).toBe(first.result.operationId)
    expect(retried.result.planned[0].plan.stop.id).toBe(firstStopId)
    expect(h.resolverCalls()).toBe(1)
    h.acknowledge(RECEIPT)
    expect(savedStopCount(h.current(), firstStopId)).toBe(1)
  })
})

describe('the real useMapWriters action reaches the repaired resume path', () => {  it('addPoiToDay -> user retry -> same captured operation and one saved visit', async () => {
    const workspace = createWorkspace(tripFixture())
    const gate = createWriterOperationGate()
    const trip = workspace.current()
    let resolverCalls = 0
    const resolvePick = async (requested: PlaceHit) => {
      resolverCalls += 1
      return requested
    }
    let api: ReturnType<typeof useMapWriters> | null = null
    function Probe() {
      api = useMapWriters({
        resolvePick,
        applyChange: workspace.applyChange,
        trip,
        pois: [],
        routeKmOf,
        anchors: [],
        routePolyline: null,
        activeDayIndex: 0,
        activeDaySlots: [],
        markStaged: () => {},
        addingAny: false,
        addingIdsRef: { current: new Set<string>() },
        setAddingIds: () => {},
        setAddingAny: () => {},
        fillingDay: false,
        setFillingDay: () => {},
        setDnaTick: () => {},
        setOpenSlotKey: () => {},
        currentTrip: workspace.current,
        operationGate: gate,
        roadMeasured: true,
        routeKey: ROUTE,
      })
      return null
    }
    renderToStaticMarkup(createElement(Probe))
    expect(api).not.toBeNull()
    const writerApi = api as unknown as ReturnType<typeof useMapWriters>
    expect(typeof writerApi.retryUncertain).toBe('function')

    await writerApi.addPoiToDay(PICK_A, 0)
    expect(workspace.stages).toHaveLength(1)
    const operationId = workspace.stages[0].operationId
    expect(operationId).toBeTruthy()
    expect(resolverCalls).toBe(1)
    const stopId = gate.operation(operationId!)!.items[0].stopId

    // The user closed the unconfirmed preview: this is a genuine retry, not a
    // matching pick rebuilt from the current UI.
    workspace.abandon()
    await writerApi.retryUncertain(operationId!)

    expect(workspace.stages).toHaveLength(2)
    expect(workspace.stages[1].operationId).toBe(operationId)
    expect(gate.operation(operationId!)!.items.map(item => item.stopId)).toEqual([stopId])
    expect(resolverCalls).toBe(1)
    expect(workspace.stages[1].proposed.days.find(entry => entry.id === DAY_A)!.stops
      .filter(saved => saved.id === stopId)).toHaveLength(1)

    workspace.acknowledge(RECEIPT)
    expect(gate.operation(operationId!)?.phase).toBe('applied')
    expect(savedStopCount(workspace.current(), stopId)).toBe(1)
    expect(gate.retryTicket(operationId!)).toBeNull()

    // The runner is consumed once: a second call is a no-op, not a write.
    const stagesBefore = workspace.stages.length
    await writerApi.retryUncertain(operationId!)
    expect(workspace.stages).toHaveLength(stagesBefore)
  })
})
