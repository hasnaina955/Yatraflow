// ============ The phone sheet's one gesture model (ticket 07) ============
//
// The phone sheet has one 44px handle and three snaps: peek, half, full. A press
// on that handle is either a tap that cycles the snap, or a vertical drag that
// moves it one stop. Both must report exactly ONE snap change per gesture.
//
// WHY THIS IS PURE. This repo's tests run in a node environment with no DOM, so
// a component listener cannot prove cancel, stale-prop or double-activation
// behaviour. The decision lives here; the component keeps only DOM plumbing.
//
// WHAT IT MUST NOT DO. It never prevents the page from scrolling and it never
// touches the map. `touch-action: none` stays on the handle alone, so MapLibre
// keeps its own pan and pinch lane.
//
// WHAT IT PROTECTS AGAINST.
// - A drag that ends at a boundary still suppresses the trailing click, or the
//   click would cycle the snap the drag had just refused to move.
// - `lostpointercapture` fires after a normal release. Treating it as a cancel
//   while idle would eat the click that a tap needs, so it is a no-op then.
// - A second finger cannot own the handle while the first is still down.
// - The snap is read at release time, not at press time, so a parent that moves
//   the sheet during a drag cannot leave the handle computing from a stale one.

export type SheetSnap = 'peek' | 'half' | 'full'

/** Which input committed a snap. Focus transfer may care; the sheet does not. */
export type SheetSnapSource = 'pointer' | 'keyboard'

export const SHEET_SNAPS = ['peek', 'half', 'full'] as const

/** How far, in pixels, a press must travel before it counts as a drag. */
export const SHEET_DRAG_THRESHOLD = 24

/** One step taller: peek to half, half to full, full stays full. */
export function expandSheetSnap(snap: SheetSnap): SheetSnap {
  if (snap === 'peek') return 'half'
  return 'full'
}

/** One step shorter: full to half, half to peek, peek stays peek. */
export function collapseSheetSnap(snap: SheetSnap): SheetSnap {
  if (snap === 'full') return 'half'
  return 'peek'
}

/** A tap walks the ladder and wraps: peek to half to full to peek. */
export function cycleSheetSnap(snap: SheetSnap): SheetSnap {
  if (snap === 'peek') return 'half'
  if (snap === 'half') return 'full'
  return 'peek'
}

/**
 * The snap a key asks for, or null for every key this control does not own.
 * Null is the contract that keeps the page's own scroll keys working.
 */
export function sheetSnapForKey(snap: SheetSnap, key: string): SheetSnap | null {
  switch (key) {
    case 'ArrowUp':
      return expandSheetSnap(snap)
    case 'ArrowDown':
      return collapseSheetSnap(snap)
    case 'Home':
      return 'peek'
    case 'End':
      return 'full'
    default:
      return null
  }
}

/**
 * The snap a vertical drag asks for. A delta shorter than the threshold is not
 * a drag, so the snap does not move. Invalid numbers are treated the same way.
 */
export function sheetSnapForDrag(snap: SheetSnap, deltaY: number, threshold = SHEET_DRAG_THRESHOLD): SheetSnap {
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < threshold) return snap
  return deltaY < 0 ? expandSheetSnap(snap) : collapseSheetSnap(snap)
}

/** What the handle remembers between pointer events. */
export interface SheetGestureState {
  /** The pointer that owns this handle, or null when no gesture is running. */
  readonly pointerId: number | null
  /** Client Y at press time. */
  readonly startY: number
  /** True while the click that follows a drag or a cancel must be ignored. */
  readonly suppressClick: boolean
}

export const IDLE_SHEET_GESTURE: SheetGestureState = Object.freeze({
  pointerId: null,
  startY: 0,
  suppressClick: false,
})

export interface SheetGestureResult {
  readonly state: SheetGestureState
  /** The snap to commit, or null when this event changes nothing. */
  readonly snap: SheetSnap | null
}

const IDLE_AFTER_DRAG: SheetGestureState = { pointerId: null, startY: 0, suppressClick: true }
const IDLE_AFTER_TAP: SheetGestureState = { pointerId: null, startY: 0, suppressClick: false }

/**
 * A pointer went down. A second pointer is ignored while one owns the handle,
 * so two fingers cannot start two gestures on the same sheet.
 */
export function beginSheetGesture(state: SheetGestureState, pointerId: number, clientY: number): SheetGestureResult {
  if (state.pointerId !== null) return { state, snap: null }
  return { state: { pointerId, startY: clientY, suppressClick: false }, snap: null }
}

/**
 * A pointer went up. A long press becomes one snap change and eats the click
 * that will follow it. A short press reports no snap, so the click can cycle.
 * An event from any other pointer, or a repeat, changes nothing.
 */
export function endSheetGesture(
  state: SheetGestureState,
  snap: SheetSnap,
  pointerId: number,
  clientY: number,
  threshold = SHEET_DRAG_THRESHOLD,
): SheetGestureResult {
  if (state.pointerId === null || state.pointerId !== pointerId) return { state, snap: null }

  const delta = clientY - state.startY
  if (!Number.isFinite(delta) || Math.abs(delta) < threshold) return { state: IDLE_AFTER_TAP, snap: null }

  const next = sheetSnapForDrag(snap, delta, threshold)
  return {
    // A boundary drag reports no snap but still suppresses the click: the
    // press was a drag, not a tap.
    state: IDLE_AFTER_DRAG,
    snap: next === snap ? null : next,
  }
}

/**
 * The gesture was cancelled: pointercancel, a lost capture, or the component
 * unmounting. While idle this is a no-op, because a normal release is followed
 * by `lostpointercapture` and eating that click would break the tap cycle.
 */
export function cancelSheetGesture(state: SheetGestureState, pointerId?: number): SheetGestureResult {
  if (state.pointerId === null) return { state, snap: null }
  if (pointerId !== undefined && pointerId !== state.pointerId) return { state, snap: null }
  return { state: IDLE_AFTER_DRAG, snap: null }
}

/**
 * A click arrived. It is swallowed exactly once after a drag or a cancel; after
 * a tap it walks the ladder one step. A click during a live gesture is ignored.
 */
export function clickSheetGesture(state: SheetGestureState, snap: SheetSnap): SheetGestureResult {
  if (state.pointerId !== null) return { state, snap: null }
  if (state.suppressClick) return { state: IDLE_AFTER_TAP, snap: null }
  return { state: IDLE_AFTER_TAP, snap: cycleSheetSnap(snap) }
}
