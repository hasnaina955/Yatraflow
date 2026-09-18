// ============ Earnings helpers — actual sales (M7) + projection ============
// The Earnings tab's two views run on this arithmetic — pin both.
import { describe, it, expect } from 'vitest'
import { projectEarnings, deriveActualSales, PROJECTED_PLATFORM_FEE_INR } from '../src/lib/earnings'
import type { PublishedItinerary } from '../src/data/types'
import type { Entitlement } from '../src/lib/payments'

const pub = (over: Partial<PublishedItinerary>): PublishedItinerary => ({
  id: 'pub-x', tripId: 't1', creatorId: 'c1', title: 'Kerala', tagline: '',
  routeSummary: ['Kochi'], durationDays: 3, estimatedBudgetPerPersonInr: 5000,
  travelStyle: 'balanced', travelTips: [], warningsAndAssumptions: [],
  freeDayIndexes: [0], publishedAt: 1, views: 0, copies: 0, ...over,
})

describe('projectEarnings', () => {
  it('projects price × forks per priced publication and totals them', () => {
    const r = projectEarnings([
      pub({ id: 'a', title: 'Kerala', premiumPriceInr: 199, copies: 7 }),
      pub({ id: 'b', title: 'Goa', premiumPriceInr: 149, copies: 2 }),
    ])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({ pubId: 'a', priceInr: 199, forks: 7, grossInr: 1393, netInr: 1393 })
    expect(r.potentialInr).toBe(1691)
    expect(r.netInr).toBe(1691 - 2 * PROJECTED_PLATFORM_FEE_INR)
  })

  it('never invents money for unpriced publications — counts them instead', () => {
    const r = projectEarnings([
      pub({ id: 'free', premiumPriceInr: undefined, copies: 50 }),
      pub({ id: 'zero', premiumPriceInr: 0, copies: 9 }),
      pub({ id: 'priced', premiumPriceInr: 99, copies: 1 }),
    ])
    expect(r.rows.map(x => x.pubId)).toEqual(['priced'])
    expect(r.potentialInr).toBe(99)
    expect(r.unpricedCount).toBe(2)
  })

  it('lists a priced publication with zero forks (a visible ₹0 row), sorted by potential', () => {
    const r = projectEarnings([
      pub({ id: 'low', title: 'Low', premiumPriceInr: 99, copies: 1 }),
      pub({ id: 'high', title: 'High', premiumPriceInr: 199, copies: 3 }),
      pub({ id: 'none', title: 'NoForks', premiumPriceInr: 149, copies: 0 }),
    ])
    expect(r.rows.map(x => x.pubId)).toEqual(['high', 'low', 'none'])
    expect(r.rows.find(x => x.pubId === 'none')?.grossInr).toBe(0)
  })
})

describe('deriveActualSales (I-11)', () => {
  const ent = (over: Partial<Entitlement>): Entitlement => ({
    id: 'e1', userId: 'buyer-1', pubId: 'a', orderId: 'o1', amountPaidInr: 199, grantedAt: 1000, ...over,
  })

  it('attributes each sale to its publication with the PAID amount, not the current price', () => {
    const r = deriveActualSales(
      [ent({ amountPaidInr: 199, grantedAt: 2000 }), ent({ id: 'e2', pubId: 'b', amountPaidInr: 149, grantedAt: 3000 })],
      [pub({ id: 'a', title: 'Kerala', premiumPriceInr: 499 }), pub({ id: 'b', title: 'Goa', premiumPriceInr: 499 })],
    )
    // Newest first, and the snapshot (199/149) — the publication's current
    // price (499) must not leak into the books.
    expect(r.rows.map(x => x.pubId)).toEqual(['b', 'a'])
    expect(r.rows.map(x => x.amountPaidInr)).toEqual([149, 199])
    expect(r.grossInr).toBe(348)
    expect(r.netInr).toBe(348 - 2 * PROJECTED_PLATFORM_FEE_INR)
    // Sold pubs follow row order (newest sale's publication first).
    expect(r.soldPubIds).toEqual(['b', 'a'])
  })

  it('titles sales from the creator\u2019s own publications, keeping orphans on the books', () => {
    const r = deriveActualSales(
      [ent({ pubId: 'gone' }), ent({ id: 'e2', pubId: 'a' })],
      [pub({ id: 'a', title: 'Kerala' })],
    )
    expect(r.rows.find(x => x.pubId === 'a')?.title).toBe('Kerala')
    // A publication unpublished/deleted after its sale must NOT vanish from




    // the ledger — the id stands in for the title.
    expect(r.rows.find(x => x.pubId === 'gone')?.title).toBe('gone')
  })

  it('an empty entitlement list is an honest zero ledger', () => {
    const r = deriveActualSales([], [pub({ id: 'a' })])
    expect(r.rows).toEqual([])
    expect(r.grossInr).toBe(0)
    expect(r.soldPubIds).toEqual([])
  })
})
