// ============ Map lens contracts (package F) ============
// Typed inputs and outputs for the Drive, Stay, Gap and Fix lenses. Each lens
// reads the shared journey model and returns rows. This file holds types and
// pure helpers only. It has no UI, no store, no provider call and no ranker.
//
// Rules every lens keeps:
//  - Row order is the model's order. No lens sorts or scores rows.
//  - Unscanned, scanning, failed, quota and empty are different phases.
//  - A missing number is null. It is never zero and never a default.
//  - A Fix change set names stops by id. It never carries a place.
import type { JourneyFreshness, JourneyRow } from './journeyProjection'
import type { DaySlot, SlotKey, SlotRef } from './daySlots'
import type { JourneyStatus } from '../pages/trip/journey/journeyDays'

// ------------------------------------------------------------------ shared

/** The phase a lens panel shows. The five failure and wait states stay apart. */
export type LensPhase = 'unscanned' | 'scanning' | 'failed' | 'quota' | 'empty' | 'ready'

/** One lens result: a phase, the rows, and any notice about those rows. */
export interface LensView<Row> {
  phase: LensPhase
  /** Rows in the shared model's order. Empty unless the phase is ready. */
  rows: readonly Row[]
  /** Set when rows show after a failed or paused search. They are kept rows. */
  degraded: 'failed' | 'quota' | null
}

/**
 * Turn the model status and the lens rows into one phase.
 * A failed or paused search with kept rows is `ready` plus `degraded`.
 * A failed or paused search with no rows keeps its own phase, never `empty`.
 */
export function lensViewOf<Row>(status: JourneyStatus, rows: readonly Row[]): LensView<Row> {
  switch (status.kind) {
    case 'unscanned':
      return { phase: 'unscanned', rows: [], degraded: null }
    case 'scanning':
      return { phase: 'scanning', rows: [], degraded: null }
    case 'failed':
    case 'quota':
      return rows.length > 0
        ? { phase: 'ready', rows, degraded: status.kind }
        : { phase: status.kind, rows: [], degraded: null }
    case 'ready':
      return rows.length > 0
        ? { phase: 'ready', rows, degraded: null }
        : { phase: 'empty', rows: [], degraded: null }
  }
}

/** What each lens reads from the shared model for one day, or the whole trip. */
export interface LensModelInput {
  /** The model status. It comes from the scan, never from the rows. */
  status: JourneyStatus
  /** The day this lens shows. Null means the whole trip. */
  dayIndex: number | null
  /** Projected rows for that scope, in the model's order. */
  rows: readonly JourneyRow[]
}

/** True for a suggestion row: it names no saved stop. */
function isSuggestion(row: JourneyRow): boolean {
  return row.stopId == null
}

// ------------------------------------------------------------------- Drive

/** Input of the Drive lens: corridor suggestions along the driven route. */
export interface DriveLensInput extends LensModelInput {
  /** Detour budget of the day in minutes. Zero or less means no known budget. */
  budgetMin: number
}

/** One Drive row. It copies the model row. It adds no ranking and no new fact. */
export interface DriveLensRow {
  /** The model row, unchanged. Its key and hit identity stay the same. */
  row: JourneyRow
  /** Extra driving in minutes. Null is unknown. Zero is a known zero. */
  detourMin: number | null
  /** Whole-percent share of the day budget. Null is unknown. */
  budgetSharePct: number | null
  /** Net minutes added to the day if the user adds it. Null is unproven. */
  netAddedMin: number | null
  /** Evidence state of the scan behind this row. */
  freshness: JourneyFreshness
}

/** Drive rows are the suggestion rows of the model, in model order. */
export function driveLensRows(input: DriveLensInput): LensView<DriveLensRow> {
  const rows = input.rows.filter(isSuggestion).map<DriveLensRow>(row => ({
    row,
    detourMin: row.detourMin,
    budgetSharePct: row.budgetSharePct,
    netAddedMin: row.netAddedMin,
    freshness: row.freshness,
  }))
  return lensViewOf(input.status, rows)
}

// -------------------------------------------------------------------- Stay

/** The place the day ends or starts at. It must be a real saved stop. */
export type StayBase =
  | { kind: 'stop'; stopId: string; dayIndex: number }
  | { kind: 'missing' }

/** Input of the Stay lens: lodging suggestions near the day base. */
export interface StayLensInput extends LensModelInput {
  /** The base the lodging is measured from. Missing means the lens cannot run. */
  base: StayBase
}

/** One Stay row. It copies the model row. */
export interface StayLensRow {
  /** The model row, unchanged. */
  row: JourneyRow
  /** Extra driving from the route in minutes. Null is unknown. */
  detourMin: number | null
  /** Evidence state of the scan behind this row. */
  freshness: JourneyFreshness
}

/** The Stay result. A missing base is its own answer, not an empty list. */
export type StayLensOutput =
  | { kind: 'needs-base' }
  | { kind: 'view'; base: Extract<StayBase, { kind: 'stop' }>; view: LensView<StayLensRow> }

/** Stay rows are suggestion rows that fill the stay slot, in model order. */
export function stayLensRows(input: StayLensInput): StayLensOutput {
  if (input.base.kind !== 'stop') return { kind: 'needs-base' }
  const rows = input.rows
    .filter(row => isSuggestion(row) && row.slotKey === 'stay')
    .map<StayLensRow>(row => ({ row, detourMin: row.detourMin, freshness: row.freshness }))
  return { kind: 'view', base: input.base, view: lensViewOf(input.status, rows) }
}

