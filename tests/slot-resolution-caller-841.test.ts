import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only the RPC, session and UI transports are controlled. The orchestration,
// the adapter, the shared planner and the store writer run for real.
const { transport } = vi.hoisted(() => ({
  transport: {
    calls: [] as Array<{ commandId: string; command: Record<string, unknown> }>,
    response: null as unknown,
    error: null as { code?: string; message?: string } | null,
  },
}))

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    rpc: async (_name: string, args: { p_command_id: string; p_command: Record<string, unknown> }) => {
      transport.calls.push({ commandId: args.p_command_id, command: args.p_command })
      return { data: transport.response, error: transport.error }
    },
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  },
}))

import type { Trip, TripDecision } from '../src/data/types'
import type { DecisionResolutionOutcome } from '../src/store/collabCommand'
import type { RoadUnmeasuredReason } from '../src/pages/trip/map/mapTabPipeline'
import { buildRoadChain, roadChainSig, type RoadStatus, type TripRoadView } from '../src/lib/tripRoad'
import type { RoadLeg } from '../src/lib/routing'
import {
  planDecisionResolution,
  runDecisionResolution,
  slotResolutionRoadFor,
  SLOT_RESOLUTION_COPY,
  type DecisionResolutionDeps,
  type SlotResolutionContext,
  type SlotRoadContext,
} from '../src/pages/trip/slotResolutionAdapter'

const owner = 'owner-841'
const optionId = 'slot:lunch:winner'
const decisionId = 'decision-841'
const tripId = 'trip-841'
const dayId = 'day-a'

// Typed fixture builder. It returns a real Trip, with no as-cast.
function makeTrip(overrides: Partial<Trip> = {}): Trip {
  const base: Trip = {
    id: tripId, name: 'Trip', startLocation: 'Kochi', destinations: ['Munnar'],
    startDate: '2026-11-01', endDate: '2026-11-02', travellers: 2,
    transportMode: 'car', budgetPerPersonInr: 5000, travelStyle: 'balanced',
    fixedCommitments: [],
    days: [{
      id: dayId, index: 0, date: '2026-11-01', label: 'Day 1',
      stops: [
        { id: 'st-start', title: 'Start', category: 'travel', locationName: 'Start', lat: 10.0, lng: 76.0,
          visitMinutes: 0, orderInDay: 1, status: 'confirmed' },
        { id: 'st-stay', title: 'Stay', category: 'hotel', locationName: 'Stay', lat: 10.5, lng: 76.5,
          visitMinutes: 0, orderInDay: 2, status: 'confirmed' },
      ],
    }],
    expenses: [], members: [{ userId: owner, role: 'owner', joinedAt: 1 }],
    coverEmoji: '🧭', visibility: 'private', createdAt: 1, updatedAt: 1,
    writeVersion: 7, roundTrip: false,
  }
  return { ...base, ...overrides }
}

