// Map tab edit wiring (#905, #906, #907). One hook holds the edit session, the
// writer calls, the 8-second Undo window, the stop editor requests and the keyboard
// reorder. The cards are in ./editing/EditCards. The writer is `applyChange`, so
// every change still goes through the one acknowledged-write path.
//
// A save is `done` only on an acknowledged receipt (see editing/outcomes). The
// writer's other answers each become their own outcome and keep the preview open.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Trip, ItineraryStop } from '../../../data/types'
import type { PlaceHit } from '../../../lib/geocode'
import type { ApplyChange } from '../../../lib/mutationLifecycle'
import type { LegCorrections } from '../../../lib/impact'
import { activeStopsInOrder } from '../../../lib/stopOrder'
import { previewAdd, type AddPreview, type ReadyAddPreview } from './editing/addPreview'
import { editSessionReducer, IDLE_SESSION, type EditSession } from './editing/editSession'
import { outcomeFromKeep, type EditOutcome } from './editing/outcomes'
import { captureUndo, undoMutator, undoState } from './editing/undoPlan'
import {
  moveToDayRequest, proposeEdit, setVisitRequest, stepVisit, swapWithStopRequest,
  type EditProposal, type RequestResult,
} from './editing/stopEdit'
import { announceReorder, reorderFromKey, reorderRequest } from './editing/reorder'
import { addMutator, pickStopFor, roadInsertIndex, settleFromOperation, undoSecondsLeft, UNDO_WINDOW_MS } from './pickPreview'
import { previewRoadOf, type PreviewRoad } from './previewRoad'
import { newStopId } from './pageHelpers'

const REFUSAL: Record<string, string> = {
  'stop-missing': 'That stop is no longer on the plan.',
  'day-missing': 'That day is no longer on the trip.',
  'same-day': 'The stop is already on that day.',
  'same-stop': 'Choose a different stop.',
  'visit-invalid': 'That stay length is not valid.',
}

export interface MapEditDeps {
  trip: Trip
  editable: boolean
  applyChange: ApplyChange
  legCorrections?: LegCorrections
  /** Along-route km of a point; null when the road position is unknown. */
  routeKmOf: (lat: number, lng: number) => number | null | undefined
  /** Runs after an acknowledged add, for the page's own bookkeeping (taste log). */
  onAddKept?: (hit: PlaceHit) => void
  /** The destructive path. It stays `removeStopWithUndo` in the page. */
  removeStop: (stopId: string, meta: { title: string; dayIndex: number }) => void
}

