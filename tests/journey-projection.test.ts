// ============ The shared journey projection (#08 L1) ============
// Real projection, real day plan, real identity helpers. Only the transport is
// controlled: a throwing fetch stub proves the projection never calls out.
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptProjection,
  journeyRowsFor,
  journeyUnassignedRows,
  projectJourney,
  projectionIsCurrent,
  type JourneyProjection,
  type JourneyRow,
} from '../src/lib/journeyProjection'
import { buildDayPlan } from '../src/lib/dayPlan'
import { isSameEntity, placeKeysOf } from '../src/lib/placeIdentity'
import { seedData } from '../src/data/seed'
import type { ItineraryStop } from '../src/data/types'
import {
  JOURNEY_FIXTURE,
  deepFreeze,
  journeyFixture,
  makeCandidate,
  makeHit,
  makeSlot,
  type JourneyFixture,
} from './helpers/journeyProjectionFixture'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function project(fixture: JourneyFixture, overrides: Partial<Parameters<typeof projectJourney>[0]> = {}): JourneyProjection {
  return projectJourney({
    dayPlan: fixture.dayPlan,
    driveRows: fixture.driveRows,
    budgetMin: fixture.budgetMin,
    editable: true,
    presence: fixture.presence,
    contextKey: fixture.contextKey,
    ...overrides,
  })
}

function mustRow(projection: JourneyProjection, match: (row: JourneyRow) => boolean): JourneyRow {
  const row = projection.rows.find(match)
  if (!row) throw new Error('fixture row is missing')
  return row
}

function snapshot(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (item instanceof Set ? [...item] : item))
}

describe('one day, one row set', () => {
  it('copies the day context and budget without changing them', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    expect(projection.tripId).toBe(fixture.tripId)
    expect(projection.dayId).toBe(fixture.dayId)
    expect(projection.dayIndex).toBe(fixture.dayIndex)
    expect(projection.contextKey).toBe(fixture.contextKey)
    expect(projection.budgetMin).toBe(fixture.budgetMin)
    expect(projection.byKey.size).toBe(projection.rows.length)
    expect(projection.unassigned).toEqual([])
    for (const row of projection.rows) {
      expect(projection.byKey.get(row.key)).toBe(row)
      expect(row.lens).toBe('drive')
    }
  })

  it('carries every contract field on every row, with honest nulls', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    for (const row of projection.rows) {
      expect(typeof row.key).toBe('string')
      expect(row.key.length).toBeGreaterThan(0)
      expect(row.tripId).toBe(fixture.tripId)
      expect(row.dayId).toBe(fixture.dayId)
      expect(typeof row.dayIndex).toBe('number')
      expect(typeof row.purpose).toBe('string')
      expect(row.purpose.length).toBeGreaterThan(0)
      expect(Array.isArray(row.placeKeys)).toBe(true)
      expect(row.hit).toBeTruthy()
      expect(['manual', 'engine', 'drive']).toContain(row.origin)
      expect(['live', 'retained', 'stale', 'unknown']).toContain(row.freshness)
      expect(['schedule', 'stored', 'candidate', 'none']).toContain(row.arriveSource)
      expect(row.source === null || typeof row.source === 'string').toBe(true)
      expect(row.vote === null || typeof row.vote.decisionId === 'string').toBe(true)
      expect(row.arriveLabel === null || typeof row.arriveLabel === 'string').toBe(true)
      expect(row.slotKey === null || typeof row.slotKey === 'string').toBe(true)
      expect(row.slotRef === null || typeof row.slotRef.key === 'string').toBe(true)
      expect(row.stopId === null || typeof row.stopId === 'string').toBe(true)
      for (const value of [row.detourMin, row.detourKm, row.budgetSharePct, row.visitMin, row.bufferMin, row.netAddedMin, row.arriveMin]) {
        expect(value === null || typeof value === 'number').toBe(true)
      }
      expect(row.windowMin === null || Array.isArray(row.windowMin)).toBe(true)
      expect(row.inWindow === null || typeof row.inWindow === 'boolean').toBe(true)
      expect(typeof row.actions.preview).toBe('boolean')
      expect(typeof row.actions.add).toBe('boolean')
      expect(typeof row.actions.shortlist).toBe('boolean')
      expect(typeof row.actions.vote).toBe('boolean')
      expect(typeof row.actions.navigate).toBe('boolean')
    }
  })

  it('uses the real provider-aware place keys and never collapses a raw id', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    const byGoogle = mustRow(projection, row => row.hit === fixture.hits.sharedGoogle)
    const byOsm = mustRow(projection, row => row.hit === fixture.hits.sharedOsm)
    expect(byGoogle.key).not.toBe(byOsm.key)
    expect(isSameEntity(byGoogle.hit, byOsm.hit)).toBe(false)
    expect(byGoogle.placeKeys).toEqual(placeKeysOf(fixture.hits.sharedGoogle))
    expect(byOsm.placeKeys).toEqual(placeKeysOf(fixture.hits.sharedOsm))
    expect(byGoogle.placeKeys[0]?.provider).toBe('google')
    expect(byOsm.placeKeys).toEqual([])
  })
})

