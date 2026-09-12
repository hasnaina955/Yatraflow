// ============ Pointer drag engine (mouse + touch + pen) ============
// The reorder drag runs entirely on pointer events — HTML5 drag-and-drop is
// gone. The browser's native drag ghost is a static bitmap owned by the OS
// drag loop: it cannot follow the finger frame-by-frame, and dragover fires
// throttled, so no amount of polish on top of it reaches the fluidity of a
// pointer-driven carry. Pointer events hand us every move event, and with it
// the three mechanics a normal reorderable list does not have:
//
// 1 · free, and not fenced. The carried row goes wherever the finger goes —
//     position is pinned to the pointer and NEVER eases. Only the reading is
//     clamped: the carried CARD's CENTRE is read against the rows' stable
//     layout (never the pointer against transformed boxes — the gliding rows
//     would chase the zones), and the owner list opens its gap at the result
//     (rows glide via their own transitions).
// 2 · the warp. The carried row stretches along whichever axis is moving and
//     thins the other, then leans the way it is being thrown. Deformation
//     lives on the row's SKIN (the card inside the row) and eases back the
//     moment the finger stops — position and deformation cannot share one
//     transform, because one must never ease while the other must always.
// 3 · the 90 ms calm timeout. No event arrives once the finger stops, so the
//     warp would stay stuck at whatever it last was; a timer flattens it.
//
// Touch keeps its long-press gate (press & hold ~350ms, <12px movement);
// mouse drags start after a small straight-line movement (8px) — no timer,
// a mouse user is never waiting for a hold. React-free singleton by design:
// the engine lives across renders and routes events to whichever list
// instance is under the finger; React integrates via the instance callbacks
// registered by useReorder.

import { haptic } from './haptics'
import { prefersReducedMotion } from './motion'

export const LONG_PRESS_MS = 350
export const MOVE_CANCEL_PX = 12
/** mouse drags start after this much straight-line movement */
export const MOUSE_START_PX = 8
/** viewport edge zones that auto-scroll while dragging */
export const EDGE_ZONE_PX = 90
export const EDGE_SCROLL_SPEED = 14
/** ms without a move event before the warp eases back to rest */
export const WARP_CALM_MS = 90

/** Stable drop-target key rendered into the DOM: "<instanceId>:<index>". */
export function encodeDropKey(instanceId: string, index: number): string {
  return `${instanceId}:${index}`
}

export function parseDropKey(key: string | null | undefined): { instanceId: string; index: number } | null {
  if (!key) return null
  const i = key.lastIndexOf(':')
  if (i <= 0) return null
  const index = Number(key.slice(i + 1))
  if (!Number.isFinite(index) || index < 0) return null
  return { instanceId: key.slice(0, i), index }
}

/** A long press activates only when held long enough AND held still. */
export function longPressActivated(elapsedMs: number, movedPx: number): boolean {
  return elapsedMs >= LONG_PRESS_MS && movedPx <= MOVE_CANCEL_PX
}

export function movedPx(startX: number, startY: number, x: number, y: number): number {
  return Math.hypot(x - startX, y - startY)
}

