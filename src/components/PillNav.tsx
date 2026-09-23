// ============ PillNav — pill navs with a sliding active indicator ============
// One mechanic for every pill nav (top nav, workspace tab bar): an absolutely
// positioned "glider" pill slides behind the active item instead of each item
// painting its own background, so switching reads as one continuous motion.
// The glider is measured from the active item, re-measured when the row
// reflows or the webfont swaps in, and skips its transition on first paint so
// pages don't animate on load.
//
// The glide is a FLIP — the same technique the drag settle uses: the target
// box's width/height are WRITTEN to the element and never transitioned, while
// the visible motion is a transform from the previous box (translate to the old
// origin, scaled by oldWidth/newWidth, settling at scaleX(1)). Transitioning
// left/width/top/height instead relaid out the nav on every tab change, which
// is what docs/MOTION-TOKENS.md's "thumb `transform` slide" row described all
// along — the code now matches the catalog.
import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function PillNav({ activeKey, className, role = 'presentation', 'aria-label': ariaLabel, children }: {
  activeKey: string
  className?: string
  /** the workspace tab bar keeps its tablist semantics; navs use 'navigation' */
  role?: 'presentation' | 'tablist' | 'group' | 'navigation'
  'aria-label'?: string
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const gliderRef = useRef<HTMLSpanElement>(null)
  /** The last placed box, in the wrap's padding-box space: the FLIP's frame 1.
      A ref, not state — it is read and written during layout, and none of it
      should cost a render. */
  const prevRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  /** Distinguishes "the active key changed" (glide) from every other re-measure
      (snap) — the two arrive through the same effect. */
  const firstRunRef = useRef(true)
  const lastKeyRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const glider = gliderRef.current
    if (!wrap || !glider) return

    const place = (animate: boolean) => {
      const el = wrap.querySelector<HTMLElement>(`[data-pill-key="${CSS.escape(activeKey)}"]`)
      if (!el) { glider.style.opacity = '0'; return }
      glider.style.opacity = '1'
      // getBoundingClientRect rather than offsetLeft/offsetWidth: those round to
      // whole pixels while flex and text layout are fractional, which leaves a
      // sub-pixel sliver at the pill's edge on fractional-DPR and zoomed
      // viewports.
      //
      // A rect difference is a VIEWPORT delta, but the glider's own box is
      // resolved in the wrap's padding box. So the conversion has to add back
      // the scroller's scroll offset (a horizontally scrolling .tabbar would
      // otherwise drag the glider along with it) and drop the wrap's border,
      // since the padding box starts inside it.
      const box = wrap.getBoundingClientRect()
      const item = el.getBoundingClientRect()
      const x = item.left - box.left + wrap.scrollLeft - wrap.clientLeft
      const y = item.top - box.top + wrap.scrollTop - wrap.clientTop
      const w = item.width
      // track the row too, so wrapping pillbars glide correctly
      const h = item.height - 8

      const prev = prevRef.current
      // A re-measure that found the same box has nothing to correct, and acting
      // on it would be worse than ignoring it: ResizeObserver fires once on
      // observe(), so an unguarded re-place here would snap a glide that had
      // only just started.
      if (!animate && prev && prev.x === x && prev.y === y && prev.w === w && prev.h === h) return

      // Written, never transitioned — the glide is the transform below.
      glider.style.width = `${w}px`
      glider.style.height = `${h}px`

      const canGlide = animate && !!prev && prev.w > 0 && w > 0

      // Frame 1 (silent): the previous box expressed as a transform of the new
      // one. Frame 2: the target box at scale 1. Both writes land inside this
      // layout effect with a forced flush between them, so frame 2 is the only
      // one ever painted and the transition interpolates 1 -> 2 on the curve.
      glider.style.transition = 'none'
      glider.style.transform = canGlide && prev
        ? `translate3d(${prev.x}px, ${prev.y}px, 0) scaleX(${prev.w / w})`
        : `translate3d(${x}px, ${y}px, 0) scaleX(1)`
      void glider.offsetWidth          // commit frame 1 before releasing the curve
      glider.style.transition = ''     // hand back to .pill-glider's own transition
      if (canGlide) glider.style.transform = `translate3d(${x}px, ${y}px, 0) scaleX(1)`

      prevRef.current = { x, y, w, h }
    }

    // Only a change of activeKey glides; the first paint and every later
    // re-measure snap.
    const keyChanged = lastKeyRef.current !== activeKey
    place(!firstRunRef.current && keyChanged)
    firstRunRef.current = false
    lastKeyRef.current = activeKey

    // A pillbar can reflow with no viewport change — a wrapping filter bar, or
    // the active item gaining a count badge — so watch the box itself, and
    // re-measure once the webfont swaps in, because the first measurement can
    // run against fallback metrics. The font promise outlives this effect, so it
    // needs its own cancellation: without it a stale closure could write the
    // previous active key's geometry after the tab already changed.
    //
    // These are corrections, not switches, so they snap: gliding away from
    // wherever the row happened to be would read as a second, unasked-for
    // movement.
    let live = true
    const remeasure = () => place(false)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure)
    ro?.observe(wrap)
    document.fonts?.ready.then(() => { if (live) remeasure() }).catch(() => {})
    window.addEventListener('resize', remeasure)
    return () => {
      live = false
      ro?.disconnect()
      window.removeEventListener('resize', remeasure)
    }
  }, [activeKey, children])

  return (
    <div ref={wrapRef} className={`pill-nav ${className ?? ''}`} role={role} aria-label={ariaLabel}>
      <span ref={gliderRef} className="pill-glider" aria-hidden />
      {children}
    </div>
  )
}
