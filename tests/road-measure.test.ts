// Ticket 11 (#896): road-measured detours. Pure fixtures — the transport is
// injected, so nothing here touches the network or the quota store. Covers:
// matching-input math, invalid/negative stays unknown, staleness merge, the
// top-15 cap, the quota pause, and the measured fact winning over estimates.
import { describe, it, expect } from 'vitest'
import {
  roadDetourFromLegs,
  mergeMeasurement,
  topCandidatesForMeasurement,
  measureRoadDetours,
  MEASUREMENT_TOP_CANDIDATES,
  type RoadMeasurement,
} from '../src/lib/providers/roadMeasure'
import { asymmetricDetourMinutes, asymmetricDetourKm } from '../src/lib/providers/hits'
import { scoreHitForSegment } from '../src/lib/ridePlan'

const EAST = [{ lat: 10, lng: 10 }, { lat: 10, lng: 10.5 }]
const FP = 'route-fp-1'

function measurement(over: Partial<RoadMeasurement> = {}): RoadMeasurement {
  return {
    hitId: 'h1', detourMin: 12, returnDetourMin: 24, oneWayArriveMin: 12,
    measured: true, generation: 1, routeFingerprint: FP, measuredAt: 1000, ...over,
  }
}

describe('matching-input math (AC 1, AC 5)', () => {
  it('derives the directed delta and the return-driving fact (8 km spur → 12 min one-way → 24 return)', () => {
    const m = roadDetourFromLegs({ hitId: 'h1', baselineMin: 60, viaTotalMin: 72, generation: 1, routeFingerprint: FP, measuredAt: 1000 })
    expect(m).toMatchObject({ detourMin: 12, returnDetourMin: 24, oneWayArriveMin: 12, measured: true })
  })

  it('a zero delta is a valid on-road fact, never unknown', () => {
    expect(roadDetourFromLegs({ hitId: 'h1', baselineMin: 60, viaTotalMin: 60, generation: 1, routeFingerprint: FP, measuredAt: 1000 }))
      .toMatchObject({ detourMin: 0, returnDetourMin: 0 })
  })

  it('a negative delta is engine noise and stays unknown', () => {
    expect(roadDetourFromLegs({ hitId: 'h1', baselineMin: 72, viaTotalMin: 60, generation: 1, routeFingerprint: FP, measuredAt: 1000 }))
      .toMatchObject({ invalid: true })
  })

  it('missing, non-finite or negative inputs stay unknown', () => {
    for (const bad of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      expect(roadDetourFromLegs({ hitId: 'h', baselineMin: bad as never, viaTotalMin: 72, generation: 1, routeFingerprint: FP, measuredAt: 1000 }).invalid).toBe(true)
      expect(roadDetourFromLegs({ hitId: 'h', baselineMin: 60, viaTotalMin: bad as never, generation: 1, routeFingerprint: FP, measuredAt: 1000 }).invalid).toBe(true)
    }
  })
})

describe('staleness merge (AC 4)', () => {
  it('a stale (lower-generation) result never replaces a newer measurement', () => {
    const newer = measurement({ generation: 2, detourMin: 20, returnDetourMin: 40, oneWayArriveMin: 20 })
    const stale = measurement({ generation: 1, detourMin: 99, returnDetourMin: 198, oneWayArriveMin: 99 })
    expect(mergeMeasurement(newer, stale)).toBe(newer)
  })

  it('a route change (different fingerprint) invalidates the old record', () => {
    const old = measurement({ generation: 1, routeFingerprint: 'fp-old' })
    const rerouted = measurement({ generation: 1, routeFingerprint: 'fp-new', detourMin: 30 })
    expect(mergeMeasurement(old, rerouted)).toBe(rerouted)
  })

  it('equal generation on the same route keeps the newest measurement', () => {
    const older = measurement({ measuredAt: 1000 })
    const fresher = measurement({ measuredAt: 2000, detourMin: 14 })
    expect(mergeMeasurement(older, fresher)).toBe(fresher)
    expect(mergeMeasurement(fresher, older)).toBe(fresher)
  })
})

