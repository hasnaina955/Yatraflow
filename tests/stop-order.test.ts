// ============ #337 / #339 — the per-day order invariant, in one place ============
//
// The itinerary contract is 1-based, CONTIGUOUS `orderInDay` per day, and three
// surfaces used to write orders independently: a Timeline delete filtered the
// stop out and left `[1,3]`, the next add computed `length + 1` = 3, and the day
// held two stops claiming position 3 (the engine sorts by that number, the
// importer repairs it — the live data sat between the two). A cross-day move
// that named a day which no longer existed spliced the source first and dropped
// the stop on the floor. The Map's slot fill shipped without the `+ 1` every
// sibling has.
//
// Every writer now calls src/lib/stopOrder.ts, so the rules are pinned here —
// plus three narrow source assertions that bind the Timeline's page handlers to
// the helpers (the handlers themselves need a DOM the node-env suite does not
// have; a UI bug of exactly this class is what shipped).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  dayHoldingStop, hasStopNamed, moveStopToDay, moveStopWithinDay, nextOrderInDay,
  removeStopFromDay, renumberDay, roadOrderInsertionIndex, stopById, stopsInOrder,
} from '../src/lib/stopOrder'
import type { ItineraryDay, ItineraryStop } from '../src/data/types'

function stop(id: string, orderInDay: number, over: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id, title: id, category: 'sightseeing', locationName: id,
    lat: 10, lng: 76, visitMinutes: 30,
    entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'nice-to-have', status: 'confirmed', orderInDay,
    ...over,
  }
}

function day(index: number, stops: ItineraryStop[]): ItineraryDay {
  return { id: `d${index}`, index, stops }
}

const orders = (d: ItineraryDay) => stopsInOrder(d).map(s => s.orderInDay)
const ids = (d: ItineraryDay) => stopsInOrder(d).map(s => s.id)

describe('renumberDay — the invariant writer', () => {
  it('closes a gap left by a delete, in order', () => {
    // Delete the middle of [1,2,3] without renumbering → survivors [1,3].
    const d = day(0, [stop('a', 1), stop('c', 3)])
    renumberDay(d)
    expect(orders(d)).toEqual([1, 2])
    expect(ids(d)).toEqual(['a', 'c'])
  })

  it('sorts by the stored order first, so a scrambled array becomes canonical', () => {
    const d = day(0, [stop('c', 3), stop('a', 1), stop('b', 2)])
    renumberDay(d)
    expect(ids(d)).toEqual(['a', 'b', 'c'])
    expect(d.stops.map(s => s.id)).toEqual(['a', 'b', 'c']) // canonical array too
  })

  it('keeps the relative order of a duplicated position instead of losing a stop', () => {
    // The state the Map's missing `+ 1` used to produce: two stops at 3.
    const d = day(0, [stop('a', 1), stop('b', 3), stop('c', 3)])
    renumberDay(d)
    expect(orders(d)).toEqual([1, 2, 3])
    expect(new Set(ids(d)).size).toBe(3)
  })
})

describe('nextOrderInDay — what an add appends with', () => {
  it('is length + 1 on a renumbered day, so a delete cannot mint a duplicate', () => {
    const d = day(0, [stop('a', 1), stop('b', 2), stop('c', 3)])
    removeStopFromDay({ days: [d] }, 'b')
    expect(nextOrderInDay(d)).toBe(3) // not a collision: [1,2]
    d.stops.push(stop('d', nextOrderInDay(d)))
    renumberDay(d)
    expect(ids(d)).toEqual(['a', 'c', 'd'])
    expect(orders(d)).toEqual([1, 2, 3])
  })
})

describe('removeStopFromDay — the Undo payload and the gap', () => {
  it('returns the victim with its day, and closes the gap behind it', () => {
    const d = day(0, [stop('a', 1), stop('b', 2), stop('c', 3)])
    const removed = removeStopFromDay({ days: [d] }, 'b')
    expect(removed?.stop.id).toBe('b')
    expect(removed?.stop.orderInDay).toBe(2) // the pre-delete order Undo restores
    expect(removed?.dayIndex).toBe(0)
    expect(ids(d)).toEqual(['a', 'c'])
    expect(orders(d)).toEqual([1, 2])
  })

  it('is a null no-op for an unknown id — never a partial delete', () => {
    const d = day(0, [stop('a', 1)])
    expect(removeStopFromDay({ days: [d] }, 'ghost')).toBeNull()
    expect(ids(d)).toEqual(['a'])
  })
})

