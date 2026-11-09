import { describe, expect, it } from 'vitest'
import { ghostLegPaint, pickLetter, placeSubtype, resolveMarkCollisions } from '../src/lib/mapStyles/placeMarks'
import { roadSnappedIndex } from '../src/components/map/stopDragReorder'

describe('place subtype', () => {
  it('picks a specific subtype from the name, not one broad category icon', () => {
    expect(placeSubtype({ category: 'nature', name: 'Attukad Waterfalls' }).key).toBe('waterfall')
    expect(placeSubtype({ category: 'nature', name: 'Eravikulam National Park' }).key).toBe('wildlife')
    expect(placeSubtype({ category: 'temple', name: 'Jama Masjid' }).key).toBe('mosque')
    expect(placeSubtype({ category: 'adventure', name: 'Kolukkumalai Tea Estate' }).key).toBe('estate')
  })

  it('keeps meal and stay as category facts', () => {
    expect(placeSubtype({ category: 'food', name: 'Nalla Ruchi Kitchen' }).key).toBe('meal')
    expect(placeSubtype({ category: 'hotel', name: 'Spice Village Park Inn' }).key).toBe('stay')
    expect(placeSubtype({ category: 'food', name: 'Tea Chai Corner' }).key).toBe('cafe')
  })

  it('falls back to the category, then to a generic sight, never to a guess', () => {
    expect(placeSubtype({ category: 'museum', name: 'Local collection' }).key).toBe('museum')
    expect(placeSubtype({ category: undefined, name: 'Somewhere' }).key).toBe('sight')
    expect(placeSubtype({}).key).toBe('sight')
  })
})

describe('pick letters', () => {
  it('runs A to C in rank order and then stops', () => {
    expect([0, 1, 2, 3].map(pickLetter)).toEqual(['A', 'B', 'C', null])
  })
})

describe('mark collisions', () => {
  it('moves the second of two overlapping badges and keeps the first', () => {
    const spots = resolveMarkCollisions([{ id: 'a', x: 100, y: 100, w: 32, h: 32 }, { id: 'b', x: 110, y: 104, w: 32, h: 32 }])
    expect(spots.get('a')).toEqual({ dx: 0, dy: 0, hidden: false })
    const b = spots.get('b')!
    expect(Math.abs(b.dx) + Math.abs(b.dy)).toBeGreaterThan(0)
    expect(Math.abs(110 + b.dx - 100) >= 32 || Math.abs(104 + b.dy - 100) >= 32).toBe(true)
  })

  it('leaves far apart marks where they are', () => {
    const spots = resolveMarkCollisions([{ id: 'a', x: 0, y: 0, w: 32, h: 32 }, { id: 'b', x: 200, y: 0, w: 32, h: 32 }])
    expect([...spots.values()].every(s => s.dx === 0 && s.dy === 0 && !s.hidden)).toBe(true)
  })

  it('hides a droppable pill when no free spot exists, and never hides a stop', () => {
    const blockers = Array.from({ length: 80 }, (_, i) => ({ id: `s${i}`, x: (i % 9) * 40, y: Math.floor(i / 9) * 40, w: 40, h: 40 }))
    const spots = resolveMarkCollisions([...blockers, { id: 'pill', x: 140, y: 140, w: 70, h: 20, droppable: true }, { id: 'stop', x: 140, y: 140, w: 32, h: 32 }], { maxSteps: 1 })
    expect(spots.get('pill')?.hidden).toBe(true)
    expect(spots.get('stop')?.hidden).toBe(false)
  })
})

describe('ghost road paint', () => {
  it('draws an estimate thinner and fainter than a measured road', () => {
    const measured = ghostLegPaint({ measured: true }, 'new')
    const estimate = ghostLegPaint({ measured: false }, 'new')
    expect(estimate.width).toBeLessThan(measured.width)
    expect(estimate.opacity).toBeLessThan(measured.opacity)
    expect(estimate.dash).not.toEqual(measured.dash)
  })

  it('dims the replaced road below both new roads', () => {
    expect(ghostLegPaint({ measured: true }, 'replaced').opacity).toBeLessThan(ghostLegPaint({ measured: false }, 'new').opacity)
  })
})

describe('road-snapped drag index', () => {
  const road: [number, number][] = Array.from({ length: 11 }, (_, i) => [76 + i * 0.1, 10])
  const stops = [{ id: 'a', lat: 10, lng: 76.1 }, { id: 'b', lat: 10, lng: 76.5 }, { id: 'c', lat: 10, lng: 76.9 }]

  it('counts the other stops that come before the snapped pointer', () => {
    expect(roadSnappedIndex({ road, pointer: { lat: 10.4, lng: 76.7 }, stopId: 'a', stops })).toBe(1)
    expect(roadSnappedIndex({ road, pointer: { lat: 9.6, lng: 76.0 }, stopId: 'c', stops })).toBe(0)
    expect(roadSnappedIndex({ road, pointer: { lat: 10, lng: 77 }, stopId: 'a', stops })).toBe(2)
  })

  it('returns null with no road to snap to', () => {
    expect(roadSnappedIndex({ road: null, pointer: { lat: 10, lng: 76 }, stopId: 'a', stops })).toBeNull()
  })
})
