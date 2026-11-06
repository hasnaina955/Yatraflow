// Ticket 11 L4: ranked candidates become a bounded, labelled measurement plan.
// The real module and the real helper run here. Only the transport is fake, so
// no test touches the network, a provider, the live quota store or a clock.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  planRoadMeasurements,
  type RoadMeasurementPlanInput,
} from '../src/lib/roadMeasurementPlan'
import type { PlaceHit } from '../src/lib/providers/hits'
import type { ViaMeasurement } from '../src/lib/providers/roadMeasure'

// A live provider or the live quota store must never load through this module.
vi.mock('../src/lib/providers/google', () => { throw new Error('live Google provider imported') })
vi.mock('../src/lib/providers/routes', () => { throw new Error('live route provider imported') })
vi.mock('../src/lib/providers/quota', () => { throw new Error('live quota store imported') })

const ORIGIN = { lat: 10, lng: 10 }
const DESTINATION = { lat: 10, lng: 10.5 }
const ACTIVE_ROUTE = { generation: 7, routeFingerprint: 'route-fp-active' }
const DEPART_AT_MIN = 615

type Point = { lat: number; lng: number }

function hit(id: string, over: Partial<PlaceHit> = {}): PlaceHit {
  return { id, name: `Place ${id}`, latitude: 10, longitude: 10.1, kind: 'poi', ...over }
}

function candidate(id: string, over: Partial<PlaceHit> = {}): { id: string; hit: PlaceHit } {
  return { id, hit: hit(id, over) }
}

/** Ranked candidates with distinct longitudes, so transport call order is visible. */
function ranked(count: number): { id: string; hit: PlaceHit }[] {
  return Array.from({ length: count }, (_, index) =>
    candidate(`h${index + 1}`, { longitude: 10 + (index + 1) / 1000 }))
}

function baseInput(over: Partial<RoadMeasurementPlanInput> = {}): RoadMeasurementPlanInput {
  return {
    candidates: ranked(3),
    origin: ORIGIN,
    destination: DESTINATION,
    activeRoute: ACTIVE_ROUTE,
    departAtMin: DEPART_AT_MIN,
    generation: ACTIVE_ROUTE.generation,
    enabled: true, // every caller under test explicitly enables the gate
    ...over,
  }
}

/** The production default: no `enabled` key at all, so the gate stays closed. */
function gatedInput(over: Partial<RoadMeasurementPlanInput> = {}): RoadMeasurementPlanInput {
  const input = baseInput(over)
  delete input.enabled
  return input
}

function fakeTransport() {
  const baselineMin = vi.fn(async (_origin: Point, _destination: Point, _departAtMin: number): Promise<number> => 60)
  const viaRoute = vi.fn(async (
    _origin: Point,
    _destination: Point,
    _place: Point,
    _departAtMin: number,
  ): Promise<ViaMeasurement> => ({ totalMin: 84, arrivalLegMin: 40 }))
  return { transport: { baselineMin, viaRoute }, baselineMin, viaRoute }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('the activation gate (AC 6 stays open)', () => {
  it('defaults to gated: zero transport calls and every candidate kept as a labelled estimate', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    const quotaAllows = vi.fn(() => true)
    const plan = await planRoadMeasurements(gatedInput({ candidates: ranked(4), transport, quotaAllows }))

    expect(plan.activation).toBe('gated')
    expect(plan.measuredCount).toBe(0)
    expect(plan.rows).toHaveLength(4)
    for (const planRow of plan.rows) {
      expect(planRow).toMatchObject({
        status: 'unmeasured',
        grade: 'estimate',
        reason: 'activation-gated',
        detourMin: null,
        arrivalLegMin: null,
      })
    }
    expect(baselineMin).not.toHaveBeenCalled()
    expect(viaRoute).not.toHaveBeenCalled()
    expect(quotaAllows).not.toHaveBeenCalled()
  })

  it('stays gated with enabled: true when no transport is injected', async () => {
    const plan = await planRoadMeasurements(baseInput({ enabled: true, transport: null }))

    expect(plan.activation).toBe('gated')
    expect(plan.rows.every(planRow => planRow.reason === 'activation-gated')).toBe(true)
    expect(plan.rows).toHaveLength(3)
  })
})

