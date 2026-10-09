// ============ MR10 — Explore discovery derivations ============
//
// The discovery blocks on Explore (featured creators, trending
// itineraries, the share-stories counts) are claims about the public
// catalog, and every claim must be derived, never asserted. The bug
// class this file exists to kill is the surfaces disagreeing with each
// other and with the page's own featured card: a "trending" shelf that
// ranks by a different score than the "most popular" sort, a rail that
// points at a disabled account, or a tie whose order depends on the
// order rows arrived in (two live publications once scored exactly 13
// and swapped places between renders).
//
// Node env, no DOM: the rules are pure functions over the catalog
// slices, so the suite pins them directly.
import { describe, expect, it } from 'vitest'
import type { PublishedItinerary, User } from '../src/data/types'
import {
  FEATURED_MIN_VIEWS, communityCounts, communityPlaces, featuredCreators, popularity, trendingPubs,
  selectFeaturedPublication, creatorCoverPublication, creatorCardLabel,
} from '../src/lib/discovery'

const user = (id: string, name: string, over: Partial<User['profile']> = {}): User => ({
  id,
  email: `${id}@example.test`,
  createdAt: 0,
  profile: {
    name, languages: ['en'], travelStyles: ['relaxed'], isCreator: true, ...over,
  },
})

const pub = (
  id: string,
  creatorId: string,
  stats: { views?: number; copies?: number; publishedAt?: number; unpublishedAt?: number } = {},
): PublishedItinerary => ({
  id,
  tripId: `t-${id}`,
  creatorId,
  title: `Plan ${id}`,
  tagline: `The ${id} plan`,
  routeSummary: ['Start', 'End'],
  durationDays: 3,
  estimatedBudgetPerPersonInr: 10000,
  travelStyle: 'relaxed',
  travelTips: [],
  warningsAndAssumptions: [],
  freeDayIndexes: [0],
  publishedAt: stats.publishedAt ?? 1000,
  views: stats.views ?? 0,
  copies: stats.copies ?? 0,
  ...(stats.unpublishedAt !== undefined ? { unpublishedAt: stats.unpublishedAt } : {}),
})

describe('popularity', () => {
  it('weights a fork five-to-one over a view', () => {
    expect(popularity({ views: 10, copies: 0 })).toBe(10)
    expect(popularity({ views: 0, copies: 2 })).toBe(10)
    expect(popularity({ views: 10, copies: 2 })).toBe(20)
  })
})

