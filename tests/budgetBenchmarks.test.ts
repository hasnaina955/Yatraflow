// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  REGION_BASELINES, regionFor, regionBand, experienceTier, anchorNote, EXPERIENCE_TIERS,
} from '../src/lib/budgetBenchmarks'
import { TEMPLATE_COORDS } from '../src/lib/tripTemplates'

describe('budget benchmarks - the honest anchor', () => {
  it('every baseline names a route whose stops all resolve to coordinates (no dangling places)', () => {
    for (const r of REGION_BASELINES) {
      expect(TEMPLATE_COORDS, r.key).toHaveProperty(r.start)
      for (const d of r.destinations) expect(TEMPLATE_COORDS, r.key).toHaveProperty(d)
      expect(r.days, r.key).toBeGreaterThanOrEqual(2)
      expect(r.label.trim(), r.key).not.toBe('')
      expect(r.matches.length, r.key).toBeGreaterThan(0)
    }
  })

  it('regionFor matches on the destination text, case-insensitively', () => {
    expect(regionFor(['Munnar, Kerala'])?.key).toBe('kerala')
    expect(regionFor(['udaipur, rajasthan'])?.key).toBe('rajasthan')
    expect(regionFor(['Kaza, Himachal Pradesh'])?.key).toBe('himachal')
    expect(regionFor(['Palolem, Goa'])?.key).toBe('coast')
  })

  it('regionFor returns null for an unknown place - the UI must render nothing, not a filler', () => {
    expect(regionFor(['Shillong, Meghalaya'])).toBeNull()
    expect(regionFor([''])).toBeNull()
    expect(regionFor([])).toBeNull()
  })

  it('HONESTY GUARD: the band is engine-computed at both ends and low <= high', () => {
    for (const r of REGION_BASELINES) {
      const b = regionBand(r)
      expect(b.low, r.key).toBeGreaterThan(0)
      expect(b.high, r.key).toBeGreaterThanOrEqual(b.low)
      expect(b.low % 100, r.key).toBe(0)
      expect(b.high % 100, r.key).toBe(0)
      expect(b.days, r.key).toBe(r.days)
      // a comfort top must genuinely cost more than a budget floor
      expect(b.high, r.key).toBeGreaterThan(b.low)
    }
  })

  it('the band scales with the day count (more nights cannot be cheaper)', () => {
    const r = REGION_BASELINES[0]
    const short = regionBand(r, 3)
    const long = regionBand(r, 9)
    expect(long.low).toBeGreaterThan(short.low)
    expect(long.days).toBe(9)
  })

  it('the day count is clamped to something a trip could actually be', () => {
    const r = REGION_BASELINES[0]
    expect(regionBand(r, 0).days).toBe(2)
    expect(regionBand(r, 99).days).toBe(14)
  })

  it('experience tiers are ordered, contiguous from zero, and never claim amenities', () => {
    expect(EXPERIENCE_TIERS[0].from).toBe(0)
    for (let i = 1; i < EXPERIENCE_TIERS.length; i++) {
      expect(EXPERIENCE_TIERS[i].from).toBeGreaterThan(EXPERIENCE_TIERS[i - 1].from)
    }
    for (const t of EXPERIENCE_TIERS) {
      expect(t.blurb.trim().length).toBeGreaterThan(10)
      // no promises the product cannot keep
      expect(t.blurb.toLowerCase()).not.toMatch(/free|unlimited|guarantee/)
    }
  })

  it('experienceTier picks the right tier at and around each boundary', () => {
    expect(experienceTier(0).label).toBe('shoestring')
    expect(experienceTier(5999).label).toBe('shoestring')
    expect(experienceTier(6000).label).toBe('budget')
    expect(experienceTier(10999).label).toBe('budget')
    expect(experienceTier(11000).label).toBe('comfort')
    expect(experienceTier(19999).label).toBe('comfort')
    expect(experienceTier(20000).label).toBe('premium')
    expect(experienceTier(32000).label).toBe('heritage')
    expect(experienceTier(999999).label).toBe('heritage')
  })

  it('experienceTier is total: negative and non-finite input cannot throw', () => {
    expect(experienceTier(-500).label).toBe('shoestring')
    // non-finite is nonsense, not wealth: it falls to the floor, never crashes
    expect(experienceTier(Number.NaN).label).toBe('shoestring')
    expect(experienceTier(Number.POSITIVE_INFINITY).label).toBe('shoestring')
  })

  it('anchorNote speaks to where the number sits - and never scolds', () => {
    const band = { low: 10000, high: 16000 }
    expect(anchorNote(8000, band)).toContain('below')
    expect(anchorNote(13000, band)).toContain('inside')
    expect(anchorNote(25000, band)).toContain('above')
    expect(anchorNote(0, band)).toContain('no per-head target')
    for (const v of [8000, 13000, 25000]) {
      const note = anchorNote(v, band)
      expect(note.toLowerCase()).not.toMatch(/should|too much|too little|waste/)
    }
  })
})
