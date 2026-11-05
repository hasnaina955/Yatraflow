// Ticket 11 (#896) repaired — road-measured detours. Pure fixtures; the
// transport is injected, so nothing touches the network or the quota store.
// Each progress-review probe is reproduced as a named regression:
//   roadDelta:      60 baseline + 84 via → 24 extra minutes (NOT 48)
//   overriddenCap:  a caller limit of 20 stays at the hard 15
//   quotaBatch:     the quota guard rechecks before EVERY request and HALTS
//                   the remaining batch when it goes false
//   plus: directed arrival leg measured separately (never halved), matching
//   explicit clock inputs, stale/old-route replies can never replace current
//   measurements.
import { describe, it, expect } from 'vitest'
import {
  roadDetourFromLegs,
  mergeMeasurement,
  isCurrentForRoute,
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
    hitId: 'h1', detourMin: 24, arrivalLegMin: 12,
    measured: true, generation: 1, routeFingerprint: FP, measuredAt: 1000, departAtMin: 600, ...over,
  }
}

describe('the corrected fact contract (probe roadDelta)', () => {
  it('baseline 60 + complete via 84 → 24 extra minutes, NOT 48', () => {
    const m = roadDetourFromLegs({
      hitId: 'h1', baselineMin: 60,
      via: { totalMin: 84, arrivalLegMin: 40 },
      generation: 1, routeFingerprint: FP, measuredAt: 1000, departAtMin: 600,
    })
    expect('invalid' in m && m.invalid).toBe(false)
    if (!('invalid' in m)) {
      expect(m.detourMin).toBe(24) // the probe's returnDetourMin 48 is GONE
      expect(m.arrivalLegMin).toBe(40) // directed arrival evidence, measured
    }
  })

  it('the directed arrival leg is its own fact — never derived by halving', () => {
    // asymmetric one-way roads: out 40, back 20 → delta 24 with arrival 40 (not 12)
    const m = roadDetourFromLegs({
      hitId: 'h', baselineMin: 36,
      via: { totalMin: 60, arrivalLegMin: 40 },
      generation: 1, routeFingerprint: FP, measuredAt: 1000, departAtMin: 540,
    })
    if (!('invalid' in m)) {
      expect(m.detourMin).toBe(24)
      expect(m.arrivalLegMin).toBe(40)
      expect((m as RoadMeasurement).departAtMin).toBe(540) // explicit matching clock recorded
    }
  })

  it('a zero delta is a valid on-road fact, never unknown', () => {
    const m = roadDetourFromLegs({ hitId: 'h1', baselineMin: 60, via: { totalMin: 60, arrivalLegMin: 30 }, generation: 1, routeFingerprint: FP, measuredAt: 1000, departAtMin: 600 })
    if (!('invalid' in m)) expect(m.detourMin).toBe(0)
  })

  it('a negative delta, missing legs or non-finite values stay unknown', () => {
    expect(roadDetourFromLegs({ hitId: 'h', baselineMin: 84, via: { totalMin: 60, arrivalLegMin: 30 }, generation: 1, routeFingerprint: FP, measuredAt: 1000, departAtMin: 600 }).invalid).toBe(true)
    expect(roadDetourFromLegs({ hitId: 'h', baselineMin: null, via: { totalMin: 84, arrivalLegMin: 40 }, generation: 1, routeFingerprint: FP, measuredAt: 1000, departAtMin: 600 }).invalid).toBe(true)
    expect(roadDetourFromLegs({ hitId: 'h', baselineMin: 60, via: { totalMin: 84, arrivalLegMin: Number.NaN }, generation: 1, routeFingerprint: FP, measuredAt: 1000, departAtMin: 600 }).invalid).toBe(true)
    expect(roadDetourFromLegs({ hitId: 'h', baselineMin: 60, via: null, generation: 1, routeFingerprint: FP, measuredAt: 1000, departAtMin: 600 }).invalid).toBe(true)
  })
})

