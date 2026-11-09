// Route paint for the Map tab. The selected day is drawn at 5px over a casing.
// Other days sit behind it at 2px and 40% opacity. All values come from the
// Language board.
export const ROUTE_PAINT = {
  selectedWidth: 5,
  selectedCasingWidth: 9,
  contextWidth: 2,
  contextOpacity: 0.4,
} as const

type LngLat = [number, number]
type Point = { lat: number; lng: number }

/** Largest distance from a day end to the measured road before we refuse to draw the day. */
const MAX_END_GAP_KM = 3

function approxKm(a: LngLat, b: Point): number {
  const dLat = (a[1] - b.lat) * 111.32
  const dLng = (a[0] - b.lng) * 111.32 * Math.cos(((a[1] + b.lat) / 2) * Math.PI / 180)
  return Math.hypot(dLat, dLng)
}

function nearestIndex(road: LngLat[], point: Point, from: number): { index: number; km: number } {
  let best = from
  let bestKm = Infinity
  for (let i = from; i < road.length; i++) {
    const km = approxKm(road[i], point)
    if (km < bestKm) { best = i; bestKm = km }
  }
  return { index: best, km: bestKm }
}

/**
 * Cut one day out of the measured whole-trip road. It only reuses real road
 * vertices. It returns null when a day end is far from the road or the cut
 * has fewer than two points, so no line is ever invented.
 */
export function sliceRoadBetween(road: readonly LngLat[] | null | undefined, from: Point, to: Point): LngLat[] | null {
  if (!road || road.length < 2) return null
  const start = nearestIndex(road as LngLat[], from, 0)
  const end = nearestIndex(road as LngLat[], to, start.index)
  if (start.km > MAX_END_GAP_KM || end.km > MAX_END_GAP_KM) return null
  if (end.index - start.index < 1) return null
  return road.slice(start.index, end.index + 1) as LngLat[]
}

export type DayRoadSlice = { dayIndex: number; coordinates: LngLat[]; selected: boolean }

/** Slices for every day that has a ride, with the selected day flagged. Days that cannot be cut are left out. */
export function dayRoadSlices(road: readonly LngLat[] | null | undefined, rides: Record<string, readonly Point[] | null | undefined>, selectedDay: number | null | undefined): DayRoadSlice[] {
  const out: DayRoadSlice[] = []
  for (const [key, ride] of Object.entries(rides)) {
    if (!ride || ride.length < 2) continue
    const coordinates = sliceRoadBetween(road, ride[0], ride[ride.length - 1])
    if (coordinates) out.push({ dayIndex: Number(key), coordinates, selected: Number(key) === selectedDay })
  }
  // Context days first, so the selected day paints on top.
  return out.sort((a, b) => Number(a.selected) - Number(b.selected) || a.dayIndex - b.dayIndex)
}
