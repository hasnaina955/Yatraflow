import { describe, expect, it } from 'vitest'
import type { Trip } from '../src/data/types'
import { featuredTripPresentation, selectFeaturedTrip } from '../src/lib/featuredTrip'

const today = new Date(2026, 9, 8)
const trip = (id: string, startDate: string, endDate: string, updatedAt = 1) =>
  ({ id, startDate, endDate, updatedAt } as Trip)

const upcoming = trip('upcoming', '2026-10-10', '2026-10-12')
const underway = trip('underway', '2026-10-07', '2026-10-09')
const completed = trip('completed', '2026-10-01', '2026-10-03')
const undated = trip('undated', '', '')

describe('featured trip timing', () => {
  it.each([
    [upcoming, 'Your next journey', 'Closest upcoming departure', 'Upcoming', 'Departs in 2 days'],
    [underway, 'Your current journey', 'Trip in progress', 'Underway', 'Underway'],
    [completed, 'Featured trip', 'Most recently updated trip', 'Completed', 'Completed'],
    [undated, 'Featured trip', 'Most recently updated trip', 'Dates not set', 'Dates not set'],
  ])('labels %s from its dates', (t, heading, subheading, status, badge) => {
    expect(featuredTripPresentation(t, today)).toEqual({ heading, subheading, status, badge })
  })

  it('keeps departure day upcoming and the last day underway', () => {
    expect(featuredTripPresentation(trip('today', '2026-10-08', '2026-10-09'), today).badge).toBe('Departs today')
    expect(featuredTripPresentation(trip('last', '2026-10-07', '2026-10-08'), today).status).toBe('Underway')
  })

  it.each([
    ['2026-02-30', '2026-03-02'],
    ['2026-10-12', '2026-10-10'],
    ['2026-10-10', ''],
  ])('does not label invalid ranges upcoming', (start, end) => {
    expect(featuredTripPresentation(trip('bad', start, end), today).status).toBe('Dates not set')
  })
})

describe('featured trip selection', () => {
  it('prefers the closest future departure over an underway or recently updated trip', () => {
    const later = trip('later', '2026-10-12', '2026-10-15', 100)
    expect(selectFeaturedTrip([underway, later, undated, upcoming], today)).toBe(upcoming)
  })

  it('uses the earliest start when only underway trips remain', () => {
    const earlier = trip('earlier', '2026-10-06', '2026-10-10')
    expect(selectFeaturedTrip([underway, earlier, completed], today)).toBe(earlier)
  })

  it('uses the latest update for completed-only and undated fallbacks', () => {
    const recent = { ...completed, id: 'recent', updatedAt: 3 }
    expect(selectFeaturedTrip([completed, recent], today)).toBe(recent)
    expect(featuredTripPresentation(recent, today).badge).toBe('Completed')
    const draft = { ...undated, updatedAt: 4 }
    expect(selectFeaturedTrip([recent, draft], today)).toBe(draft)
    expect(featuredTripPresentation(draft, today).badge).toBe('Dates not set')
  })

  it('preserves input order for tied departures and updates without mutation', () => {
    const tied = { ...upcoming, id: 'tied', updatedAt: 10 }
    const input = [upcoming, tied]
    expect(selectFeaturedTrip(input, today)).toBe(upcoming)
    expect(input).toEqual([upcoming, tied])
    expect(selectFeaturedTrip([completed, undated], today)).toBe(completed)
  })

  it('returns null for an empty collection', () => {
    expect(selectFeaturedTrip([], today)).toBeNull()
  })
})
