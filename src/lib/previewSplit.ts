// ============ Which days a publication keeps back, stated from its own data ============
// The public page's premium line used to say "the later days stay preview-only",
// which is only true when the creator marked the tail as free — measured on a
// live Spiti publication (₹500), the locked days were 5-8 and days 9-10 were
// FREE, so a reader who scrolled past the locks found the page contradicting
// itself. `freeDayIndexes` is an arbitrary subset, so the sentence is derived
// from it here, and the grammar lives with the derivation.

export interface PreviewSplit {
  /** Ready-to-append clause, e.g. "days 5–8 stay preview-only (6 of 10 days free)". */
  claim: string
  /** The locked days, as a label without the verb: "days 5–8", "day 5", "days 2, 4–5". */
  lockedLabel: string
  lockedCount: number
  freeCount: number
  dayCount: number
  /** True when the locked days are the document's tail — what the old copy always assumed. */
  contiguousTail: boolean
}

/** Merge ascending day numbers into "1–3, 5, 8–10" style ranges (en dash). */
function mergeRanges(days: number[]): string[] {
  const out: string[] = []
  let start = days[0]
  let prev = days[0]
  const push = () => out.push(start === prev ? `${start}` : `${start}\u2013${prev}`)
  for (const d of days.slice(1)) {
    if (d === prev + 1) { prev = d; continue }
    push()
    start = d; prev = d
  }
  if (days.length) push()
  return out
}

/**
 * Describe which days a publication withholds. `freeDayIndexes` are the 0-based
 * day indexes the creator left open; everything else in `[0, dayCount)` is
 * preview-only. Returns `undefined` when nothing is withheld, which is the
 * caller's cue to show the price without a preview claim.
 */
export function describePreviewSplit(freeDayIndexes: number[], dayCount: number): PreviewSplit | undefined {
  const total = Math.max(0, Math.floor(dayCount))
  if (total === 0) return undefined
  const free = new Set(freeDayIndexes.filter(i => Number.isInteger(i) && i >= 0 && i < total))
  const locked = Array.from({ length: total }, (_, i) => i + 1).filter(oneBased => !free.has(oneBased - 1))
  if (locked.length === 0) return undefined

  const ranges = mergeRanges(locked)
  const plural = locked.length > 1
  const lockedLabel = plural ? `days ${ranges.join(', ')}` : `day ${ranges[0]}`
  const verbs = plural ? 'stay' : 'stays'
  const freeCount = total - locked.length
  const contiguousTail = locked[locked.length - 1] === total && locked.length === total - locked[0] + 1

  return {
    claim: `${lockedLabel} ${verbs} preview-only (${freeCount} of ${total} days free)`,
    lockedLabel,
    lockedCount: locked.length,
    freeCount,
    dayCount: total,
    contiguousTail,
  }
}
