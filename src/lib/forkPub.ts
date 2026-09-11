// ============ Fork a published itinerary (shared by Explore, the public page
// and the creator page — one login gate, one premium rule, one toast) ============
import type { PublishedItinerary } from '../data/types'
import { tripById, duplicateTripPersisted, duplicateTripPublicPersisted, registerPubCopy, fetchSharedTrip } from '../store/store'
import { toast } from '../components/ui'

/** Fork `pub` into the viewer's trips. Login-gated; publications with days
 *  outside the free preview fork premium-respectfully (locked days arrive as
 *  stubs). Returns false when the underlying trip vanished, the viewer must
 *  log in first (navigation already handled), or the rows failed to persist —
 *  in which case no half-saved fork is left behind to vanish on the next
 *  reload. */
export async function forkPublication(pub: PublishedItinerary, meId: string | null, onNavigate: (r: string) => void): Promise<boolean> {
  if (!meId) { toast('Log in to fork this trip into your plans.'); onNavigate('/auth'); return false }
  // The membership-scoped hydration only caches the user's OWN trips, so from
  // the Explore grid a foreign publication is never in the cache — fetch it
  // (it's public by definition; that's why it's listed).
  const src = tripById(pub.tripId) ?? await fetchSharedTrip(pub.tripId)
  if (!src) { toast('That itinerary is no longer available.', 'err'); return false }
  const hasLockedDays = src.days.some(d => !pub.freeDayIndexes.includes(d.index))
  const { persisted } = hasLockedDays
    ? await duplicateTripPublicPersisted(src, meId, pub.freeDayIndexes)
    : await duplicateTripPersisted(src, meId)
  if (!persisted) {
    toast('Could not save the forked trip — check your connection and try again.', 'err')
    return false
  }
  registerPubCopy(pub.id)
  toast(`“${pub.title}” forked to My trips ✈️`)
  onNavigate('/trips')
  return true
}
