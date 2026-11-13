// ============ Map v2 edit boundaries: the preview session ============
// A pure state machine for one proposal: preview, keep, then the writer's answer.
// The phase becomes `done` only on an acknowledged receipt. Every other answer
// leaves the preview open with its own outcome, so a failed save never looks
// like a saved one. React state and the writer call live in the caller.
import type { EditOutcome } from './outcomes'
import type { ReadyAddPreview } from './addPreview'
import type { UndoRecord } from './undoPlan'

export type EditSession<P = ReadyAddPreview> =
  | { phase: 'idle'; lastOutcome: EditOutcome | null }
  | { phase: 'previewing'; preview: P; lastOutcome: EditOutcome | null }
  | { phase: 'saving'; preview: P; lastOutcome: null }
  | { phase: 'done'; preview: P; lastOutcome: EditOutcome; undo: UndoRecord | null }
  | { phase: 'undoing'; preview: P; lastOutcome: EditOutcome; undo: UndoRecord }

export type EditEvent<P = ReadyAddPreview> =
  | { type: 'preview'; preview: P }
  | { type: 'keep' }
  | { type: 'settle'; outcome: EditOutcome; undo?: UndoRecord | null }
  | { type: 'reject' }
  /** The shared writer took the save. It reports the result and owns the Undo. */
  | { type: 'handoff' }
  | { type: 'undo' }
  | { type: 'undo-settle'; outcome: EditOutcome }

export const IDLE_SESSION: EditSession<never> = { phase: 'idle', lastOutcome: null }

/** Next state for one event. An event that does not fit the phase returns the same state. */
export function editSessionReducer<P = ReadyAddPreview>(state: EditSession<P>, event: EditEvent<P>): EditSession<P> {
  switch (event.type) {
    case 'preview':
      if (state.phase === 'saving' || state.phase === 'undoing') return state
      return { phase: 'previewing', preview: event.preview, lastOutcome: null }
    case 'keep':
      if (state.phase !== 'previewing') return state
      return { phase: 'saving', preview: state.preview, lastOutcome: null }
    case 'settle':
      if (state.phase !== 'saving') return state
      if (event.outcome.kind === 'kept') {
        return { phase: 'done', preview: state.preview, lastOutcome: event.outcome, undo: event.undo ?? null }
      }
      return { phase: 'previewing', preview: state.preview, lastOutcome: event.outcome }
    case 'reject':
      if (state.phase !== 'previewing') return state
      return { phase: 'idle', lastOutcome: { kind: 'rejected' } }
    case 'handoff':
      if (state.phase !== 'saving') return state
      return { phase: 'idle', lastOutcome: null }
    case 'undo':
      if (state.phase !== 'done' || !state.undo) return state
      return { phase: 'undoing', preview: state.preview, lastOutcome: state.lastOutcome, undo: state.undo }
    case 'undo-settle':
      if (state.phase !== 'undoing') return state
      if (event.outcome.kind === 'kept') return { phase: 'idle', lastOutcome: event.outcome }
      return { phase: 'done', preview: state.preview, lastOutcome: event.outcome, undo: state.undo }
  }
}
