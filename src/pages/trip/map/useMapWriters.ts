/**
 * #420, slice 10 — the map's plan writers as a hook.
 *
 * Adding a place to a day, filling one part, filling the whole day, and
 * raising a part vote lived as closures in `MapTab`. They are a hook now.
 *
 * #841 moved every PLACEMENT decision into `mapWriterActions`:
 *  - one effective `DayPlan` (manual picks + engine rows) feeds the single
 *    fill, the batch and the vote, so the list on screen is the list the
 *    action selects from;
 *  - the reviewed `planSlotPlacements` decides road order for all three, with
 *    real measured road facts or an explicit unresolved reason;
 *  - one synchronous gate reserves each place before the first `await`, so a
 *    second handler cannot enter before React re-renders;
 *  - a stage is not success. Only a validated acknowledgement plus the intended
 *    stop on the saved trip records `placed`, removes the manual pick and
 *    offers Undo. An absent receipt is reported as uncertain.
 *
 * What this hook owns: the four writes and nothing else. It keeps no state —
 * the busy flags, the day and the slots stay in the page with the rails that
 * render them. Every output action runs from an event handler, never during
 * render. The additive `dayPlan` result is a read-only projection from the same
 * `planForDay` producer, so the page renders and counts from one list.
 */
import { useRef } from 'react'
import { toast, undoToast } from '../../../components/ui'
import {
  asymmetricDetourMinutes,
  type PlaceHit,
  type SegmentHit,
} from '../../../lib/geocode'
import { isAirMode, MODE_SPEED } from '../../../lib/engine'
import { roadChainSig } from '../../../lib/tripRoad'
import type { ApplyChange } from '../../../lib/mutationLifecycle'
import { visitMinutesForCategory } from '../../../lib/slackPrompts'
import { newStopId, poiVisitMinutes } from './pageHelpers'
import { saveHaltPin } from '../../../lib/uiPrefs'
import { recordDnaEvent } from '../../../lib/tripDna'
import { addDecision, admitTripPreview, tripById } from '../../../store/store'
import { reportCollabOutcome } from '../../../lib/collabFeedback'
import { persistedPlaceFromHit } from '../../../lib/placeDraft'
import { isSameEntity, type PlaceIdentity } from '../../../lib/placeIdentity'
import type { DaySlot } from '../../../lib/daySlots'
import {
  batchSelection,
  effectiveDaySlotOf,
  voteSelection,
  type DayPlan,
  type EffectiveDaySlot,
} from '../../../lib/dayPlan'
import type { Trip } from '../../../data/types'
import {
  ZERO_VERIFIED_SAVE_MESSAGE,
  acknowledgedStopsFrom,
  guardedUndo,
  retryWriterStage,
  stageWriterPicks,
  stopCategoryOf,
  writerContextFor,
  type GuardedUndoOutcome,
  type WriterActionDeps,
  type WriterCompletion,
  type WriterRefusal,
  type WriterRetryTicket,
  type WriterStageResult,
} from './mapWriterActions'
import { applyVerifiedPlacement } from './verifiedPlacementEffects'
import {
  mapWriterOperationGate,
  type WriterOperationGate,
} from './writerOperationGate'
import { mapManualSlotStore, manualContextForSlot } from './manualSlotContexts'
import type { WriterRoadBinding } from './writerRoadBinding'
import { buildDayPlanForDay, readManualPicksForDay } from './manualPicks'
import { buildSlotVoteOption, createSlotVoteRequest } from './slotVoteOptions'

