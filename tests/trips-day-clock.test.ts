// ============ My trips reads one day value (#648) ============
// The page named the day twice: once for the countdowns and once for the date
// filter. Two reads can land on two sides of local midnight. A page that stays
// open also keeps the day it mounted on. The first block drives the shared clock
// with an injected time source, so the boundary is pinned without a browser.
// The last block pins the page's own connection to that clock.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createDayClock, startOfLocalDay } from '../src/lib/dayClock'
import { countdownText, pickUpNext, statusOf, whenBucket } from '../src/lib/tripsPage'
import type { ItineraryDay } from '../src/data/types'

/** A trip of `n` days. Only `length` matters to the date rules here. */
function days(n: number): ItineraryDay[] {
  return Array.from({ length: n }, (_, i) => ({ id: `d${i}`, index: i, stops: [] })) as unknown as ItineraryDay[]
}

/** A trip that ends on the day the harness mounts, with three days planned. */
const endsToday = { startDate: '2026-10-04', endDate: '2026-10-06', days: days(3) }
/** A later trip, for the up-next pick. */
const nextMonth = { startDate: '2026-11-01', endDate: '2026-11-05', days: days(5) }

/**
 * The page's clock, with a hand-moved time source and a scheduler a test fires.
 * It mirrors `useToday`: one value held in state, replaced only when the day
 * moves, so a same-day focus hands back the object the page already holds.
 */
function harness(start: Date) {
  let now = start
  let day = startOfLocalDay(start)
  let pending: { fn: () => void; ms: number } | null = null
  const clock = createDayClock({
    now: () => now,
    onChange: next => { day = next },
    setTimer: (fn, ms) => { pending = { fn, ms }; return 1 },
    clearTimer: () => { pending = null },
  })
  return {
    day: () => day,
    set: (d: Date) => { now = d },
    /** Fire the armed wake-up, as the browser does a moment after midnight. */
    midnight: () => { const armed = pending; pending = null; armed?.fn() },
    /** A window focus, as `useToday` wires it. */
    focus: () => clock.refresh(),
  }
}

describe('#648 — one shared day value for the countdown and the filter', () => {
  it('moves the countdown, the status and the filter bucket in one step', () => {
    const h = harness(new Date(2026, 9, 6, 23, 59, 59))
    expect(statusOf(endsToday, h.day())).toBe('live')
    expect(countdownText(endsToday, h.day())).toBe('Day 3 of 3')
    expect(whenBucket(endsToday, h.day())).toBe('upcoming')

    h.set(new Date(2026, 9, 7, 0, 0, 1))
    h.midnight()

    expect(statusOf(endsToday, h.day())).toBe('past')
    expect(countdownText(endsToday, h.day())).toBe(null)
    expect(whenBucket(endsToday, h.day())).toBe('past')
  })

  it('shows the two separate reads disagreeing, which is the defect it replaces', () => {
    // The control: two clock reads around one midnight name two different days,
    // so the page could print a countdown over a list its own filter called past.
    const countdownRead = startOfLocalDay(new Date(2026, 9, 6, 23, 59, 59))
    const filterRead = startOfLocalDay(new Date(2026, 9, 7, 0, 0, 1))
    expect(countdownText(endsToday, countdownRead)).toBe('Day 3 of 3')
    expect(whenBucket(endsToday, filterRead)).toBe('past')
  })

  it('keeps the value identical across a focus on the same day, so the memo cannot re-run', () => {
    const h = harness(new Date(2026, 9, 6, 9, 30))
    const mounted = h.day()
    h.set(new Date(2026, 9, 6, 18, 45))
    h.focus()
    expect(h.day()).toBe(mounted)
  })

  it('moves the value on a focus after a missed wake-up, so a throttled tab stays honest', () => {
    const h = harness(new Date(2026, 9, 6, 9, 30))
    const mounted = h.day()
    h.set(new Date(2026, 9, 7, 8, 0))
    h.focus()
    expect(h.day()).not.toBe(mounted)
    expect(h.day().getTime()).toBe(new Date(2026, 9, 7).getTime())
    expect(countdownText(endsToday, h.day())).toBe(null)
  })

  it('feeds the up-next pick from the same value', () => {
    const h = harness(new Date(2026, 9, 6, 23, 59, 59))
    expect(pickUpNext([nextMonth, endsToday], h.day())?.startDate).toBe('2026-10-04')

    h.set(new Date(2026, 9, 7, 0, 0, 1))
    h.midnight()

    expect(pickUpNext([nextMonth, endsToday], h.day())?.startDate).toBe('2026-11-01')
  })
})

/** The page source, so the connection to the clock is pinned too. */
const PAGE = readFileSync(new URL('../src/pages/TripsList.tsx', import.meta.url), 'utf8')

describe('#648 — the page reads its day through the clock hook', () => {
  it('takes the value from useToday, and keeps no fresh day read', () => {
    expect(PAGE).toContain("import { useToday } from '../hooks/useToday'")
    expect(PAGE).toContain('const today = useToday()')
    expect(PAGE).not.toContain('new Date()')
    expect(PAGE).not.toContain('todayStart')
  })

  it('hands that one value to the countdowns and to the date filter', () => {
    expect(PAGE).toContain('whenBucket(t, today)')
    expect(PAGE).toContain('pickUpNext(mine, today)')
    expect(PAGE).toContain('today={today}')
  })
})
