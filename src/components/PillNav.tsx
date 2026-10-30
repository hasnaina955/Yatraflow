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
import { railOverflow } from '../lib/railOverflow'
import { gliderBox } from '../lib/pillGeometry'

export function PillNav({ activeKey, className, role = 'presentation', 'aria-label': ariaLabel, ink, children }: {
  activeKey: string
  className?: string
  /** the workspace tab bar keeps its tablist semantics; navs use 'navigation' */
  role?: 'presentation' | 'tablist' | 'group' | 'navigation'
  'aria-label'?: string
  /**
   * A second copy of the items, painted in the ink that reads ON the fill and
   * clipped to the fill's own box. Pass it when the fill is a different colour
   * from the rail behind it, so one ink cannot serve both surfaces.
   *
   * The copies are decoration: they carry no key, no handler and no semantics.
   * The real items keep the rail's ink at all times, so the label is legible
   * before the fill arrives, after it leaves, and under its leading edge.
   */
  ink?: ReactNode
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const gliderRef = useRef<HTMLSpanElement>(null)
  const inkWinRef = useRef<HTMLSpanElement>(null)
  const inkRowRef = useRef<HTMLSpanElement>(null)
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
    const inkWin = inkWinRef.current
    const inkRow = inkRowRef.current

    /**
     * The ink copies are laid out in the SAME flex row as the real items, so a
     * copy's own offset inside that row is identical to its item's. That is what
     * makes the mechanism exact: the row is offset by `origin - fill`, so a copy
     * lands at `origin + ownOffset` — its item's position — whatever the fill's
     * box is now. Only the clip window moves; the glyphs never do.
     *
     * `origin` is the first item's position, not the wrap's content origin: the
     * wrap may carry padding (the workspace rail carries `--space-3`), and the
     * row has to start where the items do.
     */
    const inkOrigin = { x: 0, y: 0 }
    const syncInkOrigin = () => {
      const first = wrap.querySelector<HTMLElement>('[data-pill-key]')
      if (!first) return
      const box = wrap.getBoundingClientRect()
      const item = first.getBoundingClientRect()
      inkOrigin.x = item.left - box.left + wrap.scrollLeft - wrap.clientLeft
      inkOrigin.y = item.top - box.top + wrap.scrollTop - wrap.clientTop
    }

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
      // The glider follows the active item's border box, with no paint inset.
      // An inset here used to be a hardcoded `+4` / `-8`, invented for one
      // control shape and then applied to all fifteen: a 44px item got a 36px
      // fill, and inside the workspace rail (6px padding, 1px border) the fill
      // sat 11px in where the source has 7 — flat instead of concentric.
      // A nested capsule is concentric when its inset is the rail's padding
      // plus border, and the rail already carries both. See lib/pillGeometry.ts.
      const { x, y, w, h } = gliderBox(item, {
        left: box.left,
        top: box.top,
        scrollLeft: wrap.scrollLeft,
        scrollTop: wrap.scrollTop,
        clientLeft: wrap.clientLeft,
        clientTop: wrap.clientTop,
      })

      const prev = prevRef.current
      // A re-measure that found the same box has nothing to correct, and acting
      // on it would be worse than ignoring it: ResizeObserver fires once on
      // observe(), so an unguarded re-place here would animate a correction that
      // nobody asked for.
      if (!animate && prev && prev.x === x && prev.y === y && prev.w === w && prev.h === h) return

      // The glide animates the glider's own BOX - left/top/width/height together -
      // and NOT a transform. Resizing a rounded pill with `scaleX` stretches its
      // ends into ellipses; at a 76px -> 146px tab change that is a scaleX of
      // 1.93, and it read as the animation breaking rather than the pill gliding.
      // It is also not the layout cost it looks like: the glider is absolutely
      // positioned, so its own box cannot reflow its siblings - the work is this
      // one element's layout and paint, which is why the original animation was
      // cheap all along.
      // A non-glide write (first paint, or a correction) suppresses the
      // transition so it places instantly instead of animating into position.
      const canAnimate = animate && !!prev
      if (!canAnimate) glider.style.transition = 'none'
      glider.style.left = `${x}px`
      glider.style.top = `${y}px`
      glider.style.width = `${w}px`
      glider.style.height = `${h}px`
      if (!canAnimate) {
        void glider.offsetWidth       // commit the placement before handing the curve back
        glider.style.transition = ''
      }

      // The ink WINDOW is the fill's box — the same four numbers, written in the
      // same pass — and the copy row inside it is offset by `origin - fill`, so
      // each copy lands on its own item. Only the window moves; the glyphs never
      // do. Both elements carry the same transition declaration, so the two
      // values are read on the same clock: two independently-timed elements were
      // measured 7.5px out of step on a 60ms reversal, which is exactly the
      // half-covered label this exists to avoid.
      if (inkWin && inkRow) {
        if (!canAnimate) { inkWin.style.transition = 'none'; inkRow.style.transition = 'none' }
        inkWin.style.left = `${x}px`
        inkWin.style.top = `${y}px`
        inkWin.style.width = `${w}px`
        inkWin.style.height = `${h}px`
        inkRow.style.left = `${inkOrigin.x - x}px`
        inkRow.style.top = `${inkOrigin.y - y}px`
        if (!canAnimate) {
          void inkWin.offsetWidth
          inkWin.style.transition = ''
          inkRow.style.transition = ''
        }
      }

      prevRef.current = { x, y, w, h }
    }

    // The rail can overflow at phone width, and it hides its scrollbar. So the
    // rail's own scroll position is published for CSS to paint the edge fade on
    // a side that still holds hidden tabs. `.tabbar[data-overflow]` reads it.
    const syncOverflow = () => {
      const state = railOverflow(wrap.scrollLeft, wrap.scrollWidth, wrap.clientWidth)
      if (wrap.dataset.overflow !== state) wrap.dataset.overflow = state
    }

    // Only a change of activeKey glides; the first paint and every later
    // re-measure snap.
    syncInkOrigin()
    const keyChanged = lastKeyRef.current !== activeKey
    place(!firstRunRef.current && keyChanged)
    syncOverflow()
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
    const remeasure = () => { syncInkOrigin(); place(false); syncOverflow() }
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure)
    ro?.observe(wrap)
    document.fonts?.ready.then(() => { if (live) remeasure() }).catch(() => {})
    window.addEventListener('resize', remeasure)
    // A sideways swipe is the common case, and it is the only one a resize
    // observer cannot see. The listener is passive: it never blocks the swipe.
    wrap.addEventListener('scroll', syncOverflow, { passive: true })
    return () => {
      live = false
      ro?.disconnect()
      window.removeEventListener('resize', remeasure)
      wrap.removeEventListener('scroll', syncOverflow)
    }
  }, [activeKey, children])

  return (
    <div ref={wrapRef} className={`pill-nav ${className ?? ''}`} role={role} aria-label={ariaLabel}>
      <span ref={gliderRef} className="pill-glider" aria-hidden />
      {ink
        ? <span ref={inkWinRef} className="pill-ink" aria-hidden>
            <span ref={inkRowRef} className="pill-ink-row">{ink}</span>
          </span>
        : null}
      {children}
    </div>
  )
}
