// ============ Motion preferences (UI audit F-17) ============
// JS-driven motion (smooth scrolling) must honour the same OS query the CSS
// `@media (prefers-reduced-motion: reduce)` block does.

/** True when the user asked the OS to minimise non-essential motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** `behavior` value for scrollIntoView/scrollTo that respects the preference. */
export function scrollBehavior(): 'auto' | 'smooth' {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}
/**
 * Timing for the few JS-driven animations (the Board's FLIP settle), resolved
 * from the CSS motion tokens so JS and CSS can't drift apart — the FLIP easing
 * used to be `--ease-out` duplicated byte-for-byte in a string, and its
 * duration matched no token. Falls back to the token values when the stylesheet
 * hasn't loaded (SSR/tests).
 */
export function motionTiming(): { duration: number; easing: string } {
  const fallback = { duration: 240, easing: 'cubic-bezier(.22, .61, .36, 1)' }
  if (typeof window === 'undefined') return fallback
  const s = getComputedStyle(document.documentElement)
  const duration = parseFloat(s.getPropertyValue('--motion-slow'))
  const easing = s.getPropertyValue('--ease-out').trim()
  return {
    duration: Number.isFinite(duration) && duration > 0 ? duration : fallback.duration,
    easing: easing || fallback.easing,
  }
}
