// ============ W20: the final Map tab v2 fix pass ============
// Pure-logic tests for the rules W20 added or replaced. The DOM facts are proved
// with the pair screenshots and the per-lens console counts in the report.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stayFrameAction } from '../src/lib/map/stayRings'
import { fixPlaceTitle, fixSummary } from '../src/pages/trip/map/fixLens'
import type { FixChangeSet } from '../src/lib/mapLensContracts'
import type { ItineraryStop } from '../src/data/types'
import { dayEndTown, lastNightStaySub, railDepartClock, railLegVisible, stayRailTitle } from '../src/components/map/railModel'
import { formatClocksInText } from '../src/lib/timefmt'
import { pickFactChips, SLOT_SEARCH_PROVENANCE } from '../src/components/map/placeCardFacts'
import { placeSubLine } from '../src/components/map/lenses/LensPlaceCard'
import { manualCandidateFor } from '../src/pages/trip/map/slotFiling'
import { stayWindows } from '../src/pages/trip/map/stayLens'

const here = dirname(fileURLToPath(import.meta.url))
const read = (file: string) => readFileSync(join(here, '..', file), 'utf-8').replace(/\r\n/g, '\n')

describe('A1: the Stay camera frames the ring once per lens or base change', () => {
  const base = { framing: true, hasRing: true, key: 'walk:1', framedKey: null as string | null, released: false }

  it('frames when the lens opens a ring that was not framed yet', () => {
    expect(stayFrameAction(base)).toBe('frame')
  })

  it('frames again when the stay base moves, even after the reader moved the map', () => {
    expect(stayFrameAction({ ...base, key: 'walk:2', framedKey: 'walk:1', released: true })).toBe('frame')
  })

  it('keeps the reader camera when only the container resized', () => {
    expect(stayFrameAction({ ...base, framedKey: 'walk:1', released: true })).toBe('skip')
  })

  it('frames again after a resize when the reader has not moved the map', () => {
    expect(stayFrameAction({ ...base, framedKey: 'walk:1', released: false })).toBe('frame')
  })

  it('does nothing outside the Stay lens or with no ring', () => {
    expect(stayFrameAction({ ...base, framing: false })).toBe('skip')
    expect(stayFrameAction({ ...base, hasRing: false })).toBe('skip')
  })

  it('has no view tick in the fit dependencies, so a caption change cannot refit', () => {
    const source = read('src/components/TripMap.tsx')
    expect(source).not.toMatch(/\[stayRing\w*, mapLoaded, frameStayRing, viewTick\]/)
    expect(source).toMatch(/stayFrameAction\(/)
  })

  it('lets the Stay camera own the view: the route fit yields while a ring is framed', () => {
    const source = read('src/components/TripMap.tsx')
    expect(source).toMatch(/const stayOwnsCamera = frameStayRing && stayRings\.length > 0/)
    expect(source).toMatch(/if \(stayOwnsCamera\) return/)
  })
})

// ---------- A4: Fix titles and sub lines in place words ----------

const mkStop = (id: string, title: string, visitMinutes = 30): ItineraryStop => ({
  id, title, category: 'sightseeing', locationName: title, lat: 9.6, lng: 77.15, visitMinutes,
  status: 'confirmed', orderInDay: 1, priority: 'nice-to-have', entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
}) as ItineraryStop
const dayStops = [
  mkStop('falls', 'Attukad waterfalls'),
  mkStop('lunch', 'Lunch · Nalla Ruchi Kitchen'),
  mkStop('farm', 'Spice farm walk', 45),
  mkStop('checkin', 'Check in · Spice Village'),
  mkStop('boat', 'Periyar boat', 90),
]
const titleOf = (id: string) => dayStops.find(stop => stop.id === id)?.title ?? id
const setOf = (changes: FixChangeSet['changes'], deltaMin: number | null = 14): FixChangeSet => ({
  id: 's', dayIndex: 2, changes, target: { code: 'commitment', stopId: 'boat' },
  verification: { kind: 'verified', clearsTarget: true, stopClear: true, introduced: [], deltaMin },
}) as FixChangeSet

describe('A4: Fix titles name places without "the" and keep their own case', () => {
  it('says "before lunch" for a meal stop', () => {
    const change = { kind: 'move', stopId: 'boat', toIndex: 1 } as const
    expect(fixPlaceTitle(change, dayStops, titleOf)).toBe('Go to the boat before lunch')
  })

  it('keeps a place name in its own case', () => {
    const change = { kind: 'move', stopId: 'boat', toIndex: 0 } as const
    expect(fixPlaceTitle(change, dayStops, titleOf)).toBe('Go to the jetty before Attukad waterfalls')
  })

  it('keeps the check-in wording', () => {
    const change = { kind: 'move', stopId: 'boat', toIndex: 3 } as const
    expect(fixPlaceTitle(change, dayStops, titleOf)).toBe('Go to the jetty first, check in after')
  })

  it('never uses an engine position in a title', () => {
    for (let toIndex = 0; toIndex < 4; toIndex += 1) {
      const title = fixPlaceTitle({ kind: 'move', stopId: 'boat', toIndex }, dayStops, titleOf)
      expect(title).not.toMatch(/position|\bthe (lunch|Attukad|check)/i)
    }
  })
})

describe('A4: the Fix sub line says what changes for the traveller', () => {
  const clock = (min: number) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, '0')} ${min >= 720 ? 'PM' : 'AM'}`
  const commitmentMin = (id: string) => (id === 'boat' ? 15 * 60 + 30 : null)

  it('names the booking clock and the stop that follows', () => {
    const summary = fixSummary(setOf([{ kind: 'move', stopId: 'boat', toIndex: 1 }]), titleOf, clock, dayStops, commitmentMin)
    expect(summary.change).toBe('Boat at 3:30 PM, lunch after')
    expect(summary.result).toBe('Clears it · 14 min longer day')
    expect(summary.change).not.toMatch(/position/i)
  })

  it('leaves the clock out when the stop has no booking', () => {
    const summary = fixSummary(setOf([{ kind: 'move', stopId: 'farm', toIndex: 0 }]), titleOf, clock, dayStops, () => null)
    expect(summary.change).toBe('Spice farm walk first, Attukad waterfalls after')
  })

  it('names the old and new stay length for a shortened visit', () => {
    const summary = fixSummary(setOf([{ kind: 'set-visit', stopId: 'farm', visitMin: 25 }]), titleOf, clock, dayStops, () => null)
    expect(summary.title).toBe('Shorten Spice farm walk to 25 min')
    expect(summary.change).toBe('Stay 45 min → 25 min · keeps every stop')
  })

  it('names the day and the sailing clock for a moved booking', () => {
    const summary = fixSummary(setOf([{ kind: 'move-commitment', commitmentId: 'fc', stopId: 'boat', fromDayIndex: 2, toDayIndex: 3, time: '09:30' }]), titleOf, clock, dayStops, commitmentMin)
    expect(summary.title).toBe('Move the boat to Day 4, 9:30 AM sailing')
    expect(summary.change).toBe('Boat sails Day 4 at 9:30 AM')
  })
})

// ---------- B: rail and header ----------

describe('B6: the day header names the route town to town', () => {
  it('reads the night-halt town from the day title', () => {
    expect(dayEndTown({ dayTitle: 'Munnar to Thekkady', hotelPlace: 'Check in · Spice Village', hotelTitle: 'Check in · Spice Village' })).toBe('Thekkady')
    expect(dayEndTown({ dayTitle: 'Munnar → Thekkady', hotelPlace: null, hotelTitle: null })).toBe('Thekkady')
  })

  it('falls back to the stay stop town when the title names none', () => {
    expect(dayEndTown({ dayTitle: 'Day 3', hotelPlace: 'Thekkady', hotelTitle: 'Check in · Spice Village' })).toBe('Thekkady')
  })

  it('says nothing when the town is only the hotel name', () => {
    expect(dayEndTown({ dayTitle: 'Day 3', hotelPlace: 'Check in · Spice Village', hotelTitle: 'Check in · Spice Village' })).toBeNull()
  })
})

describe('B7: no leg line above the first visible row, and none between rows that are not neighbours', () => {
  it('hides the leg of the first row', () => {
    expect(railLegVisible([2, 3, 4], new Set(), 0)).toBe(false)
  })
  it('shows a leg between plan neighbours', () => {
    expect(railLegVisible([2, 3, 4], new Set(), 1)).toBe(true)
  })
  it('hides a leg when the clock order broke the neighbours', () => {
    expect(railLegVisible([1, 4, 3], new Set(), 1)).toBe(false)
    expect(railLegVisible([1, 4, 3], new Set(), 2)).toBe(false)
  })
  it('keeps the leg across a stop at the same place as the start', () => {
    // Plan: 0 start, 1 breakfast at the start town, 2 first visit. The rail lists 1, 0, 2.
    expect(railLegVisible([1, 0, 2], new Set([1]), 2)).toBe(true)
  })
})

describe('B8: the stay lens title says evening; the base row says tonight', () => {
  it('uses evening in the rail title', () => {
    expect(stayRailTitle('Thekkady', true)).toBe('Thekkady · evening')
  })
  it('uses tonight for the base row', () => {
    expect(stayRailTitle('Thekkady', false)).toBe('Thekkady · tonight')
  })
})

describe('B9: the leave row carries the clock you actually leave', () => {
  it('uses the end of the stop at the start place', () => {
    expect(railDepartClock('08:30', [{ distanceKm: 0, depart: '10:00' }, { distanceKm: 8, depart: '10:50' }])).toBe('10:00')
  })
  it('keeps the start clock when nothing waits at the start place', () => {
    expect(railDepartClock('10:00', [{ distanceKm: 8, depart: '10:50' }])).toBe('10:00')
  })
})

// ---------- A3: every clock in map text goes through timefmt ----------

describe('A3: clocks inside map text follow the 12 h / 24 h setting', () => {
  it('renders each stored clock in 12 h', () => {
    expect(formatClocksInText('arrive 14:30 · +5 min', '12h')).toBe('arrive 2:30 PM · +5 min')
  })
  it('keeps 24 h as a padded clock', () => {
    expect(formatClocksInText('arrive 9:05 · +5 min', '24h')).toBe('arrive 09:05 · +5 min')
  })
  it('leaves a clock that already has AM or PM, and text with no clock', () => {
    expect(formatClocksInText('boat at 3:30 PM, lunch after', '12h')).toBe('boat at 3:30 PM, lunch after')
    expect(formatClocksInText('15 km · 41 min', '12h')).toBe('15 km · 41 min')
  })
  it('keeps no raw HH:MM template in the map folders', () => {
    for (const file of ['src/pages/trip/MapTab.tsx']) {
      const source = read(file)
      expect(source).not.toMatch(/\$\{clockHM\(/)
      expect(source).not.toMatch(/Closes \{windowEnd\}.*clockHM/)
    }
  })
})

// ---------- C10-C13: pick card facts ----------

describe('C10: the slot-search provenance never shows as a pick chip', () => {
  it('drops the provenance reason and keeps a real one', () => {
    expect(pickFactChips({ reason: SLOT_SEARCH_PROVENANCE, hit: {}, format: '12h' })).toEqual([])
    expect(pickFactChips({ reason: 'breaks a 2 h ghat stretch', hit: {}, format: '12h' })).toEqual(['breaks a 2 h ghat stretch'])
  })

  it('keeps the filing contract that carries the provenance in the candidate', () => {
    const candidate = manualCandidateFor({ hit: { id: 1, name: 'x', latitude: 1, longitude: 1, kind: 'poi' }, detourMin: 5, detourKm: 2, budgetMin: 40, sharePct: () => 10 })
    expect(candidate.reason).toBe(SLOT_SEARCH_PROVENANCE)
  })
})

describe('C11: fact chips come only from data the hit carries', () => {
  it('shows hours, why and food type in board order', () => {
    const chips = pickFactChips({
      reason: null,
      hit: { closeTime: '15:30', facts: { why: 'first good stop after Attukad', diet: 'veg and non-veg' } },
      format: '12h',
    })
    expect(chips).toEqual(['first good stop after Attukad', 'open till 3:30 PM', 'veg and non-veg'])
  })

  it('reads the hours in the 24 h clock when set', () => {
    expect(pickFactChips({ reason: null, hit: { closeTime: '15:30' }, format: '24h' })).toEqual(['open till 15:30'])
  })

  it('shows nothing for a hit with no data, and never invents', () => {
    expect(pickFactChips({ reason: null, hit: {}, format: '12h' })).toEqual([])
    expect(pickFactChips({ reason: '  ', hit: { closeTime: 'later' }, format: '12h' })).toEqual([])
  })

  it('keeps one copy of a repeated fact', () => {
    expect(pickFactChips({ reason: 'quiet, 12 tables', hit: { facts: { why: 'quiet, 12 tables' } }, format: '12h' })).toEqual(['quiet, 12 tables'])
  })
})

describe('C12: the category line names the kind when the data has it', () => {
  it('prefers the place kind over the category', () => {
    expect(placeSubLine({ admin1: 'Kattappana', category: 'food', facts: { kind: 'Kerala meals' } })).toBe('Kattappana · Kerala meals')
  })
  it('falls back to the category', () => {
    expect(placeSubLine({ admin1: 'Kumily', category: 'shopping' })).toBe('Kumily · shopping')
  })
})

// ---------- B9: the free evening ends where an empty dinner window begins ----------

describe('B9: the free evening stops at the dinner window', () => {
  it('ends the evening at the dinner start, as the board draws 17:00–20:00', () => {
    const windows = stayWindows({ arriveAtBaseMin: 13 * 60 + 40, leaveBaseMin: null, eveningBook: { startMin: 15 * 60 + 30, visitMin: 90 }, dinnerStartMin: 20 * 60 })
    expect(windows).toEqual([{ id: 'evening', label: 'Free evening', startMin: 17 * 60, endMin: 20 * 60 }])
  })
  it('keeps the 21:00 end when no dinner window is empty', () => {
    const windows = stayWindows({ arriveAtBaseMin: 13 * 60 + 40, leaveBaseMin: null, eveningBook: { startMin: 15 * 60 + 30, visitMin: 90 } })
    expect(windows[0].endMin).toBe(21 * 60)
  })
  it('ignores a dinner start that is not after the evening start', () => {
    const windows = stayWindows({ arriveAtBaseMin: 20 * 60 + 15, leaveBaseMin: null, dinnerStartMin: 20 * 60 })
    expect(windows[0].endMin).toBe(21 * 60)
  })
})

describe('B9: a food stop at last night’s stay says so', () => {
  const stop = { category: 'food', lat: 10.0889, lng: 77.0596 }
  it('names the town and last night’s stay when the stop stands on the previous hotel', () => {
    expect(lastNightStaySub(stop, { lat: 10.0889, lng: 77.0596 }, 'Munnar')).toBe('Munnar · last night’s stay')
  })
  it('says nothing for a stop elsewhere, or with no previous hotel', () => {
    expect(lastNightStaySub(stop, { lat: 9.6, lng: 77.16 }, 'Munnar')).toBeNull()
    expect(lastNightStaySub(stop, null, 'Munnar')).toBeNull()
    expect(lastNightStaySub({ category: 'nature', lat: 10.0889, lng: 77.0596 }, { lat: 10.0889, lng: 77.0596 }, 'Munnar')).toBeNull()
  })
})

describe('D15-D17: the Drive map draws the plan marks and the detail card shows the place facts', () => {
  it('passes the pick words and the route marks from the Map tab to the map', () => {
    const tab = read('src/pages/trip/MapTab.tsx')
    expect(tab).toContain('pickBandTag(band, row.detourMin, scopeMinutes)')
    expect(tab).toContain('{ pickTags }')
    expect(tab).toContain('{ routeMarks }')
    expect(tab).toContain('clockTicks(anchors)')
  })
  it('draws ticks, the window label and the pick words from props only', () => {
    const map = read('src/components/TripMap.tsx')
    expect(map).toContain('mv2-route-tick')
    expect(map).toContain('mv2-route-window')
    expect(map).toContain('mv2-pick-tag')
  })
  it('keeps the slot-search provenance off the detail card and shows its place facts', () => {
    const card = read('src/components/map/MapPickCard.tsx')
    expect(card).toContain('reason !== SLOT_SEARCH_PROVENANCE')
    expect(card).toContain('hit.facts?.why')
  })
})