/** Every page value the four writes touch. */
export type UseMapWritersDeps = {
  /** the shared resolve-or-prompt guard — every write pins first */
  resolvePick: (hit: PlaceHit) => Promise<PlaceHit | null>
  /** the workspace write, with its staged-preview contract (#841: the kept
   *  callback receives the acknowledged receipt, and the fifth argument is the
   *  operation's client lifecycle metadata) */
  applyChange: ApplyChange
  /** the trip — ids, modes, styles and days feed the writes */
  trip: Trip
  /** the corridor plan — overnight segments name the halt pins */
  pois: SegmentHit[]
  /** along-route km for a point (null off-polyline) */
  routeKmOf: (lat: number, lng: number) => number | null
  /** corridor anchors for the detour math */
  anchors: { lat: number; lng: number }[]
  /** drawn-road polyline for the detour math */
  routePolyline: { lat: number; lng: number }[] | null
  /** the day the rail is planning */
  activeDayIndex: number
  /** the active day's slots — the batch fill reads their candidates */
  activeDaySlots: DaySlot[]
  /** marks staged ids at stage time, so a place cannot slip in twice */
  markStaged: (hits: Array<Pick<PlaceHit, 'id' | 'name'>>) => void
  /** true while any write is in flight — a second one waits */
  addingAny: boolean
  /** in-flight ids, so the same place cannot be written twice */
  addingIdsRef: { current: Set<string> }
  /** publishes the in-flight ids */
  setAddingIds: (ids: Set<string>) => void
  /** publishes the busy flag */
  setAddingAny: (busy: boolean) => void
  /** true while the batch fill runs */
  fillingDay: boolean
  /** publishes the batch-fill flag */
  setFillingDay: (filling: boolean) => void
  /** DNA freshness — bumped on every accept so scoring re-reads the log */
  setDnaTick: (fn: (t: number) => number) => void
  /** closes the open part after its write lands */
  setOpenSlotKey: (key: string | null) => void
  /** the part's live vote opens the crew's Group input (P4) */
  onOpenGroupInput?: () => void
  /** #841: the persisted day id, when the page already resolved it */
  dayId?: string | null
  /** #841: the shared presence identity — lets the plan drop a place the trip
   *  already contains before the vote or the batch offers it */
  presence?: PlaceIdentity
  /** #841: the page's legacy manual picks. The stable store is the source of
   *  truth; this stays until MapTab's wiring lease lands. */
  slotManual?: Record<string, PlaceHit[]>
  /** #841: explicit measured-route grade. Defaults to "measured when the
   *  driving polyline exists", because the driving map only draws a polyline
   *  from measured legs. An air journey's great-circle line is never road
   *  evidence. */
  roadMeasured?: boolean
  /** #841: stable identity of the measured chain. Defaults to `roadChainSig`. */
  routeKey?: string
  /** Strict measured-road bytes and live accessor. */
  roadBinding?: WriterRoadBinding | null
  currentRoad?: () => WriterRoadBinding | null
  /** #841: the workspace gate. Defaults to the shared map gate. */
  operationGate?: WriterOperationGate
  /** #841: the CURRENT committed trip, read at acknowledgement and retry time.
   *  Defaults to the store read. A test supplies its controlled persistent
   *  transport here instead of mocking the decision. */
  currentTrip?: () => Trip | undefined
  /** #841: detour measures for a manual pick's card. Optional; unknown stays
   *  null instead of an invented number. */
  detourMinFor?: (hit: PlaceHit) => number | null
  detourKmFor?: (hit: PlaceHit) => number | null
  /** #841: explicit repeat visit, a separate product action. */
  allowRepeatVisit?: boolean
  /** S3: the shared producer's display plan. Actions still revalidate with
   *  `planForDay()` at call time, so a stale display can never place a stop. */
  displayDayPlan?: DayPlan
}

/** The one line a refusal speaks. Kept here so each refusal has a reason the
 *  user can act on, never a silent no-op. */
const REFUSAL_MESSAGE: Record<WriterRefusal, string> = {
  'missing-day': 'This day has no saved identity yet - reload the trip, then try again.',
  'gate-busy': 'Another change is already using that place. Wait for it to finish.',
  'road-evidence-unavailable': 'The road has not been measured yet, so the app cannot place this stop. Try again after the route finishes measuring.',
  'nothing-pinned': 'That place could not be pinned on the map - nothing was placed.',
  'no-placements': 'Nothing could be placed from that choice - the day was not changed.',
}