describe('featuredCreators', () => {
  it('returns an empty rail for an empty catalog', () => {
    expect(featuredCreators([], [])).toEqual([])
  })

  it('ranks only creators with at least one live publication', () => {
    const users = [
      user('c1', 'Arun'),
      user('c2', 'Bea', { isCreator: false }),        // not a creator
      user('c3', 'Chia'),                                // creator, no pubs
      user('c4', 'Dev'),                                 // creator, only pub is soft-unpublished
    ]
    const pubs = [
      pub('p1', 'c1', { views: 30 }),
      pub('p2', 'c4', { views: 99, unpublishedAt: 5 }),
    ]
    const ranks = featuredCreators(users, pubs)
    expect(ranks.map(r => r.user.id)).toEqual(['c1'])
  })

  it('skips a disabled account — the rail must not point at one', () => {
    const users = [user('c1', 'Arun', { isDisabled: true }), user('c2', 'Bea')]
    const pubs = [pub('p1', 'c1', { views: 99 }), pub('p2', 'c2', { views: 99 })]
    expect(featuredCreators(users, pubs).map(r => r.user.id)).toEqual(['c2'])
  })

  it('orders by the evidence in the catalog: score, then pub count, then forks, then name', () => {
    const users = [user('zara', 'Zara'), user('leo', 'Leo'), user('mia', 'Mia'), user('arn', 'Arun')]
    const pubs = [
      // Zara and Arun tie on every number — the name decides.
      pub('pz', 'zara', { views: 10, copies: 2 }),          // score 20, 1 pub, 2 forks
      pub('pa', 'arn', { views: 10, copies: 2 }),           // score 20, 1 pub, 2 forks
      // Leo ties the score with one fork-heavy plan; Mia ties it
      // with two plans. The chain ranks pub count before forks,
      // so Mia leads Leo.
      pub('pl', 'leo', { views: 10, copies: 2 }),           // score 20, 1 pub, 2 forks
      pub('pm1', 'mia', { views: 10 }),                     // score 10
      pub('pm2', 'mia', { views: 10 }),                     // score 10 — total 20, 2 pubs
    ]
    const order = featuredCreators(users, pubs).map(r => r.user.id)
    expect(order).toEqual(['mia', 'arn', 'leo', 'zara'])
  })

  it('ranks 100 views with no copies above two copies with no views', () => {
    const users = [user('copied', 'Copied'), user('viewed', 'Viewed')]
    const pubs = [
      pub('copies', 'copied', { copies: 2 }),
      pub('views', 'viewed', { views: 100 }),
    ]
    expect(featuredCreators(users, pubs).map(r => ({ id: r.user.id, score: r.score, forks: r.forks }))).toEqual([
      { id: 'viewed', score: 100, forks: 0 },
      { id: 'copied', score: 10, forks: 2 },
    ])
  })

  it('breaks equal names and scores by id in either arrival order', () => {
    const users = [user('aaa', 'Same name'), user('bbb', 'Same name')]
    const pubs = [pub('pa', 'aaa', { views: 100 }), pub('pb', 'bbb', { views: 100 })]
    expect(featuredCreators(users, pubs).map(r => r.user.id)).toEqual(['aaa', 'bbb'])
    expect(featuredCreators([...users].reverse(), [...pubs].reverse()).map(r => r.user.id)).toEqual(['aaa', 'bbb'])
  })

  it('keeps equal creator names and public evidence distinct in link context', () => {
    const rows = featuredCreators([user('a', 'Same'), user('b', 'Same')], [pub('pa', 'a'), pub('pb', 'b')])
    const labels = rows.map((rank, index) => creatorCardLabel(rank, index + 1))
    expect(labels).toEqual([
      "View Same's creator page: 1 public itinerary, 0 forks. Featured creator 1.",
      "View Same's creator page: 1 public itinerary, 0 forks. Featured creator 2.",
    ])
  })

  it('selects each ranked creator cover only from their live publications', () => {
    const rows = [{ ...pub('hidden', 'a', { unpublishedAt: 1 }), coverImageUrl: '/private.jpg' },
      { ...pub('live', 'a'), coverImageUrl: '/public.jpg' }]
    expect(featuredCreators([user('a', 'Same')], rows)[0].coverPublication?.id).toBe('live')
  })

  it('sums a creator\'s live evidence across their catalog', () => {
    const users = [user('c1', 'Arun')]
    const pubs = [
      pub('p1', 'c1', { views: 12, copies: 3 }),   // popularity 27
      pub('p2', 'c1', { views: 40, copies: 1 }),   // popularity 45
    ]
    const [rank] = featuredCreators(users, pubs)
    expect(rank.pubCount).toBe(2)
    expect(rank.forks).toBe(4)
    expect(rank.views).toBe(52)
    expect(rank.score).toBe(72)
  })

  it('caps the rail at four by default, and at the given limit', () => {
    const users = Array.from({ length: 6 }, (_, i) => user(`c${i}`, `Creator ${i}`))
    const pubs = users.map((u, i) => pub(`p${i}`, u.id, { views: (6 - i) * 10 }))
    expect(featuredCreators(users, pubs)).toHaveLength(4)
    expect(featuredCreators(users, pubs, 2)).toHaveLength(2)
  })

  it('is deterministic: the same catalog in a different arrival order ranks the same', () => {
    const users = [
      user('c1', 'Arun'), user('c2', 'Bea'), user('c3', 'Chia'), user('c4', 'Dev'),
    ]
    const pubs = [
      pub('p1', 'c1', { views: 10, copies: 1 }),
      pub('p2', 'c2', { views: 25 }),
      pub('p3', 'c3', { views: 5, copies: 4 }),
      pub('p4', 'c4', { views: 25, copies: 2 }),
    ]
    const forward = featuredCreators(users, pubs).map(r => r.user.id)
    const reversed = featuredCreators([...users].reverse(), [...pubs].reverse()).map(r => r.user.id)
    expect(reversed).toEqual(forward)
  })
})

