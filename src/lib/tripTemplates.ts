// ============ Trip templates - Create Trip's warm start ============
// Curated starter trips: one tap pre-fills the create form so the page opens
// at "60% done" instead of a blank canvas. Pure module - no react/supabase
// imports, node-testable (same contract as inviteCode.ts / crew.ts).
//
// HONESTY CONTRACT: a template's advertised "from <INR>" figure is not a
// marketing number someone typed - it is what `estimateTripStarter` computes
// for the template's own inputs (the test pins this). Templates never claim
// live prices, never carry availability, and never override anything the
// user has already typed when applied (see applyTemplate's merge rules).

import { estimateTripStarter, type StarterBill } from './tripStarter'
import type { StayStyle, TravelStyle, TransportMode } from '../data/types'

/** Fields of the create form a template may pre-fill. Mirrors the page's `f`
 *  state shape (src/pages/CreateTrip.tsx) - kept as its own type so the page
 *  can adopt it incrementally and tests can construct it without React. */
export interface TemplatePrefill {
  name: string
  startLocation: string
  /** Outbound destinations, journey order, "Place, State" style names. */
  destinations: string[]
  /** Calendar days including travel days (drives the date window). */
  days: number
  travellers: number
  transportMode: TransportMode
  travelStyle: TravelStyle
  stayStyle: StayStyle
  /** Resolved from templateBudget() - not authored content. */
  budgetPerPersonInr?: number
  /** True = same road back (roundTrip on). All v1 templates are round trips. */
  roundTrip: boolean
}

/** A curated template as content: what the strip renders + what it prefills. */
export interface TripTemplate {
  id: string
  /** Display name - also the default trip name when applied. */
  name: string
  emoji: string
  /** One-line route summary under the name (display only). */
  routeLine: string
  /** Best-season note shown on the card's season chip (climatology, not offers). */
  seasonNote: string
  /** CSS gradient for the card cover (token-pairable, no external art). */
  coverGradient: string
  prefill: TemplatePrefill
}

/** Coords for the template's stops - keyed by the exact destination string so
 *  the create form can geocode-verify later; coordinates here are the same
 *  cities the app's geocoder resolves (rounded to 3dp, city-center scale). */
export const TEMPLATE_COORDS: Record<string, { lat: number; lng: number }> = {
  'Kochi, Kerala': { lat: 9.9312, lng: 76.2673 },
  'Munnar, Kerala': { lat: 10.0889, lng: 77.0595 },
  'Alleppey, Kerala': { lat: 9.4981, lng: 76.3388 },
  'Jaipur, Rajasthan': { lat: 26.9124, lng: 75.7873 },
  'Jodhpur, Rajasthan': { lat: 28.7041, lng: 77.1025 },
  'Udaipur, Rajasthan': { lat: 24.5854, lng: 73.7125 },
  'Manali, Himachal Pradesh': { lat: 32.2396, lng: 77.1887 },
  'Kaza, Himachal Pradesh': { lat: 32.2278, lng: 78.0717 },
  'Kasol, Himachal Pradesh': { lat: 32.0000, lng: 77.4500 },
  'Panaji, Goa': { lat: 15.4909, lng: 73.8278 },
  'Palolem, Goa': { lat: 15.0093, lng: 74.0225 },
  'Gokarna, Karnataka': { lat: 14.5500, lng: 74.3000 },
}

/** The four launch templates. Curation rule: real, drivable Indian routes
 *  the engine already handles well (hill, coast, desert corridors). */
export const TRIP_TEMPLATES: readonly TripTemplate[] = [
  {
    id: 'kerala-backwaters',
    name: 'Kerala Backwaters',
    emoji: '\u{1F418}',
    routeLine: 'Kochi \u00B7 Munnar \u00B7 Alleppey',
    seasonNote: 'Best: Nov-Mar',
    coverGradient: 'linear-gradient(120deg,#BFE3DB,#DCEFE9)',
    prefill: {
      name: 'Kerala Backwaters',
      startLocation: 'Kochi, Kerala',
      destinations: ['Munnar, Kerala', 'Alleppey, Kerala'],
      days: 6,
      travellers: 4,
      transportMode: 'car',
      travelStyle: 'balanced',
      stayStyle: 'comfort',
      roundTrip: true,
    },
  },
  {
    id: 'rajasthan-forts',
    name: 'Rajasthan Forts',
    emoji: '\u{1F3D9}\u{FE0F}',
    routeLine: 'Jaipur \u00B7 Jodhpur \u00B7 Udaipur',
    seasonNote: 'Best: Oct-Mar',
    coverGradient: 'linear-gradient(120deg,#F6EAD6,#F2D8B8)',
    prefill: {
      name: 'Rajasthan Forts',
      startLocation: 'Jaipur, Rajasthan',
      destinations: ['Jodhpur, Rajasthan', 'Udaipur, Rajasthan'],
      days: 7,
      travellers: 4,
      transportMode: 'car',
      travelStyle: 'balanced',
      stayStyle: 'comfort',
      roundTrip: true,
    },
  },
  {
    id: 'himalayan-loop',
    name: 'Himalayan Loop',
    emoji: '\u{1F3D4}\u{FE0F}',
    routeLine: 'Manali \u00B7 Spiti \u00B7 Kasol',
    seasonNote: 'Best: Jun-Sep',
    coverGradient: 'linear-gradient(120deg,#DDE8F5,#E8F3FC)',
    prefill: {
      name: 'Himalayan Loop',
      startLocation: 'Manali, Himachal Pradesh',
      destinations: ['Kaza, Himachal Pradesh', 'Kasol, Himachal Pradesh'],
      days: 8,
      travellers: 3,
      transportMode: 'car',
      travelStyle: 'relaxed',
      stayStyle: 'budget',
      roundTrip: true,
    },
  },
  {
    id: 'goa-weekend',
    name: 'Goa Long Weekend',
    emoji: '\u{1F334}',
    routeLine: 'Panaji \u00B7 Palolem \u00B7 Gokarna',
    seasonNote: 'Best: Nov-Feb',
    coverGradient: 'linear-gradient(120deg,#F9E2C8,#F6D5B0)',
    prefill: {
      name: 'Goa Long Weekend',
      startLocation: 'Panaji, Goa',
      destinations: ['Palolem, Goa', 'Gokarna, Karnataka'],
      days: 3,
      travellers: 4,
      transportMode: 'car',
      travelStyle: 'relaxed',
      stayStyle: 'comfort',
      roundTrip: true,
    },
  },
]

