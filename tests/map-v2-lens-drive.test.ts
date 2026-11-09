// Drive lens board module. Pure function tests.
import { describe, expect, it } from 'vitest'
import {
  driveLensRows,
  type DriveLensRow,
  type LensView,
} from '../src/lib/mapLensContracts'
import type { JourneyRow } from '../src/lib/journeyProjection'
import type { DaySlot, DaySlotKind } from '../src/lib/daySlots'
import type { JourneyStatus } from '../src/pages/trip/journey/journeyDays'
import {
  driveTabOf, driveTabs, scopeBandOf, driveCardStrip, driveDeckIntro,
  type DriveTab,
} from '../src/pages/trip/map/driveLens'

const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

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

function slot(key: DaySlot['key'], kind: DaySlotKind, label: string): DaySlot {
  return {
    key, kind, label, state: 'empty', windowMin: [720, 810], windowLabel: null, segment: null,
    filledStop: null, auto: false, drift: null, urgencyMin: null, ref: null,
  } as unknown as DaySlot
}

function viewOf(rows: JourneyRow[], status: JourneyStatus = READY): LensView<DriveLensRow> {
  return driveLensRows({ status, dayIndex: 0, rows, budgetMin: 60 })
}

function lensRow(r: JourneyRow): DriveLensRow {
  return viewOf([r]).rows[0]!
}

const mealSlot = slot('lunch', 'meal', 'Lunch')
const breakfastSlot = slot('breakfast', 'meal', 'Breakfast')
const fuelSlot = slot('fuel', 'fuel', 'Fuel')
const stretchSlot = slot('stretch', 'stretch', 'Stretch')
const staySlot = slot('stay', 'overnight', 'Stay')
const slots = [mealSlot, breakfastSlot, fuelSlot, stretchSlot, staySlot]

const lunch = (k: string, n: number) => row(k, { slotKey: 'lunch', detourMin: n })
const sight = (k: string) => row(k, { slotKey: null })

describe('DriveTab', () => {
  it('exports the three tab names', () => {
    const names: DriveTab[] = ['meal', 'sights', 'breaks']
    expect(names).toHaveLength(3)
  })
})

describe('driveTabOf', () => {
  it('maps every DaySlotKind to a tab', () => {
    expect(driveTabOf(lensRow(row('a', { slotKey: 'lunch' })), slots)).toBe('meal')
    expect(driveTabOf(lensRow(row('b', { slotKey: 'fuel' })), slots)).toBe('breaks')
    expect(driveTabOf(lensRow(row('c', { slotKey: 'stretch' })), slots)).toBe('breaks')
    expect(driveTabOf(lensRow(row('d', { slotKey: 'stay' })), slots)).toBe('sights')
  })

  it('gives sights for a missing slot key or slot', () => {
    expect(driveTabOf(lensRow(row('e')), slots)).toBe('sights')
    expect(driveTabOf(lensRow(row('f', { slotKey: 'dinner' })), slots)).toBe('sights')
  })
})

