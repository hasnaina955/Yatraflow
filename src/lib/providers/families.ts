// ============ Place families and confirmed facts (ticket 09 / #894) ============
// Pure classification and fact tables from the Map V2 source's "Place types
// and their marks" table. Classification precedence: provider type first,
// then evidenced name, then OSM tags, then generic Sight.
//
// CONFIRMED-ROWS-ONLY rule (ticket 09 AC): subtype visit minutes and rain
// rules are exposed ONLY where the source row is complete. The source's
// Water rain, Views rain and Heritage visit+rain cells are empty (validated
// 2026-11-05), and Heritage's OSM tag list is truncated mid-entry — so those
// facts are absent here and consumers fall back generically. Nothing is
// invented for them.
//
// No network, no provider imports — google.ts adapts its raw hits into this
// vocabulary; free-mode OSM wiring is a coordinator-flagged follow-up (the
// pure tag classifier below is ready for it).
import type { StopCategory } from '../../data/types'
import { STOP_CATEGORIES } from '../../data/types'

export type PlaceFamily = 'water' | 'nature' | 'views' | 'faith' | 'heritage' | 'culture'

/**
 * The StopCategory each family's query results carry (purposeQueries +
 * provider use). Repair R1 (progress review, P1): every value is a member of
 * the existing STOP_CATEGORIES domain (data/types.ts) — 'nature', 'beach',
 * 'temple', 'museum' and 'sightseeing' — so a saved stop never persists a
 * category outside StopCategory and the itinerary import validator accepts
 * it unchanged. The family itself stays a separate fact on the hit
 * (`family`/`subtype`); it is NOT folded into category, and the domain is
 * NOT widened.
 */
export const FAMILY_CATEGORY: Record<PlaceFamily, StopCategory> = {
  water: 'nature',
  nature: 'nature',
  views: 'nature',
  faith: 'temple',
  heritage: 'museum',
  culture: 'sightseeing',
}

/**
 * The stop category a family's hits must persist as — the single boundary
 * mapping for saved stops. `s.category` is guaranteed to already be a
 * StopCategory (R1); this returns it verbatim, defensively narrowed.
 */
export function stopCategoryForHit(category: string | undefined): StopCategory {
  return (STOP_CATEGORIES as readonly string[]).includes(category ?? '')
    ? (category as StopCategory)
    : 'sightseeing'
}

export type RainRule = 'exposed' | 'sheltered' | 'mixed'

export interface FamilyFacts {
  /** confirmed visit minutes for the subtype; undefined = row incomplete → generic pacing */
  visitMin?: number
  /** confirmed rain rule; undefined = row incomplete → no weather adjustment */
  rain?: RainRule
}

export interface PlaceClassification {
  /**
   * a member of the StopCategory domain (R1) — family/subtype carry the
   * refinement as separate facts
   */
  category: string
  family: PlaceFamily | null
  subtype: string | null
  evidence: 'type' | 'name' | 'osm' | 'none'
}

const MINUTES = (n: number) => n

