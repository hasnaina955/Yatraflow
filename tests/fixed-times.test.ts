// PW-08: the fixed-time read model compares each commitment with the same
// simulated arrival the timeline prints. These tests pin the five honest
// states, the stale-link rule and the optimiser's stop-id handoff.
import { describe, it, expect } from 'vitest'
import { fixedRowsFor, fixedStopIdsOf, waitingMinutesFor, worstFixedTone } from '../src/lib/fixedTimes'
import type { FixedCommitment, ItineraryStop } from '../src/data/types'

const stops = [{ id: 's1' }, { id: 's2' }] as ItineraryStop[]
const schedule = { activeStops: stops, arrivalTimes: ['10:00', '12:10'] }

function fc(over: Partial<FixedCommitment>): FixedCommitment {
  return { id: 'fc', title: 'Commitment', type: 'event', dayIndex: 0, time: '11:00', ...over }
}

describe('fixedRowsFor', () => {
  it('reads an on-time commitment with its spare minutes', () => {
    const [row] = fixedRowsFor(schedule, [fc({ stopId: 's1', time: '11:00' })])
    expect(row.tone).toBe('ok')
    expect(row.arrival).toBe('10:00')
    expect(row.spareMin).toBe(60)
  })

  it('marks under 45 minutes of spare as tight', () => {
    const [row] = fixedRowsFor(schedule, [fc({ stopId: 's2', time: '12:30' })])
    expect(row.tone).toBe('tight')
    expect(row.spareMin).toBe(20)
  })

  it('marks a late arrival as a clash', () => {
    const [row] = fixedRowsFor(schedule, [fc({ stopId: 's2', time: '12:00' })])
    expect(row.tone).toBe('clash')
    expect(row.spareMin).toBe(-10)
  })

  it('keeps an absent or stale link unlinked — never another stop clock', () => {
    const rows = fixedRowsFor(schedule, [
      fc({ id: 'none' }),
      fc({ id: 'stale', stopId: 'gone' }),
    ])
    expect(rows.map(r => r.tone)).toEqual(['unlinked', 'unlinked'])
    expect(rows.map(r => r.arrival)).toEqual([null, null])
  })

  it('treats a hotel check-in as an anchor, not a race', () => {
    const [row] = fixedRowsFor(schedule, [fc({ type: 'hotel-checkin', stopId: 's2', time: '09:00' })])
    expect(row.tone).toBe('anchor')
    expect(row.spareMin).toBe(-190)
  })

  it('does not call a malformed clock on time', () => {
    const [row] = fixedRowsFor(schedule, [fc({ stopId: 's1', time: 'noonish' })])
    expect(row.tone).toBe('invalid')
    expect(row.spareMin).toBeNull()
  })
})

describe('waitingMinutesFor', () => {
  it('counts the spare time before a single commitment', () => {
    const rows = fixedRowsFor(schedule, [fc({ stopId: 's1', time: '11:00' })])
    expect(waitingMinutesFor(rows)).toBe(60)
  })

  it('does not double-count two commitments whose spares overlap', () => {
    // Arriving at 10:00 for an 11:00 commitment and again at 12:10 for a 13:00
    // one is 60 + 50 minutes of spare by row, but the second spare is measured
    // from a clock that already contains the first. The honest total is the
    // elapsed idle time: 10:00 → 11:00, then 12:10 → 13:00.
    const rows = fixedRowsFor(schedule, [
      fc({ id: 'a', stopId: 's1', time: '11:00' }),
      fc({ id: 'b', stopId: 's2', time: '13:00' }),
    ])
    expect(rows.map(r => r.spareMin)).toEqual([60, 50])
    expect(waitingMinutesFor(rows)).toBe(110)
  })

  it('never counts the same minute twice when a spare swallows the next one', () => {
    // Both commitments are due at 11:00 from an arrival of 10:00: the 60 spare
    // minutes are one wait, not two.
    const rows = fixedRowsFor(schedule, [
      fc({ id: 'a', stopId: 's1', time: '11:00' }),
      fc({ id: 'b', stopId: 's1', time: '11:00' }),
    ])
    expect(waitingMinutesFor(rows)).toBe(60)
  })

  it('ignores a late arrival — a clash is not waiting', () => {
    const rows = fixedRowsFor(schedule, [fc({ stopId: 's2', time: '12:00' })])
    expect(waitingMinutesFor(rows)).toBe(0)
  })

  it('reports nothing when a commitment has no honest clock', () => {
    const rows = fixedRowsFor(schedule, [fc({ time: 'noonish' }), fc({ id: 'none' })])
    expect(waitingMinutesFor(rows)).toBe(0)
  })
})

describe('fixedStopIdsOf and worstFixedTone', () => {
  it('hands the optimiser every linked stop id as a string', () => {
    const rows = fixedRowsFor(schedule, [
      fc({ id: 'a', stopId: '42' }),
      fc({ id: 'b' }),
      fc({ id: 'c', stopId: 's2' }),
    ])
    expect(fixedStopIdsOf(rows)).toEqual(['42', 's2'])
  })

  it('chooses the most urgent tone in a group', () => {
    const rows = fixedRowsFor(schedule, [
      fc({ id: 'ok', stopId: 's1', time: '11:00' }),
      fc({ id: 'tight', stopId: 's2', time: '12:30' }),
      fc({ id: 'clash', stopId: 's2', time: '12:00' }),
    ])
    expect(worstFixedTone(rows)).toBe('clash')
    expect(worstFixedTone([])).toBeNull()
  })
})
