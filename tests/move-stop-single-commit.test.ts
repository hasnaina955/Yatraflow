// Regression for #53: moveStopBetweenDays must notify subscribers exactly once.
// The old implementation called touchAndLog() (which commits) then commit()
// again, causing two UI updates per move.
import { describe, it, expect, vi } from 'vitest'
import { seedData } from '../src/data/seed'

vi.mock('../src/lib/supabase', () => {
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {}
    builder.update = () => builder
    builder.insert = () => builder
    builder.delete = () => builder
    builder.select = () => builder
    builder.eq = () => builder
    builder.in = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.then = (res: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(res)
    return builder
  }
  return {
    isSupabaseConfigured: false,
    supabase: { from: () => makeBuilder() },
  }
})

import { duplicateTrip, moveStopBetweenDays, subscribe, tripById } from '../src/store/store'

const keralaTrip = seedData.trips[0]

describe('moveStopBetweenDays single commit (#53)', () => {
  it('notifies subscribers exactly once on a successful cross-day move', () => {
    const copy = duplicateTrip(keralaTrip, 'owner-53')
    const day0 = tripById(copy.id)!.days[0]
    const day1 = tripById(copy.id)!.days[1]
    expect(day0.stops.length).toBeGreaterThan(0)
    expect(day1).toBeDefined()
    const stopId = day0.stops[0].id

    let notifications = 0
    const unsub = subscribe(() => { notifications += 1 })
    notifications = 0
    moveStopBetweenDays(copy.id, stopId, 1)
    unsub()

    expect(notifications).toBe(1)
    expect(tripById(copy.id)!.days[1].stops.some(s => s.id === stopId)).toBe(true)
  })
})