describe('trendingPubs', () => {
  it('applies the evidence bar exactly: a fork, or the featured-card view minimum', () => {
    const pubs = [
      pub('under', 'c1', { views: FEATURED_MIN_VIEWS - 1 }),   // 24 views, no forks — out
      pub('bar', 'c1', { views: FEATURED_MIN_VIEWS }),         // exactly 25 — in
      pub('forked', 'c1', { views: 0, copies: 1 }),            // one fork — in
      pub('both', 'c1', { views: 30, copies: 2 }),             // in
    ]
    expect(trendingPubs(pubs).map(p => p.id).sort()).toEqual(['bar', 'both', 'forked'])
  })

  it('leaves soft-unpublished plans off the shelf', () => {
    const pubs = [
      pub('live', 'c1', { views: 40 }),
      pub('dead', 'c1', { views: 40, unpublishedAt: 5 }),
    ]
    expect(trendingPubs(pubs).map(p => p.id)).toEqual(['live'])
  })

  it('excludes the picks another surface already leads with', () => {
    const pubs = [
      pub('featured', 'c1', { views: 100 }),
      pub('second', 'c2', { views: 90 }),
      pub('third', 'c3', { views: 80 }),
    ]
    expect(trendingPubs(pubs, 4, ['featured']).map(p => p.id)).toEqual(['second', 'third'])
  })

  it('orders by popularity, then copies, views, recency and id', () => {
    const pubs = [
      pub('low-score', 'c1', { views: 60 }),                             // 60, no forks
      pub('tie-forks', 'c1', { views: 50, copies: 2, publishedAt: 150 }), // 60, 2 forks
      pub('tie-views', 'c1', { views: 55, copies: 1 }),                  // 60, 1 fork, 55 views
      pub('tie-new', 'c1', { views: 50, copies: 2, publishedAt: 200 }),  // 60, 2 forks, newer
      pub('tie-old', 'c1', { views: 50, copies: 2, publishedAt: 100 }),  // 60, 2 forks, older
    ]
    expect(trendingPubs(pubs, 5).map(p => p.id)).toEqual([
      'tie-new', 'tie-forks', 'tie-old', 'tie-views', 'low-score',
    ])
  })

  it('ranks 100 views with no copies above two copies with no views', () => {
    const pubs = [pub('copied', 'c1', { copies: 2 }), pub('viewed', 'c2', { views: 100 })]
    expect(trendingPubs(pubs).map(p => p.id)).toEqual(['viewed', 'copied'])
  })

  it('breaks a full tie on id, so arrival order can never swap two equals', () => {
    const a = pub('aaa', 'c1', { views: 25, copies: 0, publishedAt: 1000 })
    const b = pub('bbb', 'c2', { views: 25, copies: 0, publishedAt: 1000 })
    expect(trendingPubs([b, a]).map(p => p.id)).toEqual(['aaa', 'bbb'])
    expect(trendingPubs([a, b]).map(p => p.id)).toEqual(['aaa', 'bbb'])
  })

  it('caps the shelf at four by default, and at the given limit', () => {
    // Every plan clears the evidence bar (one fork each), so the
    // limit — not the bar — is what does the cutting here.
    const pubs = Array.from({ length: 6 }, (_, i) => pub(`p${i}`, 'c1', { views: (6 - i) * 10, copies: 1 }))
    expect(trendingPubs(pubs)).toHaveLength(4)
    expect(trendingPubs(pubs, 2)).toHaveLength(2)
  })

  it('is deterministic: reversed arrival order ranks the same', () => {
    const pubs = [
      pub('p1', 'c1', { views: 10, copies: 1 }),
      pub('p2', 'c2', { views: 25 }),
      pub('p3', 'c3', { views: 5, copies: 4 }),
      pub('p4', 'c4', { views: 25, copies: 2 }),
    ]
    const forward = trendingPubs(pubs).map(p => p.id)
    const reversed = trendingPubs([...pubs].reverse()).map(p => p.id)
    expect(reversed).toEqual(forward)
  })
})

