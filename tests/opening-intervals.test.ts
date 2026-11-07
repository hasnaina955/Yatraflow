// Ticket 02 (#887): weekday-attributed opening intervals and verdicts.
// Pure fixtures — no network, no DOM. Covers the six acceptance criteria:
// split hours, weekly-pattern closures, overnight across midnight, full-visit
// fit, known-closed vs unknown, and fetch-timestamp freshness.
import { describe, it, expect } from 'vitest'
import {
  placeHoursFromPeriods,
  openingVerdict,
  weekdayOfISO,
  type RawHoursPeriod,
} from '../src/lib/providers/hours'
import { hoursFitAdj, scoreHitForSegment } from '../src/lib/ridePlan'

// 2026-01-03 = Saturday, 2026-01-04 = Sunday, 2026-01-05 = Monday (asserted below).
const SAT = '2026-01-03'
const SUN = '2026-01-04'
const MON = '2026-01-05'

/** 'HH:MM' → minutes since midnight. */
const hm = (s: string): number => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

/** One Google-style period: open day+time, close day+time (closeDay null = open-ended). */
function period(openDay: number, open: string, closeDay: number | null, close: string): RawHoursPeriod {
  const [oh, om] = open.split(':').map(Number)
  return {
    open: { day: openDay, hour: oh, minute: om },
    ...(closeDay == null ? {} : { close: (() => { const [ch, cm] = close.split(':').map(Number); return { day: closeDay, hour: ch, minute: cm } })() }),
  }
}

/** Weekly pattern: the same [start, end] pairs on every listed weekday. */
function dailyPattern(days: number[], spans: [string, string][]): RawHoursPeriod[] {
  return days.flatMap(d => spans.map(([a, b]) => period(d, a, d, b)))
}

describe('weekday sanity of the fixtures', () => {
  it('pins the fixture weekdays (0 = Sunday)', () => {
    expect(weekdayOfISO(SAT)).toBe(6)
    expect(weekdayOfISO(SUN)).toBe(0)
    expect(weekdayOfISO(MON)).toBe(1)
  })
})