describe('day scope is enforced, never guessed', () => {
  const corridorDrive = (fixture: JourneyFixture) => {
    const row = fixture.driveRows.find(item => item.hit === fixture.hits.corridor)
    if (!row) throw new Error('fixture corridor drive row is missing')
    return row
  }

  it('keeps a foreign-day same-entity drive row out of the day rows', () => {
    const fixture = journeyFixture()
    const drive = corridorDrive(fixture)
    const foreign = { ...drive, dayIndex: fixture.dayIndex + 1 }
    const projection = project(fixture, {
      driveRows: [...fixture.driveRows.filter(row => row !== drive), foreign],
    })
    const corridorRows = projection.rows.filter(row => row.hit === fixture.hits.corridor)
    expect(corridorRows.map(row => row.slotKey).sort()).toEqual(['dinner', 'lunch'])
    expect(projection.unassigned).toHaveLength(1)
    expect(projection.unassigned[0]?.dayIndex).toBe(fixture.dayIndex + 1)
    expect(projection.unassigned[0]?.dayId).toBeNull()
    expect(projection.byKey.has(projection.unassigned[0]!.key)).toBe(false)
    expect(journeyUnassignedRows(projection, 'drive')).toHaveLength(1)
  })

  it('never guesses a null-day drive row into the active day', () => {
    const fixture = journeyFixture()
    const drive = corridorDrive(fixture)
    const undated = { ...drive, dayIndex: null }
    const projection = project(fixture, {
      driveRows: [...fixture.driveRows.filter(row => row !== drive), undated],
    })
    expect(projection.unassigned).toHaveLength(1)
    expect(projection.unassigned[0]?.dayIndex).toBeNull()
    expect(projection.unassigned[0]?.dayId).toBeNull()
    expect(projection.rows.some(row => row.origin === 'drive' && row.hit === fixture.hits.corridor)).toBe(false)
  })
})

