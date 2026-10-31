// ============ Fixed-time read model (PW-08) ============
// The Timeline shows a fixed commitment against the SAME simulated clock the
// rail prints. This module is the one place that compares the two, so a stop
// pill, the Fixed times panel and the engine's conflict warning cannot drift.
// A missing link is never guessed: it stays `unlinked`.
import type { FixedCommitment } from '../data/types'
import { commitmentStopIndex, hmToMinutes, type DaySchedule } from './engine'
import { validHM } from './timefmt'

export type FixedTone = 'ok' | 'tight' | 'clash' | 'anchor' | 'unlinked' | 'invalid'

/** Worst first. Used to choose the pill tone when one stop carries several. */
export const FIXED_TONE_RANK: Record<FixedTone, number> = {
  unlinked: 0,
  anchor: 1,
  ok: 1,
  invalid: 2,
  tight: 2,
  clash: 3,
}

export interface FixedRow {
  fc: FixedCommitment
  /** index into `schedule.activeStops`, or null when the link is stale/absent */
  at: number | null
  /** the simulated arrival clock, or null when there is no honest clock */
  arrival: string | null
  /** minutes between arrival and the commitment; negative means late */
  spareMin: number | null
  tone: FixedTone
}

/** Resolve every commitment on a day against that day's schedule. */
export function fixedRowsFor(
  schedule: Pick<DaySchedule, 'activeStops' | 'arrivalTimes'>,
  commitments: readonly FixedCommitment[],
): FixedRow[] {
  return commitments.map(fc => {
    const at = commitmentStopIndex(schedule.activeStops, fc)
    const rawArrival = at != null ? schedule.arrivalTimes[at] ?? null : null
    const arrival = validHM(rawArrival ?? undefined) ?? null
    const commit = validHM(fc.time)
    const commitMin = commit != null ? hmToMinutes(commit) : null
    const arrivalMin = arrival != null ? hmToMinutes(arrival) : null
    const spareMin = commitMin != null && arrivalMin != null ? commitMin - arrivalMin : null
    const tone: FixedTone = commitMin == null
      ? 'invalid'
      : fc.type === 'hotel-checkin'
        ? 'anchor'
        : arrivalMin == null
          ? 'unlinked'
          : spareMin != null && spareMin < 0
            ? 'clash'
            : spareMin != null && spareMin < 45
              ? 'tight'
              : 'ok'
    return { fc, at, arrival, spareMin, tone }
  })
}

/** The ids the optimiser must not rewire. */
export function fixedStopIdsOf(rows: readonly FixedRow[]): string[] {
  return rows.flatMap(r => r.fc.stopId != null ? [String(r.fc.stopId)] : [])
}

/** The most urgent tone in a group, or null for an empty group. */
export function worstFixedTone(rows: readonly FixedRow[]): FixedTone | null {
  let worst: FixedTone | null = null
  for (const row of rows) {
    if (worst == null || FIXED_TONE_RANK[row.tone] > FIXED_TONE_RANK[worst]) worst = row.tone
  }
  return worst
}
