// ============ My trips page — pure logic ============
import { describe, expect, it } from 'vitest'
import { countdownText, nextStep, pickUpNext, planning, rangeText, regionFor, statusOf, whenBucket } from '../src/lib/tripsPage'
import type { ItineraryDay, StopStatus } from '../src/data/types'

// Local noon on 2026-10-10: far from any day boundary.
const TODAY = new Date(2026, 9, 10, 12, 0, 0)

type StopSpec = [title: string, status: StopStatus]
function day(...stops: StopSpec[]): ItineraryDay {
  return {
    id: `d${Math.random()}`,
    index: 0,
    stops: stops.map(([title, status]) => ({ title, status })),
  } as unknown as ItineraryDay
}
const emptyDays = (n: number) => Array.from({ length: n }, () => day())

function trip(startDate: string, endDate: string, days: ItineraryDay[] = emptyDays(3), updatedAt = 0) {
  return { startDate, endDate, days, updatedAt, destinations: [] as string[] }
}

describe('whenBucket (behaviour kept from TripsList)', () => {
  it('calls a trip past only after its end day', () => {
    expect(whenBucket(trip('2026-10-05', '2026-10-09'), TODAY)).toBe('past')
    expect(whenBucket(trip('2026-10-05', '2026-10-10'), TODAY)).toBe('upcoming')
    expect(whenBucket(trip('2026-10-08', '2026-10-12'), TODAY)).toBe('upcoming')
  })
  it('treats invalid or empty dates as draft', () => {
    expect(whenBucket(trip('', ''), TODAY)).toBe('draft')
    expect(whenBucket(trip('2026-10-05', 'soon'), TODAY)).toBe('draft')
  })
  it('lets the end date decide, even when the end is before the start', () => {
    expect(whenBucket(trip('2026-11-05', '2026-10-01'), TODAY)).toBe('past')
  })
})

describe('statusOf', () => {
  it('is live on the first day', () => {
    expect(statusOf(trip('2026-10-10', '2026-10-13'), TODAY)).toBe('live')
  })
  it('is live on the last day, even late in the day', () => {
    const lateEvening = new Date(2026, 9, 13, 23, 59, 59)
    expect(statusOf(trip('2026-10-10', '2026-10-13'), lateEvening)).toBe('live')
  })
  it('is live for a one-day trip today', () => {
    expect(statusOf(trip('2026-10-10', '2026-10-10'), TODAY)).toBe('live')
  })
  it('is upcoming when the start is after today', () => {
    expect(statusOf(trip('2026-10-11', '2026-10-13'), TODAY)).toBe('upcoming')
  })
  it('is past the day after the end', () => {
    expect(statusOf(trip('2026-10-05', '2026-10-09'), TODAY)).toBe('past')
    expect(statusOf(trip('2026-10-05', '2026-10-09'), new Date(2026, 9, 9, 0, 0, 1))).toBe('live')
  })
  it('is draft for empty, malformed or impossible dates', () => {
    expect(statusOf(trip('', ''), TODAY)).toBe('draft')
    expect(statusOf(trip('2026-10-10', ''), TODAY)).toBe('draft')
    expect(statusOf(trip('10/10/2026', '2026-10-12'), TODAY)).toBe('draft')
    expect(statusOf(trip('2026-02-31', '2026-03-02'), TODAY)).toBe('draft')
  })
  it('agrees with whenBucket on past and draft', () => {
    const samples = [trip('2026-10-05', '2026-10-09'), trip('', ''), trip('2026-10-10', '2026-10-12'), trip('2026-12-01', '2026-12-03')]
    for (const sample of samples) {
      const status = statusOf(sample, TODAY)
      const bucket = whenBucket(sample, TODAY)
      expect(status === 'past' || status === 'draft' ? status : 'upcoming').toBe(bucket)
    }
  })
  it('does not shift the day with the time of day', () => {
    const justAfterMidnight = new Date(2026, 9, 10, 0, 0, 1)
    expect(statusOf(trip('2026-10-10', '2026-10-12'), justAfterMidnight)).toBe('live')
    expect(statusOf(trip('2026-10-11', '2026-10-12'), justAfterMidnight)).toBe('upcoming')
  })
  it('treats a reversed range by its end date', () => {
    expect(statusOf(trip('2026-11-05', '2026-10-01'), TODAY)).toBe('past')
    expect(statusOf(trip('2026-11-05', '2026-10-20'), TODAY)).toBe('upcoming')
  })
})

