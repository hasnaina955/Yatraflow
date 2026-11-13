// ============ One verified-placement effect owner (#08 R7) ============
// Only a real, acknowledged completion with at least one verified placed stop may
// teach DNA or drop a manual candidate. Refused, uncertain, abandoned, zero-placed
// and late/repeated completions have no effect. Map and Timeline call this same
// helper with their own exact event/drop callbacks.
import type { WriterCompletion } from './mapWriterActions'

export interface VerifiedPlacementEffects {
  /** Record the exact verified stop in DNA. Called once per placed item. */
  onDna: (item: WriterCompletion['placed'][number]) => void
  /** Drop the exact manual candidate for this placed item. */
  onDrop: (item: WriterCompletion['placed'][number]) => void
  /** Called once after at least one real verified placement. */
  onPlaced?: (count: number) => void
}

/**
 * Apply the shared post-effects. Returns the number of verified placements that
 * were processed; 0 means nothing was taught or dropped.
 */
export function applyVerifiedPlacement(
  completion: WriterCompletion,
  effects: VerifiedPlacementEffects,
): number {
  if (!completion.acknowledged) return 0
  if (completion.phase !== 'applied' && completion.phase !== 'partial') return 0
  if (completion.placed.length === 0) return 0
  for (const item of completion.placed) {
    effects.onDna(item)
    effects.onDrop(item)
  }
  effects.onPlaced?.(completion.placed.length)
  return completion.placed.length
}

/** Truthful copy for a guarded-Undo refusal. No success claim. */
export function undoRefusalMessage(outcome: { status: string; reason?: string }): string | null {
  if (outcome.status === 'undone') return null
  if (outcome.status === 'refused') return 'Undo · Stop changed · Preserved'
  if (outcome.status === 'not-admitted') return 'Undo · Unavailable · Stop preserved'
  return 'Undo · Incomplete · Check Saved edits'
}