export function useMapWriters({
  resolvePick,
  applyChange,
  trip,
  pois,
  routeKmOf,
  anchors,
  routePolyline,
  activeDayIndex,
  activeDaySlots,
  markStaged,
  addingAny,
  addingIdsRef,
  setAddingIds,
  setAddingAny,
  fillingDay,
  setFillingDay,
  setDnaTick,
  setOpenSlotKey,
  onOpenGroupInput,
  presence,
  slotManual,
  roadMeasured,
  routeKey: routeKeyProp,
  roadBinding,
  currentRoad,
  operationGate = mapWriterOperationGate,
  currentTrip: currentTripProp,
  detourMinFor,
  detourKmFor,
  allowRepeatVisit,
  displayDayPlan,
}: UseMapWritersDeps): {
  addPoiToDay: (hit: PlaceHit, dayIndex: number) => Promise<void>
  fillSlot: (slot: DaySlot, hit: PlaceHit) => Promise<void>
  fillTheDay: () => Promise<void>
  raiseSlotVote: (slot: DaySlot) => Promise<void>
  /** Additive #841 read-only projection: the SAME effective plan the single
   *  fill, the batch and the vote select from, so MapTab can render, count and
   *  refuse from one list. It is computed by `planForDay` above, never by a
   *  second derivation. */
  dayPlan: DayPlan
  /** F2: retry one genuinely uncertain operation by its exact operation id. It
   *  replays the captured ticket and never rebuilds a request from a current
   *  pick. A no-op when no uncertain ticket is held for that id. */
  retryUncertain: (operationId: string) => Promise<void>
} {
  /** F2: the exact uncertain tickets this hook may replay, keyed by operation
   *  id. A runner is registered only for a completion that carried the gate's
   *  retry proof and is consumed once. */
  const retryRunners = useRef(new Map<string, () => Promise<void>>())

  /** Retry the captured operation, never a matching current pick. */
  function retryUncertain(operationId: string): Promise<void> {
    const run = retryRunners.current.get(operationId)
    if (!run) return Promise.resolve()
    retryRunners.current.delete(operationId)
    return run()
  }

  /** #841: the stable inputs for one action, read at call time so a store
   *  write between render and handler cannot leave a stale day. */
  function stableContext() {
    return writerContextFor(trip, activeDayIndex)
  }

  /** The measured road facts for this write, or null. The driving map draws a
   *  polyline only from measured legs, so a driving polyline IS measured; an
   *  air journey draws a great-circle line and never counts as road evidence. */
  function roadFacts(): { routeKey: string } | null {
    const measured = roadMeasured ?? (!isAirMode(trip.transportMode) && !!routePolyline && routePolyline.length > 1)
    if (!measured) return null
    const routeKey = routeKeyProp ?? roadChainSig(trip)
    return routeKey ? { routeKey } : null
  }

  /** The day's ONE effective plan: manual picks (stable store + the page's
   *  legacy bucket) then the engine's rows, over the complete derived slots.
   *  The store read and the pure merge live in ./manualPicks, so the future
   *  shared producer calls the same pair and no second merge exists. */
  function planForDay(): DayPlan {
    const context = writerContextFor(trip, activeDayIndex)
    const stableDayId = context?.dayId ?? null
    return buildDayPlanForDay({
      tripId: trip.id,
      dayIndex: activeDayIndex,
      dayId: stableDayId,
      slots: activeDaySlots,
      manual: readManualPicksForDay({
        store: mapManualSlotStore,
        tripId: trip.id,
        dayId: stableDayId,
        slotManual: slotManual ?? {},
        detourMinFor,
        detourKmFor,
      }),
      identity: presence ?? null,
    })
  }

  /** The action deps for one operation. `onCompletion` is the caller's own
   *  follow-up; the gate, the trip and the store stay shared. */
  function actionDeps(onCompletion: (completion: WriterCompletion) => void): WriterActionDeps {
    return {
      trip,
      applyChange,
      resolvePick,
      mintStopId: newStopId,
      gate: operationGate,
      routeKmOf,
      road: roadFacts(),
      currentTrip: currentTripProp ?? (() => tripById(trip.id)),
      onCompletion,
      poiVisitMinutes,
      ...(roadBinding ? { roadBinding } : {}),
      ...(currentRoad ? { currentRoad } : {}),
      ...(allowRepeatVisit ? { allowRepeatVisit } : {}),
    }
  }

  /** The Undo a verified operation offers. It checks the acknowledged stop ids,
   *  their saved content and their stable day against the CURRENT trip, then
   *  awaits the real admission. A changed target is refused, never deleted. */
  function offerUndo(completion: WriterCompletion, message: string) {
    undoToast(message, () => {
      void guardedUndo(
        { currentTrip: () => tripById(trip.id), admit: admitTripPreview },
        {
          tripId: trip.id,
          operationId: completion.operationId,
          stops: acknowledgedStopsFrom(completion),
        },
      ).then((outcome: GuardedUndoOutcome) => {
        setDnaTick(t => t + 1)
        if (outcome.status === 'undone') {
          toast('The planned fills were pulled back')
          return
        }
        if (outcome.status === 'refused') {
          toast(
            outcome.reason === 'missing-day'
              ? 'Undo stopped: that day no longer exists.'
              : 'Undo stopped: the saved stop changed or moved, so it was left alone.',
            'err',
          )
          return
        }
        // The inverse may already be in this device's cache, so the copy must
        // not promise that the plan is unchanged. Saved edits stays the
        // recovery path, and the user is told the result is unconfirmed.
        toast('Undo was not confirmed. Check the day before you retry - Saved edits can still recover this trip.', 'err')
      })
    })
  }

  /** F2: register and offer the exact retry for one uncertain completion.
   *  The ticket is the gate's own proof; the runner replays it through the same
   *  completion handler, so the retry keeps its stop ids and never resolves the
   *  place again. It is registered only when the UI actually offers it. */
  function registeredRetry(
    completion: WriterCompletion,
    handleCompletion: (completion: WriterCompletion) => void,
    stagedMessage: string,
  ): (() => Promise<void>) | undefined {
    const ticket: WriterRetryTicket | undefined = completion.retry
    if (!ticket) return undefined
    let consumed = false
    const run = async () => {
      if (consumed) return
      consumed = true
      retryRunners.current.delete(ticket.operationId)
      // The production retry admission: exact operation id, context, intent,
      // picks and captured notes. A mismatch is refused by the gate; no new
      // operation or stop id is minted.
      try {
        const result = await retryWriterStage(actionDeps(handleCompletion), ticket)
        if (result.status === 'staged') markStaged(ticket.picks.map(pick => pick.hit))
        reportStageResult(result, stagedMessage)
      } catch (err) {
        console.error('[yatraflow] writer retry threw', err)
        toast('The retry could not start. Check the day before you try again; Saved edits can still recover the trip.', 'err')
      }
    }
    retryRunners.current.set(ticket.operationId, run)
    return run
  }

  /** The shared completion follow-up: only verified stops teach the engine, pin
   *  a halt, leave the manual list or offer Undo. */
  function afterPlacement(completion: WriterCompletion, input: {
    slot?: DaySlot
    undoMessage: (placed: number) => string
    onPlaced?: (completion: WriterCompletion) => void
    retry?: () => Promise<void>
  }) {
    if (completion.phase === 'abandoned') {
      retryRunners.current.delete(completion.operationId)
      toast('This saved edit was discarded; choose again.', 'err')
      return
    }
    const retryAction = input.retry
      ? { label: 'Retry', run: () => { void input.retry!() } }
      : undefined
    if (!completion.acknowledged) {
      toast(
        completion.phase === 'uncertain'
          ? 'The save was not confirmed, so this change stays pending. Retry it, or open Saved edits.'
          : 'The save could not be confirmed. Nothing was removed from your list. Retry it, or open Saved edits.',
        'err',
        retryAction,
      )
      return
    }
    if (completion.placed.length === 0) {
      toast(ZERO_VERIFIED_SAVE_MESSAGE, 'err', retryAction)
      return
    }
    applyVerifiedPlacement(completion, {
      onDna: item => {
        recordDnaEvent({
          tripId: trip.id,
          action: 'accept',
          haltKind: input.slot?.kind,
          category: item.hit.category,
          detourMin: asymmetricDetourMinutes(item.hit, anchors, routePolyline ?? null, MODE_SPEED[trip.transportMode] ?? 40) ?? undefined,
          visitMin: visitMinutesForCategory(item.hit.category),
        })
      },
      onDrop: item => {
        const context = input.slot
          ? manualContextForSlot(input.slot)
          : { tripId: trip.id, dayId: item.dayId, slotKey: item.slotKey ?? '' }
        if (context?.slotKey) mapManualSlotStore.dropPlaced(context, [item.hit])
      },
      onPlaced: () => setDnaTick(t => t + 1),
    })
    // #143: an overnight fill pins the halt, same as addPoiToDay's rule.
    if (input.slot && completion.placed.some(item => item.hit.haltPurpose === 'overnight')) {
      const ordinals = pois
        .filter(x => x.segment.purpose === 'overnight')
        .sort((a, b) => a.segment.targetKm - b.segment.targetKm)
        .findIndex(x => x.segment.index === input.slot?.segment?.index)
      if (ordinals >= 0) saveHaltPin(trip.id, ordinals, input.slot.segment?.targetKm ?? 0)
    }
    if (completion.phase === 'partial') {
      toast(`${completion.unresolved.length} placed stop${completion.unresolved.length === 1 ? '' : 's'} could not be confirmed in the saved day. Check before you retry.`, 'err')
    }
    input.onPlaced?.(completion)
    offerUndo(completion, input.undoMessage(completion.placed.length))
  }

  /** Map one staged result to the user's next step. A state that only staged
   *  says so; it never says the plan changed. */
  function reportStageResult(result: WriterStageResult, stagedMessage: string) {
    if (result.status === 'staged') {
      if (result.unresolved.length > 0) {
        toast(`${stagedMessage} ${result.unresolved.length} place${result.unresolved.length === 1 ? '' : 's'} stayed in your list with a reason.`)
      }
      return
    }
    if (result.resume) {
      // F2: a refused retry speaks its precise disposition. A changed choice
      // is a distinct operation; an unverifiable retry points at Saved edits.
      toast(result.resume.disposition === 'payload-changed'
        ? 'That choice changed since the last save was not confirmed, so it needs a separate action. The day was not changed.'
        : result.resume.disposition === 'resume-unverifiable'
          ? 'The earlier save is still unconfirmed and cannot be retried from here. Saved edits can recover the trip.'
          : result.resume.disposition === 'operation-unknown'
            ? 'That earlier change is no longer known on this page. Check the day before you retry; Saved edits can still recover the trip.'
            : 'That change already completed - check the day before you retry.', 'err')
      return
    }
    if (result.apply) {
      toast('The day order no longer accepts that stop, so the day was not changed. Check the day and try again.', 'err')
      return
    }
    if (result.skipped.some(item => item.reason === 'already-in-plan')) {
      toast('That place is already in the day - nothing was added.')
      return
    }
    toast(REFUSAL_MESSAGE[result.reason], 'err')
  }

  /** #143: an overnight direct add pins the halt, same as the overnight fill. */
  function pinOvernightHalt(hit: PlaceHit) {
    if (hit.haltPurpose !== 'overnight') return
    const seg = pois.find(p => p.hit?.id === hit.id)?.segment
    if (!seg) return
    const ordinals = pois
      .filter(x => x.segment.purpose === 'overnight')
      .sort((a, b) => a.segment.targetKm - b.segment.targetKm)
      .findIndex(x => x.segment.index === seg.index)
    if (ordinals >= 0) saveHaltPin(trip.id, ordinals, seg.targetKm)
  }

  /** F5: the direct add rides the SAME pipeline as every other placement entry
   *  point — the shared stage factory, planner, operation gate, verified
   *  completion and guarded Undo. The public signature and the stable day
   *  target are unchanged. There is no local splice and no append fallback: an
   *  unmeasured road keeps the place out with a reason, and the success copy
   *  lives only in the verified Undo surface. */
  async function addPoiToDay(hit: PlaceHit, dayIndex: number) {
    const key = String(hit.id)
    if (addingIdsRef.current.has(key)) return
    addingIdsRef.current.add(key)
    setAddingIds(new Set(addingIdsRef.current))
    setAddingAny(true)
    try {
      const context = writerContextFor(trip, dayIndex)
      if (!context) { toast(REFUSAL_MESSAGE['missing-day'], 'err'); return }
      const stagedMessage = `“${hit.name}” is staged for Day ${dayIndex + 1}. Keep to save it.`
      const handleCompletion: (completion: WriterCompletion) => void = completion => {
        const retry = !completion.acknowledged || completion.placed.length === 0
          ? registeredRetry(completion, handleCompletion, stagedMessage)
          : undefined
        afterPlacement(completion, {
          undoMessage: placed => {
            const added = `“${hit.name}” added to Day ${dayIndex + 1}`
            return placed === 1 && hit.haltPurpose === 'overnight'
              ? `${added} - night halt pinned, it won't move unless the road does`
              : added
          },
          onPlaced: () => pinOvernightHalt(hit),
          ...(retry ? { retry } : {}),
        })
      }
      const result = await stageWriterPicks(actionDeps(handleCompletion), {
        context,
        intent: 'single',
        picks: [{
          slotKey: null,
          hit,
          notes: hit.haltPurpose ? 'Added from the ride plan' : 'Added from nearby suggestions',
        }],
      })
      if (result.status === 'staged') markStaged([hit])
      reportStageResult(result, stagedMessage)
    } finally {
      addingIdsRef.current.delete(key)
      setAddingIds(new Set(addingIdsRef.current))
      if (addingIdsRef.current.size === 0) setAddingAny(false)
    }
  }

  /** P2: fill one empty part of the day with a candidate from the SAME list the
   *  card shows. The stop id is minted by the operation gate, so Undo can
   *  delete exactly what was acknowledged. */
  async function fillSlot(slot: DaySlot, hit: PlaceHit) {
    const key = String(hit.id)
    if (addingAny || addingIdsRef.current.has(key)) return
    addingIdsRef.current.add(key)
    setAddingIds(new Set(addingIdsRef.current))
    setAddingAny(true)
    try {
      const context = stableContext()
      if (!context) { toast(REFUSAL_MESSAGE['missing-day'], 'err'); return }
      const plan = planForDay()
      const effective = effectiveDaySlotOf(plan, slot.key)
      const candidate = effective?.candidates.find(row => isSameEntity(row.hit, hit))
      if (!candidate) {
        toast('That place is no longer in this part’s list - open the part and choose again.', 'err')
        return
      }
      const stagedMessage = `“${candidate.hit.name}” is staged for ${slot.label} on Day ${activeDayIndex + 1}. Keep to save it.`
      const handleCompletion: (completion: WriterCompletion) => void = completion => {
        const retry = !completion.acknowledged || completion.placed.length === 0
          ? registeredRetry(completion, handleCompletion, stagedMessage)
          : undefined
        afterPlacement(completion, {
          slot,
          undoMessage: placed => placed === 1
            ? `“${candidate.hit.name}” fills ${slot.label} on Day ${activeDayIndex + 1}`
            : `${placed} places fill Day ${activeDayIndex + 1}`,
          ...(retry ? { retry } : {}),
        })
      }
      const result = await stageWriterPicks(actionDeps(handleCompletion), {
        context,
        intent: 'single',
        picks: [{ slotKey: slot.key, hit: candidate.hit }],
      })
      if (result.status === 'staged') markStaged([candidate.hit])
      reportStageResult(result, stagedMessage)
      if (result.status === 'staged') setOpenSlotKey(null)
    } finally {
      addingIdsRef.current.delete(key)
      setAddingIds(new Set(addingIdsRef.current))
      if (addingIdsRef.current.size === 0) setAddingAny(false)
    }
  }

  /** P3.1: fill every empty part of the day with its top effective candidate in
   *  ONE operation. The batch and the single fill read one list, so they cannot
   *  choose differently. Duplicate places stay visible as skipped reasons. */
  async function fillTheDay() {
    if (fillingDay) return
    const context = stableContext()
    if (!context) { toast(REFUSAL_MESSAGE['missing-day'], 'err'); return }
    const plan = planForDay()
    const batch = batchSelection(plan)
    if (batch.refusal) { toast(REFUSAL_MESSAGE['missing-day'], 'err'); return }
    if (batch.items.length === 0) return
    setFillingDay(true)
    try {
      const targets = batch.items
      const stagedMessage = `Day ${activeDayIndex + 1} is staged. Keep to save the planned stops.`
      const handleCompletion: (completion: WriterCompletion) => void = completion => {
        const retry = !completion.acknowledged || completion.placed.length === 0
          ? registeredRetry(completion, handleCompletion, stagedMessage)
          : undefined
        afterPlacement(completion, {
          undoMessage: placed => {
            const left = targets.length - placed
            return `Day ${activeDayIndex + 1} planned - ${placed} stop${placed === 1 ? '' : 's'} added${left > 0 ? ` · ${left} left for you` : ''}`
          },
          onPlaced: () => setOpenSlotKey(null),
          ...(retry ? { retry } : {}),
        })
      }
      const result = await stageWriterPicks(actionDeps(handleCompletion), {
        context,
        intent: 'batch',
        picks: targets.map(item => ({
          slotKey: item.slotKey,
          hit: item.candidate.hit,
        })),
        ...(allowRepeatVisit ? { allowRepeatVisit: true } : {}),
      })
      if (result.status === 'staged') markStaged(targets.map(item => item.candidate.hit))
      reportStageResult(result, stagedMessage)
    } finally {
      setFillingDay(false)
    }
  }

  /** P4: raise the crew's vote for this part. The options are the first rows of
   *  the same effective list the cards render, so a manual-only pair is a valid
   *  poll and a vote can no longer omit the places the crew just compared. */
  async function raiseSlotVote(slot: DaySlot) {
    const context = stableContext()
    if (!context) { toast(REFUSAL_MESSAGE['missing-day'], 'err'); return }
    const effective: EffectiveDaySlot | undefined = effectiveDaySlotOf(planForDay(), slot.key)
    const selection = effective ? voteSelection(effective) : null
    if (selection && !selection.canRaise) {
      if (selection.refusal === 'vote-already-open') toast('The crew is already voting on this part.')
      else if (selection.refusal === 'too-few-candidates') toast('This part needs two places before the crew can vote.')
      else toast('This part cannot be voted on yet.')
      return
    }
    const picks = selection?.options ?? []
    if (picks.length < 2 || addingAny) return
    setAddingAny(true)
    try {
      const resolved = await Promise.all(picks.map(async c => ({ c, pinned: await resolvePick(c.hit) })))
      const usable = resolved.filter((x): x is { c: (typeof picks)[number]; pinned: PlaceHit } => !!x.pinned)
      if (usable.length < 2) { toast('Those places could not be pinned on the map - the vote was not created.'); return }
      const taken = new Set<string>()
      const options = usable.map(({ c, pinned }) => {
        const optionPlace = persistedPlaceFromHit(c.hit)
        const option = buildSlotVoteOption({
          slotKey: slot.key,
          hit: c.hit,
          detourMin: c.detourMin,
          taken,
          place: {
            title: c.hit.name,
            category: stopCategoryOf(c.hit.category),
            locationName: c.hit.description ?? c.hit.name,
            lat: pinned.latitude,
            lng: pinned.longitude,
            description: c.hit.description,
            visitMinutes: poiVisitMinutes(c.hit.category),
            openTime: c.hit.openTime,
            closeTime: c.hit.closeTime,
            dayIndex: activeDayIndex,
            ...(context.dayId ? { dayId: context.dayId } : {}),
            ...(optionPlace ? { place: optionPlace } : {}),
          },
        })
        taken.add(String(option.id))
        return option
      })
      const request = createSlotVoteRequest({
        question: `Day ${activeDayIndex + 1} ${slot.label.toLowerCase()} - where?`,
        context: `Voting from the day plan (Day ${activeDayIndex + 1})`,
        options,
      })
      if (!request.ok) {
        toast('Those places are the same place - the vote needs two different choices. It was not created.')
        return
      }
      const outcome = await addDecision(trip.id, request.request)
      reportCollabOutcome(outcome, `The crew is voting on Day ${activeDayIndex + 1} ${slot.label.toLowerCase()} - resolve it in Group input`)
      if (outcome.status === 'applied' || outcome.status === 'alreadyApplied') {
        setOpenSlotKey(null)
        onOpenGroupInput?.()
      }
    } finally { setAddingAny(false) }
  }

  return { addPoiToDay, fillSlot, fillTheDay, raiseSlotVote, dayPlan: displayDayPlan ?? planForDay(), retryUncertain }
}