/** Scroll speed near viewport edges while dragging (0 when away from edges). */
export function edgeScrollDelta(y: number, viewportH: number, zone = EDGE_ZONE_PX, speed = EDGE_SCROLL_SPEED): number {
  if (y < zone) return -Math.round(speed * (1 - y / zone))
  const fromBottom = viewportH - y
  if (fromBottom < zone) return Math.round(speed * (1 - fromBottom / zone))
  return 0
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Live glide offset (px) for sibling row `index` while a drag holds row
 * `dragging` open at insertion slot `insertIdx`: the rows BETWEEN the carried
 * slot and the target slide TOWARD the carried row's origin, closing the
 * vacated slot so the gap reopens under the cursor. Dragging down → the rows
 * in between slide UP (−pitch); dragging up → they slide DOWN (+pitch).
 * `pitch` is one row pitch (row height + its gap). Pure — pinned by tests.
 */
export function glideOffsetPx(dragging: number, insertIdx: number, index: number, pitch: number): number | null {
  if (insertIdx === dragging || index === dragging) return null
  if (insertIdx > dragging) return index > dragging && index < insertIdx ? -pitch : null
  return index >= insertIdx && index < dragging ? pitch : null
}

/**
 * Insertion index for a carried row whose centre sits at `centreY`, given the
 * rows' STABLE layout boxes (viewport coords, DOM order, dragged row
 * included). Rows are variable height, so each row's OWN midpoint is the
 * boundary — the trigger scales with the card. `hysteresis` (0..1) pushes
 * every boundary down by that fraction of the row's height so the index
 * cannot flip on jitter around a midpoint (ship at 0; tune only if the
 * baseline feels twitchy).
 *
 * Returns a full-list index (dragged slot included), matching useReorder's
 * `insertIdx` semantics: k counts passed rows in the reduced list; the
 * full-list index is `k >= dragging ? k + 1 : k`. At rest (centre on the
 * dragged row's own midpoint) this yields dragging + 1, and both
 * glideOffsetPx(dragging, dragging + 1, …) and the owner's commit math are
 * provable no-ops there — correct. Pure — pinned by tests.
 */
export function insertionIndexFor(
  boxes: { top: number; height: number }[],
  centreY: number,
  dragging: number,
  hysteresis = 0,
): number {
  let k = 0
  for (let i = 0; i < boxes.length; i++) {
    if (i === dragging) continue
    const b = boxes[i]
    if (centreY > b.top + b.height / 2 + b.height * hysteresis) k++
  }
  return k >= dragging ? k + 1 : k
}

/**
 * STABLE layout boxes for a list's rows: viewport tops that the glide
 * transforms do NOT move (getBoundingClientRect rides the translations, and
 * reading it here would make the drop zones chase themselves mid-glide).
 * The root must be the rows' offsetParent (position: relative, no border);
 * a scrollable root contributes its scrollTop. Pure layout read, no DOM
 * writes — safe to call every pointer frame.
 */
export function rowLayoutBoxes(root: HTMLElement, rows: HTMLElement[]): { top: number; height: number }[] {
  const boxTop = root.getBoundingClientRect().top - root.scrollTop
  return rows.map(el => ({ top: boxTop + el.offsetTop, height: el.offsetHeight }))
}

/**
 * The warp state for a pointer velocity (px per ms), the bencho numbers:
 * stretch toward the movement (capped at .26), thin the other axis by .55 of
 * that, and lean (deg) into the horizontal throw — signed, so a flick back
 * rights the row. Zero velocity = perfectly at rest.
 */
export function warpFor(vx: number, vy: number): { x: number; y: number; tilt: number } {
  return {
    x: clamp(Math.abs(vx) / 2.6, 0, 0.26),
    y: clamp(Math.abs(vy) / 2.6, 0, 0.26),
    tilt: clamp(vx * 2.6, -7, 7),
  }
}

/** Interactive elements a press-and-hold must never hijack. */
export function isInteractiveTarget(el: Element | null): boolean {
  return !!el?.closest?.('button, a, input, select, textarea, [contenteditable="true"], [data-no-touch-drag]')
}

type Instance = {
  /** the source row visually enters "dragging" state */
  onOwnDragStart(idx: number): void
  /** a row/gap in this list is (or is no longer, null) the hover target.
      x is the pointer position; y is the CARRIED CARD's centre (viewport) —
      the owner reads its insertion slot from that against stable layout
      (insertionIndexFor), never from the pointer against live boxes. */
  onDragOver(idx: number | null, foreign: boolean, x: number, y: number): void
  onDropOnSelf(fromIdx: number, toIdx: number): void
  onForeignDrop(payload: string, toIdx: number): void
  onDragEnd(): void
}

const instances = new Map<string, Instance>()
export function registerTouchDnd(id: string, inst: Instance): () => void {
  instances.set(id, inst)
  return () => { if (instances.get(id) === inst) instances.delete(id) }
}

type Active = {
  srcId: string
  srcIdx: number
  payload: string
  target: { id: string; index: number } | null
  element: HTMLElement
  lastX: number
  lastY: number
  /** pointer timestamp of the previous move event (velocity denominator) */
  lastT: number
  raf: number
  calmTimer: number
  /** the row's in-flow viewport position at activation, and the scroll offset
      then — follow = finger − grab offset − (origin top − scroll drift) */
  originLeft: number
  originTop: number
  scrollY0: number
  grabDX: number
  grabDY: number
  /** carried-centre Y at the last onDragOver send — dedupe key for the
      continuous own-list reading (NaN = never sent, so the first hover fires) */
  hoverY: number
}

type Pending = {
  srcId: string
  srcIdx: number
  payload: string
  element: HTMLElement
  startX: number
  startY: number
  pointerType: string
  /** mouse: no hold timer — activation happens on MOUSE_START_PX of movement */
  immediate: boolean
  timer: number
}

let active: Active | null = null
/** viewport rect of the carried row captured at release, consumed by the
    owner's FLIP settle so the row springs from where it was carried */
let carryRect: { x: number; y: number } | null = null
let pending: Pending | null = null
let bound = false

function cleanupBinding() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('contextmenu', onContextMenu, true)
  window.removeEventListener('blur', onBlur)
  bound = false
}