describe('the enabled caller (injected fake transport only)', () => {
  it('measures at most 15 candidates in ranked order and labels the tail', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    const candidates = ranked(20)
    const plan = await planRoadMeasurements(baseInput({
      candidates,
      transport,
      quotaAllows: () => true,
    }))

    expect(plan.activation).toBe('enabled')
    expect(baselineMin).toHaveBeenCalledTimes(1)
    expect(viaRoute).toHaveBeenCalledTimes(15)
    expect(viaRoute.mock.calls.map(call => call[2].lng))
      .toEqual(candidates.slice(0, 15).map(item => item.hit.longitude))
    expect(plan.measuredCount).toBe(15)
    expect(plan.rows).toHaveLength(20)
    for (const planRow of plan.rows.slice(0, 15)) {
      expect(planRow).toMatchObject({ status: 'measured', grade: 'measured', detourMin: 24, arrivalLegMin: 40, reason: null })
    }
    for (const planRow of plan.rows.slice(15)) {
      expect(planRow).toMatchObject({ status: 'unmeasured', grade: 'estimate', reason: 'beyond-top-15', detourMin: null })
    }
  })

  it('passes the same exact clock and endpoints to every request', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    const candidates = ranked(3)
    const plan = await planRoadMeasurements(baseInput({ candidates, transport, quotaAllows: () => true }))

    expect(baselineMin).toHaveBeenCalledTimes(1)
    expect(baselineMin.mock.calls[0]).toEqual([ORIGIN, DESTINATION, DEPART_AT_MIN])
    expect(viaRoute).toHaveBeenCalledTimes(3)
    for (const call of viaRoute.mock.calls) {
      expect(call[0]).toEqual(ORIGIN)
      expect(call[1]).toEqual(DESTINATION)
      expect(call[3]).toBe(DEPART_AT_MIN)
    }
    // A row is labelled measured only after the plan matched the fact to the
    // ACTIVE route through the helper's own isCurrentForRoute guard.
    expect(plan.rows.every(planRow => planRow.status === 'measured')).toBe(true)
  })

  it('quota false spends no request and marks every row quota-skipped', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    const plan = await planRoadMeasurements(baseInput({
      candidates: ranked(3),
      transport,
      quotaAllows: () => false,
    }))

    expect(baselineMin).not.toHaveBeenCalled()
    expect(viaRoute).not.toHaveBeenCalled()
    expect(plan.measuredCount).toBe(0)
    expect(plan.rows.map(planRow => planRow.status)).toEqual(['quota-skipped', 'quota-skipped', 'quota-skipped'])
    expect(plan.rows.every(planRow => planRow.grade === 'estimate' && planRow.reason === 'quota')).toBe(true)
  })

  it('a quota stop keeps earlier measurements and marks the rest quota-skipped', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    let checks = 0
    const plan = await planRoadMeasurements(baseInput({
      candidates: ranked(5),
      transport,
      quotaAllows: () => checks++ < 3,
    }))

    expect(baselineMin).toHaveBeenCalledTimes(1)
    expect(viaRoute).toHaveBeenCalledTimes(2) // no request after the guard turned false
    expect(plan.measuredCount).toBe(2)
    expect(plan.rows.map(planRow => planRow.status))
      .toEqual(['measured', 'measured', 'quota-skipped', 'quota-skipped', 'quota-skipped'])
    expect(plan.rows[0]).toMatchObject({ detourMin: 24, arrivalLegMin: 40, grade: 'measured' })
    expect(plan.rows[1]).toMatchObject({ detourMin: 24, arrivalLegMin: 40, grade: 'measured' })
    for (const planRow of plan.rows.slice(2)) {
      expect(planRow).toMatchObject({ detourMin: null, arrivalLegMin: null, grade: 'estimate', reason: 'quota' })
    }
  })

  it('pins the real helper quota and failed labels in one batch', async () => {
    const { transport, viaRoute } = fakeTransport()
    viaRoute.mockImplementation(async (_origin: Point, _destination: Point, place: Point): Promise<ViaMeasurement> => {
      if (place.lng === 10.001) throw new Error('HTTP 500')
      return { totalMin: 84, arrivalLegMin: 40 }
    })
    let checks = 0
    // The baseline check and the first two via checks pass; the third via stops.
    const plan = await planRoadMeasurements(baseInput({
      candidates: ranked(3),
      transport,
      quotaAllows: () => checks++ < 3,
    }))

    expect(viaRoute).toHaveBeenCalledTimes(2)
    expect(plan.rows.map(planRow => planRow.status)).toEqual(['failed', 'measured', 'quota-skipped'])
    expect(plan.rows[0]).toMatchObject({ grade: 'estimate', reason: 'failed', detourMin: null, arrivalLegMin: null })
    expect(plan.rows[2]).toMatchObject({ grade: 'estimate', reason: 'quota', detourMin: null, arrivalLegMin: null })
    expect(plan.measuredCount).toBe(1)
  })
})

