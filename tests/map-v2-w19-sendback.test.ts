// ============ W19: send-back on the W18 Fix and Stay scenes ============
// The W18 loop fix removed the caption-driven view tick, so the Stay ring
// camera fit stopped running after the lens or the stay base changed. The
// other four defects are copy and ordering rules on the Fix rail and card.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatHM } from '../src/lib/timefmt'
import { fixProblemSubLine, railClockOrder } from '../src/components/map/railModel'
import { fixPlaceTitle, fixSummary, formatFixEvidence } from '../src/pages/trip/map/fixLens'
import type { FixChangeSet } from '../src/lib/mapLensContracts'
import type { ItineraryDay, ItineraryStop, Trip } from '../src/data/types'

const here = dirname(fileURLToPath(import.meta.url))
const read = (file: string) => readFileSync(join(here, '..', file), 'utf-8')
const clock12 = (hm: string) => formatHM(hm, '12h')
const clock24 = (hm: string) => formatHM(hm, '24h')
const minuteClock = (min: number) => formatHM(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, '12h')

function setOf(changes: FixChangeSet['changes']): FixChangeSet {
  return {
    id: 'test', dayIndex: 2, changes,
    target: { code: 'commitment', stopId: 'boat' },
    verification: { kind: 'verified', clearsTarget: true, stopClear: true, introduced: [], deltaMin: 0 },
  } as FixChangeSet
}

function namedStop(id: string, title: string, orderInDay: number): ItineraryStop {
  return {
    id, title, category: 'sightseeing', locationName: title,
    lat: 9.6, lng: 77.15, visitMinutes: 30, status: 'confirmed',
    orderInDay, priority: 'nice-to-have', entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0, notes: '', description: '',
  } as ItineraryStop
}

function tripWithStops(): Trip {
  const day = {
    id: 'd3', index: 2, startTime: '11:00',
    stops: [
      namedStop('falls', 'Attukad waterfalls', 1),
      namedStop('lunch', 'Lunch · Nalla Ruchi Kitchen', 2),
      namedStop('farm', 'Spice farm walk', 3),
      namedStop('checkin', 'Check in · Spice Village', 4),
      namedStop('boat', 'Periyar boat', 5),
    ],
  } as ItineraryDay
  return { id: 't', days: [day], fixedCommitments: [] } as unknown as Trip
}

describe('item 1: the Stay ring camera fits once per lens or base change', () => {
  it('keeps the fit effect dependent on the lens flag and the ring content key', () => {
    const source = read('src/components/TripMap.tsx')
    expect(source).toMatch(/\[stayRingsKey, mapLoaded, frameStayRing, stayOwnsCamera, frameTick\]/)
    expect(source).not.toMatch(/^\s*setViewTick\(tick => tick \+ 1\)\s*$/m)
  })

  it('keeps the render loop dead: no unconditional view tick on every camera move', () => {
    const source = read('src/components/TripMap.tsx')
    expect(source).toContain('if (captionsChanged) setViewTick')
    expect(source).toContain('setMapZoom(prev => prev === zoom ? prev : zoom)')
  })
})

describe('item 2: the Fix rail lists rows by their clock time', () => {
  it('puts the 3:30 PM boat before a 5:18 PM check-in', () => {
    const rows = [
      { id: 'checkin', clock: '17:18' },
      { id: 'boat', clock: '15:30' },
    ]
    expect(railClockOrder(rows).map(row => row.id)).toEqual(['boat', 'checkin'])
  })

  it('keeps the board order when the clocks already agree', () => {
    const rows = [
      { id: 'checkin', clock: '14:41' },
      { id: 'boat', clock: '15:30' },
    ]
    expect(railClockOrder(rows).map(row => row.id)).toEqual(['checkin', 'boat'])
  })

  it('leaves an unreadable clock in its plan position', () => {
    const rows = [
      { id: 'boat', clock: '15:30' },
      { id: 'unknown', clock: null },
    ]
    expect(railClockOrder(rows).map(row => row.id)).toEqual(['boat', 'unknown'])
  })
})

