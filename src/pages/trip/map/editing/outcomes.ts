// ============ Map v2 edit boundaries: the five outcomes ============
// Keep, reject, forbidden, failure and conflict are different facts. Each one
// tells the reader a different next step, so they never share a kind.
// Only a validated acknowledgement counts as a kept change.
import { acknowledgedReceiptOf, keepOutcomeOf, type AcknowledgedReceipt } from '../../../../lib/previewChain'

export type EditOutcome =
  | { kind: 'kept'; receipt: AcknowledgedReceipt }
  | { kind: 'rejected' }
  | { kind: 'forbidden' }
  | { kind: 'conflict'; reason: 'stale' | 'superseded' | 'conflict'; uncertain?: true }
  | { kind: 'failed'; reason: 'refused' | 'unavailable' | 'none'; uncertain?: true }

/** Map a writer answer to one outcome. An answer with no valid receipt is never success. */
export function outcomeFromKeep(result: unknown): EditOutcome {
  const receipt = acknowledgedReceiptOf(result)
  if (receipt) return { kind: 'kept', receipt }
  const outcome = keepOutcomeOf(result)
  // keepOutcomeOf drops the flag, so read it from the writer's answer itself.
  const flagged = typeof result === 'object' && result !== null && 'uncertain' in result && result.uncertain === true
  const uncertain = flagged ? { uncertain: true as const } : {}
  switch (outcome.kind) {
    case 'forbidden':
      return { kind: 'forbidden' }
    case 'stale':
    case 'superseded':
    case 'conflict':
      return { kind: 'conflict', reason: outcome.kind, ...uncertain }
    case 'refused':
    case 'none':
    case 'unavailable':
      return { kind: 'failed', reason: outcome.kind, ...uncertain }
    default:
      return { kind: 'failed', reason: 'unavailable' }
  }
}

/** One plain line per outcome. The preview stays open after every line but the first two. */
export function outcomeMessage(outcome: EditOutcome): string {
  switch (outcome.kind) {
    case 'kept':
      return 'Change · Saved'
    case 'rejected':
      return 'Preview · Closed · No change'
    case 'forbidden':
      return 'Edit access · Owner approval needed'
    case 'conflict':
      return 'Plan · Changed · Review before retry'
    case 'failed':
      return outcome.uncertain
        ? 'Save · Unconfirmed · Check Saved edits'
        : 'Save · Failed · Preview open'
  }
}
