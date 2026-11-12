/**
 * #420, slice 4 — the detour sentence, once.
 *
 * The corridor rows and the map's empty-part pins assembled the same three bits
 * separately ("arrive 11:24 · +26 min · 58% of the day's detour budget"). These tests
 * pin the shared helper and both callers.
 *
 * #08 AC5: the corridor cost is no longer re-derived inside the rail hook. These
 * tests pin that the sentence is formatted from canonical row facts, and that the
 * one detour computation now sits with the Map's snapshot producer.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { detourBits, journeyCostLabels, slotPinsFor } from '../src/pages/trip/map/railLabels'
import type { DaySlot } from '../src/lib/daySlots'

const mapTab = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8')
// #420 slice 13: the rail content lives in the rail-content hook.
const contentHook = readFileSync(new URL('../src/pages/trip/map/useRailContent.ts', import.meta.url), 'utf8')
// #420 slice 14: the slot pins live in the day-slots hook with their input.
const slotsHook = readFileSync(new URL('../src/pages/trip/map/useDaySlots.ts', import.meta.url), 'utf8')
// #420 slice 16: the rail rows render in their own module.
const views = readFileSync(new URL('../src/pages/trip/map/RailRowViews.tsx', import.meta.url), 'utf8')

describe('#420 — the three bits, in the order every surface prints them', () => {
  it('says an unmeasured position instead of a number', () => {
    expect(detourBits({ detourMin: null })).toEqual(['position unknown'])
  })

  it('calls a fraction of a minute on route, and rounds the rest up to a minute', () => {
    expect(detourBits({ detourMin: 0.5 })).toEqual(['on route'])
    expect(detourBits({ detourMin: 0.6 })).toEqual(['+1 min'])
    expect(detourBits({ detourMin: 26.4 })).toEqual(['+26 min'])
  })

  it('leads with the arrival, then the cost, then the budget share', () => {
    expect(detourBits({ arriveLabel: '11:24', detourMin: 26, budgetSharePct: 58 }))
      .toEqual(['arrive 11:24', '+26 min', "58% of the day's detour budget"])
  })

  it('prints no share when there is nothing to say', () => {
    expect(detourBits({ detourMin: 26, budgetSharePct: 0 })).toEqual(['+26 min'])
    expect(detourBits({ detourMin: 26, budgetSharePct: null })).toEqual(['+26 min'])
    expect(detourBits({ detourMin: 26 })).toEqual(['+26 min'])
  })
})

describe('#08 — the sentence is formatted from canonical row facts', () => {
  const row = (over: Partial<Parameters<typeof journeyCostLabels>[0][number]> = {}) => ({
    hit: { id: 'a' },
    arriveMin: 684,
    arriveLabel: null,
    detourMin: 26,
    budgetSharePct: 58,
    ...over,
  })

  it('uses the row own arrival minute and never recomputes a detour or share', () => {
    // 684 minutes = 11:24; every other number is the row's own.
    expect(journeyCostLabels([row()]).a).toBe("arrive 11:24 · +26 min · 58% of the day's detour budget")
  })

  it('says an unknown position instead of inventing an arrival or a number', () => {
    expect(journeyCostLabels([row({ arriveMin: null, detourMin: null, budgetSharePct: null })]).a)
      .toBe('position unknown')
  })

  it('formats a stored label when the row carries no minute, and shows a known zero honestly', () => {
    expect(journeyCostLabels([row({ arriveMin: null, arriveLabel: '13:05', detourMin: 0, budgetSharePct: null })]).a)
      .toBe('arrive 13:05 · on route')
  })

  it('drops the share when the row has none', () => {
    expect(journeyCostLabels([row({ arriveMin: 620, detourMin: 20, budgetSharePct: null })]).a)
      .toBe('arrive 10:20 · +20 min')
  })

  it('emits no entry for a hit no row covers', () => {
    expect(journeyCostLabels([])).toEqual({})
  })
})

describe('#420 — the empty-part pin says the same thing', () => {
  const slot = (over: Omit<Partial<DaySlot>, 'key'> & { key?: string }): DaySlot => ({
    key: 'lunch', kind: 'meal', label: 'Lunch', state: 'empty',
    windowMin: null, windowLabel: null, segment: null, candidates: [],
    ...over,
  } as unknown as DaySlot)

  it('pins only the empty slots that have somewhere to stand', () => {
    const pins = slotPinsFor([
      slot({ key: 'lunch', candidates: [{ hit: { id: 'x', name: 'Cafe' }, arriveLabel: '13:00', detourMin: 12, budgetSharePct: 25 }] as never }),
      slot({ key: 'dinner', candidates: [] }),
      slot({ key: 'breakfast', state: 'filled' }),
    ])
    expect(pins.map(p => p.key)).toEqual(['lunch'])
    expect(pins[0].name).toBe('Cafe')
    expect(pins[0].meta).toBe("arrive 13:00 · +12 min · 25% of the day's detour budget")
  })

  it('uses the top candidate, and says an unknown position', () => {
    const pins = slotPinsFor([
      slot({ candidates: [
        { hit: { id: 'x', name: 'First' }, arriveLabel: null, detourMin: null, budgetSharePct: 0 },
        { hit: { id: 'y', name: 'Second' }, arriveLabel: '13:00', detourMin: 5, budgetSharePct: 10 },
      ] as never }),
    ])
    expect(pins[0].name).toBe('First')
    expect(pins[0].meta).toBe('position unknown')
  })
})

describe('#08 AC5 — one cost fact, consumed where covered', () => {
  it('keeps the sentence module the only home of the wording', () => {
    // The page consumes the module now; it does not own the sentence.
    expect(mapTab).toContain("from './map/railLabels'")
    expect(mapTab).not.toContain("of the day's detour budget")
    expect(slotsHook).toMatch(/slotPinsByDay\.set\(day\.index, slotPinsFor\(slots\)\)/)
    expect(mapTab).toContain('journeyDays.slotPinsByDay.get(activeDayIndex)')
  })

  it('removes the parallel raw derivation from the rail hook', () => {
    expect(contentHook).not.toContain('hitCostLabels')
    expect(contentHook).not.toContain('asymmetricDetourMinutes')
    expect(contentHook).not.toContain('hitEngine')
    expect(contentHook).not.toContain('dayDetourBudgetMin')
  })

  it('formats the canonical drive rows, and owns the one detour computation at the producer', () => {
    expect(mapTab).toContain('journeyCostLabels(driveRows)')
    expect(mapTab).toContain('const hitEngine = useMemo')
    expect(mapTab).not.toMatch(/hitCostLabels/)
  })

  it('leaves the two denser variants alone, and pins how many there are', () => {
    // The page prints detour vocabulary in FOUR places, and only two of them are
    // the same sentence (the corridor chip and the empty-part pin — now shared).
    // The other two are deliberately different, and folding them in would change
    // user-visible copy, which a refactor must not do:
    //   · the see-rail row says "+26 min detour" and carries its own chips;
    //   · the day-slot candidate row is shorter ("% of day detours") and interleaves
    //     the opening hours between the bits.
    // This count is what stops a FIFTH copy appearing unnoticed. If a future change
    // makes one of these identical to the shared sentence, move it in and lower the
    // number rather than relaxing the assertion.
    // #420 slice 16: the see-rail row's copy moved with its JSX — the words are
    // unchanged, so both homes carry a count and the total is still three.
    expect(mapTab).toContain('% of day detours')
    expect(mapTab).not.toContain('min detour`')
    expect(views).toContain('min detour`')
    expect((mapTab.match(/'position unknown'/g) ?? []).length).toBe(2)
    expect((views.match(/'position unknown'/g) ?? []).length).toBe(1)
  })
})
