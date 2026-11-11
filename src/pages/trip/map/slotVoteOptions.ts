// ============ Slot vote option ids and the poll request (#841) ============
//
// The rail has minted `slot:<kind>:<hit>` since polls shipped. Stored ballots
// point at those ids, so the spelling cannot change. This module keeps it and
// adds the two facts the day-scoped join needs:
//
//  - every option carries the option's own `place.dayId` when the caller knows
//    it, so a reordered day still binds its poll; an unknown day stays absent
//    and the poll is reported as unbound rather than guessed onto Day 1;
//  - two DIFFERENT provider entities that happen to share a raw hit id get a
//    collision-safe suffix inside the same prefix (`slot:lunch:7~2`). Existing
//    stored ids are never rewritten, and the store's own collision minting is
//    no longer the only guard.
//
// This is client-side poll creation only. No server vote transition, no SQL and
// no resolution path is touched.
import type { DecisionOption, DecisionPlacePayload, NewDecisionOption, PlaceProvider } from '../../../data/types'
import type { PlaceHit } from '../../../lib/providers/hits'
import { isSameEntity } from '../../../lib/placeIdentity'
import type { SlotKey } from '../../../lib/daySlots'

/** The legacy prefix the day grammar parses. */
export function slotOptionPrefix(slotKey: SlotKey | string): string {
  return `slot:${slotKey}:`
}

/**
 * The id for one option. The first choice keeps the legacy id byte for byte;
 * a later entity that shares the raw id receives `~2`, `~3`, and so on inside
 * the same prefix, so the kind join still succeeds and one vote cannot count
 * for two places.
 */
export function slotVoteOptionId(input: {
  slotKey: SlotKey | string
  hit: Pick<PlaceHit, 'id'>
  taken: ReadonlySet<string> | readonly string[]
}): string {
  const taken = input.taken instanceof Set ? input.taken : new Set(input.taken)
  const base = `${slotOptionPrefix(input.slotKey)}${String(input.hit.id)}`
  if (!taken.has(base)) return base
  let suffix = 2
  while (taken.has(`${base}~${suffix}`)) suffix += 1
  return `${base}~${suffix}`
}

/** One new poll option: the id comes from `slotVoteOptionId`, the label and the
 *  impact are display data, and the place is the payload the resolver reads. */
export function buildSlotVoteOption(input: {
  slotKey: SlotKey | string
  hit: PlaceHit
  detourMin: number | null
  place: DecisionPlacePayload
  taken: ReadonlySet<string>
}): NewDecisionOption {
  const id = slotVoteOptionId({ slotKey: input.slotKey, hit: input.hit, taken: input.taken })
  return {
    id,
    label: input.hit.name,
    ...(input.detourMin == null ? {} : { timeImpactMin: Math.round(input.detourMin) || undefined }),
    place: input.place,
  }
}

export type SlotVoteRequest =
  | {
    ok: true
    request: { question: string; context: string; options: NewDecisionOption[] }
    /** Places dropped because an earlier option named the same entity. */
    droppedDuplicates: number
  }
  | { ok: false; reason: 'too-few-options'; options: NewDecisionOption[] }

function optionIdentity(option: NewDecisionOption): {
  title: string
  lat?: number
  lng?: number
  placeId?: string
  eLoc?: string
  source?: PlaceProvider
} {
  const place = option.place
  return {
    title: place?.title ?? option.label,
    ...(place ? { lat: place.lat, lng: place.lng } : {}),
    ...(place?.place?.placeId ? { placeId: place.place.placeId } : {}),
    ...(place?.place?.eLoc ? { eLoc: place.place.eLoc } : {}),
    ...(place?.place?.source ? { source: place.place.source } : {}),
  }
}

/**
 * Compose the poll `addDecision` receives. A vote needs at least two distinct
 * places; a manual-only pair is valid because the caller passes the effective
 * list, not the engine-only slice. An option id duplicated by the caller is
 * suffixed inside its own prefix, never replaced with a minted id that would
 * drop out of the slot join.
 */
export function createSlotVoteRequest(input: {
  question: string
  context: string
  options: readonly NewDecisionOption[]
}): SlotVoteRequest {
  const unique: NewDecisionOption[] = []
  let droppedDuplicates = 0
  for (const option of input.options) {
    if (unique.some(existing => isSameEntity(optionIdentity(existing), optionIdentity(option)))) {
      droppedDuplicates += 1
      continue
    }
    unique.push(option)
  }
  const taken = new Set<string>()
  const options = unique.map(option => {
    const id = typeof option.id === 'string' && option.id.length > 0
      ? option.id
      : `o:${String(option.label)}`
    if (!taken.has(id)) {
      taken.add(id)
      return { ...option, id }
    }
    let suffix = 2
    while (taken.has(`${id}~${suffix}`)) suffix += 1
    const next = `${id}~${suffix}`
    taken.add(next)
    return { ...option, id: next }
  })
  if (options.length < 2) return { ok: false, reason: 'too-few-options', options }
  return {
    ok: true,
    request: { question: input.question, context: input.context, options },
    droppedDuplicates,
  }
}

/** The option a resolved poll's place payload is compared against. Exported so
 *  a test can prove the displayed choice and the option are one place. */
export function optionHoldsPlace(option: Pick<DecisionOption, 'place'>, hit: PlaceHit): boolean {
  if (!option.place) return false
  return isSameEntity(
    {
      title: option.place.title,
      locationName: option.place.locationName,
      lat: option.place.lat,
      lng: option.place.lng,
      ...(option.place.place ? { place: option.place.place } : {}),
    },
    hit,
  )
}