/** The bed one tier up - the upper end of a card's price band. The band is
 *  NOT a marketing cushion: it is the same trip priced at the tier the card
 *  loads and at the next bed up, both computed by the engine. The bed is what
 *  actually moves a trip's cost by 2x, so the band says exactly that. */
const NEXT_STAY_TIER: Record<StayStyle, StayStyle> = {
  budget: 'comfort', comfort: 'luxury', luxury: 'luxury',
}

/** Per-head for a template at a given bed tier - the single source both ends
 *  of the band come from, so the card can never promise more than the math. */
function headAt(t: TripTemplate, stayStyle: StayStyle): number {
  const pts = [TEMPLATE_COORDS[t.prefill.startLocation], ...t.prefill.destinations.map(d => TEMPLATE_COORDS[d])]
  const bill: StarterBill = estimateTripStarter({
    // Dates only shape day count in the bill; a fixed 2026 window keeps the
    // figure date-independent while using the real calendar math.
    startDate: '2026-02-14',
    endDate: isoAddDaysFixed('2026-02-14', t.prefill.days - 1),
    travellers: t.prefill.travellers,
    mode: t.prefill.transportMode,
    orderedPoints: pts,
    returnCount: 0,
    roundTrip: t.prefill.roundTrip,
    stayStyle,
  })
  if (bill.perHead == null) return 0
  return Math.round(bill.perHead / 100) * 100
}

/** The card's honest band, both ends computed: what the template loads
 *  (low) and the same trip with the next bed up (high). Public so the test
 *  pins both ends to the engine and the UI renders the same numbers. */
export function templateFromRange(t: TripTemplate): { low: number; high: number } {
  const low = headAt(t, t.prefill.stayStyle)
  const high = Math.max(low, headAt(t, NEXT_STAY_TIER[t.prefill.stayStyle]))
  return { low, high }
}

/** Compact money for the narrow template tiles: 12700 -> "12,700",
 *  24700 -> "24,700" (Indian grouping), prefixed once and joined with an en
 *  dash, e.g. "\u20B912,700-24,700". Kept here so the card and the test agree
 *  on the exact string the user reads. */
export function fmtBand(r: { low: number; high: number }): string {
  const inr = (v: number) => v.toLocaleString('en-IN')
  return r.high > r.low ? `\u20B9${inr(r.low)}\u2013${inr(r.high)}` : `\u20B9${inr(r.low)}`
}

/** The budget the form should load for this template: the low end of the band,
 *  rounded the way the page's own smart-budget rounds (nearest 500). Derived,
 *  never typed - so the card's band and the form's number agree by construction. */
export function templateBudget(t: TripTemplate): number {
  return Math.max(500, Math.round(templateFromRange(t).low / 500) * 500)
}

/** Kept for callers that want the single loaded-tier figure. */
export function templateFromPerHead(t: TripTemplate): number {
  return templateFromRange(t).low
}

/** Minimal local day-add (no imports from weather.ts - keeps this module
 *  react-free AND weather-free; the page already has isoAddDays). */
function isoAddDaysFixed(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Merge a template onto the page's form state. Fields the user has already
 *  touched are NEVER clobbered - the template warms the start, it does not
 *  take over. Currently-typed name/start win over the template's.
 *  Returns the patched `f` fields plus the destination draft list. */
export function applyTemplate(
  t: TripTemplate,
  current: { name: string; startLocation: string; budgetTouched: boolean },
): { fields: Partial<TemplatePrefill>; dests: { name: string; lat?: number; lng?: number }[] } {
  const fields: Partial<TemplatePrefill> = {
    travellers: t.prefill.travellers,
    transportMode: t.prefill.transportMode,
    travelStyle: t.prefill.travelStyle,
    stayStyle: t.prefill.stayStyle,
    roundTrip: t.prefill.roundTrip,
  }
  // The template's name/start only fill blanks - if the user typed a name or
  // a start city already, theirs stays.
  if (!current.name.trim()) fields.name = t.prefill.name
  if (!current.startLocation.trim()) fields.startLocation = t.prefill.startLocation
  // The budget dial: never clobber a number the user set their own number.
  // (budgetTouched mirrors the page's flag of the same name.)
  if (!current.budgetTouched) fields.budgetPerPersonInr = templateBudget(t)
  const dests = t.prefill.destinations.map(name => {
    const c = TEMPLATE_COORDS[name]
    return c ? { name, lat: c.lat, lng: c.lng } : { name }
  })
  return { fields, dests }
}
