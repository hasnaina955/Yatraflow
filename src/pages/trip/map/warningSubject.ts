// Which stop a warning is about. One rule for the add preview (W15) and the
// Fix lens (W18): a warning's own words name its stop, so both surfaces agree
// and neither invents a subject from position or order.
//
// A warning that names no stop keeps null. A day-wide warning (short rest,
// hotels) is not tied to a stop by this module.
import type { ItineraryDay } from '../../../data/types'

/** The two engine titles that name their stop outright. */
export const NAMED_WARNING = /^(?:Conflicts with|Thin buffer before)\s+(.+)$/

/** "You reach Periyar boat ~16:37" — the detail's own subject. */
const REACHED = /You reach (.+?) ~\d{1,2}:\d{2}/

/** The subject a warning title names outright, or null. */
export function warningNamedStop(title: string): string | null {
  return title.match(NAMED_WARNING)?.[1]?.trim() ?? null
}

/** The subject a warning detail names, or null. */
export function warningReachedStop(detail: string | null | undefined): string | null {
  if (detail == null || detail.trim() === '') return null
  return REACHED.exec(detail)?.[1]?.trim() ?? null
}

/**
 * The stop a warning is about, in the W15 order: the title's named stop, the
 * detail's reached stop, then a `<stop title>: …` title prefix on that day.
 * A warning that names no stop keeps null.
 */
export function warningSubjectStop(
  warning: { title: string; detail?: string | null },
  day?: Pick<ItineraryDay, 'stops'> | null,
): string | null {
  const named = warningNamedStop(warning.title)
  if (named != null) return named
  const reached = warningReachedStop(warning.detail)
  if (reached != null) return reached
  const titled = day?.stops.find(stop => stop.title.length > 0 && warning.title.startsWith(`${stop.title}: `))?.title ?? null
  return titled ?? null
}
