// Direct recheck repairs (DeepSeek lane): candidate arrival clock in scoring,
// verdict notes independent of ranges, the measured directed arrival contract,
// and the rain-vs-eligibility separation. Consumer-level, no network.
import { describe, it, expect } from 'vitest'
import { assignSegmentHits, scoreHitForSegment, type RideSegment } from '../src/lib/ridePlan'
import { daySlots, type DaySlotsDeps } from '../src/lib/daySlots'
import { placeHoursFromPeriods, type RawHoursPeriod } from '../src/lib/providers/hours'
import { hoursCardText, hoursDisplayFor, visitDateForDay } from '../src/lib/hoursContext'
import { candidateArrivalMin } from '../src/lib/candidateArrival'
import { withRoadMeasurement, withoutRoadMeasurement } from '../src/lib/roadEvidence'
import { roadDetourFromLegs, type RoadMeasurement } from '../src/lib/providers/roadMeasure'
import type { MeasuredRoadFact } from '../src/lib/providers/hits'
import type { PlaceHit, SegmentHit } from '../src/lib/geocode'

const anchors = [{ lat: 10, lng: 76 }]
const week = [0, 1, 2, 3, 4, 5, 6]

function hit(id: string, over: Partial<PlaceHit> = {}): PlaceHit {
  return { id, name: id, latitude: 10.01, longitude: 76, kind: 'poi', category: 'sightseeing', alongRouteKm: 100, ...over }
}

function seg(over: Partial<RideSegment> = {}): RideSegment {
  return {
    index: 0, purpose: 'stretch', label: 'Stretch', targetKm: 100, minKm: 80, maxKm: 130,
    kmFromPrev: 100, minutesFromPrev: 120, hint: '', etaMinutes: 960, ...over,
  }
}

function period(day: number, open: string, close: string): RawHoursPeriod {
  const [oh, om] = open.split(':').map(Number)
  const [ch, cm] = close.split(':').map(Number)
  return { open: { day, hour: oh, minute: om }, close: { day, hour: ch, minute: cm } }
}

const weekly = (days: number[], spans: Array<[string, string]>) =>
  days.flatMap(d => spans.map(([a, b]) => period(d, a, b)))
const hoursFor = (periods: RawHoursPeriod[]) => placeHoursFromPeriods(periods, undefined, '2026-11-01')
const daily = (open: string, close: string) => hoursFor(weekly(week, [[open, close]]))
const mondayClosed = () => hoursFor(weekly([0, 2, 3, 4, 5, 6], [['09:00', '17:00']]))

/** A context-bound measured fact; identity and clock default to the fixtures below. */
const measuredFact = (over: Partial<MeasuredRoadFact> = {}): MeasuredRoadFact => ({
  hitId: 'measured', originKey: 'origin-a', routeFingerprint: 'route-a', generation: 1,
  departAtMin: 960, detourMin: 60, arriveMin: 20, ...over,
})

describe('D1 — the hours check reads the candidate arrival clock, not the corridor ETA', () => {
  // 16:00 corridor target, 20 km spur at 40 km/h => 60 return minutes => 30 outward.
  // 16:30 arrival + 60-minute visit ends 17:30, past a 17:00 close.
  const venue = hit('venue', { hours: daily('09:00', '17:00'), offRouteKm: 20 })
  const bare = hit('bare', { category: 'sightseeing', offRouteKm: 20 })
  const target = [seg({ etaMinutes: 16 * 60 })]

  it('scores the overrun that the bare ETA hid', () => {
    const withHours = assignSegmentHits([venue], target, anchors, { visitDates: ['2026-11-08'] })[0].score
    const without = assignSegmentHits([bare], target, anchors, { visitDates: ['2026-11-08'] })[0].score
    expect(withHours - without).toBeCloseTo(5, 5) // miss 30 min -> round(30/15)*2+1
  })

  it('uses the directed measured arrival leg at its own departure clock', () => {
    const measured = hit('measured', {
      hours: daily('09:00', '17:00'), offRouteKm: 20,
      measuredRoadFact: measuredFact({ hitId: 'measured', departAtMin: 16 * 60, arriveMin: 20, detourMin: 60 }),
    })
    const withHours = assignSegmentHits([measured], target, anchors, { visitDates: ['2026-11-08'] })[0].score
    const without = assignSegmentHits([bare], target, anchors, { visitDates: ['2026-11-08'] })[0].score
    expect(withHours - without).toBeCloseTo(3, 5) // arrival 16:20 + 60 -> miss 20
  })

  it('returns unknown when the measured context does not match, never half a measured total', () => {
    const wrongClock = hit('wrong-clock', {
      hours: daily('09:00', '17:00'), offRouteKm: 20,
      measuredRoadFact: measuredFact({ hitId: 'wrong-clock', departAtMin: 15 * 60, arriveMin: 20, detourMin: 60 }),
    })
    // With no measured arrival the hours check stays neutral: it must not halve
    // the measured 60-minute total to invent a 30-minute outward leg.
    expect(candidateArrivalMin({ hit: wrongClock, etaMinutes: 16 * 60, detourMin: 60 })).toBeNull()
    const withHours = assignSegmentHits([wrongClock], target, anchors, { visitDates: ['2026-11-08'] })[0].score
    const without = assignSegmentHits([bare], target, anchors, { visitDates: ['2026-11-08'] })[0].score
    expect(withHours - without).toBeCloseTo(0, 5)
  })
})