// --------------------------------------------------------------------- Gap

/** Why a slot has no usable suggestion. It names a fact, not a guess. */
export type GapNoFitReason =
  /** No suggestion row exists for this slot. */
  | 'no-candidates'
  /** Rows exist, and every one is outside the slot window. */
  | 'outside-window'
  /** Rows exist, but none has a proven window verdict. */
  | 'window-unproven'

/** Input of the Gap lens: day slots that are still open. */
export interface GapLensInput extends LensModelInput {
  /** The day's slots from the shared model. */
  slots: readonly DaySlot[]
}

/** One open slot and the reason no row fits it. */
export interface GapLensRow {
  slotKey: SlotKey
  /** Stable slot reference. Null when the day has no persisted id yet. */
  slotRef: SlotRef | null
  /** Slot window in minutes since midnight. Null when the slot has none. */
  windowMin: DaySlot['windowMin']
  /** Suggestion rows for this slot, in model order. */
  candidates: readonly JourneyRow[]
  /** Why nothing fits. Null when at least one candidate is inside its window. */
  noFit: GapNoFitReason | null
}

/** The reason for one slot, from its candidate rows only. */
export function gapNoFitReason(candidates: readonly JourneyRow[]): GapNoFitReason | null {
  if (candidates.length === 0) return 'no-candidates'
  if (candidates.some(row => row.inWindow === true)) return null
  return candidates.every(row => row.inWindow === false) ? 'outside-window' : 'window-unproven'
}

/** Gap rows are the empty slots of the day, in slot order. */
export function gapLensRows(input: GapLensInput): LensView<GapLensRow> {
  const rows = input.slots
    .filter(slot => slot.state === 'empty')
    .map<GapLensRow>(slot => {
      const candidates = input.rows.filter(row => isSuggestion(row) && row.slotKey === slot.key)
      return {
        slotKey: slot.key,
        slotRef: slot.ref ?? null,
        windowMin: slot.windowMin,
        candidates,
        noFit: gapNoFitReason(candidates),
      }
    })
  return lensViewOf(input.status, rows)
}

// --------------------------------------------------------------------- Fix

/** One edit. It names saved stops by id and carries no place, name or position. */
export type FixChange =
  | { kind: 'move'; stopId: string; toIndex: number }
  | { kind: 'swap'; stopId: string; withStopId: string }
  | { kind: 'remove'; stopId: string }
  | { kind: 'set-visit'; stopId: string; visitMin: number }
  | { kind: 'shift-start'; startMin: number }

/** The warning a change set tries to clear. */
export interface FixTarget {
  /** The engine warning code. */
  code: string
  /** The stop the warning names. Null when it names the whole day. */
  stopId: string | null
}

/** A warning the result would show. Used for new warnings the fix introduces. */
export interface FixWarningRef {
  code: string
  stopId: string | null
  /** True for a severe warning. */
  severe: boolean
}

/** The state of the check that ran on the change set. Each state stays apart. */
export type FixVerification =
  /** No check ran yet. */
  | { kind: 'unverified' }
  /** The check could not run or did not finish. The set must not be offered. */
  | { kind: 'failed'; reason: string }
  /** The check ran on the real plan. */
  | {
    kind: 'verified'
    /** True when the target warning is gone in the result. */
    clearsTarget: boolean
    /** Warnings that exist in the result and did not exist before. */
    introduced: readonly FixWarningRef[]
    /** Day total change in minutes. Negative is shorter. Null is unproven. */
    deltaMin: number | null
  }

/** A set of edits for one day. It is place-free so a writer can replay it. */
export interface FixChangeSet {
  /** Stable id of this proposal. */
  id: string
  dayIndex: number
  target: FixTarget
  /** Edits in the order a writer must apply them. */
  changes: readonly FixChange[]
  verification: FixVerification
}

/** Input of the Fix lens: change sets another module already built. */
export interface FixLensInput {
  status: JourneyStatus
  dayIndex: number | null
  /** Proposals in the order the producer made them. This lens never re-orders. */
  sets: readonly FixChangeSet[]
}

/** True when a set is verified, clears its target and adds no severe warning. */
export function fixIsOffered(set: FixChangeSet): boolean {
  const check = set.verification
  return check.kind === 'verified'
    && check.clearsTarget
    && !check.introduced.some(warning => warning.severe)
}

/** Keys a place-free change must never carry. */
const PLACE_KEYS = ['hit', 'place', 'placeKeys', 'lat', 'lng', 'latitude', 'longitude', 'name', 'title']

/** True when no change carries a place. Guards data that crossed a JSON boundary. */
export function isPlaceFree(set: FixChangeSet): boolean {
  return set.changes.every(change => PLACE_KEYS.every(key => !(key in change)))
}

/** Fix rows are the proposals for the scope, in producer order, with no filtering by verdict. */
export function fixLensRows(input: FixLensInput): LensView<FixChangeSet> {
  const rows = input.sets.filter(set => input.dayIndex == null || set.dayIndex === input.dayIndex)
  return lensViewOf(input.status, rows)
}
