// PLAN-DAY-PLANNER §14 fixtures — these ARE the spec for the travel clock.
// The 700 km narratives are the headline fixtures; every expectation below is
// derived from the engine's own honest math (blended 42 km/h for car), not
// from the brainstorm's rounded clock times.
import { describe, expect, it } from 'vitest'
import {
  DINNER_WINDOW,
  HALT_MIN,
  LUNCH_WINDOW,
  MIN_PLANNED_DRIVE_KM,
  NIGHT_END_MIN,
  planDriveDays,
  planRideSegments,
  planTravelClock,
  TEA_WINDOW,
} from '../src/lib/ridePlan'
import { computeTotals } from '../src/lib/engine'
import { seedData } from '../src/data/seed'

/** Blended all-India car speed the engine itself assumes (MODE_SPEED.car). */
const CAR_KMH = 42
const driveMinFor = (km: number) => Math.round((km / CAR_KMH) * 60)

describe('planDriveDays — the split (P1-A, §14 balance fixtures)', () => {
  it('700 km → 2 × 350, load-balanced, never 585 + 115', () => {
    const v = planDriveDays({ totalKm: 700, driveMinutes: driveMinFor(700) })
    expect(v).not.toBeNull()
    expect(v!.driveDayCount).toBe(2)
    expect(v!.perDay).toBeCloseTo(350, 0)
    expect(v!.nightHalts).toEqual([350])
  })

  it('1200 km → 3 × 400 (load-balanced)', () => {
    const v = planDriveDays({ totalKm: 1200, driveMinutes: driveMinFor(1200) })
    expect(v!.driveDayCount).toBe(3)
    expect(v!.perDay).toBeCloseTo(400, 0)
  })

  it('300 km → 1 drive day, no overnight proposed', () => {
    const v = planDriveDays({ totalKm: 300, driveMinutes: driveMinFor(300) })
    expect(v!.driveDayCount).toBe(1)
    expect(v!.nightHalts).toEqual([])
  })

  it('rain 60% on the wheel cap shifts the split', () => {
    // rainFactor = 1 − 60/200 = 0.7 → cap 7 h → dailyKmBudget ≈ 294 → 3 days
    const v = planDriveDays({ totalKm: 700, driveMinutes: driveMinFor(700), rainFactor: 0.7 })
    expect(v!.driveDayCount).toBe(3)
  })

  it('packed pushes 11 h, relaxed rests at 8.5 h', () => {
    const packed = planDriveDays({ totalKm: 900, driveMinutes: driveMinFor(900), travelStyle: 'packed' })
    const relaxed = planDriveDays({ totalKm: 900, driveMinutes: driveMinFor(900), travelStyle: 'relaxed' })
    expect(packed!.driveDayCount).toBeLessThan(relaxed!.driveDayCount)
  })
})

describe('planTravelClock — the 700 km headline fixtures', () => {
  const km = 700
  const min = driveMinFor(km)

  it('08:30 start: 2 × 350, lunch in window, halt before night end, dinner at the halt', () => {
    const v = planTravelClock({ totalKm: km, driveMinutes: min, dayStart: '08:30' })
    expect(v.verdict).toBe('ok')
    if (v.verdict !== 'ok') return
    expect(v.days).toHaveLength(2)
    const [d1, d2] = v.days
    expect(d1.nightHaltKm).toBeCloseTo(350, 0)
    // day-2 cadence resets: its lunch lands ~150 km INTO day 2, not 450 from origin
    const d2Lunch = d2.anchors.find(a => a.name === 'lunch')
    expect(d2Lunch).toBeDefined()
    if (d2Lunch) expect(d2Lunch.km).toBeLessThan(350 + 200)
    // day-1 lunch fires in the window
    const d1Lunch = d1.anchors.find(a => a.name === 'lunch')
    expect(d1Lunch).toBeDefined()
    if (d1Lunch) expect(d1Lunch.etaMin).toBeGreaterThanOrEqual(LUNCH_WINDOW[0] - 1)
    // no breakfast: an 08:30 start has eaten at home
    expect(d1.anchors.find(a => a.name === 'breakfast')).toBeUndefined()
    // the halt lands early enough for dinner at the halt, well before night end
    expect(d1.dinnerAtHalt).toBe(true)
    expect(d1.nightHaltEtaMin!).toBeLessThan(NIGHT_END_MIN - 120)
  })

  it('05:00 start: breakfast fires on the road, halt early, dinner at the halt', () => {
    const v = planTravelClock({ totalKm: km, driveMinutes: min, dayStart: '05:00' })
    expect(v.verdict).toBe('ok')
    if (v.verdict !== 'ok') return
    expect(v.days).toHaveLength(2)
    const d1 = v.days[0]
    const breakfast = d1.anchors.find(a => a.name === 'breakfast')
    expect(breakfast).toBeDefined()
    if (breakfast) {
      expect(breakfast.etaMin).toBeGreaterThanOrEqual(8 * 60)
      expect(breakfast.etaMin).toBeLessThanOrEqual(9 * 60 + 30)
    }
    // an early start buys slack and rest, not more km: the halt lands before tea
    expect(d1.nightHaltEtaMin!).toBeLessThan(TEA_WINDOW[1])
    expect(d1.dinnerAtHalt).toBe(true)
  })

  it('14:00 start: day 1 shrinks to a dinner halt, the remainder re-balances', () => {
    const v = planTravelClock({ totalKm: km, driveMinutes: min, dayStart: '14:00' })
    expect(v.verdict).toBe('ok')
    if (v.verdict !== 'ok') return
    const d1 = v.days[0]
    // dinner = the night halt on a late-start day 1
    expect(d1.nightHaltEtaMin!).toBeGreaterThanOrEqual(DINNER_WINDOW[0])
    expect(d1.nightHaltEtaMin!).toBeLessThanOrEqual(DINNER_WINDOW[1])
    expect(d1.dinnerAtHalt).toBe(true)
    // the shrunk remainder never overloads a later day beyond the cap budget
    for (const d of v.days.slice(1)) {
      expect((d.kmCovered - d.startKm) / (km / min)).toBeLessThanOrEqual(10 * 60 + 1)
    }
  })

  it('300 km: 1 drive day, no overnight, arrival inside the waking span', () => {
    const v = planTravelClock({ totalKm: 300, driveMinutes: driveMinFor(300), dayStart: '08:30' })
    expect(v.verdict).toBe('ok')
    if (v.verdict !== 'ok') return
    expect(v.days).toHaveLength(1)
    expect(v.days[0].nightHaltKm).toBeNull()
    expect(v.split?.driveDayCount ?? 1).toBe(1)
  })

  it('22:00 start: defer proposal, no plan produced', () => {
    const v = planTravelClock({ totalKm: 700, driveMinutes: min, dayStart: '22:00' })
    expect(v.verdict).toBe('defer')
  })

  it('18:00 start: short hop to a night halt, dinner inside the window', () => {
    const v = planTravelClock({ totalKm: 700, driveMinutes: min, dayStart: '18:00' })
    expect(v.verdict).toBe('hop')
    if (v.verdict !== 'hop') return
    expect(v.hopKm).toBeGreaterThan(0)
    expect(v.nightHaltEtaMin).toBeGreaterThanOrEqual(DINNER_WINDOW[0])
    expect(v.nightHaltEtaMin).toBeLessThanOrEqual(NIGHT_END_MIN - 60)
  })
})

