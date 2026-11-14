import { buildJourney, legKey, type LegEstimate } from './engine'
import type { Trip } from '../data/types'

/** One pin chip's clock: the planned arrival, road km into the trip, and
 *  whether the drive behind it is still an estimate. */
export interface StopClockEntry {
  arrive: string
  cumKm: number
  estimated: boolean
  /** True when `arrive` is the fixed commitment's own clock, not the engine's
   *  arrival. A paid booking reads its booking time on every surface. */
  fixed?: boolean
}

/**
 * The map's pin clocks, derived from the SAME journey the Timeline rows read
 * (#611). `legCorrections` is the workspace's measured road data: a leg the
 * map carries reads measured, a leg it does not cover stays an estimate and
 * says so. The first point's own start clock is never an estimate — no drive
 * stands behind it.
 */
export function buildStopClock(
  trip: Trip,
  legCorrections?: Record<string, LegEstimate>,
): Map<string, StopClockEntry> {
  const clock = new Map<string, StopClockEntry>()
  // A fixed booking keeps its own clock. The key is the day and the linked
  // stop, so a commitment never leaks onto the same id on another day.
  const fixed = new Map<string, string>()
  for (const entry of trip.fixedCommitments ?? []) {
    if (entry.stopId == null || entry.time == null || entry.time.trim() === '') continue
    fixed.set(`${entry.dayIndex}:${String(entry.stopId)}`, entry.time)
  }
  let cum = 0
  for (const d of trip.days) {
    const j = buildJourney(trip, d, legCorrections)
    let legKm = 0
    j.points.forEach((p, i) => {
      legKm += p.legIn?.distanceKm ?? 0
      if (p.synthesized) return
      const prev = j.points[i - 1]
      const measured = !!p.legIn && !!prev && legCorrections?.[legKey(prev, p)] != null
      const booked = fixed.get(`${d.index}:${String(p.stop.id)}`) ?? null
      clock.set(p.stop.id, {
        arrive: booked ?? p.arrive,
        cumKm: Math.round(cum + legKm),
        estimated: !measured,
        ...(booked == null ? {} : { fixed: true }),
      })
    })
    cum += j.distanceKm
  }
  return clock
}