function clearPress() {
  if (pending?.timer) window.clearTimeout(pending.timer)
  pending?.element.classList.remove('yf-pressing')
  pending = null
}

function onTouchMove(e: TouchEvent) {
  // Only while a drag is active — scrolling must keep working otherwise.
  if (active) e.preventDefault()
}

function onContextMenu(e: MouseEvent) {
  if (pending || active) e.preventDefault()
}

function onBlur() {
  // focus left the window mid-drag (alt-tab, devtools): end it like a cancel
  if (pending) { clearPress(); cleanupBinding(); return }
  if (active) finish(false)
}

/** Set --carry-x/--carry-y so the row sits exactly under the finger. Runs on
    every pointer event AND every rAF (window autoscroll moves the origin). */
function updateCarry() {
  if (!active) return
  const x = active.lastX - active.grabDX - active.originLeft
  const y = active.lastY - active.grabDY - (active.originTop - (window.scrollY - active.scrollY0))
  const el = active.element.style
  el.setProperty('--carry-x', `${(Math.round(x * 10) / 10).toFixed(1)}px`)
  el.setProperty('--carry-y', `${(Math.round(y * 10) / 10).toFixed(1)}px`)
}

/** Feed the pointer velocity into the skin's warp vars; the 90ms calm timer
    flattens them once the finger stops (no move event announces that). */
function updateWarp(x: number, y: number, t: number) {
  if (!active || prefersReducedMotion()) return
  const dt = t - active.lastT
  if (dt <= 0) return
  const w = warpFor((x - active.lastX) / dt, (y - active.lastY) / dt)
  const el = active.element.style
  el.setProperty('--warp-x', w.x.toFixed(3))
  el.setProperty('--warp-y', w.y.toFixed(3))
  el.setProperty('--warp-tilt', w.tilt.toFixed(2))
  window.clearTimeout(active.calmTimer)
  active.calmTimer = window.setTimeout(() => {
    if (!active) return
    const s = active.element.style
    s.setProperty('--warp-x', '0')
    s.setProperty('--warp-y', '0')
    s.setProperty('--warp-tilt', '0')
  }, WARP_CALM_MS)
}