describe('moveStopWithinDay — the store sibling’s three guards', () => {
  it('moves and renumbers', () => {
    const d = day(0, [stop('a', 1), stop('b', 2), stop('c', 3)])
    expect(moveStopWithinDay(d, 0, 2)).toBe(true)
    expect(ids(d)).toEqual(['b', 'c', 'a'])
    expect(orders(d)).toEqual([1, 2, 3])
  })

  it('treats from === to as a no-op (the arrow-click case)', () => {
    const d = day(0, [stop('a', 1), stop('b', 2)])
    expect(moveStopWithinDay(d, 1, 1)).toBe(false)
    expect(ids(d)).toEqual(['a', 'b'])
  })

  it('clamps out-of-range indices instead of splicing `undefined` in', () => {
    // An OOB splice inserted a hole the simulator later crashed on (bug #5).
    const d = day(0, [stop('a', 1), stop('b', 2), stop('c', 3)])
    expect(moveStopWithinDay(d, 99, 0)).toBe(true) // `from` clamps to the last stop
    expect(ids(d)).toEqual(['c', 'a', 'b'])
    expect(moveStopWithinDay(d, 0, 99)).toBe(true) // `to` clamps to the end
    expect(ids(d)).toEqual(['a', 'b', 'c'])
    expect(d.stops.every(Boolean)).toBe(true)
    expect(orders(d)).toEqual([1, 2, 3])
    const single = day(1, [stop('only', 1)])
    moveStopWithinDay(single, 5, 99)
    expect(single.stops.every(Boolean)).toBe(true)
    expect(orders(single)).toEqual([1])
  })

  it('refuses an empty day', () => {
    expect(moveStopWithinDay(day(0, []), 0, 1)).toBe(false)
  })
})

describe('moveStopToDay — cross-day move', () => {
  it('REFUSES a missing destination and leaves the source untouched (#339)', () => {
    // The old Timeline handler spliced the source FIRST, then found no target
    // and dropped `moved` on the floor: a silent delete with no recovery.
    const d0 = day(0, [stop('a', 1), stop('b', 2)])
    const d1 = day(1, [stop('c', 1)])
    const days = [d0, d1]
    const before = { d0: ids(d0), d1: ids(d1) }
    expect(moveStopToDay(days, 'a', 7, 0)).toBe(false)
    expect(ids(d0)).toEqual(before.d0)
    expect(ids(d1)).toEqual(before.d1)
  })

  it('lands at the drag’s position and renumbers BOTH days', () => {
    const d0 = day(0, [stop('a', 1), stop('b', 2), stop('c', 3)])
    const d1 = day(1, [stop('x', 1), stop('y', 2)])
    expect(moveStopToDay([d0, d1], 'b', 1, 1)).toBe(true)
    expect(ids(d0)).toEqual(['a', 'c'])
    expect(orders(d0)).toEqual([1, 2])
    expect(ids(d1)).toEqual(['x', 'b', 'y'])
    expect(orders(d1)).toEqual([1, 2, 3])
  })

  it('clamps a position past the end instead of leaving a hole', () => {
    const d0 = day(0, [stop('a', 1)])
    const d1 = day(1, [stop('x', 1)])
    expect(moveStopToDay([d0, d1], 'a', 1, 99)).toBe(true)
    expect(ids(d1)).toEqual(['x', 'a'])
    expect(orders(d1)).toEqual([1, 2])
  })

  it('without a drop slot, inserts by ROAD order — not appended (#339)', () => {
    // The move modal has no insertion point, so it used to push the stop to the
    // end while a drag inserted positionally: same gesture, two plans, and the
    // modal's version broke road order.
    const d0 = day(0, [stop('mover', 1)])
    const d1 = day(1, [stop('near', 1), stop('far', 2)])
    const km: Record<string, number> = { mover: 40, near: 10, far: 90 }
    const kmOf = (s: ItineraryStop) => km[s.id] ?? null
    expect(moveStopToDay([d0, d1], 'mover', 1, null, kmOf)).toBe(true)
    expect(ids(d1)).toEqual(['near', 'mover', 'far'])
    expect(orders(d1)).toEqual([1, 2, 3])
  })

  it('appends when the moved stop has no position on the day’s road', () => {
    const d0 = day(0, [stop('mover', 1)])
    const d1 = day(1, [stop('near', 1), stop('far', 2)])
    const kmOf = (s: ItineraryStop) => (s.id === 'mover' ? null : ({ near: 10, far: 90 }[s.id] ?? null))
    expect(moveStopToDay([d0, d1], 'mover', 1, null, kmOf)).toBe(true)
    expect(ids(d1)).toEqual(['near', 'far', 'mover'])
  })

  it('moves within one day too, without duplicating the stop', () => {
    const d0 = day(0, [stop('a', 1), stop('b', 2), stop('c', 3)])
    expect(moveStopToDay([d0], 'a', 0, 2)).toBe(true)
    expect(ids(d0)).toEqual(['b', 'c', 'a'])
    expect(orders(d0)).toEqual([1, 2, 3])
  })
})