describe('driveTabs', () => {
  it('keeps engine row order in each tab', () => {
    const rows = [lunch('a', 5), lunch('b', 8), sight('s'), lunch('c', 12), lunch('d', 20), lunch('e', 28)]
    const result = driveTabs(viewOf(rows), slots, 10)
    expect(result.tabs.find(t => t.tab === 'meal')!.shown.map(r => r.row.key)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('caps at three rows and reports moreCount', () => {
    const rows = [lunch('a', 5), lunch('b', 8), lunch('c', 12), lunch('d', 20), lunch('e', 28)]
    const meal = driveTabs(viewOf(rows), slots).tabs.find(t => t.tab === 'meal')!
    expect(meal.total).toBe(5)
    expect(meal.shown.map(r => r.row.key)).toEqual(['a', 'b', 'c'])
    expect(meal.moreCount).toBe(2)
  })

  it('gives no tabs for every non-ready phase', () => {
    const phases: JourneyStatus[] = [
      { kind: 'unscanned' }, { kind: 'scanning' }, { kind: 'failed' }, { kind: 'quota' },
    ]
    for (const status of phases) {
      expect(driveTabs(viewOf([], status), slots)).toEqual({ phase: status.kind, tabs: [] })
    }
    const empty = viewOf([], READY)
    expect(empty.phase).toBe('empty')
    expect(driveTabs(empty, slots).tabs).toEqual([])
  })

  it('labels a shared meal slot and omits empty tabs', () => {
    const result = driveTabs(viewOf([lunch('a', 5), lunch('b', 8), lunch('c', 12)]), slots)
    expect(result.tabs.map(t => t.tab)).toEqual(['meal'])
    expect(result.tabs[0]!.label).toBe('Lunch gap')
  })

  it('labels mixed meal slots as Meals', () => {
    const rows = [
      row('a', { slotKey: 'lunch', detourMin: 5 }),
      row('b', { slotKey: 'breakfast', detourMin: 8 }),
    ]
    const meal = driveTabs(viewOf(rows), slots).tabs.find(t => t.tab === 'meal')!
    expect(meal.label).toBe('Meals')
  })

  it('labels sights and breaks tabs', () => {
    const rows = [
      row('x', { slotKey: null }),
      row('y', { slotKey: 'fuel' }),
      row('z', { slotKey: 'stretch' }),
    ]
    const tabs = driveTabs(viewOf(rows), slots).tabs
    expect(tabs.find(t => t.tab === 'sights')!.label).toBe('Sights')
    expect(tabs.find(t => t.tab === 'breaks')!.label).toBe('Breaks')
  })
})

describe('scopeBandOf', () => {
  const empty = new Set<string>()

  it('gives inside, just-past and outside by the scopeCounts rule', () => {
    expect(scopeBandOf(lensRow(row('a', { detourMin: 20 })), 30, empty)).toBe('inside')
    expect(scopeBandOf(lensRow(row('b', { detourMin: 30 })), 30, empty)).toBe('inside')
    expect(scopeBandOf(lensRow(row('c', { detourMin: 40 })), 30, empty)).toBe('just-past')
    expect(scopeBandOf(lensRow(row('d', { detourMin: 45 })), 30, empty)).toBe('just-past')
    expect(scopeBandOf(lensRow(row('e', { detourMin: 46 })), 30, empty)).toBe('outside')
    expect(scopeBandOf(lensRow(row('f', { detourMin: 60 })), 30, empty)).toBe('outside')
  })

  it('gives over-budget for a held-back id or spent budget', () => {
    const held = new Set<string>(['a'])
    expect(scopeBandOf(lensRow(row('a', { detourMin: 5 })), 30, held)).toBe('over-budget')
    expect(scopeBandOf(lensRow(row('b', { detourMin: 5, budgetSharePct: 101 })), 30, empty)).toBe('over-budget')
  })

  it('gives unknown for a null detour', () => {
    expect(scopeBandOf(lensRow(row('a', { detourMin: null })), 30, empty)).toBe('unknown')
  })
})

describe('driveCardStrip', () => {
  it('shows label, clock, detour text and budget percent', () => {
    const r = lensRow(row('a', { arriveLabel: '12:05', detourMin: 8, budgetSharePct: 18 }))
    expect(driveCardStrip(r, clock)).toEqual({ arrive: '12:05', detour: '+8 min', budget: '18%' })
  })

  it('uses the clock when no label exists', () => {
    const r = lensRow(row('a', { arriveMin: 725, detourMin: 0.2, budgetSharePct: 27.4 }))
    expect(driveCardStrip(r, clock)).toEqual({ arrive: '12:05', detour: 'On route', budget: '27%' })
  })

  it('null fields give null text', () => {
    const r = lensRow(row('a', {
      arriveMin: null, arriveLabel: null, detourMin: null, budgetSharePct: null,
    }))
    expect(driveCardStrip(r, clock)).toEqual({ arrive: null, detour: null, budget: null })
  })
})

describe('driveDeckIntro', () => {
  it('writes an inside and outside window line', () => {
    const inside = lensRow(row('a', { arriveMin: 725, windowMin: [690, 870], inWindow: true }))
    expect(driveDeckIntro(inside, clock)).toBe('You pass at 12:05, inside the 11:30–14:30 window')
    const outside = lensRow(row('a', { arriveMin: 725, windowMin: [690, 870], inWindow: false }))
    expect(driveDeckIntro(outside, clock)).toBe('You pass at 12:05, outside the 11:30–14:30 window')
  })

  it('returns null text when a field is unknown', () => {
    expect(driveDeckIntro(lensRow(row('a', { arriveMin: null, windowMin: [690, 870], inWindow: true })), clock)).toBeNull()
    expect(driveDeckIntro(lensRow(row('b', { arriveMin: 725, windowMin: null, inWindow: true })), clock)).toBeNull()
    expect(driveDeckIntro(lensRow(row('c', { arriveMin: 725, windowMin: [690, 870], inWindow: null })), clock)).toBeNull()
  })
})
