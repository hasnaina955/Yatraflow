// ============ The thin workspace journey hook (#08 S3) ============
// The pure producer lives in journeyDays.ts. This hook does only the memo work a
// React tree needs: capture the manual read-adapter output once per day, carry
// the previous model for day-object/card reuse, read the DNA hints, and memoize
// the model. It starts no scan, calls no provider and owns no cache (#842 stays
// separate).
import { useMemo } from 'react'
import type { Trip, TripDecision } from '../../../data/types'
import type { LegEstimate } from '../../../lib/engine'
import type { PlaceHit } from '../../../lib/providers/hits'
import type { PlaceIdentity } from '../../../lib/placeIdentity'
import type { DnaVector } from '../../../lib/tripDna'
import type { CorridorSnapshot } from '../map/corridorSnapshot'
import { mapManualSlotStore } from '../map/manualSlotContexts'
import { readManualPicksForDay, type ManualPicksForDay } from '../map/manualPicks'
import { readDnaSlotHints } from '../map/useDaySlots'
import {
  buildJourneyDays,
  type JourneyDays,
  type WorkspaceJourneyDays,
} from './journeyDays'

export interface UseJourneyDaysInput {
  /** Effective content (preview included). */
  readonly trip: Trip | null
  /** The committed trip. Day ids, refs and context derive from it. */
  readonly committedTrip?: Trip | null
  readonly snapshot: CorridorSnapshot | null
  readonly presence: PlaceIdentity | null
  readonly editable: boolean
  readonly decisions?: readonly TripDecision[]
  readonly dnaVector: DnaVector | null
  readonly legCorrections?: Record<string, LegEstimate>
  /** The lifted bare slot bucket. It carries no day of its own. */
  readonly slotManual: Readonly<Record<string, readonly PlaceHit[]>>
  /** DNA/store memo token; also re-captures the manual store after a drop. */
  readonly dnaTick: number
}

/**
 * Capture every day's manual candidates through the ONE read adapter. The pure
 * builder then merges them; no second manual merge exists.
 */
export function captureManualPicks(
  trip: Trip | null,
  snapshot: CorridorSnapshot | null,
  slotManual: Readonly<Record<string, readonly PlaceHit[]>>,
): ReadonlyMap<number, ManualPicksForDay> {
  const out = new Map<number, ManualPicksForDay>()
  if (!trip || !snapshot) return out
  for (const day of trip.days) {
    out.set(day.index, readManualPicksForDay({
      store: mapManualSlotStore,
      tripId: trip.id,
      dayId: day.id || null,
      slotManual,
      detourMinFor: snapshot.detourMinFor,
      detourKmFor: snapshot.detourKmFor,
    }))
  }
  return out
}

/** Cross-render model cache for day-object/card reuse. Keyed by the trip object,
 *  not React state, so a render does not mutate a state value. */
const journeyCache = new WeakMap<Trip, JourneyDays>()

export function useJourneyDays(input: UseJourneyDaysInput): WorkspaceJourneyDays {
  const manualPicksByDay = useMemo(
    // dnaTick is a real dependency: the store's dropPlaced/placement path bumps
    // it, and the captured candidate lists must follow the store, not only a
    // changed trip/snapshot/slotManual reference.
    () => {
      void input.dnaTick
      return captureManualPicks(input.trip, input.snapshot, input.slotManual)
    },
    [input.trip, input.snapshot, input.slotManual, input.dnaTick],
  )
  const journeyDays = useMemo(() => {
    const previous = input.trip ? journeyCache.get(input.trip) ?? null : null
    const next = buildJourneyDays({
      trip: input.trip,
      committedTrip: input.committedTrip ?? input.trip,
      snapshot: input.snapshot,
      presence: input.presence,
      editable: input.editable,
      decisions: input.decisions,
      dnaVector: input.dnaVector,
      legCorrections: input.legCorrections,
      manualPicksByDay,
      prev: previous,
    })
    if (input.trip) journeyCache.set(input.trip, next)
    return next
  }, [
    input.trip,
    input.committedTrip,
    input.snapshot,
    input.presence,
    input.editable,
    input.decisions,
    input.dnaVector,
    input.legCorrections,
    manualPicksByDay,
  ])
  const dnaSlotHints = useMemo(() => readDnaSlotHints(input.dnaTick), [input.dnaTick])
  return { ...journeyDays, dnaSlotHints }
}