describe('slot facts win in place', () => {
  it('replaces the same drive entity with the slot row and keeps engine order', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    expect(projection.rows[0]?.hit).toBe(fixture.hits.corridor)
    expect(projection.rows[0]?.slotKey).toBe('lunch')
    expect(projection.rows[0]?.detourMin).toBe(12)
    expect(projection.rows[0]?.arriveMin).toBe(770)
    expect(projection.rows[0]?.inWindow).toBe(true)
    // The corridor drive row was replaced, not added a second time.
    const corridorRows = projection.rows.filter(row => row.hit === fixture.hits.corridor)
    expect(corridorRows.map(row => row.slotKey).sort()).toEqual(['dinner', 'lunch'])
  })

  it('keeps two actual slot occurrences as two rows with stable identity', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    const lunch = mustRow(projection, row => row.slotKey === 'lunch')
    const dinner = mustRow(projection, row => row.slotKey === 'dinner')
    expect(lunch.key).not.toBe(dinner.key)
    expect(lunch.hit).toBe(dinner.hit)
    expect(lunch.slotRef?.key).toBe('lunch')
    expect(dinner.slotRef?.key).toBe('dinner')
    expect(lunch.tripId).toBe(fixture.tripId)
    expect(lunch.dayId).toBe(fixture.dayId)
  })

  it('keeps the filled slot row, its stop id and its visit fact', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    const fuel = mustRow(projection, row => row.slotKey === 'fuel')
    expect(fuel.stopId).toBe('stop-fuel')
    expect(fuel.visitMin).toBe(25)
    expect(fuel.arriveLabel).toBe('13:05')
    expect(fuel.arriveSource).toBe('stored')
    expect(fuel.visitMin).toBe(fixture.stops.fuel.visitMinutes)
    // Null cost/reason facts now fill from the same-day drive row.
    expect(fuel.detourMin).toBe(4)
    const fuelRows = projection.rows.filter(row => row.hit === fixture.hits.fuel)
    expect(fuelRows).toHaveLength(1)
    expect(fuelRows[0]?.origin).toBe('manual')
    expect(projection.rows.some(row => row.origin === 'drive' && row.hit === fixture.hits.fuel)).toBe(false)
  })

  it('builds a filled slot row from the stop when no drive row names it', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    const stay = mustRow(projection, row => row.slotKey === 'stay')
    expect(stay.stopId).toBe('stop-stay')
    expect(stay.visitMin).toBe(600)
    expect(stay.arriveLabel).toBe('20:00')
    expect(stay.arriveSource).toBe('stored')
    expect(stay.purpose).toBe('overnight')
    expect(stay.placeKeys).toEqual(placeKeysOf(fixture.hits.stay))
    expect(stay.detourMin).toBeNull()
  })

  it('fills absent cost and reason from the drive row and merges provider keys', () => {
    const stop: ItineraryStop = {
      id: 'stop-merge', title: 'Merge Cafe', category: 'food', locationName: 'Merge Cafe',
      placeId: 'g-shared', eLoc: 'm-extra', placeSource: 'google',
      lat: 10.2, lng: 76.3, visitMinutes: 30, arrivalTime: '09:00',
      entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have',
      status: 'confirmed', orderInDay: 0,
    }
    const hit = makeHit({ id: 'drive-merge', name: 'Merge Cafe', placeId: 'g-shared', source: 'google', latitude: 10.2, longitude: 76.3 })
    const plan = buildDayPlan({
      dayIndex: 0,
      slots: [makeSlot({ key: 'lunch', kind: 'meal', label: 'Lunch', state: 'filled', filledStop: stop })],
      tripId: 'trip-merge',
      dayId: 'day-merge',
    })
    const projection = projectJourney({
      dayPlan: plan,
      driveRows: [{
        id: 'drive-merge', hit, lane: 'need', purpose: 'meal', segmentIndex: 0, dayIndex: 0,
        detourMin: 7, arriveMin: null, arriveLabel: null, budgetSharePct: null,
        inWindow: null, reason: 'Drive reason', chips: [], state: 'live', photos: [],
      }],
      budgetMin: 45,
      editable: true,
      presence: null,
      contextKey: 'merge',
    })
    const row = projection.rows[0]
    expect(row?.stopId).toBe('stop-merge')
    expect(row?.detourMin).toBe(7)
    expect(row?.reason).toBe('Drive reason')
    const keys = (row?.placeKeys ?? []).map(key => `${key.provider}:${key.kind}:${key.value}`)
    expect(keys).toContain('google:placeId:g-shared')
    expect(keys).toContain('google:eLoc:m-extra')
  })
})

