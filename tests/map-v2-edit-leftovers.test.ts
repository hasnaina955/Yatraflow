// Leftover map edit gaps: the planned arrival clock and the swap option list.
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { Trip } from '../src/data/types'
import type { DaySchedule } from '../src/lib/engine'
import {
  plannedArrivalFromSchedule,
  plannedArrivalLabel,
  TIME_NOT_PLANNED_YET,
} from '../src/pages/trip/map/pickPreview'

const stop = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, category: 'sightseeing', locationName: id, lat: 32, lng: 77, visitMinutes: 30,
  entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have', status: 'confirmed', ...over,
})

const sim = (rows: { id: string; arrive: string }[]): DaySchedule => ({
  dayIndex: 0,
  startsAt: '09:00',
  arrivalTimes: rows.map(r => r.arrive),
  departures: rows.map(() => '10:00'),
  legs: rows.map(() => ({ fromTitle: 'A', toTitle: 'B', distanceKm: 1, durationMinutes: 5 })),
  totalTravelMinutes: 5,
  totalDistanceKm: 1,
  activeStops: rows.map(r => stop(r.id) as never),
  endsAt: '10:00',
  endsAtStart: false,
  dwellMinutes: 30,
})

describe('plannedArrivalFromSchedule', () => {
  it('formats a known arrival in 12h and 24h', () => {
    const day = sim([{ id: 'a', arrive: '18:30' }])
    expect(plannedArrivalFromSchedule(day, 'a', '12h')).toBe('6:30 PM')
    expect(plannedArrivalFromSchedule(day, 'a', '24h')).toBe('18:30')
  })
  it('shows the honest text for an unknown stop', () => {
    expect(plannedArrivalFromSchedule(sim([{ id: 'a', arrive: '09:00' }]), 'zz', '12h')).toBe(TIME_NOT_PLANNED_YET)
  })
  it('shows the honest text for a blank or invalid clock', () => {
    expect(plannedArrivalFromSchedule(sim([{ id: 'a', arrive: '' }]), 'a', '12h')).toBe(TIME_NOT_PLANNED_YET)
    expect(plannedArrivalFromSchedule(sim([{ id: 'a', arrive: '--:--' }]), 'a', '12h')).toBe(TIME_NOT_PLANNED_YET)
  })
})

describe('plannedArrivalLabel', () => {
  it('shows the honest text for a missing day', () => {
    const trip = { days: [] } as unknown as Trip
    expect(plannedArrivalLabel(trip, 9, 'a', '24h')).toBe(TIME_NOT_PLANNED_YET)
  })
  it('reads a real arrival from the day schedule', () => {
    const trip = seedData.trips[0]
    const day = trip.days[0]
    const first = day.stops.find(s => s.status !== 'rejected')
    expect(first).toBeDefined()
    const label = plannedArrivalLabel(trip, day.index, first!.id, '24h')
    expect(label).not.toBe(TIME_NOT_PLANNED_YET)
    expect(label).toMatch(/^\d{2}:\d{2}$/)
  })
})
