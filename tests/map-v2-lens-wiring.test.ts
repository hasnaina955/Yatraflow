// W3-W: the Map tab's four lens entries, their counts and their decks.
// The node env has no DOM, so every component check reads the markup string.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MapLensPanel, type MapLensPanelProps } from '../src/pages/trip/map/MapLensPanel'
import { mapLensesFor, phaseCount, type MapLenses, type MapLensId } from '../src/pages/trip/map/useMapLenses'
import type { JourneyRow } from '../src/lib/journeyProjection'
import type { DaySlot } from '../src/lib/daySlots'
import type { LensPhase } from '../src/lib/mapLensContracts'
import type { Trip } from '../src/data/types'

const noop = () => undefined

const PHASES: Array<Exclude<LensPhase, 'ready' | 'empty'>> = ['unscanned', 'scanning', 'failed', 'quota']

function tripOf(): Trip {
  const hotel = {
    id: 'h0', title: 'Spice Village', category: 'hotel', locationName: 'Thekkady',
    lat: 9.6, lng: 77.2, visitMinutes: 0, entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'nice-to-have', status: 'confirmed', orderInDay: 1,
  }
  return {
    id: 't1', name: 'Lens trip', startLocation: 'Munnar',
    startLocationCoords: { lat: 10, lng: 76 },
    destinations: ['Thekkady'], destinationCoords: [{ lat: 9.6, lng: 77.2 }],
    startDate: '2026-11-14', endDate: '2026-11-15', travellers: 2, transportMode: 'car',
    roundTrip: false, budgetPerPersonInr: 20000, travelStyle: 'balanced', fixedCommitments: [],
    days: [
      { id: 'd0', index: 0, title: 'Munnar', startTime: '09:00', stops: [hotel] },
      { id: 'd1', index: 1, title: 'Thekkady', startTime: '09:30', stops: [] },
    ],
    expenses: [], coverEmoji: 'car', visibility: 'private', createdAt: 0, updatedAt: 0,
  } as unknown as Trip
}

function suggestionRow(): JourneyRow {
  return {
    key: 'r1', stopId: null, slotKey: 'lunch',
    hit: { id: 'p1', name: 'Nalla Ruchi Kitchen', latitude: 9.7, longitude: 77.1 },
    detourMin: 8, budgetSharePct: 18, netAddedMin: null, freshness: 'live',
    visitMin: 45, windowMin: [690, 870], inWindow: true,
  } as unknown as JourneyRow
}

function slotOf(): DaySlot {
  return {
    key: 'lunch', kind: 'meal', label: 'Lunch', state: 'empty',
    windowMin: [690, 870], filledStop: null, auto: false, ref: null,
  } as unknown as DaySlot
}

