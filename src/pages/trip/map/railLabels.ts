/**
 * #420, slice 4 — the rail's detour labels, in one place and under test.
 *
 * Two surfaces in the Map tab printed the SAME sentence about a place: the corridor
 * rows ("arrive 11:24 · +26 min · 58% of the day's detour budget") and the slot pins
 * on the map, which assemble the identical three bits from a slot's top candidate.
 * The wording was duplicated, so a change to one could quietly leave the other
 * behind.
 *
 * `detourBits` is that sentence once. `journeyCostLabels` and `slotPinsFor` are the
 * two callers, lifted out of the page so their behaviour is pinned by direct tests
 * instead of by rendering 2,700 lines.
 *
 * #08 AC5: `journeyCostLabels` formats facts already carried by canonical rows.
 * It computes no detour, arrival or budget share of its own, so the marker cannot
 * disagree with the row it is formatting.
 */
import { clockHM } from '../../../lib/clockOverlay'
import type { DaySlot } from '../../../lib/daySlots'
import { ON_ROUTE_DETOUR_MIN, detourDisplay } from './detourRule'

// Re-exported so existing callers keep their import path.
export { ON_ROUTE_DETOUR_MIN }

export type DetourLabelBits = {
  /** "HH:MM" when the arrival is known — the caller decides that, not this module */
  arriveLabel?: string | null
  /** door-to-door detour minutes; null = the position/detour is unknown */
  detourMin: number | null
  /** whole-percent share of that day's detour budget, when it is worth saying */
  budgetSharePct?: number | null
}

/** The three bits, in the order every surface prints them. A zero share is not a
 *  sentence worth printing, and neither is an arrival nobody measured. The detour
 *  words come from `detourDisplay`, so rows, pins and cards agree. An on-route
 *  detour hides its budget share, so a model 0 and a 0.2 read the same. */
export function detourBits({ arriveLabel, detourMin, budgetSharePct }: DetourLabelBits): string[] {
  const display = detourDisplay(detourMin)
  return [
    arriveLabel ? `Arrive ${arriveLabel}` : null,
    display.kind === 'unknown' ? 'Position · Unknown' : display.kind === 'on-route' ? 'On route' : `+${display.minutes} min`,
    display.kind === 'extra' && budgetSharePct != null && budgetSharePct > 0 ? `${budgetSharePct}% of the day's detour budget` : null,
  ].filter((bit): bit is string => bit != null)
}

/** The row facts this module may format. A canonical `JourneyRow` satisfies it. */
export type JourneyCostRow = {
  readonly hit: { readonly id: string | number }
  readonly arriveMin: number | null
  readonly arriveLabel: string | null
  readonly detourMin: number | null
  readonly budgetSharePct: number | null
}

/**
 * The cost sentence under a canonical row, keyed by hit id. Every number comes
 * from the row; the only thing added here is the clock label for an arrival the
 * row already measured. A hit no row covers simply has no entry (the caller only
 * hands in rows), so nothing is invented for an unmeasured place.
 */
export function journeyCostLabels(rows: readonly JourneyCostRow[]): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const row of rows) {
    const arriveLabel = row.arriveMin != null ? clockHM(row.arriveMin) : row.arriveLabel
    labels[String(row.hit.id)] = detourBits({
      arriveLabel,
      detourMin: row.detourMin,
      budgetSharePct: row.budgetSharePct,
    }).join(' · ')
  }
  return labels
}

/** The map's empty-part pins: the day's empty slots that have a candidate to stand
 *  on, each carrying the same sentence as a corridor row. */
export function slotPinsFor(slots: readonly DaySlot[]) {
  return slots
    .filter(s => s.state === 'empty' && s.candidates.length > 0)
    .map(s => {
      const c = s.candidates[0]
      return {
        key: s.key,
        label: s.label,
        name: c.hit.name,
        meta: detourBits({ arriveLabel: c.arriveLabel, detourMin: c.detourMin, budgetSharePct: c.budgetSharePct }).join(' · '),
        hit: c.hit,
      }
    })
}
