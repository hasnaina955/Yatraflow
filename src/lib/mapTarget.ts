export type MapCoordinate = { lat: number; lng: number }
export type MapTarget =
  | { kind: 'stop'; stopId: string }
  | { kind: 'coordinate'; coordinate: MapCoordinate }
  | { kind: 'bounds'; points: MapCoordinate[] }

export function validMapCoordinate(point: MapCoordinate): boolean {
  return Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180
}

export function normalizeMapTarget(target: MapTarget): MapTarget | null {
  if (target.kind === 'stop') {
    const stopId = target.stopId.trim()
    return stopId ? { kind: 'stop', stopId } : null
  }
  if (target.kind === 'coordinate') {
    return validMapCoordinate(target.coordinate) ? target : null
  }
  if (target.points.length < 2 || !target.points.every(validMapCoordinate)) return null
  return { kind: 'bounds', points: [...target.points] }
}
