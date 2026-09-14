// Reason chips: the rail card's structured "why". These tests pin the
// thresholds and the priority order, so a later tweak to the copy or the
// numbers has to be deliberate.
import { describe, it, expect } from 'vitest'
import { railReasonChips, type RailReasonInput } from '../src/lib/railReasons'
import { LUNCH_WINDOW } from '../src/lib/ridePlan'

const base: RailReasonInput = {
  purpose: 'fuel',
  etaMinutes: null,
  minutesFromPrev: 60,
  isFirstSegment: false,
  detourMinutes: 8,
  budgetSharePct: 5,
  overBudget: false,
}

describe('railReasonChips', () => {
  it('says nothing when nothing stands out', () => {
    expect(railReasonChips(base)).toEqual([])
  })

  it('leads with an over-budget detour, in warning tone', () => {
    const chips = railReasonChips({ ...base, overBudget: true, budgetSharePct: 140 })
    expect(chips[0]).toEqual({ label: 'over budget', tone: 'warn' })
  })

  it('notes a meal landing inside the shared lunch window, edges included', () => {
    const at = (t: number) =>
      railReasonChips({ ...base, purpose: 'meal', etaMinutes: t }).map((c) => c.label)
    expect(at(LUNCH_WINDOW[0])).toContain('in the lunch window')
    expect(at(LUNCH_WINDOW[1])).toContain('in the lunch window')
    expect(at(LUNCH_WINDOW[0] - 1)).not.toContain('in the lunch window')
    expect(at(LUNCH_WINDOW[1] + 1)).not.toContain('in the lunch window')
  })

  it('only claims the lunch window for meals, not other halts', () => {
    const chips = railReasonChips({ ...base, purpose: 'fuel', etaMinutes: LUNCH_WINDOW[0] })
    expect(chips.map((c) => c.label)).not.toContain('in the lunch window')
  })

  it('notes a long stretch since the last stop, from two hours up', () => {
    expect(railReasonChips({ ...base, minutesFromPrev: 120 }).map((c) => c.label)).toEqual([
      expect.stringContaining('breaks a'),
    ])
    expect(railReasonChips({ ...base, minutesFromPrev: 119 })).toEqual([])
  })

  it('quotes a rating only from four up', () => {
    expect(railReasonChips({ ...base, rating: 4 })[0]?.label).toBe('rated 4.0')
    expect(railReasonChips({ ...base, rating: 3.9 })).toEqual([])
  })

  it('quotes the budget share only from fifteen percent', () => {
    expect(railReasonChips({ ...base, budgetSharePct: 15 }).map((c) => c.label)).toEqual([
      "15% of the day's detour budget",
    ])
    expect(railReasonChips({ ...base, budgetSharePct: 14 })).toEqual([])
  })

  it('treats a missing budget share as silent rather than zero', () => {
    expect(railReasonChips({ ...base, budgetSharePct: null })).toEqual([])
  })

  it('marks the first stop of the day', () => {
    expect(railReasonChips({ ...base, isFirstSegment: true }).map((c) => c.label)).toEqual([
      'first stop of the day',
    ])
  })

  it('caps at three chips and keeps the priority order', () => {
    const chips = railReasonChips({
      purpose: 'meal',
      etaMinutes: LUNCH_WINDOW[0] + 30,
      minutesFromPrev: 200,
      isFirstSegment: true,
      detourMinutes: 40,
      budgetSharePct: 90,
      overBudget: true,
      rating: 4.8,
    })
    expect(chips.map((c) => c.label)).toEqual([
      'over budget',
      'in the lunch window',
      'breaks a 3h 20m stretch',
    ])
  })
})
