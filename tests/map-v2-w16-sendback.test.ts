import { describe, expect, it } from 'vitest'
import { lockedClockText, windowAroundKm } from '../src/components/map/railModel'
import { buildStopClock } from '../src/lib/stopClock'
import { placeSubtype } from '../src/lib/mapStyles/placeMarks'
import { stayPicks } from '../src/pages/trip/map/stayLens'
import type { StayLensOutput, StayLensRow } from '../src/lib/mapLensContracts'
import type { LensPhase } from '../src/lib/mapLensContracts'
import { closeMinute, stayHoursText } from '../src/components/map/lenses/StayDeck'
import { detailPreviewView, warningSentence, warningTitleText } from '../src/pages/trip/map/detailPreview'
import type { ReadyAddPreview } from '../src/pages/trip/map/editing/addPreview'
import type { ItineraryStop, Trip } from '../src/data/types'

// ---- A fixed booking keeps its own clock ----

function boardTrip(): Trip {
  const stop = (id: string, title: string, category: ItineraryStop['category'], lat: number, lng: number, orderInDay: number, visitMinutes: number): ItineraryStop => ({
    id, title, category, lat, lng, orderInDay, visitMinutes, locationName: title, status: 'confirmed', priority: 'nice-to-have', entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
  })
  return {
    id: 'w16-fixed', name: 'Kerala loop', startLocation: 'Munnar', startLocationCoords: { lat: 10.088, lng: 77.059 },
    destinations: ['Thekkady'], destinationCoords: [{ lat: 9.604, lng: 77.164 }],
    startDate: '2026-11-14', endDate: '2026-11-16', travellers: 2, budgetPerPersonInr: 24000, travelStyle: 'balanced',
    transportMode: 'car', stayStyle: 'comfort', roundTrip: false, createdAt: 1, updatedAt: 1, expenses: [], coverEmoji: '',
    visibility: 'private', members: [{ userId: 'u', role: 'owner', joinedAt: 1 }],
    fixedCommitments: [{ id: 'lock', title: 'Periyar boat', type: 'event', dayIndex: 0, time: '15:30', stopId: 'boat' }],
    days: [{ id: 'd1', index: 0, startTime: '10:00', title: 'Munnar to Thekkady', stops: [
      stop('lunch', 'Lunch · Spice Route Café', 'food', 9.755, 77.116, 1, 45),
      stop('hotel', 'Check in · Spice Village', 'hotel', 9.604, 77.164, 2, 20),
      stop('boat', 'Periyar boat', 'adventure', 9.585, 77.177, 3, 90),
    ] }],
  }
}

describe('a fixed booking reads its commitment time', () => {
  it('shows 15:30 on the boat, not the 14:19 arrival', () => {
    const clock = buildStopClock(boardTrip())
    expect(clock.get('boat')?.arrive).toBe('15:30')
    expect(clock.get('boat')?.fixed).toBe(true)
    // The arrival is still the engine's own number, and the other stops keep it.
    expect(clock.get('hotel')?.arrive).not.toBe('15:30')
    expect(clock.get('hotel')?.fixed).toBeUndefined()
  })

  it('falls back to the arrival when the lock names no clock', () => {
    expect(lockedClockText('15:30', '14:19')).toBe('15:30')
    expect(lockedClockText(null, '14:19')).toBe('14:19')
    expect(lockedClockText('', '14:19')).toBe('14:19')
    expect(lockedClockText('soon', '14:19')).toBe('14:19')
  })
})

// ---- A window names the road position of its picks ----

describe('a window around km', () => {
  it('borrows the pick km when the slot target is the synthesized zero', () => {
    expect(windowAroundKm(0, [57, 58])).toBe(57)
    expect(windowAroundKm(null, [null, 57])).toBe(57)
  })

  it('keeps a real slot target and hides an unknown one', () => {
    expect(windowAroundKm(57, [12])).toBe(57)
    expect(windowAroundKm(0, [0, null])).toBeNull()
  })
})

// ---- One glyph and one family per place kind ----

describe('the stay pick subtypes', () => {
  it('reads a market, a kalari show, a garden and a boat-landing viewpoint apart', () => {
    expect(placeSubtype({ category: 'shopping', name: 'Kumily spice market' })).toMatchObject({ key: 'market', family: 'culture' })
    expect(placeSubtype({ category: 'event', name: 'Kadathanadan Kalari Centre' })).toMatchObject({ key: 'show', family: 'culture' })
    expect(placeSubtype({ category: 'nature', name: 'Periyar spice garden' })).toMatchObject({ key: 'garden', family: 'nature' })
    expect(placeSubtype({ category: 'sightseeing', name: 'Boat landing viewpoint' })).toMatchObject({ key: 'viewpoint', family: 'views' })
  })
})

// ---- Three walk picks keep A/B/C; the drive pick stays unlettered ----

function stayRow(id: string, name: string, lat: number, lng: number): StayLensRow {
  return { row: { hit: { id, name, category: 'sightseeing', latitude: lat, longitude: lng }, visitMin: 60 }, detourMin: null, freshness: null } as unknown as StayLensRow
}

function stayView(rows: StayLensRow[]): StayLensOutput {
  const phase: LensPhase = 'ready'
  return { kind: 'view', base: { kind: 'stop', stopId: 'base', dayIndex: 0 }, view: { phase, rows, degraded: null } }
}

