// ============ Captured manual picks and the pure day plan (#08 S2) ============
// The manual slot store is a module-global singleton. A builder that claims to
// be pure must not read it, so the old `planForDay` is split in two:
//  - `readManualPicksForDay` is the ONLY store read and returns plain data;
//  - `buildDayPlanForDay` is pure and merges stable picks, then legacy picks.
//
// The writer and the future shared producer both call this same pair, so there
// is exactly one manual merge and no second placement policy.
import { buildDayPlan, type DayPlan } from '../../../lib/dayPlan'
import { budgetSharePct } from '../../../lib/detourBudget'
import type { DaySlot, SlotCandidate } from '../../../lib/daySlots'
import type { PlaceHit } from '../../../lib/providers/hits'
import type { PlaceIdentity } from '../../../lib/placeIdentity'
import type { ManualSlotStore } from './manualSlotContexts'
import { manualCandidateFor } from './slotFiling'

/** Captured plain data: no store, no hook, no module-global read. */
export interface ManualPicksForDay {
  stable: Readonly<Record<string, readonly SlotCandidate[]>>
  legacy: Readonly<Record<string, readonly SlotCandidate[]>>
}

export interface ReadManualPicksInput {
  store: ManualSlotStore
  tripId: string
  /** The persisted day id. Null keeps every store read closed. */
  dayId: string | null
  /** The page's bare slot bucket. It carries no day of its own. */
  slotManual: Readonly<Record<string, readonly PlaceHit[]>>
  detourMinFor?: (hit: PlaceHit) => number | null
  detourKmFor?: (hit: PlaceHit) => number | null
  /** The day's own detour budget. Absent = unknown, so a manual pick's share
   *  keeps the whole-budget placeholder. */
  budgetMin?: number
}

/**
 * The only function that reads the manual store. Stable picks are read for the
 * exact trip/day; the legacy page bucket is admitted only while the last store
 * filing for that key came from this same day. Returns plain candidates.
 */
export function readManualPicksForDay(input: ReadManualPicksInput): ManualPicksForDay {
  const stable = new Map<string, SlotCandidate[]>()
  const legacy = new Map<string, SlotCandidate[]>()
  const dayId = input.dayId
  if (dayId) {
    const fromStore = input.store.candidatesBySlot(
      { tripId: input.tripId, dayId },
      { detourMin: input.detourMinFor, detourKm: input.detourKmFor, budgetMin: input.budgetMin ?? 0 },
    )
    for (const [key, candidates] of Object.entries(fromStore)) stable.set(key, [...candidates])
  }
  for (const [key, hits] of Object.entries(input.slotManual)) {
    const bound = dayId
      ? input.store.legacyPicksFor(key, { tripId: input.tripId, dayId })
      : []
    if (bound.length === 0) continue
    legacy.set(key, hits.map(hit => manualCandidateFor({
      hit,
      detourMin: input.detourMinFor?.(hit) ?? null,
      detourKm: input.detourKmFor?.(hit) ?? null,
      budgetMin: input.budgetMin ?? 0,
      sharePct: budgetSharePct,
    })))
  }
  return { stable: Object.fromEntries(stable), legacy: Object.fromEntries(legacy) }
}

export interface BuildDayPlanForDayInput {
  tripId: string | null
  dayIndex: number
  dayId: string | null
  slots: readonly DaySlot[]
  manual: ManualPicksForDay
  identity: PlaceIdentity | null
}

/**
 * Pure. Merges stable picks first and legacy picks after them, per slot, then
 * calls `buildDayPlan`. It never imports or reads the module-global store.
 */
export function buildDayPlanForDay(input: BuildDayPlanForDayInput): DayPlan {
  const merged = new Map<string, SlotCandidate[]>()
  for (const [key, candidates] of Object.entries(input.manual.stable)) {
    merged.set(key, [...candidates])
  }
  for (const [key, rows] of Object.entries(input.manual.legacy)) {
    merged.set(key, [...(merged.get(key) ?? []), ...rows])
  }
  return buildDayPlan({
    dayIndex: input.dayIndex,
    slots: input.slots,
    tripId: input.tripId,
    ...(input.dayId ? { dayId: input.dayId } : {}),
    manual: Object.fromEntries(merged),
    ...(input.identity ? { identity: input.identity } : {}),
  })
}
