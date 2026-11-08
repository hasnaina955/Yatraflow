/**
 * #420, slice 5 — the sights rail's data atoms.
 *
 * Two things `renderLedgerRow` asks for before it renders anything: which alternatives
 * a row may offer, and which reason chips describe it. Both were closures inside the
 * page, so neither could be tested without rendering 2,700 lines, and the chip path
 * carries a contract the code comments call out by issue number (#163: one rounding
 * predicate shared with the fact strip, or a budget-exact halt reads as "fine" on the
 * card and "held back" on the rail).
 *
 * Neither function knows about the trip, the store or React. The caller supplies the
 * pool and the numbers; that is what makes the rounding contract testable.
 */
import type { PlaceHit } from '../../../lib/geocode'
import { railReasonChips, type RailChip } from '../../../lib/railReasons'
import { budgetSharePct as sharePctOf } from '../../../lib/detourBudget'
import { NEED_PURPOSES } from './pageHelpers'

/** One alternative in the pool the rail draws from. */
export type AltEntry = { h: PlaceHit; dKm: number | null }

export type AltPool = {
  all: AltEntry[]
  byPurpose: Map<string, AltEntry[]>
  byCategory: Map<string, AltEntry[]>
}

export type AlternativesInput = {
  /** the halt's own purpose — needs prefer the same purpose, sights take any sight */
  purpose: string
  /** the halt's target road position, used to rank by how near an alternative sits */
  targetKm: number
  hit: Pick<PlaceHit, 'id' | 'cumKm' | 'category'>
  pool: AltPool
}

/** Up to two alternatives for a row, nearest to the halt's own position first. */
export function alternativesFor({ purpose, targetKm, hit, pool }: AlternativesInput): Array<{ h: PlaceHit; dKm: number | null }> {
  // keep same family: need halts prefer same purpose, sights accept any sight
  const family = NEED_PURPOSES.has(purpose)
    ? [...(pool.byPurpose.get(purpose) ?? []), ...(pool.byCategory.get(hit.category ?? '') ?? [])]
    : pool.all
  const seen = new Set<string>()
  return family
    .filter(e => {
      const id = e.h.id as string
      if (id === hit.id || seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map(e => {
      const pos = e.h.cumKm ?? targetKm
      return { h: e.h, dKm: e.dKm, dist: Math.abs(pos - targetKm) + (e.dKm ?? 0) * 2 }
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 2)
    .map(e => ({ h: e.h, dKm: e.dKm ?? null }))
}

export type SightChipInput = {
  segment: {
    purpose: string
    etaMinutes?: number | null
    minutesFromPrev: number
    index: number
  }
  hit: Pick<PlaceHit, 'rating' | 'ratingCount'>
  /** the row's measured detour; null = position unknown */
  detourMin: number | null
  /** that day's detour budget; null = unknown day/budget, never a base 45 */
  dayBudget: number | null
  /**
   * The row's already-computed budget share. `undefined` = not supplied, so the
   * unchanged recalc applies; a number or null = the producer's canonical fact
   * and it wins. Null means the producer knows the share is unknown.
   */
  budgetSharePct?: number | null
}

/** The reason chips for one suggestion, shared by the card and the rail filter. */
export function sightRowChips({ segment, hit, detourMin, dayBudget, budgetSharePct: canonicalShare }: SightChipInput): RailChip[] {
  // A budget exists only for a real day with a positive budget. An unknown day
  // must not borrow a base budget, invent a share or claim a budget verdict.
  const budget = dayBudget != null && Number.isFinite(dayBudget) && dayBudget > 0 ? dayBudget : null
  const share = canonicalShare !== undefined
    ? canonicalShare
    : detourMin == null
      ? (budget == null ? null : 100)
      : budget == null || detourMin <= 0.5
        ? null
        : sharePctOf(detourMin, budget)
  const overBudget = detourMin == null
    ? budget != null
    : budget != null && Math.round(detourMin) > budget
  return railReasonChips({
    purpose: segment.purpose,
    etaMinutes: segment.etaMinutes ?? null,
    minutesFromPrev: segment.minutesFromPrev,
    isFirstSegment: segment.index === 0,
    detourMinutes: detourMin ?? 0,
    budgetSharePct: share,
    // #163: same predicate as the fact strip (round-half-up display math),
    // so a budget-exact halt can't be 'fine' on the card and 'held back' on
    // the rail — or flip between them on a display-rounding nudge.
    overBudget,
    rating: hit.rating,
    ratingCount: hit.ratingCount,
  })
}
