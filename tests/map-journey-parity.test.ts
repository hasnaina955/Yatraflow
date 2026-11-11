// ============ Map parity over the shared projection (#08 L2) ============
// Real L1 projection, real fixture, real adapter. Only the transport is
// controlled: a throwing fetch stub proves the Map path never calls out.
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  acceptProjection,
  projectJourney,
  projectionIsCurrent,
  type JourneyProjection,
} from '../src/lib/journeyProjection'
import {
  driveRowForHit,
  mapAllJourneyRows,
  mapAllJourneyRowsForDays,
  mapCardActions,
  mapJourneyRows,
  mapRailRowForHit,
  mapRowForHit,
  mapRowsForHit,
  mapRowsForSlot,
  type MapJourneyRow,
} from '../src/pages/trip/map/mapJourneyRows'
import { isSameEntity } from '../src/lib/placeIdentity'
import { journeyFixture, type JourneyFixture } from './helpers/journeyProjectionFixture'

const originalFetch = globalThis.fetch
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

afterEach(() => {
  globalThis.fetch = originalFetch
})

function project(
  fixture: JourneyFixture,
  overrides: Partial<Parameters<typeof projectJourney>[0]> = {},
): JourneyProjection {
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

function mapRows(fixture: JourneyFixture, overrides: Partial<Parameters<typeof projectJourney>[0]> = {}): MapJourneyRow[] {
  return mapJourneyRows(project(fixture, overrides), fixture.driveRows)
}

function mustRow(rows: readonly MapJourneyRow[], match: (row: MapJourneyRow) => boolean): MapJourneyRow {
  const row = rows.find(match)
  if (!row) throw new Error('fixture Map row is missing')
  return row
}

describe('row order and slot replacement', () => {
  it("keeps the projection's engine order and puts a slot row in the replaced position", () => {
    const fixture = journeyFixture()
    const projection = project(fixture)
    const rows = mapJourneyRows(projection, fixture.driveRows)
    expect(rows.map(row => row.key)).toEqual(projection.rows.map(row => row.key))
    expect(rows[0]?.hit).toBe(fixture.hits.corridor)
    expect(rows[0]?.slotKey).toBe('lunch')
    // The corridor drive row was replaced, not appended as a second fact set.
    expect(rows.some(row => row.origin === 'drive' && row.hit === fixture.hits.corridor)).toBe(false)
  })

  it('keeps the engine order for a plan with no slot rows', () => {
    const fixture = journeyFixture()
    const empty = { ...fixture.dayPlan, slots: [] }
    const rows = mapJourneyRows(project(fixture, { dayPlan: empty }), fixture.driveRows)
    expect(rows.map(row => row.hit)).toEqual(fixture.driveRows.map(row => row.hit))
  })

  it('groups the slot occurrences a part owns', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture)
    expect(mapRowsForSlot(rows, 'lunch')).toHaveLength(2)
    expect(mapRowsForSlot(rows, 'dinner')).toHaveLength(1)
    expect(mapRowsForSlot(rows, null)).toEqual([])
  })
})

