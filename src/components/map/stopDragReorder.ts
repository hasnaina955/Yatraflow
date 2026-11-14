import type { Trip } from '../../data/types'
import { proposeReorder, type ReorderResult } from '../../pages/trip/map/editing/reorder'

type LngLat = [number, number]
interface Point { lat: number; lng: number }

function nearestRoadIndex(road: readonly LngLat[], point: Point): number {
  let best = 0
  let bestD = Infinity
  road.forEach(([lng, lat], i) => {
    const d = (lng - point.lng) ** 2 + (lat - point.lat) ** 2
    if (d < bestD) { best = i; bestD = d }
  })
  return best
}

/**
 * Where a dragged stop ends up when the pointer is snapped to the road. The index
 * counts the other active stops whose road position comes before the pointer.
 * Null when there is no road to snap to.
 */
export function roadSnappedIndex(input: { road: readonly LngLat[] | null | undefined; pointer: Point; stopId: string; stops: readonly ({ id: string } & Point)[] }): number | null {
  const { road, pointer, stopId, stops } = input
  if (!road || road.length < 2) return null
  const at = nearestRoadIndex(road, pointer)
  return stops.filter(s => s.id !== stopId && nearestRoadIndex(road, s) < at).length
}

/** The pointer drop calls the same proposal as the keyboard. */
export function proposeDragReorder(input: { trip: Trip; dayIndex: number; stopId: string; pointer: Point; road: readonly LngLat[] | null | undefined; stops: readonly ({ id: string } & Point)[] }): ReorderResult | null {
  const toIndex = roadSnappedIndex(input)
  return toIndex === null ? null : proposeReorder({ trip: input.trip, dayIndex: input.dayIndex, stopId: input.stopId, toIndex })
}