function lensInput(status: Parameters<typeof mapLensesFor>[0]['status']) {
  const trip = tripOf()
  return {
    trip,
    dayIndex: 0,
    status,
    rows: [suggestionRow()],
    slots: [slotOf()],
    budgetMin: 45,
    schedule: {
      activeStops: trip.days[0].stops,
      arrivalTimes: ['17:00'],
    },
    clock: (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
    dayLabel: 'Day 1',
  }
}

function lensFixture(): MapLenses {
  return {
    drive: {
      phase: 'ready',
      view: { phase: 'ready', rows: [], degraded: null },
      tabs: { phase: 'ready', tabs: [] },
    },
    stay: {
      base: { lat: 9.6, lng: 77.2, name: 'Spice Village' },
      phase: 'ready',
      needsBase: false,
      windows: [{ id: 'evening', label: 'Free evening', startMin: 1020, endMin: 1260 }],
      picks: { evening: { kind: 'ready', picks: [], alsoCount: 0 } },
      windowUnknown: false,
      rowCount: 0,
    },
    gap: {
      phase: 'ready',
      view: { phase: 'ready', rows: [], degraded: null },
      gaps: [],
    },
    fix: {
      phase: 'ready',
      view: { phase: 'ready', rows: [], degraded: null },
      target: null,
      problem: null,
      fixes: [],
    },
    counts: { drive: 0, stay: 0, gap: 0, fix: 0 },
  }
}

function panelProps(): MapLensPanelProps {
  return {
    lens: 'drive',
    lenses: lensFixture(),
    dayLabel: 'Day 1',
    dayNumber: 1,
    clock: (min: number) => String(min),
    activeDriveTab: null,
    onDriveTab: noop,
    stripOf: () => ({ arrive: null, detour: null, budget: null }),
    bandOf: () => 'inside',
    introOf: () => null,
    onOpenDrive: noop,
    onAddDrive: noop,
    activeStayWindow: 'evening',
    onStayWindow: noop,
    stayRing: 'walk-15',
    onStayRing: noop,
    onOpenStayPick: noop,
    onAddStayPick: noop,
    onSetStay: noop,
    onOpenGapPick: noop,
    onAddGapPick: noop,
    onApplyFix: noop,
    onPreviewFix: noop,
  }
}

const DECK_LABEL: Record<MapLensId, string> = {
  drive: 'Along the drive',
  stay: 'Around the stay',
  gap: 'Gaps in this day',
  fix: 'Fix this day',
}

describe('phaseCount', () => {
  it('counts only a ready lens, and never turns a failed read into zero', () => {
    expect(phaseCount('ready', 3)).toBe(3)
    expect(phaseCount('ready', 0)).toBe(0)
    for (const phase of PHASES) expect(phaseCount(phase, 3)).toBeNull()
    expect(phaseCount('empty', 3)).toBe(0)
  })
})

describe('mapLensesFor counts', () => {
  it('keeps every wait and failure count unknown, and shows the ready rows', () => {
    const waits = [
      { kind: 'unscanned' as const },
      { kind: 'scanning' as const },
      { kind: 'failed' as const },
      { kind: 'quota' as const },
    ]
    for (const status of waits) {
      // No kept rows or slots: a failed or paused read has nothing to count.
      const out = mapLensesFor({ ...lensInput(status), rows: [], slots: [] })
      expect(out.counts.drive).toBeNull()
      expect(out.counts.stay).toBeNull()
      expect(out.counts.gap).toBeNull()
    }
    const ready = mapLensesFor(lensInput({ kind: 'ready', source: 'scan' }))
    expect(ready.counts.drive).toBe(1)
    expect(ready.counts.gap).toBe(1)
    expect(ready.counts.stay).toBeNull()
    expect(ready.counts.fix).toBe(0)
  })

  it('keeps a failed read with kept rows ready and degraded, never failed', () => {
    const out = mapLensesFor(lensInput({ kind: 'failed' }))
    expect(out.drive.phase).toBe('ready')
    expect(out.drive.view.degraded).toBe('failed')
    expect(out.counts.drive).toBe(1)
    // The empty part is a plan fact, so its gap count stays known and degraded.
    expect(out.gap.phase).toBe('ready')
    expect(out.gap.view.degraded).toBe('failed')
    expect(out.counts.gap).toBe(1)
  })

  it('keeps a stay lens with no saved hotel unknown, not empty', () => {
    const input = lensInput({ kind: 'ready', source: 'scan' })
    input.trip = { ...input.trip, days: input.trip.days.map(day => ({ ...day, stops: [] })) }
    const out = mapLensesFor(input)
    expect(out.stay.needsBase).toBe(true)
    expect(out.counts.stay).toBeNull()
  })
})

describe('MapLensPanel', () => {
  it('renders only the deck for the active lens', () => {
    for (const lens of Object.keys(DECK_LABEL) as MapLensId[]) {
      const markup = renderToStaticMarkup(createElement(MapLensPanel, { ...panelProps(), lens }))
      expect(markup).toContain(`aria-label="${DECK_LABEL[lens]}"`)
      for (const other of Object.keys(DECK_LABEL) as MapLensId[]) {
        if (other !== lens) expect(markup).not.toContain(`aria-label="${DECK_LABEL[other]}"`)
      }
    }
  })

  it('says the stay window is unknown when no window is known', () => {
    const lenses = lensFixture()
    lenses.stay.windows = []
    lenses.stay.windowUnknown = true
    const markup = renderToStaticMarkup(createElement(MapLensPanel, {
      ...panelProps(),
      lens: 'stay',
      lenses,
      activeStayWindow: null,
    }))
    expect(markup).toContain('The free time around this stay is unknown for this day.')
    expect(markup).toContain('aria-label="Around the stay"')
  })
})

describe('MapTab source guard', () => {
  const source = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
  const pill = source.slice(
    source.indexOf('<div className="mv2-lenses mv2-lens-pill"'),
    source.indexOf('<div tabIndex={-1} className={\'poi-col poi-col--needs'),
  )

  it('puts four lens buttons in board order with one rail target', () => {
    expect(pill.length).toBeGreaterThan(0)
    const order = ['Along the drive', 'Around the stay', 'Gaps in this day', 'Fix this day']
      .map(label => pill.indexOf(`phoneLensAriaLabel('${label}'`))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(pill.match(/aria-controls="rail-see"/g)).toHaveLength(4)
  })

  it('drops the old 90 km sentence and points a short route at the stay lens', () => {
    expect(source).not.toContain('(90+ km)')
    expect(source).not.toContain('Not enough driving distance yet for a fatigue plan')
    expect(source).toContain('try Around the stay')
  })
})
