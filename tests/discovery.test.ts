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
  FEATURED_MIN_VIEWS, communityCounts, featuredCreators, popularity, trendingPubs,
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
    // Five plans, and the shelf caps at four by default — so this
    // test asks for five, or the default cap would hide the last
    // rung of the chain it is here to pin.
    expect(trendingPubs(pubs, 5).map(p => p.id)).toEqual([
      'tie-new', 'tie-forks', 'tie-old', 'tie-views', 'low-score',
    ])
  })

  it('breaks a full tie on id, so arrival order can never swap two equals', () => {
    // Both carry one fork, so both clear the evidence bar and the
    // shelf sees them at all — the fixture must pass the bar it is
    // testing past, or the assertion compares two empty results.
    const a = pub('aaa', 'c1', { views: 13, copies: 1, publishedAt: 1000 })
    const b = pub('bbb', 'c2', { views: 13, copies: 1, publishedAt: 1000 })
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

describe('communityCounts', () => {
  it('counts live publications and the distinct creators behind them', () => {
    const pubs = [
      pub('p1', 'c1', { views: 5 }),
      pub('p2', 'c1', { views: 5 }),   // same creator again
      pub('p3', 'c2', { views: 5 }),
    ]
    expect(communityCounts(pubs)).toEqual({ pubCount: 3, creatorCount: 2 })
  })

  it('leaves soft-unpublished plans out of both counts', () => {
    const pubs = [
      pub('p1', 'c1', { views: 5 }),
      pub('p2', 'c2', { views: 5, unpublishedAt: 5 }),
    ]
    expect(communityCounts(pubs)).toEqual({ pubCount: 1, creatorCount: 1 })
  })

  it('reads an empty catalog as empty, not as missing', () => {
    expect(communityCounts([])).toEqual({ pubCount: 0, creatorCount: 0 })
  })
})
