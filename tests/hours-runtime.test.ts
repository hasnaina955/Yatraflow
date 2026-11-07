// Repair regressions for the #887 runtime-hours finding (direct review).
// The cases go through the consumers: the journey date list, the assignment
// scorer, the slot engine and the card display helper. No network, no DOM.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { assignSegmentHits, segmentsFromPlan, scoreHitForSegment, type RideSegment } from '../src/lib/ridePlan'
import { daySlots, type DaySlotsDeps } from '../src/lib/daySlots'
import { placeHoursFromPeriods, type RawHoursPeriod } from '../src/lib/providers/hours'
import { hoursDisplayFor, intendedVisitMinutes, isISODate, visitDateForDay, visitDatesForPlan } from '../src/lib/hoursContext'
import type { PlaceHit, SegmentHit } from '../src/lib/geocode'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const anchors = [{ lat: 10, lng: 76 }]

function hit(id: string, over: Partial<PlaceHit> = {}): PlaceHit {
  return { id, name: id, latitude: 10.01, longitude: 76, kind: 'poi', category: 'museum', alongRouteKm: 100, offRouteKm: 0, ...over }
}

function seg(over: Partial<RideSegment> = {}): RideSegment {
  return {
    index: 0, purpose: 'stretch', label: 'Stretch', targetKm: 100, minKm: 80, maxKm: 130,
    kmFromPrev: 100, minutesFromPrev: 120, hint: '', etaMinutes: 600, ...over,
  }
}

function period(day: number, open: string, close: string): RawHoursPeriod {
  const [oh, om] = open.split(':').map(Number)
  const [ch, cm] = close.split(':').map(Number)
  return { open: { day, hour: oh, minute: om }, close: { day, hour: ch, minute: cm } }
}

function weekly(days: number[], spans: Array<[string, string]>): RawHoursPeriod[] {
  return days.flatMap(d => spans.map(([a, b]) => period(d, a, b)))
}

const week = [0, 1, 2, 3, 4, 5, 6]
const hoursFor = (periods: RawHoursPeriod[]) => placeHoursFromPeriods(periods, undefined, '2026-11-01')

const mondayClosed = () => hoursFor(weekly([0, 2, 3, 4, 5, 6], [['09:00', '17:00']]))
const daily = (open: string, close: string) => hoursFor(weekly(week, [[open, close]]))
const splitTemple = () => hoursFor(weekly(week, [['05:00', '12:00'], ['16:00', '20:00']]))

describe('visit dates come from the trip calendar, never from today', () => {
  it('maps a day index onto the trip start date', () => {
    expect(visitDateForDay('2026-11-05', 0)).toBe('2026-11-05')
    expect(visitDateForDay('2026-11-05', 3)).toBe('2026-11-08')
    expect(visitDateForDay('2026-11-28', 5)).toBe('2026-12-03')
  })

  it('an unreadable start date or bad index stays unknown', () => {
    expect(visitDateForDay('', 0)).toBeNull()
    expect(visitDateForDay('not-a-date', 1)).toBeNull()
    expect(visitDateForDay('2026-02-31', 0)).toBeNull()
    expect(visitDateForDay('2026-11-05', -1)).toBeNull()
    expect(visitDateForDay('2026-11-05', 1.5)).toBeNull()
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('2026-11-05')).toBe(true)
  })

  it('one date per segment, and a day closes on its overnight segment', () => {
    const segments = segmentsFromPlan([
      { id: 's', km: 100, purpose: 'stretch' },
      { id: 'o', km: 400, purpose: 'overnight' },
      { id: 'm', km: 500, purpose: 'meal' },
    ], 600, 500)
    const dates = visitDatesForPlan(segments, '2026-11-05')
    const overnight = segments.findIndex(s => s.dayEnd)
    expect(overnight).toBeGreaterThan(-1)
    expect(dates[0]).toBe('2026-11-05')
    expect(dates[overnight]).toBe('2026-11-05')
    if (segments[overnight + 1]) expect(dates[segments[overnight + 1].index]).toBe('2026-11-06')
  })

  it('the geocode and Timeline consumers supply the dates', () => {
    expect(read('../src/lib/geocode.ts')).toMatch(/visitDates: visitDatesForPlan\(segments, opts\.tripStartDate\)/)
    expect(read('../src/pages/trip/timeline/TravelPanel.tsx')).toMatch(/visitDates: visitDatesForPlan\(segments, trip\.startDate\)/)
  })
})

describe('Monday closure reaches the assignment consumer', () => {
  it('a Monday-closed venue scores worse on Monday than on Sunday', () => {
    const venue = hit('closed-monday', { hours: mondayClosed() })
    const segments = [seg({ etaMinutes: 600 })]
    const sunday = assignSegmentHits([venue], segments, anchors, { visitDates: visitDatesForPlan(segments, '2026-11-08') })[0]
    const monday = assignSegmentHits([venue], segments, anchors, { visitDates: visitDatesForPlan(segments, '2026-11-09') })[0]
    expect(sunday.hit?.id).toBe('closed-monday')
    expect(monday.score - sunday.score).toBeCloseTo(6, 5) // a known weekday closure is the flat lock-out
  })
})

