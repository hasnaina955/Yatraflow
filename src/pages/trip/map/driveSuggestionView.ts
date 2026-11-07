// Ticket 03 (#888): a presentation-only view adapter over the existing drive
// suggestions. It changes NO fact, NO order and NO identity: every row carries
// the same `PlaceHit` object the engine produced. It exposes no writer, no
// provider call, no ranking and no candidate generation. The map workspace (and,
// after issue 841, the Timeline) renders rows from here; the existing preview
// and acknowledged-write boundary stays with the page that owns it.
import type { PlaceHit, SegmentHit } from '../../../lib/geocode'
import type { DaySlot, SlotCandidate } from '../../../lib/daySlots'
import type { RailChip } from '../../../lib/railReasons'
import { NEED_PURPOSES } from './pageHelpers'
import { chipsFor, type ChipFacts } from './railRows'

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
  /** engine arrival label when the slot engine computed one; null otherwise */
  arriveLabel: string | null
  /** engine window verdict when the slot engine computed one; null otherwise */
  inWindow: boolean | null
  /** the engine's why-line when it produced one; null otherwise */
  reason: string | null
  /** existing reason chips from the shared presentation path */
  chips: RailChip[]
  state: DriveSuggestionState
}

/** The trip-aware facts the page already holds. Passed in, never fetched here. */
export interface DriveSuggestionFacts extends ChipFacts {
  added: (hit: PlaceHit) => boolean
  dismissed: (hit: PlaceHit) => boolean
  /** ids the detour budget holds back — a page-level verdict, passed in */
  heldBack: ReadonlySet<string>
}

/** A halt purpose is a need when the trip must serve it; everything else is a sight. */
function laneOf(purpose: string): DriveSuggestionLane {
  return NEED_PURPOSES.has(purpose) ? 'need' : 'sight'
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
  return {
    id: String(hit.id),
    hit,
    lane: laneOf(purpose),
    purpose,
    segmentIndex: sh.segment.index,
    dayIndex: facts.dayForKm(hit.cumKm),
    detourMin: facts.detourMinFor(hit),
    arriveLabel: null,
    inWindow: null,
    reason: null,
    chips: chipsFor(sh, hit, facts),
    state: stateOf(hit, facts),
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
 * One slot candidate as a row. Every number (detour, arrival, window verdict,
 * reason) comes from the slot engine unchanged — this function computes none.
 */
export function driveRowFromCandidate(
  candidate: SlotCandidate,
  slot: DaySlot,
  dayIndex: number | null,
  facts: DriveSuggestionFacts,
): DriveSuggestionRow {
  const hit = candidate.hit
  const purpose = slotPurpose(slot)
  return {
    id: String(hit.id),
    hit,
    lane: laneOf(purpose),
    purpose,
    segmentIndex: slot.segment?.index ?? 0,
    dayIndex,
    detourMin: candidate.detourMin,
    arriveLabel: candidate.arriveLabel,
    inWindow: candidate.inWindow,
    reason: candidate.reason,
    chips: slot.segment ? chipsFor({ segment: slot.segment, hit, score: candidate.score }, hit, facts) : [],
    state: stateOf(hit, facts),
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
