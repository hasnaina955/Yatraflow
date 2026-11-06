import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only the RPC, session and persistence transports are controlled here. The
// caller adapter, the shared planner and the store decisions run for real.
const { transport } = vi.hoisted(() => ({
  transport: {
    calls: [] as Array<{ commandId: string; command: Record<string, unknown> }>,
    response: null as unknown,
    error: null as { code?: string; message?: string } | null,
    throws: false,
  },
}))

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    rpc: async (_name: string, args: { p_command_id: string; p_command: Record<string, unknown> }) => {
      transport.calls.push({ commandId: args.p_command_id, command: args.p_command })
      if (transport.throws) throw new Error('transport down')
      return { data: transport.response, error: transport.error }
    },
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  },
}))

import type { Trip, TripDecision } from '../src/data/types'
import { buildRoadChain, roadChainSig } from '../src/lib/tripRoad'
import type { RoadLeg } from '../src/lib/routing'
import {
  planDecisionResolution,
  slotResolutionRoadFor,
  type DecisionResolutionInput,
  type SlotResolutionRoad,
} from '../src/pages/trip/slotResolutionAdapter'

const owner = 'owner-841'
const optionId = 'slot:lunch:winner'
const decisionId = 'decision-841'
const tripId = 'trip-841'
const dayId = 'day-a'

function trip(): Trip {
  return {
    id: tripId, title: 'Trip', destination: 'Test', startDate: '2026-11-01', endDate: '2026-11-02',
    attendees: 2, ownerId: owner, writeVersion: 7, createdAt: 1, updatedAt: 1,
    transportMode: 'car', roundTrip: false,
    days: [
      { id: dayId, index: 0, date: '2026-11-01', label: 'Day 1', stops: [
        { id: 'st-start', title: 'Start', category: 'travel', locationName: 'Start', lat: 10.0, lng: 76.0,
          visitMinutes: 0, orderInDay: 1, status: 'confirmed' },
        { id: 'st-stay', title: 'Stay', category: 'hotel', locationName: 'Stay', lat: 10.5, lng: 76.5,
          visitMinutes: 0, orderInDay: 2, status: 'confirmed' },
      ] },
    ],
    members: [{ userId: owner, role: 'owner', joinedAt: 1 }],
    expenses: [], collaborators: [],
  } as Trip
}

function slotDecision(): TripDecision {
  return {
    id: decisionId, tripId, question: 'Lunch?', context: '',
    options: [
      { id: optionId, label: 'Cafe', place: {
        title: 'Cafe', category: 'food', locationName: 'Cafe', lat: 10.2, lng: 76.2,
        visitMinutes: 45, dayId, dayIndex: 0,
      } },
      { id: 'slot:lunch:other', label: 'Other' },
    ],
    votesByUserId: { [owner]: optionId }, comments: [], status: 'open',
    raisedBy: owner, createdAt: 1,
  }
}

function genericDecision(): TripDecision {
  return {
    id: decisionId, tripId, question: 'Lunch?', context: '',
    options: [
      { id: 'o:cafe', label: 'Cafe', place: {
        title: 'Cafe', category: 'food', locationName: 'Cafe', lat: 10.2, lng: 76.2,
        visitMinutes: 45, dayId, dayIndex: 0,
      } },
      { id: 'o:other', label: 'Other' },
    ],
    votesByUserId: { [owner]: 'o:cafe' }, comments: [], status: 'open',
    raisedBy: owner, createdAt: 1,
  }
}

function applied(winner = optionId, status = 'applied') {
  return {
    status, tripRevision: 8, winnerId: winner,
    placementStatus: 'applied', stopId: 'st_winner',
    decision: {
      id: decisionId, trip_id: tripId, question: 'Lunch?', options: [],
      votes_by_user_id: {}, comments: [], status: 'resolved',
      resolved_option_id: winner, resolved_stop_id: 'st_winner', raised_by: owner,
    },
  }
}

function measuredRoad(t: Trip): SlotResolutionRoad {
  const km: Record<string, number> = {
    '10,76': 0,
    '10.5,76.5': 100,
    '10.2,76.2': 40,
  }
  return {
    routeKey: roadChainSig(t),
    routeKmOf: (lat, lng) => km[`${lat},${lng}`] ?? null,
  }
}

const freshStore = async () => {
  const store = await import('../src/store/store')
  store._setTripWriteDebounceMs(0)
  return store
}

