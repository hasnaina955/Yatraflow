import { CoverMedia } from './CoverMedia'
import { coverPlanFor } from '../lib/regionArt'
import { regionFor } from '../lib/tripsPage'
import { sizedCoverUrl } from '../lib/tripThumb'

/**
 * Cover thumbnail for trip / itinerary cards. Resolution order is the shared
 * one: the owner's explicit URL, then the generated scene for the trip's own
 * places, then the emoji — which appears only when every image is gone.
 *
 * `variant="wide"` mirrors the Explore card (16/9); `variant="short"` the
 * Trips list card (16/7). `routeLabel` overlays the start → end caption.
 *
 * `trip` supplies the destination and start evidence that picks the scene, and
 * its name seeds the variant choice. A caller with no trip passes only a query,
 * and the neutral scene answers — never a photo of a name it guessed.
 */
export function CoverThumb({
  query, explicitUrl, emoji = '🧭', variant = 'wide', routeLabel,
  trip,
}: {
  query?: string | null
  /** Destination and start evidence for the scene, plus the seed. */
  trip?: { name: string; startLocation?: string; destinations?: string[] } | null
  explicitUrl?: string | null
  emoji?: string
  variant?: 'wide' | 'short'
  routeLabel?: string
}) {
  const destinations = trip?.destinations ?? (query ? [query] : [])
  // An explicit cover can be a Wikimedia upload stored before sizing existed
  // (a live publication shipped its 1,305 KB original as a card background).
  // Sizing is idempotent and leaves a non-Wikimedia URL untouched, so a cover
  // the owner pasted is still displayed exactly as given.
  const userCover = explicitUrl ? sizedCoverUrl(explicitUrl) : ''
  const plan = coverPlanFor({
    userCover,
    fallbackEmoji: emoji,
    region: regionFor({ destinations }),
    seed: trip?.name ?? destinations[0] ?? '',
    placeCount: destinations.length,
    destinations,
    startLocation: trip?.startLocation,
  })
  const cls = variant === 'short' ? 'itin-emoji' : 'itin-cover'
  return (
    <div className={cls}>
      {routeLabel && <span className="itin-cover-route">{routeLabel}</span>}
      <CoverMedia
        plan={plan}
        ratio={variant === 'short' ? '16:7' : '16:9'}
        sizes="(min-width: 900px) 360px, (min-width: 600px) 300px, 92vw"
        className="itin-cover-img"
        emojiClassName="itin-cover-fallback"
      />
    </div>
  )
}