describe('the full visit must fit, with the intended duration', () => {
  it('a 90-minute museum visit at 16:30 overruns a 17:00 close', () => {
    const museum = hit('museum', { category: 'museum', hours: daily('09:00', '17:00') })
    const bare = hit('bare', { category: 'museum' })
    const segments = [seg({ etaMinutes: 16 * 60 + 30 })]
    const dated = assignSegmentHits([museum], segments, anchors, { visitDates: ['2026-11-08'] })[0]
    const plain = assignSegmentHits([bare], segments, anchors, { visitDates: ['2026-11-08'] })[0]
    expect(intendedVisitMinutes(museum)).toBe(90)
    expect(dated.score - plain.score).toBeCloseTo(9, 5) // 60 min past close -> round(60/15)*2+1
  })

  it('a 17:00 temple visit fits the second split interval', () => {
    const temple = hit('temple', { category: 'temple', hours: splitTemple() })
    const bare = hit('bare', { category: 'temple' })
    const segments = [seg({ etaMinutes: 17 * 60 })]
    const dated = assignSegmentHits([temple], segments, anchors, { visitDates: ['2026-11-08'] })[0]
    const plain = assignSegmentHits([bare], segments, anchors, { visitDates: ['2026-11-08'] })[0]
    expect(dated.score - plain.score).toBeCloseTo(0, 5)
  })
})

describe('missing date stays unknown, never closed and never free', () => {
  it('nonuniform hours without a date stay unknown', () => {
    const venue = hit('sunday-only', { hours: hoursFor(weekly([0], [['09:00', '17:00']])) })
    const segments = [seg({ etaMinutes: 600 })]
    const undated = assignSegmentHits([venue], segments, anchors, {})[0]
    const monday = assignSegmentHits([venue], segments, anchors, { visitDates: ['2026-11-09'] })[0]
    const bare = assignSegmentHits([hit('bare')], segments, anchors, {})[0]
    expect(undated.score).toBeCloseTo(bare.score, 5) // unknown is neutral, not a penalty
    expect(monday.score - undated.score).toBeCloseTo(6, 5) // known closure is distinct
  })

  it('the display names no span without a date when the week is not uniform', () => {
    const venue = { category: 'temple', hours: splitTemple() }
    const shown = hoursDisplayFor(venue, { date: null, arrivalMin: null })
    expect(shown.ranges).toBeNull()
    expect(shown.verdict).toBe('unknown')
  })
})

describe('the slot engine scores against the day date', () => {
  function deps(date: string | null): DaySlotsDeps {
    const closed = hit('closed', { category: 'food', hours: mondayClosed() })
    const open = hit('open', { category: 'food' })
    const base: SegmentHit = { segment: seg({ purpose: 'meal', etaMinutes: 12 * 60 + 15 }), hit: null, score: 0 }
    return {
      haltSegments: [base],
      dayStops: [],
      anchors,
      altPool: [closed, open],
      dayDateOf: () => date,
    }
  }

  it('the Monday-closed candidate costs more on Monday than on Sunday', () => {
    const monday = daySlots(0, deps('2026-11-09'))[0]
    const sunday = daySlots(0, deps('2026-11-08'))[0]
    const score = (slot: typeof monday) => slot.candidates.find(c => String(c.hit.id) === 'closed')?.score
    const m = score(monday)
    const s = score(sunday)
    expect(m).toBeDefined()
    expect(s).toBeDefined()
    expect((m as number) - (s as number)).toBeCloseTo(6, 5)
  })
})

describe('card display names the relevant interval, not the first legacy period', () => {
  it('a split temple shows both intervals for the visit date', () => {
    const shown = hoursDisplayFor({ category: 'temple', hours: splitTemple() }, { date: '2026-11-08', arrivalMin: 17 * 60, visitMin: 90 })
    expect(shown.ranges).toEqual([{ open: '05:00', close: '12:00' }, { open: '16:00', close: '20:00' }])
    expect(shown.verdict).toBe('open')
    expect(shown.note).toBeNull()
  })

  it('an overnight place shows the span that started the previous evening', () => {
    const fixed = hoursFor([{ open: { day: 6, hour: 22 }, close: { day: 0, hour: 2 } }])
    const shown = hoursDisplayFor({ category: 'rest', hours: fixed }, { date: '2026-11-08', arrivalMin: 30, visitMin: 60 })
    expect(shown.ranges).toEqual([{ open: '22:00', close: '02:00' }])
    expect(shown.verdict).toBe('open')
  })

  it('a Monday closure says so, and a visit overrun says so', () => {
    const monday = hoursDisplayFor({ category: 'museum', hours: mondayClosed() }, { date: '2026-11-09', arrivalMin: 600, visitMin: 90 })
    expect(monday.verdict).toBe('closed')
    expect(monday.note).toContain('closed')
    const overrun = hoursDisplayFor({ category: 'museum', hours: daily('09:00', '17:00') }, { date: '2026-11-08', arrivalMin: 16 * 60 + 30, visitMin: 90 })
    expect(overrun.verdict).toBe('closed')
    expect(overrun.note).toContain('closing')
  })

  it('structured hours never fall back to the legacy first period', () => {
    const shown = hoursDisplayFor({ category: 'temple', openTime: '05:00', closeTime: '12:00', hours: splitTemple() }, { date: '2026-11-08', arrivalMin: null })
    expect(shown.ranges).toEqual([{ open: '05:00', close: '12:00' }, { open: '16:00', close: '20:00' }])
  })
})

describe('a scorer call without a date is unchanged for legacy pairs', () => {
  it('legacy-only hits still score by their pair', () => {
    const legacy = hit('legacy', { openTime: '09:00', closeTime: '17:00', category: 'museum' })
    expect(scoreHitForSegment(legacy, seg({ etaMinutes: 18 * 60 }), anchors)).not.toBeNull()
    expect(scoreHitForSegment(legacy, seg({ etaMinutes: 18 * 60 }), anchors)!).toBeGreaterThan(
      scoreHitForSegment(hit('plain'), seg({ etaMinutes: 18 * 60 }), anchors)!,
    )
  })
})
