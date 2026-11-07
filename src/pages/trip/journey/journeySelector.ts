// ============ One per-hook journey selector (#08 R1, F6) ============
// The hook owns one selector closure. It keeps the previous model privately and
// reuses it only when the trip id, committed trip id and identity generation all
// match. Every fact is still derived from the CURRENT explicit inputs; the
// closure affects structural reuse only and never returns stale data.
//
// F6: `select` is read-only. It runs in render and does not change the cache.
// `commit` runs in an effect after React commits.
import {
  buildJourneyDays,
  type JourneyDays,
  type JourneyDaysInput,
} from './journeyDays'

export type JourneySelectorInput = JourneyDaysInput & { identityGeneration: number }

/** One render-time selection. Read-only until it is committed. */
export interface JourneySelection {
  readonly model: JourneyDays
  /** The reuse key of the inputs that produced `model`. */
  readonly key: string
}

export interface JourneySelector {
  /** Build from the committed cache without changing it. Safe in render. */
  select(input: JourneySelectorInput): JourneySelection
  /** Make a selection the cache base. Call after React commits, not in render. */
  commit(selection: JourneySelection): void
}

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
  return {
    select(input) {
      const nextKey = reuseKey(input)
      const prev = previous && key === nextKey ? previous : null
      return { model: buildJourneyDays({ ...input, prev }), key: nextKey }
    },
    commit(selection) {
      previous = selection.model
      key = selection.key
    },
  }
}