describe('truthful value labels', () => {
  it('negative and non-finite pairs stay unknown while a measured zero stays measured', async () => {
    const { transport, viaRoute } = fakeTransport()
    viaRoute.mockImplementation(async (_origin: Point, _destination: Point, place: Point): Promise<ViaMeasurement> => {
      if (place.lng === 10.002) return { totalMin: 50, arrivalLegMin: 20 } // shorter than baseline
      if (place.lng === 10.003) return { totalMin: Number.NaN, arrivalLegMin: 20 }
      if (place.lng === 10.004) return { totalMin: 84, arrivalLegMin: Number.NaN }
      if (place.lng === 10.005) return { totalMin: 60, arrivalLegMin: 30 } // valid zero delta
      return { totalMin: 84, arrivalLegMin: 40 }
    })
    const plan = await planRoadMeasurements(baseInput({
      candidates: ranked(5),
      transport,
      quotaAllows: () => true,
    }))

    expect(plan.rows[0]).toMatchObject({ status: 'measured', detourMin: 24, grade: 'measured', reason: null })
    expect(plan.rows[1]).toMatchObject({ status: 'failed', detourMin: null, arrivalLegMin: null, grade: 'unknown' })
    expect(plan.rows[1].reason).toContain('negative')
    expect(plan.rows[2]).toMatchObject({ status: 'failed', grade: 'unknown', detourMin: null })
    expect(plan.rows[2].reason).toContain('non-finite')
    expect(plan.rows[3]).toMatchObject({ status: 'failed', grade: 'unknown', arrivalLegMin: null })
    expect(plan.rows[3].reason).toContain('non-finite')
    expect(plan.rows[4]).toMatchObject({ status: 'measured', detourMin: 0, arrivalLegMin: 30, grade: 'measured' })
    expect(plan.measuredCount).toBe(2)
  })

  it('keeps pending and failed rows with a reason and drops no row', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    viaRoute.mockImplementation(async (_origin: Point, _destination: Point, place: Point): Promise<ViaMeasurement> => {
      if (place.lng === 10.003) throw new Error('HTTP 500')
      return { totalMin: 84, arrivalLegMin: 40 }
    })
    const rankedCandidates = ranked(3)
    rankedCandidates[1].hit.latitude = 0 // coords pending: the (0,0) placeholder
    rankedCandidates[1].hit.longitude = 0
    const plan = await planRoadMeasurements(baseInput({
      candidates: rankedCandidates,
      transport,
      quotaAllows: () => true,
    }))

    expect(baselineMin).toHaveBeenCalledTimes(1)
    expect(viaRoute).toHaveBeenCalledTimes(2) // the coords-pending hit is never requested
    expect(plan.rows).toHaveLength(3)
    expect(plan.rows.map(planRow => planRow.status)).toEqual(['measured', 'pending', 'failed'])
    expect(plan.rows[0]).toMatchObject({ reason: null, detourMin: 24 })
    expect(plan.rows[1]).toMatchObject({ reason: 'coordinates-pending', grade: 'estimate', detourMin: null, arrivalLegMin: null })
    expect(plan.rows[2]).toMatchObject({ reason: 'failed', grade: 'estimate', detourMin: null, arrivalLegMin: null })
    for (const planRow of plan.rows) {
      if (planRow.status === 'measured') expect(planRow.reason).toBeNull()
      else expect(typeof planRow.reason).toBe('string')
    }
    expect(plan.measuredCount).toBe(1)
  })

  it('treats the shared mixed-placeholder sentinel as coordinates pending', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    const plan = await planRoadMeasurements(baseInput({
      candidates: [
        candidate('mixed-latitude', { latitude: 0, longitude: 10.2 }),
        candidate('mixed-longitude', { latitude: 10.2, longitude: 0 }),
      ],
      transport,
      quotaAllows: () => true,
    }))

    expect(baselineMin).not.toHaveBeenCalled()
    expect(viaRoute).not.toHaveBeenCalled()
    expect(plan.rows).toHaveLength(2)
    expect(plan.rows.every(planRow =>
      planRow.status === 'pending' && planRow.grade === 'estimate' && planRow.reason === 'coordinates-pending')).toBe(true)
    expect(plan.measuredCount).toBe(0)
  })

  it('refuses a candidate whose hit identity differs from its rank id', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    const plan = await planRoadMeasurements(baseInput({
      candidates: [{ id: 'rank-1', hit: hit('other-place') }],
      transport,
      quotaAllows: () => true,
    }))

    expect(baselineMin).not.toHaveBeenCalled()
    expect(viaRoute).not.toHaveBeenCalled()
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]).toMatchObject({
      hitId: 'rank-1',
      status: 'failed',
      grade: 'unknown',
      reason: 'identity-mismatch',
      detourMin: null,
    })
  })
})