describe('pickUpNext', () => {
  it('picks the live or earliest upcoming trip', () => {
    const live = trip('2026-10-09', '2026-10-12')
    const soon = trip('2026-10-20', '2026-10-22')
    const later = trip('2026-12-01', '2026-12-05')
    expect(pickUpNext([later, soon, live], TODAY)).toBe(live)
    expect(pickUpNext([later, soon], TODAY)).toBe(soon)
  })
  it('skips past, draft and reversed trips', () => {
    const past = trip('2026-09-01', '2026-09-03')
    const draft = trip('', '')
    const reversed = trip('2026-11-05', '2026-11-01')
    const good = trip('2026-12-01', '2026-12-03')
    expect(pickUpNext([past, draft, reversed, good], TODAY)).toBe(good)
  })
  it('includes a trip that ends today', () => {
    const endsToday = trip('2026-10-08', '2026-10-10')
    expect(pickUpNext([endsToday], TODAY)).toBe(endsToday)
  })
  it('breaks a start-date tie with the most recently updated trip', () => {
    const older = trip('2026-10-20', '2026-10-22', emptyDays(3), 100)
    const newer = trip('2026-10-20', '2026-10-25', emptyDays(3), 200)
    expect(pickUpNext([older, newer], TODAY)).toBe(newer)
    expect(pickUpNext([newer, older], TODAY)).toBe(newer)
  })
  it('keeps input order on a full tie', () => {
    const first = trip('2026-10-20', '2026-10-22', emptyDays(3), 100)
    const second = trip('2026-10-20', '2026-10-22', emptyDays(3), 100)
    expect(pickUpNext([first, second], TODAY)).toBe(first)
  })
  it('returns null when nothing qualifies', () => {
    expect(pickUpNext([], TODAY)).toBeNull()
    expect(pickUpNext([trip('2026-09-01', '2026-09-03'), trip('', '')], TODAY)).toBeNull()
  })
})

describe('countdownText', () => {
  it('says "Day 1 of M" on the first day', () => {
    expect(countdownText(trip('2026-10-10', '2026-10-13', emptyDays(4)), TODAY)).toBe('Day 1 of 4')
  })
  it('says "Day N of M" on the last day', () => {
    expect(countdownText(trip('2026-10-07', '2026-10-10', emptyDays(4)), TODAY)).toBe('Day 4 of 4')
  })
  it('drops " of M" when N is more than M', () => {
    expect(countdownText(trip('2026-10-07', '2026-10-12', emptyDays(2)), TODAY)).toBe('Day 4')
  })
  it('drops " of M" when the trip has no days', () => {
    expect(countdownText(trip('2026-10-09', '2026-10-12', []), TODAY)).toBe('Day 2')
  })
  it('says "Starts tomorrow" for a start one day away', () => {
    expect(countdownText(trip('2026-10-11', '2026-10-13'), TODAY)).toBe('Starts tomorrow')
  })
  it('says "Starts in N days" otherwise', () => {
    expect(countdownText(trip('2026-10-12', '2026-10-13'), TODAY)).toBe('Starts in 2 days')
    expect(countdownText(trip('2026-11-10', '2026-11-13'), TODAY)).toBe('Starts in 31 days')
  })
  it('counts calendar days across a month and year end', () => {
    const lateDecember = new Date(2026, 11, 30, 23, 30, 0)
    expect(countdownText(trip('2027-01-01', '2027-01-03'), lateDecember)).toBe('Starts in 2 days')
  })
  it('returns null for past and draft trips', () => {
    expect(countdownText(trip('2026-09-01', '2026-09-03'), TODAY)).toBeNull()
    expect(countdownText(trip('', ''), TODAY)).toBeNull()
  })
})

