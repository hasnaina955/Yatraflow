// ============ Explore discovery derivations (MR10) ============
// The discovery blocks on Explore — featured creators and trending
// itineraries — are claims about the public catalog, so the rules
// live here, in one pure module, rather than inline in the page.
// The test suite runs in node env and pins the rules without a DOM.
//
// The evidence bar is the featured card's own (#395): a plan is
// only worth featuring when it carries real evidence, because
// leading with "Why featured: 0 forks · 13 views" advertises
// emptiness rather than credibility (§6.10).
import type { PublishedItinerary, User } from '../data/types'
import { livePubs } from './livePubs'

/** A publication is only worth featuring when it carries real
 *  evidence — at least one fork, or a meaningful view count. */
export const FEATURED_MIN_VIEWS = 25

/** The catalog's one popularity score: views plus forks weighted
 *  five-to-one (a fork is a stronger signal than a view). Trending and the
 *  Most-popular sort rank by this copy. Featured does not: it crowns the
 *  most-forked eligible plan (copies first, then views), so a high-views,
 *  low-forks catalog can feature one plan while another sorts first — and
 *  each surface names its own basis. */
export function popularity(p: { views: number; copies: number }): number {
  return p.views + p.copies * 5
}

/** One creator's rank in the discovery rail: who they are, and the
 *  evidence in their live catalog. */
export interface CreatorRank {
  user: User
  /** Live publications by this creator. */
  pubCount: number
  forks: number
  views: number
  /** Sum of popularity() across the creator's live publications. */
  score: number
  coverPublication?: PublishedItinerary
}

/** Rank the creators a visitor can discover: creators with at least
 *  one live publication, ordered by the evidence in their catalog.
 *  The order is deterministic — a tie must not depend on the order
 *  rows arrived in — so two renders of the same catalog show the
 *  same rail. */
export function featuredCreators(
  users: User[],
  pubs: PublishedItinerary[],
  limit = 4,
): CreatorRank[] {
  const byCreator = new Map<string, PublishedItinerary[]>()
  for (const p of livePubs(pubs)) {
    const list = byCreator.get(p.creatorId) ?? []
    list.push(p)
    byCreator.set(p.creatorId, list)
  }
  const ranks: CreatorRank[] = []
  for (const user of users) {
    // Disabled accounts must not appear in creator discovery.
    // Accounts without a creator profile have no public creator page.
    if (!user.profile.isCreator || user.profile.isDisabled) continue
    const list = byCreator.get(user.id)
    if (!list || list.length === 0) continue
    const forks = list.reduce((n, p) => n + p.copies, 0)
    const views = list.reduce((n, p) => n + p.views, 0)
    ranks.push({
      user,
      pubCount: list.length,
      forks,
      views,
      score: list.reduce((n, p) => n + popularity(p), 0),
      coverPublication: creatorCoverPublication(list, user.id),
    })
  }
  return ranks
    .sort((a, b) =>
      b.score - a.score ||
      b.pubCount - a.pubCount ||
      b.forks - a.forks ||
      a.user.profile.name.localeCompare(b.user.profile.name) ||
      (a.user.id < b.user.id ? -1 : a.user.id > b.user.id ? 1 : 0),
    )
    .slice(0, limit)
}

/** The catalog's most-evidenced plans, minus the picks a surface
 *  already leads with (the featured card). The same evidence bar
 *  as the featured card, and the same deterministic order. */
export function trendingPubs(
  pubs: PublishedItinerary[],
  limit = 4,
  excludeIds: string[] = [],
): PublishedItinerary[] {
  const excluded = new Set(excludeIds)
  const pool = livePubs(pubs).filter(
    p => !excluded.has(p.id) && (p.copies >= 1 || p.views >= FEATURED_MIN_VIEWS),
  )
  return [...pool]
    .sort((a, b) =>
      popularity(b) - popularity(a) ||
      b.copies - a.copies ||
      b.views - a.views ||
      b.publishedAt - a.publishedAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, limit)
}

/** Preserve the global feature evidence bar, including a final stable ID tie. */
export function selectFeaturedPublication(pubs: PublishedItinerary[]): PublishedItinerary | undefined {
  return livePubs(pubs)
    .filter(p => p.copies >= 1 || p.views >= FEATURED_MIN_VIEWS)
    .sort((a, b) => b.copies - a.copies
      || b.views - a.views
      || b.publishedAt - a.publishedAt
      || a.id.localeCompare(b.id))[0]
}

/** Only a creator's live public routes may supply their discovery cover. */
export function creatorCoverPublication(pubs: PublishedItinerary[], creatorId: string): PublishedItinerary | undefined {
  return livePubs(pubs)
    .filter(p => p.creatorId === creatorId && (p.coverImageUrl?.trim() || p.routeSummary.some(place => place.trim())))
    .sort((a, b) => Number(Boolean(b.coverImageUrl?.trim())) - Number(Boolean(a.coverImageUrl?.trim()))
      || popularity(b) - popularity(a)
      || b.publishedAt - a.publishedAt
      || a.id.localeCompare(b.id))[0]
}

/** Public card evidence plus visible rank disambiguates equal creator names. */
export function creatorCardLabel(rank: CreatorRank, position: number): string {
  return `View ${rank.user.profile.name}'s creator page: ${rank.pubCount} public ${rank.pubCount === 1 ? 'itinerary' : 'itineraries'}, ${rank.forks} forks. Featured creator ${position}.`
}

/** The community counts the share-stories card states: live
 *  publications, the distinct creators behind them, the distinct
 *  route places those publications name, and the recorded forks.
 *  All four are read from the same slice the blocks above read, so
 *  the card can never claim a larger community than the blocks show. */
export interface CommunityPlace {
  key: string
  name: string
  pubCount: number
}

function comparePlaceText(a: string, b: string): number {
  return a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0)
}

export function communityPlaces(pubs: PublishedItinerary[], limit = 6): CommunityPlace[] {
  const places = new Map<string, CommunityPlace>()
  for (const publication of livePubs(pubs)) {
    const counted = new Set<string>()
    for (const rawName of publication.routeSummary) {
      const name = rawName.trim().replace(/\s+/g, ' ')
      if (!name) continue
      const key = name.toLocaleLowerCase('en')
      const place = places.get(key) ?? { key, name, pubCount: 0 }
      if (name < place.name) place.name = name
      if (!counted.has(key)) place.pubCount += 1
      counted.add(key)
      places.set(key, place)
    }
  }
  return [...places.values()]
    .sort((a, b) => b.pubCount - a.pubCount || comparePlaceText(a.name, b.name) || comparePlaceText(a.key, b.key))
    .slice(0, limit)
}

export function communityCounts(pubs: PublishedItinerary[]): {
  pubCount: number
  creatorCount: number
  placeCount: number
  forks: number
} {
  const live = livePubs(pubs)
  return {
    pubCount: live.length,
    creatorCount: new Set(live.map(publication => publication.creatorId)).size,
    placeCount: communityPlaces(live, Infinity).length,
    forks: live.reduce((total, publication) => total + publication.copies, 0),
  }
}
