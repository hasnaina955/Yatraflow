// Ticket 06 interaction proof. Every helper under test is imported and called
// by MapJourneyRibbon (MapWorkspaceChrome.tsx); the assertions exercise the
// production scrub/reset/keyboard seams, not test-only copies.
//   ribbonRange / clampRibbonMinute / ribbonSignature / ribbonResetMinute /
//   ribbonKeyMinute / ribbonScrub  ->  MapJourneyRibbon
//   ribbonStops                    ->  MapJourneyRibbon (engine-clock axis)
// This is node-only (vitest, no DOM/browser). Browser/reduced-motion/
// offscreen-camera acceptance stays with the next HY4 browser/vision pass.
import { describe, expect, it } from 'vitest'
import { legKey, type Journey, type JourneyPoint, type LegEstimate } from '../src/lib/engine'
import {
  ribbonStops, ribbonRange, clampRibbonMinute, ribbonSignature,
  ribbonResetMinute, ribbonKeyMinute, RIBBON_KEY_STEP_MINUTES, ribbonScrub,
} from '../src/lib/mapJourneyRibbon'
import { clockHM } from '../src/lib/clockOverlay'

function point(id: string, arrive: string, depart: string, lat: number, lng: number): JourneyPoint {
  return { kind: 'visit', title: id, arrive, depart, lat, lng, dwellMinutes: 30, synthesized: false, legIn: null,
    stop: { id, title: id, category: 'nature', locationName: id, lat, lng, visitMinutes: 30, entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have', status: 'confirmed', orderInDay: 0 } }
}
function journey(points: JourneyPoint[], startTime = '10:00', dayIndex = 0): Journey {
  return { dayIndex, direction: 'outbound', startTitle: 'A', endTitle: 'B', startTime, arrivalTime: points.at(-1)?.arrive ?? startTime, distanceKm: 10, driveMinutes: 60, dwellMinutes: 60, totalMinutes: 120, transportCostInr: 0, fuelLitres: null, fuelPricePerL: null, points, halts: [], endsAtStart: false }
}

describe('AC1: absolute journey-minute range, consistent across midnight', () => {
  it('keeps the bounds absolute past 1440 for an overnight journey', () => {
    const stops = ribbonStops(journey([point('A', '23:30', '00:30', 10, 76), point('B', '01:30', '02:00', 11, 77)], '23:00'))
    expect(ribbonRange(stops)).toEqual({ start: 1410, end: 1560 })
  })

  it('clamps raw range values and rejects a non-finite clock', () => {
    const range = { start: 600, end: 720 }
    expect(clampRibbonMinute(range, 599)).toBe(600)
    expect(clampRibbonMinute(range, 721)).toBe(720)
    expect(clampRibbonMinute(range, 660)).toBe(660)
    expect(clampRibbonMinute(range, NaN)).toBe(600)
  })

  it('scrubs to an absolute next-day minute while the wall clock only wraps for display', () => {
    const a = point('A', '23:30', '00:15', 10, 76)
    const b = point('B', '01:00', '01:30', 11, 77)
    const stops = ribbonStops(journey([a, b], '23:00'))
    const outcome = ribbonScrub(stops, 1470) // 00:30 on the next day
    expect(outcome.minute).toBe(1470) // absolute on the continuous clock, not 30
    expect(clockHM(outcome.minute)).toBe('00:30') // wall-clock display only
    expect(outcome.position?.grade).toBe('estimated') // no correction supplied
    expect(outcome.cameraReveal).toBe(false)
  })

  it('places a measured road position using absolute next-day minutes', () => {
    const a = point('A', '23:30', '00:15', 10, 76)
    const b = point('B', '01:00', '01:30', 11, 77)
    const stops = ribbonStops(journey([a, b], '23:00'))
    const corrections: Record<string, LegEstimate> = {
      [legKey(a, b)]: { distanceKm: 200, durationMinutes: 45, geometry: [[76, 10], [77, 10], [77, 11]] as [number, number][] },
    }
    const outcome = ribbonScrub(stops, 1470, corrections)
    expect(outcome.minute).toBe(1470)
    expect(outcome.position?.grade).toBe('road')
    expect(outcome.cameraReveal).toBe(true)
    expect(outcome.position?.coordinate.lng).toBeGreaterThan(76)
  })
})

describe('AC1: correct new trip/day reset, no stale cursor', () => {
  it('gives a distinct signature to a different day or start clock', () => {
    const stops = ribbonStops(journey([point('A', '10:00', '10:30', 10, 76), point('B', '11:30', '12:00', 11, 77)]))
    const day0 = ribbonSignature(stops, 0, '10:00')
    expect(ribbonSignature(stops, 0, '10:00')).toBe(day0)
    expect(ribbonSignature(stops, 1, '10:00')).not.toBe(day0)
    expect(ribbonSignature(stops, 0, '11:00')).not.toBe(day0)
    expect(ribbonSignature([], 0, '10:00')).not.toBe(day0)
  })

  it('resets a stored cursor to the start when the day signature changes', () => {
    const stops = ribbonStops(journey([point('A', '10:00', '10:30', 10, 76), point('B', '11:30', '12:00', 11, 77)]))
    const range = ribbonRange(stops)
    const sig = ribbonSignature(stops, 0, '10:00')
    // Same journey: keep the in-range minute, clamp an out-of-range one.
    expect(ribbonResetMinute(range, sig, { signature: sig, minute: 660 })).toBe(660)
    expect(ribbonResetMinute(range, sig, { signature: sig, minute: 9999 })).toBe(range.end)
    // New trip/day: discard the stale minute entirely, no stale cursor.
    expect(ribbonResetMinute(range, 'a-new-day', { signature: sig, minute: 660 })).toBe(range.start)
    expect(ribbonResetMinute(range, sig, { signature: sig, minute: NaN })).toBe(range.start)
  })
})

describe('AC4: keyboard scrub without a pointer', () => {
  const range = { start: 600, end: 720 }

  it('moves arrow keys by a fixed five minutes', () => {
    expect(RIBBON_KEY_STEP_MINUTES).toBe(5)
    expect(ribbonKeyMinute(range, 660, 'ArrowRight')).toBe(665)
    expect(ribbonKeyMinute(range, 660, 'ArrowUp')).toBe(665)
    expect(ribbonKeyMinute(range, 660, 'ArrowLeft')).toBe(655)
    expect(ribbonKeyMinute(range, 660, 'ArrowDown')).toBe(655)
  })

  it('jumps Home and End to the day bounds', () => {
    expect(ribbonKeyMinute(range, 660, 'Home')).toBe(600)
    expect(ribbonKeyMinute(range, 660, 'End')).toBe(720)
  })

  it('clamps keyboard steps at the bounds', () => {
    expect(ribbonKeyMinute(range, 600, 'ArrowLeft')).toBe(600)
    expect(ribbonKeyMinute(range, 718, 'ArrowRight')).toBe(720)
  })

  it('ignores keys that are not scrub keys', () => {
    expect(ribbonKeyMinute(range, 660, 'PageUp')).toBeNull()
    expect(ribbonKeyMinute(range, 660, 'a')).toBeNull()
  })
})

describe('AC2 + AC5: measured geometry vs honest estimate, no fake camera', () => {
  const a = point('A', '10:00', '10:30', 10, 76)
  const b = point('B', '11:30', '12:00', 11, 77)
  const stops = ribbonStops(journey([a, b]))

  it('reveals the camera for measured road geometry', () => {
    const corrections: Record<string, LegEstimate> = {
      [legKey(a, b)]: { distanceKm: 220, durationMinutes: 60, geometry: [[76, 10], [77, 10], [77, 11]] as [number, number][] },
    }
    const outcome = ribbonScrub(stops, 660, corrections)
    expect(outcome.minute).toBe(660)
    expect(outcome.position?.grade).toBe('road')
    expect(outcome.cameraReveal).toBe(true)
    expect(outcome.position?.coordinate.lng).toBeGreaterThan(76)
  })

  it('reveals the camera for a real scheduled stop', () => {
    const outcome = ribbonScrub(stops, 610) // during A's visit
    expect(outcome.position?.grade).toBe('stop')
    expect(outcome.cameraReveal).toBe(true)
    expect(outcome.position?.coordinate).toEqual({ lat: 10, lng: 76 })
  })

  it('keeps an unmeasured leg at the real stop anchor and forbids a fake camera', () => {
    const outcome = ribbonScrub(stops, 660) // no correction
    expect(outcome.position?.grade).toBe('estimated')
    expect(outcome.cameraReveal).toBe(false)
    // The coordinate is the genuine stop, not a fabricated on-road point.
    expect(outcome.position?.coordinate).toEqual({ lat: 10, lng: 76 })
  })

  it('stays honest for an estimated road measurement', () => {
    const corrections: Record<string, LegEstimate> = {
      [legKey(a, b)]: { distanceKm: 200, durationMinutes: 60, geometry: [[76, 10], [77, 11]] as [number, number][], estimated: true },
    }
    const outcome = ribbonScrub(stops, 660, corrections)
    expect(outcome.position?.grade).toBe('estimated')
    expect(outcome.cameraReveal).toBe(false)
    expect(outcome.position?.coordinate).toEqual({ lat: 10, lng: 76 })
  })

  it('stays honest for air travel', () => {
    const corrections: Record<string, LegEstimate> = {
      [legKey(a, b)]: { distanceKm: 200, durationMinutes: 60, geometry: [[76, 10], [77, 11]] as [number, number][], kind: 'air' },
    }
    const outcome = ribbonScrub(stops, 660, corrections)
    expect(outcome.position?.grade).toBe('estimated')
    expect(outcome.cameraReveal).toBe(false)
    expect(outcome.position?.coordinate).toEqual({ lat: 10, lng: 76 })
  })

  it('reports no position and no camera for an empty journey', () => {
    const outcome = ribbonScrub([], 660)
    expect(outcome.position).toBeNull()
    expect(outcome.cameraReveal).toBe(false)
  })
})