describe('card facts come from the row', () => {
  it('carries cost, time, source, freshness and actions from the projection', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture)
    const row = mapRowForHit(rows, fixture.hits.corridor, fixture.dayIndex, { slotKey: 'lunch' })
    expect(row).toBeDefined()
    expect(row?.detourMin).toBe(12)
    expect(row?.arriveMin).toBe(770)
    expect(row?.inWindow).toBe(true)
    expect(row?.budgetSharePct).toBe(27)
    expect(row?.visitMin).toBeNull()
    expect(row?.source).toBe('google')
    expect(row?.freshness).toBe('unknown')
    expect(row?.reason).toBe('Breaks a 2 h drive')
    expect(row?.slotKey).toBe('lunch')
    expect(row?.actions.add).toBe(true)
    expect(row?.actions.navigate).toBe(true)
  })

  it('keeps a filled slot visit fact and stop identity on the card row', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture)
    const fuel = mapRowForHit(rows, fixture.hits.fuel, fixture.dayIndex)
    expect(fuel?.stopId).toBe('stop-fuel')
    expect(fuel?.visitMin).toBe(25)
    expect(fuel?.arriveLabel).toBe('13:05')
    expect(fuel?.detourMin).toBe(4)
  })

  it('copies retained freshness without upgrading it', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture, { freshness: { 'google:g-corridor': 'retained' } })
    expect(mapRowForHit(rows, fixture.hits.corridor, fixture.dayIndex, { slotKey: 'lunch' })?.freshness).toBe('retained')
    expect(mapRowForHit(rows, fixture.hits.zero)?.freshness).toBe('unknown')
  })

  it('carries a drive row arrival and share, not a second computation', () => {
    const fixture = journeyFixture()
    const zero = fixture.driveRows.find(row => row.hit === fixture.hits.zero)
    if (!zero) throw new Error('fixture zero drive row is missing')
    const rows = mapRows(fixture, {
      driveRows: fixture.driveRows.map(row => row === zero
        ? { ...row, arriveMin: 600, arriveLabel: '10:00', budgetSharePct: 12 }
        : row),
    })
    const row = mapRowForHit(rows, fixture.hits.zero, fixture.dayIndex)
    expect(row?.arriveMin).toBe(600)
    expect(row?.arriveLabel).toBe('10:00')
    expect(row?.budgetSharePct).toBe(12)
    // A drive row with no measured cost fact stays an honest unknown.
    expect(mapRowForHit(rows, fixture.hits.sharedGoogle)?.arriveMin).toBeNull()
    expect(mapRowForHit(rows, fixture.hits.sharedGoogle)?.budgetSharePct).toBeNull()
  })
})

describe('provider-aware repeated identity', () => {
  it('keeps two providers that share a raw id as two rows', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture)
    const google = mapRowForHit(rows, fixture.hits.sharedGoogle)
    const osm = mapRowForHit(rows, fixture.hits.sharedOsm)
    expect(google).toBeDefined()
    expect(osm).toBeDefined()
    expect(google?.key).not.toBe(osm?.key)
    expect(google?.placeKeys).not.toEqual(osm?.placeKeys)
    expect(isSameEntity(google!.hit, osm!.hit)).toBe(false)
    // Known-bad control: a raw-id map would have collapsed the two providers.
    const rawIdMap = new Map(rows.map(row => [String(row.hit.id), row]))
    expect(rawIdMap.size).toBeLessThan(rows.length)
    expect(rawIdMap.get('1')?.hit).not.toBe(undefined)
  })

  it('keeps an unknown detour null and a known on-road zero at zero', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture)
    expect(mapRowForHit(rows, fixture.hits.unknown)?.detourMin).toBeNull()
    expect(mapRowForHit(rows, fixture.hits.zero)?.detourMin).toBe(0)
  })

  it('resolves the drive-row presentation facts by entity, not by raw id', () => {
    const fixture = journeyFixture()
    expect(driveRowForHit(fixture.driveRows, fixture.hits.sharedOsm)?.purpose).toBe('fuel')
    expect(driveRowForHit(fixture.driveRows, fixture.hits.sharedGoogle)?.purpose).toBe('sight')
  })
})

