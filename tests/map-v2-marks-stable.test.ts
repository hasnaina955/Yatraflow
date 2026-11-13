import { describe, expect, it } from 'vitest'
import { layoutMarks, type LayoutMark } from '../src/lib/mapStyles/placeMarks'
import { coincidentPinOffsets } from '../src/lib/pinOffsets'

// F1: a stop mark never leaves its coordinate. Stops are fixed obstacles; pills, tags, picks
// and empty parts yield. The bounds only hide a mark, so a pan does not change the result.
const stop = (id: string, x: number, y: number): LayoutMark => ({ id, layer: 'stop', x, y, w: 44, h: 44, drawW: 36, drawH: 36 })
const pill = (id: string, follows: string, x: number, y: number): LayoutMark => ({ id, layer: 'clock', follows, x, y: y + 33, w: 96, h: 26 })

// A fixed pseudo-random sequence, so the dense set is the same on every run.
function lcg(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 } }
function denseStops(count: number, spread: number): LayoutMark[] {
  const rnd = lcg(7)
  return Array.from({ length: count }, (_, i) => stop(`stop:${i}`, 400 + Math.round(rnd() * spread), 300 + Math.round(rnd() * spread)))
}

describe('F1 stops stay on their coordinate', () => {
  it('moves no stop when two stops overlap', () => {
    const spots = layoutMarks([stop('a', 200, 200), stop('b', 200, 215)])
    expect(spots.get('a')).toEqual({ dx: 0, dy: 0, hidden: false })
    expect(spots.get('b')).toEqual({ dx: 0, dy: 0, hidden: false })
  })

  it('moves no stop of a dense 34-stop trip at low zoom', () => {
    const marks = denseStops(34, 120)
    const spots = layoutMarks(marks, { bounds: { left: 0, top: 0, right: 1400, bottom: 900 } })
    for (const m of marks) expect(spots.get(m.id)).toEqual({ dx: 0, dy: 0, hidden: false })
  })

  it('keeps the coincident-pin offset as the only offset of a stop', () => {
    const offsets = coincidentPinOffsets([{ id: 'a', lat: 15.5, lng: 73.8 }, { id: 'b', lat: 15.5, lng: 73.8 }])
    for (const o of offsets.values()) { expect(Math.abs(o.dx)).toBeLessThanOrEqual(15); expect(Math.abs(o.dy)).toBeLessThanOrEqual(15) }
    const marks = [stop('a', 300 + offsets.get('a')!.dx, 300 + offsets.get('a')!.dy), stop('b', 300 + offsets.get('b')!.dx, 300 + offsets.get('b')!.dy)]
    const spots = layoutMarks(marks)
    for (const m of marks) expect(spots.get(m.id)).toEqual({ dx: 0, dy: 0, hidden: false })
  })

  it('moves a pick off a stop and leaves the stop', () => {
    const marks: LayoutMark[] = [stop('s', 100, 100), { id: 'pick', layer: 'pick', x: 100, y: 100, w: 44, h: 44 }]
    const spots = layoutMarks(marks)
    expect(spots.get('s')).toEqual({ dx: 0, dy: 0, hidden: false })
    expect(spots.get('pick')!.dx || spots.get('pick')!.dy).toBeTruthy()
  })

  it('hides a pill that no longer fits among dense stops', () => {
    const stops = denseStops(34, 20)
    const top = stops.reduce((a, b) => (b.y < a.y ? b : a))
    // A name tag may only slide a short way, so it hides when the stops cover its place.
    const marks = [...stops, { ...pill('c', top.id, top.x, top.y), maxTravel: 8 }]
    const spots = layoutMarks(marks)
    for (const m of marks.filter(x => x.layer === 'stop')) expect(spots.get(m.id)!.dx).toBe(0)
    expect(spots.get('c')!.hidden).toBe(true)
  })
})

describe('F1 a pan does not change the layout', () => {
  const bounds = { left: 0, top: 0, right: 1400, bottom: 900 }
  const rel = (marks: LayoutMark[], tx: number, ty: number, b = bounds) => {
    const moved = marks.map(m => ({ ...m, x: m.x + tx, y: m.y + ty }))
    return layoutMarks(moved, { bounds: b })
  }

  it('gives marks that stay in view the same spot after a pan', () => {
    const base = [...denseStops(20, 160), { id: 'pick', layer: 'pick' as const, x: 450, y: 350, w: 44, h: 44 }, pill('c', 'stop:3', 450, 380)]
    const a = rel(base, 0, 0)
    const b = rel(base, 300, -120)
    for (const m of base) expect(b.get(m.id)).toEqual(a.get(m.id))
  })

  it('does not let a bound at one side change a mark that is in view', () => {
    const base = [stop('edge', 100, 450), { id: 'pick', layer: 'pick' as const, x: 100, y: 450, w: 44, h: 44 }, pill('c', 'edge', 100, 450)]
    const wide = layoutMarks(base, { bounds: { left: -500, top: 0, right: 1400, bottom: 900 } })
    const tight = layoutMarks(base, { bounds: { left: 60, top: 0, right: 1400, bottom: 900 } })
    expect(tight.get('edge')).toEqual(wide.get('edge'))
    expect(tight.get('pick')).toEqual(wide.get('pick'))
  })

  it('keeps a stop that sits outside the bounds where it is', () => {
    const spots = layoutMarks([stop('far', -300, 200)], { bounds: { left: 100, top: 100, right: 400, bottom: 400 } })
    expect(spots.get('far')).toEqual({ dx: 0, dy: 0, hidden: false })
  })

  it('hides a pill that ends outside the bounds, and lets the others stay', () => {
    const marks = [stop('s', 20, 200), pill('c', 's', 20, 200), stop('t', 300, 200), pill('d', 't', 300, 200)]
    const spots = layoutMarks(marks, { bounds: { left: 100, top: 0, right: 800, bottom: 600 } })
    expect(spots.get('c')!.hidden).toBe(true)
    expect(spots.get('d')).toEqual({ dx: 0, dy: 0, hidden: false })
  })
})
