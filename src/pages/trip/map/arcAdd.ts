// ============ Route arc "Add all" through the shared writer (#841) ============
//
// The arc button used to build its own stops, sort them by road km, splice them
// in, mark every id as added and report success, all before the save was
// acknowledged. It now stages through `stageWriterPicks`, the same planner and
// operation gate the single fill, the batch and the shortlist use:
//  - each arc place gets its own stable day target (by the day's own index);
//  - a place with no road position or no stable day stays unresolved with a
//    reason and is never put on Day 1 or at the end of a day;
//  - only places the acknowledgement verified are marked added, taught to the
//    DNA, or offered to Undo. Staging alone changes none of them;
//  - the same arc retried resumes the same operation, so a retry cannot mint a
//    second set of stops.
import type { PlaceHit } from '../../../lib/providers/hits'
import {
  acknowledgedStopsFrom,
  retryWriterStage,
  stageWriterPicks,
  type AcknowledgedStop,
  type GuardedUndoOutcome,
  type WriterActionDeps,
  type WriterCompletion,
  type WriterPick,
  type WriterRefusal,
  type WriterResumeDisposition,
  type WriterRetryTicket,
  type WriterStageResult,
} from './mapWriterActions'
import { writerResumePresentation } from './writerResumeDisposition'

export type ArcUnresolvedReason = 'not-found' | 'no-road-position' | 'no-stable-day'

export interface ArcUnresolved {
  id: string
  name: string | null
  reason: ArcUnresolvedReason
}

export interface ArcPickPlan {
  picks: WriterPick[]
  /** Places the arc could not target. Kept, with the reason. */
  unresolved: ArcUnresolved[]
  /** Places the plan already holds. Not an error. */
  alreadyPlanned: number
}

/** Turn an arc's hit ids into writer picks with stable per-item day targets. */
export function arcPickPlan(input: {
  hitIds: readonly (string | number)[]
  arcHits: readonly PlaceHit[]
  isAdded: (hit: PlaceHit) => boolean
  dayForKm: (km: number | null | undefined) => number | null
  dayIdForIndex: (index: number) => string | undefined
}): ArcPickPlan {
  const picks: WriterPick[] = []
  const unresolved: ArcUnresolved[] = []
  let alreadyPlanned = 0
  for (const rawId of input.hitIds) {
    const id = String(rawId)
    const hit = input.arcHits.find(candidate => String(candidate.id) === id)
    if (!hit) { unresolved.push({ id, name: null, reason: 'not-found' }); continue }
    if (input.isAdded(hit)) { alreadyPlanned += 1; continue }
    const dayIndex = input.dayForKm(hit.cumKm)
    if (dayIndex == null) { unresolved.push({ id, name: hit.name, reason: 'no-road-position' }); continue }
    const dayId = input.dayIdForIndex(dayIndex)
    if (!dayId) { unresolved.push({ id, name: hit.name, reason: 'no-stable-day' }); continue }
    picks.push({ hit, slotKey: null, dayId, dayIndex })
  }
  return { picks, unresolved, alreadyPlanned }
}

export type ArcStageOutcome =
  | { status: 'nothing'; plan: ArcPickPlan }
  | { status: 'staged'; plan: ArcPickPlan; result: Extract<WriterStageResult, { status: 'staged' }> }
  | {
    status: 'refused'
    plan: ArcPickPlan
    reason: WriterRefusal
    /** Present only when a retry of an uncertain operation was refused. */
    resume?: { disposition: WriterResumeDisposition; operationId: string }
  }

/** Stage the arc. Nothing is applied here: the caller's completion callback
 *  runs after the acknowledged save. */
export async function stageArcAdd(
  deps: WriterActionDeps,
  input: { tripId: string; plan: ArcPickPlan },
): Promise<ArcStageOutcome> {
  if (input.plan.picks.length === 0) return { status: 'nothing', plan: input.plan }
  const result = await stageWriterPicks(deps, {
    context: { tripId: input.tripId, dayId: null, dayIndex: -1 },
    intent: 'arc',
    picks: input.plan.picks,
  })
  if (result.status === 'refused') {
    return {
      status: 'refused',
      plan: input.plan,
      reason: result.reason,
      ...(result.resume ? { resume: result.resume } : {}),
    }
  }
  return { status: 'staged', plan: input.plan, result }
}

/** Retry one uncertain arc operation from the gate's captured ticket. It uses
 *  the SAME production retry admission as the single fill, the batch and the
 *  shortlist: exact operation id, context, intent, picks and notes. The plan is
 *  passed only for the staged/refused copy, never as a new pick source. */
