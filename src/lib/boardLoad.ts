import type { ItineraryStop } from '../data/types'

export const BOARD_STAY_MAX_KM = 0.5
export const BOARD_FULL_MIN_KM = 80
export const BOARD_LONG_MIN_KM = 150
export const BOARD_FULL_MIN_HOURS = 5
export const BOARD_LONG_MIN_HOURS = 7
export const BOARD_FULL_MIN_STOPS = 5
export const BOARD_LONG_MIN_STOPS = 7

export interface BoardLoadInput {
  distanceKm?: number | null
  stopCount?: number | null
  hours?: number | null
}

export function boardLoadWord({ distanceKm, stopCount, hours }: BoardLoadInput): string | null {
  if (distanceKm == null || stopCount == null || hours == null) return null
  if (!Number.isFinite(distanceKm) || !Number.isFinite(stopCount) || !Number.isFinite(hours)) return null
  if (distanceKm < 0 || hours < 0 || stopCount < 0 || !Number.isInteger(stopCount)) return null
  if (distanceKm <= BOARD_STAY_MAX_KM) return 'stay day'

  const level = distanceKm >= BOARD_LONG_MIN_KM || hours >= BOARD_LONG_MIN_HOURS || stopCount >= BOARD_LONG_MIN_STOPS
    ? 'long'
    : distanceKm >= BOARD_FULL_MIN_KM || hours >= BOARD_FULL_MIN_HOURS || stopCount >= BOARD_FULL_MIN_STOPS
      ? 'full'
      : 'light'
  return `${Math.round(distanceKm)} km · ${level}`
}

export function hasBoardLoadLocation(stops: Pick<ItineraryStop, 'lat' | 'lng' | 'status'>[]): boolean {
  return stops.some(stop => stop.status !== 'rejected' && Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && Math.abs(stop.lat) <= 90 && Math.abs(stop.lng) <= 180 && (stop.lat !== 0 || stop.lng !== 0))
}
