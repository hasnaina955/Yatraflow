// ============ Rail overflow — the scroll state of a horizontal pill rail ============
// The workspace tab rail scrolls sideways at phone width. It hides its
// scrollbar. CSS cannot read a scroll position, so PillNav publishes this state
// instead. The `.tabbar[data-overflow]` rules in styles.css paint the edge fade.
//
// 'none'   the rail fits; nothing is hidden
// 'start'  the rail sits at its left edge; tabs hide past the right edge
// 'middle' the rail sits between the edges; tabs hide on both sides
// 'end'    the rail sits at its right edge; tabs hide past the left edge

export type RailOverflow = 'none' | 'start' | 'middle' | 'end'

/** A scroll offset this close to an edge counts as that edge. */
const EDGE_EPSILON = 1

/**
 * The rail's edge fades, in px. `13-phone-polish-and-guided-create.css` paints
 * 20px at the start and 28px at the end. A reveal clears them, or the active
 * tab shows up half faded.
 */
const FADE_START = 20
const FADE_END = 28

export function railOverflow(scrollLeft: number, scrollWidth: number, clientWidth: number): RailOverflow {
  const max = scrollWidth - clientWidth
  if (max <= EDGE_EPSILON) return 'none'
  if (scrollLeft <= EDGE_EPSILON) return 'start'
  if (scrollLeft >= max - EDGE_EPSILON) return 'end'
  return 'middle'
}

/**
 * The scroll offset that puts one item inside a horizontal rail. Coordinates
 * are content-box offsets from the rail's scroll origin. A rail that already
 * shows the item keeps its current position.
 */
export function railScrollToReveal(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  itemLeft: number,
  itemRight: number,
): number {
  const max = Math.max(0, scrollWidth - clientWidth)
  const current = Math.max(0, Math.min(max, scrollLeft))
  if (max <= EDGE_EPSILON) return current
  if (itemLeft < current + FADE_START) {
    return Math.max(0, Math.min(max, Math.floor(itemLeft - FADE_START)))
  }
  if (itemRight > current + clientWidth - FADE_END) {
    return Math.max(0, Math.min(max, Math.ceil(itemRight - clientWidth + FADE_END)))
  }
  return current
}
