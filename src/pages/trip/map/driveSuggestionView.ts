// Ticket 03 (#888): a presentation-only view adapter over the existing drive
// suggestions. It changes NO engine fact, NO order and NO identity: every row
// carries the same `PlaceHit` object the engine produced. It exposes no writer,
// no provider call, no ranking and no candidate generation. The map workspace
// (and, after issue 841, the Timeline) renders rows from here; the existing
// preview and acknowledged-write boundary stays with the page that owns it.
//
// #08 AC5: the corridor's own cost facts (the canonical candidate arrival and
// that hit's share of its own day's detour budget) are derived HERE, once, and
// carried on the row. The rail popup, the place card and the Timeline read
// these instead of re-deriving them from raw `pois`.
import type { PlaceHit, SegmentHit } from '../../../lib/geocode'
import type { PlacePhotoRef } from '../../../lib/providers/hits'
import type { DaySlot, SlotCandidate } from '../../../lib/daySlots'
import type { RailChip } from '../../../lib/railReasons'
import { candidateArrivalMin, type ArrivalContext } from '../../../lib/candidateArrival'
import { clockHM } from '../../../lib/clockOverlay'
import { budgetSharePct } from '../../../lib/detourBudget'
import { NEED_PURPOSES } from './pageHelpers'
import { chipsFor, dayBudgetFor, dayBudgetForDay, type ChipFacts } from './railRows'
import { ON_ROUTE_DETOUR_MIN, detourDisplay, detourDisplayText, type DetourDisplay } from './detourRule'

// Re-exported so existing callers keep their import path.
export { detourDisplay, detourDisplayText, type DetourDisplay }

export type DriveSuggestionLane = 'need' | 'sight'
export type DriveSuggestionState = 'live' | 'added' | 'dismissed' | 'held-back'

/** One row the map draws for a drive suggestion. Pure data, no callbacks. */
export interface DriveSuggestionRow {
  /** the engine's own id, stringified — never a new key */
  id: string
  /** the public hit object, unchanged (same reference the engine produced) */
  hit: PlaceHit
  lane: DriveSuggestionLane
  purpose: string
  segmentIndex: number
  dayIndex: number | null
  /** return-driving minutes from the shared fact; null = position unknown */
  detourMin: number | null
  /** ETA plus the outward leg; directed evidence needs matching context. Null = unknown. */
  arriveMin: number | null
  /** engine arrival label when the slot engine computed one; null otherwise */
  arriveLabel: string | null
  /** whole-percent share of that hit's own day's detour budget; null = unknown */
  budgetSharePct: number | null
  /** engine window verdict when the slot engine computed one; null otherwise */
  inWindow: boolean | null
  /** the engine's why-line when it produced one; null otherwise */
  reason: string | null
  /** existing reason chips from the shared presentation path */
  chips: RailChip[]
  state: DriveSuggestionState
  /** The hit's own photo references. Empty when it has none; the card gates them by Google key. */
  photos: PlacePhotoRef[]
}

/** The trip-aware facts the page already holds. Passed in, never fetched here. */
export interface DriveSuggestionFacts extends ChipFacts {
  added: (hit: PlaceHit) => boolean
  dismissed: (hit: PlaceHit) => boolean
  /** ids the detour budget holds back — a page-level verdict, passed in */
  heldBack: ReadonlySet<string>
  /**
   * COMPLETE measured-evidence context for the canonical arrival rule. Absent
   * means measured evidence is unknown (fail closed) and the symmetric estimate
   * applies — the same contract `DaySlotsDeps.measuredContext` states. No
   * production caller supplies one at f62; a real one must flow through here,
   * never be invented.
   */
  measuredContext?: ArrivalContext
}

/** A halt purpose is a need when the trip must serve it; everything else is a sight. */
function laneOf(purpose: string): DriveSuggestionLane {
  return NEED_PURPOSES.has(purpose) ? 'need' : 'sight'
}

/**
 * The corridor hit's cost facts, computed once. The arrival is the slot
 * engine's ONE rule in `candidateArrivalMin`: ETA plus the outward leg, a
 * directed measured leg only inside its complete matching context, and null on
 * missing, invalid or stale evidence. The detour is return-valued and is never
 * added whole to the outbound clock, and a measured total is never halved. An
 * unknown ETA, detour, day or budget stays null; no zero or default is invented.
 */
function corridorCost(sh: SegmentHit, hit: PlaceHit, facts: DriveSuggestionFacts) {
  const detourMin = facts.detourMinFor(hit)
  const eta = sh.segment.etaMinutes
  const arrival = candidateArrivalMin({
    hit,
    etaMinutes: eta,
    detourMin,
    ...(facts.measuredContext ? { context: facts.measuredContext } : {}),
  })
  const arriveMin = arrival != null ? Math.round(arrival) : null
  const dayIndex = facts.dayForKm(hit.cumKm)
  const dayBudget = dayBudgetFor(hit, facts)
  // The budget charges the return drive once, so the spend stays the full
  // return-valued detour even though the arrival uses the outward leg. A
  // non-finite detour is unknown, never a free or infinite spend.
  // A known zero stays zero (0% of the budget). A fraction up to the on-route
  // threshold is not a spend, so it has no share. A missing, non-finite or
  // negative detour is unknown.
  const share = detourMin != null && Number.isFinite(detourMin) && (detourMin === 0 || detourMin > ON_ROUTE_DETOUR_MIN) && dayBudget != null && dayBudget > 0
    ? budgetSharePct(detourMin, dayBudget)
    : null
  return {
    dayIndex,
    dayBudget,
    detourMin,
    arriveMin,
    arriveLabel: arriveMin == null ? null : clockHM(arriveMin),
    budgetSharePct: share,
  }
}