describe('parsing provider periods into intervals', () => {
  it('keeps split temple hours as two intervals per day', () => {
    const hours = placeHoursFromPeriods(
      dailyPattern([0, 1, 2, 3, 4, 5, 6], [['05:00', '12:00'], ['16:00', '20:00']]),
      undefined,
      '2026-01-05',
    )
    expect(hours?.basis).toBe('pattern')
    expect(hours?.pattern).toHaveLength(14)
  })

  // RECHECK P1: hour 0 is a valid 00:00 time — `!hour` guards rejected it and
  // both period shapes disappeared (24h open-at-midnight; 20:00→next-day 00:00).
  it('recheck — an open 00:00 with no close parses as an open-ended period (hour 0 is valid)', () => {
    const hours = placeHoursFromPeriods(
      [{ open: { day: 1, hour: 0, minute: 0 } }], // 24/7 shape: opens midnight, no close stated
      undefined,
      '2026-01-05',
    )
    expect(hours?.basis).toBe('pattern')
    expect(hours?.pattern).toEqual([{ startDay: 1, startMin: 0, endMin: null }])
    expect(hours?.uncertainDays).toBeUndefined() // a VALID period, not an uncertain one
    expect(openingVerdict(hours, MON, hm('03:00'), 30)).toMatchObject({ state: 'open' })
  })

  it('recheck — a 20:00 to next-day 00:00 span parses (close hour 0 is valid)', () => {
    // Sat 20:00 → Sun 00:00: endMin = 1440 (Sunday midnight), anchored on Saturday
    const hours = placeHoursFromPeriods(
      [{ open: { day: 6, hour: 20, minute: 0 }, close: { day: 0, hour: 0, minute: 0 } }],
      undefined,
      '2026-01-05',
    )
    expect(hours?.pattern).toEqual([{ startDay: 6, startMin: 1200, endMin: 1440 }])
    expect(hours?.uncertainDays).toBeUndefined()
    // a 23:30 Saturday visit fits; a 00:30 Sunday arrival is past the span's close
    expect(openingVerdict(hours, SAT, hm('23:30'), 20)).toMatchObject({ state: 'open' })
    expect(openingVerdict(hours, SUN, hm('00:30'), 0).state).toBe('closed')
  })

  it('a genuinely absent hour (not zero) still fails as malformed', () => {
    // close.hour undefined (absent) is malformed; close.hour 0 (midnight) is valid
    const hours = placeHoursFromPeriods(
      [{ open: { day: 1, hour: 0, minute: 0 }, close: { day: 1, hour: undefined as never, minute: 0 } }],
      undefined,
      '2026-01-05',
    )
    // nothing survives the malformed close, so there is no confirmed pattern
    // at all — honest unknown rather than a fabricated interval
    expect(hours).toBeUndefined()
  })

  it('reads an overnight interval across midnight with the right anchor day', () => {
    const hours = placeHoursFromPeriods([period(6, '22:00', 0, '02:00')], undefined, '2026-01-05')
    expect(hours?.pattern).toEqual([{ startDay: 6, startMin: hm('22:00'), endMin: hm('02:00') + 1440 }])
  })

  it('drops periods without a weekday and never invents one', () => {
    const undayable: RawHoursPeriod[] = [{ open: { hour: 9, minute: 0 }, close: { hour: 17, minute: 0 } }]
    expect(placeHoursFromPeriods(undayable, undefined, '2026-01-05')).toBeUndefined()
    // partially attributable: only the attributed period survives
    const mixed = [...undayable, period(1, '09:00', 1, '17:00')]
    const hours = placeHoursFromPeriods(mixed, undefined, '2026-01-05')
    expect(hours?.pattern).toHaveLength(1)
  })

  it('collects the observed window dates from currentOpeningHours', () => {
    const dated: RawHoursPeriod[] = [
      { open: { day: 0, hour: 9, minute: 0, date: { year: 2026, month: 1, day: 4 } }, close: { day: 0, hour: 17, minute: 0 } },
      { open: { day: 2, hour: 9, minute: 0, date: { year: 2026, month: 1, day: 6 } }, close: { day: 2, hour: 17, minute: 0 } },
    ]
    const hours = placeHoursFromPeriods(undefined, dated, '2026-01-05')
    expect(hours?.basis).toBe('observed')
    expect(hours?.observed?.dates).toEqual(['2026-01-04', '2026-01-06'])
  })
})

describe('AC1 — split temple hours fit the second interval', () => {
  const hours = placeHoursFromPeriods(
    dailyPattern([0, 1, 2, 3, 4, 5, 6], [['05:00', '12:00'], ['16:00', '20:00']]),
    undefined,
    '2026-01-05',
  )!

  it('a 17:00 visit inside 16:00–20:00 is open', () => {
    expect(openingVerdict(hours, SUN, hm('17:00'), 30)).toMatchObject({ state: 'open' })
  })

  it('a 14:00 arrival between the intervals is closed with a measurable gap', () => {
    const v = openingVerdict(hours, SUN, hm('14:00'), 0)
    expect(v.state).toBe('closed')
    expect(v.missMin).toBe(120) // next opening edge at 16:00
  })
})

describe('AC2 — a museum closed on Mondays is known closed on a Monday visit', () => {
  // every weekday except Monday, 09:00–17:00
  const hours = placeHoursFromPeriods(dailyPattern([0, 2, 3, 4, 5, 6], [['09:00', '17:00']]), undefined, '2026-01-05')!

  it('closed (weekly pattern) on Monday', () => {
    const v = openingVerdict(hours, MON, hm('10:00'), 30)
    expect(v.state).toBe('closed')
    expect(v.reason).toMatch(/weekly pattern/)
    expect(v.missMin).toBeUndefined() // no edge applies to an all-day closure
  })

  it('open on a Sunday at the same clock', () => {
    expect(openingVerdict(hours, SUN, hm('10:00'), 30)).toMatchObject({ state: 'open' })
  })
})

