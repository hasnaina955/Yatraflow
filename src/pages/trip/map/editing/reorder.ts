// ============ Map v2 edit boundaries: reorder (#907) ============
// A pointer drop and a keyboard press both call `proposeReorder`, so they
// cannot produce different proposals. The pointer's road-snapped slot is the
// TripMap handoff: TripMap works out the final index and calls this function.
// Indexes count active stops, the stops a map shows. Rejected stops keep their
// slots, as in Timeline's shared helper.
import type { Trip } from '../../../../data/types'
import { activeStopsInOrder, dayHoldingStop, moveActiveStopWithinDay } from '../../../../lib/stopOrder'
import type { EditProposal, EditRequest } from './stopEdit'

export type ReorderRefusal =
  | 'day-missing'
  | 'stop-missing'
  | 'fixed'
  | 'no-move'
  | 'out-of-range'
  | 'not-a-reorder-key'

export interface ReorderProposal {
  kind: 'proposal'
  dayIndex: number
  stopId: string
  title: string
  /** Index among active stops before and after the move. */
  fromIndex: number
  toIndex: number
  total: number
  orderedIds: string[]
}

export type ReorderResult = ReorderProposal | { kind: 'refused'; reason: ReorderRefusal }

const refused = (reason: ReorderRefusal): ReorderResult => ({ kind: 'refused', reason })

/** Alt+Up is one place earlier and Alt+Down one place later. Plain arrows are not a reorder. */
export function keyToReorderStep(key: string, altKey: boolean): -1 | 1 | null {
  if (!altKey) return null
  if (key === 'ArrowUp') return -1
  if (key === 'ArrowDown') return 1
  return null
}

/** The one proposal function. `toIndex` is the stop's final index among active stops. */
export function proposeReorder(input: { trip: Trip; dayIndex: number; stopId: string; toIndex: number }): ReorderResult {
  const { trip, dayIndex, stopId, toIndex } = input
  const day = trip.days.find(d => d.index === dayIndex)
  if (!day) return refused('day-missing')
  const active = activeStopsInOrder(day)
  const fromIndex = active.findIndex(s => s.id === stopId)
  if (fromIndex < 0) return refused('stop-missing')
  if (trip.fixedCommitments.some(fc => fc.stopId != null && String(fc.stopId) === stopId)) return refused('fixed')
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= active.length) return refused('out-of-range')
  if (toIndex === fromIndex) return refused('no-move')
  const ids = active.map(s => s.id)
  ids.splice(fromIndex, 1)
  ids.splice(toIndex, 0, stopId)
  return { kind: 'proposal', dayIndex, stopId, title: active[fromIndex].title, fromIndex, toIndex, total: active.length, orderedIds: ids }
}

/** A key press resolves to the same call a pointer drop makes. */
export function reorderFromKey(input: { trip: Trip; dayIndex: number; stopId: string; key: string; altKey: boolean }): ReorderResult {
  const step = keyToReorderStep(input.key, input.altKey)
  if (step === null) return refused('not-a-reorder-key')
  const day = input.trip.days.find(d => d.index === input.dayIndex)
  if (!day) return refused('day-missing')
  const active = activeStopsInOrder(day)
  const from = active.findIndex(s => s.id === input.stopId)
  if (from < 0) return refused('stop-missing')
  const to = from + step
  // At either end the key has nowhere to go. That is not an out-of-range drop.
  const proposal = proposeReorder({ trip: input.trip, dayIndex: input.dayIndex, stopId: input.stopId, toIndex: Math.min(active.length - 1, Math.max(0, to)) })
  return to < 0 || to >= active.length ? (proposal.kind === 'refused' && proposal.reason === 'fixed' ? proposal : refused('no-move')) : proposal
}

/** The writer request for a proposal. It makes the same edit Timeline's reorder makes. */
export function reorderRequest(proposal: ReorderProposal): EditRequest {
  return {
    kind: 'reorder',
    dayIndex: proposal.dayIndex,
    dayIndexes: [proposal.dayIndex],
    label: `Move ${proposal.title} to stop ${proposal.toIndex + 1}`,
    mutate: draft => {
      const day = dayHoldingStop(draft, proposal.stopId)
      if (day) moveActiveStopWithinDay(day, proposal.fromIndex, proposal.toIndex)
    },
  }
}

const REFUSAL_TEXT: Record<ReorderRefusal, string> = {
  'no-move': 'Stop · Already last · No change',
  fixed: 'Stop · Fixed time · Edit time to move',
  'out-of-range': 'Place · Outside this day · No change',
  'stop-missing': 'Stop · Outside this day · No change',
  'day-missing': 'Day · Outside this trip · No change',
  'not-a-reorder-key': 'Hold Alt and press the up or down arrow to move a stop.',
}

/** The line a screen reader announces. It names the stop, its place and the biggest clock change. */
export function announceReorder(result: ReorderResult, edit: Pick<EditProposal, 'clocks'> | null): string {
  if (result.kind === 'refused') return REFUSAL_TEXT[result.reason]
  const moved = `Moved ${result.title} to stop ${result.toIndex + 1} of ${result.total}.`
  const biggest = (edit?.clocks ?? [])
    .filter(c => c.deltaMin !== null && c.deltaMin !== 0)
    .sort((a, b) => Math.abs(b.deltaMin ?? 0) - Math.abs(a.deltaMin ?? 0))[0]
  return biggest ? `${moved} Preview: ${biggest.title} moves from ${biggest.from} to ${biggest.to} · Not saved` : `${moved} Clock · Unchanged · Not saved`
}