describe('duplicate candidate ids', () => {
  it('measures only the first ranked row and labels a different-coordinate duplicate', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    const plan = await planRoadMeasurements(baseInput({
      candidates: [
        { id: 'same-id', hit: hit('same-id', { latitude: 10.1, longitude: 10.001 }) },
        { id: 'same-id', hit: hit('same-id', { latitude: 12.9, longitude: 77.6 }) },
      ],
      transport,
      quotaAllows: () => true,
    }))

    expect(baselineMin).toHaveBeenCalledTimes(1)
    expect(viaRoute).toHaveBeenCalledTimes(1) // one fact is requested for the id
    expect(viaRoute.mock.calls[0][2]).toEqual({ id: 'same-id', lat: 10.1, lng: 10.001 })
    expect(plan.rows).toHaveLength(2)
    expect(plan.rows[0]).toMatchObject({
      hitId: 'same-id',
      status: 'measured',
      detourMin: 24,
      arrivalLegMin: 40,
      grade: 'measured',
      reason: null,
    })
    expect(plan.rows[1]).toMatchObject({
      hitId: 'same-id',
      status: 'unmeasured',
      detourMin: null,
      arrivalLegMin: null,
      grade: 'estimate',
      reason: 'duplicate-id',
    })
    expect(plan.measuredCount).toBe(1) // one fact, not one row
  })

  it('keeps a same-id, same-coordinate duplicate as an explicit unmeasured row', async () => {
    const { transport, viaRoute } = fakeTransport()
    const plan = await planRoadMeasurements(baseInput({
      candidates: [
        { id: 'same-id', hit: hit('same-id', { latitude: 10.1, longitude: 10.001 }) },
        { id: 'same-id', hit: hit('same-id', { latitude: 10.1, longitude: 10.001 }) },
      ],
      transport,
      quotaAllows: () => true,
    }))

    expect(viaRoute).toHaveBeenCalledTimes(1)
    expect(plan.rows).toHaveLength(2)
    expect(plan.rows[0]).toMatchObject({ status: 'measured', detourMin: 24, reason: null })
    expect(plan.rows[1]).toMatchObject({ status: 'unmeasured', reason: 'duplicate-id', detourMin: null })
    expect(plan.measuredCount).toBe(1)
  })
})