function hitTest(x: number, y: number) {
  if (!active) return
  // The reading tracks the CARRIED CARD's centre, not the pointer: the user
  // aims the card, and where in the card they grabbed it (grabDY) must not
  // shift when the insertion flips. lastY − grabDY is the carried row's
  // exact viewport top (the carry pin), so this is true under all scroll.
  const centreY = active.lastY - active.grabDY + active.element.offsetHeight / 2
  const el = document.elementFromPoint(x, y)
  // the carried row is pointer-events:none, so elementFromPoint sees through it
  const dropEl = el?.closest('[data-yf-drop]')
  const gapEl = el?.closest('[data-yf-gap]')
  const parsed = parseDropKey(dropEl?.getAttribute('data-yf-drop') ?? gapEl?.getAttribute('data-yf-gap'))
  let next = parsed ? { id: parsed.instanceId, index: parsed.index } : null
  if (!next) {
    // Dead bands (the 8px row margins, whitespace inside the list): no row or
    // gap matched, but the list root still names its instance — keep the
    // SOURCE list's reading alive so the hole never freezes. Foreign gaps
    // need a real row index, so they stay strict. The index here is a
    // placeholder: own-list owners read their slot from the centre instead.
    const listId = el?.closest('[data-yf-list]')?.getAttribute('data-yf-list')
    if (listId === active.srcId) {
      next = { id: active.srcId, index: active.target?.id === active.srcId ? active.target.index : active.srcIdx }
    }
  }
  // The own-list reading is continuous in centreY (the owner flips slots
  // mid-row), so re-fire whenever it moves — even with the hovered row
  // unchanged. Only a byte-identical repeat of both is skipped.
  if (next && next.id === active.target?.id && next.index === active.target?.index && centreY === active.hoverY) return
  if (active.target) instances.get(active.target.id)?.onDragOver(null, active.target.id !== active.srcId, x, y)
  active.target = next
  active.hoverY = centreY
  if (next) instances.get(next.id)?.onDragOver(next.index, next.id !== active.srcId, x, centreY)
}

function frame() {
  if (!active) return
  const delta = edgeScrollDelta(active.lastY, window.innerHeight)
  if (delta !== 0) {
    window.scrollBy(0, delta)
    active.lastY += delta
  }
  updateCarry()
  hitTest(active.lastX, active.lastY)
  active.raf = window.requestAnimationFrame(frame)
}

function activate() {
  if (!pending) return
  const { srcId, srcIdx, payload, element, startX, startY } = pending
  element.classList.remove('yf-pressing')
  const rect = element.getBoundingClientRect()
  active = {
    srcId, srcIdx, payload,
    target: null,
    element,
    lastX: startX, lastY: startY, lastT: performance.now(),
    raf: 0, calmTimer: 0,
    originLeft: rect.left, originTop: rect.top, scrollY0: window.scrollY,
    grabDX: startX - rect.left, grabDY: startY - rect.top,
    hoverY: NaN,
  }
  pending = null
  // Drag-pickup buzz — the strongest feedback in the app (Android reorder
  // patterns do the same). Plugin-backed inside the app, vibrate on the web.
  haptic('heavy')
  element.classList.add('is-carried')
  updateCarry()
  instances.get(srcId)?.onOwnDragStart(srcIdx)
  active.raf = window.requestAnimationFrame(frame)
  hitTest(active.lastX, active.lastY)
}

/** Spring the row home after a release that changed nothing in the owner
    list (released on its own slot, or cancelled). Real commits settle via
    the owner's FLIP pass instead, starting from consumeCarryRect(). */
function springBack(cur: Active, carriedRect: { left: number; top: number }) {
  const dx = carriedRect.left - cur.originLeft
  const dy = carriedRect.top - (cur.originTop - (window.scrollY - cur.scrollY0))
  if (!prefersReducedMotion() && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
    cur.element.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: 240, easing: 'cubic-bezier(.22, .61, .36, 1)' },
    )
  }
}