describe('the authoritative schedule wins over a stored label', () => {
  it('prefers the producer arrival map over the schedule and the stored label', () => {
    const fixture = journeyFixture()
    const projection = project(fixture, {
      arriveMinByStopId: { 'stop-fuel': 700 },
      daySchedule: { activeStops: [fixture.stops.fuel], arrivalTimes: ['12:10'] },
    })
    const fuel = mustRow(projection, row => row.slotKey === 'fuel')
    expect(fuel.arriveMin).toBe(700)
    expect(fuel.arriveLabel).toBe('11:40')
    expect(fuel.arriveSource).toBe('schedule')
  })

  it('ignores a non-finite producer value and falls back to the schedule', () => {
    const fixture = journeyFixture()
    const projection = project(fixture, {
      arriveMinByStopId: { 'stop-fuel': Number.NaN },
      daySchedule: { activeStops: [fixture.stops.fuel], arrivalTimes: ['12:10'] },
    })
    const fuel = mustRow(projection, row => row.slotKey === 'fuel')
    expect(fuel.arriveMin).toBe(730)
    expect(fuel.arriveLabel).toBe('12:10')
    expect(fuel.arriveSource).toBe('schedule')
  })

  it('copies the current schedule arrival for a filled stop', () => {
    const fixture = journeyFixture()
    const projection = project(fixture, {
      daySchedule: { activeStops: [fixture.stops.fuel], arrivalTimes: ['12:10'] },
    })
    const fuel = mustRow(projection, row => row.slotKey === 'fuel')
    expect(fuel.arriveLabel).toBe('12:10')
    expect(fuel.arriveMin).toBe(730)
    expect(fuel.arriveSource).toBe('schedule')
  })

  it('discloses the stored label only when no schedule fact exists', () => {
    const fixture = journeyFixture()
    const stored = mustRow(project(fixture), row => row.slotKey === 'fuel')
    expect(stored.arriveLabel).toBe('13:05')
    expect(stored.arriveMin).toBeNull()
    expect(stored.arriveSource).toBe('stored')
    const offSchedule = project(fixture, {
      daySchedule: { activeStops: [fixture.stops.fuel], arrivalTimes: [''] },
    })
    const fallback = mustRow(offSchedule, row => row.slotKey === 'fuel')
    expect(fallback.arriveLabel).toBe('13:05')
    expect(fallback.arriveSource).toBe('stored')
  })
})

