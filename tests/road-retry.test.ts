// ============ Road retry — the surfaces that say "failed" offer the retry ============
// `TripRoadView.retry` has existed at the source since #188 (TripWorkspace's
// useTripRoad bumps an attempt counter that re-runs the measurement effect),
// but no surface consumed it: the two places that say the road failed — the
// Board's estimate note and the Map tab's travel-day banner — offered no way
// back. These are SOURCE bindings (the wiring has no DOM-free seam): the note
// survives the retry's pending, the latch holds the banner open through a
// re-measure, and the in-flight state is said out loud instead of blinking.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isRoadRetryUnderway, nextRoadLatch, type RoadLatch, type RoadLatchStatus } from '../src/pages/trip/map/roadRetryLatch'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const board = read('../src/components/BoardView.tsx')
const mapTab = read('../src/pages/trip/MapTab.tsx')
const workspace = read('../src/pages/TripWorkspace.tsx')

// A pin is live only when deleting its producer binding breaks the match.
function assertLivePin(label: string, source: string, pattern: RegExp, marker: string) {
  expect(source, `${label}: live source`).toMatch(pattern)
  expect(source, `${label}: marker present`).toContain(marker)
  expect(source.replace(marker, ''), `${label}: negative control`).not.toMatch(pattern)
}

describe('the source still wires the retry into the measurement (#188)', () => {
  it('useTripRoad keeps attempt in the effect deps and hands retry out on the view', () => {
    expect(workspace).toMatch(/const retry = useCallback\(\(\) => setAttempt\(a => a \+ 1\), \[\]\)/)
    expect(workspace).toMatch(/\}, \[chainSig, chain, attempt\]\)/)
    expect(workspace).toMatch(/status: state\.status, retry \}/)
  })
})

