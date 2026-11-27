// ============ Budget mood: the face the Chakra tile wears ============
// A pure function with no React. The rules run in order, and the first match
// wins: no target, then over 100% of the target, then 90% or more, then a
// settled ledger, and otherwise happy.
import type { MascotPose } from './mascot'

export type BudgetMood = 'unset' | 'happy' | 'careful' | 'worried' | 'proud'

/** The pose each mood wears in the Budget tile (src/components/mascot/BudgetChakra.tsx). */
export const MOOD_POSE: Record<BudgetMood, MascotPose> = {
  unset: 'idle',
  happy: 'budget',
  careful: 'thinking',
  worried: 'sad',
  proud: 'love',
}

/** The mood for a trip's budget. `pctUsed` is the estimate as a share of the target. */
export function budgetMood(input: { hasTarget: boolean; pctUsed: number; ledgerLines: number; settledPct: number }): BudgetMood {
  if (!input.hasTarget) return 'unset'
  if (input.pctUsed > 100) return 'worried'
  if (input.pctUsed >= 90) return 'careful'
  if (input.ledgerLines > 0 && input.settledPct >= 100) return 'proud'
  return 'happy'
}
