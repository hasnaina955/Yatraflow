import { beforeEach, describe, expect, it, vi } from 'vitest'

const { transport } = vi.hoisted(() => ({
  transport: {
    calls: [] as Array<{ commandId: string; command: Record<string, unknown> }>,
    response: null as unknown,
    throws: false,
  },
}))

vi.mock('../../src/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    rpc: async (_name: string, args: { p_command_id: string; p_command: Record<string, unknown> }) => {
      transport.calls.push({ commandId: args.p_command_id, command: args.p_command })
      if (transport.throws) throw new Error('transport down')
      return { data: transport.response, error: null }
    },
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  },
}))

import type { Trip } from '../../src/data/types'

const owner = 'owner-841'
const freshStore = async () => {
  const store = await import('../../src/store/store')
  store._setTripWriteDebounceMs(0)
  return store
}

function trip(): Trip {
  return {
    id: 'trip-841', name: 'Trip', startLocation: 'Test', destinations: ['Test'], startDate: '2026-11-01', endDate: '2026-11-02',
    travellers: 2, transportMode: 'car', budgetPerPersonInr: 5000, travelStyle: 'balanced',
    fixedCommitments: [], coverEmoji: '🧭', visibility: 'private',
    writeVersion: 7, createdAt: 1, updatedAt: 1,
    days: [
      { id: 'day-a', index: 0, title: 'Day 1', stops: [] },
      { id: 'day-b', index: 1, title: 'Day 2', stops: [] },
    ],
    members: [{ userId: owner, role: 'owner', joinedAt: 1 }],
    expenses: [],
  }
}

function seed(store: Awaited<ReturnType<typeof freshStore>>): void {
  const db = store.getSnapshot()
  db.sessionUserId = owner
  db.trips = [trip()]
  db.decisions = [{
    id: 'decision-841', tripId: 'trip-841', question: 'Lunch?', context: '',
    options: [
      { id: 'slot:lunch:winner', label: 'Winner', place: { title: 'Cafe', category: 'food', locationName: 'Cafe', lat: 15.5, lng: 73.9, visitMinutes: 45, dayId: 'day-a', dayIndex: 0 } },
      { id: 'slot:lunch:other', label: 'Other' },
    ],
    votesByUserId: { [owner]: 'slot:lunch:winner' }, comments: [], status: 'open',
    raisedBy: owner, createdAt: 1,
  }]
}

function applied() {
  return {
    status: 'applied', tripRevision: 8, winnerId: 'slot:lunch:winner',
    placementStatus: 'applied', stopId: 'st_winner',
    decision: {
      id: 'decision-841', trip_id: 'trip-841', question: 'Lunch?', options: [],
      votes_by_user_id: {}, comments: [], status: 'resolved',
      resolved_option_id: 'slot:lunch:winner', resolved_stop_id: 'st_winner', raised_by: owner,
    },
  }
}

describe('stage-c/841 ordered resolution caller', () => {
  let store: Awaited<ReturnType<typeof freshStore>>
  beforeEach(() => {
    vi.resetModules()
    transport.calls = []
    transport.response = applied()
    transport.throws = false
    store = null as unknown as typeof store
  })

  const setup = async () => {
    store = await freshStore()
    seed(store)
  }

  it('sends the explicit day, revision, option and anchor through the existing sender', async () => {
    await setup()
    const outcome = await store.resolveDecision('decision-841', 'slot:lunch:winner', {
      dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: 'st-stay', expectedRevision: 7 },
    })
    expect(outcome).toMatchObject({ status: 'applied', placement: { status: 'applied', stopId: 'st_winner' } })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).toMatchObject({
      type: 'decision.resolve', decisionId: 'decision-841', optionId: 'slot:lunch:winner',
      expectedRevision: 7, dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: 'st-stay' },
    })
    expect(outcome).toMatchObject({ status: 'applied', placement: { status: 'applied', stopId: 'st_winner' } })
  })

  it('omits the new request for legacy callers', async () => {
    await setup()
    await store.resolveDecision('decision-841', 'slot:lunch:winner', { dayId: 'day-a' })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0].command).not.toHaveProperty('orderedPlacement')
  })

  it('reuses the same command id and exact payload for an uncertain retry', async () => {
    await setup()
    transport.response = null
    transport.throws = true
    const request = {
      dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: null, expectedRevision: 7 },
    }
    expect(await store.resolveDecision('decision-841', 'slot:lunch:winner', request)).toMatchObject({ status: 'unavailable' })
    expect(await store.resolveDecision('decision-841', 'slot:lunch:winner', request)).toMatchObject({ status: 'unavailable' })
    expect(transport.calls).toHaveLength(2)
    expect(transport.calls[0].commandId).toBe(transport.calls[1].commandId)
    expect(transport.calls[0].command).toEqual(transport.calls[1].command)
  })

  it('uses a distinct command id when the placement intent changes', async () => {
    await setup()
    transport.response = null
    transport.throws = true
    await store.resolveDecision('decision-841', 'slot:lunch:winner', {
      dayId: 'day-a', dayIndex: 0, orderedPlacement: { dayId: 'day-a', beforeStopId: 'st-a', expectedRevision: 7 },
    })
    await store.resolveDecision('decision-841', 'slot:lunch:winner', {
      dayId: 'day-a', dayIndex: 0, orderedPlacement: { dayId: 'day-a', beforeStopId: 'st-b', expectedRevision: 7 },
    })
    expect(transport.calls).toHaveLength(2)
    expect(transport.calls[0].commandId).not.toBe(transport.calls[1].commandId)
  })

  it('does not reorder the client trip after an acknowledged placement', async () => {
    await setup()
    const before = structuredClone(store.tripById('trip-841'))
    await store.resolveDecision('decision-841', 'slot:lunch:winner', {
      dayId: 'day-a', dayIndex: 0, orderedPlacement: { dayId: 'day-a', beforeStopId: null, expectedRevision: 7 },
    })
    expect(store.tripById('trip-841')).toEqual(before)
  })
})