describe('AC3 — overnight intervals cover the correct local weekdays across midnight', () => {
  // Saturday 22:00 → Sunday 02:00, plus Sunday 22:00 → Monday 02:00
  const hours = placeHoursFromPeriods(
    [period(6, '22:00', 0, '02:00'), period(0, '22:00', 1, '02:00')],
    undefined,
    '2026-01-05',
  )!

  it('Sunday 00:30 belongs to the Saturday-night span', () => {
    expect(openingVerdict(hours, SUN, hm('00:30'), 30)).toMatchObject({ state: 'open' })
  })

  it('Saturday 21:00 is before the span opens', () => {
    const v = openingVerdict(hours, SAT, hm('21:00'), 30)
    expect(v.state).toBe('closed')
    expect(v.missMin).toBe(60)
  })

  it('Sunday 03:00 is after the Saturday-night span closes', () => {
    const v = openingVerdict(hours, SUN, hm('03:00'), 0)
    expect(v.state).toBe('closed')
    expect(v.reason).toMatch(/after closing|weekly pattern/)
  })

  it('Monday 00:30 belongs to the Sunday-night span, not the Saturday one', () => {
    expect(openingVerdict(hours, MON, hm('00:30'), 30)).toMatchObject({ state: 'open' })
  })
})

describe('AC4 — the full visit must fit, not just the arrival', () => {
  const hours = placeHoursFromPeriods(dailyPattern([0, 1, 2, 3, 4, 5, 6], [['09:00', '12:00']]), undefined, '2026-01-05')!

  it('an 11:45 arrival with a 30-minute visit does not fit', () => {
    const v = openingVerdict(hours, SUN, hm('11:45'), 30)
    expect(v.state).toBe('closed')
    expect(v.reason).toMatch(/ends after closing/)
    expect(v.missMin).toBe(15)
  })

  it('the same arrival with a 15-minute visit ends exactly at close and fits', () => {
    expect(openingVerdict(hours, SUN, hm('11:45'), 15)).toMatchObject({ state: 'open' })
  })
})

describe('AC5 — missing hours and known closures stay distinct', () => {
  it('no hours at all → unknown, never closed', () => {
    expect(openingVerdict(undefined, SUN, hm('10:00'), 30)).toMatchObject({ state: 'unknown' })
  })

  it('hours that cannot be attributed to a weekday → unknown, not fabricated intervals', () => {
    const undayable: RawHoursPeriod[] = [{ open: { hour: 9, minute: 0 }, close: { hour: 17, minute: 0 } }]
    const hours = placeHoursFromPeriods(undayable, undefined, '2026-01-05')
    expect(openingVerdict(hours, SUN, hm('10:00'), 30)).toMatchObject({ state: 'unknown' })
  })

  // Repair R2 (progress review P2): probe.json malformedTuesday — a valid
  // Monday plus a malformed Tuesday must NOT imply a confirmed Tuesday closure.
  it('R2 — a valid Monday plus a malformed Tuesday leaves Tuesday unknown while Monday still works', () => {
    const partial: RawHoursPeriod[] = [
      period(1, '09:00', 1, '17:00'), // Monday valid
      { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 99, minute: 0 } }, // malformed Tuesday close hour
    ]
    const hours = placeHoursFromPeriods(partial, undefined, '2026-01-05')!
    expect(hours.uncertainDays).toEqual([2])
    expect(hours.pattern).toHaveLength(1) // Monday's interval survives
    const tuesday = openingVerdict(hours, '2026-01-06', hm('01:00'), 30)
    expect(tuesday.state).toBe('unknown')
    expect(tuesday.reason).toMatch(/incomplete|malformed/)
    const monday = openingVerdict(hours, MON, hm('10:00'), 30)
    expect(monday.state).toBe('open') // genuine intervals untouched
  })

  it('R2 — a genuine complete-pattern closure still works next to a locally uncertain weekday', () => {
    // museum flavor: Monday ABSENT (genuine closure signal), Tuesday malformed, other days valid
    const museum: RawHoursPeriod[] = [
      period(3, '09:00', 3, '17:00'), // Wednesday
      period(4, '09:00', 4, '17:00'), // Thursday
      period(5, '09:00', 5, '17:00'), // Friday
      period(6, '09:00', 6, '17:00'), // Saturday
      period(0, '09:00', 0, '17:00'), // Sunday
      { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 98, minute: 3 } }, // Tuesday malformed
    ]
    const hours = placeHoursFromPeriods(museum, undefined, '2026-01-05')!
    expect(hours.uncertainDays).toEqual([2])
    // Wednesday: complete data for its own weekday → interval verdicts still resolve
    const wednesday = openingVerdict(hours, '2026-01-07', hm('10:00'), 30)
    expect(wednesday.state).toBe('open')
    // Monday: ABSENT weekday — the provider sent no Monday period, which is a
    // genuine closure signal; the malformed Tuesday does not erase it (the
    // damage is localized to Tuesday, where the closure stays unknown).
    const monday = openingVerdict(hours, MON, hm('10:00'), 30)
    expect(monday.state).toBe('closed')
    expect(monday.reason).toMatch(/weekly pattern/)
    const tuesday = openingVerdict(hours, '2026-01-06', hm('01:00'), 30)
    expect(tuesday.state).toBe('unknown') // its own data was malformed
  })

  it('R2 — the all-weekday museum fixture (no malformed periods anywhere) keeps its Monday closure', () => {
    const hours = placeHoursFromPeriods(dailyPattern([0, 2, 3, 4, 5, 6], [['09:00', '17:00']]), undefined, '2026-01-05')!
    expect(hours.uncertainDays).toBeUndefined()
    const monday = openingVerdict(hours, MON, hm('10:00'), 30)
    expect(monday.state).toBe('closed')
    expect(monday.reason).toMatch(/weekly pattern/)
  })

  it('a dated verdict needs the visit weekday; without it only uniform daily hours answer', () => {
    const templeSplit = placeHoursFromPeriods(
      dailyPattern([0, 1, 2, 3, 4, 5, 6], [['05:00', '12:00'], ['16:00', '20:00']]),
      undefined,
      '2026-01-05',
    )!
    expect(openingVerdict(templeSplit, null, hm('17:00'), 30)).toMatchObject({ state: 'unknown' })

    const uniform = placeHoursFromPeriods(dailyPattern([0, 1, 2, 3, 4, 5, 6], [['09:00', '17:00']]), undefined, '2026-01-05')!
    expect(openingVerdict(uniform, null, hm('17:00'), 0)).toMatchObject({ state: 'open' })
    expect(openingVerdict(uniform, null, hm('18:00'), 0)).toMatchObject({ state: 'closed' })
  })
})

