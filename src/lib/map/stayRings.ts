// The dependency key for the stay reach rings on the trip map.
//
// The map's layout effect writes state (the spread positions, the ring captions
// and a view tick), so it must run only when a ring really changes. The rings
// arrive as a fresh array on every render: the Map tab builds them inline, and
// TripMap's own default is a new `[]`. The array identity changed on every
// commit, so the effect ran again, set state, and left the render
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
 * the same ids and outlines give the same string, but the array can be fresh.
 */
export function stayRingsDependencyKey(rings: readonly StayRingLike[] | null | undefined): string {
  if (rings == null || rings.length === 0) return ''
  return rings.map(ring => `${ring.id}:${ring.ring.map(pointKey).join(';')}`).join('|')
}

/**
 * What the Stay camera does when its effect runs. A new ring key (the lens
 * opened, or the stay base moved) always frames the ring, because that is an
 * explicit new subject. The same key frames again only after a resize, and only
 * while the reader has not moved the map. A caption change never reaches here.
 */
export function stayFrameAction(input: {
  framing: boolean
  hasRing: boolean
  key: string
  framedKey: string | null
  released: boolean
}): 'frame' | 'skip' {
  if (!input.framing || !input.hasRing) return 'skip'
  if (input.key !== input.framedKey) return 'frame'
  return input.released ? 'skip' : 'frame'
}
