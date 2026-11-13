// ============ #841 - the arc Undo line never promises an unchanged plan ============
//
// A guarded Undo can end three ways. Only an admitted inverse is "pulled back".
// A refused Undo changed nothing, so it may say it left the stops alone. An Undo
// that was not admitted is different: the store may already hold the inverse
// locally, queued in Saved edits, so no line may say the plan was not changed.
//
// These tests call the real `arcUndoLine` over every outcome the real
// `guardedUndo` type allows, and run `guardedUndo` itself for the not-admitted
// path. Only the store's admission answer is controlled.
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { ItineraryStop, Trip } from '../src/data/types'
import { arcUndoLine } from '../src/pages/trip/map/arcAdd'
import {
  guardedUndo,
  type GuardedUndoOutcome,
} from '../src/pages/trip/map/mapWriterActions'

const UNCHANGED = /not changed|unchanged|nothing (?:was )?(?:changed|saved)/i
const REASONS = ['unconfirmed', 'conflict', 'refused', 'stale', 'unavailable', '', 'anything-the-store-says'] as const

describe('#841 arc Undo copy over every outcome', () => {
  it('the probe fires on the line this repair replaced (known-bad control)', () => {
    expect('Undo was not confirmed. The plan was not changed.').toMatch(UNCHANGED)
  })

  it('a not-admitted Undo never promises the plan is unchanged, whatever the reason', () => {
    for (const reason of REASONS) {
      const line = arcUndoLine('Fort trail', { status: 'not-admitted', reason })
      expect(line.tone, reason).toBe('err')
      expect(line.text, reason).not.toMatch(UNCHANGED)
      expect(line.text, reason).toContain('Saved edits')
    }
  })

  it('an admitted Undo reads as pulled back, and a refused one says the stops were left alone', () => {
    const undone: GuardedUndoOutcome = {
      status: 'undone', receipt: { kind: 'acknowledged', revision: 'rev-1', writeVersion: 1 }, removedStopIds: ['s1'],
    }
    expect(arcUndoLine('Fort trail', undone)).toEqual({ text: '“Fort trail” was pulled back', tone: 'ok' })
    const changed = arcUndoLine('Fort trail', { status: 'refused', reason: 'changed-target', changedStopIds: ['s1'] })
    expect(changed.tone).toBe('err')
    expect(changed.text).toContain('No change')
    const missing = arcUndoLine('Fort trail', { status: 'refused', reason: 'missing-day', changedStopIds: [] })
    expect(missing.text).toContain('Day unavailable')
  })

  it('the real guardedUndo reports not-admitted for every unconfirmed admission, and the line stays truthful', async () => {
    const trip = structuredClone(seedData.trips[0]) as Trip
    const day = { ...trip.days[0]!, id: 'day-undo' }
    const added: ItineraryStop = {
      id: 'arc-stop-1', title: 'Early Fort', category: 'sightseeing', locationName: 'Early Fort', lat: 10, lng: 70,
      visitMinutes: 30, entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have',
      status: 'confirmed', orderInDay: day.stops.length + 1,
    }
    day.stops = [...day.stops, added]
    trip.days = [day, ...trip.days.slice(1)]
    const request = {
      tripId: trip.id,
      operationId: 'op-undo',
      stops: [{ itemId: 'item-1', dayId: day.id, stopId: added.id, expected: structuredClone(added) }],
    }
    // The stop is exactly as saved, so only the store's answer decides the outcome.
    const answers: Array<() => Promise<{ kind: string }>> = [
      async () => ({ kind: 'unavailable' }),
      async () => ({ kind: 'conflict' }),
      async () => ({ kind: 'refused' }),
      async () => { throw new Error('transport down') },
    ]
    for (const answer of answers) {
      const outcome = await guardedUndo({ currentTrip: () => trip, admit: answer }, request)
      expect(outcome.status).toBe('not-admitted')
      const line = arcUndoLine('Fort trail', outcome)
      expect(line.tone).toBe('err')
      expect(line.text).not.toMatch(UNCHANGED)
      expect(line.text).toContain('Saved edits')
    }
    // No admission wired at all is also not an unchanged plan.
    const noAdmit = await guardedUndo({ currentTrip: () => trip }, request)
    expect(noAdmit.status).toBe('not-admitted')
    expect(arcUndoLine('Fort trail', noAdmit).text).not.toMatch(UNCHANGED)
  })
})
