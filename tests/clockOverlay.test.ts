// The clock walk turned into ROAD LABELS: one text pair per planned anchor
// with its wall-clock time + calendar date and its road km. No circles, no
// evening band, no moon glyph — a label carries both readings, so time and
// distance are read together at the point they belong to.
// FIX-1: `deriveClockMilestones` takes the walk result (as MapTab passes its
// `clockVerdict`), never the walk inputs — so fixtures invoke `planTravelClock`
// directly and these tests pin the projection, not the engine.
import { describe, expect, it } from 'vitest'
import { haversineKm } from '../src/lib/geo'
import { clockHM, deriveClockMilestones } from '../src/lib/clockOverlay'
import { planTravelClock } from '../src/lib/ridePlan'

/** A straight east-west polyline at the equator; ~111.195 km per degree. */
function straightPolyline(km: number, steps = 60): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = []
  for (let i = 0; i <= steps; i++) pts.push({ lat: 0, lng: (km / 111.195) * (i / steps) })
  return pts
}
const KM_PER_DEG = haversineKm(0, 0, 0, 1) // the fixture's own scale, measured
const DEG_KM = 1 / KM_PER_DEG

const SPEED = 0.7 // km per minute - 42 km/h

/** The FIX-1 contract: callers walk the engine (exactly as MapTab does for the
 *  banner), then PROJECT the verdict onto the road — never re-walk inside. */
function walk(totalKm: number, driveMin: number, extra: { dayStart?: string; roundTrip?: boolean } = {}) {
  return planTravelClock({ totalKm, driveMinutes: driveMin, dayStart: extra.dayStart ?? '08:30', roundTrip: extra.roundTrip })
}

describe('clockHM', () => {
  it('formats minutes-since-midnight as a wall clock, wrapping past midnight', () => {
    expect(clockHM(0)).toBe('00:00')
    expect(clockHM(720)).toBe('12:00')
    expect(clockHM(1385)).toBe('23:05')
    expect(clockHM(-25)).toBe('23:35')
  })
})

