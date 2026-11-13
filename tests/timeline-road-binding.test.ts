// ============ Timeline road-hop builder (#08 S2) ============
// Production-called pure builder: only a canonical measured, non-estimate road
// yields a binding. All-estimate, pending, failed, stale, air or no-line roads
// return null, so no Timeline hop/Add is created.
import { describe, expect, it } from 'vitest'
import type { Trip } from '../src/data/types'
import type { TripRoadView } from '../src/lib/tripRoad'
import { roadChainSig } from '../src/lib/tripRoad'
import { buildTimelineRoadBinding } from '../src/pages/trip/timeline/timelineRoadBinding'

function trip(): Trip {
  return {
    id: 'trip-road-hop', name: 'Hop', startLocation: 'Kochi', destinations: ['Munnar'],
    startDate: '2026-11-01', endDate: '2026-11-01', travellers: 2, transportMode: 'car',
    budgetPerPersonInr: 5000, travelStyle: 'balanced', fixedCommitments: [],
    startLocationCoords: { lat: 10, lng: 76 }, destinationCoords: [{ lat: 10.6, lng: 76.6 }],
    days: [{
      id: 'day-a', index: 0, title: 'Day 1', stops: [{
        id: 's1', title: 'A', category: 'food', locationName: 'A', lat: 10.3, lng: 76.3,
        visitMinutes: 30, entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
        priority: 'nice-to-have', status: 'confirmed', orderInDay: 1,
      }],
    }],
    expenses: [], members: [], coverEmoji: '🧭', visibility: 'private',
    createdAt: 1, updatedAt: 1, writeVersion: 1, roundTrip: false,
  }
}

function road(source: 'osrm' | 'estimate'): TripRoadView {
  return {
    status: 'ok',
    chain: {
      points: [{ lat: 10, lng: 76 }, { lat: 10.3, lng: 76.3 }, { lat: 10.6, lng: 76.6 }],
      ptDay: [null, 0, null], outboundCount: 2, hasDestTail: true,
    },
    legs: [{
      distanceKm: 70, durationMinutes: 90, source,
      geometry: [[76, 10], [76.3, 10.3], [76.6, 10.6]],
    }],
    retry: () => {},
  }
}

describe('buildTimelineRoadBinding', () => {
  it('returns null for an all-estimate road and no hop is created', () => {
    const t = trip()
    expect(buildTimelineRoadBinding({ trip: t, road: road('estimate'), hasLine: true })).toBeNull()
  })

  it('returns a binding whose route key is the committed chain signature', () => {
    const t = trip()
    const binding = buildTimelineRoadBinding({ trip: t, road: road('osrm'), hasLine: true })
    expect(binding?.tripId).toBe(t.id)
    expect(binding?.routeKey).toBe(roadChainSig(t))
    expect(binding?.generation.length).toBeGreaterThan(0)
  })

  it('returns null when no drawn line exists', () => {
    expect(buildTimelineRoadBinding({ trip: trip(), road: road('osrm'), hasLine: false })).toBeNull()
  })
})