describe('occurrence identity', () => {
  it('does not guess between repeated slot occurrences without a binding', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture)
    expect(mapRowsForHit(rows, fixture.hits.corridor, fixture.dayIndex)).toHaveLength(2)
    expect(mapRowForHit(rows, fixture.hits.corridor, fixture.dayIndex)).toBeUndefined()
    expect(mapRowForHit(rows, fixture.hits.corridor, fixture.dayIndex, { slotKey: 'lunch' })?.slotKey).toBe('lunch')
    expect(mapRowForHit(rows, fixture.hits.corridor, fixture.dayIndex, { slotKey: 'dinner' })?.slotKey).toBe('dinner')
  })

  it('binds the exact slot ref or stop id when the selection names one', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture)
    const lunch = mustRow(rows, row => row.slotKey === 'lunch')
    expect(mapRowForHit(rows, fixture.hits.corridor, fixture.dayIndex, { slotRef: lunch.slotRef })?.key).toBe(lunch.key)
    expect(mapRowForHit(rows, fixture.hits.fuel, fixture.dayIndex, { stopId: 'stop-fuel' })?.stopId).toBe('stop-fuel')
    expect(mapRowForHit(rows, fixture.hits.fuel, fixture.dayIndex, { stopId: 'stop-other' })).toBeUndefined()
  })

  it('does not fall back to another day', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture)
    expect(mapRowForHit(rows, fixture.hits.corridor, fixture.dayIndex + 1)).toBeUndefined()
    expect(mapRailRowForHit(rows, fixture.hits.corridor, fixture.dayIndex)?.slotKey).toBe('lunch')
  })

  it('keeps foreign-day rows only in the explicit all-rows adapter', () => {
    const fixture = journeyFixture()
    const drive = fixture.driveRows.find(row => row.hit === fixture.hits.corridor)!
    const foreign = { ...drive, dayIndex: fixture.dayIndex + 1 }
    const projection = project(fixture, {
      driveRows: [...fixture.driveRows.filter(row => row !== drive), foreign],
    })
    const dayOnly = mapJourneyRows(projection, fixture.driveRows)
    const all = mapAllJourneyRows(projection, fixture.driveRows)
    expect(projection.unassigned).toHaveLength(1)
    expect(all).toHaveLength(dayOnly.length + projection.unassigned.length)
    const foreignRow = mapRowForHit(all, fixture.hits.corridor, fixture.dayIndex + 1)
    expect(foreignRow?.dayIndex).toBe(fixture.dayIndex + 1)
    expect(foreignRow?.dayId).toBeNull()
    // The foreign row never enters the day's byKey or its order.
    expect(dayOnly.some(row => row.dayIndex === fixture.dayIndex + 1)).toBe(false)
    expect(projection.byKey.has(foreignRow!.key)).toBe(false)
  })
})

describe('actions and presentation state', () => {
  it('removes mutation actions for a viewer but keeps navigation', () => {
    const fixture = journeyFixture()
    const rows = mapRows(fixture, { editable: false })
    for (const row of rows) {
      expect(row.actions.preview).toBe(false)
      expect(row.actions.add).toBe(false)
      expect(row.actions.shortlist).toBe(false)
      expect(row.actions.vote).toBe(false)
    }
    expect(mapRowForHit(rows, fixture.hits.corridor, fixture.dayIndex, { slotKey: 'lunch' })?.actions.navigate).toBe(true)
  })

  it('attaches rail state without changing a cost fact', () => {
    const fixture = journeyFixture()
    const driveRows = fixture.driveRows.map(row => (
      row.hit === fixture.hits.corridor ? { ...row, state: 'dismissed' as const } : row
    ))
    const rows = mapJourneyRows(project(fixture), driveRows)
    const row = mapRowForHit(rows, fixture.hits.corridor, fixture.dayIndex, { slotKey: 'lunch' })
    expect(row?.state).toBe('dismissed')
    expect(row?.detourMin).toBe(12)
  })
})

describe('context guard and purity', () => {
  it('rejects a stale projection and keeps the current rows', () => {
    const fixture = journeyFixture()
    const current = project(fixture)
    const stale = project(fixture, { contextKey: 'stale-context' })
    expect(projectionIsCurrent(stale, fixture.contextKey)).toBe(false)
    const kept = acceptProjection(current, stale, fixture.contextKey)
    expect(kept).toBe(current)
    expect(mapJourneyRows(kept!, fixture.driveRows).map(row => row.key))
      .toEqual(mapJourneyRows(current, fixture.driveRows).map(row => row.key))
    expect(acceptProjection(null, stale, fixture.contextKey)).toBeNull()
  })

  it('never calls fetch on the projection and adapter path', () => {
    globalThis.fetch = (() => {
      throw new Error('provider call attempted')
    }) as typeof fetch
    const fixture = journeyFixture()
    expect(() => mapRows(fixture)).not.toThrow()
    expect(() => mapRows(fixture)).not.toThrow()
  })
})

