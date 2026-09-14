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
    expect(chips[0]).toEqual({ key: 'over-budget', label: 'over budget', tone: 'warn' })
  })

  it('notes a meal landing inside the shared lunch window, edges included', () => {
    const at = (t: number) =>
      railReasonChips({ ...base, purpose: 'meal', etaMinutes: t }).map((c) => c.label)
    expect(at(LUNCH_WINDOW[0])).toContain('lunch window')
    expect(at(LUNCH_WINDOW[1])).toContain('lunch window')
    expect(at(LUNCH_WINDOW[0] - 1)).not.toContain('lunch window')
    expect(at(LUNCH_WINDOW[1] + 1)).not.toContain('lunch window')
  })

  it('only claims the lunch window for meals, not other halts', () => {
    const chips = railReasonChips({ ...base, purpose: 'fuel', etaMinutes: LUNCH_WINDOW[0] })
    expect(chips.map((c) => c.label)).not.toContain('lunch window')
  })

  it('notes a long stretch since the last stop, from the ~1¾-hour band up (#173: band, not a 120-min cliff on an estimated number)', () => {
    expect(railReasonChips({ ...base, minutesFromPrev: 120 }).map((c) => c.label)).toEqual([
      expect.stringContaining('stretch'),
    ])
    expect(railReasonChips({ ...base, minutesFromPrev: 119 }).map((c) => c.label)).toEqual([
      expect.stringContaining('stretch'),
    ])
    expect(railReasonChips({ ...base, minutesFromPrev: 104 })).toEqual([])
  })

  it('quotes a rating only from four up AND a real sample (#165: a 4.0 from 3 reviews is not an endorsement)', () => {
    const chip = railReasonChips({ ...base, rating: 4, ratingCount: 15 })[0]
    expect(chip?.key).toBe('rating')
    expect(chip?.label).toBe('4.0')
    expect(chip?.icon).toBe('star')
    // below the review floor: the number stays silent
    expect(railReasonChips({ ...base, rating: 4.9, ratingCount: 3 })).toEqual([])
    // no count information at all (free stack): silent too
    expect(railReasonChips({ ...base, rating: 4 })).toEqual([])
    expect(railReasonChips({ ...base, rating: 3.9, ratingCount: 999 })).toEqual([])
  })

  it('quotes the budget share only from the ~12% band (#173: 15% was a round cliff on engine estimates)', () => {
    expect(railReasonChips({ ...base, budgetSharePct: 15 }).map((c) => c.label)).toEqual([
      "15% of budget",
    ])
    expect(railReasonChips({ ...base, budgetSharePct: 14 }).map((c) => c.label)).toEqual([
      "14% of budget",
    ])
    expect(railReasonChips({ ...base, budgetSharePct: 11 })).toEqual([])
  })

  it('treats a missing budget share as silent rather than zero', () => {
    expect(railReasonChips({ ...base, budgetSharePct: null })).toEqual([])
  })

  it('marks the first stop of the day', () => {
    expect(railReasonChips({ ...base, isFirstSegment: true }).map((c) => c.label)).toEqual([
      'first stop',
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
      ratingCount: 120,
    })
    expect(chips.map((c) => c.label)).toEqual([
      'over budget',
      'lunch window',
      '3h 20m stretch',
    ])
  })
})
