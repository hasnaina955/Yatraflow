// ============ Purpose-specific search queries ============
// Maps each HaltPurpose to the Google text queries and Overpass selectors
// that find the right kind of place for that segment. Highway-biased for
// functional stops (meal, fuel, rest); wider tourist queries for sight.
//
// No network — pure string tables. The caller (geocode.ts / google.ts /
// free.ts) decides which queries to run based on the segment at hand.

import type { FuelType } from '../data/types'
import type { HaltPurpose } from './providers/hits'
import type { PlaceFamily } from './providers/families'
import { FAMILY_CATEGORY } from './providers/families'

export interface PurposeQuerySet {
  /** Google Places textSearch queries (e.g. "highway dhabas"). */
  googleQueries: string[]
  /** Overpass nwr selectors (e.g. "amenity=restaurant"). */
  overpassSelectors: string[]
  /** Category bias used by rankAndCap. */
  categoryBias: string[]
  /**
   * Google Places `includedType` — when set, the search request asks for this
   * place type ONLY (server-side filter), and the client drops any hit whose
   * primaryType/types miss it (belt-and-braces against stray results).
   */
  includedType?: string
}

// ---- core query tables ----

const MEAL_QUERIES: PurposeQuerySet = {
  googleQueries: ['highway dhabas restaurants', 'highway food court', 'roadside restaurants'],
  overpassSelectors: ['amenity=restaurant', 'amenity=fast_food', 'amenity=food_court'],
  categoryBias: ['food'],
}

const STRETCH_QUERIES: PurposeQuerySet = {
  googleQueries: ['highway tea stalls', 'roadside cafes', 'highway coffee shops'],
  overpassSelectors: ['amenity=cafe', 'amenity=fast_food'],
  categoryBias: ['cafe', 'food'],
}

const REST_QUERIES: PurposeQuerySet = {
  googleQueries: ['highway rest areas', 'roadside rest stops'],
  overpassSelectors: ['highway=rest_area', 'amenity=shelter'],
  categoryBias: ['rest'],
}

const HOTEL_QUERIES: PurposeQuerySet = {
  googleQueries: ['hotels', 'highway hotels', 'town hotels'],
  overpassSelectors: ['tourism=hotel', 'tourism=guest_house', 'tourism=motel'],
  categoryBias: ['hotel'],
}

const SIGHT_QUERIES: PurposeQuerySet = {
  // single strict query — Google's tourist_attraction place type, gated
  // server-side via includedType and re-checked client-side on the hit's
  // primaryType/types. "places to visit" returned localities ("Community
  // Block") — dropped.
  googleQueries: ['tourist attractions'],
  overpassSelectors: ['tourism=attraction', 'tourism=viewpoint', 'historic=monument'],
  categoryBias: ['sightseeing'],
  includedType: 'tourist_attraction',
}

function fuelQueries(fuelType?: FuelType): PurposeQuerySet {
  if (fuelType === 'electric') {
    return {
      googleQueries: ['EV charging stations', 'electric vehicle charging'],
      overpassSelectors: ['amenity=charging_station'],
      categoryBias: ['transport-hub'],
    }
  }
  if (fuelType === 'cng') {
    return {
      googleQueries: ['CNG pumps', 'CNG filling stations'],
      overpassSelectors: ['amenity=fuel', 'fuel:cng=yes'],
      categoryBias: ['transport-hub'],
    }
  }
  // petrol / diesel (default)
  return {
    googleQueries: ['petrol pumps', 'fuel stations', 'gas stations'],
    overpassSelectors: ['amenity=fuel'],
    categoryBias: ['transport-hub'],
  }
}

/** Return the query set for a given halt purpose and fuel type. */
export function queriesForPurpose(
  purpose: HaltPurpose,
  fuelType?: FuelType,
): PurposeQuerySet {
  switch (purpose) {
    case 'meal': return MEAL_QUERIES
    case 'stretch': return STRETCH_QUERIES
    case 'rest': return REST_QUERIES
    case 'fuel': return fuelQueries(fuelType)
    case 'overnight': return HOTEL_QUERIES
    case 'sight': return SIGHT_QUERIES
    default: return STRETCH_QUERIES
  }
}

// ---- family query sets (ticket 09 / #894) ----
// One Text Search event per family query, for the day the family is needed
// (ticket 10 builds the day-context selection on top; family SELECTION and
// operating limits require coordinator agreement before any live expansion).
// Deliberately NO includedType: the audit's flaw 5 showed a strict
// tourist_attraction gate discards lakes, waterfalls, dams and viewpoints —
// the family classification (providers/families.ts) refines results instead.
// Overpass selectors carry ONLY the tag cells that survive in the source;
// heritage's OSM list is truncated there, so its selectors stay limited to
// the recoverable prefix (fort/castle/palace) rather than reconstructed.
export const FAMILY_QUERY_SETS: Record<PlaceFamily, PurposeQuerySet> = {
  water: {
    googleQueries: ['waterfalls', 'lakes and dams', 'beaches'],
    overpassSelectors: ['natural=water', 'waterway=waterfall', 'waterway=dam', 'natural=beach'],
    categoryBias: ['water', 'beach'],
  },
  nature: {
    googleQueries: ['national parks and wildlife sanctuaries', 'forests and caves'],
    overpassSelectors: ['landuse=forest', 'leisure=nature_reserve', 'boundary=national_park', 'natural=cave_entrance'],
    categoryBias: ['nature'],
  },
  views: {
    googleQueries: ['viewpoints and sunset points', 'peaks and hills'],
    overpassSelectors: ['tourism=viewpoint', 'natural=peak', 'natural=hill'],
    categoryBias: ['views'],
  },
  faith: {
    googleQueries: ['temples', 'mosques dargahs churches gurudwaras'],
    overpassSelectors: ['amenity=place_of_worship'],
    categoryBias: ['temple'],
  },
  heritage: {
    googleQueries: ['forts and palaces', 'monuments and heritage sites'],
    overpassSelectors: ['historic=fort', 'historic=castle', 'historic=palace'],
    categoryBias: ['heritage'],
  },
  culture: {
    googleQueries: ['markets and bazaars', 'adventure activities', 'amusement and water parks'],
    overpassSelectors: ['amenity=marketplace'],
    categoryBias: ['culture'],
  },
}

/** The query set for a place family; results carry the family's category. */
export function queriesForFamily(family: PlaceFamily): PurposeQuerySet {
  return FAMILY_QUERY_SETS[family]
}

/** Text-search entries for the given families, in the shape the provider scans consume. */
export function familyQueryEntries(families: readonly PlaceFamily[]): { textQuery: string; cat: string; includedType?: string }[] {
  return families.flatMap(f => {
    const cat = FAMILY_CATEGORY[f]
    return queriesForFamily(f).googleQueries.map(textQuery => ({ textQuery, cat }))
  })
}
