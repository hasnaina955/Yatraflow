// ============ The thin workspace journey hook (#08 S3/R1) ============
// The pure producer lives in journeyDays.ts. This hook does only the memo work a
// React tree needs: capture the manual read-adapter output once per day, run the
// one per-hook selector for day-object/card reuse, read the DNA hints, and
// memoize the model. It starts no scan, calls no provider and owns no cache
// (#842 stays separate). Render stays pure: the selector only selects here, and
// an effect commits that selection after React commits.
import { useEffect, useMemo } from 'react'
import type { Trip, TripDecision } from '../../../data/types'
import type { LegEstimate } from '../../../lib/engine'
import type { PlaceHit } from '../../../lib/providers/hits'
import type { PlaceIdentity } from '../../../lib/placeIdentity'
import type { DnaVector } from '../../../lib/tripDna'
import type { CorridorSnapshot } from '../map/corridorSnapshot'
import { mapManualSlotStore } from '../map/manualSlotContexts'
import { readManualPicksForDay, type ManualPicksForDay } from '../map/manualPicks'
import { dayDetourBudgetForDay } from '../../../lib/detourBudget'
import { readDnaSlotHints } from '../map/useDaySlots'
import { createJourneySelector, type JourneySelectorInput } from './journeySelector'
import type { JourneyNetAddedRoad, WorkspaceJourneyDays } from './journeyDays'

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
  /** Store identity generation: a user/session change clears structural reuse. */
  readonly identityGeneration: number
  /**
   * The measured road the Map's writer and the preview already use. Null when no
   * measurement backs this trip, which keeps every `netAddedMin` null.
   */
  readonly netAddedRoad?: JourneyNetAddedRoad | null
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
      budgetMin: dayDetourBudgetForDay(trip, day.index),
    }))
  }
  return out
}

export function useJourneyDays(input: UseJourneyDaysInput): WorkspaceJourneyDays {
  // One selector per identity generation. Its private closure holds the previous
  // model; a trip/user change replaces it, so no cross-identity reuse leaks.
  const selector = useMemo(() => {
    void input.identityGeneration
    return createJourneySelector()
  }, [input.identityGeneration])
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
  const selection = useMemo(() => {
    const modelInput: JourneySelectorInput = {
      trip: input.trip,
      committedTrip: input.committedTrip ?? input.trip,
      snapshot: input.snapshot,
      presence: input.presence,
      editable: input.editable,
      decisions: input.decisions,
      dnaVector: input.dnaVector,
      legCorrections: input.legCorrections,
      manualPicksByDay,
      identityGeneration: input.identityGeneration,
      ...(input.netAddedRoad !== undefined ? { netAddedRoad: input.netAddedRoad } : {}),
    }
    return selector.select(modelInput)
  }, [
    selector,
    input.trip,
    input.committedTrip,
    input.snapshot,
    input.presence,
    input.editable,
    input.decisions,
    input.dnaVector,
    input.legCorrections,
    manualPicksByDay,
    input.identityGeneration,
    input.netAddedRoad,
  ])
  // Commit after React commits. An uncommitted selection does not move the cache.
  useEffect(() => {
    selector.commit(selection)
  }, [selector, selection])
  const dnaSlotHints = useMemo(() => readDnaSlotHints(input.dnaTick), [input.dnaTick])
  return { ...selection.model, dnaSlotHints }
}
