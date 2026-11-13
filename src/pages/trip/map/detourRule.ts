// The ONE detour display rule, in a leaf module with no imports.
// `railLabels.ts` and `driveSuggestionView.ts` both need it. Each used to import
// the other, which made a cycle. Both now import this file instead.

/** A detour of half a minute or less reads "On route". The rail rows and the
 *  shared detour sentence both use this cutoff. */
export const ON_ROUTE_DETOUR_MIN = 0.5

/** How a detour reads on every surface: unknown, On route, or whole extra minutes. */
export type DetourDisplay =
  | { kind: 'unknown' }
  | { kind: 'on-route' }
  | { kind: 'extra'; minutes: number }

/**
 * Null, undefined and non-finite values are unknown. A value at or below
 * `ON_ROUTE_DETOUR_MIN` is On route, so a model zero and a 0.2 minute detour read
 * the same. Above it, minutes are rounded. Rows, cards and the Timeline call this.
 */
export function detourDisplay(detourMin: number | null | undefined): DetourDisplay {
  if (detourMin == null || !Number.isFinite(detourMin)) return { kind: 'unknown' }
  if (detourMin <= ON_ROUTE_DETOUR_MIN) return { kind: 'on-route' }
  return { kind: 'extra', minutes: Math.round(detourMin) }
}

/** The short card text for `detourDisplay`: "Unknown", "On route" or "+N min". */
export function detourDisplayText(detourMin: number | null | undefined): string {
  const display = detourDisplay(detourMin)
  if (display.kind === 'unknown') return 'Unknown'
  return display.kind === 'on-route' ? 'On route' : `+${display.minutes} min`
}
