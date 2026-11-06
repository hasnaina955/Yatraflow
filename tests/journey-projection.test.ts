// ============ The shared journey projection (#08 L1) ============
// Real projection, real day plan, real identity helpers. Only the transport is
// controlled: a throwing fetch stub proves the projection never calls out.
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptProjection,
  journeyRowsFor,
  projectJourney,
  projectionIsCurrent,
  type JourneyProjection,
  type JourneyRow,
} from '../src/lib/journeyProjection'
import { isSameEntity, placeKeysOf } from '../src/lib/placeIdentity'
import { deepFreeze, journeyFixture, type JourneyFixture } from './helpers/journeyProjectionFixture'

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
    for (const row of projection.rows) {
      expect(projection.byKey.get(row.key)).toBe(row)
      expect(row.lens).toBe('drive')
    }
  })

  it('carries every contract field on every row, with honest nulls', () => {
    const projection = project(journeyFixture())
    for (const row of projection.rows) {
      expect(typeof row.key).toBe('string')
      expect(row.key.length).toBeGreaterThan(0)
      expect(typeof row.dayIndex).toBe('number')
      expect(typeof row.purpose).toBe('string')
      expect(Array.isArray(row.placeKeys)).toBe(true)
      expect(['manual', 'engine', 'drive']).toContain(row.origin)
      expect(['live', 'retained', 'stale', 'unknown']).toContain(row.freshness)
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
    expect(fuel.visitMin).toBe(fixture.stops.fuel.visitMinutes)
    // The matching drive row was replaced by this slot row.
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
    expect(stay.placeKeys).toEqual(placeKeysOf(fixture.hits.stay))
    expect(stay.detourMin).toBeNull()
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

  it('does not derive a visit, buffer or net-added number', () => {
    const projection = project(journeyFixture())
    for (const row of projection.rows) {
      expect(row.bufferMin).toBeNull()
      expect(row.netAddedMin).toBeNull()
      if (row.stopId === null) expect(row.visitMin).toBeNull()
    }
  })
})

describe('freshness and actions are passed facts', () => {
  it('copies retained freshness and defaults the rest to unknown', () => {
    const fixture = journeyFixture()
    const projection = project(fixture, { freshness: { 'google:g-corridor': 'retained' } })
    const corridor = mustRow(projection, row => row.hit === fixture.hits.corridor)
    const other = mustRow(projection, row => row.hit === fixture.hits.sharedGoogle)
    expect(corridor.freshness).toBe('retained')
    expect(other.freshness).toBe('unknown')
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
