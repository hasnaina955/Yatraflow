// ============ The effective day plan (#841) ============
// One pure projection from the day's derived slots and the day's own manual
// picks to THE candidate list every consumer reads: the rail cards, the
// comparison, the crew vote and Fill the day.
//
// The contract exists because those consumers used to read three different
// lists - the engine list, the merged display list, and the engine-only slice
// behind the vote and the batch - so an action could offer a place the user
// never saw, or refuse a pair the user had just compared. One `DayPlan` removes
// that class of disagreement.
//
// Rules kept here:
//  - One day. The plan carries one trip/day identity and repeats its stable
//    `SlotRef` on every slot. A slot with no stable ref has no valid write
//    target, so the vote and batch selectors refuse it instead of guessing.
//  - One list. Manual picks come first (they are the user's explicit choice),
//    then the engine's rows. Membership uses the app's ONE place-identity rule
//    (`isSameEntity`: provider keys first, normalized name plus 0.5 km as the
//    fallback), never a raw hit id and never a second "preferred key" string:
//    two providers that both number a place "1" stay two places, while one
//    provider key seen under two names is one place.
//  - One selection. The vote options, the batch targets and the counts all
//    read that one list, so the count, the cards and the action cannot
//    disagree.
//
// Pure: no store, no React, no provider client, no cache. Scoring, search and
// the day-slot grammar are unchanged and stay in their own modules.
import {
  isAlreadyAdded,
  isSameEntity,
  type PlaceIdentity,
} from './placeIdentity'
import type {
  DaySlot,
  SlotCandidate,
  SlotKey,
  SlotRef,
  SlotVote,
  SlotVoteUnbound,
} from './daySlots'

/** Where an effective row came from. Manual-first is a membership rule, not a
 *  score: a manual row keeps the `MAX_SAFE_INTEGER` score the search set, so it
 *  never re-ranks the engine's budget walk. */
export type CandidateOrigin = 'manual' | 'engine'

/** One row of a slot's ONLY candidate list. */
export interface EffectiveCandidate extends SlotCandidate {
  origin: CandidateOrigin
}

/** One slot of the effective plan, as every consumer reads it.
 *
 *  The row repeats the complete `DaySlot` through `source` so a writer can read
 *  the segment, the window, the drift proposal and the filled stop without
 *  keeping a second slot list. `candidates` is the ONLY candidate list; read
 *  `source.candidates` never. */
export interface EffectiveDaySlot {
  key: SlotKey
  kind: DaySlot['kind']
  label: string
  state: DaySlot['state']
  /** Stable trip+day+slot identity; null = unknown day identity, no write. */
  ref: SlotRef | null
  /** The ONLY candidate list the render, the vote and the batch may read. */
  candidates: EffectiveCandidate[]
  /** `candidates.length` - the number a card and its action must show. */
  count: number
  /** The stop that fills the slot, when filled. */
  filledStopId: string | null
  /** The unique day-scoped open poll, when one binds. */
  vote?: SlotVote
  /** Open polls that name this slot but did not bind. Explicit, never guessed. */
  voteUnbound?: SlotVoteUnbound[]
  /** Manual picks dropped because the plan already contains the place. */
  droppedManualCount: number
  /** The complete derived slot this row projects. Metadata compatibility: a
   *  caller that needs `segment`, `windowMin`, `windowLabel`, `mealSlot`,
   *  `auto`, `drift`, `urgencyMin`, `reason` or `filledStop` reads it here.
   *  There is no parallel slot list. */
  source: DaySlot
  /** Repeated from `source` so the common writer fields need no hop. */
  mealSlot?: DaySlot['mealSlot']
  windowMin: DaySlot['windowMin']
  windowLabel: DaySlot['windowLabel']
  segment: DaySlot['segment']
  filledStop: DaySlot['filledStop']
  auto: boolean
  drift: DaySlot['drift']
  urgencyMin: DaySlot['urgencyMin']
  reason: DaySlot['reason']
}

/** The effective row for one slot key, or undefined when the day has no such
 *  part. A lookup, never a second derivation. */
export function effectiveDaySlotOf(plan: DayPlan, key: SlotKey): EffectiveDaySlot | undefined {
  return plan.slots.find(slot => slot.key === key)
}

/** The complete original slot behind an effective row. The source scan in a
 *  writer uses this instead of building a competing projection. */
export function daySlotOf(slot: EffectiveDaySlot): DaySlot {
  return slot.source
}

/** One trip day's effective plan. */
export interface DayPlan {
  tripId: string | null
  dayId: string | null
  dayIndex: number
  /** Stable day identity; null when the plan cannot prove one. */
  ref: { tripId: string; dayId: string } | null
  slots: EffectiveDaySlot[]
}