/** Confirmed subtype facts. Rain is set only where the source row has it. */
const FAMILY_FACTS: Record<PlaceFamily, Record<string, FamilyFacts>> = {
  // visit: waterfall 45, lake 45, dam/reservoir 30, river/ghat 30, beach 90, backwater/boat 120
  water: {
    waterfall: { visitMin: MINUTES(45) },
    lake: { visitMin: MINUTES(45) },
    dam: { visitMin: MINUTES(30) },
    river: { visitMin: MINUTES(30) },
    beach: { visitMin: MINUTES(90) },
    backwater: { visitMin: MINUTES(120) },
    // rain: source cell empty — no rule
  },
  // visit: forest 60, wildlife/np 180, garden/park 45, cave 60, trek 180, tea/spice 60; rain: exposed
  nature: {
    forest: { visitMin: MINUTES(60), rain: 'exposed' },
    wildlife: { visitMin: MINUTES(180), rain: 'exposed' },
    garden: { visitMin: MINUTES(45), rain: 'exposed' },
    cave: { visitMin: MINUTES(60), rain: 'exposed' },
    trek: { visitMin: MINUTES(180), rain: 'exposed' },
    estate: { visitMin: MINUTES(60), rain: 'exposed' },
  },
  // visit: viewpoint 20, peak/mountain 120, hill 45, sunrise/sunset 30; rain: cell empty
  views: {
    viewpoint: { visitMin: MINUTES(20) },
    peak: { visitMin: MINUTES(120) },
    hill: { visitMin: MINUTES(45) },
    'sunrise-sunset': { visitMin: MINUTES(30) },
  },
  // visit: temple 40, mosque/dargah 30, church 30, gurdwara 40, monastery 45; rain: sheltered
  faith: {
    temple: { visitMin: MINUTES(40), rain: 'sheltered' },
    mosque: { visitMin: MINUTES(30), rain: 'sheltered' },
    church: { visitMin: MINUTES(30), rain: 'sheltered' },
    gurdwara: { visitMin: MINUTES(40), rain: 'sheltered' },
    monastery: { visitMin: MINUTES(45), rain: 'sheltered' },
  },
  // heritage: visit AND rain cells empty in the source — no facts until confirmed.
  heritage: {
    fort: {},
    palace: {},
    monument: {},
    ruins: {},
    museum: {},
  },
  // visit: market 60, show 75, adventure 120, amusement/water park 180; rain: mixed
  culture: {
    market: { visitMin: MINUTES(60), rain: 'mixed' },
    show: { visitMin: MINUTES(75), rain: 'mixed' },
    adventure: { visitMin: MINUTES(120), rain: 'mixed' },
    park: { visitMin: MINUTES(180), rain: 'mixed' },
  },
}

/**
 * Confirmed facts for a hit's family + subtype; undefined → honest generic
 * fallback. Repair R1: the family comes from the hit's `family` fact when
 * present, otherwise from the pre-family category vocabulary (beach stays a
 * Water-family fact; the 'water'/'views'/'heritage'/'culture' entries keep
 * resolving pre-repair persisted data). The CATEGORY argument is only a
 * legacy bridge — new hits carry family/subtype directly.
 */
const CATEGORY_TO_FAMILY: Record<string, PlaceFamily> = {
  water: 'water',
  beach: 'water',
  nature: 'nature',
  views: 'views',
  temple: 'faith',
  heritage: 'heritage',
  museum: 'heritage',
  culture: 'culture',
  sightseeing: 'culture', // family-bearing hits persist as sightseeing (R1)
  adventure: 'culture',
}

export function familyFactsFor(category: string | undefined, subtype: string | null | undefined, family?: PlaceFamily): FamilyFacts | undefined {
  const resolvedFamily = family ?? (category ? CATEGORY_TO_FAMILY[category] : undefined)
  if (!resolvedFamily) return undefined
  const table = FAMILY_FACTS[resolvedFamily]
  if (!table) return undefined
  if (subtype && table[subtype] != null) {
    const facts = table[subtype]
    // a subtype row with no confirmed fields still yields no invented facts
    return facts.visitMin == null && facts.rain == null ? undefined : facts
  }
  return undefined
}

// ---- provider-type evidence (source "Detected from" — Google types) ----
// Only NEW or source-corrected mappings live here; the pre-existing
// GOOGLE_TYPE_TO_CATEGORY in google.ts is checked FIRST so existing behavior
// for food/hotel/fuel/travel/shopping is untouched.
const FAMILY_TYPE_MAP: Record<string, { category: string; family: PlaceFamily; subtype: string | null }> = {  natural_feature: { category: 'nature', family: 'water', subtype: null }, // source Water row; rain row empty → neutral
  marina: { category: 'nature', family: 'water', subtype: 'backwater' },
  national_park: { category: 'nature', family: 'nature', subtype: 'wildlife' },
  state_park: { category: 'nature', family: 'nature', subtype: 'garden' },
  zoo: { category: 'nature', family: 'nature', subtype: 'wildlife' },
  // source Nature row ("hiking_area") — moved out of google.ts's legacy
  // 'adventure' mapping; without this entry the primary type would be
  // unrecognized and the query's purpose could leak in as a category (B2).
  hiking_area: { category: 'nature', family: 'nature', subtype: 'trek' },
  observation_deck: { category: 'nature', family: 'views', subtype: 'viewpoint' },
  monastery: { category: 'temple', family: 'faith', subtype: 'monastery' },
  historical_landmark: { category: 'museum', family: 'heritage', subtype: null },
  monument: { category: 'museum', family: 'heritage', subtype: 'monument' }, // API-type validity flagged for verification
  performing_arts_theater: { category: 'sightseeing', family: 'culture', subtype: 'show' },
  amusement_park: { category: 'sightseeing', family: 'culture', subtype: 'park' },
  water_park: { category: 'sightseeing', family: 'culture', subtype: 'park' },
  market: { category: 'sightseeing', family: 'culture', subtype: 'market' }, // source Culture row (was 'shopping')
}