function makeDecision(overrides: Partial<TripDecision> = {}): TripDecision {
  const base: TripDecision = {
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
  return { ...base, ...overrides }
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

function measuredContext(t: Trip): SlotRoadContext {
  const km: Record<string, number> = { '10,76': 0, '10.5,76.5': 100, '10.2,76.2': 40 }
  return {
    measured: { routeKey: roadChainSig(t), routeKmOf: (lat, lng) => km[`${lat},${lng}`] ?? null },
    reason: null, status: 'ok', recoverable: false, retry: () => {},
  }
}

function unmeasuredContext(reason: RoadUnmeasuredReason, recoverable: boolean, status: RoadStatus = 'ok'): SlotRoadContext {
  return { measured: null, reason, status, recoverable, retry: () => {} }
}

function makeContext(trip: Trip, road: SlotRoadContext | null): SlotResolutionContext {
  return { trip, road }
}

function measuredRoadView(trip: Trip): TripRoadView {
  const chain = buildRoadChain(trip)
  const geometry: [number, number][] = [[76, 10], [76.5, 10.5]]
  const legs: RoadLeg[] = [{ source: 'osrm', distanceKm: 100, durationMinutes: 90, geometry }]
  return { status: 'ok', chain, legs, retry: () => {} }
}

const freshStore = async () => {
  const store = await import('../src/store/store')
  store._setTripWriteDebounceMs(0)
  return store
}

describe('#841 production caller drives refusal, toast, busy release and ordered RPC', () => {
  let store: Awaited<ReturnType<typeof freshStore>>
  let claimed: number
  let released: number
  let toasts: Array<{ message: string; kind?: string }>
  let reports: DecisionResolutionOutcome[]
  let placementDays: Array<Array<{ id: string; index: number; title?: string }> | null>
  let deps: DecisionResolutionDeps

  beforeEach(async () => {
    vi.resetModules()
    transport.calls = []
    transport.response = applied()
    transport.error = null
    store = await freshStore()
    claimed = 0
    released = 0
    toasts = []
    reports = []
    placementDays = []
    deps = {
      resolveDecision: (decisionIdArg, optionIdArg, target) => store.resolveDecision(decisionIdArg, optionIdArg, target),
      toast: (message, kind) => { toasts.push({ message, kind }) },
      reportCollabOutcome: outcome => { reports.push(outcome) },
      refuseWhileStaged: staged => staged === true,
      claim: () => { claimed += 1; return true },
      release: () => { released += 1 },
      onPlacementDays: days => { placementDays.push(days) },
      onPlacementDayId: () => {},
    }
  })

  function seed(trip: Trip, decision: TripDecision) {
    const db = store.getSnapshot()
    db.sessionUserId = owner
    db.trips = [trip]
    db.decisions = [decision]
  }

  it('sends one ordered RPC for a slot winner and releases the busy claim', async () => {
    const trip = makeTrip()
    const decision = makeDecision()
    seed(trip, decision)
    const flow = await runDecisionResolution(
      { context: makeContext(trip, measuredContext(trip)), decision, optionId }, deps,
    )
    expect(flow.kind).toBe('settled')
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).toMatchObject({
      type: 'decision.resolve', decisionId, optionId, expectedRevision: 7, dayId,
      orderedPlacement: { dayId, beforeStopId: 'st-stay' },
    })
    expect(claimed).toBe(1)
    expect(released).toBe(1)
    expect(toasts.map(t => t.message)).toContain('Decision resolved and placed')
  })

  it('refuses a recoverable road with one toast, zero RPC and a released claim', async () => {
    const trip = makeTrip()
    const decision = makeDecision()
    seed(trip, decision)
    const flow = await runDecisionResolution(
      { context: makeContext(trip, unmeasuredContext('pending', true, 'pending')), decision, optionId }, deps,
    )
    expect(flow.kind).toBe('refused')
    if (flow.kind !== 'refused') return
    expect(flow.reason).toBe('missing-road')
    expect(flow.recoverable).toBe(true)
    expect(flow.copy).toBe(SLOT_RESOLUTION_COPY['missing-road'])
    expect(flow.copy).toContain('Measure the route')
    expect(toasts).toEqual([{ message: SLOT_RESOLUTION_COPY['missing-road'], kind: 'err' }])
    expect(transport.calls).toHaveLength(0)
    expect(released).toBe(1)
  })

  it('refuses a terminal air road with an honest unavailable message', async () => {
    const trip = makeTrip({ transportMode: 'flight' })
    const decision = makeDecision()
    seed(trip, decision)
    const flow = await runDecisionResolution(
      { context: makeContext(trip, unmeasuredContext('air-journey', false)), decision, optionId }, deps,
    )
    expect(flow.kind).toBe('refused')
    if (flow.kind !== 'refused') return
    expect(flow.reason).toBe('road-unavailable')
    expect(flow.recoverable).toBe(false)
    expect(flow.copy).toBe(SLOT_RESOLUTION_COPY['road-unavailable'])
    expect(flow.copy).toContain('unavailable')
    expect(flow.copy).not.toMatch(/try again|route is ready/i)
    expect(transport.calls).toHaveLength(0)
  })

  it('grades a genuinely stale measurement chain with a truthful reason', async () => {
    const trip = makeTrip()
    const decision = makeDecision()
    seed(trip, decision)
    const view = measuredRoadView(trip)
    const staleChain = { ...view.chain!, points: [...view.chain!.points, { lat: 9, lng: 75 }] }
    const staleView: TripRoadView = { ...view, chain: staleChain }
    const context = slotResolutionRoadFor(trip, staleView)
    expect(context.measured).toBeNull()
    expect(context.reason).toBe('stale-chain')
    const plan = planDecisionResolution({ trip, decision, optionId, road: context })
    expect(plan.kind).toBe('refused')
    if (plan.kind !== 'refused') return
    expect(plan.reason).toBe('stale-road')
    expect(plan.detail).toBe('stale-chain')
    const flow = await runDecisionResolution(
      { context: makeContext(trip, context), decision, optionId }, deps,
    )
    expect(flow.kind).toBe('refused')
    if (flow.kind === 'refused') expect(flow.copy).toBe(SLOT_RESOLUTION_COPY['stale-road'])
    expect(transport.calls).toHaveLength(0)
  })

  it('refuses a fractional write version before any RPC', async () => {
    const trip = makeTrip({ writeVersion: 7.5 })
    const decision = makeDecision()
    seed(trip, decision)
    const plan = planDecisionResolution({ trip, decision, optionId, road: measuredContext(trip) })
    expect(plan.kind).toBe('refused')
    if (plan.kind === 'refused') expect(plan.reason).toBe('stale-base')
    const flow = await runDecisionResolution(
      { context: makeContext(trip, measuredContext(trip)), decision, optionId }, deps,
    )
    expect(flow.kind).toBe('refused')
    expect(transport.calls).toHaveLength(0)
    expect(released).toBe(1)
  })

  it('refuses before claim and RPC while a preview is staged', async () => {
    const trip = makeTrip()
    const decision = makeDecision()
    seed(trip, decision)
    const flow = await runDecisionResolution(
      { context: makeContext(trip, measuredContext(trip)), decision, optionId, previewOpen: true }, deps,
    )
    expect(flow.kind).toBe('staged')
    expect(transport.calls).toHaveLength(0)
    expect(claimed).toBe(0)
    expect(released).toBe(0)
  })

  it('opens a deliberate day picker on missing-day and retries the exact day and ballot id', async () => {
    const trip = makeTrip()
    const decision = makeDecision()
    const place = decision.options[0].place!
    decision.options[0] = { ...decision.options[0], place: { ...place, dayId: undefined } }
    seed(trip, decision)
    const context = makeContext(trip, measuredContext(trip))
    const first = await runDecisionResolution({ context, decision, optionId }, deps)
    expect(first.kind).toBe('refused')
    if (first.kind === 'refused') expect(first.reason).toBe('missing-day')
    expect(transport.calls).toHaveLength(0)

    toasts.length = 0
    const retry = await runDecisionResolution(
      { context, decision, optionId, target: { dayId } }, deps,
    )
    expect(retry.kind).toBe('settled')
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).toMatchObject({
      optionId, dayId, orderedPlacement: { dayId, beforeStopId: 'st-stay' },
    })
  })

  it('keeps a generic non-slot decision on the legacy path', async () => {
    const trip = makeTrip()
    const decision = makeDecision({ options: [
      { id: 'o:cafe', label: 'Cafe' }, { id: 'o:other', label: 'Other' },
    ], votesByUserId: { [owner]: 'o:cafe' } })
    seed(trip, decision)
    const flow = await runDecisionResolution(
      { context: makeContext(trip, measuredContext(trip)), decision, optionId: 'o:cafe', target: { dayId } }, deps,
    )
    expect(flow.kind).toBe('settled')
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).not.toHaveProperty('orderedPlacement')
    expect(transport.calls[0].command.optionId).toBe('o:cafe')
  })

  it('performs no RPC and no release when the busy claim is refused', async () => {
    const trip = makeTrip()
    const decision = makeDecision()
    seed(trip, decision)
    const flow = await runDecisionResolution(
      { context: makeContext(trip, measuredContext(trip)), decision, optionId },
      { ...deps, claim: () => false },
    )
    expect(flow.kind).toBe('not-claimed')
    expect(transport.calls).toHaveLength(0)
    expect(released).toBe(0)
  })

  it('reports a missing server capability without a legacy fallback', async () => {
    const trip = makeTrip()
    const decision = makeDecision()
    seed(trip, decision)
    transport.response = null
    transport.error = { code: 'PGRST202', message: 'function not found' }
    const flow = await runDecisionResolution(
      { context: makeContext(trip, measuredContext(trip)), decision, optionId }, deps,
    )
    expect(flow.kind).toBe('settled')
    if (flow.kind === 'settled') expect(flow.outcome.status).toBe('unavailable')
    expect(reports).toHaveLength(1)
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).toHaveProperty('orderedPlacement')
  })

  it('grades a flight workspace as terminal with no retry', () => {
    const trip = makeTrip({ transportMode: 'flight' })
    const context = slotResolutionRoadFor(trip, measuredRoadView(trip))
    expect(context.measured).toBeNull()
    expect(context.reason).toBe('air-journey')
    expect(context.recoverable).toBe(false)
  })

  it('builds one ordered target from the real workspace measured road shape', () => {
    const trip = makeTrip()
    const decision = makeDecision()
    const context = slotResolutionRoadFor(trip, measuredRoadView(trip))
    expect(context.measured).not.toBeNull()
    expect(context.measured!.routeKey).toBe(roadChainSig(trip))
    const plan = planDecisionResolution({ trip, decision, optionId, road: context })
    expect(plan.kind).toBe('ordered')
    if (plan.kind === 'ordered') {
      expect(plan.target.orderedPlacement).toMatchObject({ dayId, beforeStopId: 'st-stay', expectedRevision: 7 })
    }
  })
})