describe('the active-route staleness binding', () => {
  const ACTIVE = { generation: 2, routeFingerprint: FP }

  it('a late reply from an OLD route (probe late-reply) never replaces a current measurement', () => {
    const current = measurement({ generation: 2, detourMin: 20, arrivalLegMin: 10, measuredAt: 2000 })
    const lateOldRoute = measurement({ generation: 2, routeFingerprint: 'old-route', detourMin: 99, measuredAt: 5000 })
    expect(isCurrentForRoute(lateOldRoute, ACTIVE)).toBe(false)
    expect(mergeMeasurement(current, lateOldRoute, ACTIVE)).toBe(current)
  })

  it('a stale (lower-generation) reply never replaces a newer measurement', () => {
    const current = measurement({ generation: 2, detourMin: 20, measuredAt: 2000 })
    const stale = measurement({ generation: 1, detourMin: 99, measuredAt: 9000 })
    expect(mergeMeasurement(current, stale, ACTIVE)).toBe(current)
  })

  it('among current-route candidates the newest measuredAt wins; non-current pairs resolve honestly', () => {
    const older = measurement({ generation: 2, measuredAt: 1000, detourMin: 22 })
    const fresher = measurement({ generation: 2, measuredAt: 2000, detourMin: 24 })
    expect(mergeMeasurement(older, fresher, ACTIVE)).toBe(fresher)
    expect(mergeMeasurement(fresher, older, ACTIVE)).toBe(fresher)
    // both foreign to the active route → nothing effective
    expect(mergeMeasurement(
      measurement({ routeFingerprint: 'x' }),
      measurement({ routeFingerprint: 'y' }),
      ACTIVE,
    )).toBeUndefined()
  })
})

describe('the hard top-15 ceiling (probe overriddenCap)', () => {
  it('a caller requesting 20 still gets the hard 15, in ranked order, unique by id', () => {
    const ranked = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }))
    const capped = topCandidatesForMeasurement(ranked, c => c.id, 20) // the probe's over-limit request
    expect(capped).toHaveLength(MEASUREMENT_TOP_CANDIDATES)
    expect(capped[0].id).toBe('c0')
    expect(capped[MEASUREMENT_TOP_CANDIDATES - 1].id).toBe('c14')
  })

  it('duplicates never spend two ceiling slots; the defense re-applies in the batch runner', async () => {
    const dupes = ['a', 'a', 'b', 'b', 'c'].map(id => ({ id, lat: 10, lng: 10.1 }))
    const out = await measureRoadDetours({
      origin: { lat: 10, lng: 10 }, destination: { lat: 10, lng: 10.05 },
      candidates: dupes, generation: 1, routeFingerprint: FP, departAtMin: 600,
      transport: { baselineMin: async () => 60, viaRoute: async () => ({ totalMin: 84, arrivalLegMin: 40 }) },
      quotaAllows: () => true,
      limit: 20, // ignored above the ceiling
    })
    expect(out.measurements.map(m => m.hitId)).toEqual(['a', 'b', 'c'])
  })
})