describe('the bounded top-15 budget (AC 2)', () => {
  it('caps at 15 unique candidates in ranked order; duplicates never spend two slots', () => {
    const ranked = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }))
    expect(topCandidatesForMeasurement(ranked, c => c.id)).toHaveLength(MEASUREMENT_TOP_CANDIDATES)
    expect(topCandidatesForMeasurement(ranked, c => c.id)[0].id).toBe('c0')
    const dupes = ['a', 'a', 'b', 'b', 'c'].map(id => ({ id }))
    expect(topCandidatesForMeasurement(dupes, c => c.id).map(c => c.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('the batch runner: quota pause, failures, estimates retained (AC 3, AC 6 gate)', () => {
  const origin = { lat: 10, lng: 10 }
  const destination = { lat: 10, lng: 10.5 }
  const candidates = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, lat: 10, lng: 10.1 + i / 100 }))

  it('quota says no → nothing measured, every candidate skipped as quota (estimates stay)', async () => {
    const out = await measureRoadDetours({
      origin, destination, candidates, generation: 1, routeFingerprint: FP,
      transport: { baselineMin: async () => 60, viaTotalMin: async () => 72 },
      quotaAllows: () => false,
    })
    expect(out.measurements).toHaveLength(0)
    expect(out.skipped.map(s => s.reason)).toEqual(['quota', 'quota', 'quota'])
  })

  it('a baseline failure skips the whole batch as failed — no fabricated measurements', async () => {
    const out = await measureRoadDetours({
      origin, destination, candidates, generation: 1, routeFingerprint: FP,
      transport: { baselineMin: async () => { throw new Error('HTTP 500') }, viaTotalMin: async () => 72 },
      quotaAllows: () => true,
    })
    expect(out.measurements).toHaveLength(0)
    expect(out.skipped.map(s => s.reason)).toEqual(['failed', 'failed', 'failed'])
  })

  it('a per-candidate failure skips only that candidate', async () => {
    const out = await measureRoadDetours({
      origin, destination, candidates, generation: 1, routeFingerprint: FP,
      transport: {
        baselineMin: async () => 60,
        viaTotalMin: async (_o, _d, place) => { if (place.lng > 10.11) throw new Error('HTTP 500'); return 72 },
      },
      quotaAllows: () => true,
    })
    expect(out.measurements.map(m => m.hitId)).toEqual(['c0', 'c1'])
    expect(out.skipped.map(s => s.id)).toEqual(['c2'])
  })

  it('successful pairs become measurements with the batch generation and fingerprint', async () => {
    const out = await measureRoadDetours({
      origin, destination, candidates, generation: 7, routeFingerprint: FP,
      transport: { baselineMin: async () => 60, viaTotalMin: async () => 72 },
      quotaAllows: () => true,
      now: 5000,
    })
    expect(out.measurements).toHaveLength(3)
    expect(out.measurements[0]).toMatchObject({ generation: 7, routeFingerprint: FP, detourMin: 12, measuredAt: 5000 })
  })
})

describe('the measured fact wins over estimates in the unified consumer', () => {
  it('asymmetricDetourMinutes returns the measured return minutes, charged once', () => {
    // measured 12-min one-way delta → 24 return minutes (not 48)
    const h = { latitude: 10, longitude: 10.09, offRouteKm: 8, measuredRoadDetourMin: 12 }
    expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBe(24)
  })

  it('an invalid measured value is ignored — never free — and estimates apply', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -3]) {
      const h = { latitude: 10, longitude: 10.09, offRouteKm: 8, measuredRoadDetourMin: bad }
      expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBeCloseTo(24, 5) // the 8 km estimate
    }
    expect(asymmetricDetourKm({ latitude: 10, longitude: 10.09, offRouteKm: 8, measuredRoadDetourMin: Number.NaN } as never, [], EAST)).toBe(8)
  })

  it('the scorer uses the road-true fact: the measured gap is exactly the delta, not a speed conversion', () => {
    const anchors2 = [{ lat: 10, lng: 10 }]
    const seg = { index: 0, purpose: 'meal' as const, label: 'Lunch', targetKm: 0, minKm: 0, maxKm: 10, kmFromPrev: 0, minutesFromPrev: 0, etaMinutes: 750 }
    const base = { name: 'Eat', latitude: 10, longitude: 10, kind: 'poi' as const, category: 'food', offRouteKm: 0 }
    const estimated = scoreHitForSegment({ ...base, offRouteKm: 8 } as never, seg, anchors2, {})
    const measured = scoreHitForSegment({ ...base, measuredRoadDetourMin: 12 } as never, seg, anchors2, {})
    expect(estimated).not.toBeNull()
    expect(measured).not.toBeNull()
    // estimate: 8 km at 40 km/h = 12 one-way = 24 return; measured 12 one-way = 24 return — equal here,
    // so pin the mechanism differently: the measured fact is used VERBATIM regardless of speed.
    const slow = scoreHitForSegment({ ...base, measuredRoadDetourMin: 12 } as never, seg, anchors2, { speedKmph: 10 })
    expect(slow).toBe(measured) // a measured fact does not rescale with the speed guess
  })
})
