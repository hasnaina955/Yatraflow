// ============ Map v2 edit boundaries: exact Undo ============
// An Undo record keeps the prior stops of every day the change touched. It also
// keeps a signature of those days as the change left them. Undo is offered only
// while the days still match that signature. Otherwise it is a conflict, and
// the writer is not asked to overwrite someone else's later edit.
import type { ItineraryStop, Trip } from '../../../../data/types'

export interface UndoRecord {
  days: { index: number; stops: ItineraryStop[] }[]
  /** The touched days as the change left them, keyed by day index. */
  afterSignature: Record<number, string>
}

function signature(stops: readonly ItineraryStop[]): string {
  return JSON.stringify(stops)
}

/** Copy the prior plan of the touched days. The copy shares nothing with the trip. */
export function captureUndo(before: Trip, after: Trip, dayIndexes: readonly number[]): UndoRecord {
  const days: UndoRecord['days'] = []
  const afterSignature: Record<number, string> = {}
  for (const index of new Set(dayIndexes)) {
    const was = before.days.find(d => d.index === index)
    const now = after.days.find(d => d.index === index)
    if (was) days.push({ index, stops: structuredClone(was.stops) })
    if (now) afterSignature[index] = signature(now.stops)
  }
  return { days, afterSignature }
}

/** Available while every touched day is as the change left it. Else conflict. */
export function undoState(current: Trip, record: UndoRecord): 'available' | 'conflict' {
  for (const [key, expected] of Object.entries(record.afterSignature)) {
    const day = current.days.find(d => d.index === Number(key))
    if (!day || signature(day.stops) !== expected) return 'conflict'
  }
  return 'available'
}

/** A mutator that puts the prior stops back. Hand it to the writer's applyChange. */
export function undoMutator(record: UndoRecord): (draft: Trip) => void {
  return draft => {
    for (const saved of record.days) {
      const day = draft.days.find(d => d.index === saved.index)
      if (day) day.stops = structuredClone(saved.stops)
    }
  }
}
