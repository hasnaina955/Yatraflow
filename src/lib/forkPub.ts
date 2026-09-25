// ============ Fork a published itinerary (shared by Explore, the public page
// and the creator page — one login gate, one premium rule, one toast) ============
import type { PublishedItinerary, Trip } from '../data/types'
import { tripById, duplicateTripPersisted, duplicateTripPublicPersisted, registerPubCopy, fetchPublicTrip } from '../store/store'
import { fetchMyEntitlements } from './unlock'
import { hasUnlock } from './payments'
import { toast } from '../components/ui'

const LOCKED_STOP_DESCRIPTION = 'Locked — the full plan is on the original itinerary.'

/** Defense-in-depth stub: re-applies the locked-day stub to days NOT in the
 *  publication's free list, EVEN IF the session's copy somehow carries real
 *  content. The server (get_public_trip) already stubs at the wire; this
 *  mirrors it so a stale cached row or a missed RLS update can never turn
 *  into a fork of paid content. Same field shape as buildTripCopy. */
function restubLockedDays(src: Trip, freeDayIndexes: number[]): Trip {
  const free = new Set(freeDayIndexes)
  return {
    ...src,
    days: src.days.map(d => free.has(d.index) ? d : {
      ...d,
      stops: d.stops.map(s => ({
        ...s,
        description: LOCKED_STOP_DESCRIPTION,
        notes: '',
        openTime: undefined,
        closeTime: undefined,
        departTime: undefined,
        arrivalTime: undefined,
        sourceUrl: undefined,
        placeId: undefined,
        entryFeeInrPerPerson: 0,
        transportCostInrTotal: 0,
        status: 'confirmed' as const,
      })),
    }),
  }
}

/** Whether the SERVER withheld content for a day this publication locks.
 *  get_public_trip leaves its notice on every stop of a day it stubs, so one
 *  notice is proof the row came back locked. 
 *
 *  A locked day with NO stops reads as not-stubbed here, and that direction is
 *  deliberate: this only ever widens days for a viewer whose entitlement the
 *  server itself confirmed (see forkPublication), where the alternative is
 *  handing a paying buyer an empty day. An unentitled viewer never reaches it. */
export function wireWithheld(src: Trip, freeDayIndexes: number[]): boolean {
  const free = new Set(freeDayIndexes)
  return src.days.some(d => !free.has(d.index)
    && d.stops.some(s => s.description === LOCKED_STOP_DESCRIPTION))
}

/** Fork `pub` into the viewer's trips. Login-gated. The days forked are
 *  EXACTLY what the server served this viewer's session: fetchPublicTrip
 *  reads through get_public_trip, which already returned real days for the
 *  creator / an entitled buyer and wire-stubbed locked days for everyone
 *  else. Returns false when the underlying trip vanished, the viewer must log
 *  in first (navigation already handled), or the rows failed to persist — in
 *  which case no half-saved fork is left behind to vanish on the next reload.
 *
 *  #349 — the entitlement is asked for, never assumed from a cache hit. Two
 *  things used to strand a paying buyer on placeholders: `tripById(pub.tripId)`
 *  was preferred over the RPC, so a pre-purchase stub in the cache won the read,
 *  and the re-stub below ran unconditionally, so even a correctly-served real
 *  trip was re-locked on the way into the copy. Now the wire is read first (a
 *  cache hit is not evidence of anything about entitlement), and the re-stub is
 *  skipped only when the server confirms the entitlement AND the row it served
 *  contradicts the stub — one decision, both inputs from the server.
 *
 *  `unlockedPresentationOnly` is the page's already-read presentation flag: a
 *  TRUE short-circuits the entitlement read, and anything else (false, or a
 *  caller that passes nothing) triggers a fresh read of this session's own rows.
 *  A negative is never trusted, because the page's flag is `false` while that
 *  read is still in flight — which is exactly when a buyer who has just paid
 *  clicks Fork. */
export async function forkPublication(pub: PublishedItinerary, meId: string | null, onNavigate: (r: string) => void, unlockedPresentationOnly?: boolean): Promise<boolean> {
  if (!meId) { toast('Log in to fork this trip into your plans.'); onNavigate('/auth'); return false }
  // Read through the paywall RPC, not the raw table. A creator/buyer session
  // gets the real trip back from the same call a visitor makes — the server
  // compared auth.uid() against the entitlement rows, not this client.
  const wireRow = await fetchPublicTrip(pub.id)
  // The cache is only a fallback for a FAILED read (the RPC returns null for a
  // deleted row and for a dropped connection alike), and whatever comes from it
  // is re-stubbed below: a row that did not come off the wire is not evidence
  // about anything.
  const src = wireRow ?? tripById(pub.tripId)
  if (!src) { toast('Couldn’t load that itinerary — it may be unpublished now, or the connection dropped.', 'err'); return false }
  const entitled = unlockedPresentationOnly === true
    || hasUnlock(await fetchMyEntitlements(meId), meId, pub.id, pub.creatorId)
  // Fail closed: any doubt (no wire row, a wire row the server stubbed, no
  // entitlement) forks the locked shape. Nothing a client can say widens this —
  // the wire already decided what content exists.
  const unlockedFork = entitled && wireRow !== null && !wireWithheld(src, pub.freeDayIndexes)
  const safe = unlockedFork ? src : restubLockedDays(src, pub.freeDayIndexes)
  // Days the publication withholds that are still stubbed in the copy: the
  // public persist path drops the expenses and fixed commitments that ride on
  // them (get_public_trip stubs stop CONTENT at the wire and leaves those to
  // the copy, see the migration's note). A buyer's full fork takes the plain
  // path, because none of it is being withheld from them.
  const hasLockedDays = !unlockedFork && src.days.some(d => !pub.freeDayIndexes.includes(d.index))
  const { persisted } = hasLockedDays
    ? await duplicateTripPublicPersisted(safe, meId, pub.freeDayIndexes)
    : await duplicateTripPersisted(safe, meId)
  if (!persisted) {
    toast('Could not save the forked trip — check your connection and try again.', 'err')
    return false
  }
  registerPubCopy(pub.id)
  toast(`“${pub.title}” forked to My trips ✈️`)
  onNavigate('/trips')
  return true
}
