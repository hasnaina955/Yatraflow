// ============ touchDnd — pointer drag engine (pure helpers) ============
import { describe, it, expect } from 'vitest'
import {
  LONG_PRESS_MS, MOVE_CANCEL_PX, MOUSE_START_PX, EDGE_ZONE_PX, EDGE_SCROLL_SPEED, WARP_CALM_MS,
  encodeDropKey, parseDropKey, longPressActivated, movedPx,
  edgeScrollDelta, isInteractiveTarget, warpFor, glideOffsetPx, insertionIndexFor,
} from '../src/lib/touchDnd'

describe('drop keys', () => {
  it('encode → parse round-trips instance and index', () => {
    const key = encodeDropKey('yf-list-1', 3)
    expect(parseDropKey(key)).toEqual({ instanceId: 'yf-list-1', index: 3 })
  })

  it('instance ids containing colons survive (lastIndexOf split)', () => {
    const key = encodeDropKey(':r1:', 12)
    expect(parseDropKey(key)).toEqual({ instanceId: ':r1:', index: 12 })
  })

  it('rejects junk keys instead of throwing', () => {
    expect(parseDropKey(null)).toBe(null)
    expect(parseDropKey('')).toBe(null)
    expect(parseDropKey(':')).toBe(null)
    expect(parseDropKey('nocolon')).toBe(null)
    expect(parseDropKey('list:abc')).toBe(null)
    expect(parseDropKey('list:-1')).toBe(null)
  })
})

describe('long-press activation', () => {
  it('activates only after the hold time AND still fingers', () => {
    expect(longPressActivated(LONG_PRESS_MS, 0)).toBe(true)
    expect(longPressActivated(LONG_PRESS_MS + 500, 4)).toBe(true)
    expect(longPressActivated(LONG_PRESS_MS - 1, 0)).toBe(false)
  })

  it('a moved finger cancels even after a long hold (that was a scroll)', () => {
    expect(longPressActivated(LONG_PRESS_MS + 999, MOVE_CANCEL_PX + 1)).toBe(false)
    expect(longPressActivated(LONG_PRESS_MS + 999, MOVE_CANCEL_PX)).toBe(true)
  })
})

describe('movedPx', () => {
  it('measures euclidean distance', () => {
    expect(movedPx(0, 0, 3, 4)).toBe(5)
    expect(movedPx(10, 10, 10, 10)).toBe(0)
  })
})

describe('edgeScrollDelta', () => {
  const vh = 800
  it('returns 0 away from edges', () => {
    expect(edgeScrollDelta(400, vh)).toBe(0)
    expect(edgeScrollDelta(vh - EDGE_ZONE_PX - 1, vh)).toBe(0)
  })

  it('scrolls up near the top, faster the closer you are', () => {
    expect(edgeScrollDelta(0, vh)).toBeLessThan(0)
    expect(Math.abs(edgeScrollDelta(0, vh))).toBeGreaterThan(Math.abs(edgeScrollDelta(60, vh)))
  })

  it('scrolls down near the bottom', () => {
    expect(edgeScrollDelta(vh, vh)).toBeGreaterThan(0)
    expect(edgeScrollDelta(vh - 1, vh)).toBeGreaterThan(0)
  })

  it('never returns 0 inside a zone but respects speed cap', () => {
    const d = edgeScrollDelta(0, vh)
    expect(Math.abs(d)).toBeLessThanOrEqual(EDGE_SCROLL_SPEED)
  })
})

describe('isInteractiveTarget', () => {
  it('claims nothing when no DOM is present (node env) and never throws', () => {
    // engine must be importable and callable in non-DOM environments; the
    // interactive-target check itself is exercised in the browser
    expect(() => isInteractiveTarget(null)).not.toThrow()
    expect(isInteractiveTarget(null)).toBe(false)
  })
})

describe('warpFor (the velocity → deformation mapping)', () => {
  it('is perfectly at rest at zero velocity', () => {
    expect(warpFor(0, 0)).toEqual({ x: 0, y: 0, tilt: 0 })
  })

  it('stretches along the moving axis; the 0.55 thinning of the other axis lives in the skin transform', () => {
    // 1 px/ms downward = vy .385 → capped to .26; the skin scales
    // (1 - .26*.55, 1.26) from these raw values
    const w = warpFor(0, 1)
    expect(w.y).toBe(0.26)
    expect(w.x).toBe(0)
    expect(w.tilt).toBe(0)
  })

  it('caps the stretch at 0.26 no matter how violent the throw', () => {
    expect(warpFor(50, 0).x).toBe(0.26)
    expect(warpFor(0, 50).y).toBe(0.26)
  })

  it('leans signed into the horizontal throw — a flick back rights it', () => {
    expect(warpFor(1, 0).tilt).toBeCloseTo(2.6, 10)
    expect(warpFor(-1, 0).tilt).toBeCloseTo(-2.6, 10)
  })

  it('clamps the lean at ±7 degrees', () => {
    expect(warpFor(10, 0).tilt).toBe(7)
    expect(warpFor(-10, 0).tilt).toBe(-7)
  })
})

