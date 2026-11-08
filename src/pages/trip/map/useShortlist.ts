/**
 * #420, slice 2 — the shortlist feature as a hook.
 *
 * The rail collects places, the tray decides what happens to them, and this hook is
 * that whole feature: the collection, the shared "is it already mine?" filter, the
 * two writers, and the two guards that keep them from double-firing. It moved out of
 * `MapTab` verbatim — this is a refactor, so the bodies below are the same code with
 * their closures named through `ShortlistDeps` instead of being captured from a
 * 2,700-line component.
 *
 * #841 repairs the two failures this feature shared with the rest of the map:
 *  - placement goes through the reviewed `planSlotPlacements` with the current
 *    measured road facts. An unknown target day or an unmeasured road keeps the
 *    place in the tray with a reason; it is never appended to Day 1 or the end
 *    of a day;
 *  - the tray is emptied only for places the acknowledgement actually saved.
 *    Skipped, unresolved and uncertain places stay. A discarded preview
 *    releases the operation's reservations and nothing else.
 */
import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { PlaceHit } from '../../../lib/geocode'
import { isAlreadyAdded, isSameEntity, type PlaceIdentity } from '../../../lib/placeIdentity'
import type { Trip } from '../../../data/types'
import { toast, undoToast } from '../../../components/ui'
import { addDecision, admitTripPreview, tripById } from '../../../store/store'
import { reportCollabOutcome } from '../../../lib/collabFeedback'
import { persistedPlaceFromHit } from '../../../lib/placeDraft'
import { isAirMode } from '../../../lib/engine'
import { confirmedVisitMinutes } from '../../../lib/hoursContext'
import { roadChainSig } from '../../../lib/tripRoad'
import type { ApplyChange } from '../../../lib/mutationLifecycle'
import { orderByRoad } from './roadOrder'
import {
  ZERO_VERIFIED_SAVE_MESSAGE,
  acknowledgedStopsFrom,
  guardedUndo,
  retryWriterStage,
  stageWriterPicks,
  stopCategoryOf,
  type GuardedUndoOutcome,
  type WriterActionDeps,
  type WriterCompletion,
  type WriterRefusal,
  type WriterRetryTicket,
  type WriterStageResult,
} from './mapWriterActions'
import { mapWriterOperationGate, type WriterOperationGate } from './writerOperationGate'
import type { WriterRoadBinding } from './writerRoadBinding'
import { writerResumePresentation } from './writerResumeDisposition'
import { buildSlotVoteOption, createSlotVoteRequest } from './slotVoteOptions'

export type ShortlistDeps = {
  tripId: string
  /** the shared presence identity — one answer to "is this already mine?" */
  identity: PlaceIdentity
  /** the shared resolve-or-prompt guard every unknown-position pick goes through */
  resolvePick: (hit: PlaceHit) => Promise<PlaceHit | null>
  applyChange: ApplyChange
  setAddedIds: Dispatch<SetStateAction<Set<string>>>
  newStopId: () => string
  dayForKm: (km: number | null | undefined) => number | null
  /** stable id for a resolved day position, when the route placed it */
  dayIdForIndex?: (index: number) => string | undefined
  poiVisitMinutes: (category?: string) => number
  routeKmOf: (lat: number, lng: number) => number | null
  detourMinFor: (hit: PlaceHit) => number | null
  /** the page's shared batch-busy flag: every batch writer disables together */
  busy: boolean
  setBusy: (busy: boolean) => void
  /** #841: the workspace gate. Defaults to the shared map gate. */
  operationGate?: WriterOperationGate
  /** #841: the CURRENT committed trip, read at retry time. Defaults to the
   *  store read; a test supplies its controlled persistent transport. */
  currentTrip?: () => Trip | undefined
  /** #841: stable identity of the measured chain. Defaults to `roadChainSig`
   *  of the current trip. */
  routeKey?: string
  /** #841: explicit measured-route grade. Defaults to "measured when a driving
   *  trip has measured positions", never for an air journey. */
  roadMeasured?: boolean
  /** Strict measured-road bytes and live accessor. */
  roadBinding?: WriterRoadBinding | null
  currentRoad?: () => WriterRoadBinding | null
}

const REFUSAL_MESSAGE: Record<WriterRefusal, string> = {
  'missing-day': 'A target day has no saved identity yet - reload the trip, then try again.',
  'gate-busy': 'Another change is already using one of those places. Wait for it to finish.',
  'road-evidence-unavailable': 'The road has not been measured yet, so those places cannot be placed. Try again after the route finishes measuring.',
  'current-trip-unavailable': 'The current saved trip is unavailable, so this retry cannot start.',
  'nothing-pinned': 'Nothing could be pinned from the shortlist - try another place.',
  'no-placements': 'Nothing could be placed from the shortlist. The tray is unchanged.',
}

