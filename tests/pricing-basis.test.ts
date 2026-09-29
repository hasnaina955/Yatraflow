// #521: a rental's daily rate and the local-train flag priced the create ticket
// and never reach the stored figures, so the same trip prices differently before
// and after it is created. The decision was to SAY which basis is used rather than
// re-plumb those two fields into trip billing, which would change money users have
// already been quoted. These pin the sentence, the cases that must stay silent, and
// the fact that the tab actually renders it.
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { pricingBasisNote } from '../src/lib/pricingBasis'

describe('what a trip is priced by (#521)', () => {
  it('explains a rental rate against the basis the tab actually used', () => {
    const trip = { transportMode: 'rental', rentPerDayInr: 2500 }
    // Blended table (no stated mileage): name the rate the figures use.
    expect(pricingBasisNote(trip, 7.5, false)).toBe(
      ' Your ₹2,500/day rental rate priced the create estimate; the figures here use the blended ₹7.5/km rate.',
    )
    // Fuel-based (a stated km/L): the sentence must not claim the blended rate.
    const fuel = pricingBasisNote(trip, 7.5, true)!
    expect(fuel).toContain('fuel-based')
    expect(fuel).not.toContain('7.5/km')
  })

  it('explains the local-train flag for a train trip', () => {
    expect(pricingBasisNote({ transportMode: 'train', localTrain: true }, 1.6, false)).toBe(
      ' Suburban train fares priced the create estimate; the figures here use the blended ₹1.6/km rate.',
    )
    // The assumptions' rate is optional, so an absent one degrades the wording
    // rather than printing "₹undefined/km" — which the tab's own line would not.
    expect(pricingBasisNote({ transportMode: 'train', localTrain: true }, undefined, false)).toBe(
      ' Suburban train fares priced the create estimate; the figures here use the blended per-km rate.',
    )
  })

  it('stays silent when there is nothing to explain', () => {
    // The ordinary case: no rent stated, no local flag, or a mode where neither
    // applies. A note on every trip would be noise, and noise is how a real one
    // stops being read.
    expect(pricingBasisNote({ transportMode: 'car' }, 9, true)).toBeNull()
    expect(pricingBasisNote({ transportMode: 'rental' }, 7.5, false)).toBeNull()
    expect(pricingBasisNote({ transportMode: 'train' }, 1.6, false)).toBeNull()
    expect(pricingBasisNote({ transportMode: 'train', localTrain: false }, 1.6, false)).toBeNull()
    // A rate the writers would have refused is not worth a sentence.
    expect(pricingBasisNote({ transportMode: 'rental', rentPerDayInr: 0 }, 7.5, false)).toBeNull()
    expect(pricingBasisNote({ transportMode: 'rental', rentPerDayInr: -5 }, 7.5, false)).toBeNull()
    expect(pricingBasisNote({ transportMode: 'rental', rentPerDayInr: Number.NaN }, 7.5, false)).toBeNull()
    // And a rental rate on a mode that is not rental says nothing: the create
    // ticket only bills rent for rental mode, so the flag would be describing a
    // number that never priced anything.
    expect(pricingBasisNote({ transportMode: 'car', rentPerDayInr: 2500 }, 9, false)).toBeNull()
  })

  it('is rendered by the Budget tab — the helper is not dead code', () => {
    const tab = readFileSync(new URL('../src/pages/trip/BudgetTab.tsx', import.meta.url), 'utf8')
    expect(tab).toContain('pricingBasisNote(trip, A.inrPerKm, !!A.kmPerLiter)')
  })
})