describe('roadOrderInsertionIndex', () => {
  const ordered = [stop('near', 1), stop('far', 2)]
  const kmOf = (s: ItineraryStop) => ({ near: 10, far: 90 }[s.id] ?? null)
  it('inserts before the first stop further along the road', () => {
    expect(roadOrderInsertionIndex(ordered, 40, kmOf)).toBe(1)
    expect(roadOrderInsertionIndex(ordered, 5, kmOf)).toBe(0)
    expect(roadOrderInsertionIndex(ordered, 200, kmOf)).toBe(2)
  })
  it('appends for an unknown position', () => {
    expect(roadOrderInsertionIndex(ordered, null, kmOf)).toBe(2)
    expect(roadOrderInsertionIndex(ordered, NaN, kmOf)).toBe(2)
  })
  it('skips stops whose own position is unknown', () => {
    const kmOfPartial = (s: ItineraryStop) => ({ near: null, far: 90 }[s.id] ?? null) as number | null
    expect(roadOrderInsertionIndex(ordered, 40, kmOfPartial)).toBe(1)
  })
})

describe('finders + dedupe', () => {
  const trip = { days: [day(0, [stop('a', 1, { title: 'Hotel Taj' })])] }
  it('hasStopNamed ignores case and extra whitespace', () => {
    expect(hasStopNamed(trip, '  hotel   taj ')).toBe(true)
    expect(hasStopNamed(trip, 'Hotel Taj Mahal')).toBe(false)
    expect(hasStopNamed(trip, '')).toBe(false)
  })
  it('dayHoldingStop / stopById locate the stop', () => {
    expect(dayHoldingStop(trip, 'a')?.index).toBe(0)
    expect(stopById(trip, 'a')?.title).toBe('Hotel Taj')
    expect(dayHoldingStop(trip, 'ghost')).toBeUndefined()
  })
})

// ---- bindings: the page handlers call these helpers, not a private rule ----
const page = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const timeline = page('../src/pages/trip/TimelineTab.tsx')
const daySection = page('../src/pages/trip/timeline/DaySection.tsx')
const mapTab = page('../src/pages/trip/MapTab.tsx')

describe('the writers use the shared implementation', () => {
  it('the Timeline deletes, reorders and moves through lib/stopOrder', () => {
    expect(timeline).toMatch(/from '\.\.\/\.\.\/lib\/stopOrder'/)
    expect(timeline).toMatch(/removeStopFromDay\(draft, stopId\)/)
    expect(timeline).toMatch(/moveStopWithinDay\(day, fromIdx, toIdx\)/)
    expect(timeline).toMatch(/moveStopToDay\(draft\.days, stopId, toDayIndex, position\)/)
    expect(timeline).toMatch(/moveStopToDay\(draft\.days, stopId, toDay, null, kmOf\)/)
  })

  it('a Timeline delete leaves an Undo that restores the captured stop', () => {
    expect(timeline).toMatch(/undoToast\(`“[^`]*” removed from Day \$\{dayIndex \+ 1\}`/)
    expect(timeline).toMatch(/restoreStop\(trip\.id, victim, dayIndex\)/)
  })

  it('no positional byDay clamp is left on the timeline surfaces', () => {
    // #338: the day's bucket is found by INDEX; `byDay[Math.min(index, …)]`
    // showed the last day's total under a day whose index had a gap.
    expect(timeline).not.toMatch(/byDay\[Math\.min/)
    expect(daySection).toMatch(/dayTotals\.dayIndex === day\.index/)
  })

  it('the Map’s slot fill numbers the appended stop 1-based', () => {
    // #337: this one shipped as `day.stops.length` — a duplicate of the last
    // stop's order, saved only by V8's stable sort.
    expect(mapTab).toMatch(/orderInDay: day\.stops\.length \+ 1,/)
    expect(mapTab).not.toMatch(/orderInDay: day\.stops\.length,/)
  })
})
