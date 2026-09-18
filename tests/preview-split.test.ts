// ============ The premium line follows the data, not an assumed tail (2026-09-17) ============
// The public page claimed "the later days stay preview-only" while a live Spiti
// publication withheld days 5-8 and left days 9-10 free. These pin the claim
// against the shapes the catalog actually contains.
import { describe, expect, it } from 'vitest'
import { describePreviewSplit } from '../src/lib/previewSplit'

describe('describePreviewSplit', () => {
  it('states a non-tail split from the real data (the Spiti shape)', () => {
    // free 1-4 and 9-10 → locked 5-8, with two readable days AFTER the locks.
    const split = describePreviewSplit([0, 1, 2, 3, 8, 9], 10)!
    expect(split.claim).toBe('days 5–8 stay preview-only (6 of 10 days free)')
    expect(split.contiguousTail).toBe(false)
    expect(split.lockedCount).toBe(4)
  })

  it('states the tail split the old copy assumed (the Kerala shape)', () => {
    const split = describePreviewSplit([0], 4)!
    expect(split.claim).toBe('days 2–4 stay preview-only (1 of 4 days free)')
    expect(split.contiguousTail).toBe(true)
  })

  it('gets the grammar right for a single withheld day', () => {
    const split = describePreviewSplit([0, 2, 3], 4)!
    expect(split.claim).toBe('day 2 stays preview-only (3 of 4 days free)')
    expect(split.lockedLabel).toBe('day 2')
  })

  it('merges non-contiguous days into ranges', () => {
    // free 1, 3, 5 → locked days 2 and 4 (single days, comma-joined)
    expect(describePreviewSplit([0, 2, 4], 5)!.lockedLabel).toBe('days 2, 4')
    // free 1, 2, 5 → locked days 3 and 4, which merge into a range
    expect(describePreviewSplit([0, 1, 4], 5)!.lockedLabel).toBe('days 3–4')
  })

  it('says nothing when nothing is withheld — premium price with no preview claim', () => {
    expect(describePreviewSplit([0, 1, 2], 3)).toBeUndefined()
    expect(describePreviewSplit([0, 1, 2, 3], 3)).toBeUndefined()
  })

  it('treats an entirely withheld publication as all-locked', () => {
    const split = describePreviewSplit([], 3)!
    expect(split.claim).toBe('days 1–3 stay preview-only (0 of 3 days free)')
    expect(split.freeCount).toBe(0)
  })

  it('ignores out-of-range and duplicate indexes instead of inventing days', () => {
    const split = describePreviewSplit([0, 0, 99, -1], 2)!
    expect(split.claim).toBe('day 2 stays preview-only (1 of 2 days free)')
  })

  it('does not divide by a zero-length document', () => {
    expect(describePreviewSplit([0], 0)).toBeUndefined()
  })
})
