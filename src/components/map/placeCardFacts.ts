// Pure facts for the place card: photo keys, attribution, data age and coverage.
// Each helper returns null for an unknown fact, so the card shows nothing then.
import type { DiscoveryCoverage, PlacePhotoRef } from '../../lib/providers/hits'

/** The next photo index for a key. Null for any key that is not navigation, or for one photo. */
export function photoStep(index: number, count: number, key: string): number | null {
  if (count < 2) return null
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/** The credit line. The link is kept only when it is https, so a bad value is plain text. */
export function attributionOf(ref: Pick<PlacePhotoRef, 'attribution'>): { text: string; href: string | null } {
  const uri = ref.attribution.authorUri
  return { text: ref.attribution.text, href: uri != null && /^https:\/\//i.test(uri) ? uri : null }
}

/** How old the row's data is, from its own fetch time. Unknown or future times say nothing. */
export function ageText(fetchedAt: number | null | undefined, now: number): string | null {
  if (fetchedAt == null || !Number.isFinite(fetchedAt) || fetchedAt > now) return null
  const min = Math.floor((now - fetchedAt) / 60_000)
  if (min < 1) return 'Checked just now'
  if (min < 60) return `Checked ${min} min ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `Checked ${hours} h ago`
  const days = Math.floor(hours / 24)
  return `Checked ${days} day${days === 1 ? '' : 's'} ago`
}

/** What the search covered. Reach that was not measured says nothing. */
export function coverageText(coverage: DiscoveryCoverage | null | undefined): string | null {
  if (!coverage) return null
  if (coverage.complete) return 'Whole road searched'
  const { coveredKm, totalKm } = coverage
  if (coveredKm == null || totalKm == null || !Number.isFinite(coveredKm) || !Number.isFinite(totalKm)) return null
  return `Searched ${Math.round(coveredKm)} of ${Math.round(totalKm)} km of the road`
}
