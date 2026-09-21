// ============ Budget benchmarks - the honest anchor ============
// The line under the budget dial that judges a number against reality:
// "our rough take for a 6-day Kerala run: INR 7,300-12,300 / head".
//
// HONESTY CONTRACT - where these numbers come from:
//   The band is NOT a market survey and never claims to be. It is this
//   product's own estimate for a nominal route in that region, computed by
//   the same `estimateTripStarter` that prints the trip's bill. Two inputs
//   are curated (which route stands in for the region, and its stop
//   coordinates - facts, not prices); every rupee figure comes from the
//   engine's shared rate tables. So the anchor can never disagree with the
//   bill it is anchoring - and when a rate changes, both move together.
//
// Pure module: no react/supabase imports, node-testable.

import { estimateTripStarter } from './tripStarter'
import { TEMPLATE_COORDS } from './tripTemplates'
import type { LatLngPoint, StayStyle } from '../data/types'

/** A region's stand-in route: real, drivable stops the engine already handles.
 *  `label` is what the UI says out loud; `days` is the run the band is priced
 *  over (overridden by the trip's own day count when that is known). */
export interface RegionBaseline {
  key: string
  label: string
  /** Matched against "City, State" destination strings, case-insensitive. */
  matches: readonly string[]
  start: string
  destinations: readonly string[]
  days: number
}

export const REGION_BASELINES: readonly RegionBaseline[] = [
  { key: 'kerala', label: 'Kerala', matches: ['kerala', 'kochi', 'munnar', 'alleppey', 'alappuzha', 'kozhikode', 'wayanad'], start: 'Kochi, Kerala', destinations: ['Munnar, Kerala', 'Alleppey, Kerala'], days: 6 },
  { key: 'rajasthan', label: 'Rajasthan', matches: ['rajasthan', 'jaipur', 'jodhpur', 'udaipur', 'jaisalmer', 'bikaner'], start: 'Jaipur, Rajasthan', destinations: ['Jodhpur, Rajasthan', 'Udaipur, Rajasthan'], days: 7 },
  { key: 'himachal', label: 'Himachal', matches: ['himachal', 'manali', 'shimla', 'kaza', 'spiti', 'kasol', 'dharamshala'], start: 'Manali, Himachal Pradesh', destinations: ['Kaza, Himachal Pradesh', 'Kasol, Himachal Pradesh'], days: 8 },
  { key: 'coast', label: 'the Konkan coast', matches: ['goa', 'panaji', 'palolem', 'gokarna', 'karnataka', 'mangalore', 'udupi'], start: 'Panaji, Goa', destinations: ['Palolem, Goa', 'Gokarna, Karnataka'], days: 4 },
]

/** Which baseline a trip's destinations belong to, or null when we honestly
 *  have none (the UI then renders nothing rather than a generic filler line). */
export function regionFor(places: readonly string[]): RegionBaseline | null {
  const hay = places.join(' ').toLowerCase()
  if (!hay.trim()) return null
  for (const r of REGION_BASELINES) {
    if (r.matches.some(m => hay.includes(m))) return r
  }
  return null
}

/** Per-head for a region's stand-in route at a given bed tier - the same
 *  engine call the ticket makes, so the anchor and the bill cannot drift. */
function regionHeadAt(r: RegionBaseline, days: number, stayStyle: StayStyle, crew = 4): number {
  const pts: (LatLngPoint | null)[] = [
    TEMPLATE_COORDS[r.start] ?? null,
    ...r.destinations.map(d => TEMPLATE_COORDS[d] ?? null),
  ]
  const start = '2026-02-14'
  const end = isoAdd(start, Math.max(1, days) - 1)
  const bill = estimateTripStarter({
    startDate: start, endDate: end,
    travellers: crew, mode: 'car',
    orderedPoints: pts, returnCount: 0, roundTrip: true,
    stayStyle,
  })
  if (bill.perHead == null) return 0
  return Math.round(bill.perHead / 100) * 100
}

/** The band a typical party actually spends on this region's run: budget beds
 *  at the bottom, comfort beds at the top - the two tiers most travellers
 *  choose between. Both ends computed. */
export function regionBand(r: RegionBaseline, days?: number): { low: number; high: number; days: number; label: string } {
  const d = Math.min(14, Math.max(2, Math.round(days ?? r.days)))
  const low = regionHeadAt(r, d, 'budget')
  const high = Math.max(low, regionHeadAt(r, d, 'comfort'))
  return { low, high, days: d, label: r.label }
}

/** What a per-head number actually buys, tied to the bed tier and mode the
 *  engine really prices - never to amenities the product cannot promise. */
export interface ExperienceTier {
  /** Inclusive lower bound in INR per head. */
  from: number
  label: string
  blurb: string
}

export const EXPERIENCE_TIERS: readonly ExperienceTier[] = [
  { from: 0, label: 'shoestring', blurb: 'dorm beds and budget rooms, buses or shared cabs, local food' },
  { from: 6000, label: 'budget', blurb: 'private budget rooms, a self-drive car, mostly local restaurants' },
  { from: 11000, label: 'comfort', blurb: 'comfort rooms, your own car, a mix of local and proper restaurants' },
  { from: 20000, label: 'premium', blurb: 'good hotels, your own car, meals without watching the menu' },
  { from: 32000, label: 'heritage', blurb: 'heritage and boutique stays, chauffeur-driven if you want it' },
]

/** The tier a per-head figure falls in. Never returns null: a zero budget is
 *  honestly 'shoestring', which is what the engine would price too. */
export function experienceTier(perHeadInr: number): ExperienceTier {
  const v = Number.isFinite(perHeadInr) ? Math.max(0, perHeadInr) : 0
  let tier = EXPERIENCE_TIERS[0]
  for (const t of EXPERIENCE_TIERS) if (v >= t.from) tier = t
  return tier
}

/** Where the user's own number sits against the region's band - the sentence
 *  the anchor line renders. Plain language, no judgement, no upsell. */
export function anchorNote(perHeadInr: number, band: { low: number; high: number }): string {
  if (!Number.isFinite(perHeadInr) || perHeadInr <= 0) return 'no per-head target yet - the bill prices the plan as it stands'
  if (perHeadInr < band.low) return "you're below that band - the bed tier is where it shows"
  if (perHeadInr > band.high) return "you're above that band - the extra buys the bed and the table"
  return "you're inside that band"
}

function inr(v: number): string {
  return '\u20B9' + v.toLocaleString('en-IN')
}

function isoAdd(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