describe('stay picks rank the walk ring first', () => {
  const base = { lat: 9.604, lng: 77.164 }
  const clock = (min: number) => `m${min}`
  const window = { startMin: 800, endMin: 1260 }

  it('letters the three walk picks A/B/C and leaves the drive pick unlettered', () => {
    // The drive pick arrives first in the model order, as the board's data can.
    const result = stayPicks(stayView([
      stayRow('boat', 'Boat landing viewpoint', 9.612, 77.175),
      stayRow('market', 'Kumily spice market', 9.6044, 77.1646),
      stayRow('kalari', 'Kadathanadan Kalari Centre', 9.6043, 77.1646),
      stayRow('garden', 'Periyar spice garden', 9.6046, 77.1636),
    ]), base, window, clock)
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.picks.map(pick => pick.letter)).toEqual(['A', 'B', 'C', null])
    expect(result.picks[3]?.row.row.hit.name).toBe('Boat landing viewpoint')
    expect(result.picks[0]?.reach.walkMin).toBeLessThanOrEqual(15)
    expect(result.picks[3]?.reach.walkMin).toBeGreaterThan(15)
    expect(result.picks[3]?.reach.driveMin).toBeLessThanOrEqual(30)
    expect(result.alsoCount).toBe(0)
  })
})

// ---- A pick states its own hours ----

describe('the hours a pick reports', () => {
  it('reads the close in the reader clock, and hides an unknown close', () => {
    expect(closeMinute({ closeTime: '21:00' })).toBe(1260)
    expect(stayHoursText({ closeTime: '21:00' }, '12h')).toBe('Open till 9:00 PM')
    expect(stayHoursText({ closeTime: '21:00' }, '24h')).toBe('Open till 21:00')
    expect(stayHoursText({ closeTime: '19:30' }, '12h')).toBe('Open till 7:30 PM')
    expect(stayHoursText({ closeTime: '19:30' }, '24h')).toBe('Open till 19:30')
    expect(stayHoursText({ closeTime: null }, '12h')).toBeNull()
    expect(stayHoursText({}, '24h')).toBeNull()
  })
})

// ---- One sentence per warning, with no day prefix ----

describe('a risk line', () => {
  it('drops the day prefix and joins the title to the body', () => {
    expect(warningTitleText('Day 3: Route backtracking')).toBe('Route backtracking')
    expect(warningSentence('Day 3: Route backtracking', 'The order of “Kalvari Mount” adds zig-zag distance.'))
      .toBe('Route backtracking · The order of “Kalvari Mount” adds zig-zag distance.')
    expect(warningSentence('Thin buffer before Periyar boat', 'You reach it ~15:52, after the 15:30 commitment.'))
      .toBe('Thin buffer before Periyar boat · You reach it ~15:52, after the 15:30 commitment.')
  })
})

function readyPreview(over: Partial<ReadyAddPreview> = {}): ReadyAddPreview {
  return {
    kind: 'ready', dayIndex: 2, stopId: 'new',
    insertion: { index: 1, order: 2, total: 4, afterTitle: 'Attukad waterfalls', beforeTitle: 'Check in · Spice Village' },
    road: { legIn: null, legOut: null, replaced: null },
    newStop: { arrive: '11:30', depart: '12:15' },
    orderChanged: false,
    keptClocks: [],
    clocks: [{ stopId: 'hotel', title: 'Check in · Spice Village', from: '13:40', to: '13:31', deltaMin: -9 }],
    dayEnd: { from: '16:00', to: '16:00', deltaMin: 0 },
    warnings: { added: [], cleared: [] },
    netAddedMin: 0, unknownFacts: [],
    impact: {} as ReadyAddPreview['impact'],
    proposedTrip: { fixedCommitments: [] } as unknown as Trip,
    ...over,
  }
}

const clock12 = (hm: string) => hm

describe('the add preview lines', () => {
  it('never says a later stop moved earlier while the order held', () => {
    const view = detailPreviewView(readyPreview(), clock12)
    expect(view.kind).toBe('ready')
    expect(view.lines[0]?.parts.map(part => part.text).join('')).toBe('Stop 2 · After Attukad waterfalls')
    expect(view.lines.some(line => line.key.startsWith('moved-'))).toBe(false)
  })

  it('says the order changed first, then shows the moved clock', () => {
    const view = detailPreviewView(readyPreview({ orderChanged: true }), clock12)
    expect(view.lines[0]?.parts.map(part => part.text).join('')).toBe('Order changed · Before Spice Village')
    expect(view.lines.some(line => line.key === 'moved-hotel')).toBe(true)
  })

  it('writes one risk sentence without the day prefix', () => {
    const view = detailPreviewView(readyPreview({
      warnings: {
        added: [{ code: 'backtrack', title: 'Day 3: Route backtracking', detail: 'The order of “Kalvari Mount” adds zig-zag distance.', severe: false, dayIndex: 2 }],
        cleared: [],
      },
    }), clock12)
    const risk = view.lines.find(line => line.tone === 'risk')
    expect(risk?.parts.map(part => part.text).join('')).toBe('Route backtracking · The order of “Kalvari Mount” adds zig-zag distance.')
  })
})
