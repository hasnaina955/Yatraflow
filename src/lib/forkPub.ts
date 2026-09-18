// ============ Fork a published itinerary (shared by Explore, the public page
// and the creator page — one login gate, one premium rule, one toast) ============
import type { PublishedItinerary, Trip } from '../data/types'
import { tripById, duplicateTripPersisted, duplicateTripPublicPersisted, registerPubCopy, fetchPublicTrip } from '../store/store'
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

/** Fork `pub` into the viewer's trips. Login-gated. The days forked are
 *  EXACTLY what the server served this viewer's session: fetchPublicTrip
 *  reads through get_public_trip, which already returned real days for the
 *  creator / an entitled buyer and wire-stubbed locked days for everyone
 *  else. The client-side re-stub below is defense-in-depth on top — a fork
 *  can never contain more than the server showed, no matter what a stale
 *  cache or a tampered client does. Returns false when the underlying trip
 *  vanished, the viewer must log in first (navigation already handled), or
 *  the rows failed to persist — in which case no half-saved fork is left
 *  behind to vanish on the next reload. */
export async function forkPublication(pub: PublishedItinerary, meId: string | null, onNavigate: (r: string) => void, _unlockedPresentationOnly = false): Promise<boolean> {
  if (!meId) { toast('Log in to fork this trip into your plans.'); onNavigate('/auth'); return false }
  // Read through the paywall RPC, not the raw table. A creator/buyer session
  // gets the real trip back from the same call a visitor makes — the server
  // compared auth.uid() against the entitlement rows, not this client.
  // (tripById's cache hit is still honored first: the owner's own workspace
  // row is their own data, and re-fetching would be pure waste.)
  const src = tripById(pub.tripId) ?? await fetchPublicTrip(pub.id)
  // `fetchPublicTrip` returns null for a deleted row AND for a failed read, so
  // this cannot claim the trip is gone — only that it did not load.
  if (!src) { toast('Couldn’t load that itinerary — it may be unpublished now, or the connection dropped.', 'err'); return false }
  const safe = restubLockedDays(src, pub.freeDayIndexes)
  const hasLockedDays = src.days.some(d => !pub.freeDayIndexes.includes(d.index))
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
