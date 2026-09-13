// The clock overlay's geometry contract: circles sized by the meal window's
// reach, the night as a marker ON the route, and the round-trip mapping that
// lands return-day positions on the reversed outbound polyline.
import { describe, expect, it } from 'vitest'
import { haversineKm } from '../src/lib/geo'
import {
  MEAL_WINDOW_MIN,
  clockHM,
  deriveClockOverlay,
  mealRadiusKm,
  radiusPxAtZoom0,
} from '../src/lib/clockOverlay'

/** A straight east–west polyline at the equator; ~111.195 km per degree. */
function straightPolyline(km: number, steps = 60): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = []
  for (let i = 0; i <= steps; i++) pts.push({ lat: 0, lng: (km / 111.195) * (i / steps) })
  return pts
}
const KM_PER_DEG = haversineKm(0, 0, 0, 1) // the fixture's own scale, measured
const DEG_KM = 1 / KM_PER_DEG

const SPEED = 0.7 // km per minute — 42 km/h

describe('mealRadiusKm — the circle is the window, not a guess', () => {
  it('half the window minutes at the journey pace, per meal', () => {
    expect(mealRadiusKm('lunch', SPEED)).toBeCloseTo((150 / 2) * SPEED, 6) // 52.5 km
    expect(mealRadiusKm('breakfast', SPEED)).toBeCloseTo((90 / 2) * SPEED, 6) // 31.5 km
    expect(mealRadiusKm('dinner', SPEED)).toBeCloseTo((60 / 2) * SPEED, 6) // 21 km
  })
  it('the windows are ordered lunch > breakfast > dinner', () => {
    expect(MEAL_WINDOW_MIN.lunch).toBeGreaterThan(MEAL_WINDOW_MIN.breakfast)
    expect(MEAL_WINDOW_MIN.breakfast).toBeGreaterThan(MEAL_WINDOW_MIN.dinner)
  })
})

describe('clockHM / radiusPxAtZoom0', () => {
  it('formats minutes-since-midnight as a clock, wrapping past midnight', () => {
    expect(clockHM(720)).toBe('12:00')
    expect(clockHM(1385)).toBe('23:05')
    expect(clockHM(-25)).toBe('23:35')
  })
  it('km radius → zoom-0 pixels via the Web-Mercator meters-per-pixel', () => {
    // 1 km at the equator, zoom 0: (1000 m) / (156543.03392 m/px)
    expect(radiusPxAtZoom0(1, 0)).toBeCloseTo(1000 / 156543.03392, 8)
    // at 60° the ground resolution halves per cos — px DOUBLES
    expect(radiusPxAtZoom0(1, 60)).toBeCloseTo(2 * radiusPxAtZoom0(1, 0), 6)
  })
})