describe('item 3: Fix text uses the reader’s clock preference', () => {
  const evidence = 'You reach Periyar boat ~17:57, after boarding closes at 15:00.'

  it('renders the reader’s 12 h clock in the problem evidence', () => {
    const line = formatFixEvidence(evidence, clock12)
    expect(line).toBe('You reach Periyar boat ~5:57 PM, after boarding closes at 3:00 PM.')
  })

  it('renders the reader’s 24 h clock in the problem evidence', () => {
    const line = formatFixEvidence(evidence, clock24)
    expect(line).toBe('You reach Periyar boat ~17:57, after boarding closes at 15:00.')
  })

  it('renders both times in the Fix rail sub line in 12 h and 24 h', () => {
    expect(fixProblemSubLine({ title: 'Conflicts with Periyar boat', evidence: [evidence] }, clock12))
      .toBe('Jetty 5:57 PM · boarding 3:00 PM')
    expect(fixProblemSubLine({ title: 'Conflicts with Periyar boat', evidence: [evidence] }, clock24))
      .toBe('Jetty 17:57 · boarding 15:00')
  })

  it('keeps AM and PM when the evidence is already in the reader’s clock', () => {
    expect(fixProblemSubLine({
      title: 'Conflicts with Periyar boat',
      evidence: ['You reach Periyar boat ~5:57 PM, after boarding closes at 3:00 PM.'],
    })).toBe('Jetty 5:57 PM · boarding 3:00 PM')
  })

  it('keeps the map chip and the Fix rail on the same shared formatter', () => {
    const chrome = read('src/components/map/MapWorkspaceChrome.tsx')
    const lenses = read('src/pages/trip/map/useMapLenses.ts')
    expect(chrome).toContain('formatHM(fixPoint.arrive, timeFormat)')
    expect(chrome).toContain('fixProblemSubLine(fixProblem)')
    expect(lenses).toContain('formatFixEvidence(chosen.warning.detail, clock)')
  })
})

describe('item 4: Fix titles name places, not engine positions', () => {
  const names: Record<string, string> = {
    boat: 'Periyar boat',
    checkin: 'Check in · Spice Village',
    farm: 'spice farm walk',
    falls: 'Attukad waterfalls',
  }
  const nameOf = (id: string) => names[id] ?? id
  const stopsOf = (trip: Trip) => trip.days[0].stops

  it('names the check-in when the boat moves before it', () => {
    const trip = tripWithStops()
    const set = setOf([{ kind: 'move', stopId: 'boat', toIndex: 3 }])
    expect(fixPlaceTitle(set.changes[0], stopsOf(trip), nameOf)).toBe('Go to the jetty first, check in after')
    expect(fixSummary(set, nameOf, minuteClock, stopsOf(trip)).title)
      .toBe('Go to the jetty first, check in after')
  })

  it('names the spice farm walk when the boat moves before it', () => {
    const trip = tripWithStops()
    const set = setOf([{ kind: 'move', stopId: 'boat', toIndex: 2 }])
    expect(fixPlaceTitle(set.changes[0], stopsOf(trip), nameOf)).toBe('Go to the boat before spice farm walk')
    expect(fixPlaceTitle(set.changes[0], stopsOf(trip), nameOf)).not.toMatch(/position/i)
  })

  it('keeps the day-and-time wording for a next-day sailing', () => {
    const set = setOf([{ kind: 'move-commitment', commitmentId: 'fc', stopId: 'boat', fromDayIndex: 2, toDayIndex: 3, time: '09:30' }])
    const summary = fixSummary(set, nameOf, minuteClock, stopsOf(tripWithStops()))
    expect(summary.title).toBe('Move the boat to Day 4, 9:30 AM sailing')
  })

  it('names both places for a swap', () => {
    const set: FixChangeSet = {
      id: 'swap', dayIndex: 2, changes: [{ kind: 'swap', stopId: 'boat', withStopId: 'checkin' }],
      target: { code: 'commitment', stopId: 'boat' }, verification: { kind: 'unverified' },
    } as FixChangeSet
    const title = fixSummary(set, nameOf, minuteClock, stopsOf(tripWithStops())).title
    expect(title).toMatch(/boat/i)
    expect(title).toMatch(/check-in/i)
    expect(title).not.toMatch(/position/i)
  })
})

describe('item 5: the Fix sub line keeps both clocks uncut', () => {
  const evidence = 'You reach Periyar boat ~17:57, after boarding closes at 15:00.'

  it('uses the short boarding wording with no ellipsis in 12 h', () => {
    expect(fixProblemSubLine({ title: 'Conflicts with Periyar boat', evidence: [evidence] }, clock12))
      .toBe('Jetty 5:57 PM · boarding 3:00 PM')
  })

  it('uses the short boarding wording with no ellipsis in 24 h', () => {
    expect(fixProblemSubLine({ title: 'Conflicts with Periyar boat', evidence: [evidence] }, clock24))
      .toBe('Jetty 17:57 · boarding 15:00')
  })
})
