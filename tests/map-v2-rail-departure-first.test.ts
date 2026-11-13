// F2 item 4: the rail never shows a departure after a stop. A stop that stands
// on last night's stay may come first (a breakfast before the car leaves). Any
// other row waits behind the "Leave X" row. Node env: pure functions only.
import { describe, expect, it } from 'vitest'
import { railClockOrder, railDepartClock, railDepartureFirst } from '../src/components/map/railModel'
import { buildJourney, legKey } from '../src/lib/engine'
import { buildStopClock } from '../src/lib/stopClock'
import { seedData } from '../src/data/seed'
import type { ItineraryStop } from '../src/data/types'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapItinerary } from '../src/components/map/MapWorkspaceChrome'

it('keeps the Lonavala road distance in the engine and map clock', () => {
  const trip = structuredClone(seedData.trips[0])
  const origin = { lat: 18.9388, lng: 72.8354 }
  const lonavala = { ...trip.days[0].stops[0], id: 'lonavala', lat: 18.7546, lng: 73.4062, title: 'Lonavala breakfast', locationName: 'Lonavala', status: 'confirmed', auto: false } satisfies ItineraryStop
  trip.transportMode = 'car'
  trip.startLocation = 'South Mumbai'
  trip.startLocationCoords = origin
  trip.fixedCommitments = []
  trip.roundTrip = false
  trip.days = [{ ...trip.days[0], index: 0, startTime: '05:00', stops: [lonavala] }]
  const corrections = { [legKey(origin, lonavala)]: { distanceKm: 80, durationMinutes: 90 } }
  const journey = buildJourney(trip, trip.days[0], corrections)
  expect(journey.points[0].kind).toBe('start')
  expect(journey.points[1].legIn?.distanceKm).toBe(80)
  expect(buildStopClock(trip, corrections).get('lonavala')).toMatchObject({ cumKm: 80, arrive: '06:30', estimated: false })

  // Bad saved coordinates cannot supply real km. They must still leave the
  // departure first, even though the old rail advanced it past breakfast.
  lonavala.lat = origin.lat
  lonavala.lng = origin.lng
  const html = renderToStaticMarkup(createElement(MapItinerary, {
    trip, journey: buildJourney(trip, trip.days[0]), activeDay: 0, budgetMin: 25,
    selectedStop: null, allDays: false, onShowAll: () => undefined,
    onDayChange: () => undefined, onSelect: () => undefined, onFold: () => undefined,
    budgetBar: { text: '78 of 25 min · over budget · 4 free stops', step: 4 },
  }))
  const rows = html.slice(html.indexOf('class="mv2-stops"'))
  expect(rows.indexOf('Leave South Mumbai')).toBeGreaterThanOrEqual(0)
  expect(rows.indexOf('Leave South Mumbai')).toBeLessThan(rows.indexOf('>Lonavala<'))
  expect(html).toContain('aria-valuetext="78 of 25 min · over budget · 4 free stops"')
})

// Real Goa trip, Day 1: the first stop shows 5:00 and the car leaves at 5:45.
const goa = [
  { id: 'start', clock: '05:45', isStart: true, beforeLeave: false },
  { id: 'lonavala', clock: '05:00', isStart: false, beforeLeave: false },
  { id: 'karla', clock: '06:23', isStart: false, beforeLeave: false },
]

describe('railDepartClock', () => {
  it('keeps the start clock when the stop at the start place is not on last night’s stay', () => {
    expect(railDepartClock('05:00', [
      { distanceKm: 0, depart: '05:45', onLastNightStay: false },
      { distanceKm: 46, depart: '07:23' },
    ])).toBe('05:00')
  })

  it('still moves the clock past a breakfast on last night’s stay', () => {
    expect(railDepartClock('08:30', [
      { distanceKm: 0, depart: '10:00', onLastNightStay: true },
      { distanceKm: 8, depart: '10:50' },
    ])).toBe('10:00')
  })
})

describe('railDepartureFirst', () => {
  it('puts the departure ahead of a stop with an earlier clock', () => {
    const order = railDepartureFirst(railClockOrder(goa)).map(row => row.id)
    expect(order).toEqual(['start', 'lonavala', 'karla'])
  })

  it('lets a breakfast on last night’s stay stay before the departure', () => {
    const rows = [
      { id: 'start', clock: '10:00', isStart: true, beforeLeave: false },
      { id: 'breakfast', clock: '08:30', isStart: false, beforeLeave: true },
      { id: 'next', clock: '10:50', isStart: false, beforeLeave: false },
    ]
    expect(railDepartureFirst(railClockOrder(rows)).map(row => row.id)).toEqual(['breakfast', 'start', 'next'])
  })

  it('moves the departure to the top when any other stop would come first', () => {
    const rows = [
      { id: 'booked', clock: '04:30', isStart: false, beforeLeave: false },
      { id: 'start', clock: '05:00', isStart: true, beforeLeave: false },
    ]
    expect(railDepartureFirst(railClockOrder(rows)).map(row => row.id)).toEqual(['start', 'booked'])
  })

  it('leaves a day with no departure row as it is', () => {
    const rows: Array<{ id: string; clock: string; isStart?: boolean }> = [{ id: 'a', clock: '09:00' }, { id: 'b', clock: '08:00' }]
    expect(railDepartureFirst(railClockOrder(rows)).map(row => row.id)).toEqual(['b', 'a'])
  })
})
