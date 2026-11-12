import { describe, expect, it } from 'vitest'
import { layoutMarks, type LayoutMark, type MarkSpot } from '../src/lib/mapStyles/placeMarks'

// Pure checks for the one layout that places stops, problems, empty parts, picks and clock pills.
// Boxes are centred on x and y. A stop owns a 44 by 44 hit box and draws 36 by 36.
const stop = (id: string, x: number, y: number): LayoutMark => ({ id, layer: 'stop', x, y, w: 44, h: 44, drawW: 36, drawH: 36 })
const pill = (id: string, follows: string, x: number, y: number): LayoutMark => ({ id, layer: 'clock', follows, x, y: y + 33, w: 96, h: 26 })

function placed(marks: LayoutMark[], spots: Map<string, MarkSpot>, size: 'hit' | 'draw' = 'hit') {
  return marks.flatMap(m => {
    const spot = spots.get(m.id)
    if (!spot || spot.hidden) return []
    const anchor = m.follows ? spots.get(m.follows) : undefined
    const w = size === 'draw' ? (m.drawW ?? m.w) : m.w
    const h = size === 'draw' ? (m.drawH ?? m.h) : m.h
    return [{ id: m.id, layer: m.layer, x: m.x + spot.dx + (anchor?.dx ?? 0), y: m.y + spot.dy + (anchor?.dy ?? 0), w, h }]
  })
}
const meet = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2

describe('layoutMarks: hit boxes', () => {
  it('moves two close stops until their 44px hit boxes stop meeting', () => {
    const marks = [stop('a', 200, 200), stop('b', 200, 237)]
    const boxes = placed(marks, layoutMarks(marks))
    expect(boxes).toHaveLength(2)
    expect(meet(boxes[0], boxes[1])).toBe(false)
  })

  it('never moves the higher layer for a lower one', () => {
    const marks: LayoutMark[] = [
      { id: 'pick', layer: 'pick', x: 100, y: 100, w: 44, h: 44 },
      stop('stop', 100, 100),
      { id: 'warn', layer: 'warn', x: 100, y: 100, w: 44, h: 44 },
    ]
    const spots = layoutMarks(marks)
    expect(spots.get('stop')).toEqual({ dx: 0, dy: 0, hidden: false })
    expect(spots.get('warn')!.dx || spots.get('warn')!.dy).toBeTruthy()
    const boxes = placed(marks, spots)
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(meet(boxes[i], boxes[j])).toBe(false)
  })

  it('leaves marks that already clear each other where they are', () => {
    const marks = [stop('a', 100, 100), stop('b', 300, 100)]
    const spots = layoutMarks(marks)
    expect(spots.get('a')).toEqual({ dx: 0, dy: 0, hidden: false })
    expect(spots.get('b')).toEqual({ dx: 0, dy: 0, hidden: false })
  })
})

describe('layoutMarks: clock pills', () => {
  it('measures a pill against the drawn badge, not the larger hit box', () => {
    // The pill hangs 33px under the badge centre. Against the 44px hit box it would clash by 2px.
    const marks = [stop('s', 200, 200), pill('c', 's', 200, 200)]
    expect(layoutMarks(marks).get('c')).toEqual({ dx: 0, dy: 0, hidden: false })
  })

  it('moves a pill off a neighbouring badge and keeps it near its own stop', () => {
    const marks = [stop('s', 200, 200), stop('n', 200, 233), pill('c', 's', 200, 200)]
    const spots = layoutMarks(marks)
    const c = spots.get('c')!
    expect(c.hidden).toBe(false)
    const boxes = placed(marks, spots, 'draw')
    const own = boxes.find(b => b.id === 'c')!
    for (const other of boxes.filter(b => b.layer === 'stop')) expect(meet(own, other)).toBe(false)
    expect(Math.hypot(c.dx, c.dy)).toBeLessThanOrEqual(80)
  })

  it('hides a pill that has no room inside the bounds, and keeps its stop', () => {
    const marks = [stop('s', 25, 25), pill('c', 's', 25, 25)]
    const spots = layoutMarks(marks, { bounds: { left: 0, top: 0, right: 50, bottom: 50 } })
    expect(spots.get('c')).toEqual({ dx: 0, dy: 0, hidden: true })
    expect(spots.get('s')!.hidden).toBe(false)
  })
})

describe('layoutMarks: bounds', () => {
  it('moves a mark that starts outside the open map area back inside', () => {
    const bounds = { left: 100, top: 100, right: 400, bottom: 400 }
    const marks = [stop('edge', 110, 250)]
    const spot = layoutMarks(marks, { bounds }).get('edge')!
    const box = placed(marks, new Map([['edge', spot]]))[0]
    expect(box.x - box.w / 2).toBeGreaterThanOrEqual(bounds.left)
    expect(box.x + box.w / 2).toBeLessThanOrEqual(bounds.right)
  })
})
