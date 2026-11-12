// One fit rule for the Stay and Gap lenses: travel there, the visit, travel back, then a buffer.
// The lenses must not write their own fit math. They call lensFit and fitCopy.

/** Minutes kept free after the return, so the next plan item is not tight. */
export const LENS_FIT_BUFFER_MIN = 10

/** A clock window in minutes since midnight. */
export interface FitWindow {
  startMin: number
  endMin: number
}

/** The result of one fit check. All values are minutes since midnight, except spareMin. */
export interface LensFit {
  fits: boolean
  leaveMin: number
  arriveMin: number
  backMin: number
  /** Window end minus the return and the buffer. Negative means it does not fit. */
  spareMin: number
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

/**
 * Check if a visit fits a window. The trip leaves at the window start, or later when the
 * group is busy until `earliestLeaveMin`. Returns null when an input is unknown or invalid.
 */
export function lensFit(
  window: FitWindow,
  earliestLeaveMin: number | null,
  travelOneWayMin: number | null,
  visitMin: number | null,
  bufferMin: number = LENS_FIT_BUFFER_MIN,
): LensFit | null {
  if (travelOneWayMin === null || visitMin === null) return null
  if (!Number.isFinite(window.startMin) || !Number.isFinite(window.endMin) || window.endMin <= window.startMin) return null
  if (!finiteNonNegative(travelOneWayMin) || !finiteNonNegative(visitMin) || !finiteNonNegative(bufferMin)) return null
  if (earliestLeaveMin !== null && !Number.isFinite(earliestLeaveMin)) return null
  const leaveMin = Math.max(window.startMin, earliestLeaveMin ?? window.startMin)
  const arriveMin = leaveMin + travelOneWayMin
  const backMin = arriveMin + visitMin + travelOneWayMin
  const spareMin = window.endMin - backMin - bufferMin
  return { fits: spareMin >= 0, leaveMin, arriveMin, backMin, spareMin }
}

/**
 * The one-line fit text, for example "Fits 14:10–16:00 · 25 min away · 90 min visit · back by 15:50".
 * The caller passes its clock formatter, so the 12h or 24h setting applies.
 * Returns null when the visit does not fit. A lens shows its no-fit reason in that case.
 */
export function fitCopy(window: FitWindow, fit: LensFit, travelOneWayMin: number, visitMin: number, clock: (min: number) => string): string | null {
  if (!fit.fits) return null
  return `Fits ${clock(window.startMin)}–${clock(window.endMin)} · ${Math.round(travelOneWayMin)} min away · ${Math.round(visitMin)} min visit · back by ${clock(fit.backMin)}`
}