describe('D3 — one arrival rule for the slot engine and the scorer', () => {
  const candidate = (over: Partial<PlaceHit> = {}): PlaceHit => hit('cand', { category: 'food', offRouteKm: 20, ...over })
  const baseSlot: SegmentHit = { segment: seg({ purpose: 'meal', etaMinutes: 735 }), hit: null, score: 0 }
  const depsFor = (h: PlaceHit): DaySlotsDeps => ({
    haltSegments: [baseSlot], dayStops: [], anchors, altPool: [h],
    // A relaxed budget (60) funds the 60-minute return detour these fixtures use.
    travelStyle: 'relaxed',
  })

  it('estimates arrival as ETA plus half the return total', () => {
    const slot = daySlots(0, depsFor(candidate()))[0]
    expect(slot.candidates[0].arriveMin).toBe(735 + 30)
  })

  it('uses the directed measured leg when its clock matches the slot ETA', () => {
    const slot = daySlots(0, depsFor(candidate({
      measuredRoadFact: measuredFact({ hitId: 'cand', departAtMin: 735, arriveMin: 20, detourMin: 60 }),
    })))[0]
    expect(slot.candidates[0].arriveMin).toBe(735 + 20)
  })

  it('leaves arrival unknown when the measured context belongs to another departure', () => {
    const slot = daySlots(0, depsFor(candidate({
      measuredRoadFact: measuredFact({ hitId: 'cand', departAtMin: 700, arriveMin: 20, detourMin: 60 }),
    })))[0]
    expect(slot.candidates[0].arriveMin).toBeNull()
  })

  it('the helper itself keeps the same contract', () => {
    const plain = hit('plain')
    const matched = hit('cand', { measuredRoadFact: measuredFact({ hitId: 'cand', departAtMin: 735, arriveMin: 20, detourMin: 60 }) })
    expect(candidateArrivalMin({ hit: plain, etaMinutes: 735, detourMin: 60 })).toBe(765)
    expect(candidateArrivalMin({ hit: matched, etaMinutes: 735, detourMin: 60 })).toBe(755)
    // A mismatched clock, identity, route or origin is UNKNOWN — never half the total.
    expect(candidateArrivalMin({ hit: matched, etaMinutes: 800, detourMin: 60 })).toBeNull()
    expect(candidateArrivalMin({ hit: hit('other', { measuredRoadFact: measuredFact({ hitId: 'cand', departAtMin: 735, arriveMin: 20, detourMin: 60 }) }), etaMinutes: 735, detourMin: 60 })).toBeNull()
    expect(candidateArrivalMin({ hit: matched, etaMinutes: 735, detourMin: 60, context: { route: { generation: 2, routeFingerprint: 'route-a' } } })).toBeNull()
    expect(candidateArrivalMin({ hit: matched, etaMinutes: 735, detourMin: 60, context: { originKey: 'other-origin' } })).toBeNull()
    expect(candidateArrivalMin({ hit: matched, etaMinutes: 735, detourMin: 60, context: { route: { generation: 1, routeFingerprint: 'route-a' }, originKey: 'origin-a' } })).toBe(755)
    expect(candidateArrivalMin({ hit: plain, etaMinutes: null, detourMin: 60 })).toBeNull()
    expect(candidateArrivalMin({ hit: plain, etaMinutes: 735, detourMin: null })).toBeNull()
  })
})

