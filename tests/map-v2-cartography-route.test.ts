import { describe, expect, it } from 'vitest'
import { dayRoadSlices, ROUTE_PAINT, sliceRoadBetween } from '../src/lib/mapStyles/routeTreatment'

// A straight road from lng 76.0 to 76.9, one vertex every 0.1 degree.
const road: [number, number][] = Array.from({ length: 10 }, (_, i) => [76 + i * 0.1, 10])

describe('route paint', () => {
  it('uses the board widths', () => {
    expect(ROUTE_PAINT.selectedWidth).toBe(5)
    expect(ROUTE_PAINT.contextWidth).toBe(2)
    expect(ROUTE_PAINT.contextOpacity).toBe(0.4)
    expect(ROUTE_PAINT.selectedCasingWidth).toBeGreaterThan(ROUTE_PAINT.selectedWidth)
  })
})

describe('cutting a day from the measured road', () => {
  it('reuses only real road vertices', () => {
    const cut = sliceRoadBetween(road, { lat: 10, lng: 76.1 }, { lat: 10, lng: 76.4 })
    expect(cut).toEqual(road.slice(1, 5))
  })

  it('returns null when a day end is far from the road', () => {
    expect(sliceRoadBetween(road, { lat: 12, lng: 76.1 }, { lat: 10, lng: 76.4 })).toBeNull()
  })

  it('returns null for no road, a one-point road or a cut with one point', () => {
    expect(sliceRoadBetween(null, { lat: 10, lng: 76 }, { lat: 10, lng: 77 })).toBeNull()
    expect(sliceRoadBetween([road[0]], { lat: 10, lng: 76 }, { lat: 10, lng: 77 })).toBeNull()
    expect(sliceRoadBetween(road, { lat: 10, lng: 76.3 }, { lat: 10, lng: 76.3 })).toBeNull()
  })

  it('never runs a day backwards along the road', () => {
    const cut = sliceRoadBetween(road, { lat: 10, lng: 76.5 }, { lat: 10, lng: 76.2 })
    expect(cut === null || cut[0][0] <= cut[cut.length - 1][0]).toBe(true)
  })
})

describe('day slices', () => {
  const rides = {
    '1': [{ lat: 10, lng: 76 }, { lat: 10, lng: 76.4 }],
    '2': [{ lat: 10, lng: 76.4 }, { lat: 10, lng: 76.9 }],
    '3': null,
  }

  it('flags the selected day and paints it last', () => {
    const slices = dayRoadSlices(road, rides, 1)
    expect(slices.map(slice => [slice.dayIndex, slice.selected])).toEqual([[2, false], [1, true]])
  })

  it('leaves out a day with no ride or no measured road', () => {
    expect(dayRoadSlices(null, rides, 1)).toEqual([])
  })
})
