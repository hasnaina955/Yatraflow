// The road-failure latch behind the travel-day banner's Retry (#road-retry).
//
// The banner is the one surface that says the road failed, so it also owns the
// retry. Status flips to 'pending' the moment Retry is clicked, and a gate keyed
// on 'failed' alone would drop the banner mid-retry. The latch remembers that
// the last settled answer was a failure until a measurement resolves.
//
// The latch is keyed to the trip it failed in. The workspace outlives trips
// (it is not keyed by trip id), so a carried failure must not read as
// "measuring the road again" on a trip that never failed.
//
// Pure on purpose: the page keeps the latch in state and applies this step while
// it renders, so a same-tick flip never reads stale. A node test pins the rule.

/** The statuses the workspace's road view can report. Any other value, or no
 *  road view yet, leaves the latch as it was. */
export type RoadLatchStatus = 'ok' | 'failed' | 'pending' | undefined

/** One trip's latch: the trip it belongs to, plus whether that trip's road has
 *  ever settled as failed. */
export interface RoadLatch {
  tripId: string
  failedEver: boolean
}

/** The latch after one render. A failure sets it, a resolved measurement clears
 *  it, and every other status (pending, no view) keeps the last answer. A
 *  different trip resets it. Returns the same object when nothing moved, so the
 *  page's render step fires a state update once and converges. */
export function nextRoadLatch(latch: RoadLatch, tripId: string, status: RoadLatchStatus): RoadLatch {
  if (latch.tripId !== tripId) return { tripId, failedEver: false }
  if (status === 'failed') return latch.failedEver ? latch : { ...latch, failedEver: true }
  if (status === 'ok') return latch.failedEver ? { ...latch, failedEver: false } : latch
  return latch
}

/** True while a re-measure runs after a failure: the banner stays up and says
 *  so, instead of vanishing when the user asked for another attempt. */
export function isRoadRetryUnderway(latched: boolean, status: RoadLatchStatus): boolean {
  return latched && status === 'pending'
}