describe('#841 resolved slot vote uses one ordered atomic production caller', () => {
  let store: Awaited<ReturnType<typeof freshStore>>

  beforeEach(() => {
    vi.resetModules()
    transport.calls = []
    transport.response = applied()
    transport.error = null
    transport.throws = false
  })

  async function setup(decision: TripDecision = slotDecision()) {
    store = await freshStore()
    const db = store.getSnapshot()
    db.sessionUserId = owner
    db.trips = [trip()]
    db.decisions = [decision]
    return { liveTrip: store.tripById(tripId)!, decision }
  }

  // The production caller builds its target with this adapter, then calls the
  // real store. No decision, planner or writer module is replaced here.
  async function callProduction(input: DecisionResolutionInput) {
    const plan = planDecisionResolution(input)
    if (plan.kind === 'refused') return { plan, outcome: undefined }
    const outcome = await store.resolveDecision(input.decision.id, input.optionId, plan.target)
    return { plan, outcome }
  }

  it('sends one ordered atomic RPC with the captured revision for a winner before the stay', async () => {
    const { liveTrip, decision } = await setup()
    const { plan, outcome } = await callProduction({ trip: liveTrip, decision, optionId, road: measuredRoad(liveTrip) })
    expect(plan.kind).toBe('ordered')
    expect(outcome).toMatchObject({ status: 'applied', placement: { status: 'applied', stopId: 'st_winner' } })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).toMatchObject({
      type: 'decision.resolve', decisionId, optionId,
      expectedRevision: 7, dayId,
      orderedPlacement: { dayId, beforeStopId: 'st-stay' },
    })
  })

  it('keeps the stored ballot id on the ordered command', async () => {
    const { liveTrip, decision } = await setup()
    await callProduction({ trip: liveTrip, decision, optionId, road: measuredRoad(liveTrip) })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command.optionId).toBe(optionId)
  })

  it('captures day, anchor and revision as one unchanged snapshot', async () => {
    const { liveTrip, decision } = await setup()
    const road = measuredRoad(liveTrip)
    const first = planDecisionResolution({ trip: liveTrip, decision, optionId, road })
    const second = planDecisionResolution({ trip: liveTrip, decision, optionId, road })
    expect(first).toEqual(second)
    expect(first.kind).toBe('ordered')
    if (first.kind !== 'ordered') return
    const snapshot = structuredClone(first.target)
    liveTrip.writeVersion = 99
    expect(first.target).toEqual(snapshot)
  })

  it('refuses before any RPC when the measured road is absent', async () => {
    const { liveTrip, decision } = await setup()
    const { plan, outcome } = await callProduction({ trip: liveTrip, decision, optionId, road: null })
    expect(plan.kind).toBe('refused')
    expect(outcome).toBeUndefined()
    expect(transport.calls).toHaveLength(0)
  })

  it('refuses before any RPC when the measured route is stale', async () => {
    const { liveTrip, decision } = await setup()
    const road: SlotResolutionRoad = { ...measuredRoad(liveTrip), routeKey: 'stale-route-key' }
    const { plan, outcome } = await callProduction({ trip: liveTrip, decision, optionId, road })
    expect(plan.kind).toBe('refused')
    expect(outcome).toBeUndefined()
    expect(transport.calls).toHaveLength(0)
  })

  it('refuses before any RPC when the slot poll has no authoritative day', async () => {
    const decision = slotDecision()
    const place = decision.options[0].place!
    decision.options[0] = { ...decision.options[0], place: { ...place, dayId: undefined } }
    const { liveTrip } = await setup(decision)
    const { plan } = await callProduction({ trip: liveTrip, decision, optionId, road: measuredRoad(liveTrip) })
    expect(plan.kind).toBe('refused')
    expect(transport.calls).toHaveLength(0)
  })

  it('refuses before any RPC when the captured day left the trip', async () => {
    const decision = slotDecision()
    const place = decision.options[0].place!
    decision.options[0] = { ...decision.options[0], place: { ...place, dayId: 'day-gone' } }
    const { liveTrip } = await setup(decision)
    const { plan } = await callProduction({ trip: liveTrip, decision, optionId, road: measuredRoad(liveTrip) })
    expect(plan.kind).toBe('refused')
    expect(transport.calls).toHaveLength(0)
  })

  it('refuses before any RPC when the winning place is off the measured route', async () => {
    const { liveTrip, decision } = await setup()
    const road: SlotResolutionRoad = {
      routeKey: roadChainSig(liveTrip),
      routeKmOf: (lat) => lat === 10 ? 0 : lat === 10.5 ? 100 : null,
    }
    const { plan } = await callProduction({ trip: liveTrip, decision, optionId, road })
    expect(plan.kind).toBe('refused')
    expect(transport.calls).toHaveLength(0)
  })

  it('refuses before any RPC when the captured base became stale', async () => {
    const { liveTrip, decision } = await setup()
    const plan = planDecisionResolution({ trip: liveTrip, decision, optionId, road: measuredRoad(liveTrip) })
    expect(plan.kind).toBe('ordered')
    if (plan.kind !== 'ordered') return
    const db = store.getSnapshot()
    db.trips = db.trips.map(t => t.id === tripId ? { ...t, writeVersion: 8 } : t)
    const outcome = await store.resolveDecision(decision.id, optionId, plan.target)
    expect(outcome.status).toBe('conflict')
    expect(transport.calls).toHaveLength(0)
  })

  it('reports a missing server capability truthfully and never falls back to legacy append', async () => {
    const { liveTrip, decision } = await setup()
    transport.response = null
    transport.error = { code: 'PGRST202', message: 'function not found' }
    const { plan, outcome } = await callProduction({ trip: liveTrip, decision, optionId, road: measuredRoad(liveTrip) })
    expect(plan.kind).toBe('ordered')
    expect(outcome).toMatchObject({ status: 'unavailable' })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls.every(c => c.command.orderedPlacement !== undefined)).toBe(true)
  })

  it('refuses when the server rejects the ordered request as invalid', async () => {
    const { liveTrip, decision } = await setup()
    transport.response = { status: 'invalid', tripRevision: 7, reason: 'unknown key orderedPlacement' }
    const { plan, outcome } = await callProduction({ trip: liveTrip, decision, optionId, road: measuredRoad(liveTrip) })
    expect(plan.kind).toBe('ordered')
    expect(outcome).toMatchObject({ status: 'unavailable' })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).toHaveProperty('orderedPlacement')
  })

  it('keeps the ordered path through an already applied receipt', async () => {
    const { liveTrip, decision } = await setup()
    transport.response = applied(optionId, 'alreadyApplied')
    const { plan, outcome } = await callProduction({ trip: liveTrip, decision, optionId, road: measuredRoad(liveTrip) })
    expect(plan.kind).toBe('ordered')
    expect(outcome).toMatchObject({ status: 'alreadyApplied' })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).toHaveProperty('orderedPlacement')
  })

  it('keeps the generic non-slot decision on the legacy append path', async () => {
    const decision = genericDecision()
    const { liveTrip } = await setup(decision)
    const { plan, outcome } = await callProduction({
      trip: liveTrip, decision, optionId: 'o:cafe', target: { dayId }, road: measuredRoad(liveTrip),
    })
    expect(plan.kind).toBe('legacy')
    expect(outcome).toMatchObject({ status: 'applied' })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).not.toHaveProperty('orderedPlacement')
    expect(transport.calls[0].command.optionId).toBe('o:cafe')
  })

  it('grades an unfinished workspace road measurement as unusable', async () => {
    const { liveTrip } = await setup()
    const chain = buildRoadChain(liveTrip)
    const geometry: [number, number][] = [[76, 10], [76.5, 10.5]]
    const legs: RoadLeg[] = [{ source: 'osrm', distanceKm: 100, durationMinutes: 90, geometry }]
    expect(slotResolutionRoadFor(liveTrip, { status: 'pending', chain, legs })).toBeNull()
    expect(slotResolutionRoadFor(liveTrip, { status: 'failed', chain, legs })).toBeNull()
    const estimateOnly: RoadLeg[] = [{ source: 'estimate', distanceKm: 100, durationMinutes: 90, geometry: [] }]
    expect(slotResolutionRoadFor(liveTrip, { status: 'ok', chain, legs: estimateOnly })).toBeNull()
  })

  it('builds one ordered target from the real workspace measured road shape', async () => {
    const { liveTrip, decision } = await setup()
    const chain = buildRoadChain(liveTrip)
    const geometry: [number, number][] = [[76, 10], [76.5, 10.5]]
    const legs: RoadLeg[] = [{ source: 'osrm', distanceKm: 100, durationMinutes: 90, geometry }]
    const road = slotResolutionRoadFor(liveTrip, { status: 'ok', chain, legs })
    expect(road).not.toBeNull()
    expect(road!.routeKey).toBe(roadChainSig(liveTrip))
    const plan = planDecisionResolution({ trip: liveTrip, decision, optionId, road })
    expect(plan.kind).toBe('ordered')
    if (plan.kind !== 'ordered') return
    expect(plan.target.orderedPlacement).toMatchObject({ dayId, beforeStopId: 'st-stay', expectedRevision: 7 })
    const outcome = await store.resolveDecision(decision.id, optionId, plan.target)
    expect(outcome).toMatchObject({ status: 'applied' })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command.orderedPlacement).toMatchObject({ dayId, beforeStopId: 'st-stay' })
  })
})
