// ============ Map v2 facts: lens contracts (package F) ============
// The contracts are types plus pure helpers. These tests pin the state split
// (failed, quota, scanning, empty stay apart), model order, and place-free fixes.
import { describe, expect, it } from 'vitest'
import {
  driveLensRows,
  fixIsOffered,
  fixLensRows,
  gapLensRows,
  gapNoFitReason,
  isPlaceFree,
  lensViewOf,
  stayLensRows,
  type FixChangeSet,
} from '../src/lib/mapLensContracts'
import type { JourneyRow } from '../src/lib/journeyProjection'
import type { DaySlot } from '../src/lib/daySlots'
import type { JourneyStatus } from '../src/pages/trip/journey/journeyDays'

const READY: JourneyStatus = { kind: 'ready', source: 'scan' }

function row(key: string, over: Partial<JourneyRow> = {}): JourneyRow {
  return {
    key, tripId: 't', dayId: 'd', dayIndex: 0, lens: 'drive', purpose: 'meal', slotRef: null, slotKey: null,
    stopId: null, hit: { id: key, name: key, latitude: 1, longitude: 2, kind: 'poi' }, placeKeys: [],
    origin: 'drive', detourMin: 0, detourKm: null, budgetSharePct: 0, visitMin: null, bufferMin: null,
    netAddedMin: null, arriveMin: null, arriveLabel: null, arriveSource: 'none', windowMin: null,
    inWindow: null, reason: null, source: 'osm', freshness: 'retained', vote: null,
    actions: { preview: true, add: true, shortlist: true, vote: false, navigate: true }, ...over,
  }
}

function slot(key: DaySlot['key'], state: DaySlot['state']): DaySlot {
  return {
    key, kind: 'meal', label: key, state, windowMin: [720, 810], windowLabel: null, segment: null,
    filledStop: null, auto: false, drift: null, urgencyMin: null, ref: null,
  } as unknown as DaySlot
}

describe('lensViewOf keeps the five states apart', () => {
  it('never turns a wait or a failure into empty', () => {
    expect(lensViewOf({ kind: 'unscanned' }, []).phase).toBe('unscanned')
    expect(lensViewOf({ kind: 'scanning' }, []).phase).toBe('scanning')
    expect(lensViewOf({ kind: 'failed' }, []).phase).toBe('failed')
    expect(lensViewOf({ kind: 'quota' }, []).phase).toBe('quota')
    expect(lensViewOf(READY, []).phase).toBe('empty')
  })

  it('shows kept rows after a failure and marks them degraded', () => {
    const quota = lensViewOf({ kind: 'quota' }, [1, 2])
    expect(quota).toEqual({ phase: 'ready', rows: [1, 2], degraded: 'quota' })
    expect(lensViewOf({ kind: 'failed' }, [1]).degraded).toBe('failed')
    expect(lensViewOf(READY, [1]).degraded).toBeNull()
  })
})

describe('Drive lens', () => {
  it('keeps model order, unknown as null and a known zero as zero', () => {
    const rows = [row('b', { detourMin: null, budgetSharePct: null }), row('a', { detourMin: 0 }), row('s', { stopId: 'st-1' })]
    const view = driveLensRows({ status: READY, dayIndex: 0, rows, budgetMin: 60 })
    expect(view.rows.map(r => r.row.key)).toEqual(['b', 'a'])
    expect(view.rows[0]!.detourMin).toBeNull()
    expect(view.rows[1]!.detourMin).toBe(0)
    expect(view.rows[1]!.budgetSharePct).toBe(0)
    expect(view.rows[1]!.freshness).toBe('retained')
  })
})

describe('Stay lens', () => {
  const stay = [row('h1', { slotKey: 'stay' }), row('m1', { slotKey: 'lunch' })]
  it('needs a real base and does not call that empty', () => {
    expect(stayLensRows({ status: READY, dayIndex: 0, rows: stay, base: { kind: 'missing' } })).toEqual({ kind: 'needs-base' })
  })
  it('lists only stay-slot suggestions when a base exists', () => {
    const out = stayLensRows({ status: READY, dayIndex: 0, rows: stay, base: { kind: 'stop', stopId: 'st-1', dayIndex: 0 } })
    expect(out.kind).toBe('view')
    if (out.kind === 'view') expect(out.view.rows.map(r => r.row.key)).toEqual(['h1'])
  })
})

describe('Gap lens', () => {
  it('names the fact that blocks a fit', () => {
    expect(gapNoFitReason([])).toBe('no-candidates')
    expect(gapNoFitReason([row('x', { inWindow: false })])).toBe('outside-window')
    expect(gapNoFitReason([row('x', { inWindow: null })])).toBe('window-unproven')
    expect(gapNoFitReason([row('x', { inWindow: false }), row('y', { inWindow: true })])).toBeNull()
  })
  it('lists only empty slots, in slot order', () => {
    const view = gapLensRows({
      status: READY, dayIndex: 0, rows: [row('l1', { slotKey: 'lunch', inWindow: false })],
      slots: [slot('breakfast', 'filled'), slot('lunch', 'empty'), slot('dinner', 'empty')],
    })
    expect(view.rows.map(r => [r.slotKey, r.noFit])).toEqual([['lunch', 'outside-window'], ['dinner', 'no-candidates']])
  })
})

describe('Fix lens', () => {
  const set = (id: string, over: Partial<FixChangeSet> = {}): FixChangeSet => ({
    id, dayIndex: 0, target: { code: 'late', stopId: 's1' },
    changes: [{ kind: 'swap', stopId: 's1', withStopId: 's2' }],
    verification: { kind: 'verified', clearsTarget: true, introduced: [], deltaMin: -10 }, ...over,
  })

  it('offers only a verified set that clears its target and adds no severe warning', () => {
    expect(fixIsOffered(set('a'))).toBe(true)
    expect(fixIsOffered(set('b', { verification: { kind: 'unverified' } }))).toBe(false)
    expect(fixIsOffered(set('c', { verification: { kind: 'failed', reason: 'x' } }))).toBe(false)
    expect(fixIsOffered(set('d', { verification: { kind: 'verified', clearsTarget: false, introduced: [], deltaMin: null } }))).toBe(false)
    expect(fixIsOffered(set('e', { verification: { kind: 'verified', clearsTarget: true, introduced: [{ code: 'closed', stopId: 's2', severe: true }], deltaMin: 0 } }))).toBe(false)
  })

  it('stays place-free and rejects a change that smuggles a place', () => {
    expect(isPlaceFree(set('a'))).toBe(true)
    const dirty = { ...set('z'), changes: [{ kind: 'remove', stopId: 's1', hit: { id: 1 } }] } as unknown as FixChangeSet
    expect(isPlaceFree(dirty)).toBe(false)
  })

  it('keeps producer order and filters by day only', () => {
    const view = fixLensRows({ status: READY, dayIndex: 1, sets: [set('a'), set('b', { dayIndex: 1 }), set('c', { dayIndex: 1 })] })
    expect(view.rows.map(s => s.id)).toEqual(['b', 'c'])
    expect(fixLensRows({ status: { kind: 'failed' }, dayIndex: null, sets: [] }).phase).toBe('failed')
  })
})
