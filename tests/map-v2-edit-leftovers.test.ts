// Leftover map edit gaps: the planned arrival clock and the swap option list.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { Trip } from '../src/data/types'
import type { DaySchedule } from '../src/lib/engine'
import {
  plannedArrivalFromSchedule,
  plannedArrivalLabel,
  swapOptionsFor,
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

describe('swapOptionsFor', () => {
  const day = (...rows: { id: string; order: number; status?: string }[]) => ({
    id: 'd0', index: 0,
    stops: rows.map(r => stop(r.id, { orderInDay: r.order, ...(r.status ? { status: r.status } : {}) }) as never),
  })

  it('excludes the stop itself and rejected stops', () => {
    const d = day(
      { id: 'a', order: 1 },
      { id: 'self', order: 2 },
      { id: 'c', order: 3 },
      { id: 'gone', order: 4, status: 'rejected' },
      { id: 'e', order: 5 },
    )
    const options = swapOptionsFor(d as never, 'self')
    expect(options.map(o => o.id)).toEqual(['a', 'c', 'e'])
    expect(options.some(o => o.id === 'self')).toBe(false)
    expect(options.some(o => o.id === 'gone')).toBe(false)
  })
  it('keeps day order and numbers each row by its place in the day', () => {
    const d = day(
      { id: 'z', order: 3 },
      { id: 'x', order: 1 },
      { id: 'self', order: 2 },
    )
    expect(swapOptionsFor(d as never, 'self')).toEqual([
      { id: 'x', label: '1 · x' },
      { id: 'z', label: '3 · z' },
    ])
  })
  it('returns no options for a single-stop day', () => {
    expect(swapOptionsFor(day({ id: 'a', order: 1 }) as never, 'a')).toEqual([])
  })
})

describe('minute scope copy', () => {
  const search = readFileSync('src/pages/trip/map/useMapSearch.ts', 'utf8').replace(/\r\n/g, '\n')
  it('names a wider minute scope, not the old slider', () => {
    expect(search).toContain('Increase scope')
    expect(search).not.toContain('widen the detour-scope slider')
  })
})