describe('detour facts are copied, never guessed', () => {
  it('keeps an unknown detour null and a known on-road zero at zero', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    const unknown = mustRow(projection, row => row.hit === fixture.hits.unknown)
    const zero = mustRow(projection, row => row.hit === fixture.hits.zero)
    expect(unknown.detourMin).toBeNull()
    expect(unknown.detourKm).toBeNull()
    expect(unknown.budgetSharePct).toBe(0)
    expect(zero.detourMin).toBe(0)
    expect(zero.detourMin).not.toBeNull()
  })

  it('does not derive a visit, buffer or net-added number without a net-added seam', () => {
    const projection = project(journeyFixture())
    for (const row of projection.rows) {
      expect(row.bufferMin).toBeNull()
      // The seam is absent here, so no re-simulation runs. A caller that wants
      // the number supplies `netAdded` (tests/net-added-min.test.ts).
      expect(row.netAddedMin).toBeNull()
      if (row.stopId === null) expect(row.visitMin).toBeNull()
    }
  })

  it('copies the net-added number from the seam for a candidate row', () => {
    const fixture = journeyFixture()
    const seed = structuredClone(seedData.trips[0])
    const trip = {
      ...seed,
      days: [{ ...seed.days[0], index: fixture.dayIndex, id: fixture.dayId, stops: [fixture.stops.fuel] }],
    }
    const projection = project(fixture, {
      netAdded: {
        trip,
        stopFor: () => fixture.stops.fuel,
        insertAtFor: () => 1,
      },
    })
    const candidate = projection.rows.find(row => row.origin === 'engine' || row.origin === 'manual')
    if (!candidate) throw new Error('fixture candidate row is missing')
    expect(candidate.netAddedMin).not.toBeNull()
    expect(typeof candidate.netAddedMin).toBe('number')
    // A seam that proves no position keeps the row honest.
    const unknown = project(fixture, {
      netAdded: { trip, stopFor: () => null, insertAtFor: () => null },
    })
    for (const row of unknown.rows) expect(row.netAddedMin).toBeNull()
  })

  it('copies a drive row arrival and share, and keeps an absent one an honest unknown', () => {
    const fixture = journeyFixture()
    const zero = fixture.driveRows.find(row => row.hit === fixture.hits.zero)
    const other = fixture.driveRows.find(row => row.hit === fixture.hits.sharedGoogle)
    if (!zero || !other) throw new Error('fixture drive row is missing')
    const projection = project(fixture, {
      driveRows: fixture.driveRows.map(row => row === zero
        ? { ...row, arriveMin: 600, arriveLabel: '10:00', budgetSharePct: 12 }
        : row),
    })
    const known = mustRow(projection, row => row.hit === fixture.hits.zero)
    expect(known.arriveMin).toBe(600)
    expect(known.arriveLabel).toBe('10:00')
    expect(known.arriveSource).toBe('candidate')
    expect(known.budgetSharePct).toBe(12)
    const unknown = mustRow(projection, row => row.hit === fixture.hits.sharedGoogle)
    expect(unknown.arriveMin).toBeNull()
    expect(unknown.arriveSource).toBe('none')
    expect(unknown.budgetSharePct).toBeNull()
  })

  it('fills a filled stop budget share from its same-day drive row', () => {
    const fixture = journeyFixture()
    const fuelDrive = fixture.driveRows.find(row => row.hit === fixture.hits.fuel)
    if (!fuelDrive) throw new Error('fixture fuel drive row is missing')
    const projection = project(fixture, {
      driveRows: fixture.driveRows.map(row => row === fuelDrive ? { ...row, budgetSharePct: 9 } : row),
    })
    expect(mustRow(projection, row => row.slotKey === 'fuel').budgetSharePct).toBe(9)
  })
})

describe('slot purposes match the real grammar', () => {
  it('names meal, fuel, overnight and stretch without an illegal kind', () => {
    const slots = [
      makeSlot({ key: 'breakfast', kind: 'meal', label: 'Breakfast', candidates: [makeCandidate(makeHit({ id: 'p-meal', name: 'Meal' }))] }),
      makeSlot({ key: 'fuel', kind: 'fuel', label: 'Fuel', candidates: [makeCandidate(makeHit({ id: 'p-fuel', name: 'Fuel' }))] }),
      makeSlot({ key: 'stay', kind: 'overnight', label: 'Stay', candidates: [makeCandidate(makeHit({ id: 'p-stay', name: 'Stay' }))] }),
      makeSlot({ key: 'stretch', kind: 'stretch', label: 'Stretch', candidates: [makeCandidate(makeHit({ id: 'p-stretch', name: 'Stretch' }))] }),
    ]
    const plan = buildDayPlan({ dayIndex: 0, slots, tripId: JOURNEY_FIXTURE.tripId, dayId: JOURNEY_FIXTURE.dayId })
    const projection = projectJourney({
      dayPlan: plan, driveRows: [], budgetMin: 45, editable: true, presence: null, contextKey: 'purposes',
    })
    const purposes = Object.fromEntries(projection.rows.map(row => [row.slotKey, row.purpose]))
    expect(purposes).toEqual({ breakfast: 'meal', fuel: 'fuel', stay: 'overnight', stretch: 'stretch' })
  })
})

