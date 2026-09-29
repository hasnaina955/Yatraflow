import type { Trip } from '../data/types'

/**
 * The sentence a rental or train trip needs, because two fields the create form
 * collects priced the ESTIMATE and never reach the stored figures (#521): a rental
 * car's daily rate, and the local-train flag.
 *
 * The consequence is a trip that prices differently before and after it is
 * created, and it was silent: the tab named the basis it does use ("route distance
 * × ₹7.5/km") without ever saying that the number the creator agreed to on the
 * create ticket was built another way. Two honest answers were available — price
 * from the daily rate for real, or say which basis is used. This is the second,
 * chosen deliberately: re-plumbing rent and suburban fares into trip billing would
 * change money users have already been quoted, and the blended tables are the ones
 * every other surface agrees with (#382's one-rule rule is about not having two
 * answers; this makes the two answers visible rather than quietly swapping one).
 *
 * `fuelBased` is the caller's answer to "which basis did the tab actually use" —
 * a rental with a stated mileage is priced fuel-first, one without falls back to
 * the blended ₹/km table — so the sentence can never claim the wrong one. Returns
 * null in the ordinary case, where there is nothing to explain.
 */
export function pricingBasisNote(
  trip: Pick<Trip, 'transportMode' | 'rentPerDayInr' | 'localTrain'>,
  inrPerKm: number | undefined,
  fuelBased: boolean,
): string | null {
  // A rate the writers would have refused is not worth a sentence (the same
  // sanitiser the row codec applies, read here rather than re-derived).
  const rent = typeof trip.rentPerDayInr === 'number' && Number.isFinite(trip.rentPerDayInr) && trip.rentPerDayInr > 0
    ? trip.rentPerDayInr
    : null
  // `inrPerKm` is optional on the assumptions, so the blended wording degrades to
  // a rate-less sentence rather than printing "₹undefined/km" — which is what the
  // tab's own line would do if the assumption were ever absent.
  const blended = typeof inrPerKm === 'number' ? `the blended ₹${inrPerKm}/km rate` : 'the blended per-km rate'
  const basis = fuelBased
    ? 'the figures here are fuel-based: distance ÷ your km/L × the pump price'
    : `the figures here use ${blended}`
  if (trip.transportMode === 'rental' && rent) {
    return ` Your ₹${rent.toLocaleString('en-IN')}/day rental rate priced the create estimate; ${basis}.`
  }
  if (trip.transportMode === 'train' && trip.localTrain === true) {
    return ` Suburban train fares priced the create estimate; ${basis}.`
  }
  return null
}
