// The clock walk turned into ROAD MILESTONES: one pin per planned anchor with
// its wall-clock time and its road km. No circles, no evening band, no moon
// glyph - a milestone carries both readings, so time and distance are read
// together at the point they belong to.
import { describe, expect, it } from 'vitest'
import { haversineKm } from '../src/lib/geo'
import { clockHM, deriveClockMilestones } from '../src/lib/clockOverlay'

/** A straight east-west polyline at the equator; ~111.195 km per degree. */
function straightPolyline(km: number, steps = 60): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = []
  for (let i = 0; i <= steps; i++) pts.push({ lat: 0, lng: (km / 111.195) * (i / steps) })
  return pts
}
const KM_PER_DEG = haversineKm(0, 0, 0, 1) // the fixture's own scale, measured
const DEG_KM = 1 / KM_PER_DEG

const SPEED = 0.7 // km per minute - 42 km/h

describe('clockHM', () => {
  it('formats minutes-since-midnight as a wall clock, wrapping past midnight', () => {
    expect(clockHM(0)).toBe('00:00')
    expect(clockHM(720)).toBe('12:00')
    expect(clockHM(1385)).toBe('23:05')
    expect(clockHM(-25)).toBe('23:35')
  })
})

describe('deriveClockMilestones - pins, not areas', () => {
  it('nothing to pin without geometry, a drive, or a loop', () => {
    expect(deriveClockMilestones({ polyline: null, outboundKm: 500, loopMin: 700, roundTrip: false })).toEqual([])
    expect(deriveClockMilestones({ polyline: [{ lat: 0, lng: 0 }], outboundKm: 500, loopMin: 700, roundTrip: false })).toEqual([])
    expect(deriveClockMilestones({ polyline: straightPolyline(500), outboundKm: 500, loopMin: 0, roundTrip: false })).toEqual([])
  })

  it('an honest defer pins nothing (the banner already carries the reason)', () => {
    expect(deriveClockMilestones({
      polyline: straightPolyline(400), outboundKm: 400, loopMin: 400 / SPEED,
      roundTrip: false, dayStart: '22:00',
    })).toEqual([])
  })

  it('a single-day drive earns its meal anchor at the right km and clock', () => {
    const pins = deriveClockMilestones({
      polyline: straightPolyline(200), outboundKm: 200, loopMin: 200 / SPEED,
      roundTrip: false, dayStart: '08:30',
    })
    // an 08:30 start is already past the breakfast window, so lunch is the anchor
    const lunch = pins.find(p => p.kind === 'mealtime' && p.timeLabel === '11:30')
    expect(lunch).toBeDefined()
    // 08:30 -> 11:30 is three hours at 42 km/h, so ~126 km into the road
    expect(lunch!.kmIn).toBeGreaterThanOrEqual(120)
    expect(lunch!.kmIn).toBeLessThanOrEqual(132)
    // every pin carries BOTH readings and sits on the road
    for (const p of pins) {
      expect(p.timeLabel).toMatch(/^\d{2}:\d{2}$/)
      expect(p.kmLabel).toBe(`Km ${p.kmIn}`)
      expect(Number.isFinite(p.lat)).toBe(true)
      expect(Number.isFinite(p.lng)).toBe(true)
      expect(p.dayNo).toBe(1)
    }
    // a one-day drive that reaches its destination has no night halt
    expect(pins.some(p => p.kind === 'overnight')).toBe(false)
  })

  it('a multi-day drive pins the halt and the destination', () => {
    const pins = deriveClockMilestones({
      polyline: straightPolyline(800), outboundKm: 800, loopMin: 800 / SPEED,
      roundTrip: false, dayStart: '08:30',
    })
    const halt = pins.find(p => p.kind === 'overnight' && p.dayNo === 1)
    expect(halt).toBeDefined()
    // the load-balanced split halts day 1 near 400 km
    expect(halt!.kmIn).toBeGreaterThanOrEqual(380)
    expect(halt!.kmIn).toBeLessThanOrEqual(420)
    // the halt is the end of the driving day - never a late-night pin
    expect(halt!.etaMin).toBeLessThanOrEqual(21 * 60)
    const dest = pins.find(p => p.kind === 'destination')
    expect(dest).toBeDefined()
    expect(dest!.kmIn).toBe(800)
    // meals still pin on day 2, on their own km
    const day2 = pins.find(p => p.kind === 'mealtime' && p.dayNo === 2)
    expect(day2).toBeDefined()
    expect(day2!.kmIn).toBeGreaterThan(400)
  })

  it('a late start that becomes a hop pins only the night halt', () => {
    const pins = deriveClockMilestones({
      polyline: straightPolyline(600), outboundKm: 600, loopMin: 600 / SPEED,
      roundTrip: false, dayStart: '19:00',
    })
    expect(pins).toHaveLength(1)
    expect(pins[0].kind).toBe('overnight')
    expect(pins[0].dayNo).toBe(1)
    expect(pins[0].kmLabel).toBe(`Km ${pins[0].kmIn}`)
  })

  it('round trip: return-day labels land on the REVERSED road and are tagged', () => {
    const outbound = 600
    const pins = deriveClockMilestones({
      polyline: straightPolyline(outbound), outboundKm: outbound,
      loopMin: (outbound * 2) / SPEED, roundTrip: true, dayStart: '08:30',
    })
    // the honest #145 walk splits each leg into its own day(s) — both legs are walked
    const outLeg = pins.filter(p => p.leg === 'outbound')
    const backLeg = pins.filter(p => p.leg === 'return')
    expect(outLeg.length).toBeGreaterThan(0)
    expect(backLeg.length).toBeGreaterThan(0)
    // km is per-leg: the outbound runs 0 → turnaround, the return runs 0 → home
    for (const p of outLeg) expect(p.kmIn).toBeLessThanOrEqual(outbound)
    for (const p of backLeg) expect(p.kmIn).toBeLessThanOrEqual(outbound)
    // the return's final destination label is the homecoming, back at the origin
    const home = backLeg.find(p => p.kind === 'destination')
    expect(home).toBeDefined()
    expect(home!.kmIn).toBe(outbound)
    expect(home!.lng).toBeCloseTo(0, 3)
    // a return label partway back sits west of the turnaround on the same road
    const mid = backLeg.find(p => p.kmIn > 0 && p.kmIn < outbound)
    if (mid) {
      const turnaroundLng = outbound * DEG_KM
      expect(mid.lng).toBeLessThan(turnaroundLng)
      expect(mid.lng).toBeCloseTo(turnaroundLng - mid.kmIn * DEG_KM, 2)
    }
  })

  it('a dated trip carries the calendar date on every label', () => {
    const pins = deriveClockMilestones({
      polyline: straightPolyline(800), outboundKm: 800, loopMin: 800 / SPEED,
      roundTrip: false, dayStart: '08:30', tripStartDate: '2026-10-02',
    })
    expect(pins.length).toBeGreaterThan(0)
    for (const p of pins) expect(p.dateLabel).toMatch(/^\d{1,2} \w{3}$/)
    // day 2's halt (the ~400 km mark) lands the day after the start
    const day2 = pins.find(p => p.dayNo === 2)
    expect(day2).toBeDefined()
    expect(day2!.dateLabel).toBe('3 Oct')
  })

  it('an undated call keeps the date empty rather than guessing', () => {
    const pins = deriveClockMilestones({
      polyline: straightPolyline(200), outboundKm: 200, loopMin: 200 / SPEED,
      roundTrip: false, dayStart: '08:30',
    })
    expect(pins.length).toBeGreaterThan(0)
    for (const p of pins) expect(p.dateLabel).toBe('')
  })

  it('pins follow the polyline when it bends', () => {
    // an L route: east, then north. A pin past the corner must be off the
    // straight chord - plain lng interpolation would keep it at lat 0.
    const poly = [
      { lat: 0, lng: 0 }, { lat: 0, lng: 3.6 },
      { lat: 3.6, lng: 3.6 }, { lat: 5, lng: 3.6 },
    ]
    const pins = deriveClockMilestones({
      polyline: poly, outboundKm: 950, loopMin: 950 / SPEED,
      roundTrip: false, dayStart: '08:30',
    })
    expect(pins.length).toBeGreaterThan(0)
    expect(pins.some(p => p.lat > 1.5)).toBe(true)
  })
})
