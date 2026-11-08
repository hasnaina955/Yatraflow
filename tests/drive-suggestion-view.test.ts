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
import type { ItineraryDay, ItineraryStop } from '../src/data/types'

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

/** A day with `planned` confirmed stops, for the detour-budget share. */
function dayWithStops(planned: number): ItineraryDay {
  const stops: ItineraryStop[] = []
  for (let index = 0; index < planned; index += 1) {
    stops.push({
      id: `s-${index}`,
      title: `Stop ${index}`,
      category: 'food',
      locationName: `Stop ${index}`,
      lat: 10,
      lng: 76,
      visitMinutes: 30,
      entryFeeInrPerPerson: 0,
      transportCostInrTotal: 0,
      priority: 'nice-to-have',
      status: 'confirmed',
      orderInDay: index,
    })
  }
  return { id: 'day-0', index: 0, stops }
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
    drift: null, urgencyMin: 10, ref: null, reason: null, candidates: [], ...over,
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

describe('the corridor cost is derived once on the row', () => {
  it('puts the canonical outward-leg arrival on the row, and spends the full return detour', () => {
    const rows = driveRowsFromSegments(
      [sh('meal', hit('a'), { etaMinutes: 600 })],
      facts({ detourMinFor: () => 30, dayForKm: () => 0, days: [dayWithStops(2)] }),
    )
    // The 30-minute detour is return-valued: the arrival adds the outward 15
    // minutes (600 + 15 = 615 = 10:15), while the budget still spends all 30.
    expect(rows[0].arriveMin).toBe(615)
    expect(rows[0].arriveLabel).toBe('10:15')
    expect(rows[0].budgetSharePct).toBe(67)
  })

  it('uses a directed measured leg only inside its complete matching context', () => {
    const measured = hit('measured', {
      cumKm: 100,
      measuredRoadFact: {
        hitId: 'measured', originKey: 'origin-a', routeFingerprint: 'route-a',
        generation: 1, departAtMin: 600, detourMin: 30, arriveMin: 8,
      },
    })
    const segment = sh('meal', measured, { etaMinutes: 600 })
    const matching = facts({
      detourMinFor: () => 30,
      dayForKm: () => 0,
      days: [dayWithStops(2)],
      measuredContext: { route: { generation: 1, routeFingerprint: 'route-a' }, originKey: 'origin-a' },
    })
    const directed = driveRowsFromSegments([segment], matching)
    // The directed 8-minute leg, not the 30-minute return total and not half of it.
    expect(directed[0].arriveMin).toBe(608)
    expect(directed[0].budgetSharePct).toBe(67)

    const wrongRoute = driveRowsFromSegments([segment], facts({
      detourMinFor: () => 30,
      dayForKm: () => 0,
      days: [dayWithStops(2)],
      measuredContext: { route: { generation: 2, routeFingerprint: 'route-a' }, originKey: 'origin-a' },
    }))
    expect(wrongRoute[0].arriveMin).toBeNull()
    expect(wrongRoute[0].arriveLabel).toBeNull()
  })

  it('leaves an unmeasured ETA, day, detour or budget null instead of inventing one', () => {
    const noEta = driveRowsFromSegments(
      [sh('meal', hit('a'))],
      facts({ detourMinFor: () => 30, dayForKm: () => 0, days: [dayWithStops(2)] }),
    )
    expect(noEta[0].arriveMin).toBeNull()
    expect(noEta[0].arriveLabel).toBeNull()

    const noDay = driveRowsFromSegments(
      [sh('meal', hit('a'), { etaMinutes: 600 })],
      facts({ detourMinFor: () => 30, dayForKm: () => null }),
    )
    expect(noDay[0].arriveMin).toBe(615)
    expect(noDay[0].budgetSharePct).toBeNull()

    const noDetour = driveRowsFromSegments(
      [sh('meal', hit('a'), { etaMinutes: 600 })],
      facts({ detourMinFor: () => null, dayForKm: () => 0, days: [dayWithStops(2)] }),
    )
    expect(noDetour[0].arriveMin).toBeNull()
    expect(noDetour[0].budgetSharePct).toBeNull()

    const broken = driveRowsFromSegments(
      [sh('meal', hit('a'), { etaMinutes: 600 })],
      facts({ detourMinFor: () => Number.POSITIVE_INFINITY, dayForKm: () => 0, days: [dayWithStops(2)] }),
    )
    expect(broken[0].arriveMin).toBeNull()
    expect(broken[0].budgetSharePct).toBeNull()
  })

  it('fails closed on measured evidence with no context, never half of the measured total', () => {
    const measured = hit('measured', {
      cumKm: 100,
      measuredRoadFact: {
        hitId: 'measured', originKey: 'origin-a', routeFingerprint: 'route-a',
        generation: 1, departAtMin: 600, detourMin: 30, arriveMin: 8,
      },
    })
    const rows = driveRowsFromSegments(
      [sh('meal', measured, { etaMinutes: 600 })],
      facts({ detourMinFor: () => 30, dayForKm: () => 0, days: [dayWithStops(2)] }),
    )
    expect(rows[0].arriveMin).toBeNull()
    expect(rows[0].arriveLabel).toBeNull()
    // The budget still charges the return drive the evidence measured.
    expect(rows[0].budgetSharePct).toBe(67)
  })

  it('does not call a fraction of a detour a budget spend', () => {
    const rows = driveRowsFromSegments(
      [sh('meal', hit('a'), { etaMinutes: 600 })],
      facts({ detourMinFor: () => 0.5, dayForKm: () => 0, days: [dayWithStops(2)] }),
    )
    // 600 + 0.25 rounds to 600; a 0.5-minute return detour is not a budget spend.
    expect(rows[0].arriveMin).toBe(600)
    expect(rows[0].budgetSharePct).toBeNull()
  })
})

describe('the row chips read the same computed cost', () => {
  it('prints the real day’s share, and no budget claim for an unknown day', () => {
    const segment = sh('meal', hit('a'), { etaMinutes: 600 })
    const known = driveRowsFromSegments(
      [segment],
      facts({ detourMinFor: () => 24, dayForKm: () => 0, days: [dayWithStops(2)] }),
    )
    // 24 of the balanced 45-minute budget is 53%, the same number the row carries.
    expect(known[0].chips.find(c => c.key === 'budget-share')?.label).toBe('53% of budget')

    const unknown = driveRowsFromSegments(
      [segment],
      facts({ detourMinFor: () => 24, dayForKm: () => null }),
    )
    expect(unknown[0].chips.some(c => c.key === 'budget-share')).toBe(false)
    expect(unknown[0].chips.some(c => c.key === 'over-budget')).toBe(false)
  })

  it('keeps the candidate canonical share instead of recalculating it', () => {
    const c = candidate({ detourMin: 24, budgetSharePct: 90 })
    const row = driveRowFromCandidate(c, slot(), 0, facts({
      days: [dayWithStops(2)],
      dayForKm: () => 0,
    }))
    // A local recalc would read 53% (24 of 45); the engine's own share wins.
    expect(row.chips.find(chip => chip.key === 'budget-share')?.label).toBe('90% of budget')
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
    expect(row.arriveMin).toBe(753)
    expect(row.arriveLabel).toBe('12:33')
    expect(row.budgetSharePct).toBe(80)
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
