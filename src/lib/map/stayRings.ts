// The dependency key for the stay reach rings on the trip map.
//
// The map's layout effect writes state (the spread positions, the ring captions
// and a view tick), so it must run only when a ring really changes. The rings
// arrive as a fresh array on every render: the Map tab builds them inline, and
// TripMap's own default is a new `[]`. Comparing the array by identity therefore
// re-ran the effect after every commit, the effect set state, and the render
// never settled ("Maximum update depth exceeded" at TripMap). The key below
// compares what the effect reads — each ring's id and its drawn shape — so a
// fresh array with the same rings keeps the same key.
//
// Pure, no React, no map instance.

/** The part of a ring the map reads: its id and its drawn outline. */
export interface StayRingLike {
  id: string
  /** The ring outline as [lng, lat] points. */
  ring: readonly (readonly [number, number])[]
}

/** Rounded coordinates keep a float wobble from counting as a new ring. */
const COORD_DIGITS = 5

function pointKey(point: readonly [number, number]): string {
  return `${point[0].toFixed(COORD_DIGITS)},${point[1].toFixed(COORD_DIGITS)}`
}

/**
 * One string for the rings. An absent or empty list gives ''. Two arrays with
 * the same ids and outlines give the same string, however fresh the array is.
 */
export function stayRingsDependencyKey(rings: readonly StayRingLike[] | null | undefined): string {
  if (rings == null || rings.length === 0) return ''
  return rings.map(ring => `${ring.id}:${ring.ring.map(pointKey).join(';')}`).join('|')
}
