// #898: the discovery scope is minutes of EXTRA driving, not a kilometre radius.
// The engine still searches by distance, so this module is the one bridge.
// Steps and default are fixed by the user: 15 / 30 / 45 / 60, default 30.
import { DEFAULT_SPEED_KMH, type HaltPurpose } from '../../../lib/providers/hits'
import { FUEL_INTERVAL_KM } from '../../../lib/ridePlan'

export type ScopeMinutes = 15 | 30 | 45 | 60
export const MINUTE_SCOPE_STEPS: readonly ScopeMinutes[] = [15, 30, 45, 60]
export const DEFAULT_SCOPE_MINUTES: ScopeMinutes = 30

/** One saved value per trip, so two trips keep their own scope. */
export function scopeStorageKey(tripId: string): string {
  return `nearby_scope_min_${tripId}`
}

/** A saved string becomes a step. Anything else is the default, never a guess. */
export function readScopeMinutes(saved: string | null | undefined): ScopeMinutes {
  const n = Number(saved)
  return (MINUTE_SCOPE_STEPS as readonly number[]).includes(n) && saved !== '' ? (n as ScopeMinutes) : DEFAULT_SCOPE_MINUTES
}

/**
 * The one-way search radius for a minute scope. A detour goes out and back, so
 * the radius is half the extra driving at the engine's own default speed.
 */
export function scopeKmForMinutes(minutes: number): number {
  return Math.round(((minutes / 60) * DEFAULT_SPEED_KMH) / 2 * 10) / 10
}

/** The next wider step. The widest step stays where it is. */
export function nextScopeMinutes(minutes: ScopeMinutes): ScopeMinutes {
  const i = MINUTE_SCOPE_STEPS.indexOf(minutes)
  return MINUTE_SCOPE_STEPS[Math.min(i + 1, MINUTE_SCOPE_STEPS.length - 1)]
}

export function scopeValueMinutesText(minutes: number): string {
  return `${minutes} minutes of extra driving`
}

export interface ScopeCounts {
  /** rows whose known extra driving fits the scope */
  inside: number
  /** rows past the scope by no more than one step */
  justPast: number
  /** rows with no known extra driving; never counted as inside */
  unknown: number
}

/** Count the rows the page already holds. It adds no row and invents no detour. */
export function scopeCounts(rows: readonly { detourMin: number | null }[], minutes: number): ScopeCounts {
  const out: ScopeCounts = { inside: 0, justPast: 0, unknown: 0 }
  const step = MINUTE_SCOPE_STEPS[1] - MINUTE_SCOPE_STEPS[0]
  for (const { detourMin } of rows) {
    if (detourMin == null || !Number.isFinite(detourMin)) out.unknown += 1
    else if (detourMin <= minutes) out.inside += 1
    else if (detourMin <= minutes + step) out.justPast += 1
  }
  return out
}

/**
 * The purposes a day's discovery asks for, from the engine's own driving plan.
 * No plan day (a stay day) asks for a meal and sights only. A driving day adds a
 * stretch break, fuel at the engine's fuel interval, and the night halt when the
 * plan holds one. Nothing here reads the scan, so the scan cannot feed itself.
 */
export function dayPurposesFor(
  planDay: { startKm: number; endKm: number; nightHaltKm: number | null } | undefined,
): HaltPurpose[] {
  const out: HaltPurpose[] = ['meal', 'sight']
  if (!planDay) return out
  const km = planDay.endKm - planDay.startKm
  if (Number.isFinite(km) && km > 0) out.push('stretch')
  if (Number.isFinite(km) && km >= FUEL_INTERVAL_KM) out.push('fuel')
  if (planDay.nightHaltKm != null) out.push('overnight')
  return out
}
