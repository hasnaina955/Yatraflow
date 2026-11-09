// ============ Public plan art — one resolver for every image slot ============
// A published plan mostly has no photos. Every slot that would show a photo
// (the cover, a day card, a ride-along day, an "other days" thumbnail, an
// Explore card) asks this module for a generated scene instead, so no slot is
// an empty box or a block of flat colour.
//
// The order goes from the most specific claim to the least:
//   1. the places of this one day (a destination or its state scene),
//   2. the places of the whole plan,
//   3. the coarse region keyword match the trip pages use,
//   4. the neutral scene.
// A neutral answer from step 1 does not stop the search, because a day whose
// stops are unknown places still belongs to the plan's state.
import { placeArtFor, placeFallbacksFrom, type PlaceArtMatch } from './placeArt'
import { ART_MANIFEST, artIdFor } from './regionArt'
import { regionFor } from './tripsPage'

const FALLBACKS = placeFallbacksFrom(ART_MANIFEST)

function specific(match: PlaceArtMatch | null): string | null {
  return match && match.kind !== 'generic' ? match.id : null
}

/**
 * The scene id for one image slot of a public plan.
 *
 * `seed` must be stable for the slot, such as `${pubId}:day:${index}`, so a
 * place with several scenes keeps the same one across renders. Returns null
 * only when the manifest has no scene at all; the caller's motif then fills
 * the slot.
 */
export function pubArtId(input: {
  seed: string
  /** Place names of this slot: a day's stops or its overnight town. Empty for a plan-level slot. */
  slotPlaces?: readonly string[]
  /** Place names of the whole plan: its destinations or its route stops. */
  planPlaces: readonly string[]
}): string | null {
  const { seed, slotPlaces = [], planPlaces } = input
  const fromSlot = slotPlaces.length > 0 ? specific(placeArtFor(slotPlaces, seed, FALLBACKS)) : null
  if (fromSlot) return fromSlot
  const fromPlan = specific(placeArtFor(planPlaces, seed, FALLBACKS))
  if (fromPlan) return fromPlan
  const region = regionFor({ destinations: [...planPlaces] })
  if (region !== 'generic') {
    const regional = artIdFor(region, seed)
    if (regional) return regional
  }
  return placeArtFor([], seed, FALLBACKS)?.id ?? artIdFor('generic', seed)
}
