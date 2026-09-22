// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { anticipate, clockLabel, type AnticipationInput } from '../src/lib/anticipation'

const base: AnticipationInput = {
  tripName: 'Kerala with the crew',
  days: 6,
  travellers: 4,
  roadKm: 412,
  rangeKm: 720,
  fuelHalts: [],
  lunch: null,
  rainyDays: [],
  conflicts: [],
}

describe('anticipation - what the engine already knows', () => {
  it('nothing known produces nothing invented', () => {
    expect(anticipate({ ...base, roadKm: null, days: 0, rangeKm: null })).toEqual([])
  })

  it('the shape line is always available and never padded', () => {
    const items = anticipate(base)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('scale')
    expect(items[0].headline).toBe('6 days, 4 travellers, ~412 km')
    expect(items[0].detail).toContain('69 km a day')
  })

  it('conflicts come first, because a human has to decide about them', () => {
    const items = anticipate({ ...base, conflicts: [{ title: 'The wedding on Day 3 is a 5h drive day', detail: 'Fixed plans and a long drive collide.' }] })
    expect(items[0].kind).toBe('conflict')
    expect(items[0].headline).toContain('wedding')
    // the engine's own explanation travels with it, unabridged
    expect(items[0].detail).toBe('Fixed plans and a long drive collide.')
    // and they are capped at two - this is a glance, not a report
    const many = anticipate({ ...base, conflicts: [{ title: 'a', detail: '' }, { title: 'b', detail: '' }, { title: 'c', detail: '' }, { title: 'd', detail: '' }] })
    expect(many.filter(i => i.kind === 'conflict')).toHaveLength(2)
  })

  it('weather speaks in days and stops being a claim when the forecast is empty', () => {
    expect(anticipate({ ...base, rainyDays: [] }).some(i => i.kind === 'weather')).toBe(false)
    const one = anticipate({ ...base, rainyDays: [2] })
    expect(one.find(i => i.kind === 'weather')!.headline).toBe('Rain likely on Day 3')
    const two = anticipate({ ...base, rainyDays: [2, 4] })
    expect(two.find(i => i.kind === 'weather')!.headline).toBe('Rain likely on Days 3 and 5')
    const run = anticipate({ ...base, rainyDays: [1, 2, 3] })
    expect(run.find(i => i.kind === 'weather')!.headline).toBe('Rain likely on Days 2-4')
  })

  it('an out-of-range rainy index is ignored rather than rendered as a fantasy day', () => {
    const items = anticipate({ ...base, rainyDays: [9, -2] })
    expect(items.some(i => i.kind === 'weather')).toBe(false)
  })

  it('the meal line carries the real clock time', () => {
    const items = anticipate({ ...base, lunch: { title: 'Cherthala', atMin: 12 * 60 + 40 } })
    const meal = items.find(i => i.kind === 'meal')!
    expect(meal.headline).toBe('Lunch lands near Cherthala around 12:40pm')
    expect(meal.detail).toContain('11:30am')
  })

  it('fuel: real halts are named; without them the arithmetic still states something checkable', () => {
    const withHalts = anticipate({ ...base, fuelHalts: [{ title: 'Cherthala', cumKm: 87 }, { title: 'Adoor', cumKm: 290 }] })
    const f1 = withHalts.find(i => i.kind === 'fuel')!
    expect(f1.headline).toBe('2 fuel halts on the way')
    expect(f1.detail).toContain('Cherthala (~87 km)')
    expect(f1.detail).toContain('Adoor (~290 km)')

    // arithmetic path: 412 km on a 250 km tank needs one refuel
    const arith = anticipate({ ...base, fuelHalts: [], rangeKm: 250, roadKm: 412 })
    const f2 = arith.find(i => i.kind === 'fuel')!
    expect(f2.headline).toBe('About 1 refuel stop on this run')
    expect(f2.detail).toContain('412 km')
    expect(f2.detail).toContain('250 km tank')

    // a tank that covers the whole run says nothing at all - no fake urgency
    expect(anticipate({ ...base, fuelHalts: [], rangeKm: 720 }).some(i => i.kind === 'fuel')).toBe(false)
  })

  it('the list is capped at four, ranked conflicts -> weather -> meal -> fuel', () => {
    const items = anticipate({
      ...base,
      conflicts: [{ title: 'wedding clash', detail: 'drive day collides' }],
      rainyDays: [2],
      lunch: { title: 'Cherthala', atMin: 760 },
      fuelHalts: [{ title: 'Adoor', cumKm: 290 }],
    })
    expect(items).toHaveLength(4)
    expect(items.map(i => i.kind)).toEqual(['conflict', 'weather', 'meal', 'fuel'])
  })

  it('clockLabel is a real 12-hour clock, not a 24-hour one', () => {
    expect(clockLabel(0)).toBe('12:00am')
    expect(clockLabel(9 * 60 + 5)).toBe('9:05am')
    expect(clockLabel(12 * 60)).toBe('12:00pm')
    expect(clockLabel(12 * 60 + 40)).toBe('12:40pm')
    expect(clockLabel(21 * 60)).toBe('9:00pm')
    expect(clockLabel(23 * 60 + 59)).toBe('11:59pm')
  })

  it('a single-day trip does not pretend to have a weather spread', () => {
    const items = anticipate({ ...base, days: 1, rainyDays: [0] })
    expect(items.some(i => i.kind === 'weather')).toBe(false)
  })
})
