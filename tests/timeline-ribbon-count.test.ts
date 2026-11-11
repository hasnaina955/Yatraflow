import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import { originOf, simulateDay } from '../src/lib/engine'
import type { ItineraryStop, StopStatus, Trip } from '../src/data/types'

describe('Timeline ribbon stop count', () => {
  it('uses the schedule count, excluding only rejected stops', () => {
    const trip: Trip = structuredClone(seedData.trips[0])
    const statuses: StopStatus[] = ['confirmed', 'suggested', 'maybe', 'needs-booking', 'rejected']
    const base = trip.days[0].stops[0]
    const stops: ItineraryStop[] = statuses.map((status, index) => ({
      ...base, id: `count-${index}`, status, orderInDay: index,
    }))
    trip.days = [{ ...trip.days[0], index: 0, stops }]
    trip.fixedCommitments = []
    const schedule = simulateDay(trip.days[0], trip, originOf(trip, 0), 0)
    expect(schedule.activeStops.map(stop => stop.status)).toEqual(statuses.slice(0, -1))
    expect(stops).toHaveLength(5)

    const source = readFileSync('src/pages/trip/TimelineTab.tsx', 'utf8').replace(/\r\n/g, '\n')
    expect(source).toMatch(/stopCount:\s*dayFacts\?\.sim\.activeStops\.length\s*\?\?\s*0/)
  })
})
