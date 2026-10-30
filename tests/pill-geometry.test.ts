// The shared PillNav geometry rule, checked against real control shapes.
//
// This exists because the rule it replaced was invisible to every gate. A
// hardcoded `+4` top and `-8` height were applied to all fifteen PillNav
// callsites, so a 44px item got a 36px fill and the workspace rail's active
// pill sat 11px inside a 58px capsule instead of 7 — flat where the source is
// concentric. The browser showed it; nothing in the suite could.
//
// So the assertions below fail the OLD arithmetic at the actual active box and
// at several control shapes, not just at one. They run on the pure seam
// (lib/pillGeometry.ts) because that is what the component measures with.
//
// Two coordinate spaces appear below and the difference matters:
//   - the glider's own box resolves in the rail's PADDING box, which is what
//     `gliderBox` returns;
//   - the visible spacing is measured from the rail's BORDER box, which is one
//     border-width further out.
// A nested capsule is concentric when that border-box inset is the same above
// and below the fill. `borderBoxInset` below converts, so each assertion can
// name the space it means.
import { describe, expect, it } from 'vitest'
import { gliderBox } from '../src/lib/pillGeometry'

const RAIL_LEFT = 100
const RAIL_TOP = 200

/** A rail at (100, 200); its padding box starts one border inside. */
function rail(border: number, scrollLeft = 0) {
  return { left: RAIL_LEFT, top: RAIL_TOP, scrollLeft, scrollTop: 0, clientLeft: border, clientTop: border }
}

/** An item laid out inset from the rail's border box by padding + border. */
function item(padding: number, border: number, height: number, width = 93.2) {
  const inset = padding + border
  return { left: RAIL_LEFT + inset, top: RAIL_TOP + inset, width, height }
}

/** The gap between the rail's border box and the fill, i.e. what the eye sees. */
function borderBoxInset(padding: number, border: number) {
  return padding + border
}

describe('the glider follows the active item border box', () => {
  it('fills the active item exactly — the old +4 / -8 would fail here', () => {
    const box = gliderBox(item(6, 1, 44), rail(1))
    expect(box.h).toBe(44)
    // The padding-box offset of an item inset by 7 is 6, and the visible gap
    // is that plus the border.
    expect(box.y).toBe(6)
    expect(borderBoxInset(6, 1)).toBe(7)
    // The regression, stated as arithmetic: the old code wrote these instead.
    expect(box.h, 'the glider must not shrink 8px off the item height').not.toBe(36)
    expect(borderBoxInset(6, 1), 'the old fill sat 11px in, not 7').not.toBe(11)
  })

  it('keeps the rail concentric: inset is padding + border, at every shape', () => {
    // The three real control shapes: the workspace tab rail, the filter
    // pillbar, and the mode/view pillbar. Each is a capsule nested in a
    // capsule, so the visible spacing is the rail's padding plus its border.
    const shapes = [
      { name: 'workspace tab rail', padding: 6, border: 1, itemH: 44, railH: 58 },
      { name: 'filter pillbar', padding: 4, border: 1, itemH: 26, railH: 36 },
      { name: 'mode pillbar', padding: 4, border: 1, itemH: 36, railH: 46 },
    ]
    for (const shape of shapes) {
      const box = gliderBox(item(shape.padding, shape.border, shape.itemH), rail(shape.border))
      const inset = borderBoxInset(shape.padding, shape.border)
      expect(box.h, `${shape.name}: the fill is the item height`).toBe(shape.itemH)
      // Concentric means the same gap above and below the fill, measured from
      // the rail's border box: the border sits outside the padding box the
      // fill is placed in, so it counts on both sides.
      const topGap = shape.border + box.y
      const bottomGap = shape.railH - shape.border - box.y - box.h
      expect(topGap, `${shape.name}: top gap is padding + border`).toBe(inset)
      expect(bottomGap, `${shape.name}: the capsule is concentric`).toBe(inset)
    }
  })

  it('never reintroduces a vertical paint inset as a fraction of the item', () => {
    // A proportional inset is the same bug wearing a formula: it would look
    // right at one height and wrong at every other.
    for (const h of [24, 26, 32, 36, 44, 52, 60]) {
      const box = gliderBox(item(6, 1, h), rail(1))
      expect(box.h, `a ${h}px item must fill ${h}px`).toBe(h)
    }
  })

  it('follows the item horizontally at fractional geometry', () => {
    // flex and text layout are fractional; offsetLeft/offsetWidth would round.
    const box = gliderBox(item(6, 1, 44, 93.25), rail(1))
    expect(box.x, 'the fill starts at the padding box, one padding in').toBe(6)
    expect(box.w, 'a fractional width must survive unrounded').toBe(93.25)
  })

  it('adds the rail scroll back, so a scrolled rail does not drag the glider', () => {
    const scrolled = gliderBox(item(6, 1, 44), rail(1, 120))
    const still = gliderBox(item(6, 1, 44), rail(1, 0))
    expect(scrolled.x - still.x).toBe(120)
    expect(scrolled.y, 'a sideways scroll must not move the fill vertically').toBe(still.y)
  })

  it('drops the rail border, because the padding box starts inside it', () => {
    // An item at the padding box origin of a bordered rail resolves to 0 in
    // padding-box space: the border offset is subtracted, not added, or the
    // fill would sit one border-width too far in.
    const atOrigin = gliderBox({ left: RAIL_LEFT + 1, top: RAIL_TOP + 1, width: 80, height: 44 }, rail(1))
    expect(atOrigin.x).toBe(0)
    expect(atOrigin.y).toBe(0)
  })

  it('tracks a wrapped row, so a second-line pill is placed on its own line', () => {
    const first = gliderBox(item(4, 1, 36), rail(1))
    // A second row sits one row-height plus the gap below the first.
    const secondTop = RAIL_TOP + 1 + 4 + 36 + 8
    const secondLine = gliderBox({ left: RAIL_LEFT + 5, top: secondTop, width: 80, height: 36 }, rail(1))
    expect(secondLine.y - first.y, 'a wrapped pill must not be placed on the first row').toBe(44)
    expect(secondLine.h, 'and must still fill its own height').toBe(36)
  })
})