describe('the stale-route guard', () => {
  it('refuses a plan generation that is not the active route, before any request', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    const plan = await planRoadMeasurements(baseInput({
      candidates: ranked(3),
      transport,
      quotaAllows: () => true,
      generation: ACTIVE_ROUTE.generation + 1,
    }))

    expect(plan.activation).toBe('enabled')
    expect(baselineMin).not.toHaveBeenCalled()
    expect(viaRoute).not.toHaveBeenCalled()
    expect(plan.measuredCount).toBe(0)
    expect(plan.rows.every(planRow =>
      planRow.status === 'unmeasured' && planRow.reason === 'stale-generation' && planRow.detourMin === null)).toBe(true)
  })

  it('refuses a missing active-route fingerprint, before any request', async () => {
    const { transport, baselineMin, viaRoute } = fakeTransport()
    const plan = await planRoadMeasurements(baseInput({
      candidates: ranked(2),
      transport,
      quotaAllows: () => true,
      activeRoute: { generation: ACTIVE_ROUTE.generation, routeFingerprint: '' },
    }))

    expect(baselineMin).not.toHaveBeenCalled()
    expect(viaRoute).not.toHaveBeenCalled()
    expect(plan.rows.every(planRow => planRow.reason === 'route-identity-missing')).toBe(true)
  })

  it('does not admit a result when the active route changes during the await', async () => {
    const { transport, viaRoute } = fakeTransport()
    let release: () => void = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    let entered: () => void = () => {}
    const enteredPromise = new Promise<void>(resolve => { entered = resolve })
    viaRoute.mockImplementation(async (): Promise<ViaMeasurement> => {
      entered()
      await held
      return { totalMin: 84, arrivalLegMin: 40 }
    })
    const mutableRoute = { ...ACTIVE_ROUTE }
    const input = baseInput({
      candidates: ranked(2),
      transport,
      quotaAllows: () => true,
      activeRoute: mutableRoute,
    })
    const planPromise = planRoadMeasurements(input)
    await enteredPromise
    mutableRoute.generation = ACTIVE_ROUTE.generation + 1
    mutableRoute.routeFingerprint = 'route-fp-changed'
    release()
    const plan = await planPromise

    expect(plan.activation).toBe('enabled')
    expect(plan.measuredCount).toBe(0)
    expect(plan.rows).toHaveLength(2)
    expect(plan.rows.every(planRow =>
      planRow.status === 'unmeasured' && planRow.reason === 'stale-result' && planRow.detourMin === null)).toBe(true)
  })
})

describe('isolation', () => {
  it('imports and runs gated without loading a live routing provider or calling fetch', async () => {
    vi.resetModules()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const module = await import('../src/lib/roadMeasurementPlan')
    const plan = await module.planRoadMeasurements(gatedInput({ candidates: ranked(2) }))

    expect(typeof module.planRoadMeasurements).toBe('function')
    expect(plan.activation).toBe('gated')
    expect(fetchSpy).not.toHaveBeenCalled()

    const source = readFileSync(new URL('../src/lib/roadMeasurementPlan.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/\bfetch\s*\(/)
    expect(source).not.toMatch(/\bgoogleRoute\b/)
    expect(source).not.toMatch(/\bgetQuota\b|\bconsumeQuota\b|localStorage/)
  })
})