export interface DayPlanInput {
  dayIndex: number
  /** The day's derived slots (`daySlots`), carrying their own stable refs. */
  slots: readonly DaySlot[]
  /** Stable context; absent keeps the plan's identity explicitly null. */
  tripId?: string | null
  dayId?: string | null
  /** Manual picks per slot key, already shaped by `manualCandidateFor`. */
  manual?: Readonly<Record<string, readonly SlotCandidate[]>>
  /** The plan's own identity facts; a pick already on the plan is dropped. */
  identity?: PlaceIdentity | null
}

function cleanId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * The slot's candidate list: manual picks first, then engine rows, with ONE
 * place never listed twice. Membership is `isSameEntity`, so a duplicate under
 * a different raw id still collapses and a shared raw id with conflicting
 * provider keys does not.
 */
export function mergeEffectiveCandidates(
  manual: readonly SlotCandidate[],
  engine: readonly SlotCandidate[],
): EffectiveCandidate[] {
  const out: EffectiveCandidate[] = []
  const add = (candidate: SlotCandidate, origin: CandidateOrigin): void => {
    if (out.some(row => isSameEntity(row.hit, candidate.hit))) return
    out.push({ ...candidate, origin })
  }
  for (const candidate of manual) add(candidate, 'manual')
  for (const candidate of engine) add(candidate, 'engine')
  return out
}

/** The manual picks that are still real for this slot: the plan does not have
 *  them, and the slot is still open. A filled or engine-managed slot surfaces
 *  no candidates at all. */
function manualForSlot(
  slot: DaySlot,
  input: DayPlanInput,
): { kept: SlotCandidate[]; dropped: number } {
  if (slot.state !== 'empty') return { kept: [], dropped: 0 }
  const kept: SlotCandidate[] = []
  let dropped = 0
  for (const candidate of input.manual?.[slot.key] ?? []) {
    if (input.identity && isAlreadyAdded(candidate.hit, input.identity)) {
      dropped += 1
      continue
    }
    kept.push(candidate)
  }
  return { kept, dropped }
}

function effectiveSlot(
  slot: DaySlot,
  input: DayPlanInput,
  planRef: DayPlan['ref'],
): EffectiveDaySlot {
  const { kept, dropped } = manualForSlot(slot, input)
  const candidates = slot.state === 'empty'
    ? mergeEffectiveCandidates(kept, slot.candidates)
    : []
  // The ref must come from the derivation AND agree with the plan's day. A
  // mismatch is not repaired into a write; it stays an explicit null.
  const slotRef = planRef && slot.ref
    && slot.ref.tripId === planRef.tripId
    && slot.ref.dayId === planRef.dayId
    ? slot.ref
    : null
  return {
    key: slot.key,
    kind: slot.kind,
    label: slot.label,
    state: slot.state,
    ref: slotRef,
    candidates,
    count: candidates.length,
    filledStopId: slot.filledStop ? String(slot.filledStop.id) : null,
    ...(slot.vote ? { vote: slot.vote } : {}),
    ...(slot.voteUnbound && slot.voteUnbound.length > 0 ? { voteUnbound: slot.voteUnbound } : {}),
    droppedManualCount: dropped,
    source: slot,
    ...(slot.mealSlot ? { mealSlot: slot.mealSlot } : {}),
    windowMin: slot.windowMin,
    windowLabel: slot.windowLabel,
    segment: slot.segment,
    filledStop: slot.filledStop,
    auto: slot.auto,
    drift: slot.drift,
    urgencyMin: slot.urgencyMin,
    reason: slot.reason,
  }
}

/**
 * Build the day's effective plan. The stable refs come from the derived slots;
 * the input may repeat the trip/day context for consumers that need it without
 * scanning slots, but it can never upgrade an unknown ref into a valid one.
 */
export function buildDayPlan(input: DayPlanInput): DayPlan {
  const derivedRef = input.slots.find(slot => slot.ref != null)?.ref ?? null
  const tripId = cleanId(input.tripId) ?? derivedRef?.tripId ?? null
  const dayId = cleanId(input.dayId) ?? derivedRef?.dayId ?? null
  const ref = tripId && dayId ? { tripId, dayId } : null
  return {
    tripId,
    dayId,
    dayIndex: input.dayIndex,
    ref,
    slots: input.slots.map(slot => effectiveSlot(slot, input, ref)),
  }
}

/** The counts every surface must agree on: chips, the rail meter and the
 *  action labels. All candidate counts read the effective list. */