export function useMapEdit({ trip, editable, applyChange, legCorrections, routeKmOf, onAddKept, removeStop }: MapEditDeps) {
  const [session, dispatch] = useReducer(editSessionReducer<ReadyAddPreview>, IDLE_SESSION as EditSession<ReadyAddPreview>)
  const [unknown, setUnknown] = useState<(Extract<AddPreview, { kind: 'unknown' }> & { hitId: string }) | null>(null)
  const [confirm, setConfirm] = useState<EditProposal | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [closed, setClosed] = useState(false)
  const [undoStartedAt, setUndoStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const tripRef = useRef(trip)
  // The ref follows the newest trip after each render. Handlers read it, never the render.
  useEffect(() => { tripRef.current = trip }, [trip])
  const hitRef = useRef<PlaceHit | null>(null)
  const stopRef = useRef<ItineraryStop | null>(null)

  const operationMeta = (settle: (outcome: EditOutcome) => void) => ({
    id: `map-edit:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    onDiscard: () => settle(settleFromOperation('discard')),
    onStoreDiscarded: () => settle(settleFromOperation('store-discarded')),
    onUncertain: () => settle(settleFromOperation('uncertain')),
  })

  /** A pick becomes a preview. A pick with no proven road position gets an honest unknown card. */
  const startAdd = useCallback((hit: PlaceHit, dayIndex: number) => {
    const current = tripRef.current
    const day = current.days.find(d => d.index === dayIndex)
    const stop = pickStopFor(hit, newStopId())
    const insertAt = day ? roadInsertIndex(day.stops, routeKmOf(hit.latitude, hit.longitude) ?? hit.cumKm, s => routeKmOf(s.lat, s.lng)) : null
    const preview = previewAdd({ trip: current, dayIndex, stop, insertAt, legCorrections })
    setClosed(false)
    setUndoStartedAt(null)
    hitRef.current = hit
    stopRef.current = stop
    if (preview.kind === 'ready') {
      setUnknown(null)
      dispatch({ type: 'preview', preview })
    } else {
      setUnknown({ ...preview, hitId: String(hit.id) })
    }
  }, [legCorrections, routeKmOf])

  const keep = useCallback(() => {
    if (session.phase !== 'previewing' || !editable) return
    const { preview } = session
    const stop = stopRef.current
    const hit = hitRef.current
    if (!stop) return
    dispatch({ type: 'keep' })
    const before = tripRef.current
    applyChange(
      addMutator(preview.dayIndex, preview.insertion.index, stop), 'add', preview.dayIndex,
      receipt => {
        const outcome = outcomeFromKeep(receipt)
        dispatch({ type: 'settle', outcome, undo: outcome.kind === 'kept' ? captureUndo(before, preview.proposedTrip, [preview.dayIndex]) : null })
        if (outcome.kind === 'kept') {
          setUndoStartedAt(Date.now())
          setAnnouncement(`Added ${preview.insertion.order > 0 ? `as stop ${preview.insertion.order}` : ''}. Undo is available for ${UNDO_WINDOW_MS / 1000} seconds.`)
          if (hit) onAddKept?.(hit)
        }
      },
      operationMeta(outcome => dispatch({ type: 'settle', outcome })),
    )
  }, [session, editable, applyChange, onAddKept])

  const reject = useCallback(() => {
    dispatch({ type: 'reject' })
    setUnknown(null)
  }, [])

  const undoRecord = session.phase === 'done' ? session.undo : null
  const canUndo = undoRecord != null && undoState(trip, undoRecord) === 'available'
    && undoStartedAt != null && undoSecondsLeft(undoStartedAt, now) > 0

  const undo = useCallback(() => {
    if (session.phase !== 'done' || !session.undo) return
    if (undoState(tripRef.current, session.undo) !== 'available') {
      setAnnouncement('Undo is not possible: the plan changed after this add.')
      return
    }
    const rec = session.undo
    dispatch({ type: 'undo' })
    const day = rec.days[0]?.index ?? 0
    applyChange(undoMutator(rec), 'edit', day, receipt => {
      dispatch({ type: 'undo-settle', outcome: outcomeFromKeep(receipt) })
      setAnnouncement('Undone. The plan is as it was.')
    }, operationMeta(outcome => dispatch({ type: 'undo-settle', outcome })))
  }, [session, applyChange])

  // The Undo countdown ticks once a second while it runs, then the card closes.
  useEffect(() => {
    if (undoStartedAt == null || session.phase !== 'done') return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (undoSecondsLeft(undoStartedAt, t) === 0) { setClosed(true); clearInterval(id) }
    }, 1000)
    return () => clearInterval(id)
  }, [undoStartedAt, session.phase])

  // ---- stop editor (#906) ----
  const commit = useCallback((proposal: EditProposal) => {
    const { request } = proposal
    applyChange(request.mutate, request.kind, request.dayIndex, () => setAnnouncement(`Saved: ${request.label}.`))
  }, [applyChange])

  const run = useCallback((result: RequestResult) => {
    if (result.kind === 'refused') { setAnnouncement(REFUSAL[result.reason] ?? 'That change is not possible.'); return null }
    const proposal = proposeEdit({ trip: tripRef.current, request: result.request, legCorrections })
    if (proposal.fixed.needsConfirm) { setConfirm(proposal); return proposal }
    commit(proposal)
    return proposal
  }, [legCorrections, commit])

  const stepStay = useCallback((stopId: string, direction: 1 | -1) => {
    const stop = tripRef.current.days.flatMap(d => d.stops).find(s => s.id === stopId)
    const next = stepVisit(stop?.visitMinutes, direction)
    if (next === null) { setAnnouncement('The stay length is not known, so it cannot change.'); return }
    run(setVisitRequest(tripRef.current, stopId, next))
  }, [run])

  const moveToDay = useCallback((stopId: string, toDay: number) => {
    run(moveToDayRequest(tripRef.current, stopId, toDay, s => routeKmOf(s.lat, s.lng)))
  }, [run, routeKmOf])

  /** Swap with the chosen stop of the day. The neighbour is the fallback. */
  const swapNeighbour = useCallback((stopId: string, targetId?: string) => {
    const day = tripRef.current.days.find(d => d.stops.some(s => s.id === stopId))
    const active = day ? activeStopsInOrder(day) : []
    const at = active.findIndex(s => s.id === stopId)
    const other = targetId != null
      ? active.find(s => s.id === targetId)
      : active[at + 1] ?? active[at - 1]
    if (!other) { setAnnouncement('There is no other stop on this day to swap with.'); return }
    run(swapWithStopRequest(tripRef.current, stopId, other.id))
  }, [run])

  const removeSelected = useCallback((stopId: string) => {
    const day = tripRef.current.days.find(d => d.stops.some(s => s.id === stopId))
    const stop = day?.stops.find(s => s.id === stopId)
    if (day && stop) removeStop(stopId, { title: stop.title, dayIndex: day.index })
  }, [removeStop])

  const confirmFixed = useCallback(() => { if (confirm) { commit(confirm); setConfirm(null) } }, [confirm, commit])
  const cancelFixed = useCallback(() => { setConfirm(null); setAnnouncement('Kept as it was.') }, [])

  // ---- keyboard reorder (#907): Alt+Up and Alt+Down on a focused planned stop ----
  const onReorderKey = useCallback((event: KeyboardEvent, stopId: string | null, dayIndex: number | null) => {
    if (!editable || !event.altKey || stopId == null || dayIndex == null) return
    const result = reorderFromKey({ trip: tripRef.current, dayIndex, stopId, key: event.key, altKey: event.altKey })
    if (result.kind === 'refused' && result.reason === 'not-a-reorder-key') return
    event.preventDefault()
    if (result.kind === 'refused') { setAnnouncement(announceReorder(result, null)); return }
    const proposal = run({ kind: 'ok', request: reorderRequest(result) })
    setAnnouncement(announceReorder(result, proposal))
  }, [editable, run])

  const previewRoad: PreviewRoad | null = useMemo(
    () => (session.phase === 'previewing' || session.phase === 'saving' ? previewRoadOf(session.preview) : null),
    [session],
  )

  const visible = !closed && (session.phase !== 'idle' || unknown != null)
  return {
    session, unknown, visible, previewRoad, announcement, confirm, canUndo,
    undoLeft: undoStartedAt != null ? undoSecondsLeft(undoStartedAt, now) : 0,
    startAdd, keep, reject, undo,
    stepStay, moveToDay, swapNeighbour, removeSelected, confirmFixed, cancelFixed, onReorderKey,
  }
}

export type MapEdit = ReturnType<typeof useMapEdit>