describe('whole-trip Map rows (P1/P6)', () => {
  it('finds another day and never guesses an unknown day', () => {
    const fixture = journeyFixture()
    const zero = fixture.hits.zero
    const dayOneRow = {
      ...fixture.driveRows[0],
      id: String(zero.id),
      hit: zero,
      dayIndex: 1,
      lane: 'sight' as const,
      purpose: 'sight',
    }
    const dayZero = project(fixture)
    const dayOne = projectJourney({
      dayPlan: { ...fixture.dayPlan, dayIndex: 1, dayId: 'day-one' },
      driveRows: [dayOneRow],
      budgetMin: fixture.budgetMin,
      editable: true,
      presence: fixture.presence,
      contextKey: 'day-one',
    })
    const all = mapAllJourneyRowsForDays(
      [{ projection: dayZero }, { projection: dayOne }],
      [...fixture.driveRows, dayOneRow],
    )
    expect(mapRailRowForHit(all, zero, 1)).toBeDefined()
    // Active-day-only is the negative control: it cannot see day 1.
    const activeOnly = mapJourneyRows(dayZero, [dayOneRow])
    expect(mapRailRowForHit(activeOnly, zero, 1)).toBeUndefined()
  })

  it('disables ambiguous projected card mutations but keeps navigation', () => {
    const actions = mapCardActions(undefined, true)
    expect(actions).toEqual({ preview: false, add: false, shortlist: false, vote: false, navigate: true })
    expect(mapCardActions(undefined, false)).toBeUndefined()
  })
})

describe('MapTab wiring pin', () => {
  const source = readFileSync(join(root, 'src', 'pages', 'trip', 'MapTab.tsx'), 'utf8').replace(/\r\n/g, '\n')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  function assertLivePin(label: string, pattern: RegExp, marker: string) {
    expect(code, `${label}: live source`).toMatch(pattern)
    expect(code, `${label}: marker present`).toContain(marker)
    expect(code.replace(marker, ''), `${label}: negative control`).not.toMatch(pattern)
  }

  it('consumes the shared producer rows and mapJourneyRows', () => {
    expect(code).not.toMatch(/projectJourney\(/)
    expect(code).not.toMatch(/projectionIsCurrent\(/)
    assertLivePin('adapter call', /mapAllJourneyRowsForDays\(/, 'mapAllJourneyRowsForDays(')
    expect(code).toMatch(/journeyDays\.byDay\.get\(activeDayIndex\)/)
    expect(code).toMatch(/mapRailRowForHit\(/)
    expect(code).toMatch(/mapRowsForHit\(/)
    const producer = readFileSync(join(root, 'src', 'pages', 'trip', 'journey', 'journeyDays.ts'), 'utf8').replace(/\r\n/g, '\n')
    expect(producer).toContain('projectJourney(')
    expect(producer).toContain('daySchedule: sim')
  })

  it('passes projected card facts and never recomputes a visit in the Map', () => {
    // The row's projected visit wins. When there is no row, the add preview's
    // projected visit is the next source; both are engine facts, not page math.
    expect(code).toMatch(/visitMin=\{selectedRow\?\.visitMin \?\? detailPreviewData\?\.visitMin \?\? \(selectedProjected \? null : undefined\)\}/)
    expect(code).toMatch(/budgetSharePct=\{selectedRow \? selectedRow\.budgetSharePct : selectedProjected \? null : undefined\}/)
    expect(code).toMatch(/freshness=\{selectedRow \? selectedRow\.freshness : selectedProjected \? 'unknown' : undefined\}/)
    expect(code).toMatch(/actions=\{mapCardActions\(selectedRow, selectedProjected\)\}/)
  })

  it('keeps the existing add modal and preview path', () => {
    expect(code).toMatch(/openAddModal\(hit\)/)
    expect(code).toMatch(/openAddModal\(selectedHit\)/)
    expect(code).toMatch(/previewOpen/)
  })

  it('does not rebuild a second raw-id fact view', () => {
    expect(code).not.toMatch(/driveRowById/)
    expect(code).not.toMatch(/driveRows\.map\(r => \[r\.id, r\]\)/)
    expect(code).not.toMatch(/selectedRow\?\.detourMin \?\?/)
    expect(code).not.toMatch(/driveRowsFromSegments\(/)
  })
})