describe('glideOffsetPx (gap-glide sign math)', () => {
  const P = 60 // one row pitch
  // Four stops [A,B,C,D], dragging A (index 0) downward until insertIdx = 2 —
  // A lands between B and C → final [B,A,C,D]. Regression for the inverted
  // signs the original glide shipped with: B slid DOWN onto C instead of UP
  // into A's vacated slot.
  it('dragging down: rows between slide UP toward the vacated slot', () => {
    expect(glideOffsetPx(0, 2, 1, P)).toBe(-P) // B → slot 0
    expect(glideOffsetPx(0, 2, 2, P)).toBe(null) // C stays
    expect(glideOffsetPx(0, 2, 3, P)).toBe(null) // D stays
    expect(glideOffsetPx(0, 2, 0, P)).toBe(null) // the carried row never glides
  })

  it('dragging up: rows between slide DOWN toward the vacated slot', () => {
    // dragging D (3) up to insertIdx 2 → final [A,B,D,C]: C fills D's slot
    expect(glideOffsetPx(3, 2, 2, P)).toBe(P)
    expect(glideOffsetPx(3, 2, 1, P)).toBe(null)
    expect(glideOffsetPx(3, 2, 3, P)).toBe(null)
  })

  it('is quiet when nothing should move', () => {
    expect(glideOffsetPx(1, 1, 0, P)).toBe(null) // insert on own slot
    expect(glideOffsetPx(0, 1, 1, P)).toBe(null) // no rows strictly between
    expect(glideOffsetPx(2, 4, 5, P)).toBe(null) // outside the affected span
  })
})

describe('insertionIndexFor (the drop-zone reading)', () => {
  // Four rows with an 8px gap, like .tl-row — heights vary (40px anchor,
  // 120px stop card) so the per-row-midpoint scaling is actually exercised.
  // Midpoints: A 20 · B 108 · C 206 · D 284.
  const boxes = [
    { top: 0, height: 40 },   // A
    { top: 48, height: 120 }, // B
    { top: 176, height: 60 }, // C
    { top: 244, height: 80 }, // D
  ]

  it('the rest position reads a no-op slot (dragging + 1)', () => {
    expect(insertionIndexFor(boxes, 108, 1)).toBe(2) // centre on B's own midpoint
    expect(glideOffsetPx(1, 2, 0, 128)).toBe(null)
    expect(glideOffsetPx(1, 2, 2, 128)).toBe(null)
    expect(glideOffsetPx(1, 2, 3, 128)).toBe(null)
  })

  it('crossing a row midpoint by 1px flips the slot', () => {
    expect(insertionIndexFor(boxes, 205, 1)).toBe(2) // not yet past C
    expect(insertionIndexFor(boxes, 207, 1)).toBe(3) // past C's midpoint → after C
  })

  it('never flips AT the midpoint (the >=/> slip class that inverted the glide)', () => {
    expect(insertionIndexFor(boxes, 206, 1)).toBe(2) // exactly on C's midpoint
    expect(insertionIndexFor(boxes, 20, 2)).toBe(0) // exactly on A's midpoint, dragging C
  })

  it('each row flips at its OWN midpoint — the trigger scales with the card', () => {
    // dragging C (2): the 40px anchor flips at y=20, the 120px card at y=108
    expect(insertionIndexFor(boxes, 19, 2)).toBe(0)
    expect(insertionIndexFor(boxes, 21, 2)).toBe(1)
    expect(insertionIndexFor(boxes, 107, 2)).toBe(1)
    expect(insertionIndexFor(boxes, 109, 2)).toBe(3) // past B → rest-equivalent slot (no glide span)
    expect(insertionIndexFor(boxes, 285, 2)).toBe(4) // past D → D glides up
  })

  it('excludes the dragged row from the count and handles both extremes', () => {
    expect(insertionIndexFor(boxes, -5, 3)).toBe(0) // dragging D, centre above all
    expect(insertionIndexFor(boxes, 999, 0)).toBe(4) // dragging A, centre below all
  })

  it('hysteresis delays every flip by its fraction of the row height', () => {
    expect(insertionIndexFor(boxes, 206, 1)).toBe(2) // baseline flips past 206
    expect(insertionIndexFor(boxes, 206, 1, 0.1)).toBe(2) // C's boundary → 212
    expect(insertionIndexFor(boxes, 212, 1, 0.1)).toBe(2)
    expect(insertionIndexFor(boxes, 213, 1, 0.1)).toBe(3)
  })
})

describe('mouse activation constants', () => {
  it('a mouse drag starts after a small movement, well under the touch cancel', () => {
    expect(MOUSE_START_PX).toBeLessThan(MOVE_CANCEL_PX)
  })

  it('the warp calm window is shorter than one hover blink', () => {
    expect(WARP_CALM_MS).toBe(90)
  })
})