describe('freshness and actions are passed facts', () => {
  it('looks up a filled row by its real provider key, not its stop id', () => {
    const fixture = journeyFixture()
    const projection = project(fixture, { freshness: { 'google:g-fuel': 'retained' } })
    const fuel = mustRow(projection, row => row.slotKey === 'fuel')
    expect(fuel.freshness).toBe('retained')
  })

  it('applies an allowed provider key to a candidate row and only subtracts', () => {
    const fixture = journeyFixture()
    const projection = project(fixture, { allowed: { 'google:g-corridor': { add: false } } })
    const corridor = mustRow(projection, row => row.hit === fixture.hits.corridor)
    expect(corridor.actions.add).toBe(false)
    expect(corridor.actions.shortlist).toBe(true)
  })

  it('prefers a provider key over a colliding raw id', () => {
    const fixture = journeyFixture()
    const projection = project(fixture, { freshness: { '1': 'stale', 'google:g-one': 'live' } })
    expect(mustRow(projection, row => row.hit === fixture.hits.sharedGoogle).freshness).toBe('live')
    expect(mustRow(projection, row => row.hit === fixture.hits.sharedOsm).freshness).toBe('stale')
  })

  it('copies retained freshness and defaults the rest to unknown', () => {
    const fixture = journeyFixture()
    const projection = project(fixture, { freshness: { 'google:g-corridor': 'retained' } })
    const corridor = mustRow(projection, row => row.hit === fixture.hits.corridor)
    const other = mustRow(projection, row => row.hit === fixture.hits.sharedGoogle)
    expect(corridor.freshness).toBe('retained')
    expect(other.freshness).toBe('unknown')
  })

  it('allows each action to be removed and never granted', () => {
    const fixture = journeyFixture()
    const base = project(fixture)
    const breakfast = mustRow(base, row => row.slotKey === 'breakfast' && row.origin === 'engine')
    expect(breakfast.actions.add).toBe(true)
    expect(breakfast.actions.vote).toBe(true)
    for (const action of ['preview', 'add', 'shortlist', 'vote', 'navigate'] as const) {
      const narrowed = project(fixture, { allowed: { 'wikipedia:w-falls': { [action]: false } } })
      const row = mustRow(narrowed, item => item.slotKey === 'breakfast' && item.origin === 'engine')
      expect(row.actions[action], action).toBe(false)
    }
    const granted = project(fixture, {
      editable: false,
      allowed: { 'wikipedia:w-falls': { preview: true, add: true, shortlist: true, vote: true } },
    })
    const row = mustRow(granted, item => item.slotKey === 'breakfast' && item.origin === 'engine')
    expect(row.actions.add).toBe(false)
    expect(row.actions.preview).toBe(false)
    expect(row.actions.shortlist).toBe(false)
    expect(row.actions.vote).toBe(false)
    // Provider key wins: the raw-id grant must not re-enable add.
    const precedence = project(fixture, {
      allowed: { 'wikipedia:w-falls': { add: false }, 'w-falls': { add: true } },
    })
    expect(mustRow(precedence, item => item.slotKey === 'breakfast' && item.origin === 'engine').actions.add).toBe(false)
  })

  it('removes add, shortlist, preview and vote for a viewer but keeps navigation', () => {
    const fixture = journeyFixture()
    const projection = project(fixture, { editable: false })
    for (const row of projection.rows) {
      expect(row.actions.preview).toBe(false)
      expect(row.actions.add).toBe(false)
      expect(row.actions.shortlist).toBe(false)
      expect(row.actions.vote).toBe(false)
    }
    const corridor = mustRow(projection, row => row.hit === fixture.hits.corridor)
    expect(corridor.actions.navigate).toBe(true)
  })

  it('removes the mutation actions for a place already on the plan', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    const stay = mustRow(projection, row => row.slotKey === 'stay')
    const corridor = mustRow(projection, row => row.hit === fixture.hits.corridor)
    expect(stay.actions.add).toBe(false)
    expect(stay.actions.shortlist).toBe(false)
    expect(stay.actions.preview).toBe(false)
    expect(corridor.actions.add).toBe(true)
    // Lunch already has an open poll, so vote is correctly withheld.
    expect(corridor.actions.vote).toBe(false)
    const breakfast = mustRow(projection, row => row.slotKey === 'breakfast' && row.origin === 'engine')
    expect(breakfast.actions.vote).toBe(true)
  })

  it('keeps the legacy vote reference unchanged and synthesizes none', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    const lunch = mustRow(projection, row => row.slotKey === 'lunch')
    expect(lunch.vote).toBe(fixture.vote)
    expect(lunch.vote?.decisionId).toBe('dec-legacy-lunch')
    const dinner = mustRow(projection, row => row.slotKey === 'dinner')
    expect(dinner.vote).toBeNull()
  })
})

