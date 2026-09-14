// Ruler marks: the rail's sense of place. These tests pin the clamping, the
// tone mapping and the rounding, since the dots sit next to real km numbers.
import { describe, it, expect } from 'vitest'
import { rulerMarks } from '../src/lib/railRuler'

describe('rulerMarks', () => {
  it('returns nothing when the drive has no length', () => {
    expect(rulerMarks([{ id: 'a', km: 10, purpose: 'fuel' }], 0)).toEqual([])
    expect(rulerMarks([{ id: 'a', km: 10, purpose: 'fuel' }], -5)).toEqual([])
  })

  it('places a mark by its share of the drive', () => {
    const [mark] = rulerMarks([{ id: 'a', km: 35, purpose: 'fuel' }], 140)
    expect(mark.pct).toBe(25)
  })

  it('clamps suggestions that sit outside the drive', () => {
    const marks = rulerMarks(
      [
        { id: 'before', km: -20, purpose: 'fuel' },
        { id: 'after', km: 500, purpose: 'fuel' },
      ],
      140,
    )
    expect(marks.map((m) => m.pct)).toEqual([0, 100])
  })

  it('nudges exact-equal positions apart, centred on the shared spot (#155)', () => {
    // A folded meal+fuel pair at one km used to render two dots at one
    // left:% — visually one dot, silently undercounting the cards.
    const marks = rulerMarks([
      { id: 'a', km: 60, purpose: 'meal' },
      { id: 'b', km: 60, purpose: 'fuel' },
      { id: 'c', km: 60, purpose: 'sight' },
    ], 120)
    expect(marks.map(m => m.id)).toEqual(['a', 'b', 'c'])
    const pcts = marks.map(m => m.pct)
    expect(new Set(pcts).size).toBe(3)
    expect(pcts[1] - pcts[0]).toBeCloseTo(1.2, 5)
    expect(pcts[2] - pcts[1]).toBeCloseTo(1.2, 5)
    // the trio stays centred on the true position (50%)
    expect((pcts[0] + pcts[2]) / 2).toBeCloseTo(50, 1)
    // nudged dots clamp at the drive's edges instead of going negative
    const edge = rulerMarks([{ id: 'x', km: 0, purpose: 'fuel' }, { id: 'y', km: 0, purpose: 'meal' }], 100)
    expect(edge.every(m => m.pct >= 0)).toBe(true)
  })

  it('skips suggestions with no route position', () => {
    const marks = rulerMarks(
      [
        { id: 'off', km: null, purpose: 'fuel' },
        { id: 'on', km: 70, purpose: 'fuel' },
      ],
      140,
    )
    expect(marks.map((m) => m.id)).toEqual(['on'])
  })

  it('tones the dot by what the halt is for', () => {
    const marks = rulerMarks(
      [
        { id: 'fuel', km: 10, purpose: 'fuel' },
        { id: 'meal', km: 20, purpose: 'meal' },
        { id: 'lunch', km: 25, purpose: 'food' },
        { id: 'sight', km: 30, purpose: 'sight' },
        { id: 'scenic', km: 40, purpose: 'scenic' },
      ],
      140,
    )
    expect(marks.map((m) => m.tone)).toEqual(['need', 'meal', 'meal', 'see', 'see'])
  })

  it('keeps the engine order and rounds to a tenth of a percent', () => {
    const marks = rulerMarks(
      [
        { id: 'a', km: 1, purpose: 'fuel' },
        { id: 'b', km: 2, purpose: 'fuel' },
      ],
      333,
    )
    expect(marks.map((m) => m.id)).toEqual(['a', 'b'])
    expect(marks[0].pct).toBe(0.3)
    expect(marks[1].pct).toBe(0.6)
  })
})
