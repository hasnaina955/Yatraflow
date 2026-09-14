// DetourWhisk geometry (#160): the whisker used to be a bespoke inline <svg>
// per card with hardcoded "heavy = y 3, light = y 6" branches. The extraction
// pins the new contract: the spur's length MEANS something — share of the
// day's detour budget — and the warn predicate is the same round-half-up math
// the card's fact strip uses (#163).
import { describe, expect, it } from 'vitest'
import { whiskIsHeavy, whiskTipY } from '../src/components/DetourWhisk'

describe('whiskIsHeavy — same predicate as the fact strip', () => {
  it('flips at the budget-exact detour only after display rounding', () => {
    expect(whiskIsHeavy(20, 20)).toBe(false) // exactly the budget: fine
    expect(whiskIsHeavy(20.6, 20)).toBe(true) // rounds to 21 > 20
    expect(whiskIsHeavy(20.4, 20)).toBe(false) // rounds to 20 = budget: fine
    expect(whiskIsHeavy(35, 20)).toBe(true)
  })

  it('treats a zero/absent budget as heavy beyond it', () => {
    expect(whiskIsHeavy(5, 0)).toBe(true)
  })
})

describe('whiskTipY — spur length scales with share of budget', () => {
  it('sits on the route at zero detour', () => {
    expect(whiskTipY(0, 20)).toBe(14)
  })

  it('leans further as the detour consumes more of the day budget', () => {
    const quarter = whiskTipY(5, 20)
    const half = whiskTipY(10, 20)
    const threeQuarters = whiskTipY(15, 20)
    expect(half).toBeLessThan(quarter)
    expect(threeQuarters).toBeLessThan(half)
    expect(14 - quarter).toBeGreaterThan(0)
  })

  it('caps at the max lean (3) and holds it for over-budget detours', () => {
    expect(whiskTipY(20, 20)).toBe(3)
    expect(whiskTipY(60, 20)).toBe(3)
  })

  it('degrades to max lean when the budget is unknown', () => {
    expect(whiskTipY(10, 0)).toBe(3)
  })
})
