// Only the isolated development config can select these provider transports.
export * from '../../src/lib/geocode'
import type { PlaceHit, SegmentHit } from '../../src/lib/geocode'
import { QuotaExhaustedError } from '../../src/lib/providers/google'

export const fixturePlaces: PlaceHit[] = [
  { id: 'fixture-farm', name: 'Anakkara spice farm walk', latitude: 9.692, longitude: 77.155, kind: 'poi', category: 'nature', description: 'Synthetic sample. A cardamom and pepper estate near the route.', source: 'osm', cumKm: 78, offRouteKm: 2.5 },
  { id: 'fixture-chai', name: 'Chaya Kada', latitude: 9.773, longitude: 77.104, kind: 'poi', category: 'food', description: 'Synthetic sample. Tea and a short break along the drive.', source: 'osm', cumKm: 57, offRouteKm: .5 },
  { id: 'fixture-view', name: 'Valley viewpoint', latitude: 9.83, longitude: 77.06, kind: 'poi', category: 'sightseeing', description: 'Synthetic sample. A short scenic stop.', source: 'osm', cumKm: 44, offRouteKm: 1.5 },
  { id: 'fixture-stay', name: 'Spice Village', latitude: 9.604, longitude: 77.164, kind: 'poi', category: 'hotel', source: 'osm', cumKm: 93, offRouteKm: .8 },
]
function state() { return new URLSearchParams(location.search).get('state') }
export function googleEnabled() { return state() === 'quota' }
export async function planJourneyHalts(): Promise<SegmentHit[]> {
  if (state() === 'failed') throw new Error('Synthetic provider read failed')
  if (state() === 'quota') throw new QuotaExhaustedError('textSearchPro')
  if (state() === 'empty') return []
  return fixturePlaces.map((hit, index) => ({
    hit, score: index,
    segment: { index, purpose: hit.category === 'hotel' ? 'overnight' : hit.category === 'food' ? 'meal' : 'sight', label: hit.category === 'food' ? 'Tea break' : hit.name, targetKm: hit.cumKm ?? 0, minKm: 0, maxKm: 110, kmFromPrev: 20, minutesFromPrev: 30, etaMinutes: 720 + index * 30, hint: 'Synthetic provider result' },
  }))
}
export async function searchNearbyPoisMulti() { return state() === 'empty' ? [] : fixturePlaces }
export async function searchPlacesText() {
  if (state() === 'failed') throw new Error('Synthetic search failed')
  if (state() === 'quota') throw new QuotaExhaustedError('textSearchPro')
  return fixturePlaces
}
