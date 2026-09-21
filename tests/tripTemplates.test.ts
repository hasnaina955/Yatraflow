// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { TRIP_TEMPLATES, TEMPLATE_COORDS, templateFromPerHead, templateFromRange, templateBudget, applyTemplate } from '../src/lib/tripTemplates'
import { estimateTripStarter } from '../src/lib/tripStarter'
import { STAY_RATE_PER_NIGHT } from '../src/lib/rates'
import { TRAVEL_STYLES, TRANSPORT_MODES, STAY_STYLES } from '../src/data/types'

describe('trip templates - the warm start', () => {
  it('ships exactly the four launch templates with stable ids', () => {
    expect(TRIP_TEMPLATES.map(t => t.id)).toEqual([
      'kerala-backwaters', 'rajasthan-forts', 'himalayan-loop', 'goa-weekend',
    ])
  })

  it('every template validates: days >= 1, 1 <= travellers <= 30, modes and styles in vocabulary', () => {
    for (const t of TRIP_TEMPLATES) {
      expect(t.prefill.days, t.id).toBeGreaterThanOrEqual(1)
      expect(t.prefill.travellers, t.id).toBeGreaterThanOrEqual(1)
      expect(t.prefill.travellers, t.id).toBeLessThanOrEqual(30)
      expect(TRANSPORT_MODES, t.id).toContain(t.prefill.transportMode)
      expect(TRAVEL_STYLES, t.id).toContain(t.prefill.travelStyle)
      expect(STAY_STYLES, t.id).toContain(t.prefill.stayStyle)
      expect(t.prefill.destinations.length, t.id).toBeGreaterThanOrEqual(1)
      expect(t.prefill.startLocation.trim(), t.id).not.toBe('')
    }
  })

  it('every destination string (and the start) resolves in TEMPLATE_COORDS - no dangling names', () => {
    for (const t of TRIP_TEMPLATES) {
      expect(TEMPLATE_COORDS, t.id).toHaveProperty(t.prefill.startLocation)
      for (const d of t.prefill.destinations) expect(TEMPLATE_COORDS, t.id).toHaveProperty(d)
    }
  })

  it('coordinates are Indian geography (lat 6-36, lng 68-98) and city-center scale (<=4dp)', () => {
    for (const [name, c] of Object.entries(TEMPLATE_COORDS)) {
      expect(c.lat, name).toBeGreaterThanOrEqual(6)
      expect(c.lat, name).toBeLessThanOrEqual(36)
      expect(c.lng, name).toBeGreaterThanOrEqual(68)
      expect(c.lng, name).toBeLessThanOrEqual(98)
      expect(Number(c.lat.toFixed(4)), name).toBe(c.lat)
      expect(Number(c.lng.toFixed(4)), name).toBe(c.lng)
    }
  })

  it('HONESTY GUARD: the card\'s "from" figure equals what the engine computes for the same inputs', () => {
    for (const t of TRIP_TEMPLATES) {
      const from = templateFromPerHead(t)
      expect(from, t.id).toBeGreaterThan(0)
      // Rounded to a hundred - the card never claims more precision than the math.
      expect(from % 100, t.id).toBe(0)
      // And the bill it advertises must be within 5% of the raw engine number
      // (rounding to hundreds can move it, but not by much).
      const pts = [TEMPLATE_COORDS[t.prefill.startLocation], ...t.prefill.destinations.map(d => TEMPLATE_COORDS[d])]
      const bill = estimateTripStarter({
        startDate: '2026-02-14',
        endDate: isoAdd('2026-02-14', t.prefill.days - 1),
        travellers: t.prefill.travellers,
        mode: t.prefill.transportMode,
        orderedPoints: pts,
        returnTrip: true,
        returnCount: 0,
        roundTrip: t.prefill.roundTrip,
        stayStyle: t.prefill.stayStyle,
      })
      expect(Math.abs(from - bill.perHead!) / bill.perHead!, t.id).toBeLessThan(0.05)
    }
  })

  it('HONESTY GUARD: every template\'s stay line matches the shared rate table (no invented pricing)', () => {
    for (const t of TRIP_TEMPLATES) {
      const rate = STAY_RATE_PER_NIGHT[t.prefill.stayStyle]
      const pts = [TEMPLATE_COORDS[t.prefill.startLocation], ...t.prefill.destinations.map(d => TEMPLATE_COORDS[d])]
      const bill = estimateTripStarter({
        startDate: '2026-02-14',
        endDate: isoAdd('2026-02-14', t.prefill.days - 1),
        travellers: t.prefill.travellers,
        mode: t.prefill.transportMode,
        orderedPoints: pts,
        returnCount: 0,
        roundTrip: t.prefill.roundTrip,
        stayStyle: t.prefill.stayStyle,
      })
      // nights = days - 1; rooms = ceil(crew / 2); the engine's stay line must
      // be exactly rate x rooms x nights (the formula it prints).
      const nights = t.prefill.days - 1
      const rooms = Math.ceil(t.prefill.travellers / 2)
      expect(bill.stayCost, t.id).toBe(rate * rooms * nights)
      expect(bill.stayFormula, t.id).toContain(String(rate))
    }
  })



  it('the loaded budget is DERIVED from the band low end (nearest 500) - never a typed number', () => {
    for (const t of TRIP_TEMPLATES) {
      const { low } = templateFromRange(t)
      const b = templateBudget(t)
      expect(b % 500, t.id).toBe(0)
      expect(Math.abs(b - low), t.id).toBeLessThanOrEqual(250)
      const applied = applyTemplate(t, { name: '', startLocation: '', budgetTouched: false })
      expect(applied.fields.budgetPerPersonInr, t.id).toBe(b)
    }
  })

  it('HONESTY GUARD: the card band is computed at both ends, low <= high, both engine-derived', () => {
    for (const t of TRIP_TEMPLATES) {
      const { low, high } = templateFromRange(t)
      expect(low, t.id).toBeGreaterThan(0)
      expect(high, t.id).toBeGreaterThanOrEqual(low)
      expect(low % 100, t.id).toBe(0)
      expect(high % 100, t.id).toBe(0)
      // the low end is exactly what the template's own tier prices at
      expect(low, t.id).toBe(templateFromPerHead(t))
      // a comfort-tier template must show a real band (the bed is the variable)
      if (t.prefill.stayStyle !== 'luxury') expect(high, t.id).toBeGreaterThan(low)
    }
  })

  it('HONESTY GUARD: the band is stable - re-deriving it twice gives the same numbers', () => {
    for (const t of TRIP_TEMPLATES) {
      expect(templateFromRange(t)).toEqual(templateFromRange(t))
    }
  })

  it('applyTemplate fills blanks but never clobbers user input', () => {
    const t = TRIP_TEMPLATES[0]
    // Blank form: everything fills.
    const fresh = applyTemplate(t, { name: '', startLocation: '', budgetTouched: false })
    expect(fresh.fields.name).toBe(t.prefill.name)
    expect(fresh.fields.startLocation).toBe(t.prefill.startLocation)
    expect(fresh.fields.budgetPerPersonInr).toBe(templateBudget(t))
    expect(fresh.dests).toHaveLength(2)
    expect(fresh.dests[0]).toEqual({ name: 'Munnar, Kerala', lat: 10.0889, lng: 77.0595 })
    // Typed name + start + touched budget: all three win over the template.
    const owned = applyTemplate(t, { name: 'Anniversary run', startLocation: 'Kozhikode, Kerala', budgetTouched: true })
    expect(owned.fields.name).toBeUndefined()
    expect(owned.fields.startLocation).toBeUndefined()
    expect(owned.fields.budgetPerPersonInr).toBeUndefined()
    // Style/mode/crew prefill regardless - they are choices, not identity.
    expect(owned.fields.travelStyle).toBe(t.prefill.travelStyle)
    expect(owned.fields.transportMode).toBe('car')
  })

  it('applyTemplate coords round-trip: lat/lng match TEMPLATE_COORDS to the source number', () => {
    const t = TRIP_TEMPLATES[2]
    const applied = applyTemplate(t, { name: '', startLocation: '', budgetTouched: false })
    for (const d of applied.dests) {
      const src = TEMPLATE_COORDS[d.name]
      expect(d.lat).toBe(src.lat)
      expect(d.lng).toBe(src.lng)
    }
  })
})

function isoAdd(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