describe('deriveClockMilestones - labels, not areas', () => {
  it('nothing to pin without geometry; a drive-less verdict pins nothing', () => {
    const empty = walk(1, 1)
    expect(empty.verdict).toBe('ok')
    expect(deriveClockMilestones({ verdict: empty, polyline: null })).toEqual([])
    expect(deriveClockMilestones({ verdict: empty, polyline: [{ lat: 0, lng: 0 }] })).toEqual([])
  })

  it('an honest defer pins nothing (the banner already carries the reason)', () => {
    const verdict = walk(400, 400 / SPEED, { dayStart: '22:00' })
    expect(verdict.verdict).toBe('defer')
    expect(deriveClockMilestones({ verdict, polyline: straightPolyline(400) })).toEqual([])
  })

  it('a single-day drive earns its meal anchor at the right km and clock', () => {
    const pins = deriveClockMilestones({
      verdict: walk(200, 200 / SPEED),
      polyline: straightPolyline(200),
    })
    // an 08:30 start is already past the breakfast window, so lunch is the anchor
    const lunch = pins.find(p => p.kind === 'mealtime' && p.timeLabel === '11:30')
    expect(lunch).toBeDefined()
    // 08:30 -> 11:30 is three hours at 42 km/h, so ~126 km into the road
    expect(lunch!.kmIn).toBeGreaterThanOrEqual(120)
    expect(lunch!.kmIn).toBeLessThanOrEqual(132)
    // every label carries BOTH readings and sits on the road
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

  it('a multi-day drive labels the halt and the destination', () => {
    const pins = deriveClockMilestones({
      verdict: walk(800, 800 / SPEED),
      polyline: straightPolyline(800),
    })
    const halt = pins.find(p => p.kind === 'overnight' && p.dayNo === 1)
    expect(halt).toBeDefined()
    // the load-balanced split halts day 1 near 400 km
    expect(halt!.kmIn).toBeGreaterThanOrEqual(380)
    expect(halt!.kmIn).toBeLessThanOrEqual(420)
    // the halt is the end of the driving day — never a late-night label
    expect(halt!.etaMin).toBeLessThanOrEqual(21 * 60)
    const dest = pins.find(p => p.kind === 'destination')
    expect(dest).toBeDefined()
    expect(dest!.kmIn).toBe(800)
    // meals still label on day 2, on their own km
    const day2 = pins.find(p => p.kind === 'mealtime' && p.dayNo === 2)
    expect(day2).toBeDefined()
    expect(day2!.kmIn).toBeGreaterThan(400)
  })

  it('a late start that becomes a hop labels only the night halt', () => {
    const pins = deriveClockMilestones({
      verdict: walk(600, 600 / SPEED, { dayStart: '19:00' }),
      polyline: straightPolyline(600),
    })
    expect(pins).toHaveLength(1)
    expect(pins[0].kind).toBe('overnight')
    expect(pins[0].dayNo).toBe(1)
    expect(pins[0].kmLabel).toBe(`Km ${pins[0].kmIn}`)
  })

  it('round trip: return-day labels land on the REVERSED road and are tagged', () => {
    const outbound = 600
    const pins = deriveClockMilestones({
      verdict: walk(outbound, outbound / SPEED, { roundTrip: true }),
      polyline: straightPolyline(outbound),
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

  it('return-leg chips carry their own arrow — no silent "Km 500" twice', () => {
    const outbound = 600
    const pins = deriveClockMilestones({
      verdict: walk(outbound, outbound / SPEED, { roundTrip: true }),
      polyline: straightPolyline(outbound),
    })
    const outLeg = pins.filter(p => p.leg === 'outbound')
    const backLeg = pins.filter(p => p.leg === 'return')
    expect(outLeg.length).toBeGreaterThan(0)
    expect(backLeg.length).toBeGreaterThan(0)
    // the outbound keeps the plain chip…
    for (const p of outLeg) expect(p.kmLabel).toBe(`Km ${p.kmIn}`)
    // …the drive home carries its own ↩, so the same number never means two places
    for (const p of backLeg) expect(p.kmLabel).toBe(`Km ${p.kmIn} ↩`)
  })

  it('a dated trip carries the calendar date on every label', () => {
    const pins = deriveClockMilestones({
      verdict: walk(800, 800 / SPEED),
      polyline: straightPolyline(800),
      tripStartDate: '2026-10-02',
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
      verdict: walk(200, 200 / SPEED),
      polyline: straightPolyline(200),
    })
    expect(pins.length).toBeGreaterThan(0)
    for (const p of pins) expect(p.dateLabel).toBe('')
  })

  it('labels follow the polyline when it bends', () => {
    // an L route: east, then north. A label past the corner must be off the
    // straight chord — plain lng interpolation would keep it at lat 0.
    const poly = [
      { lat: 0, lng: 0 }, { lat: 0, lng: 3.6 },
      { lat: 3.6, lng: 3.6 }, { lat: 5, lng: 3.6 },
    ]
    const pins = deriveClockMilestones({
      verdict: walk(950, 950 / SPEED),
      polyline: poly,
    })
    expect(pins.length).toBeGreaterThan(0)
    expect(pins.some(p => p.lat > 1.5)).toBe(true)
  })

  it('the projection never re-walks: same verdict, same labels', () => {
    // FIX-1's kill condition — the projection is a pure function of the walk
    // result, plus the calendar date. Two projections of one verdict agree
    // field-for-field (including the empty date when no start date is given),
    // so the map and the banner cannot drift by construction.
    const verdict = walk(800, 800 / SPEED)
    const poly = straightPolyline(800)
    const once = deriveClockMilestones({ verdict, polyline: poly })
    const twice = deriveClockMilestones({ verdict, polyline: poly })
    expect(once).toEqual(twice)
    expect(once.length).toBeGreaterThan(0)
    // the date is the only input besides the verdict, and it is explicit
    const dated = deriveClockMilestones({ verdict, polyline: poly, tripStartDate: '2026-10-02' })
    expect(dated.map(p => p.dateLabel)).toEqual(once.map(p =>
      p.dayNo === 1 ? '2 Oct' : p.dayNo === 2 ? '3 Oct' : p.dateLabel,
    ))
    // and with neither date input the overlay is timeless — all future
    for (const p of once) expect(p.dayState).toBe('future')
  })

  it('dayState splits history, the active day, and plan on a dated trip', () => {
    // Phase 1's core: trip starts 2026-10-02, "today" is 2026-10-03 — day 1's
    // labels are driven history, day 2's are the active day, anything later
    // is still plan. String comparison only: no Date objects, no tz flips.
    const pins = deriveClockMilestones({
      verdict: walk(800, 800 / SPEED),
      polyline: straightPolyline(800),
      tripStartDate: '2026-10-02',
      todayISO: '2026-10-03',
    })
    const day1 = pins.filter(p => p.dayNo === 1)
    const day2 = pins.filter(p => p.dayNo === 2)
    expect(day1.length).toBeGreaterThan(0)
    expect(day2.length).toBeGreaterThan(0)
    for (const p of day1) expect(p.dayState).toBe('past')
    for (const p of day2) expect(p.dayState).toBe('today')
  })

  it('a trip entirely in the past renders all-dimmed; a future trip all-full', () => {
    const back = deriveClockMilestones({
      verdict: walk(200, 200 / SPEED),
      polyline: straightPolyline(200),
      tripStartDate: '2026-10-02',
      todayISO: '2026-10-10',
    })
    expect(back.length).toBeGreaterThan(0)
    for (const p of back) expect(p.dayState).toBe('past')
    const ahead = deriveClockMilestones({
      verdict: walk(200, 200 / SPEED),
      polyline: straightPolyline(200),
      tripStartDate: '2026-10-02',
      todayISO: '2026-09-01',
    })
    expect(ahead.length).toBeGreaterThan(0)
    for (const p of ahead) expect(p.dayState).toBe('future')
  })

  it('a malformed "now" degrades to timeless instead of lying', () => {
    const pins = deriveClockMilestones({
      verdict: walk(200, 200 / SPEED),
      polyline: straightPolyline(200),
      tripStartDate: '2026-10-02',
      todayISO: 'next Friday',
    })
    for (const p of pins) expect(p.dayState).toBe('future')
  })
})