describe('AC6 — a fetch timestamp is freshness, not proof of a future state', () => {
  // observed window 2026-01-04 → 2026-01-06 only; no weekly pattern supplied
  const observedOnly: RawHoursPeriod[] = [
    { open: { day: 0, hour: 9, minute: 0, date: { year: 2026, month: 1, day: 4 } }, close: { day: 0, hour: 17, minute: 0 } },
    { open: { day: 2, hour: 9, minute: 0, date: { year: 2026, month: 1, day: 6 } }, close: { day: 2, hour: 17, minute: 0 } },
  ]
  const hours = placeHoursFromPeriods(undefined, observedOnly, '2026-01-05')!

  it('a visit outside the observed window stays unknown (no fabricated pattern)', () => {
    const v = openingVerdict(hours, '2026-06-01', hm('10:00'), 30)
    expect(v.state).toBe('unknown')
  })

  it('undated observations answer nothing about a far-future date either', () => {
    const undated = placeHoursFromPeriods(
      undefined,
      [period(0, '09:00', 0, '17:00')],
      '2026-01-05',
    )!
    expect(undated.observed?.dates).toBeUndefined()
    const v = openingVerdict(undated, '2026-06-01', hm('10:00'), 30)
    expect(v.state).toBe('unknown')
  })

  it('a date inside the window with no observed period is a known closure (holiday Monday)', () => {
    // the pattern would have said open — the dated observation wins
    const withPattern = placeHoursFromPeriods(
      dailyPattern([0, 1, 2, 3, 4, 5, 6], [['09:00', '17:00']]),
      observedOnly,
      '2026-01-05',
    )!
    const v = openingVerdict(withPattern, MON, hm('10:00'), 30)
    expect(v.state).toBe('closed')
    expect(v.reason).toMatch(/observed/)
  })
})

