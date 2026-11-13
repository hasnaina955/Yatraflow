// Handoff to the map layer: the proposed road of an add preview. TripMap draws it
// as a ghost line. This file only shapes the data from the preview's own facts.
import type { ReadyAddPreview } from './editing/addPreview'

export interface PreviewRoadPoint { lat: number; lng: number }

/**
 * The new road of one add preview. `path` runs from the stop before, through the
 * new stop, to the stop after. A pick that lands first or last has a shorter path.
 * `legInMeasured` and `legOutMeasured` are true only for a measured road leg, so
 * the map can draw an estimate as an estimate. Null leg flags mean no such leg.
 */
export interface PreviewRoad {
  dayIndex: number
  stopId: string
  path: PreviewRoadPoint[]
  legInMeasured: boolean | null
  legOutMeasured: boolean | null
}

export function previewRoadOf(preview: Pick<ReadyAddPreview, 'dayIndex' | 'stopId' | 'proposedTrip' | 'road'>): PreviewRoad | null {
  const day = preview.proposedTrip.days.find(d => d.index === preview.dayIndex)
  const stops = (day?.stops ?? []).filter(s => s.status !== 'rejected')
  const at = stops.findIndex(s => s.id === preview.stopId)
  if (at < 0) return null
  const path = stops.slice(Math.max(0, at - 1), at + 2).map(s => ({ lat: s.lat, lng: s.lng }))
  return {
    dayIndex: preview.dayIndex,
    stopId: preview.stopId,
    path,
    legInMeasured: preview.road.legIn ? preview.road.legIn.measured : null,
    legOutMeasured: preview.road.legOut ? preview.road.legOut.measured : null,
  }
}
