/**
 * #420, slice 17 — the slot filing writer as a hook.
 *
 * Filing a found place into its day-part lived as a closure in `MapTab`.
 * It is a hook now. Behaviour is unchanged except for one #841 repair: a pick
 * is filed under trip + persisted day + slot, never under the bare slot key.
 * A lunch filed on Day 2 stays on Day 2 after a switch to Day 3 and
 * back, and a late response cannot file into a different day.
 *
 * What this hook owns: filing a found place into THIS slot as a candidate
 * (never straight into the plan — Fill stays the second, explicit act)
 * under the #179 guards. What it does not own: the query state, the manual
 * picks, the open part, or the slot runner — those stay in the page. The
 * runner keeps its quota-mapped catch in the page: moving it (or the cells
 * it writes) into this hook trips the render compiler with a file-wide
 * bail, so the split is deliberate — writer moves, runner stays. The
 * candidate merge stays a thin page local for the same reason: four render
 * sites call `slotCands` during render (rule 6ad).
 *
 * #841 adds the stable context. The hook reads and writes picks ONLY through
 * `manualSlotContexts`, so the writer hook, the rows and the refusal below see
 * one list. The page's `slotManual` bucket is no longer read for membership and
 * no longer written under the bare slot key: `setSlotManual` only tells the page
 * to render again. A filing is refused when the search it came from belongs to
 * another day or part (`isSearchCurrent`), and it clears only that search.
 */
import type { Dispatch, SetStateAction } from 'react'
import { toast } from '../../../components/ui'
import type { DaySlot } from '../../../lib/daySlots'
import type { PlaceHit } from '../../../lib/geocode'
import { isAlreadyAdded, type PlaceIdentity } from '../../../lib/placeIdentity'
import { slotFileRefusal } from './slotFiling'
import {
  manualContextForSlot,
  mapManualSlotStore,
  type ManualSlotStore,
  type SlotSearchContext,
} from './manualSlotContexts'

/** The open part's own search: keyed to the slot it was typed in. */
export type SlotSearchState = {
  key: string
  q: string
  busy: boolean
  hits: PlaceHit[]
  err: string | null
}

/** Every page value the filing writer reads. */
export type UseSlotSearchDeps = {
  /** Retired as a source of picks (#841). Kept so the page's call shape holds;
   *  the hook never reads it. */
  slotManual?: Record<string, PlaceHit[]>
  /** A re-render notification after a filing. It writes no pick. */
  setSlotManual: Dispatch<SetStateAction<Record<string, PlaceHit[]>>>
  /** The slot-keyed query state — owned by the page. */
  setSlotSearch: Dispatch<SetStateAction<SlotSearchState | null>>
  /** The shared presence identity — one answer to "is this already mine?" */
  identity: PlaceIdentity
  /** The workspace's stable pick store. Defaults to the shared map store. */
  store?: ManualSlotStore
  /** True while the page's search state for this slot belongs to the CURRENT
   *  trip and day. A filing from any other search is refused, and a refused or
   *  filed pick never clears another day's query. */
  isSearchCurrent?: (slotKey: string) => boolean
}

/** The refusal a filing speaks when its search belongs to another day or part. */
export const STALE_SEARCH_REFUSAL =
  'Search · Different day · Search this part again'

/** The refusal a slot without a stable day speaks. Never a guessed day. */
export const MANUAL_SLOT_REFUSAL =
  'Day · Not ready · Reload trip'

export function useSlotSearch({
  setSlotManual,
  setSlotSearch,
  identity,
  store = mapManualSlotStore,
  isSearchCurrent,
}: UseSlotSearchDeps): {
  addManualCandidate: (slot: DaySlot, h: PlaceHit) => void
  /** The stable context the slot files under, or null when it has none. */
  searchContext: (slot: DaySlot) => SlotSearchContext | null
} {
  /** File a found place into THIS slot as a candidate (never straight into
   *  the plan — Fill stays the second, explicit act) under the #179 guards. */
  function addManualCandidate(slot: DaySlot, h: PlaceHit) {
    const context = manualContextForSlot(slot)
    if (!context) {
      toast(MANUAL_SLOT_REFUSAL, 'err')
      return
    }
    if (isSearchCurrent && !isSearchCurrent(slot.key)) {
      toast(STALE_SEARCH_REFUSAL, 'err')
      return
    }
    // #420 slice 5: the two refusals (and their copy) live in ./slotFiling,
    // checked in the order the user meets them. #841: only the stable store
    // supplies the manual picks, so a Day A pick can no longer block or
    // duplicate a Day B filing, and no bare-key bucket can leak one in.
    const refusal = slotFileRefusal({
      hit: h,
      slotLabel: slot.label,
      manual: store.picksFor(context),
      candidates: slot.candidates,
      isAdded: x => isAlreadyAdded(x, identity),
    })
    if (refusal) {
      toast(refusal.message)
      return
    }
    store.file(context, h)
    // Render notification only: the pick itself lives in the stable store.
    setSlotManual(prev => ({ ...prev }))
    setSlotSearch(s => (s && s.key === slot.key ? { ...s, q: '', hits: [], err: null } : s))
    toast(`"${h.name}" · ${slot.label} candidate added`)
  }

  function searchContext(slot: DaySlot): SlotSearchContext | null {
    return manualContextForSlot(slot)
  }

  return {
    addManualCandidate,
    searchContext,
  }
}