describe('planning', () => {
  it('counts days that have a stop that is not rejected', () => {
    const days = [
      day(['A', 'confirmed']),
      day(['B', 'rejected']),
      day(['C', 'rejected'], ['D', 'maybe']),
      day(),
    ]
    expect(planning({ days })).toEqual({ planned: 2, total: 4 })
  })
  it('handles a trip with no days', () => {
    expect(planning({ days: [] })).toEqual({ planned: 0, total: 0 })
  })
})

describe('nextStep', () => {
  const days = [
    day(['Early', 'needs-booking']),
    day(['Fine', 'confirmed']),
    day(['Boat safari', 'needs-booking'], ['Other', 'needs-booking']),
  ]
  it('skips days that are already past', () => {
    expect(nextStep(trip('2026-10-09', '2026-10-11', days), TODAY)).toEqual({ day: 3, title: 'Boat safari' })
  })
  it('starts at day 1 for a trip that has not started', () => {
    expect(nextStep(trip('2026-10-20', '2026-10-22', days), TODAY)).toEqual({ day: 1, title: 'Early' })
  })
  it('starts at day 1 when the start date is invalid', () => {
    expect(nextStep(trip('', '', days), TODAY)).toEqual({ day: 1, title: 'Early' })
  })
  it('returns null when nothing needs booking from today on', () => {
    expect(nextStep(trip('2026-10-05', '2026-10-12', days), TODAY)).toBeNull()
    expect(nextStep(trip('2026-10-10', '2026-10-12', []), TODAY)).toBeNull()
  })
})

describe('rangeText', () => {
  it('shortens a range in one month', () => {
    expect(rangeText(trip('2026-10-12', '2026-10-15'), TODAY)).toBe('12–15 Oct')
  })
  it('names both months across a month end', () => {
    expect(rangeText(trip('2026-10-28', '2026-11-02'), TODAY)).toBe('28 Oct – 2 Nov')
  })
  it('shows a single day once', () => {
    expect(rangeText(trip('2026-10-12', '2026-10-12'), TODAY)).toBe('12 Oct')
  })
  it('adds the year when a date is outside this year', () => {
    expect(rangeText(trip('2026-12-28', '2027-01-03'), TODAY)).toBe('28 Dec – 3 Jan 2027')
    expect(rangeText(trip('2027-03-12', '2027-03-15'), TODAY)).toBe('12–15 Mar 2027')
  })
  it('says "No dates yet" for missing or invalid dates', () => {
    expect(rangeText(trip('', ''), TODAY)).toBe('No dates yet')
    expect(rangeText(trip('2026-10-12', 'x'), TODAY)).toBe('No dates yet')
  })
  it('shows a reversed range in date order', () => {
    expect(rangeText(trip('2026-10-15', '2026-10-12'), TODAY)).toBe('12–15 Oct')
  })
})

describe('regionFor', () => {
  it('maps destination names to a region, ignoring case', () => {
    expect(regionFor({ destinations: ['Munnar', 'Thekkady'] })).toBe('kerala')
    expect(regionFor({ destinations: ['NORTH GOA'] })).toBe('goa')
    expect(regionFor({ destinations: ['Jodhpur'] })).toBe('rajasthan')
    expect(regionFor({ destinations: ['Madikeri'] })).toBe('coorg')
    expect(regionFor({ destinations: ['Cherrapunji'] })).toBe('meghalaya')
    expect(regionFor({ destinations: ['Srinagar'] })).toBe('kashmir')
  })
  it('matches a keyword inside a longer name', () => {
    expect(regionFor({ destinations: ['Old Goa Heritage Walk'] })).toBe('goa')
  })
  it('falls back to neutral art', () => {
    expect(regionFor({ destinations: ['Hampi', 'Gokarna'] })).toBe('generic')
    expect(regionFor({ destinations: [] })).toBe('generic')
  })
})