describe('public editorial selection', () => {
  it('breaks featured publication ties by ID in either arrival order', () => {
    const rows = [pub('z', 'a', { copies: 10, views: 10, publishedAt: 100 }),
      pub('a', 'a', { copies: 10, views: 10, publishedAt: 100 })]
    expect(selectFeaturedPublication(rows)?.id).toBe('a')
    expect(selectFeaturedPublication([...rows].reverse())?.id).toBe('a')
    expect(trendingPubs(rows).map(row => row.id)).toEqual(['a', 'z'])
  })

  it('keeps the feature evidence bar and excludes unpublished rows', () => {
    expect(selectFeaturedPublication([pub('low', 'a', { views: 24 })])).toBeUndefined()
    expect(selectFeaturedPublication([pub('hidden', 'a', { copies: 20, unpublishedAt: 1 })])).toBeUndefined()
    expect(selectFeaturedPublication([pub('viewed', 'a', { views: 25 })])?.id).toBe('viewed')
    expect(selectFeaturedPublication([pub('forked', 'a', { copies: 1 })])?.id).toBe('forked')
  })

  it('uses only the selected creator public publication for their cover', () => {
    const rows = [{ ...pub('hidden', 'a', { copies: 100, unpublishedAt: 1 }), coverImageUrl: '/private.jpg' },
      { ...pub('other', 'b'), coverImageUrl: '/other.jpg' },
      { ...pub('live', 'a'), coverImageUrl: '/public.jpg' }]
    expect(creatorCoverPublication(rows, 'a')?.id).toBe('live')
    expect(creatorCoverPublication(rows, 'missing')).toBeUndefined()
  })

  it('prefers a saved public cover over a higher-ranked route fallback', () => {
    const rows = [pub('popular', 'a', { views: 100 }), { ...pub('photo', 'a'), coverImageUrl: '/public.jpg' }]
    expect(creatorCoverPublication(rows, 'a')?.id).toBe('photo')
    expect(creatorCoverPublication([pub('route', 'a')], 'a')?.id).toBe('route')
    expect(creatorCoverPublication([{ ...pub('blank', 'a'), routeSummary: [], coverImageUrl: '  ' }], 'a')).toBeUndefined()
  })

  it('breaks cover ties by ID and leaves input order unchanged', () => {
    const rows = [{ ...pub('z', 'a'), coverImageUrl: '/z.jpg' }, { ...pub('a', 'a'), coverImageUrl: '/a.jpg' }]
    expect(creatorCoverPublication(rows, 'a')?.id).toBe('a')
    expect(rows.map(row => row.id)).toEqual(['z', 'a'])
  })
})

describe('communityCounts', () => {
  it('counts live publications and the distinct creators behind them', () => {
    const pubs = [
      pub('p1', 'c1', { views: 5 }),
      pub('p2', 'c1', { views: 5 }),   // same creator again
      pub('p3', 'c2', { views: 5 }),
    ]
    expect(communityCounts(pubs)).toEqual({ pubCount: 3, creatorCount: 2, placeCount: 2, forks: 0 })
  })

  it('leaves soft-unpublished plans out of both counts', () => {
    const pubs = [
      pub('p1', 'c1', { views: 5 }),
      pub('p2', 'c2', { views: 5, unpublishedAt: 5 }),
    ]
    expect(communityCounts(pubs)).toEqual({ pubCount: 1, creatorCount: 1, placeCount: 2, forks: 0 })
  })

  it('reads an empty catalog as empty, not as missing', () => {
    expect(communityCounts([])).toEqual({ pubCount: 0, creatorCount: 0, placeCount: 0, forks: 0 })
  })
})