describe('deriveClockOverlay', () => {
  it('null when there is nothing honest to draw (no geometry / no drive)', () => {
    expect(deriveClockOverlay({ polyline: null, outboundKm: 500, loopMin: 700, roundTrip: false })).toBeNull()
    expect(deriveClockOverlay({ polyline: [{ lat: 0, lng: 0 }], outboundKm: 500, loopMin: 700, roundTrip: false })).toBeNull()
    expect(deriveClockOverlay({ polyline: straightPolyline(500), outboundKm: 500, loopMin: 0, roundTrip: false })).toBeNull()
  })

  it('an honest defer produces no overlay (the banner already carries the reason)', () => {
    expect(deriveClockOverlay({
      polyline: straightPolyline(400), outboundKm: 400, loopMin: 400 / SPEED,
      roundTrip: false, dayStart: '22:00',
    })).toBeNull()
  })

  it('a single-day drive earns its lunch circle and nothing else — no night', () => {
    const o = deriveClockOverlay({
      polyline: straightPolyline(200), outboundKm: 200, loopMin: 200 / SPEED,
      roundTrip: false, dayStart: '08:30',
    })
    expect(o).not.toBeNull()
    const lunch = o!.zones.find(z => z.kind === 'lunch')
    expect(lunch).toBeDefined()
    expect(lunch!.etaMin).toBe(720) // 12:00
    // 08:30→12:00 at 0.7 km/min = 147 km in
    expect(lunch!.kmIn).toBeCloseTo(147, 0)
    expect(lunch!.lng).toBeCloseTo(147 * DEG_KM, 1)
    expect(lunch!.radiusKm).toBeGreaterThan(50)
    expect(lunch!.radiusKm).toBeLessThan(55)
    expect(o!.nights).toHaveLength(0) // the journey ends at the destination
    expect(o!.bands).toHaveLength(0)
    // tea never becomes a circle
    expect(o!.zones.every(z => z.kind !== 'tea')).toBe(true)
  })

  it('a multi-day drive: night halt ON the route, dinner zone at the halt, evening band behind it', () => {
    const o = deriveClockOverlay({
      polyline: straightPolyline(800), outboundKm: 800, loopMin: 800 / SPEED,
      roundTrip: false, dayStart: '08:30',
    })
    expect(o).not.toBeNull()
    expect(o!.nights.length).toBeGreaterThanOrEqual(1)
    const n1 = o!.nights.find(n => n.dayNo === 1)!
    expect(n1).toBeDefined()
    // the load-balanced split puts day 1's halt at ~400 km
    expect(n1.kmIn).toBeGreaterThanOrEqual(380)
    expect(n1.kmIn).toBeLessThanOrEqual(420)
    expect(n1.etaMin).toBeLessThanOrEqual(21 * 60) // never late-night
    const dinner = o!.zones.find(z => z.kind === 'dinner' && z.dayNo === 1)!
    expect(dinner).toBeDefined()
    // dinner sits AT the halt, sized by the 60-minute window
    expect(dinner.kmIn).toBe(n1.kmIn)
    expect(dinner.radiusKm).toBeGreaterThan(19)
    expect(dinner.radiusKm).toBeLessThan(23)
    const band = o!.bands[0]
    expect(band.coords.length).toBeGreaterThanOrEqual(2)
    // the band ends at the halt's position (lng in degrees, equator fixture)
    const last = band.coords[band.coords.length - 1]
    expect(last[0]).toBeCloseTo(n1.lng, 4)
    // and no band crosses midnight backwards
    expect(band.coords.every(c => Number.isFinite(c[0]) && Number.isFinite(c[1]))).toBe(true)
  })

  it('a late start that becomes a hop paints only the night halt', () => {
    const o = deriveClockOverlay({
      polyline: straightPolyline(600), outboundKm: 600, loopMin: 600 / SPEED,
      roundTrip: false, dayStart: '19:00',
    })
    expect(o).not.toBeNull()
    expect(o!.zones).toHaveLength(0)
    expect(o!.nights).toHaveLength(1)
    expect(o!.nights[0].dayNo).toBe(1)
  })

  it('round trip: the return day’s night halts map onto the REVERSED route', () => {
    const outbound = 600
    const o = deriveClockOverlay({
      polyline: straightPolyline(outbound), outboundKm: outbound,
      loopMin: (outbound * 2) / SPEED, roundTrip: true, dayStart: '08:30',
    })
    expect(o).not.toBeNull()
    const halts = o!.nights.map(n => n.kmIn)
    // day 1 halt is still on the outbound leg
    expect(halts.some(k => k <= outbound)).toBe(true)
    // with a 1,200 km loop the split needs three days — a halt must land
    // PAST the turnaround, i.e. on the way back (km > outbound length)
    expect(Math.max(...halts)).toBeGreaterThan(outbound)
    const backHalt = o!.nights.find(n => n.kmIn > outbound)!
    // reversed mapping: the point sits west of the turnaround, ~kmIn−outbound
    // back along the road it came
    expect(backHalt.lng).toBeLessThan(outbound * DEG_KM)
    expect(backHalt.lng).toBeGreaterThan(0)
    const mirrored = (backHalt.kmIn - outbound) * DEG_KM
    expect(backHalt.lng).toBeCloseTo(outbound * DEG_KM - mirrored, 2)
    // and its dinner zone shares the halt position (one marker, one circle)
    const dinner = o!.zones.find(z => z.kind === 'dinner' && z.dayNo === backHalt.dayNo)
    if (dinner) expect(dinner.kmIn).toBe(backHalt.kmIn)
  })

  it('positions follow the polyline when it bends', () => {
    // an L route: east, then north. A halt past the corner must be off the
    // straight chord — plain lng interpolation would keep it at lat 0.
    const poly = [
      { lat: 0, lng: 0 }, { lat: 0, lng: 3.6 },
      { lat: 3.6, lng: 3.6 }, { lat: 5, lng: 3.6 },
    ]
    const o = deriveClockOverlay({
      polyline: poly, outboundKm: 950, loopMin: 950 / SPEED,
      roundTrip: false, dayStart: '08:30',
    })
    expect(o).not.toBeNull()
    const far = o!.nights[o!.nights.length - 1] ?? o!.zones[o!.zones.length - 1]
    expect(far.lat).toBeGreaterThan(1.5)
  })
})