describe('planRideSegments — the short-trip silence fix', () => {
  it('80 km of 3 h ghat crawl earns its stretch by the clock (the 2 h rule owns it)', () => {
    const segs = planRideSegments({ totalKm: 80, driveMinutes: 180, multiDay: false })
    expect(segs.length).toBeGreaterThan(0)
    expect(segs.some(s => s.purpose === 'stretch')).toBe(true)
  })

  it('a genuinely short hop stays silent', () => {
    expect(planRideSegments({ totalKm: 40, driveMinutes: 45 })).toEqual([])
  })

  it('the destination exclusion zone scales down for short journeys', () => {
    const segs = planRideSegments({ totalKm: 120, driveMinutes: driveMinFor(120) })
    for (const s of segs) expect(s.maxKm).toBeLessThanOrEqual(120 - Math.min(60, 120 * 0.15) + 0.5)
    expect(MIN_PLANNED_DRIVE_KM).toBe(90)
  })
})

describe('halt durations (named constants, PLAN-DAY-PLANNER §5)', () => {
  it('dinner is a 60-min anchor that ends the day; tea is 20', () => {
    expect(HALT_MIN.dinner).toBe(60)
    expect(HALT_MIN.tea).toBe(20)
    expect(HALT_MIN.stretch).toBe(15)
  })
})

describe('P1-E — the structural-night bill line', () => {
  it('an accepted night halt prices the stay: bases × rooms × rate, per-day stacks still sum', () => {
    const trip = structuredClone(seedData.trips[0])
    // strip any pre-existing lodging so the delta is exactly this halt
    trip.days.forEach(d => { d.stops = d.stops.filter(s => s.category !== 'hotel') })
    const before = computeTotals(structuredClone(trip))
    // park the halt on the trip's final stop coords so the journey legs (and
    // the transport line) barely move — the delta is the stay, not the road
    const lastStop = [...trip.days[trip.days.length - 1].stops].slice(-1)[0]
    trip.days[trip.days.length - 1].stops.push({
      id: 'halt_test', title: 'Night halt', category: 'hotel', locationName: 'Una Test Base',
      lat: lastStop.lat, lng: lastStop.lng, description: '', notes: 'Added from the ride plan',
      visitMinutes: 600, openTime: '', closeTime: '', entryFeeInrPerPerson: 0,
      transportCostInrTotal: 0, priority: 'must-do', sourceUrl: '', status: 'suggested', orderInDay: 99,
    } as never)
    const after = computeTotals(structuredClone(trip))
    expect(after.lodgingNights).toBe(before.lodgingNights + 1)
    expect(after.lodgingInr).toBe(after.lodgingNights * after.lodgingRooms * after.lodgingRatePerNight)
    // the trip got dearer by at least the stay line (leg wiggle can add a few
    // rupees of transport, never remove the lodging line)
    expect(after.totalCostInr).toBeGreaterThan(before.totalCostInr + after.lodgingInr - 1)
    const byDaySum = after.byDay.reduce((s, d) => s + d.totalInr, 0)
    expect(byDaySum).toBeCloseTo(after.totalCostInr, 4)
  })
})