describe('the context guard is data only', () => {
  it('compares the context key exactly', () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    expect(projectionIsCurrent(projection, fixture.contextKey)).toBe(true)
    expect(projectionIsCurrent(projection, `${fixture.contextKey}/moved`)).toBe(false)
  })

  it('rejects a stale incoming projection and keeps the current one', () => {
    const fixture = journeyFixture()
    const current = project(fixture)
    const stale = project(fixture, { contextKey: 'old-context' })
    expect(acceptProjection(current, stale, fixture.contextKey)).toBe(current)
    expect(acceptProjection(null, stale, fixture.contextKey)).toBeNull()
    const fresh = project(fixture)
    expect(acceptProjection(current, fresh, fixture.contextKey)).toBe(fresh)
  })
})

describe('purity and no provider call', () => {
  it('never calls fetch on the first run or a plan-change rerun', () => {
    globalThis.fetch = (() => {
      throw new Error('provider call attempted')
    }) as typeof fetch
    const fixture = journeyFixture()
    expect(() => project(fixture)).not.toThrow()
    expect(() => project(fixture)).not.toThrow()
    const changed = { ...fixture.dayPlan, slots: [...fixture.dayPlan.slots].reverse() }
    expect(() => project(fixture, { dayPlan: changed })).not.toThrow()
  })

  it('does not mutate frozen inputs and returns detached collections', () => {
    const fixture = journeyFixture()
    const beforePlan = snapshot(fixture.dayPlan)
    const beforeDrive = snapshot(fixture.driveRows)
    deepFreeze(fixture.dayPlan)
    deepFreeze(fixture.driveRows)
    const first = project(fixture)
    const second = project(fixture)
    expect(snapshot(fixture.dayPlan)).toBe(beforePlan)
    expect(snapshot(fixture.driveRows)).toBe(beforeDrive)
    expect(first.rows).not.toBe(second.rows)
    expect(first.unassigned).not.toBe(second.unassigned)
    expect(first.byKey).not.toBe(second.byKey)
    expect(journeyRowsFor(first, 'drive')).not.toBe(first.rows)
    expect(journeyRowsFor(first, 'drive')).toEqual(first.rows)
    expect(journeyRowsFor(first, 'stay')).toEqual([])
  })

  it('keeps slot identity stable across a day reorder', () => {
    const fixture = journeyFixture()
    const forward = project(fixture)
    const reordered = { ...fixture.dayPlan, slots: [...fixture.dayPlan.slots].reverse() }
    const reversed = project(fixture, { dayPlan: reordered })
    for (const key of ['breakfast', 'lunch', 'dinner', 'fuel', 'stay'] as const) {
      const a = mustRow(forward, row => row.slotKey === key)
      const b = mustRow(reversed, row => row.slotKey === key)
      expect(b.key).toBe(a.key)
      expect(b.slotRef).toEqual(a.slotRef)
      expect(b.stopId).toBe(a.stopId)
      expect(b.tripId).toBe(a.tripId)
      expect(b.dayId).toBe(a.dayId)
    }
  })
})
