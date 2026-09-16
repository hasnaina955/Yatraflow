// ============ Crew-size options ============
// One owner for the traveller-count vocabulary (#213 Phase 5). Create Trip
// offered the chips [1, 2, 3, 4, 5, 6, 8, 10] plus a custom field capped at 30,
// while Trip settings rendered a fixed 1..12 AND clamped the display at 12 — so
// a 15-person trip showed "12" highlighted and any tap silently dropped the
// party. Both surfaces share these chips and this range now.

/** Quick-pick chips. Deliberately skips 7 and 9 (crew sizes people actually pick).
 *  Typed as `readonly number[]` rather than a literal tuple so consumers can ask
 *  `CREW_CHIPS.includes(someNumber)` without a cast. */
export const CREW_CHIPS: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 10]

/** Floor — a trip has at least the traveller. */
export const CREW_MIN = 1
/** Ceiling — bigger groups get split into multiple trips. */
export const CREW_MAX = 30

/** Clamp a crew size into the supported range (non-finite → the floor). */
export function clampCrew(n: number): number {
  if (!Number.isFinite(n)) return CREW_MIN
  return Math.min(CREW_MAX, Math.max(CREW_MIN, Math.round(n)))
}
