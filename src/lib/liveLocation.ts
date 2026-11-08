// Pure logic for Map V2 ticket 23: show private live position.
// This module reads no location. It checks dates and derives a display state.
// No position goes to a store, a network, a log or a URL.

/** A calendar date in ISO form: yyyy-mm-dd. */
export type ISODate = string

/** A fix older than this window is labelled stale. This is a data age, not motion. */
export const LIVE_FIX_STALE_MS = 30_000

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function validISODate(value: ISODate): boolean {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

function utcToISO(date: Date): ISODate {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1
  const d = date.getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Read a local calendar date. The traveller's own day decides the gate. */
export function toISODate(date: Date): ISODate {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Add whole days in UTC, so no local clock shift enters the sum. */
export function addDaysISO(start: ISODate, days: number): ISODate {
  if (!validISODate(start)) return start
  const [y, m, d] = start.split('-').map(Number)
  return utcToISO(new Date(Date.UTC(y, m - 1, d + days)))
}

/** True when today falls inside the trip range, first and last day included. */
export function isActualTripDay(startDate: ISODate, endDate: ISODate, today: ISODate): boolean {
  if (!validISODate(startDate) || !validISODate(endDate) || !validISODate(today)) return false
  return today >= startDate && today <= endDate
}

export interface LivePositionGate {
  optedIn: boolean
  startDate: ISODate
  endDate: ISODate
  today: ISODate
  focusDay: number | 'all' | undefined
}

/** The dot draws for an opted-in user on an actual trip day. A future-day focus never draws it. */
export function livePositionAllowed(g: LivePositionGate): boolean {
  if (!g.optedIn) return false
  if (!isActualTripDay(g.startDate, g.endDate, g.today)) return false
  if (g.focusDay == null || g.focusDay === 'all') return true
  const focusedDate = addDaysISO(g.startDate, g.focusDay)
  return focusedDate <= g.today
}

export type LiveLocationState =
  | 'off'
  | 'unavailable'
  | 'locating'
  | 'denied'
  | 'failed'
  | 'stale'
  | 'live'

export interface LiveLocationSignals {
  optedIn: boolean
  dayAllowed: boolean
  supported: boolean
  hasFix: boolean
  fixAgeMs: number | null
  staleAfterMs: number
  error: LiveErrorSignal
}

/**
 * The watch error the layer keeps. 'unavailable' means the watch got no fix.
 * It reads as failed once a fix is already held.
 */
export type LiveErrorSignal = 'denied' | 'unavailable' | 'failed' | null

/** The three codes the layer can receive. Native and browser errors map onto these. */
export type LiveWatchErrorCode = 'permission_denied' | 'position_unavailable' | 'timeout'

/** Only a permission refusal reads as denied. A timeout or a lost signal never does. */
export function liveErrorSignal(code: LiveWatchErrorCode): 'denied' | 'unavailable' {
  return code === 'permission_denied' ? 'denied' : 'unavailable'
}

/**
 * Read the code from a browser GeolocationPositionError (1, 2 or 3) or a
 * Capacitor geolocation error (OS-PLUG-GLOC-0003 is a refusal, 0010 a timeout).
 * OS-PLUG-GLOC-0008 is a device restriction, so it reads as unavailable.
 * Any other shape reads as position_unavailable, never as a refusal.
 */
export function watchErrorCode(raw: unknown): LiveWatchErrorCode {
  const code = typeof raw === 'object' && raw !== null ? (raw as { code?: unknown }).code : undefined
  if (code === 1 || code === 'OS-PLUG-GLOC-0003') return 'permission_denied'
  if (code === 3 || code === 'OS-PLUG-GLOC-0010') return 'timeout'
  return 'position_unavailable'
}

/** Derive one state. Failed, denied, loading, unavailable and stale stay apart. */
export function deriveLiveLocationState(s: LiveLocationSignals): LiveLocationState {
  if (!s.optedIn || !s.dayAllowed) return 'off'
  if (!s.supported) return 'unavailable'
  if (s.error === 'denied') return 'denied'
  if (s.error === 'unavailable') return s.hasFix ? 'failed' : 'unavailable'
  if (s.error === 'failed') return 'failed'
  if (!s.hasFix) return 'locating'
  if (s.fixAgeMs != null && s.fixAgeMs > s.staleAfterMs) return 'stale'
  return 'live'
}

/** A dot needs a fix. Empty and failed states never invent one. */
export function drawsLiveDot(state: LiveLocationState): boolean {
  return state === 'live' || state === 'stale' || state === 'failed'
}

/** One short status line per state. Every non-off state reads differently. */
export const LIVE_LOCATION_COPY: Record<LiveLocationState, string> = {
  off: '',
  unavailable: 'Location is not available on this device.',
  locating: 'The map has no position yet.',
  denied: 'You did not allow location access.',
  failed: 'The location watch stopped. The map shows your last position.',
  stale: 'Your position is old.',
  live: 'The map shows your live position.',
}

export interface LiveCameraInput {
  hasFix: boolean
  userPanned: boolean
  recentered: boolean
}

/** A pan stops the follow. A manual recenter clears the pan and starts it again. */
export function resolveLiveCamera(i: LiveCameraInput): { follow: boolean; clearPan: boolean } {
  if (!i.hasFix) return { follow: false, clearPan: false }
  if (i.recentered) return { follow: true, clearPan: true }
  return { follow: !i.userPanned, clearPan: false }
}
