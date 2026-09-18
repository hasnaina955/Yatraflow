// ============ Coincident map pins ============
// Two stops on one coordinate draw exactly on top of each other: the reader sees
// a single pin, and the stop underneath is invisible and unclickable. That is a
// real state, not a data error — a meal at the place you sleep is one place (see
// itinerarySpec's COORDS_DISTINCT rule), and a user adding two stops in the same
// town produces it too.
//
// The fix is drawing-only: the markers keep their true coordinates, and a wrapper
// around each pin is nudged apart so both are visible. The pin's own `transform`
// is taken (the teardrop shape rotates -45°, hover scales), so the offset lives
// on a parent element — hence the inline style on a wrapper span, not on the pin.
//
// Pure and node-testable: no maplibre, no DOM.

export interface PinOffset { dx: number; dy: number }

/** Two pins sharing a place are separated horizontally and given a slight
 *  vertical stagger; three or more fan out around the centre. */
const H_SPREAD_PX = 15
const V_STAGGER_PX = 7

/**
 * Offsets keyed by point id, for every point whose coordinate is shared.
 * Points with unique coordinates are absent from the map (no offset needed).
 * Coordinates compare at 4 decimals — the same resolution the spec's duplicate
 * rule and the importer's warning use.
 */
export function coincidentPinOffsets<T extends { id: string; lat: number; lng: number }>(
  points: T[],
): Map<string, PinOffset> {
  const byKey = new Map<string, T[]>()
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
    byKey.set(k, [...(byKey.get(k) ?? []), p])
  }

  const out = new Map<string, PinOffset>()
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    const mid = (group.length - 1) / 2
    group.forEach((p, i) => {
      out.set(p.id, {
        dx: (i - mid) * H_SPREAD_PX,
        // alternate above/below the true point so the stack stays centred on it
        dy: (i % 2 === 0 ? -1 : 1) * V_STAGGER_PX,
      })
    })
  }
  return out
}