function stateOf(hit: PlaceHit, facts: DriveSuggestionFacts): DriveSuggestionState {
  if (facts.added(hit)) return 'added'
  if (facts.dismissed(hit)) return 'dismissed'
  if (facts.heldBack.has(String(hit.id))) return 'held-back'
  return 'live'
}

/** The purpose a slot stands for when its engine segment is absent. */
function slotPurpose(slot: DaySlot): string {
  if (slot.segment) return slot.segment.purpose
  switch (slot.kind) {
    case 'fuel': return 'fuel'
    case 'stretch': return 'stretch'
    case 'overnight': return 'overnight'
    default: return 'meal'
  }
}

/**
 * One corridor pick (segment hit) as a row. Null when the segment is an
 * honest gap — a gap is not a pick.
 */
export function driveRowFromSegment(sh: SegmentHit, facts: DriveSuggestionFacts): DriveSuggestionRow | null {
  const hit = sh.hit
  if (!hit) return null
  const purpose = sh.segment.purpose
  const cost = corridorCost(sh, hit, facts)
  return {
    id: String(hit.id),
    hit,
    lane: laneOf(purpose),
    purpose,
    segmentIndex: sh.segment.index,
    dayIndex: cost.dayIndex,
    detourMin: cost.detourMin,
    arriveMin: cost.arriveMin,
    arriveLabel: cost.arriveLabel,
    budgetSharePct: cost.budgetSharePct,
    inWindow: null,
    reason: null,
    // The chips read the same computed cost as the row, never a second budget.
    // An unknown detour keeps the "whole known budget" policy, so the share
    // override is supplied only when the producer actually computed one.
    chips: chipsFor(sh, hit, facts, {
      detourMin: cost.detourMin,
      dayBudget: cost.dayBudget,
      ...(cost.budgetSharePct != null ? { budgetSharePct: cost.budgetSharePct } : {}),
    }),
    state: stateOf(hit, facts),
    photos: hit.photos ?? [],
  }
}

/** Map the corridor picks in the order the engine produced them. Gaps are skipped. */
export function driveRowsFromSegments(pois: SegmentHit[], facts: DriveSuggestionFacts): DriveSuggestionRow[] {
  const out: DriveSuggestionRow[] = []
  for (const sh of pois) {
    const row = driveRowFromSegment(sh, facts)
    if (row) out.push(row)
  }
  return out
}

/**
 * One slot candidate as a row. Every row number (detour, arrival, window
 * verdict, reason) comes from the slot engine unchanged — this function
 * computes none. The day budget is the row's own day, used only for its chips.
 */
export function driveRowFromCandidate(
  candidate: SlotCandidate,
  slot: DaySlot,
  dayIndex: number | null,
  facts: DriveSuggestionFacts,
): DriveSuggestionRow {
  const hit = candidate.hit
  const purpose = slotPurpose(slot)
  const dayBudget = dayBudgetForDay(dayIndex, facts)
  return {
    id: String(hit.id),
    hit,
    lane: laneOf(purpose),
    purpose,
    segmentIndex: slot.segment?.index ?? 0,
    dayIndex,
    detourMin: candidate.detourMin,
    arriveMin: candidate.arriveMin,
    arriveLabel: candidate.arriveLabel,
    budgetSharePct: candidate.budgetSharePct,
    inWindow: candidate.inWindow,
    reason: candidate.reason,
    // The candidate's own engine share wins over a local recalc. An unknown
    // detour keeps the "whole known budget" policy instead.
    chips: slot.segment
      ? chipsFor({ segment: slot.segment, hit, score: candidate.score }, hit, facts, {
          detourMin: candidate.detourMin,
          dayBudget,
          ...(candidate.detourMin != null ? { budgetSharePct: candidate.budgetSharePct } : {}),
        })
      : [],
    state: stateOf(hit, facts),
    photos: hit.photos ?? [],
  }
}

/**
 * Merge the two rails without reordering either: corridor rows keep their
 * order, then slot rows fill in; a hit that appears in both keeps the slot row
 * (it carries the arrival and window facts). Inputs are not modified.
 */
export function mergeDriveRows(
  segmentRows: DriveSuggestionRow[],
  slotRows: DriveSuggestionRow[],
): DriveSuggestionRow[] {
  const out = [...segmentRows]
  const at = new Map(out.map((row, i) => [row.id, i]))
  for (const row of slotRows) {
    const i = at.get(row.id)
    if (i == null) {
      at.set(row.id, out.length)
      out.push(row)
    } else {
      out[i] = row
    }
  }
  return out
}
