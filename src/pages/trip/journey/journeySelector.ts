// ============ One per-hook journey selector (#08 R1) ============
// The hook owns one selector closure. It keeps the previous model privately and
// reuses it only when the trip id, committed trip id and identity generation all
// match. Every fact is still derived from the CURRENT explicit inputs; the
// closure affects structural reuse only and never returns stale data.
import {
  buildJourneyDays,
  type JourneyDays,
  type JourneyDaysInput,
} from './journeyDays'

export type JourneySelectorInput = JourneyDaysInput & { identityGeneration: number }

export type JourneySelector = (input: JourneySelectorInput) => JourneyDays

function reuseKey(input: JourneySelectorInput): string {
  return [
    input.trip?.id ?? '',
    (input.committedTrip ?? input.trip)?.id ?? '',
    String(input.identityGeneration),
  ].join('\u0000')
}

export function createJourneySelector(): JourneySelector {
  let previous: JourneyDays | null = null
  let key: string | null = null
  return input => {
    const nextKey = reuseKey(input)
    const prev = previous && key === nextKey ? previous : null
    const next = buildJourneyDays({ ...input, prev })
    previous = next
    key = nextKey
    return next
  }
}
