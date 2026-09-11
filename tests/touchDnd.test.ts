// ============ touchDnd — pointer drag engine (pure helpers) ============
import { describe, it, expect } from 'vitest'
import {
  LONG_PRESS_MS, MOVE_CANCEL_PX, MOUSE_START_PX, EDGE_ZONE_PX, EDGE_SCROLL_SPEED, WARP_CALM_MS,
  encodeDropKey, parseDropKey, longPressActivated, movedPx,
  edgeScrollDelta, isInteractiveTarget, warpFor,
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

describe('mouse activation constants', () => {
  it('a mouse drag starts after a small movement, well under the touch cancel', () => {
    expect(MOUSE_START_PX).toBeLessThan(MOVE_CANCEL_PX)
  })

  it('the warp calm window is shorter than one hover blink', () => {
    expect(WARP_CALM_MS).toBe(90)
  })
})