describe('the batch runner: per-request quota recheck and halting (probe quotaBatch)', () => {
  const origin = { lat: 10, lng: 10 }
  const destination = { lat: 10, lng: 10.05 }
  const candidates = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, lat: 10, lng: 10.01 + i / 1000 }))

  it('the guard flipping false mid-batch halts the remaining candidates with quota skips', async () => {
    let calls = 0
    const quotaLog: string[] = []
    const out = await measureRoadDetours({
      origin, destination, candidates, generation: 1, routeFingerprint: FP, departAtMin: 600,
      transport: {
        baselineMin: async () => { quotaLog.push('baseline'); return 60 },
        viaRoute: async (_o, _d, place) => { quotaLog.push(`via:${place.lng}`); return { totalMin: 84, arrivalLegMin: 40 } },
      },
      // true for the baseline check, the first two via checks, then false
      quotaAllows: () => (calls++ < 3 ? true : false),
      now: 5000,
    })
    expect(out.measurements).toHaveLength(2)
    expect(out.measurements[0]).toMatchObject({ detourMin: 24, arrivalLegMin: 40, departAtMin: 600 })
    expect(out.skipped.map(s => s.reason)).toEqual(['quota', 'quota', 'quota', 'quota'])
    expect(out.haltedOnQuota).toBe(true)
    expect(quotaLog).toEqual(['baseline', `via:${candidates[0].lng}`, `via:${candidates[1].lng}`]) // no calls after the guard flipped
  })

  it('quota false before the first request measures nothing and skips everything', async () => {
    const out = await measureRoadDetours({
      origin, destination, candidates: candidates.slice(0, 3), generation: 1, routeFingerprint: FP, departAtMin: 600,
      transport: { baselineMin: async () => 60, viaRoute: async () => ({ totalMin: 84, arrivalLegMin: 40 }) },
      quotaAllows: () => false,
    })
    expect(out.measurements).toHaveLength(0)
    expect(out.skipped.map(s => s.reason)).toEqual(['quota', 'quota', 'quota'])
  })

  it('a baseline failure skips the whole batch as failed — no fabricated measurements', async () => {
    const out = await measureRoadDetours({
      origin, destination, candidates: candidates.slice(0, 3), generation: 1, routeFingerprint: FP, departAtMin: 600,
      transport: { baselineMin: async () => { throw new Error('HTTP 500') }, viaRoute: async () => ({ totalMin: 84, arrivalLegMin: 40 }) },
      quotaAllows: () => true,
    })
    expect(out.measurements).toHaveLength(0)
    expect(out.skipped.map(s => s.reason)).toEqual(['failed', 'failed', 'failed'])
    expect(out.haltedOnQuota).toBe(false)
  })

  it('a per-candidate failure skips only that candidate', async () => {
    const out = await measureRoadDetours({
      origin, destination, candidates, generation: 1, routeFingerprint: FP, departAtMin: 600,
      transport: {
        baselineMin: async () => 60,
        viaRoute: async (_o, _d, place) => { if (place.lng >= 10.012) throw new Error('HTTP 500'); return { totalMin: 84, arrivalLegMin: 40 } },
      },
      quotaAllows: () => true,
    })
    expect(out.measurements.map(m => m.hitId)).toEqual(['c0', 'c1'])
    expect(out.skipped.map(s => s.id)).toEqual(['c2', 'c3', 'c4', 'c5'])
  })
})

describe('the measured fact wins over estimates in the unified consumer', () => {
  it('asymmetricDetourMinutes returns the measured extra driving VERBATIM — charged once', () => {
    // probe roadDelta: measured 24 via-minus-baseline → the unified fact is 24, NOT 48
    const h = { latitude: 10, longitude: 10.09, offRouteKm: 8, measuredRoadDetourMin: 24 }
    expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBe(24)
  })

  it('an invalid measured value is ignored — never free — and estimates apply', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -3]) {
      const h = { latitude: 10, longitude: 10.09, offRouteKm: 8, measuredRoadDetourMin: bad }
      expect(asymmetricDetourMinutes(h as never, [], EAST, 40)).toBeCloseTo(24, 5) // the 8 km estimate
    }
    expect(asymmetricDetourKm({ latitude: 10, longitude: 10.09, offRouteKm: 8, measuredRoadDetourMin: Number.NaN } as never, [], EAST)).toBe(8)
  })

  it('the scorer uses the road-true fact verbatim regardless of the speed guess', () => {
    const anchors2 = [{ lat: 10, lng: 10 }]
    const seg = { index: 0, purpose: 'meal' as const, label: 'Lunch', targetKm: 0, minKm: 0, maxKm: 10, kmFromPrev: 0, minutesFromPrev: 0, etaMinutes: 750 }
    const base = { name: 'Eat', latitude: 10, longitude: 10, kind: 'poi' as const, category: 'food', offRouteKm: 0 }
    const estimated = scoreHitForSegment({ ...base, offRouteKm: 8 } as never, seg, anchors2, {})
    const measured = scoreHitForSegment({ ...base, measuredRoadDetourMin: 24 } as never, seg, anchors2, {})
    expect(estimated).not.toBeNull()
    expect(measured).not.toBeNull()
    // estimate: 24 return minutes; measured: 24 extra driving — equal here, so pin
    // the mechanism: the measured fact does not rescale with the speed guess
    const slow = scoreHitForSegment({ ...base, measuredRoadDetourMin: 24 } as never, seg, anchors2, { speedKmph: 10 })
    expect(slow).toBe(measured)
  })
})
