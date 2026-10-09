// ============ Explore discovery blocks (MR10) ============
// The three public-discovery surfaces the mockup's hub page
// proposed: featured creators, trending itineraries, and the
// share-your-stories call to action. Every claim each block makes
// is derived from the public catalog (lib/discovery.ts), and each
// block returns null until its own evidence exists — a section
// heading over an empty rail would advertise a community that is
// not there.
import { Check, GitFork, MapPin, Sparkles, TrendingUp } from 'lucide-react'
import type { PublishedItinerary, User } from '../data/types'
import { appLink } from '../lib/appLink'
import type { CommunityPlace, CreatorRank } from '../lib/discovery'
import { creatorCardLabel } from '../lib/discovery'
import { editorialRouteCover } from '../lib/editorialAssets'
import { EditorialPhoto } from './EditorialPhoto'
import { Avatar } from './ui'
import { InlineIcon } from './icons'
import { PubCard } from './PubCard'

/** The creator rail's own cap — the mockup drew four. */
const CREATOR_RAIL_CAP = 4

/** One creator in the discovery rail. The whole card is one link
 *  to the creator's public page, so no second link can nest
 *  inside it. Their cover comes only from a live public route,
 *  so a private route can never advertise a public creator. */
function CreatorCard({ rank, index }: { rank: CreatorRank; index: number }) {
  const { user, pubCount, forks } = rank
  const bio = user.profile.creatorBio?.trim() || user.profile.homeCity?.trim()
  const publication = rank.coverPublication
  const cover = publication?.coverImageUrl?.trim() || editorialRouteCover(publication?.routeSummary ?? [])
  return (
    <a className="creator-card trip-enter"
      style={{ animationDelay: `calc(var(--stagger-step) * ${Math.min(index, CREATOR_RAIL_CAP)})` }}
      {...appLink(`/creator/${user.id}`)}
      aria-label={creatorCardLabel(rank, index + 1)}>
      <EditorialPhoto src={cover} className="creator-cover">
        <span className="editorial-cover-fallback" aria-hidden="true"><Sparkles size={20} /></span>
      </EditorialPhoto>
      <div className="creator-card-body">
        <div className="creator-identity">
          <Avatar user={user} size="lg" />
          <span className="creator-name">
            <span className="creator-name-text">{user.profile.name}</span>
            <InlineIcon icon={Sparkles} size={12} gap={0} vAlign="-1px" />
          </span>
          <span className="creator-rank num" aria-hidden="true">#{index + 1}</span>
        </div>
        {bio && <span className="creator-bio">{bio}</span>}
        <span className="creator-evidence num">
          {pubCount} itinerary{pubCount === 1 ? '' : 's'}
          {forks > 0 && <> · <InlineIcon icon={GitFork} size={12} gap={2} />{forks} forks</>}
        </span>
      </div>
    </a>
  )
}

/** Featured creators: the creators whose live catalogs carry the
 *  most evidence, as a scroll rail. Null until the catalog holds
 *  at least one creator with a live publication. */
export function FeaturedCreators({ creators }: { creators: CreatorRank[] }) {
  if (creators.length === 0) return null
  return (
    <section id="explore-creators" className="discovery-block" aria-labelledby="featured-creators-heading">
      <header className="discovery-head">
        <h2 id="featured-creators-heading" className="discovery-title" tabIndex={-1}>
          <InlineIcon icon={Sparkles} size={15} gap={6} />Featured creators
        </h2>
        <p className="discovery-sub">Discover creators with published itineraries, ranked by views and forks.</p>
      </header>
      <div className="creator-rail">
        {creators.map((rank, i) => <CreatorCard key={rank.user.id} rank={rank} index={i} />)}
      </div>
    </section>
  )
}

/** Trending itineraries: the catalog's most-evidenced plans, minus
 *  the one the featured card already leads with. Each row is a
 *  deep link to the public plan, with the creator's own page as
 *  the row's second link. Null until the evidence bar is met. */
