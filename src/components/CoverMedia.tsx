// ============ Shared cover renderer ============
// One cover, one image. Every surface that shows a trip, publication or
// purchase cover draws it here, so the rule is stated once:
//
//   the traveller's upload, else the generated scene that fits, else the
//   traveller's emoji — and the emoji only when every image is gone.
//
// The plan comes from lib/regionArt (which image honestly fits) and the URLs
// from lib/coverAttempts (which files exist, AVIF before WebP). This component
// only walks that list: one candidate is mounted at a time, a failure moves to
// the next, and the emoji is the terminal state. Nothing paints over a working
// image, and no second image is mounted beside the first.
//
// Failure memory belongs to ONE plan. A different trip, a different upload or
// a cleared cover changes the plan key, and the memory resets — otherwise a
// scene that failed for one trip would fall back on another that loads fine.
import { useState } from 'react'
import { coverAttemptsFor, coverPlanKey, type CoverAttempt } from '../lib/coverAttempts'
import { focalXFor, focalYFor, type CoverPlan } from '../lib/regionArt'

function attemptUrl(attempt: CoverAttempt): string {
  return attempt.kind === 'user' ? attempt.url : attempt.src
}

/** The image to mount, or null when every candidate has failed. */
function liveAttempt(attempts: readonly CoverAttempt[], failed: readonly string[]): CoverAttempt | null {
  return attempts.find(attempt => !failed.includes(attemptUrl(attempt))) ?? null
}

export function CoverMedia({ plan, ratio, sizes, eager = false, className, emojiClassName, alt = '' }: {
  plan: CoverPlan
  /** The crop ratio of this slot, such as "16:10". Sets the focal point. */
  ratio: string
  /** The responsive `sizes` for the slot's real width. */
  sizes: string
  /** Load eagerly. Above-the-fold heroes only; cards stay lazy. */
  eager?: boolean
  /** Class for the image. Callers keep their existing slot styles. */
  className?: string
  /** Class for the terminal emoji. */
  emojiClassName?: string
  alt?: string
}) {
  const attempts = coverAttemptsFor(plan)
  const key = coverPlanKey(plan)
  // A failure belongs to one plan. Adjusting state during render is React's own
  // pattern for "reset when the input changes" and needs no effect.
  const [memory, setMemory] = useState<{ key: string; failed: readonly string[] }>({ key, failed: [] })
  if (memory.key !== key) setMemory({ key, failed: [] })

  const attempt = liveAttempt(attempts, memory.failed)
  if (!attempt) {
    return (
      <span className={emojiClassName} data-cover-state="emoji" aria-hidden="true">{plan.fallbackEmoji}</span>
    )
  }

  const url = attemptUrl(attempt)
  const fail = () => {
    setMemory(previous => {
      // A callback from a plan that is no longer rendered must not touch the
      // new plan's memory.
      if (previous.key !== key || previous.failed.includes(url)) return previous
      return { key: previous.key, failed: [...previous.failed, url] }
    })
  }
  const position = attempt.kind === 'user'
    ? '50% 45%'
    : `${focalXFor(attempt.id, ratio)}% ${focalYFor(attempt.id, ratio)}%`

  return (
    <img
      className={className}
      data-cover-state="image"
      src={url}
      srcSet={attempt.kind === 'scene' ? attempt.srcSet : undefined}
      sizes={attempt.kind === 'scene' ? sizes : undefined}
      alt={alt}
      aria-hidden={alt === '' ? 'true' : undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      style={{ objectPosition: position }}
      onError={fail}
    />
  )
}
