// #420 slice 15: the rail rows' pure helpers — the trip-aware numbers behind
// each suggestion row, with no component state in reach.
//
// `alternativesFor` names the halt and hands over the pool; `chipsFor`
// resolves the row's detour and day budget through the facts the page hands
// in; the two labels read the day's readiness and identity. All four are pure:
// the page calls them during render like every other `map/` helper, so no
// hook boundary is involved. The JSX rows stay with the page for the rails
// slice.
import type { Trip, ItineraryDay } from '../../../data/types'
import type { PlaceHit, SegmentHit } from '../../../lib/geocode'
import type { RailChip } from '../../../lib/railReasons'
import { dayDetourBudgetMin } from '../../../lib/detourBudget'
import {
  alternativesFor as pickAlternatives, sightRowChips, type AltPool,
} from './sightRows'

/** Closest alternatives for a halt: next 2 by road position plus detour. */
export function alternativesFor(sh: SegmentHit, hit: PlaceHit, pool: AltPool): Array<{ h: PlaceHit; dKm: number | null }> {
  // #420 slice 5: the family/ranking rule lives in ./sightRows with its tests;
  // this only names the halt and hands over the pool.
  return pickAlternatives({
    purpose: sh.segment.purpose,
    targetKm: sh.segment.targetKm,
    hit,
    pool,
  })
}

/** The trip-aware facts `chipsFor` resolves per row, handed in by the page. */
export type ChipFacts = {
  detourMinFor: (hit: PlaceHit) => number | null
  days: ItineraryDay[]
  dayForKm: (km: number | null | undefined) => number | null
  travelStyle: Trip['travelStyle']
}

/**
 * The detour budget of a real day, or null when no real day owns that index.
 * An unknown day has no budget: it never borrows the base style budget (#08).
 */
export function dayBudgetForDay(dayIndex: number | null, facts: ChipFacts): number | null {
  if (dayIndex == null) return null
  const day = facts.days.find(item => item.index === dayIndex)
  if (!day) return null
  let planned = 0
  for (const stop of day.stops) if (stop.status !== 'rejected') planned += 1
  return dayDetourBudgetMin({ travelStyle: facts.travelStyle, plannedStops: planned })
}

/** The budget of the day a hit's road position belongs to. */
export function dayBudgetFor(hit: Pick<PlaceHit, 'cumKm'>, facts: ChipFacts): number | null {
  return dayBudgetForDay(facts.dayForKm(hit.cumKm), facts)
}

/** The cost facts a row producer already computed for one row. */
export type ChipCostFacts = {
  /** the row's measured detour; null = position unknown */
  detourMin: number | null
  /** the row's own day budget; null = unknown day/budget, never a base 45 */
  dayBudget: number | null
  /** the row's canonical share; undefined = let the chip recalc it */
  budgetSharePct?: number | null
}

/** Reason chips for one suggestion, shared by the card and the rail filter. */
export function chipsFor(sh: SegmentHit, hit: PlaceHit, facts: ChipFacts, cost?: ChipCostFacts): RailChip[] {
  // #420 slice 5: the chips themselves (including the #163 rounding predicate) come
  // from ./sightRows. A producer that already computed the row's cost hands it in,
  // so the chip consumes the same fact as the row/card/marker and never recalculates
  // it against a different budget. With no cost passed, resolve the same facts here;
  // a hit with no real day has no budget, never the base 45.
  return sightRowChips({
    segment: sh.segment,
    hit,
    detourMin: cost ? cost.detourMin : facts.detourMinFor(hit),
    dayBudget: cost ? cost.dayBudget : dayBudgetFor(hit, facts),
    ...(cost && cost.budgetSharePct !== undefined ? { budgetSharePct: cost.budgetSharePct } : {}),
  })
}

/** The rail's meter copy: the mockup's wording, honest per day. The count is
 *  over `required` (engine-managed parts excluded) — the work the crew owns. */
export function activeReadinessLabel(r: { total: number; filled: number; required: number; auto: number }): string {
  if (r.total === 0) return 'nothing scheduled for this day yet'
  return `${r.filled} of ${r.required} planned${r.auto > 0 ? ` · ${r.auto} auto` : ''}`
}

/** The header's day identity: the day's own title, else its first-to-last
 *  stops - the mockup reads 'Day 2 - Kochi to Alleppey' where it can. */
export function activeDayLabel(days: ItineraryDay[], activeDayIndex: number): string {
  const d = days.find(x => x.index === activeDayIndex)
  if (!d) return 'your drive'
  if (d.title && d.title.trim()) return d.title.trim()
  const stops = d.stops.filter(s => s.status !== 'rejected')
  const first = stops[0]?.locationName ?? stops[0]?.title
  const last = stops[stops.length - 1]?.locationName ?? stops[stops.length - 1]?.title
  if (first && last && first !== last) return `${first} to ${last}`
  return first ?? 'your drive'
}
