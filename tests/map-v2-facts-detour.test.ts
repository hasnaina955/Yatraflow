// ============ Map v2 facts: one detour display rule (finding 4) ============
// The row, the card and the Timeline meta must agree on 0, tiny and whole-minute
// detours. A known zero stays zero (and keeps a 0% share); null stays unknown.
import { describe, expect, it } from 'vitest'
import { detourDisplay, detourDisplayText } from '../src/pages/trip/map/driveSuggestionView'
import { journeyRowMeta } from '../src/pages/trip/timeline/travelJourneyRows'
import { journeyFixture } from './helpers/journeyProjectionFixture'
import { projectJourney } from '../src/lib/journeyProjection'
import { driveRowsFromSegments } from '../src/pages/trip/map/driveSuggestionView'
import type { PlaceHit } from '../src/lib/geocode'
import type { ItineraryDay } from '../src/data/types'

/** A day with two confirmed stops, which gives the detour budget a size. */
function dayWithStops(count: number): ItineraryDay {
  return {
    id: 'day-0', index: 0,
    stops: Array.from({ length: count }, (_, i) => ({
      id: `s-${i}`, title: `Stop ${i}`, category: 'food' as const, locationName: `Stop ${i}`, lat: 10, lng: 76,
      visitMinutes: 30, entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have' as const,
      status: 'confirmed' as const, orderInDay: i,
    })),
  }
}

describe('detourDisplay', () => {
  it('keeps null as unknown', () => {
    expect(detourDisplay(null)).toEqual({ kind: 'unknown' })
    expect(detourDisplay(undefined)).toEqual({ kind: 'unknown' })
    expect(detourDisplay(Number.NaN)).toEqual({ kind: 'unknown' })
  })

  it('reads a known zero and a tiny detour as on route', () => {
    expect(detourDisplay(0)).toEqual({ kind: 'on-route' })
    expect(detourDisplay(0.2)).toEqual({ kind: 'on-route' })
    expect(detourDisplay(0.5)).toEqual({ kind: 'on-route' })
  })

  it('reads anything above the threshold as whole extra minutes', () => {
    expect(detourDisplay(0.6)).toEqual({ kind: 'extra', minutes: 1 })
    expect(detourDisplay(1)).toEqual({ kind: 'extra', minutes: 1 })
    expect(detourDisplay(12)).toEqual({ kind: 'extra', minutes: 12 })
    expect(detourDisplay(26.4)).toEqual({ kind: 'extra', minutes: 26 })
  })

  it('formats the three outcomes in one place', () => {
    expect(detourDisplayText(null)).toBe('Unknown')
    expect(detourDisplayText(0.2)).toBe('On route')
    expect(detourDisplayText(0)).toBe('On route')
    expect(detourDisplayText(12)).toBe('+12 min')
  })
})

describe('the Timeline meta follows the same rule', () => {
  const fixture = journeyFixture()
  const base = projectJourney({
    dayPlan: fixture.dayPlan, driveRows: fixture.driveRows, budgetMin: fixture.budgetMin,
    editable: true, presence: fixture.presence, contextKey: fixture.contextKey,
  }).rows[0]!
  const format = { clock: (v: string) => v, minute: (v: number) => String(v) }

  it('never prints +0 min for a tiny detour', () => {
    expect(journeyRowMeta({ ...base, detourMin: 0.2 }, format).detour).toBe('On the route')
    expect(journeyRowMeta({ ...base, detourMin: 0 }, format).detour).toBe('On the route')
    expect(journeyRowMeta({ ...base, detourMin: null }, format).detour).toBe('Detour unknown')
    expect(journeyRowMeta({ ...base, detourMin: 12 }, format).detour).toBe('Detour +12 min')
  })
})

describe('the drive row keeps the model zero', () => {
  const row = (detourMin: number | null) => {
    const place: PlaceHit = { id: 'z', name: 'Z', latitude: 10, longitude: 76, kind: 'poi', category: 'food', cumKm: 100 }
    const segment = {
      index: 0, purpose: 'meal' as const, label: 'meal', targetKm: 100, minKm: 80, maxKm: 130,
      kmFromPrev: 100, minutesFromPrev: 120, hint: '', etaMinutes: 600,
    }
    return driveRowsFromSegments([{ segment, hit: place, score: 1 }], {
      detourMinFor: () => detourMin, days: [dayWithStops(2)], dayForKm: () => 0, travelStyle: 'balanced',
      added: () => false, dismissed: () => false, heldBack: new Set<string>(),
    })[0]!
  }

  it('keeps a known zero as zero with a 0% share, not null', () => {
    const zero = row(0)
    expect(zero.detourMin).toBe(0)
    expect(zero.budgetSharePct).toBe(0)
  })

  it('keeps a tiny detour as a number and gives it no budget share', () => {
    // A fraction up to the on-route cutoff is not a spend. It is not zero either.
    expect(row(0.2).detourMin).toBe(0.2)
    expect(row(0.2).budgetSharePct).toBeNull()
    expect(row(0.6).budgetSharePct).not.toBeNull()
  })

  it('keeps unknown and broken detours as null', () => {
    expect(row(null).budgetSharePct).toBeNull()
    expect(row(Number.NaN).budgetSharePct).toBeNull()
    expect(row(-3).budgetSharePct).toBeNull()
  })
})
