import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { closeRing, pickBandClass, ringLabelPoint, stayRingsGeoJson } from '../src/lib/mapStyles/lensMarks'

const SQUARE: [number, number][] = [[73.1, 18.9], [73.2, 18.9], [73.2, 19.0], [73.1, 19.0], [73.1, 18.9]]

describe('stayRingsGeoJson', () => {
  it('makes one closed LineString feature per ring, with the label in properties', () => {
    const out = stayRingsGeoJson([
      { id: 'walk', label: '15 min walk', ring: SQUARE.slice(0, 4) },
      { id: 'drive', label: '10 min drive', ring: [[73.5, 19.1], [73.6, 19.1], [73.6, 19.2]] },
    ])
    expect(out.type).toBe('FeatureCollection')
    expect(out.features).toHaveLength(2)
    expect(out.features[0].properties).toEqual({ id: 'walk', label: '15 min walk' })
    expect(out.features[1].properties.label).toBe('10 min drive')
    for (const feature of out.features) {
      expect(feature.geometry.type).toBe('LineString')
      const coords = feature.geometry.coordinates
      expect(coords.length).toBeGreaterThan(2)
      expect(coords[coords.length - 1]).toEqual(coords[0])
    }
  })

  it('does not add a second closing point to a ring that already closes', () => {
    const out = stayRingsGeoJson([{ id: 'walk', label: '15 min walk', ring: SQUARE }])
    expect(out.features[0].geometry.coordinates).toHaveLength(SQUARE.length)
    expect(closeRing(SQUARE)).toHaveLength(SQUARE.length)
  })

  it('makes no feature for no ring', () => {
    expect(stayRingsGeoJson([]).features).toEqual([])
  })
})

describe('ringLabelPoint', () => {
  it('returns the highest-lat point of the ring', () => {
    expect(ringLabelPoint(SQUARE)).toEqual([73.2, 19.0])
  })

  it('keeps the first point it meets on a tie', () => {
    expect(ringLabelPoint([[1, 5], [2, 5], [3, 4]])).toEqual([1, 5])
  })

  it('returns null for an empty ring', () => {
    expect(ringLabelPoint([])).toBeNull()
  })
})

describe('pickBandClass', () => {
  it('maps both bands and undefined', () => {
    expect(pickBandClass('just-past')).toBe('is-just-past')
    expect(pickBandClass('over-budget')).toBe('is-over-budget')
    expect(pickBandClass(undefined)).toBe('')
    expect(pickBandClass(null)).toBe('')
  })
})

describe('TripMap props', () => {
  const source = readFileSync(new URL('../src/components/TripMap.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

  it('declares the four lens props as optional', () => {
    expect(source).toMatch(/stayRings\?: Array</)
    expect(source).toMatch(/gapRings\?: Array</)
    expect(source).toMatch(/pickBands\?: Record</)
    expect(source).toMatch(/pickLetters\?: Record</)
  })
})