export interface DayPlanCounts {
  slots: number
  filled: number
  empty: number
  auto: number
  /** Slots the crew actually owns (total minus engine-managed). */
  required: number
  /** Candidate rows across the open slots - what the cards render. */
  candidates: number
  /** Open slots with at least one candidate. */
  fillable: number
  /** Open slots with none ("search the map to source one"). */
  unsourced: number
  /** Slots with a unique day-scoped open poll. */
  openVotes: number
  /** Polls that name a slot but did not bind to this day. */
  unboundPolls: number
}

export function planCounts(plan: DayPlan): DayPlanCounts {
  let filled = 0
  let empty = 0
  let auto = 0
  let candidates = 0
  let fillable = 0
  let unsourced = 0
  let openVotes = 0
  let unboundPolls = 0
  for (const slot of plan.slots) {
    if (slot.state === 'filled') filled += 1
    if (slot.state === 'auto') auto += 1
    if (slot.state === 'empty') {
      empty += 1
      candidates += slot.count
      if (slot.count > 0) fillable += 1
      else unsourced += 1
    }
    if (slot.vote) openVotes += 1
    unboundPolls += slot.voteUnbound?.length ?? 0
  }
  return {
    slots: plan.slots.length,
    filled,
    empty,
    auto,
    required: plan.slots.length - auto,
    candidates,
    fillable,
    unsourced,
    openVotes,
    unboundPolls,
  }
}

export type VoteRefusal =
  | 'invalid-day-ref'
  | 'slot-not-empty'
  | 'vote-already-open'
  | 'too-few-candidates'

export interface VoteSelection {
  ref: SlotRef | null
  slotKey: SlotKey
  /** Up to `limit` rows from the SAME list the cards render. */
  options: EffectiveCandidate[]
  canRaise: boolean
  /** Why the poll cannot be raised; null when it can. */
  refusal: VoteRefusal | null
}

/**
 * What the "Ask the crew to vote" action submits: the first `limit` rows of
 * the slot's effective list. A manual-only pair is a valid poll (the old gate
 * counted the merged list while the writer read the engine list, so the button
 * could appear and then do nothing). An invalid day ref refuses the write.
 */
export function voteSelection(slot: EffectiveDaySlot, limit = 3): VoteSelection {
  const options = slot.candidates.slice(0, Math.max(0, limit))
  const refusal: VoteRefusal | null = slot.ref == null
    ? 'invalid-day-ref'
    : slot.state !== 'empty'
      ? 'slot-not-empty'
      : slot.vote
        ? 'vote-already-open'
        : options.length < 2
          ? 'too-few-candidates'
          : null
  return {
    ref: slot.ref,
    slotKey: slot.key,
    options,
    canRaise: refusal == null,
    refusal,
  }
}

export interface BatchItem {
  slotKey: SlotKey
  ref: SlotRef | null
  /** The first row of the slot's effective list - the same row its card shows. */
  candidate: EffectiveCandidate
  /** The earlier slot in this operation that already selected the same place.
   *  A duplicate is reported, never silently dropped: an intentional repeat is
   *  a separate product action, and the placement owner decides the refusal. */
  duplicateOfSlotKey: SlotKey | null
}

export interface BatchSelection {
  /** Stable day ref for the whole batch; null means no write is valid. */
  ref: { tripId: string; dayId: string } | null
  items: BatchItem[]
  /** 'invalid-day-ref' = do not write; the items remain readable for the UI. */
  refusal: 'invalid-day-ref' | null
  /** Items whose place no earlier item already selected. */
  distinctCount: number
}

/**
 * What "Fill the day" targets: the first effective candidate of every open
 * slot, in rail order. This is the batch parity contract - it reads the same
 * list the cards render, so a manual-only slot is fillable and two slots that
 * resolve to one place are visible as a duplicate instead of racing.
 */
export function batchSelection(plan: DayPlan): BatchSelection {
  const items: BatchItem[] = []
  for (const slot of plan.slots) {
    if (slot.state !== 'empty') continue
    const candidate = slot.candidates[0]
    if (!candidate) continue
    const duplicate = items.find(item => isSameEntity(item.candidate.hit, candidate.hit))
    items.push({
      slotKey: slot.key,
      ref: slot.ref,
      candidate,
      duplicateOfSlotKey: duplicate ? duplicate.slotKey : null,
    })
  }
  const invalidRef = plan.ref == null || items.some(item => item.ref == null)
  return {
    ref: plan.ref,
    items,
    refusal: invalidRef ? 'invalid-day-ref' : null,
    distinctCount: items.filter(item => item.duplicateOfSlotKey == null).length,
  }
}