describe('D2 — the card renders a known closure even with no provable interval', () => {
  const fmt = (a: string, b: string) => `${a}–${b}`

  it('a Monday-closed museum shows the closed note despite null ranges', () => {
    const shown = hoursDisplayFor({ category: 'museum', hours: mondayClosed() }, {
      date: '2026-11-09', arrivalMin: 10 * 60, visitMin: 90,
    })
    expect(shown.ranges).toBeNull()
    expect(shown.verdict).toBe('closed')
    expect(hoursCardText(shown, fmt)).toBe('(closed this weekday)')
  })

  it('an open day still shows the interval text', () => {
    const shown = hoursDisplayFor({ category: 'museum', hours: daily('09:00', '17:00') }, {
      date: '2026-11-08', arrivalMin: 10 * 60, visitMin: 90,
    })
    expect(hoursCardText(shown, fmt)).toBe('09:00–17:00')
  })

  it('a search row without an arrival clock shows intervals but no verdict', () => {
    const shown = hoursDisplayFor({ category: 'museum', hours: daily('09:00', '17:00') }, {
      date: '2026-11-08', arrivalMin: null,
    })
    expect(shown.verdict).toBe('unknown')
    expect(shown.note).toBeNull()
    expect(hoursCardText(shown, fmt)).toBe('09:00–17:00')
  })
})

describe('rain is a preference, never eligibility', () => {
  const fuel = (rainy: boolean) => seg({ purpose: 'fuel', etaMinutes: 600, rainy })

  it('a heritage fort cannot fill fuel in the rain', () => {
    const fort = hit('fort', { category: 'museum', family: 'heritage', subtype: 'fort', offRouteKm: 0 })
    expect(scoreHitForSegment(fort, fuel(true), anchors)).toBeNull()
    expect(scoreHitForSegment(fort, fuel(false), anchors)).toBeNull()
  })

  it('an unconfirmed heritage rain rule does not borrow the museum shelter boost', () => {
    // Same road position and fit; only the rain state differs. A sheltered
    // fall-through would lower the wet score by 4 points.
    const fort = hit('fort', { category: 'museum', family: 'heritage', subtype: 'fort', offRouteKm: 0 })
    const dry = scoreHitForSegment(fort, seg({ purpose: 'stretch', rainy: false }), anchors)
    const wet = scoreHitForSegment(fort, seg({ purpose: 'stretch', rainy: true }), anchors)
    expect(dry).not.toBeNull()
    expect(wet).toBe(dry)
  })

  it('a confirmed exposed family still loses a point in the rain', () => {
    const park = hit('park', { category: 'nature', family: 'nature', subtype: 'wildlife', offRouteKm: 0 })
    const dry = scoreHitForSegment(park, seg({ purpose: 'stretch', rainy: false }), anchors) as number
    const wet = scoreHitForSegment(park, seg({ purpose: 'stretch', rainy: true }), anchors) as number
    expect(wet - dry).toBeCloseTo(4, 5)
  })

  it('a confirmed sheltered family still gains a point in the rain', () => {
    const temple = hit('temple', { category: 'temple', family: 'faith', subtype: 'temple', offRouteKm: 0 })
    const dry = scoreHitForSegment(temple, seg({ purpose: 'stretch', rainy: false }), anchors) as number
    const wet = scoreHitForSegment(temple, seg({ purpose: 'stretch', rainy: true }), anchors) as number
    expect(wet - dry).toBeCloseTo(-4, 5)
  })
})

describe('the trip calendar still supplies the date', () => {
  it('maps the day index to the trip date', () => {
    expect(visitDateForDay('2026-11-05', 2)).toBe('2026-11-07')
  })
})