describe('hoursFitAdj consumer seam', () => {
  const templeSplit = placeHoursFromPeriods(
    dailyPattern([0, 1, 2, 3, 4, 5, 6], [['05:00', '12:00'], ['16:00', '20:00']]),
    undefined,
    '2026-01-05',
  )!

  it('structured hours fix the split-temple penalty the legacy pair gets wrong', () => {
    // legacy first-period collapse (05:00–12:00): a 17:00 arrival is heavily penalized
    expect(hoursFitAdj({ openTime: '05:00', closeTime: '12:00' }, hm('17:00'))).toBeGreaterThan(0)
    // structured intervals + visit date: the 17:00 visit fits 16:00–20:00
    expect(hoursFitAdj({ openTime: '05:00', closeTime: '12:00', hours: templeSplit }, hm('17:00'), { date: SUN })).toBe(0)
  })

  it('a known all-day closure is the flat lock-out; an overrun keeps the legacy scaling', () => {
    const museum = placeHoursFromPeriods(dailyPattern([0, 2, 3, 4, 5, 6], [['09:00', '17:00']]), undefined, '2026-01-05')!
    expect(hoursFitAdj({ hours: museum }, hm('10:00'), { date: MON })).toBe(6)
    const morning = placeHoursFromPeriods(dailyPattern([0, 1, 2, 3, 4, 5, 6], [['09:00', '12:00']]), undefined, '2026-01-05')!
    // visit 11:45 + 30 ends 15 past close → round(15/15)*2 + 1 = 3
    expect(hoursFitAdj({ hours: morning }, hm('11:45'), { date: SUN, visitMin: 30 })).toBe(3)
  })

  it('unknown verdicts stay neutral — no invented penalty', () => {
    expect(hoursFitAdj({ hours: templeSplit }, hm('17:00'), { date: null })).toBe(0)
    expect(hoursFitAdj({ hours: templeSplit }, hm('17:00'))).toBe(0)
  })

  it('legacy hits without structured hours score exactly as before', () => {
    expect(hoursFitAdj({ openTime: '09:00', closeTime: '17:00' }, 13 * 60)).toBe(0)
    expect(hoursFitAdj({ openTime: '20:00', closeTime: '02:00' }, 23 * 60)).toBe(0)
    expect(hoursFitAdj({ openTime: '20:00', closeTime: '02:00' }, 13 * 60)).toBe(6)
  })
})

describe('scoreHitForSegment journey seam with visitDates', () => {
  const templeSplit = placeHoursFromPeriods(
    dailyPattern([0, 1, 2, 3, 4, 5, 6], [['05:00', '12:00'], ['16:00', '20:00']]),
    undefined,
    '2026-01-05',
  )!
  const museum = placeHoursFromPeriods(dailyPattern([0, 2, 3, 4, 5, 6], [['09:00', '17:00']]), undefined, '2026-01-05')!

  const hit = {
    id: 'h1',
    name: 'Test Temple',
    latitude: 10.0,
    longitude: 76.0,
    kind: 'poi' as const,
    category: 'sightseeing',
    openTime: '05:00',
    closeTime: '12:00',
  }
  const seg = {
    index: 0,
    purpose: 'stretch' as const,
    label: 'Short break',
    targetKm: 0,
    minKm: 0,
    maxKm: 10,
    kmFromPrev: 0,
    minutesFromPrev: 0,
    etaMinutes: hm('17:00'),
  }
  const anchors = [{ lat: 10.0, lng: 76.0 }]

  it('a 17:00 stretch at the split temple scores better with structured hours than the legacy collapse', () => {
    const legacy = scoreHitForSegment({ ...hit }, seg, anchors, {})
    const structured = scoreHitForSegment({ ...hit, hours: templeSplit }, seg, anchors, { visitDates: [SUN] })
    expect(legacy).not.toBeNull()
    expect(structured).not.toBeNull()
    expect(structured!).toBeLessThan(legacy!)
  })

  it('a Monday visit to the Monday-closed museum is degraded when the date is supplied', () => {
    const sundayScore = scoreHitForSegment({ ...hit, hours: museum }, seg, anchors, { visitDates: [SUN] })
    const mondayScore = scoreHitForSegment({ ...hit, hours: museum }, { ...seg, etaMinutes: hm('10:00') }, anchors, { visitDates: [MON] })
    expect(sundayScore).not.toBeNull()
    expect(mondayScore).not.toBeNull()
    expect(mondayScore!).toBeGreaterThan(sundayScore!)
  })
})
