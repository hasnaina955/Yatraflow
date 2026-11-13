import { describe, expect, it } from 'vitest'
import { addInsets, clampInsets, coverInsets, frameOverflow, hasOverflow, mergeInsets, safeRect } from '../src/lib/mapStyles/cameraFrame'

const canvas = { left: 20, top: 175, right: 1405, bottom: 983 }

describe('map v2 camera frame', () => {
  it('reads a tall left panel as a left inset and a tall right panel as a right inset', () => {
    const insets = coverInsets(canvas, [
      { left: 32, top: 187, right: 412, bottom: 971 },
      { left: 1021, top: 261, right: 1393, bottom: 971 },
    ])
    expect(insets.left).toBe(412 - 20)
    expect(insets.right).toBe(1405 - 1021)
    expect(insets.top).toBe(0)
    expect(insets.bottom).toBe(0)
  })

  it('reads the attribution and the journey bar as the bottom inset', () => {
    const insets = coverInsets(canvas, [
      { left: 402, top: 844, right: 892, bottom: 888 },
      { left: 424, top: 899, right: 1009, bottom: 971 },
    ])
    expect(insets.bottom).toBe(983 - 844)
  })

  it('ignores a small corner control', () => {
    const insets = coverInsets(canvas, [{ left: 909, top: 780, right: 1008, bottom: 874 }])
    expect(insets).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
  })

  it('reads a wide strip at the top as the top inset', () => {
    const phone = { left: 7, top: 160, right: 383, bottom: 826 }
    expect(coverInsets(phone, [{ left: 14, top: 163, right: 376, bottom: 211 }]).top).toBe(211 - 160)
  })

  it('ignores a cover outside the canvas', () => {
    expect(coverInsets(canvas, [{ left: 0, top: 0, right: 2000, bottom: 100 }])).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
  })

  it('merges per edge with the larger value', () => {
    expect(mergeInsets({ top: 90, bottom: 90, left: 404, right: 396 }, { top: 0, bottom: 139, left: 392, right: 384 }))
      .toEqual({ top: 90, bottom: 139, left: 404, right: 396 })
  })

  it('keeps 120px of open canvas even when the insets are large', () => {
    const out = clampInsets({ width: 376, height: 666 }, { top: 200, bottom: 400, left: 100, right: 100 })
    expect(666 - out.top - out.bottom).toBeGreaterThanOrEqual(120)
    expect(out.top).toBeGreaterThan(0)
    expect(addInsets(out, { top: 0, bottom: 0, left: 0, right: 0 })).toEqual(out)
  })

  it('reports no overflow for boxes inside the safe area', () => {
    const safe = safeRect({ width: 1000, height: 800 }, { top: 100, bottom: 100, left: 100, right: 100 })
    expect(hasOverflow(frameOverflow([{ x: 500, y: 400, w: 36, h: 36 }], safe))).toBe(false)
  })

  it('reports each edge that a box crosses', () => {
    const safe = safeRect({ width: 1000, height: 800 }, { top: 100, bottom: 100, left: 100, right: 100 })
    const overflow = frameOverflow([
      { x: 500, y: 690, w: 36, h: 36 },
      { x: 90, y: 400, w: 36, h: 36 },
    ], safe)
    expect(overflow.bottom).toBe(690 + 18 - 700)
    expect(overflow.left).toBe(100 - (90 - 18))
    expect(overflow.top).toBe(0)
    expect(overflow.right).toBe(0)
  })
})
