// ============ PillNav glider geometry ============
// The glider is the visible capsule that slides behind the active pill. Its
// geometry is ONE rule: it follows the active item's border box exactly. The
// rail's own padding and border are what space it from the rail's edge, so a
// nested capsule stays concentric without any per-callsite numbers.
//
// That rule replaced a hardcoded `+4` top and `-8` height. Those numbers were
// a paint inset invented for one control shape, but they were applied to every
// PillNav: a 44px item got a 36px glider, and inside the workspace rail
// (6px padding, 1px border, 58px outer) the fill sat 11px in where the source
// has 7. The symptom is a flat, off-centre pill rather than a concentric one.
//
// The distinction that matters: a capsule nested inside a capsule is
// concentric when `outerRadius === innerRadius + inset`. With a pill radius
// (999px) the radius is whatever the box allows, so the only thing to control
// is the inset — and the rail already carries it as padding + border. Adding
// an inset in the measurement double-counts it.
//
// This module is pure so the rule can be checked against real box shapes
// without a browser: no DOM, no measurement, no rounding.

export type ItemBox = {
  left: number
  top: number
  width: number
  height: number
}

/** The rail: its viewport rect plus the scroll and border a rect difference needs. */
export type WrapBox = {
  left: number
  top: number
  scrollLeft: number
  scrollTop: number
  clientLeft: number
  clientTop: number
}

export type GliderBox = { x: number; y: number; w: number; h: number }

/**
 * The glider's box in the rail's padding-box space.
 *
 * A rect difference is a VIEWPORT delta, while the glider's own box resolves
 * against the rail's padding box. So the conversion adds back the scroller's
 * scroll offset (a sideways-scrolling rail would otherwise drag the glider
 * with it) and drops the rail's border, which the padding box starts inside.
 *
 * No inset is applied. The active item's border box IS the visible capsule;
 * the rail's padding and border are what place it.
 */
export function gliderBox(item: ItemBox, wrap: WrapBox): GliderBox {
  return {
    x: item.left - wrap.left + wrap.scrollLeft - wrap.clientLeft,
    y: item.top - wrap.top + wrap.scrollTop - wrap.clientTop,
    w: item.width,
    h: item.height,
  }
}
