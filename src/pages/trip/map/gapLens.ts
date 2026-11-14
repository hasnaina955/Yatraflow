// Gap lens: the empty parts of a day, their lettered picks and the honest no-fit reason.
// This module is pure data. It has no UI, no store, no provider call and no ranker.
import type { DaySlot, SlotKey } from '../../../lib/daySlots'
import type { GapLensRow, GapNoFitReason, LensPhase, LensView } from '../../../lib/mapLensContracts'
import type { JourneyRow } from '../../../lib/journeyProjection'
import { fitCopy, lensFit, type LensFit } from './lensFit'

/** One lettered pick. The set never grows past C. */
export type GapPickLetter = 'A' | 'B' | 'C'

/** The letters, A first. A part shows at most this many picks. */
const GAP_PICK_LETTERS: readonly GapPickLetter[] = ['A', 'B', 'C']

/** One recommendation for an empty part. */
export interface GapPick {
  letter: GapPickLetter
  /** The candidate row, unchanged and in input order. */
  candidate: JourneyRow
  /** One-way travel in minutes. Null when the detour is unknown. */
  travelOneWayMin: number | null
  /** The shared fit result. Null when a fact is unknown or the window is absent. */
  fit: LensFit | null
  /** The shared fit line. Null when the visit does not fit or a fact is unknown. */
  fitText: string | null
}

/** The lettered set for one empty part. */
export interface GapPicks {
  slotKey: SlotKey
  /** The part window in minutes since midnight. Null when the part has none. */
  window: DaySlot['windowMin']
  /** Why nothing fits. Null when at least one candidate is inside its window. */
  noFit: GapNoFitReason | null
  /** One plain sentence for the reason. Null when there is no reason. */
  noFitText: string | null
  picks: GapPick[]
  /** Candidates past the lettered set. */
  moreCount: number
}

/** The phone peek content. A wait or a failure is never an empty gap. */
export type GapPeek =
  | { kind: 'phase'; phase: LensPhase }
  | { kind: 'none' }
  | {
    kind: 'gap'
    /** The slot label as it is. The UI upper-cases it. */
    title: string
    /** "HH:MM–HH:MM" through the caller clock. Null when the part has no window. */
    windowText: string | null
    /** "3 picks", "1 pick", or the no-fit sentence when the set is empty. */
    countText: string | null
    best: GapPick | null
  }

/** One plain sentence per no-fit reason. No sentence names a place. */
export const GAP_NO_FIT_TEXT: Record<GapNoFitReason, string> = {
  'no-candidates': 'Places · None open in this window',
  'outside-window': 'Places · None reachable in this window',
  'window-unproven': 'Time window · Not measured',
}

/**
 * The empty parts of the day, in input order.
 * SlotState marks an open part as `empty`. A filled part is not open.
 * An auto part is engine-managed and quiet, so it is not open either.
 * A part with no window has no proven time to fill.
 */
export function gapOpenSlots(slots: readonly DaySlot[]): DaySlot[] {
  return slots.filter(slot =>
    slot.state === 'empty'
    && slot.filledStop === null
    && slot.auto === false
    && slot.windowMin !== null)
}

/** The letter for a pick. The cap keeps the index inside the three letters. */
function letterAt(index: number): GapPickLetter {
  if (index === 1) return 'B'
  if (index === 2) return 'C'
  return 'A'
}

/**
 * The lettered picks for one empty part, in candidate order. The function never sorts.
 * `detourMin` is the extra driving there and back, so one-way travel is half of it.
 * The fit comes from the shared rule in `lensFit`. This module writes no fit math.
 */
export function gapPicks(row: GapLensRow, clock: (min: number) => string, cap = 3): GapPicks {
  const asked = Number.isFinite(cap) ? Math.trunc(cap) : GAP_PICK_LETTERS.length
  // Three lettered picks is the most a part shows. The rest stay behind moreCount.
  const limit = Math.max(0, Math.min(asked, GAP_PICK_LETTERS.length))
  const window = row.windowMin
  const picks = row.candidates.slice(0, limit).map<GapPick>((candidate, index) => {
    const travelOneWayMin = candidate.detourMin === null ? null : candidate.detourMin / 2
    const fit = window === null
      ? null
      : lensFit({ startMin: window[0], endMin: window[1] }, null, travelOneWayMin, candidate.visitMin)
    const fitText = fit !== null && window !== null && travelOneWayMin !== null && candidate.visitMin !== null
      ? fitCopy({ startMin: window[0], endMin: window[1] }, fit, travelOneWayMin, candidate.visitMin, clock)
      : null
    return { letter: letterAt(index), candidate, travelOneWayMin, fit, fitText }
  })
  return {
    slotKey: row.slotKey,
    window,
    noFit: row.noFit,
    noFitText: row.noFit === null ? null : GAP_NO_FIT_TEXT[row.noFit],
    picks,
    moreCount: Math.max(0, row.candidates.length - picks.length),
  }
}

/**
 * The phone peek for the first gap row, in input order.
 * A wait, a failure or a quota read stays its own phase. None of them is `none`.
 * `empty` is a proven read with no gap, so that shape is `none`.
 */
export function gapPeek(
  rows: LensView<GapLensRow>,
  clock: (min: number) => string,
  labelOf: (slotKey: SlotKey) => string,
): GapPeek {
  if (rows.phase === 'ready' || rows.phase === 'empty') {
    const row = rows.rows[0]
    if (row === undefined) return { kind: 'none' }
    const picks = gapPicks(row, clock)
    const count = picks.picks.length
    const window = row.windowMin
    return {
      kind: 'gap',
      title: labelOf(row.slotKey),
      windowText: window === null ? null : `${clock(window[0])}–${clock(window[1])}`,
      countText: count === 0 ? picks.noFitText : `${count} pick${count === 1 ? '' : 's'}`,
      best: picks.picks[0] ?? null,
    }
  }
  return { kind: 'phase', phase: rows.phase }
}

/**
 * The lens pill count: the gap rows of a ready view, else null.
 * A failed or paused read shows nothing. It never shows zero.
 */
export function gapCount(view: LensView<GapLensRow>): number | null {
  return view.phase === 'ready' ? view.rows.length : null
}
