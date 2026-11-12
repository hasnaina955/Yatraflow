import { describe, expect, it } from 'vitest'
import { legKey, type Journey, type JourneyPoint } from '../src/lib/engine'
import { ribbonPosition, ribbonStops } from '../src/lib/mapJourneyRibbon'
import { visibleMapPadding } from '../src/lib/mapVisiblePadding'

function point(id: string, arrive: string, depart: string, lat: number, lng: number): JourneyPoint {
  return { kind: 'visit', title: id, arrive, depart, lat, lng, dwellMinutes: 30, synthesized: false, legIn: null,
    stop: { id, title: id, category: 'nature', locationName: id, lat, lng, visitMinutes: 30, entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have', status: 'confirmed', orderInDay: 0 } }
}
function journey(points: JourneyPoint[], startTime = '10:00'): Journey {
  return { dayIndex: 0, direction: 'outbound', startTitle: 'A', endTitle: 'B', startTime, arrivalTime: points.at(-1)?.arrive ?? startTime, distanceKm: 10, driveMinutes: 60, dwellMinutes: 60, totalMinutes: 120, transportCostInr: 0, fuelLitres: null, fuelPricePerL: null, points, halts: [], endsAtStart: false }
}

describe('journey ribbon clocks and camera evidence', () => {
  it('keeps an overnight visit and the following drive on the same time axis', () => {
    const stops = ribbonStops(journey([point('A', '23:30', '00:30', 10, 76), point('B', '01:30', '02:00', 11, 77)], '23:00'))
    expect(stops.map(stop => [stop.arrive, stop.depart])).toEqual([[1410, 1470], [1530, 1560]])
  })
  it('holds the clock at the actual stop throughout its visit', () => {
    const stops = ribbonStops(journey([point('A', '10:00', '10:30', 10, 76), point('B', '11:30', '12:00', 11, 77)]))
    expect(ribbonPosition(stops, 620)).toEqual({ coordinate: { lat: 10, lng: 76 }, label: 'A', grade: 'stop' })
  })
  it('follows supplied road geometry instead of a straight chord between stops', () => {
    const a = point('A', '10:00', '10:30', 10, 76)
    const b = point('B', '11:30', '12:00', 11, 77)
    const stops = ribbonStops(journey([a, b]))
    const result = ribbonPosition(stops, 660, { [legKey(a, b)]: { distanceKm: 220, durationMinutes: 60, geometry: [[76, 10], [77, 10], [77, 11]] } })
    expect(result?.grade).toBe('road')
    expect(result?.coordinate.lng).toBeCloseTo(77, 1)
    expect(result?.coordinate.lat).toBeLessThan(10.05)
  })
  it.each([{ estimated: true }, { kind: 'air' as const }, {}])('keeps unmeasured or air travel unknown: %j', extra => {
    const a = point('A', '10:00', '10:30', 10, 76)
    const b = point('B', '11:30', '12:00', 11, 77)
    const corrections = Object.keys(extra).length ? { [legKey(a, b)]: { distanceKm: 200, durationMinutes: 60, geometry: [[76, 10], [77, 11]] as [number, number][], ...extra } } : undefined
    const result = ribbonPosition(ribbonStops(journey([a, b])), 660, corrections)
    expect(result?.grade).toBe('estimated')
    expect(result?.coordinate).toEqual({ lat: 10, lng: 76 })
  })
  it('has no invented position for an empty journey or invalid clock', () => {
    expect(ribbonPosition([], 600)).toBeNull()
    expect(ribbonPosition(ribbonStops(journey([point('A', '10:00', '10:30', 10, 76)])), NaN)).toBeNull()
  })
  it('holds the final stop after the journey ends', () => {
    expect(ribbonPosition(ribbonStops(journey([point('A', '10:00', '10:30', 10, 76)])), 900)?.coordinate).toEqual({ lat: 10, lng: 76 })
  })
})

describe('map camera clearance', () => {
  it('reserves both desktop panels without changing their inset', () => {
    expect(visibleMapPadding({ width: 1440, height: 800 }, { left: 346, right: 346, top: 90, bottom: 90 })).toEqual({ left: 346, right: 346, top: 90, bottom: 90 })
  })
  it('keeps a usable region when the phone sheet is tall', () => {
    const inset = visibleMapPadding({ width: 320, height: 640 }, { left: 24, right: 70, top: 90, bottom: 560 })
    expect(640 - inset.top - inset.bottom).toBeGreaterThanOrEqual(120)
    expect(320 - inset.left - inset.right).toBeGreaterThanOrEqual(120)
  })
  it('does not round both sides into the last pixel of an odd-width gap', () => {
    const inset = visibleMapPadding({ width: 701, height: 641 }, { left: 346, right: 346, top: 346, bottom: 346 })
    expect(701 - inset.left - inset.right).toBeGreaterThanOrEqual(120)
    expect(641 - inset.top - inset.bottom).toBeGreaterThanOrEqual(120)
  })
})