describe('BoardView — the failed note carries its retry', () => {
  it('keeps the honest note up through a retry flight (failed OR pending)', () => {
    // a gate keyed on `failed` alone would blink the note off the moment the
    // retry flipped status to pending — and nothing else on this surface says
    // the figures are estimates
    expect(board).toMatch(/&& \(road\?\.status === 'failed' \|\| road\?\.status === 'pending'\)/)
    expect(board).toMatch(/const roadRetrying = road\?\.status === 'pending'/)
    expect(board).toMatch(/Measuring the road…/)
  })

  it('offers the button only while not already measuring', () => {
    expect(board).toMatch(/roadUnmeasured && !roadRetrying && road && \(/)
    expect(board).toMatch(/onClick=\{road\.retry\}/)
    expect(board).toMatch(/Retry road measurement/)
    // the reason a retry can help is stated, not implied
    expect(board).toMatch(/may have been rate-limited/)
  })
})

describe('MapTab — the travel-day banner carries its retry', () => {
  it('latches the failure through the retry flight, clears on resolve or rebuild', () => {
    // The real latch step the page applies while it renders, for trip A.
    let latch: RoadLatch = { tripId: 'trip-a', failedEver: false }
    latch = nextRoadLatch(latch, 'trip-a', 'failed')
    expect(latch.failedEver).toBe(true)
    latch = nextRoadLatch(latch, 'trip-a', 'pending')
    expect(latch.failedEver).toBe(true)
    expect(isRoadRetryUnderway(latch.failedEver, 'pending')).toBe(true)
    // No road view for a render does not forget the failure.
    latch = nextRoadLatch(latch, 'trip-a', undefined)
    expect(latch.failedEver).toBe(true)
    // A resolved measurement clears it, and then no retry is underway.
    latch = nextRoadLatch(latch, 'trip-a', 'ok')
    expect(latch.failedEver).toBe(false)
    expect(isRoadRetryUnderway(latch.failedEver, 'pending')).toBe(false)
    // Known-bad control: a gate keyed on the live status alone drops the banner
    // the moment the retry flips the status to pending. A trip that never
    // failed never reads as a retry underway.
    expect(nextRoadLatch({ tripId: 'trip-a', failedEver: false }, 'trip-a', 'pending').failedEver).toBe(false)
    expect(mapTab).toMatch(/const roadNeedsRetry = routeFailed \|\| roadRetryUnderway/)
    // the banner gate accepts the latched failure, not just the live one
    expect(mapTab).toMatch(/\(routeTotalKm != null \|\| roadNeedsRetry\)/)
    expect(mapTab).not.toMatch(/\(routeTotalKm != null \|\| routeFailed\)/)
    // the "rough estimate" sentence keys on the LIVE failure — the latch holds
    // the banner open without claiming a failure that is being re-measured
    expect(mapTab).toMatch(/routeFailed && 'Rough estimate/)
  })

  it('says the in-flight state and offers the button from the banner', () => {
    expect(mapTab).toMatch(/Measuring the road again — the estimates hold until it resolves\./)
    expect(mapTab).toMatch(/onClick=\{road\.retry\}/)
    expect(mapTab).toMatch(/Retry road measurement/)
    // the button hides while the re-measure is in flight
    expect(mapTab).toMatch(/roadNeedsRetry && road && !roadRetryUnderway && \(/)
  })

  it('steps the latch in render and clears it only on a resolve - no effect-based reaper', () => {
    // A failure keeps it, a pending retry keeps it, no road view keeps it. Only
    // a resolved measurement clears it.
    for (const status of ['failed', 'pending', undefined] as const) {
      expect(nextRoadLatch({ tripId: 'trip-a', failedEver: true }, 'trip-a', status).failedEver).toBe(true)
    }
    expect(nextRoadLatch({ tripId: 'trip-a', failedEver: true }, 'trip-a', 'ok').failedEver).toBe(false)
    // The step hands back the same object when nothing moved, so the
    // render-phase update fires once and converges - it cannot loop.
    const latched: RoadLatch = { tripId: 'trip-a', failedEver: true }
    expect(nextRoadLatch(latched, 'trip-a', 'failed')).toBe(latched)
    expect(nextRoadLatch(latched, 'trip-a', 'pending')).toBe(latched)
    expect(nextRoadLatch(latched, 'trip-a', undefined)).toBe(latched)
    const unlatched: RoadLatch = { tripId: 'trip-a', failedEver: false }
    expect(nextRoadLatch(unlatched, 'trip-a', 'ok')).toBe(unlatched)
    expect(nextRoadLatch(unlatched, 'trip-a', 'pending')).toBe(unlatched)
    // The page applies the step during render, with state, keyed to the trip,
    // and reads no ref.
    assertLivePin('render latch step', mapTab,
      /nextRoadLatch\(roadLatch, trip\.id, road\?\.status\)/,
      'nextRoadLatch(roadLatch, trip.id, road?.status)')
    assertLivePin('render retry-underway step', mapTab,
      /isRoadRetryUnderway\(roadLatched\.failedEver, road\?\.status\)/,
      'isRoadRetryUnderway(roadLatched.failedEver, road?.status)')
    expect(mapTab).not.toContain('roadFailedEverRef')
    expect(mapTab).not.toMatch(/useEffect\(\(\) => \{ setRoadLatch/)
  })
})

describe('the latch is scoped to the trip that failed (#841 F1)', () => {
  // The workspace outlives trips and renders MapTab without a trip key, so a
  // trip switch arrives as a prop change. A latch blind to trip identity lets
  // trip A's settled failure render on trip B's first pending renders as
  // "Measuring the road again" - before anyone pressed Retry - and hides Retry
  // while it does. These drive the real state producer the page steps while it
  // renders, across A failure -> B pending -> back to A. MapTab itself is not
  // rendered in node; the F1 window still needs the real-page browser probe:
  // fail trip A's road, switch trips, watch trip B's banner while it measures.
  const tripA: RoadLatch = { tripId: 'trip-a', failedEver: false }

  it('resets at the trip boundary - B never inherits A\'s measuring line', () => {
    let latch = nextRoadLatch(tripA, 'trip-a', 'failed')
    expect(latch.failedEver).toBe(true)
    // A: the user presses Retry. The in-flight state stays honest.
    latch = nextRoadLatch(latch, 'trip-a', 'pending')
    expect(latch.failedEver).toBe(true)
    expect(isRoadRetryUnderway(latch.failedEver, 'pending')).toBe(true)

    // Switch to trip B while A's retry is still in flight. B starts pending,
    // but B has never failed - so B must not read as a retry underway.
    latch = nextRoadLatch(latch, 'trip-b', 'pending')
    expect(latch.tripId).toBe('trip-b')
    expect(latch.failedEver).toBe(false)
    expect(isRoadRetryUnderway(latch.failedEver, 'pending')).toBe(false)

    // B resolves: a success stays clear, and B's own failure latches on B.
    latch = nextRoadLatch(latch, 'trip-b', 'ok')
    expect(latch.failedEver).toBe(false)
    latch = nextRoadLatch(latch, 'trip-b', 'failed')
    expect(latch.failedEver).toBe(true)
    expect(latch.tripId).toBe('trip-b')
  })

  it('returning to A re-measures fresh and re-latches only on A\'s own failure', () => {
    let latch = nextRoadLatch(tripA, 'trip-a', 'failed')
    latch = nextRoadLatch(latch, 'trip-b', 'pending')
    expect(latch.failedEver).toBe(false)
    // Back on A the workspace re-measures (pending again). A first measure is
    // not a retry: no "measuring again" line, and no hidden Retry button.
    latch = nextRoadLatch(latch, 'trip-a', 'pending')
    expect(latch.tripId).toBe('trip-a')
    expect(latch.failedEver).toBe(false)
    expect(isRoadRetryUnderway(latch.failedEver, 'pending')).toBe(false)
    // A's new measurement fails on its own merits: banner and Retry return.
    latch = nextRoadLatch(latch, 'trip-a', 'failed')
    expect(latch.failedEver).toBe(true)
    expect(isRoadRetryUnderway(latch.failedEver, 'pending')).toBe(true)
  })

  it('known-bad control: a status-only latch carries A\'s failure into B', () => {
    // The pre-fix shape: one boolean that only reads the status, blind to the
    // trip. Under it B's first pending render IS a phantom retry underway -
    // the exact defect this scoping removes.
    let carried = false
    const statusOnly = (status: RoadLatchStatus) => {
      if (status === 'failed') carried = true
      if (status === 'ok') carried = false
      return carried
    }
    statusOnly('failed')
    expect(statusOnly('pending')).toBe(true)
    // The same steps through the real latch: B reads clean.
    const real = nextRoadLatch({ tripId: 'trip-a', failedEver: true }, 'trip-b', 'pending')
    expect(real.failedEver).toBe(false)
    expect(isRoadRetryUnderway(real.failedEver, 'pending')).toBe(false)
  })
})