describe('communityPlaces', () => {
  it('counts each publication once per normalized place', () => {
    const rows = [
      { ...pub('a', 'one', { copies: 3 }), routeSummary: [' Goa ', 'GOA', 'New   Delhi', ''] },
      { ...pub('b', 'two', { copies: 2 }), routeSummary: ['Goa', 'New Delhi'] },
      { ...pub('hidden', 'three', { copies: 100, unpublishedAt: 1 }), routeSummary: ['Hidden'] },
    ]
    expect(communityPlaces(rows)).toEqual([
      { key: 'goa', name: 'GOA', pubCount: 2 },
      { key: 'new delhi', name: 'New Delhi', pubCount: 2 },
    ])
    expect(communityCounts(rows)).toEqual({ pubCount: 2, creatorCount: 2, placeCount: 2, forks: 5 })
    expect(communityPlaces([...rows].reverse())).toEqual(communityPlaces(rows))
  })

  it('does not turn a town label into a regional claim', () => {
    const rows = [{ ...pub('a', 'one'), routeSummary: ['Kochi', 'Kerala'] }]
    expect(communityPlaces(rows).map(place => place.key)).toEqual(['kerala', 'kochi'])
  })

  it('caps tiles without capping the hero place count', () => {
    const rows = [{ ...pub('a', 'one'), routeSummary: Array.from({ length: 8 }, (_, i) => `Place ${i}`) }]
    expect(communityPlaces(rows)).toHaveLength(6)
    expect(communityCounts(rows).placeCount).toBe(8)
  })

  it('reads empty, blank, and unpublished catalogs as no places', () => {
    expect(communityPlaces([])).toEqual([])
    expect(communityPlaces([{ ...pub('a', 'one'), routeSummary: [] }])).toEqual([])
    expect(communityPlaces([{ ...pub('a', 'one'), routeSummary: ['', '   '] }])).toEqual([])
    expect(communityPlaces([{ ...pub('a', 'one', { unpublishedAt: 1 }), routeSummary: ['Goa'] }])).toEqual([])
    expect(communityCounts([{ ...pub('a', 'one'), routeSummary: [] }]))
      .toEqual({ pubCount: 1, creatorCount: 1, placeCount: 0, forks: 0 })
    expect(communityCounts([{ ...pub('a', 'one'), routeSummary: ['', '   '] }]))
      .toEqual({ pubCount: 1, creatorCount: 1, placeCount: 0, forks: 0 })
  })

  it('counts forks as recorded, including zero', () => {
    const rows = [pub('a', 'one'), { ...pub('b', 'two'), routeSummary: ['Goa'] }]
    expect(communityCounts(rows).forks).toBe(0)
    const forked = [{ ...pub('a', 'one', { copies: 4 }), routeSummary: ['Goa'] }]
    expect(communityCounts(forked).forks).toBe(4)
  })

  it('orders equal counts by stable label then key', () => {
    const rows = [{ ...pub('a', 'one'), routeSummary: ['Kochi', 'Goa'] }]
    expect(communityPlaces(rows)).toEqual([
      { key: 'goa', name: 'Goa', pubCount: 1 },
      { key: 'kochi', name: 'Kochi', pubCount: 1 },
    ])
  })

  it('leaves the input rows and their order unchanged', () => {
    const rows = [
      { ...pub('b', 'two', { copies: 2 }), routeSummary: ['Goa', 'New Delhi'] },
      { ...pub('a', 'one', { copies: 3 }), routeSummary: [' Goa ', 'GOA'] },
    ]
    const snapshot = rows.map(row => ({ id: row.id, routeSummary: [...row.routeSummary] }))
    communityPlaces(rows)
    communityCounts(rows)
    expect(rows.map(row => ({ id: row.id, routeSummary: [...row.routeSummary] }))).toEqual(snapshot)
  })
})