export function TrendingShelf({ pubs, users, onFork, onToggleSave, isSaved, needsLogin, forkPendingIds }: {
  pubs: PublishedItinerary[]
  users: User[]
  onFork: (id: string) => void
  onToggleSave: (id: string) => void
  isSaved: (id: string) => boolean
  /** Signed out: Fork navigates to Auth rather than forking in place. */
  needsLogin: boolean
  /** Publications with a fork request in flight. */
  forkPendingIds?: ReadonlySet<string>
}) {
  if (pubs.length === 0) return null
  return (
    <section id="explore-trending" className="discovery-block" aria-labelledby="trending-heading">
      <header className="discovery-head">
        <h2 id="trending-heading" className="discovery-title" tabIndex={-1}>
          <InlineIcon icon={TrendingUp} size={15} gap={6} />Trending itineraries
        </h2>
        <p className="discovery-sub">The most-read and most-copied plans — ranked by views, with a fork counting five times a view.</p>
      </header>
      <div className="trending-grid">
        {pubs.map((p, i) => (
          <div key={p.id} className="trend-row trip-enter"
            style={{ animationDelay: `calc(var(--stagger-step) * ${Math.min(i, CREATOR_RAIL_CAP)})` }}>
            <span className="trend-rank num" aria-hidden="true">{i + 1}</span>
            <PubCard pub={p} creator={users.find(u => u.id === p.creatorId)}
              saved={isSaved(p.id)} onFork={() => onFork(p.id)} onToggleSave={() => onToggleSave(p.id)}
              needsLogin={needsLogin} forkPending={forkPendingIds?.has(p.id)} editorial />
          </div>
        ))}
      </div>
    </section>
  )
}

/** The share-stories call to action. The counts are derived from
 *  the same slice the discovery blocks read, so the card can
 *  never claim a larger community than the page shows. */
export function ShareStoriesCta({ pubCount, creatorCount, signedIn, onNavigate }: {
  pubCount: number
  creatorCount: number
  signedIn: boolean
  onNavigate: (r: string) => void
}) {
  return (
    <section className="share-cta" aria-labelledby="share-stories-heading">
      <h2 id="share-stories-heading" className="share-cta-title">Share your travel stories</h2>
      <p className="share-cta-sub">
        Turn your travel experiences into helpful itineraries — inspire other
        travellers and get recognised in the YatraFlow community.
      </p>
      <p className="share-cta-counts num">
        {pubCount} itinerary{pubCount === 1 ? '' : 's'} from {creatorCount} creator{creatorCount === 1 ? '' : 's'} live here
      </p>
      <ul className="share-cta-ticks">
        <li><InlineIcon icon={Check} size={13} gap={6} />Create and publish itineraries</li>
        <li><InlineIcon icon={Check} size={13} gap={6} />Reach travellers planning trips like yours</li>
        <li><InlineIcon icon={Check} size={13} gap={6} />Get featured and build your profile</li>
      </ul>
      <div className="share-cta-actions">
        <button type="button" className="btn btn-primary"
          onClick={() => onNavigate(signedIn ? '/trips' : '/auth?mode=signup')}>
          {signedIn ? 'Publish a trip' : 'Become a creator'}
        </button>
        {signedIn && <span className="share-cta-hint">Publish one of your trips from its Share tab.</span>}
      </div>
    </section>
  )
}

/** Places in the community: the route places the live catalog names, with
 *  how many live publications name each one. The block reads the same slice
 *  the other discovery blocks read, so it cannot advertise a place no live
 *  plan goes to, and it renders nothing when the catalog holds none. */
export function CommunityPlaces({ places, onSelect }: {
  places: CommunityPlace[]
  onSelect: (place: string) => void
}) {
  if (!places.length) return null
  return (
    <section id="explore-places" className="community-places" aria-labelledby="community-places-heading">
      <h2 id="community-places-heading" tabIndex={-1}>Places in the community</h2>
      <div className="community-place-grid">
        {places.map(place => (
          <button key={place.key} type="button" className="community-place"
            aria-label={`Explore ${place.name}: ${place.pubCount} public ${place.pubCount === 1 ? 'itinerary' : 'itineraries'}`}
            onClick={() => onSelect(place.name)}>
            <EditorialPhoto src={editorialRouteCover([place.name])} className="community-place-photo">
              <span className="editorial-cover-fallback" aria-hidden="true"><MapPin size={20} /></span>
            </EditorialPhoto>
            <span className="community-place-name">{place.name}</span>
            <span className="community-place-count num">{place.pubCount} {place.pubCount === 1 ? 'itinerary' : 'itineraries'}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