describe('measured road evidence is context-bound, never stale', () => {
  const active = { generation: 3, routeFingerprint: 'route-a' }
  const measurement = roadDetourFromLegs({
    hitId: 'cand',
    baselineMin: 60,
    via: { totalMin: 84, arrivalLegMin: 25 },
    generation: 3,
    routeFingerprint: 'route-a',
    measuredAt: 1000,
    departAtMin: 720,
  })
  if ('invalid' in measurement) throw new Error('fixture measurement is invalid')

  it('the measurement is 24 extra minutes with a 25-minute directed arrival leg', () => {
    expect(measurement.detourMin).toBe(24)
    expect(measurement.arrivalLegMin).toBe(25)
    expect(measurement.departAtMin).toBe(720)
  })

  it('stamps one context-bound fact when identity, route and generation match', () => {
    const current = withRoadMeasurement(hit('cand'), measurement as RoadMeasurement, active, 'origin-a')
    expect(current.measuredRoadFact).toEqual({
      hitId: 'cand', originKey: 'origin-a', routeFingerprint: 'route-a', generation: 3,
      departAtMin: 720, detourMin: 24, arriveMin: 25,
    })
  })

  it('an already stamped hit loses the stamp when no current measurement is supplied', () => {
    const stamped = withRoadMeasurement(hit('cand'), measurement as RoadMeasurement, active, 'origin-a')
    expect(withRoadMeasurement(stamped, undefined, active, 'origin-a').measuredRoadFact).toBeUndefined()
    expect(withoutRoadMeasurement(stamped).measuredRoadFact).toBeUndefined()
  })

  it('a changed route or generation invalidates an existing stamp', () => {
    const stamped = withRoadMeasurement(hit('cand'), measurement as RoadMeasurement, active, 'origin-a')
    const staleGeneration = withRoadMeasurement(stamped, measurement as RoadMeasurement, { generation: 4, routeFingerprint: 'route-a' }, 'origin-a')
    expect(staleGeneration.measuredRoadFact).toBeUndefined()
    const foreignRoute = withRoadMeasurement(stamped, measurement as RoadMeasurement, { generation: 3, routeFingerprint: 'route-b' }, 'origin-a')
    expect(foreignRoute.measuredRoadFact).toBeUndefined()
  })

  it('a measurement for another hit is rejected, including over an existing stamp', () => {
    const other = withRoadMeasurement(hit('different-place'), measurement as RoadMeasurement, active, 'origin-a')
    expect(other.measuredRoadFact).toBeUndefined()
    const stamped = withRoadMeasurement(hit('cand'), measurement as RoadMeasurement, active, 'origin-a')
    const mismatched = withRoadMeasurement(stamped, { ...(measurement as RoadMeasurement), hitId: 'cand' }, active, 'origin-a')
    expect(mismatched.measuredRoadFact).toBeDefined() // same identity: accepted
    const foreign = withRoadMeasurement(hit('other-place'), { ...(measurement as RoadMeasurement), hitId: 'cand' }, active, 'origin-a')
    expect(foreign.measuredRoadFact).toBeUndefined()
  })

  it('a mismatched measured clock leaves the scorer and slot arrival unknown, never halved', () => {
    const stamped = withRoadMeasurement(hit('cand', { category: 'food' }), measurement as RoadMeasurement, active, 'origin-a')
    // departure 720, read at ETA 800: unknown, not 812 from 24/2.
    expect(candidateArrivalMin({ hit: stamped, etaMinutes: 800, detourMin: 24 })).toBeNull()
    const bare = hit('bare', { category: 'food', offRouteKm: 8 }) // 8 km at 40 km/h = 24 return estimate
    const scored = scoreHitForSegment(stamped, seg({ etaMinutes: 800 }), anchors)
    const scoredBare = scoreHitForSegment(bare, seg({ etaMinutes: 800 }), anchors)
    expect(scored).not.toBeNull()
    expect(scored).toBe(scoredBare) // hours stay neutral on an unknown arrival
    const slot = daySlots(0, {
      haltSegments: [{ segment: seg({ purpose: 'meal', etaMinutes: 800 }), hit: null, score: 0 }],
      dayStops: [], anchors, altPool: [stamped], travelStyle: 'relaxed',
    })[0]
    expect(slot.candidates[0]?.arriveMin).toBeNull()
  })

  it('a matching context drives the same arrival rule as the slot and card', () => {
    const stamped = withRoadMeasurement(hit('cand'), measurement as RoadMeasurement, active, 'origin-a')
    expect(candidateArrivalMin({ hit: stamped, etaMinutes: 720, detourMin: 24 })).toBe(745)
    expect(candidateArrivalMin({ hit: stamped, etaMinutes: 720, detourMin: 24, context: { route: active, originKey: 'origin-a' } })).toBe(745)
    expect(candidateArrivalMin({ hit: stamped, etaMinutes: 720, detourMin: 24, context: { route: active, originKey: 'other-origin' } })).toBeNull()
  })
})
