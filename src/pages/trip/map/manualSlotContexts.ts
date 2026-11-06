// ============ Day-scoped manual picks and search contexts (#841) ============
//
// A manual pick filed into "Lunch" used to live under the bare slot key
// (`slotManual['lunch']`), so the same lunch appeared on every day and a late
// search response could file into whichever day happened to be active when it
// landed. The stable key is trip + persisted day + slot; this module owns that
// key, the pick buckets and the search-response guard.
//
// React-free on purpose: `useSlotSearch` writes through it, `useMapWriters`
// reads it to build the effective DayPlan, and the tests drive both through
// these functions. MapTab's existing `slotManual` state stays until its own
// wiring lease; the controller is the source of truth for the writers.
import type { DaySlot } from '../../../lib/daySlots'
import type { SlotCandidate } from '../../../lib/daySlots'
import type { PlaceHit } from '../../../lib/providers/hits'
import { isSameEntity } from '../../../lib/placeIdentity'
import { manualCandidateFor } from './slotFiling'

/** The stable identity of one manual filing target. */
export interface ManualSlotContext {
  tripId: string
  dayId: string
  slotKey: string
}

/** The context a derived slot carries, or null when it has no stable day. */
export function manualContextForSlot(slot: Pick<DaySlot, 'key' | 'ref'>): ManualSlotContext | null {
  if (!slot.ref) return null
  return { tripId: slot.ref.tripId, dayId: slot.ref.dayId, slotKey: slot.key }
}

export function manualSlotContextKey(context: ManualSlotContext): string {
  return `${context.tripId}\u0000${context.dayId}\u0000${context.slotKey}`
}

export type ManualFileOutcome = 'filed' | 'duplicate'

export interface ManualSlotStore {
  /** File a pick under its stable context. A repeat of the same entity is a
   *  no-op, so the same place cannot enter one slot twice. */
  file: (context: ManualSlotContext, hit: PlaceHit) => ManualFileOutcome
  picksFor: (context: ManualSlotContext) => readonly PlaceHit[]
  /** The legacy page bucket is accepted for placement only while the last pick
   *  filed through this store for that slot key came from the SAME day. The
   *  page's `slotManual` has no day of its own, so an unbound bucket is never
   *  promoted onto a day. */
  legacyPicksFor: (slotKey: string, context: Pick<ManualSlotContext, 'tripId' | 'dayId'>) => readonly PlaceHit[]
  /** Remove exactly the places a verified placement landed. A skipped or
   *  unresolved place stays, because the user still needs it. */
  dropPlaced: (context: ManualSlotContext, hits: readonly PlaceHit[]) => readonly PlaceHit[]
  /** The per-slot map `buildDayPlan` takes, for one stable day only. */
  candidatesBySlot: (context: Pick<ManualSlotContext, 'tripId' | 'dayId'>, shapes: {
    detourMin?: (hit: PlaceHit) => number | null
    detourKm?: (hit: PlaceHit) => number | null
  }) => Record<string, SlotCandidate[]>
  clear: () => void
  size: () => number
}

export function createManualSlotStore(): ManualSlotStore {
  const buckets = new Map<string, PlaceHit[]>()
  /** The day each bare slot key was last filed under, from the legacy page
   *  bucket's point of view. It keeps a Day A bucket from appearing on Day B. */
  const legacyDays = new Map<string, Pick<ManualSlotContext, 'tripId' | 'dayId'>>()
  return {
    file: (context, hit) => {
      const key = manualSlotContextKey(context)
      const picks = buckets.get(key) ?? []
      legacyDays.set(context.slotKey, { tripId: context.tripId, dayId: context.dayId })
      if (picks.some(candidate => isSameEntity(candidate, hit))) return 'duplicate'
      buckets.set(key, [...picks, hit])
      return 'filed'
    },
    picksFor: context => buckets.get(manualSlotContextKey(context)) ?? [],
    legacyPicksFor: (slotKey, context) => {
      const bound = legacyDays.get(slotKey)
      return bound && bound.tripId === context.tripId && bound.dayId === context.dayId
        ? buckets.get(manualSlotContextKey({ ...context, slotKey })) ?? []
        : []
    },
    dropPlaced: (context, hits) => {
      const key = manualSlotContextKey(context)
      const picks = buckets.get(key) ?? []
      const kept = picks.filter(pick => !hits.some(hit => isSameEntity(pick, hit)))
      if (kept.length === 0) buckets.delete(key)
      else buckets.set(key, kept)
      return kept
    },
    candidatesBySlot: (context, shapes) => {
      const prefix = `${context.tripId}\u0000${context.dayId}\u0000`
      const out: Record<string, SlotCandidate[]> = {}
      for (const [key, picks] of buckets) {
        if (!key.startsWith(prefix)) continue
        const slotKey = key.slice(prefix.length)
        out[slotKey] = picks.map(hit => manualCandidateFor({
          hit,
          detourMin: shapes.detourMin?.(hit) ?? null,
          detourKm: shapes.detourKm?.(hit) ?? null,
          // A manual row is not a budget spend and has no measured detour here;
          // the rail keeps its own numbers. 1 / 100 is the explicit "unknown"
          // pair the manual candidate shape already documents.
          budgetMin: 1,
          sharePct: () => 100,
        }))
      }
      return out
    },
    clear: () => { buckets.clear() },
    size: () => [...buckets.values()].reduce((sum, picks) => sum + picks.length, 0),
  }
}

/** One store for the map workspace, so the filing hook and the writer hook see
 *  the same manual picks before MapTab's state is re-wired. */
export const mapManualSlotStore: ManualSlotStore = createManualSlotStore()

/** The search context a slot search was typed in. */
export interface SlotSearchContext {
  tripId: string
  dayId: string
  slotKey: string
}

export function searchContextForSlot(slot: Pick<DaySlot, 'key' | 'ref'>): SlotSearchContext | null {
  const context = manualContextForSlot(slot)
  return context ? { ...context } : null
}

export function sameSearchContext(a: SlotSearchContext | null, b: SlotSearchContext | null): boolean {
  if (!a || !b) return a === b
  return a.tripId === b.tripId && a.dayId === b.dayId && a.slotKey === b.slotKey
}

export interface SlotSearchGuard {
  /** A new query in a context. Its sequence number is the response's ticket. */
  begin: (context: SlotSearchContext) => number
  /** True only when the response still belongs to the CURRENT context and the
   *  newest query in it. A response from another day or slot is ignored. */
  isCurrent: (context: SlotSearchContext, sequence: number) => boolean
  current: () => { context: SlotSearchContext; sequence: number } | null
  reset: () => void
}

/** A late response guard bound to the context it was typed in. MapTab's runner
 *  can adopt it without moving its quota-mapped catch; until then the filing
 *  hook uses the same rule through `manualContextForSlot`. */
export function createSlotSearchGuard(): SlotSearchGuard {
  let current: { context: SlotSearchContext; sequence: number } | null = null
  let next = 1
  return {
    begin: context => {
      const sequence = next
      next += 1
      current = { context, sequence }
      return sequence
    },
    isCurrent: (context, sequence) => !!current
      && current.sequence === sequence
      && sameSearchContext(current.context, context),
    current: () => (current ? { context: { ...current.context }, sequence: current.sequence } : null),
    reset: () => { current = null },
  }
}