/** The full type→family table as an ordered list — the boundary-invariant test sweep reads it. */
export const FAMILY_TYPE_ENTRIES = Object.values(FAMILY_TYPE_MAP)

/** Family classification from a provider machine type; null when the type is not a source-confirmed family type. */
export function familyFromType(type: string | undefined): { category: string; family: PlaceFamily; subtype: string | null } | null {
  if (!type) return null
  return FAMILY_TYPE_MAP[type] ?? null
}

// ---- evidenced-name evidence (source "names with ..." columns) ----
// Token/phrase matched against the lowercased name. Name evidence only ever
// refines a generic sight context — it never re-classifies a food/fuel/hotel
// hit (google.ts gates it on the sight-land fallback).
type TypeEvidence = { category: string; family: PlaceFamily; subtype: string }
const NAME_TOKENS: Record<string, TypeEvidence> = {
  falls: { category: 'nature', family: 'water', subtype: 'waterfall' },
  lake: { category: 'nature', family: 'water', subtype: 'lake' },
  dam: { category: 'nature', family: 'water', subtype: 'dam' },
  reservoir: { category: 'nature', family: 'water', subtype: 'dam' },
  beach: { category: 'nature', family: 'water', subtype: 'beach' },
  backwater: { category: 'nature', family: 'water', subtype: 'backwater' },
  boat: { category: 'nature', family: 'water', subtype: 'backwater' },
  ghat: { category: 'nature', family: 'water', subtype: 'river' },
  forest: { category: 'nature', family: 'nature', subtype: 'forest' },
  sanctuary: { category: 'nature', family: 'nature', subtype: 'wildlife' },
  reserve: { category: 'nature', family: 'nature', subtype: 'wildlife' },
  cave: { category: 'nature', family: 'nature', subtype: 'cave' },
  trek: { category: 'nature', family: 'nature', subtype: 'trek' },
  estate: { category: 'nature', family: 'nature', subtype: 'estate' },
  plantation: { category: 'nature', family: 'nature', subtype: 'estate' },
  peak: { category: 'nature', family: 'views', subtype: 'peak' },
  hill: { category: 'nature', family: 'views', subtype: 'hill' },
  top: { category: 'nature', family: 'views', subtype: 'peak' },
  mala: { category: 'nature', family: 'views', subtype: 'hill' },
  betta: { category: 'nature', family: 'views', subtype: 'hill' },
  gurudwara: { category: 'temple', family: 'faith', subtype: 'gurdwara' },
  gompa: { category: 'temple', family: 'faith', subtype: 'monastery' },
  monastery: { category: 'temple', family: 'faith', subtype: 'monastery' },
  dargah: { category: 'temple', family: 'faith', subtype: 'mosque' },
  fort: { category: 'museum', family: 'heritage', subtype: 'fort' },
  kota: { category: 'museum', family: 'heritage', subtype: 'fort' },
  qila: { category: 'museum', family: 'heritage', subtype: 'fort' },
  palace: { category: 'museum', family: 'heritage', subtype: 'palace' },
  mahal: { category: 'museum', family: 'heritage', subtype: 'palace' },
  stupa: { category: 'museum', family: 'heritage', subtype: 'monument' },
  bazaar: { category: 'sightseeing', family: 'culture', subtype: 'market' },
  kalari: { category: 'sightseeing', family: 'culture', subtype: 'show' },
  kathakali: { category: 'sightseeing', family: 'culture', subtype: 'show' },
  rafting: { category: 'sightseeing', family: 'culture', subtype: 'adventure' },
  paragliding: { category: 'sightseeing', family: 'culture', subtype: 'adventure' },
  zipline: { category: 'sightseeing', family: 'culture', subtype: 'adventure' },
}
const NAME_PHRASES: Record<string, TypeEvidence> = {
  'view point': { category: 'nature', family: 'views', subtype: 'viewpoint' },
  viewpoint: { category: 'nature', family: 'views', subtype: 'viewpoint' },
  'sunrise point': { category: 'nature', family: 'views', subtype: 'sunrise-sunset' },
  'sunset point': { category: 'nature', family: 'views', subtype: 'sunrise-sunset' },
  'tea estate': { category: 'nature', family: 'nature', subtype: 'estate' },
  'spice estate': { category: 'nature', family: 'nature', subtype: 'estate' },
  'national park': { category: 'nature', family: 'nature', subtype: 'wildlife' },
}