export function useShortlist({
  tripId,
  identity,
  resolvePick,
  applyChange,
  setAddedIds,
  newStopId,
  dayForKm,
  dayIdForIndex,
  poiVisitMinutes,
  routeKmOf,
  detourMinFor,
  busy,
  setBusy,
  operationGate = mapWriterOperationGate,
  currentTrip: currentTripProp,
  routeKey: routeKeyProp,
  roadMeasured,
  roadBinding,
  currentRoad: currentRoadBindingProp,
}: ShortlistDeps) {
  const [shortlist, setShortlist] = useState<PlaceHit[]>([])

  /** F2: exact uncertain tickets, keyed by operation id. A runner is consumed
   *  once and replays the gate's captured ticket, never a current tray pick. */
  const retryRunners = useRef(new Map<string, () => Promise<void>>())

  function retryUncertain(operationId: string): Promise<void> {
    const run = retryRunners.current.get(operationId)
    if (!run) return Promise.resolve()
    retryRunners.current.delete(operationId)
    return run()
  }

  function registerRetry(
    completion: WriterCompletion,
    replay: (ticket: WriterRetryTicket) => Promise<void>,
  ): (() => Promise<void>) | undefined {
    const ticket = completion.retry
    if (!ticket) return undefined
    let consumed = false
    const run = async () => {
      if (consumed) return
      consumed = true
      retryRunners.current.delete(ticket.operationId)
      await replay(ticket)
    }
    retryRunners.current.set(ticket.operationId, run)
    return run
  }

  /** Shortlisting never edits the plan; it collects for the tray to act on. */
  function toggleShortlist(hit: PlaceHit) {
    setShortlist(prev => {
      if (prev.some(h => h.id === hit.id)) return prev.filter(h => h.id !== hit.id)
      // #179: membership systems must not fight — already-added (Timeline or
      // map) and dismissed hits can't re-enter the tray from any path. The
      // predicate is the SHARED one (session ids, provider keys and the
      // normalized-name fallback); re-deriving it here would be a second
      // membership rule, which is the bug #345 was about.
      if (isAlreadyAdded(hit, identity)) return prev
      return [...prev, hit]
    })
  }

  // #179: the tray re-validates at render — a hit shortlisted and THEN added on the
  // Timeline (or dismissed) must not sit in the tray as a stale double-add waiting
  // to happen. Derived, so every action below sees the same clean list.
  const trayShortlist = useMemo(
    () => shortlist.filter(h => !isAlreadyAdded(h, identity)),
    [shortlist, identity],
  )

  const isShortlisted = (hit: PlaceHit) => trayShortlist.some(h => h.id === hit.id)

  function currentRoad(trip: Trip): { routeKey: string } | null {
    const measured = roadMeasured ?? (!isAirMode(trip.transportMode)
      && trip.days.some(day => day.stops.some(stop => routeKmOf(stop.lat, stop.lng) != null)))
    if (!measured) return null
    const key = routeKeyProp ?? roadChainSig(trip)
    return key ? { routeKey: key } : null
  }

  function offerUndo(completion: WriterCompletion) {
    undoToast(
      `${completion.placed.length} shortlist stop${completion.placed.length === 1 ? '' : 's'} added in road order`,
      () => {
        void guardedUndo(
          { currentTrip: () => tripById(tripId), admit: admitTripPreview },
          { tripId, operationId: completion.operationId, stops: acknowledgedStopsFrom(completion) },
        ).then((outcome: GuardedUndoOutcome) => {
          if (outcome.status === 'undone') { toast('The shortlist stops were pulled back'); return }
          if (outcome.status === 'refused') {
            toast('Undo stopped: a saved stop changed or moved, so it was left alone.', 'err')
            return
          }
          // The inverse may already be in this device's cache. The copy must not
          // claim the plan is unchanged; Saved edits stays the recovery path.
          toast('Undo was not confirmed. Check the day before you retry - Saved edits can still recover this trip.', 'err')
        })
      },
    )
  }

  async function addShortlisted() {
    if (busy || trayShortlist.length === 0) return
    const trip = currentTripProp?.() ?? tripById(tripId)
    if (!trip) { toast('This trip is not loaded - the shortlist was not added.', 'err'); return }
    setBusy(true)
    try {
      // #420 slice 1: the ordering rule lives in map/roadOrder.ts, with its own
      // tests — same comparator, including its NaN-keeps-order subtlety.
      const ordered = orderByRoad(trayShortlist, routeKmOf)
      const resolved = await Promise.all(ordered.map(async hit => ({ hit, pinned: await resolvePick(hit) })))
      const usable = resolved.filter((x): x is { hit: PlaceHit; pinned: PlaceHit } => !!x.pinned)
      const unpinned = resolved.filter(x => !x.pinned).map(x => x.hit)
      if (usable.length === 0) {
        toast('Nothing could be pinned from the shortlist - try another place.')
        return
      }
      // A place the route cannot position keeps its tray entry with a reason.
      // We never drop it on Day 1 and never append it to a day's end.
      const targets: Array<{ hit: PlaceHit; dayIndex: number; dayId: string }> = []
      const unresolvedTargets: PlaceHit[] = [...unpinned]
      for (const item of usable) {
        const dayIndex = dayForKm(item.hit.cumKm)
        const dayId = dayIndex == null ? undefined : dayIdForIndex?.(dayIndex)
        if (dayIndex == null || !dayId) { unresolvedTargets.push(item.hit); continue }
        targets.push({ hit: item.hit, dayIndex, dayId })
      }
      if (targets.length === 0) {
        toast('No shortlisted place has a known day yet. They stay in the tray.', 'err')
        return
      }
      const depsFor = (onCompletion: (completion: WriterCompletion) => void): WriterActionDeps => ({
        trip,
        applyChange,
        resolvePick,
        mintStopId: newStopId,
        gate: operationGate,
        routeKmOf,
        road: currentRoad(trip),
        currentTrip: currentTripProp ?? (() => tripById(tripId)),
        poiVisitMinutes,
        onCompletion: completion => onCompletion(completion),
        ...(roadBinding ? { roadBinding } : {}),
        ...(currentRoadBindingProp ? { currentRoad: currentRoadBindingProp } : {}),
      })

      const reportStage = (result: WriterStageResult) => {
        if (result.status === 'refused') {
          if (result.resume) {
            toast(writerResumePresentation(result.resume.disposition).text, 'err')
            return
          }
          if (result.skipped.some(item => item.reason === 'already-in-plan')) {
            toast('Those places are already in the plan - nothing was added.')
            return
          }
          toast(
            result.apply
              ? 'The saved day order no longer accepts those stops, so the plan was not changed. Check the day and try again.'
              : REFUSAL_MESSAGE[result.reason],
            'err',
          )
          return
        }
        if (result.unresolved.length > 0 || unresolvedTargets.length > 0) {
          const stayed = result.unresolved.length + unresolvedTargets.length
          toast(`${stayed} place${stayed === 1 ? '' : 's'} stayed in the tray with a reason.`)
        }
      }

      function handleCompletion(completion: WriterCompletion) {
        if (completion.phase === 'abandoned') {
          retryRunners.current.delete(completion.operationId)
          toast('This saved edit was discarded; choose again.', 'err')
          return
        }
        const retry = !completion.acknowledged || completion.placed.length === 0
          ? registerRetry(completion, async ticket => {
              // The production retry admission: the captured operation id and
              // payload. It never re-runs the tray resolve, so a second resolver
              // result cannot restage different content.
              try {
                const retried = await retryWriterStage(depsFor(handleCompletion), ticket)
                reportStage(retried)
              } catch (err) {
                console.error('[yatraflow] shortlist retry threw', err)
                toast('The retry could not start. Check the plan before you try again; Saved edits can still recover the trip.', 'err')
              }
            })
          : undefined
        const retryAction = retry ? { label: 'Retry', run: () => { void retry() } } : undefined
        if (!completion.acknowledged) {
          toast('The save was not confirmed, so no shortlist place was removed. Retry it, or open Saved edits.', 'err', retryAction)
          return
        }
        const placed = completion.placed
        if (placed.length === 0) {
          toast(`${ZERO_VERIFIED_SAVE_MESSAGE} The tray is unchanged.`, 'err', retryAction)
          return
        }
        setAddedIds(prev => {
          const next = new Set(prev)
          for (const item of placed) next.add(String(item.hit.id))
          return next
        })
        // Remove ONLY verified places. A skipped or unresolved place keeps the
        // user's explicit choice visible and actionable.
        setShortlist(prev => prev.filter(hit => !placed.some(item => isSameEntity(item.hit, hit))))
        const left = prevLeft(completion, unresolvedTargets.length)
        offerUndo(completion)
        // The Undo toast carries the success line; a skipped or unverified
        // place adds one honest sentence so it is not mistaken for placed.
        if (left > 0) toast(`${left} shortlist place${left === 1 ? '' : 's'} stayed in the tray with a reason.`)
      }

      const result = await stageWriterPicks(depsFor(handleCompletion), {
        context: { tripId, dayId: null, dayIndex: -1 },
        intent: 'shortlist',
        picks: targets.map(target => ({ hit: target.hit, slotKey: null, dayId: target.dayId, dayIndex: target.dayIndex })),
      })
      reportStage(result)
    } finally {
      setBusy(false)
    }
  }

  /** How many tray entries the completion did not verify. */
  function prevLeft(completion: WriterCompletion, unknownTargets: number): number {
    return completion.unresolved.length + completion.skipped.length + unknownTargets
  }

  /** Turn the shortlist into an open group decision, reusing the poll shape.
   *  Each option carries the place it stands for, so RESOLVING the decision
   *  lands the winner on the timeline as a confirmed stop (store's
   *  resolveDecision reads the payload) — shortlist → vote → resolved →
   *  on the board, timeline and map, with the rail's row dropping out. */
  async function raiseShortlistVote() {
    if (trayShortlist.length === 0 || busy) return
    setBusy(true)
    try {
      const resolved = await Promise.all(trayShortlist.map(async h => ({ h, pinned: await resolvePick(h) })))
      const usable = resolved.filter((x): x is { h: PlaceHit; pinned: PlaceHit } => !!x.pinned)
      if (usable.length === 0) { toast('Those places could not be pinned on the map - the vote was not created.'); return }
      const taken = new Set<string>()
      const options = usable.map(({ h, pinned }) => {
        const optionPlace = persistedPlaceFromHit(h)
        const dayIndex = dayForKm(h.cumKm)
        const dayId = dayIndex == null ? undefined : dayIdForIndex?.(dayIndex)
        const option = buildSlotVoteOption({
          slotKey: 'shortlist',
          hit: h,
          detourMin: detourMinFor(h),
          taken,
          place: {
            title: h.name,
            category: stopCategoryOf(h.category),
            locationName: h.description ?? h.name,
            lat: pinned.latitude,
            lng: pinned.longitude,
            description: h.description,
            visitMinutes: confirmedVisitMinutes(h) ?? poiVisitMinutes(h.category),
            ...(h.openTime ? { openTime: h.openTime } : {}),
            ...(h.closeTime ? { closeTime: h.closeTime } : {}),
            // Unknown route position: leave the day ABSENT (not Day 1 —
            // #336). Resolution then says it cannot place the winner instead
            // of dropping it on a day nobody chose.
            dayIndex: dayIndex ?? undefined,
            ...(dayId ? { dayId } : {}),
            ...(optionPlace ? { place: optionPlace } : {}),
          },
        })
        // The shortlist poll predates the slot prefix and its stored ballots
        // point at the raw hit id. Keep that spelling rather than the slot one.
        const legacyId = String(h.id)
        taken.add(legacyId)
        return { ...option, id: legacyId }
      })
      const request = createSlotVoteRequest({
        question: usable.length === 1 ? `Should we add "${usable[0].h.name}"?` : 'Which of these should we add?',
        context: 'Shortlisted from the Map rail',
        options,
      })
      if (!request.ok) {
        toast('Those places are the same place - the vote needs two different choices. It was not created.')
        return
      }
      const outcome = await addDecision(tripId, request.request)
      reportCollabOutcome(outcome, 'Decision posted for the group - resolving it adds the winner to the plan')
      // The tray empties on the RECEIPT: a refused poll must not throw away
      // the shortlist the user collected one place at a time.
      if (outcome.status === 'applied' || outcome.status === 'alreadyApplied') setShortlist([])
    } finally { setBusy(false) }
  }

  return {
    /** the raw collection, for the page's own signature/dirty checks */
    shortlist,
    /** the collection with everything already mine filtered out */
    trayShortlist,
    isShortlisted,
    toggleShortlist,
    addShortlisted,
    raiseShortlistVote,
    /** F2: retry one genuinely uncertain shortlist operation by its exact
     *  operation id, reusing the captured ticket. Consumed once. */
    retryUncertain,
    /** Emptying the tray throws away places the user collected one at a time, so
     *  it leaves the same way back the rest of the app's destructive actions do:
     *  an Undo that puts the collection back whole (#424 — a destructive action
     *  with no recovery is the gap this closes, however small the collection). */
    clearShortlist: () => {
      if (shortlist.length === 0) return
      const previous = shortlist
      setShortlist([])
      undoToast(`Cleared ${previous.length} shortlisted place${previous.length === 1 ? '' : 's'}`, () => setShortlist(previous))
    },
  }
}
