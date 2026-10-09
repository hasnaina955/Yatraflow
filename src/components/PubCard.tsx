// ============ Published-itinerary card — shared by Explore and creator pages ============
// One card for every place the catalog renders, so a fork/save/creator change
// lands everywhere at once. Fork + save behavior arrive as callbacks; the
// creator line links to the creator's public page (#/creator/:id).
import { Bookmark, Calendar, Camera, Eye, GitFork, Heart, MapPin, Sparkles, TvMinimalPlay, Wallet } from 'lucide-react'
import { InlineIcon, MetaIcon } from './icons'
import type { PublishedItinerary, User } from '../data/types'
import { formatInr } from '../lib/engine'
import { cap } from '../lib/labels'
import { openExternal } from '../lib/native'
import { Avatar, Chip } from './ui'
import { CoverThumb } from './CoverThumb'
import { appLink } from '../lib/appLink'
import { editorialRouteCover } from '../lib/editorialAssets'

type PubCardProps = {
  pub: PublishedItinerary
  creator?: User
  saved: boolean
  onFork: () => void
  onToggleSave: () => void
  /** Grid position for the shared entrance stagger (Explore); omit for none. */
  enterIndex?: number
  /** Signed out: Fork navigates to /auth rather than forking in place, so the
   *  button has to say so — a click that silently becomes a login redirect
   *  reads as a broken button. */
  needsLogin?: boolean
  /** A fork request is in flight for this publication: the action disables. */
  forkPending?: boolean
  /** Compact image-led presentation. Other pages keep the default bezel. */
  editorial?: boolean
}

/** Compact image-led card for Explore and the trending rail: the photo carries
 *  the duration and the Save control, the body carries the facts, and the
 *  publication page keeps the complete route and description. The default
 *  `PubCard` return below stays byte-identical for every other caller. */