function finish(drop: boolean) {
  const cur = active
  if (!cur) { clearPress(); return }
  // The carried rect must be read while the carry transform is still on —
  // the owner's FLIP springs the row from here to its new slot.
  const r = cur.element.getBoundingClientRect()
  carryRect = { x: r.left, y: r.top }
  active = null
  window.cancelAnimationFrame(cur.raf)
  window.clearTimeout(cur.calmTimer)
  // Strip the carry visuals BEFORE the owner's React commit flushes: the row
  // is back in flow, so post-commit rects are true slots. Same task, so no
  // frame paints in between — the FLIP's first keyframe is what renders.
  cur.element.classList.remove('is-carried')
  const s = cur.element.style
  s.removeProperty('--carry-x'); s.removeProperty('--carry-y')
  s.removeProperty('--warp-x'); s.removeProperty('--warp-y'); s.removeProperty('--warp-tilt')
  const srcInst = instances.get(cur.srcId)
  let changed = false
  if (drop && cur.target) {
    if (cur.target.id === cur.srcId) {
      if (cur.target.index !== cur.srcIdx) { srcInst?.onDropOnSelf(cur.srcIdx, cur.target.index); changed = true }
    } else {
      instances.get(cur.target.id)?.onForeignDrop(cur.payload, cur.target.index)
      changed = true
    }
  }
  if (cur.target) instances.get(cur.target.id)?.onDragOver(null, cur.target.id !== cur.srcId, cur.lastX, cur.lastY)
  srcInst?.onDragEnd()
  if (!changed) {
    // nothing consumed the rect (released on its own slot / cancelled) — the
    // row springs home here, and the rect must not leak to a later FLIP pass
    carryRect = null
    springBack(cur, r)
  }
  // swallow the click that follows finger-lift so no button underneath fires
  window.addEventListener('click', e => { e.preventDefault(); e.stopPropagation() }, { capture: true, once: true })
  cleanupBinding()
}

/** The carried-row rect captured at release (viewport coords), if any. */
export function consumeCarryRect(): { x: number; y: number } | null {
  const r = carryRect
  carryRect = null
  return r
}

function onMove(e: PointerEvent) {
  if (pending) {
    if (pending.immediate) {
      if (movedPx(pending.startX, pending.startY, e.clientX, e.clientY) > MOUSE_START_PX) activate()
      return
    }
    if (movedPx(pending.startX, pending.startY, e.clientX, e.clientY) > MOVE_CANCEL_PX) clearPress()
    return
  }
  if (!active) return
  updateWarp(e.clientX, e.clientY, e.timeStamp)
  active.lastX = e.clientX
  active.lastY = e.clientY
  active.lastT = e.timeStamp
  updateCarry()
}

function onUp() {
  if (pending) { clearPress(); cleanupBinding(); return }
  if (active) finish(true)
}

function onCancel() {
  if (pending) { clearPress(); cleanupBinding(); return }
  if (active) finish(false)
}

/** Begin tracking a potential drag on a row. Safe no-op while busy. Mouse
    presses become drags after MOUSE_START_PX of movement; touch/pen presses
    use the long-press gate. */
export function touchPressStart(opts: {
  instanceId: string
  idx: number
  payload: string
  element: HTMLElement
  x: number
  y: number
  pointerType?: string
}): void {
  if (pending || active) return
  clearPress()
  const immediate = opts.pointerType === 'mouse'
  pending = {
    srcId: opts.instanceId,
    srcIdx: opts.idx,
    payload: opts.payload,
    element: opts.element,
    startX: opts.x,
    startY: opts.y,
    pointerType: opts.pointerType ?? 'touch',
    immediate,
    timer: 0,
  }
  if (!immediate) {
    opts.element.classList.add('yf-pressing')
    pending.timer = window.setTimeout(activate, LONG_PRESS_MS)
  }
  if (!bound) {
    bound = true
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('contextmenu', onContextMenu, true)
    window.addEventListener('blur', onBlur)
  }
}

/** Force-end any press/drag (e.g. unmount of the owning list). */
export function touchPressAbort(): void {
  if (pending) { clearPress(); cleanupBinding(); return }
  if (active) finish(false)
}