/** Family classification from an evidenced place name; null when no source name word matches.
 *  Matching is token/phrase based with bounded inflections: exact and de-pluralized
 *  tokens always match; compound words match a source word only by suffix (≥5 chars,
 *  e.g. "waterfalls" → falls) or prefix (≥6 chars) so short generic words ("top",
 *  "mala") never fire inside unrelated names. */
export function familyFromName(name: string | undefined): { category: string; family: PlaceFamily; subtype: string } | null {
  if (!name) return null
  const lower = name.toLowerCase()
  for (const [phrase, ev] of Object.entries(NAME_PHRASES)) {
    if (lower.includes(phrase)) return ev
  }
  const tokens = lower.split(/[^a-z]+/).filter(Boolean)
  for (const token of tokens) {
    const candidates = [token]
    if (token.endsWith('s') && token.length > 3) candidates.push(token.slice(0, -1))
    for (const candidate of candidates) {
      const exact = NAME_TOKENS[candidate]
      if (exact) return exact
    }
    for (const [word, ev] of Object.entries(NAME_TOKENS)) {
      if (word.length >= 5 && token.endsWith(word)) return ev
      if (word.length >= 6 && token.startsWith(word)) return ev
    }
  }
  return null
}

// ---- OSM-tag evidence (free mode) ----
// ONLY the tag cells that survive in the source are encoded. Heritage's OSM
// list is truncated mid-entry in the source MD — no heritage tag classifier
// until the coordinator confirms the missing tags. Do not reconstruct them.
const FAMILY_OSM_MAP: Record<string, TypeEvidence> = {
  'waterway=waterfall': { category: 'nature', family: 'water', subtype: 'waterfall' },
  'natural=water': { category: 'nature', family: 'water', subtype: 'lake' },
  'waterway=dam': { category: 'nature', family: 'water', subtype: 'dam' },
  'natural=beach': { category: 'nature', family: 'water', subtype: 'beach' },
  'landuse=forest': { category: 'nature', family: 'nature', subtype: 'forest' },
  'leisure=nature_reserve': { category: 'nature', family: 'nature', subtype: 'wildlife' },
  'boundary=national_park': { category: 'nature', family: 'nature', subtype: 'wildlife' },
  'natural=cave_entrance': { category: 'nature', family: 'nature', subtype: 'cave' },
  'tourism=viewpoint': { category: 'nature', family: 'views', subtype: 'viewpoint' },
  'natural=peak': { category: 'nature', family: 'views', subtype: 'peak' },
  'natural=hill': { category: 'nature', family: 'views', subtype: 'hill' },
}

/**
 * Family classification from OSM tags (free mode). Precedence within tags is
 * the map's insertion order (most specific first: waterfall before water).
 */
export function familyFromOsmTags(tags: Record<string, string> | undefined): { category: string; family: PlaceFamily; subtype: string } | null {
  if (!tags) return null
  for (const [key, value] of Object.entries(tags)) {
    const ev = FAMILY_OSM_MAP[`${key}=${value}`]
    if (ev) return ev
  }
  return null
}
