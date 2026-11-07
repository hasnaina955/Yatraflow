// Ticket 03 (#888): the presentation adapter preserves the engine's public
// picks, order, identity and facts. It starts no search, holds no write
// authority and invents no slot, key or candidate.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  driveRowsFromSegments,
  driveRowFromCandidate,
  mergeDriveRows,
  type DriveSuggestionFacts,
} from '../src/pages/trip/map/driveSuggestionView'
import type { PlaceHit, SegmentHit } from '../src/lib/geocode'
import type { DaySlot, SlotCandidate } from '../src/lib/daySlots'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

function hit(id: string, over: Partial<PlaceHit> = {}): PlaceHit {
  return { id, name: `Place ${id}`, latitude: 10, longitude: 76, kind: 'poi', category: 'food', cumKm: 100, ...over }
}

function segment(purpose: SegmentHit['segment']['purpose'], over: Partial<SegmentHit['segment']> = {}): SegmentHit['segment'] {
  return {
    index: 0, purpose, label: purpose, targetKm: 100, minKm: 80, maxKm: 130,
    kmFromPrev: 100, minutesFromPrev: 120, hint: '', ...over,
  }
}

function sh(purpose: SegmentHit['segment']['purpose'], h: PlaceHit | null, over: Partial<SegmentHit['segment']> = {}): SegmentHit {
  return { segment: segment(purpose, over), hit: h, score: 12 }
}

function facts(over: Partial<DriveSuggestionFacts> = {}): DriveSuggestionFacts {
  return {
    detourMinFor: () => 24,
    days: [],
    dayForKm: () => null,
    travelStyle: 'balanced',
    added: () => false,
    dismissed: () => false,
    heldBack: new Set<string>(),
    ...over,
  }
}

const candidate = (over: Partial<SlotCandidate> = {}): SlotCandidate => ({
  hit: hit('slot'),
  detourMin: 36,
  detourKm: 12,
  budgetSharePct: 80,
  posKm: 100,
  arriveMin: 753,
  arriveLabel: '12:33',
  inWindow: true,
  score: 12,
  reason: 'Breaks a 2 h drive · 12 km off-route',
  ...over,
})

function slot(over: Partial<DaySlot> = {}): DaySlot {
  return {
    key: 'lunch', kind: 'meal', label: 'Lunch', state: 'empty',
    windowMin: [690, 870], windowLabel: '11:30-14:30',
    segment: segment('meal', { etaMinutes: 735 }), filledStop: null, auto: false,
    drift: null, urgencyMin: 10, candidates: [], ...over,
  }
}

describe('drive rows preserve public picks, order and identity', () => {
  it('keeps the engine order and hands over the same hit object', () => {
    const a = hit('a')
    const b = hit('b')
    const rows = driveRowsFromSegments([sh('meal', a), sh('sight', b)], facts())
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
    expect(rows[0].hit).toBe(a)
    expect(rows[1].hit).toBe(b)
    expect(rows[0].lane).toBe('need')
    expect(rows[1].lane).toBe('sight')
    expect(rows[0].purpose).toBe('meal')
    expect(rows[0].detourMin).toBe(24)
  })

  it('keeps the stringified engine id, including numeric ids', () => {
    const rows = driveRowsFromSegments([sh('meal', hit('7'))], facts())
    expect(rows[0].id).toBe('7')
  })

  it('a gap stays a gap — no row is invented for a null hit', () => {
    expect(driveRowsFromSegments([sh('meal', null)], facts())).toEqual([])
  })

  it('keeps a retained pick visible even when its detour is unknown', () => {
    const rows = driveRowsFromSegments([sh('meal', hit('x'))], facts({ detourMinFor: () => null }))
    expect(rows).toHaveLength(1)
    expect(rows[0].detourMin).toBeNull()
  })
})

describe('state is read, never invented', () => {
  it('flags added, dismissed and held-back rows without dropping them', () => {
    const rows = driveRowsFromSegments(
      [sh('meal', hit('a')), sh('meal', hit('b')), sh('meal', hit('c'))],
      facts({
        added: h => h.id === 'a',
        dismissed: h => h.id === 'b',
        heldBack: new Set(['c']),
      }),
    )
    expect(rows.map(r => r.state)).toEqual(['added', 'dismissed', 'held-back'])
    expect(rows).toHaveLength(3)
  })
})

describe('slot rows carry the engine numbers unchanged', () => {
  it('passes detour, arrival, window and reason through without recomputation', () => {
    const c = candidate()
    const row = driveRowFromCandidate(c, slot(), 0, facts({ detourMinFor: () => 999 }))
    expect(row.hit).toBe(c.hit)
    expect(row.detourMin).toBe(36)
    expect(row.arriveLabel).toBe('12:33')
    expect(row.inWindow).toBe(true)
    expect(row.reason).toBe(c.reason)
    expect(row.dayIndex).toBe(0)
    expect(row.segmentIndex).toBe(0)
  })

  it('a stay slot still classifies as a need when the engine segment is absent', () => {
    const c = candidate({ hit: hit('stay') })
    const row = driveRowFromCandidate(c, slot({ key: 'stay', kind: 'overnight', segment: null, candidates: [c] }), 1, facts())
    expect(row.lane).toBe('need')
    expect(row.purpose).toBe('overnight')
    expect(row.chips).toEqual([])
  })
})

describe('merge keeps both rails in order', () => {
  it('slot rows win on identity, and neither input array changes', () => {
    const segmentRows = driveRowsFromSegments([sh('meal', hit('a')), sh('meal', hit('b'))], facts())
    const slotRow = driveRowFromCandidate(candidate({ hit: hit('b') }), slot(), 0, facts())
    const merged = mergeDriveRows(segmentRows, [slotRow])
    expect(merged.map(r => r.id)).toEqual(['a', 'b'])
    expect(merged[1].arriveLabel).toBe('12:33')
    expect(segmentRows[1].arriveLabel).toBeNull()
    expect(segmentRows).toHaveLength(2)
  })
})

describe('the adapter holds no write, search or provider authority', () => {
  const source = read('../src/pages/trip/map/driveSuggestionView.ts')
  it('imports no writer, store, hook, provider or search path', () => {
    for (const forbidden of [
      'applyChange', 'addPoiToDay', 'searchNearby', 'searchPlaces', 'fetch(',
      "from '../../../store", 'useState', 'useEffect', 'useMemo', 'suggestionCache',
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })
  it('does not rank or re-order candidates', () => {
    expect(source).not.toMatch(/\.sort\(|\.reverse\(|\.filter\(/)
  })
})
