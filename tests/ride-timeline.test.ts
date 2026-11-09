import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Journey } from '../src/lib/engine'
import { RideTimeline, savedRideLeg } from '../src/components/storefront/ride/RideTimeline'
import { RideDayPanel } from '../src/components/storefront/RidePanels'
import { RideLockedPreview } from '../src/components/storefront/ride/RideLockedPreview'
import { rideHeightPoints } from '../src/components/storefront/ride/RideElevation'
import { seedData } from '../src/data/seed'
import { buildRouteHeightPoints } from '../src/lib/elevation'

const stop = {
  id: 'lake', title: 'Lake', category: 'nature', locationName: 'Nako', lat: 31, lng: 78,
  visitMinutes: 60, entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
  priority: 'must-do', status: 'confirmed', orderInDay: 0, notes: 'Walk on the bank.',
  legDistanceKm: 72, legTravelMinutes: 114,
} satisfies Journey['points'][number]['stop']
const leg = { fromTitle: 'Kalpa', toTitle: 'Nako', distanceKm: 100, durationMinutes: 200 }
const journey = {
  dayIndex: 2, direction: 'outbound', startTitle: 'Kalpa', endTitle: 'Nako', startTime: '08:00', arrivalTime: '09:54',
  distanceKm: 72, driveMinutes: 114, dwellMinutes: 60, totalMinutes: 174, transportCostInr: 0,
  fuelLitres: null, fuelPricePerL: null, halts: [], endsAtStart: false,
  points: [
    { kind: 'start', title: 'Kalpa', lat: 31, lng: 78, stop: { ...stop, id: 'start', auto: true }, synthesized: true, legIn: null, arrive: '08:00', depart: '08:00', dwellMinutes: 0 },
    { kind: 'visit', title: 'Nako', lat: 31, lng: 78, stop, synthesized: false, legIn: leg, arrive: '09:54', depart: '10:54', dwellMinutes: 60 },
  ],
} satisfies Journey

describe('ride presentation', () => {
  it('withholds locked-day terrain points and breaks the line across them', () => {
    const points = rideHeightPoints({ ...seedData.trips[0], days: [
      { id: 'a', index: 0, stops: [{ ...stop, id: 'a' }] },
      { id: 'locked', index: 1, stops: [{ ...stop, id: 'secret', title: 'Hidden place', lat: 32 }] },
      { id: 'b', index: 2, stops: [{ ...stop, id: 'b', lat: 33 }] },
    ] }, [0, 2])
    expect(points.map(point => point.key)).toEqual(['a', 'b'])
    expect(JSON.stringify(points)).not.toContain('Hidden place')
    expect(buildRouteHeightPoints(points)[1].breakBefore).toBe(true)
  })
  it('omits missing, invalid and air legs rather than using the engine fallback', () => {
    expect(savedRideLeg({}, leg)).toBeNull()
    expect(savedRideLeg({ legDistanceKm: NaN, legTravelMinutes: 10 }, leg)).toBeNull()
    expect(savedRideLeg(stop, { ...leg, kind: 'air' })).toBeNull()
    expect(savedRideLeg(stop, leg)).toEqual({ km: 72, minutes: 114 })
  })

  it('renders real clocks, the saved leg and a separate creator note', () => {
    const html = renderToStaticMarkup(createElement(RideTimeline, { journey, timeFormat: '24h', children: null }))
    expect(html).toContain('Leave ' + 'Kalpa')
    expect(html).toContain('09:54')
    expect(html).toContain('72 km · 1h 54m')
    expect(html).not.toContain('100 km')
    expect(html).toContain('Walk on the bank.')
    expect(html).toContain('pi-ride-note')
    expect(html).toContain('Finish at')
  })

  it('renders region art when a day has no photo', () => {
    const html = renderToStaticMarkup(createElement(RideDayPanel, {
      publicationId: 'pub', index: 0, planPlaces: ['Spiti'], state: 'free',
      badge: 'Day 1', title: 'A day', meta: '2 places', budget: null, children: null,
    }))
    expect(html).toContain('yf-art-picture')
    expect(html).toContain('<picture')
  })

  it('keeps paid previews to categories and counts', () => {
    const html = renderToStaticMarkup(createElement(RideLockedPreview, {
      publicationId: 'pub', index: 4, lastIndex: 7, planPlaces: ['Spiti'], action: 'Unlock days 5 to 8',
      card: { state: 'locked', summary: { index: 4, title: 'Paid day', placeCount: 2, travelMinutes: 0, pace: null, hasFlight: false,
        kinds: [{ kind: 'temple', count: 1 }, { kind: 'nature', count: 1 }] } },
    }))
    expect(html).toContain('1 temple and 1 nature stop')
    expect(html).toContain('Days 5 to 8 open together')
    expect(html).toContain('In the paid plan')
    expect(html).not.toContain('Lake')
  })
})