export async function retryArcAdd(
  deps: WriterActionDeps,
  plan: ArcPickPlan,
  ticket: WriterRetryTicket,
): Promise<ArcStageOutcome> {
  const result = await retryWriterStage(deps, ticket)
  if (result.status === 'refused') {
    return {
      status: 'refused',
      plan,
      reason: result.reason,
      ...(result.resume ? { resume: result.resume } : {}),
    }
  }
  return { status: 'staged', plan, result }
}

const UNRESOLVED_COPY: Record<ArcUnresolvedReason, string> = {
  'not-found': 'not in the arc list',
  'no-road-position': 'no position on the road yet',
  'no-stable-day': 'its day has no saved identity yet',
}

const REFUSAL_COPY: Record<WriterRefusal, string> = {
  'missing-day': 'Target day · Not ready · Reload trip',
  'gate-busy': 'Place · Change pending',
  'road-evidence-unavailable': 'Road · Not measured · Retry after measurement',
  'current-trip-unavailable': 'Retry · Saved trip unavailable',
  'nothing-pinned': 'Places · Position unavailable · None added',
  'no-placements': 'Arc · No places added · Picks available',
}

/** The line shown at stage time. A staged arc says it is staged, never added. */
export function arcStageLine(label: string, outcome: ArcStageOutcome): { text: string; tone: 'info' | 'err' } {
  const retained = outcome.plan.unresolved.length
    + (outcome.status === 'staged' ? outcome.result.unresolved.length : 0)
  const tail = retained > 0
    ? ` · Picks retained: ${retained}`
    : ''
  if (outcome.status === 'nothing') {
    if (outcome.plan.unresolved.length > 0) {
      const reasons = [...new Set(outcome.plan.unresolved.map(item => UNRESOLVED_COPY[item.reason]))].join(', ')
      return { text: `Places · Not placed · ${reasons} · Picks retained`, tone: 'err' }
    }
    return { text: 'Places · Already added', tone: 'info' }
  }
  if (outcome.status === 'refused') {
    if (outcome.resume) {
      return { text: writerResumePresentation(outcome.resume.disposition).text, tone: 'err' }
    }
    return { text: REFUSAL_COPY[outcome.reason], tone: 'err' }
  }
  const n = outcome.result.planned.length
  return {
    text: `“${label}” · Staged stops: ${n} · Keep to save${tail}`,
    tone: 'info',
  }
}

export interface ArcCompletionEffects {
  /** Ids to mark as added. Verified places only. */
  addedIds: string[]
  /** Hits to teach the DNA. Verified places only. */
  dnaHits: PlaceHit[]
  /** What Undo may remove. Verified stops only. */
  undoStops: AcknowledgedStop[]
  /** Places the save did not confirm. Still available to retry. */
  retained: number
  line: { text: string; tone: 'ok' | 'err' }
}

/** What the page may do after the save settles. An unacknowledged or unverified
 *  operation yields no added ids, no DNA, no Undo and no success line. */
export function arcCompletionEffects(label: string, completion: WriterCompletion): ArcCompletionEffects {
  if (completion.phase === 'abandoned') {
    return {
      addedIds: [], dnaHits: [], undoStops: [], retained: completion.unresolved.length,
      line: { text: 'Saved edit · Discarded · Choose again', tone: 'err' },
    }
  }
  if (!completion.acknowledged) {
    return {
      addedIds: [], dnaHits: [], undoStops: [], retained: completion.unresolved.length,
      line: { text: 'Save · Unconfirmed · Retry or check Saved edits', tone: 'err' },
    }
  }
  const placed = completion.placed
  const retained = completion.unresolved.length + completion.skipped.length
  if (placed.length === 0) {
    return {
      addedIds: [], dnaHits: [], undoStops: [], retained,
      line: { text: 'Save · Stops unverified · Retry or check day', tone: 'err' },
    }
  }
  const tail = retained > 0 ? ` - ${retained} stayed in the list with a reason` : ''
  return {
    addedIds: placed.map(item => String(item.hit.id)),
    dnaHits: placed.map(item => item.hit),
    undoStops: acknowledgedStopsFrom(completion),
    retained,
    line: {
      text: `“${label}” added (${placed.length} stop${placed.length === 1 ? '' : 's'})${tail}`,
      tone: 'ok',
    },
  }
}

/** What the page says after a guarded Undo. Only an admitted inverse reads as
 *  pulled back; a changed target is refused and left alone. */
export function arcUndoLine(label: string, outcome: GuardedUndoOutcome): { text: string; tone: 'ok' | 'err' } {
  if (outcome.status === 'undone') return { text: `“${label}” was pulled back`, tone: 'ok' }
  if (outcome.status === 'refused') {
    return {
      text: outcome.reason === 'missing-day'
        ? 'Undo · Day unavailable'
        : 'Undo · Stop changed · No change',
      tone: 'err',
    }
  }
  return { text: 'Undo · Unconfirmed · Check day or Saved edits', tone: 'err' }
}
