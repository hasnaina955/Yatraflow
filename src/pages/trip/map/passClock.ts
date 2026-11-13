// The clock at a point on the day's road. The day's stops are anchors: each has
// an along-route km, an arrival and a departure. Between two anchors the clock
// is spread by distance, the same even pace the route clock on the map uses.
// A point outside the anchors, or an anchor with a missing fact, gives null.

/** One stop of the day, in road order. Minutes since midnight. */
export interface PassAnchor {
  km: number | null
  arriveMin: number | null
  departMin: number | null
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** The minute the day's road reaches `km`, or null when it is not provable. */
export function passClockMin(anchors: readonly PassAnchor[], km: number | null | undefined): number | null {
  if (!finite(km)) return null
  for (let i = 1; i < anchors.length; i++) {
    const from = anchors[i - 1]
    const to = anchors[i]
    if (!finite(from.km) || !finite(from.departMin) || !finite(to.km) || !finite(to.arriveMin)) continue
    if (to.km <= from.km) continue
    if (km < from.km || km > to.km) continue
    // A leg that crosses midnight keeps counting up.
    const arrive = to.arriveMin < from.departMin ? to.arriveMin + 1440 : to.arriveMin
    const share = (km - from.km) / (to.km - from.km)
    return Math.round(from.departMin + (arrive - from.departMin) * share)
  }
  return null
}

/** The arrival at a pick: the pass minute plus the outward half of its detour.
 *  The detour is a return-valued fact, so the outward leg is half of it. This
 *  is the rule `candidateArrivalMin` uses. A missing detour gives null. */
export function pickArrivalMin(passMin: number | null, detourMin: number | null | undefined): number | null {
  if (passMin == null || !finite(detourMin) || detourMin < 0) return null
  return Math.round(passMin + detourMin / 2)
}
