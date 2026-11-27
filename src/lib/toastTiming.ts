// ============ Toast exit and icon timing (#1053) ============
// The CSS exit animation and the JS unmount timer read the same motion token.
// These helpers stay pure so the lifecycle can be proved with fake timers in a
// node-environment test, with no DOM.

import { motionExitTiming, prefersReducedMotion } from './motion'

/** The JS unmount delay for a toast exit, in ms. Zero means remove at once. */
export function toastExitDuration(reduced = prefersReducedMotion()): number {
  return reduced ? 0 : motionExitTiming('--motion-fast').duration
}

/**
 * Start one toast's exit: mark it leaving so CSS can animate, then unmount it
 * after the CSS exit token's duration. Reduced motion skips the leaving frame
 * and removes it now. The returned cancel function stops this toast's own
 * timer if it is removed for another reason first.
 */
export function beginToastExit(
  markLeaving: () => void,
  unmount: () => void,
  reduced = prefersReducedMotion(),
): () => void {
  const duration = toastExitDuration(reduced)
  if (duration === 0) {
    unmount()
    return () => {}
  }
  markLeaving()
  const handle = setTimeout(unmount, duration)
  return () => clearTimeout(handle)
}

/** A dwell timer may not start an exit while a pointer or key holds the toast. */
export function leaveIfNotHeld(held: () => boolean, startLeave: () => void): void {
  if (held()) return
  startLeave()
}

/** The icon a toast kind draws. A neutral toast draws none. */
export type ToastIconKind = 'check' | 'alert' | null
export function toastIconKind(kind: string): ToastIconKind {
  if (kind === 'ok') return 'check'
  if (kind === 'err') return 'alert'
  return null
}