function EditorialPubCard({ pub, creator, saved, onFork, onToggleSave, enterIndex, needsLogin, forkPending }: PubCardProps) {
  return (
    <div className={`pub-card-editorial${enterIndex != null ? ' trip-enter' : ''}`}
      style={enterIndex != null ? { animationDelay: `calc(var(--stagger-step) * ${Math.min(enterIndex, 8)})` } : undefined}>
      <div className="card itin-card">
        <div className="pub-card-media">
          <a className="pub-card-cover-link" {...appLink(`/pub/${pub.id}`)} aria-label={`Open ${pub.title}`}>
            <CoverThumb trip={{ name: pub.title, destinations: pub.routeSummary }}
              explicitUrl={pub.coverImageUrl} emoji="🧭" editorial
              fallbackUrl={editorialRouteCover(pub.routeSummary)} />
          </a>
          <span className="pub-card-duration num">{pub.durationDays} {pub.durationDays === 1 ? 'day' : 'days'}</span>
          <button type="button" className="save-heart save-bookmark" aria-pressed={saved}
            aria-label={saved ? `Remove ${pub.title} from saved` : `Save ${pub.title}`} onClick={onToggleSave}>
            <Bookmark size={16} aria-hidden fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
        <a className="trip-card-hit" {...appLink(`/pub/${pub.id}`)}>
          <div className="itin-body">
            <h2 className="card-title">{pub.title}</h2>
            <p className="small muted itin-tagline">{pub.tagline}</p>
            <div className="pub-card-tags"><Chip tone="teal">{cap(pub.travelStyle)}</Chip></div>
            <div className="stop-meta num">
              <span><MetaIcon icon={Wallet} tone="money" />~{formatInr(pub.estimatedBudgetPerPersonInr)}/person</span>
              <span><MetaIcon icon={MapPin} tone="place" />{pub.routeSummary.length} places</span>
            </div>
          </div>
        </a>
        <div className="pub-card-creator">
          <a className="creator-line" {...appLink(`/creator/${pub.creatorId}`)}
            aria-label={`View ${creator?.profile.name ?? 'creator'}'s page`}>
            <Avatar user={creator} />
            <span>{creator?.profile.name ?? 'Creator'}</span>
            {creator?.profile.isCreator && <Sparkles size={12} aria-hidden />}
          </a>
          <div className="pub-card-socials">
            {creator?.profile.isCreator && creator.profile.socialLinks?.youtube && (
              <a href={creator.profile.socialLinks.youtube} target="_blank" rel="noreferrer noopener"
                aria-label={`${creator.profile.name} on YouTube`} className="icon-link"
                onClick={event => { event.preventDefault(); openExternal(creator.profile.socialLinks!.youtube!) }}>
                <TvMinimalPlay size={14} aria-hidden />
              </a>
            )}
            {creator?.profile.isCreator && creator.profile.socialLinks?.instagram && (
              <a href={creator.profile.socialLinks.instagram} target="_blank" rel="noreferrer noopener"
                aria-label={`${creator.profile.name} on Instagram`} className="icon-link"
                onClick={event => { event.preventDefault(); openExternal(creator.profile.socialLinks!.instagram!) }}>
                <Camera size={14} aria-hidden />
              </a>
            )}
          </div>
        </div>
        <div className="row-between itin-meta">
          <span className="itin-public-evidence num">
            <span><InlineIcon icon={Eye} size={12} />{pub.views} views</span>
            <span><InlineIcon icon={GitFork} size={12} />{pub.copies} {pub.copies === 1 ? 'fork' : 'forks'}</span>
          </span>
          <button type="button" className="btn btn-primary btn-sm" disabled={forkPending}
            title={pub.premiumPriceInr != null ? `Unlocks at ${formatInr(pub.premiumPriceInr)} — forking copies the free parts` : undefined}
            aria-label={needsLogin ? `Log in to fork ${pub.title}` : forkPending ? `Forking ${pub.title}` : `Fork ${pub.title}`}
            onClick={onFork}>
            {needsLogin ? 'Log in to fork' : forkPending ? 'Forking…' : 'Fork this trip'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PubCard({ pub, creator, saved, onFork, onToggleSave, enterIndex, needsLogin, forkPending, editorial = false }: PubCardProps) {
  if (editorial) {
    return <EditorialPubCard pub={pub} creator={creator} saved={saved} onFork={onFork}
      onToggleSave={onToggleSave} enterIndex={enterIndex} needsLogin={needsLogin} forkPending={forkPending} />
  }
  return (
    /* Double-Bezel: this element is the TRAY, the .card inside it is the PLATE.
       The entrance stagger rides the tray rather than the plate, so the whole
       bezel animates as one object instead of an empty tray appearing first and
       its plate fading in inside it. */
    <div
      className={`${editorial ? 'pub-card-editorial' : 'bezel'}${enterIndex != null ? ' trip-enter' : ''}`}
      style={enterIndex != null ? { animationDelay: `calc(var(--stagger-step) * ${Math.min(enterIndex, 8)})` } : undefined}
    >
      <div className="card itin-card">
        <button className="save-heart" aria-pressed={saved} aria-label={saved ? `Remove ${pub.title} from saved` : `Save ${pub.title}`}
          onClick={onToggleSave}><Heart size={13} aria-hidden fill={saved ? 'currentColor' : 'none'} /></button>
        <a className="trip-card-hit" {...appLink(`/pub/${pub.id}`)}>
          <CoverThumb
            trip={{ name: pub.title, destinations: pub.routeSummary }}
            explicitUrl={pub.coverImageUrl}
            emoji="🧭"
            editorial={editorial}
            fallbackUrl={editorial ? editorialRouteCover(pub.routeSummary) : undefined}
            routeLabel={editorial
              ? pub.routeSummary.filter(Boolean).join(' → ')
              : `${pub.routeSummary[0]} → ${pub.routeSummary[pub.routeSummary.length - 1]}`}
          />
          <div className="itin-body">
            <div className="row-between" style={{ marginTop: 0 }}>
              <Chip tone="teal">{cap(pub.travelStyle)}</Chip>
              <span className="small muted"><InlineIcon icon={GitFork} size={12} gap={3} />{pub.copies}</span>
            </div>
            <h2 className="card-title">{pub.title}</h2>
            <p className="small muted itin-tagline" style={{ margin: 0 }}>{pub.tagline}</p>
            {editorial && <p className="itin-public-evidence num">{pub.views} views · {pub.copies} {pub.copies === 1 ? 'fork' : 'forks'}</p>}
            <div className="stop-meta" style={{ marginTop: 2 }}>
              <span><MetaIcon icon={ Calendar } tone="time" />{pub.durationDays} days</span>
              <span><MetaIcon icon={ Wallet } tone="money" />~{formatInr(pub.estimatedBudgetPerPersonInr)}/person</span>
              <span><MetaIcon icon={ MapPin } tone="place" />{pub.routeSummary.length} places</span>
            </div>
          </div>
        </a>
        <div className="row-between itin-meta">
          <a className="creator-line" {...appLink(`/creator/${pub.creatorId}`)} aria-label={`View ${creator?.profile.name ?? 'creator'}'s page`}>
            <Avatar user={creator} />{creator?.profile.name ?? 'Creator'}{creator?.profile.isCreator && <InlineIcon icon={Sparkles} size={12} gap={0} style={{ marginLeft: 2 }} />}
          </a>
          <button className="btn btn-primary btn-sm" aria-label={needsLogin ? `Log in to fork ${pub.title}` : `Fork ${pub.title}`} onClick={onFork}>{needsLogin ? 'Log in to fork' : 'Fork this trip'}</button>
        </div>
        {creator?.profile.isCreator && (creator.profile.creatorBio || creator.profile.socialLinks?.youtube || creator.profile.socialLinks?.instagram) && (
          <div className="row-between itin-foot" style={{ gap: 8 }}>
            <span className="small muted" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{creator.profile.creatorBio}</span>
            <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
              {creator.profile.socialLinks?.youtube && (
                <a href={creator.profile.socialLinks.youtube} target="_blank" rel="noreferrer noopener" aria-label={`${creator.profile.name} on YouTube`} className="icon-link" onClick={e => { e.preventDefault(); openExternal(creator.profile.socialLinks!.youtube!) }}><TvMinimalPlay size={14} aria-hidden /></a>
              )}
              {creator.profile.socialLinks?.instagram && (
                <a href={creator.profile.socialLinks.instagram} target="_blank" rel="noreferrer noopener" aria-label={`${creator.profile.name} on Instagram`} className="icon-link" onClick={e => { e.preventDefault(); openExternal(creator.profile.socialLinks!.instagram!) }}><Camera size={14} aria-hidden /></a>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
