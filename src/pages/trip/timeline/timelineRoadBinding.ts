// ============ Timeline measured-road binding builder (#08 S2) ============
// One pure production-called gate over the canonical measuredRoadFacts. No
// second road grader and no provider/routing call. An unmeasured, pending,
// failed, stale-chain, air or estimate-only road returns null.
import type { Trip } from '../../../data/types'
import type { TripRoadView } from '../../../lib/tripRoad'
import { measuredRoadFacts } from '../map/mapTabPipeline'
import { captureWriterRoadBinding, type WriterRoadBinding } from '../map/writerRoadBinding'

export interface TimelineRoadBindingInput {
  trip: Trip
  road: Pick<TripRoadView, 'status' | 'chain' | 'legs'>
  hasLine: boolean
}

export function buildTimelineRoadBinding(input: TimelineRoadBindingInput): WriterRoadBinding | null {
  const { trip, road, hasLine } = input
  if (!road.chain || !road.legs || road.legs.length === 0) return null
  const grade = measuredRoadFacts({ trip, road, hasLine })
  if (!grade.measured) return null
  if (!road.legs.some(leg => leg.source !== 'estimate')) return null
  return captureWriterRoadBinding({
    tripId: trip.id,
    routeKey: grade.routeKey ?? '',
    chainPoints: road.chain.points,
    legs: road.legs.map(leg => ({
      distanceKm: leg.distanceKm,
      durationMinutes: leg.durationMinutes,
      source: leg.source,
      geometry: leg.geometry.map(([lng, lat]) => ({ lat, lng })),
    })),
  })
}
