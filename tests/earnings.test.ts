// ============ Earnings helpers — actual sales (M7) + projection ============
// The Earnings tab's two views run on this arithmetic — pin both.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  projectEarnings, deriveActualSales, payoutStatus, payoutPeriods, nextPayoutRun,
  feeForSliceInr, platformFeeInr, netOfFeeInr, attributeFeesInr,
  PLATFORM_FEE_TIERS, PAYOUT_MINIMUM_INR, PAYOUT_WEEKDAY,
} from '../src/lib/earnings'
import type { PublishedItinerary } from '../src/data/types'
import type { Entitlement } from '../src/lib/payments'

const pub = (over: Partial<PublishedItinerary>): PublishedItinerary => ({
  id: 'pub-x', tripId: 't1', creatorId: 'c1', title: 'Kerala', tagline: '',
  routeSummary: ['Kochi'], durationDays: 3, estimatedBudgetPerPersonInr: 5000,
  travelStyle: 'balanced', travelTips: [], warningsAndAssumptions: [],
  freeDayIndexes: [0], publishedAt: 1, views: 0, copies: 0, ...over,
})

const ent = (over: Partial<Entitlement>): Entitlement => ({
  id: 'e1', userId: 'buyer-1', pubId: 'a', orderId: 'o1', amountPaidInr: 199, grantedAt: 1000, ...over,
})

describe('projectEarnings', () => {
  it('projects price × forks per priced publication and totals them', () => {
    const r = projectEarnings([
      pub({ id: 'a', title: 'Kerala', premiumPriceInr: 199, copies: 7 }),
      pub({ id: 'b', title: 'Goa', premiumPriceInr: 149, copies: 2 }),
    ])
    expect(r.rows).toHaveLength(2)
    // 15% of ₹1,393 = ₹208.95 → ₹209 on the row; the second row's ₹298 slice
    // is still inside the first tier: ₹44.70 → ₹45.
    expect(r.rows[0]).toMatchObject({ pubId: 'a', priceInr: 199, forks: 7, grossInr: 1393, feeInr: 209, netInr: 1184 })
    expect(r.rows[1]).toMatchObject({ pubId: 'b', grossInr: 298, feeInr: 45, netInr: 253 })
    expect(r.potentialInr).toBe(1691)
    expect(r.feeInr).toBe(254)
    expect(r.netInr).toBe(1437)
    // The total is the sum of the rows, never the ladder applied to the total —
    // a ledger whose columns do not add up is worse than one a rupee out.
    expect(r.feeInr).toBe(r.rows.reduce((s, x) => s + x.feeInr, 0))
    expect(r.netInr).toBe(r.potentialInr - r.feeInr)
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
    // 15% of ₹199 = ₹29.85 → ₹30, then 15% of ₹149 = ₹22.35 → ₹22, charged
    // oldest first (₹199 was granted first) even though the table reads newest
    // first — re-sorting for display must not move a fee onto another sale.
    expect(r.rows.map(x => x.amountPaidInr)).toEqual([149, 199])
    expect(r.rows.map(x => x.feeInr)).toEqual([22, 30])
    expect(r.feeInr).toBe(52)
    expect(r.netInr).toBe(296)
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

describe('the platform fee ladder (I-13)', () => {
  it('is 15% of the first ₹25,000 of lifetime gross, then 10%', () => {
    expect(PLATFORM_FEE_TIERS).toEqual([
      { upToInr: 25_000, rate: 0.15 },
      { upToInr: null, rate: 0.10 },
    ])
    expect(platformFeeInr(10_000)).toBeCloseTo(1_500, 6)
    expect(platformFeeInr(25_000)).toBeCloseTo(3_750, 6)
    // MARGINAL, not a re-rate: crossing ₹25,000 never re-charges the first
    // ₹25,000 at the lower rate, so the fee cannot fall as a creator earns more.
    expect(platformFeeInr(35_000)).toBeCloseTo(3_750 + 1_000, 6)
    expect(netOfFeeInr(35_000)).toBeCloseTo(30_250, 6)
    expect(platformFeeInr(25_001)).toBeGreaterThan(platformFeeInr(25_000))
  })

  it('charges one slice the same wherever it sits inside a tier', () => {
    expect(feeForSliceInr(0, 1_000)).toBeCloseTo(150, 6)
    expect(feeForSliceInr(0, 20_000)).toBeCloseTo(3_000, 6)
    // A slice straddling the threshold pays each tier on its own part.
    expect(feeForSliceInr(20_000, 30_000)).toBeCloseTo(750 + 500, 6)
    expect(feeForSliceInr(30_000, 20_000)).toBe(0)
  })

  it('attributes a run of sales without ever charging a slice twice', () => {
    // Three ₹10,000 sales. The first two are wholly in the 15% tier; the third
    // STRADDLES the ₹25,000 line, so ₹5,000 of it is still charged 15% and only
    // the rest gets 10% — ₹1,250, not ₹1,000. Σ = ₹4,250 = the ladder on ₹30,000,
    // which is the property that makes the split safe to show at all.
    expect(attributeFeesInr([10_000, 10_000, 10_000])).toEqual([1_500, 1_500, 1_250])
    expect(platformFeeInr(30_000)).toBeCloseTo(4_250, 6)
    expect(attributeFeesInr([])).toEqual([])
  })

  it('totals the same whichever order sales arrived, though the split differs', () => {
    const smallFirst = attributeFeesInr([15_000, 25_000])
    const bigFirst = attributeFeesInr([25_000, 15_000])
    expect(smallFirst.reduce((s, f) => s + f, 0)).toBe(5_250)
    expect(bigFirst.reduce((s, f) => s + f, 0)).toBe(5_250)
    // Which sale gets the cheaper rate is a fact about ordering, so it differs —
    // and the UI says so rather than presenting the split as fixed.
    expect(smallFirst).not.toEqual(bigFirst)
  })

  it('walks the ladder oldest first on the real ledger', () => {
    const r = deriveActualSales(
      [
        ent({ id: 'late', amountPaidInr: 10_000, grantedAt: 5_000 }),
        ent({ id: 'early', amountPaidInr: 20_000, grantedAt: 1_000 }),
      ],
      [],
    )
    expect(r.grossInr).toBe(30_000)
    expect(r.rows.map(x => x.amountPaidInr)).toEqual([10_000, 20_000])
    expect(r.rows.map(x => x.feeInr)).toEqual([1_250, 3_000])
    expect(r.feeInr).toBe(4_250)
    expect(r.netInr).toBe(25_750)
    expect(r.feeInr).toBe(r.rows.reduce((s, x) => s + x.feeInr, 0))
    expect(r.netInr).toBe(r.rows.reduce((s, x) => s + x.netInr, 0))
  })

  it('is whole rupees on every row', () => {
    const r = deriveActualSales([ent({ amountPaidInr: 199 }), ent({ id: 'e2', amountPaidInr: 149, grantedAt: 2 } )], [])
    for (const row of r.rows) {
      expect(Number.isInteger(row.feeInr)).toBe(true)
      expect(Number.isInteger(row.netInr)).toBe(true)
    }
  })
})

describe('the hub reads the ledger as written (I-9/I-10/I-13)', () => {
  // The hub needs a creator account to render, which a node test cannot supply,
  // so the wiring is pinned at the source: these are the four ways the numbers
  // above could be computed correctly and then shown wrongly.
  const hub = readFileSync(new URL('../src/pages/CreatorHubPage.tsx', import.meta.url), 'utf8')

  it('shows the fee beside what is left, in both ledgers', () => {
    // Four headers: the actual ledger writes its <thead> twice — once for the
    // empty state and once for the rows, and the two must stay the same shape or
    // an empty ledger teaches the wrong columns — plus the projection ledger and
    // the payout runs, which are ledgers of their own.
    expect(hub.match(/<th className="num">Fee<\/th>/g)).toHaveLength(4)
    expect(hub).toMatch(/formatInr\(r\.feeInr\)/)
    expect(hub).toMatch(/formatInr\(actual\.feeInr\)/)
    expect(hub).toMatch(/formatInr\(projection\.feeInr\)/)
  })

  it('lets the basis switch move emphasis, not hide a number', () => {
    expect(hub).toMatch(/aria-label="Show amounts as"/)
    expect(hub).toMatch(/basis === 'net' \? \(actual\?\.netInr \?\? 0\) : \(actual\?\.grossInr \?\? 0\)/)
  })

  it('keeps the payout schedule on the actual ledger, never on a projection', () => {
    expect(hub).toMatch(/payoutStatus\(actual\?\.netInr \?\? 0, now\)/)
    expect(hub).toMatch(/payoutPeriods\(actual\?\.rows \?\? \[\], now\)/)
    expect(hub).toMatch(/\{view === 'actual' && \(/)
  })

  it('states the fee rule wherever it explains a figure', () => {
    expect(hub.match(/PLATFORM_FEE_SUMMARY/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    // The old placeholder's copy must not survive anywhere.
    expect(hub).not.toContain('TBD')
    expect(hub).not.toContain('mirrors gross')
  })

  it('never calls a past run paid', () => {
    // The one word that would turn an honest ledger into a false promise. Scoped
    // to the status helper: the sales ledger's own "Paid" column means what the
    // BUYER paid, which is a different word for a different thing.
    const status = hub.slice(hub.indexOf('function periodStatus'), hub.indexOf('/** "26 Sep"'))
    expect(status.length).toBeGreaterThan(0)
    expect(status).toContain("'Owed — not disbursed'")
    expect(status).not.toMatch(/paid/i)
    expect(hub).toMatch(/<th>Status<\/th>/)
  })
})

describe('the price field states what is kept (I-13)', () => {
  const shareTab = readFileSync(new URL('../src/pages/trip/ShareTab.tsx', import.meta.url), 'utf8')

  it('puts the net beside the price, as a floor rather than a rate', () => {
    // A price on its own cannot know the creator's lifetime gross, so the only
    // honest figure it can promise is the least they keep — which is what the
    // first tier charges.
    expect(shareTab).toMatch(/netOfFeeInr\(priceNum\)/)
    expect(shareTab).toContain('a sale nets you at least')
    // FLOORED: `formatInr` rounds, and a net of ₹172.55 promised as "at least
    // ₹173" is a rupee more than the sale can produce.
    expect(shareTab).toMatch(/formatInr\(Math\.floor\(netOfFeeInr\(priceNum\)\)\)/)
    expect(shareTab).toMatch(/import \{[^}]*PLATFORM_FEE_SUMMARY[^}]*\} from '\.\.\/\.\.\/lib\/earnings'|PLATFORM_FEE_SUMMARY/)
  })
})

describe('the payout runs ledger (I-9)', () => {
  // Local midnights: a sale made during a week lands on the Friday after it,
  // so the arithmetic below is timezone-independent.
  const monday = new Date(2026, 8, 21, 9, 0, 0).getTime()
  const nextMonday = monday + 7 * 86_400_000

  it('puts a sale on the Friday after it was bought, at local midnight', () => {
    const run = new Date(nextPayoutRun(monday))
    expect(run.getDay()).toBe(PAYOUT_WEEKDAY)
    expect(run.getTime()).toBeGreaterThan(monday)
    expect([run.getHours(), run.getMinutes(), run.getSeconds()]).toEqual([0, 0, 0])
    expect(run.toDateString()).not.toBe(new Date(monday).toDateString())
  })

  it('groups a week of sales into one run, newest run first', () => {
    const led = deriveActualSales([
      ent({ id: 'a', amountPaidInr: 199, grantedAt: monday }),
      ent({ id: 'b', amountPaidInr: 199, grantedAt: monday + 86_400_000 }),
      ent({ id: 'c', amountPaidInr: 499, grantedAt: nextMonday }),
    ], [])
    const periods = payoutPeriods(led.rows, nextMonday + 86_400_000)
    expect(periods).toHaveLength(2)
    expect(periods[0]!.dueAt).toBeGreaterThan(periods[1]!.dueAt)
    expect(periods[0]!.salesCount).toBe(1)
    expect(periods[1]!.salesCount).toBe(2)
    expect(periods[1]!.grossInr).toBe(398)
  })

  it('adds up to the ledger above it — the same rows, the same fees', () => {
    const led = deriveActualSales([
      ent({ id: 'a', amountPaidInr: 199, grantedAt: monday }),
      ent({ id: 'b', amountPaidInr: 25_000, grantedAt: monday + 86_400_000 }),
      ent({ id: 'c', amountPaidInr: 499, grantedAt: nextMonday }),
    ], [])
    const periods = payoutPeriods(led.rows, nextMonday + 86_400_000)
    const sum = (pick: (p: ReturnType<typeof payoutPeriods>[number]) => number) =>
      periods.reduce((s, p) => s + pick(p), 0)
    expect(sum(p => p.grossInr)).toBe(led.grossInr)
    expect(sum(p => p.feeInr)).toBe(led.feeInr)
    expect(sum(p => p.netInr)).toBe(led.netInr)
    expect(sum(p => p.salesCount)).toBe(led.rows.length)
  })

  it('calls a run behind us owed, and one ahead scheduled', () => {
    const led = deriveActualSales([ent({ amountPaidInr: 499, grantedAt: monday })], [])
    expect(payoutPeriods(led.rows, monday)[0]).toMatchObject({ past: false })
    expect(payoutPeriods(led.rows, monday + 30 * 86_400_000)[0]).toMatchObject({ past: true })
  })

  it('rolls a run under the minimum over instead of clearing it', () => {
    // ₹149 → fee ₹22 → net ₹127, which is under the ₹500 minimum.
    const led = deriveActualSales([ent({ amountPaidInr: 149, grantedAt: monday })], [])
    expect(payoutPeriods(led.rows, monday)[0]).toMatchObject({
      netInr: 127, belowMinimum: true, clearsInr: 0,
    })
  })

  it('has no runs to show for a creator with no sales', () => {
    expect(payoutPeriods([], monday)).toEqual([])
  })
})

describe('the payout schedule (I-9)', () => {
  it('lands on a Friday, strictly ahead of now, at local midnight', () => {
    const now = new Date(2026, 8, 21, 14, 30, 0).getTime()
    const due = new Date(payoutStatus(1_000, now).dueAt)
    expect(due.getDay()).toBe(PAYOUT_WEEKDAY)
    expect(due.getTime()).toBeGreaterThan(now)
    expect([due.getHours(), due.getMinutes(), due.getSeconds(), due.getMilliseconds()])
      .toEqual([0, 0, 0, 0])
    expect(due.getTime() - now).toBeLessThanOrEqual(7 * 86_400_000)
  })

  it('never schedules a run on today\u2019s own date — not even when today is the run day', () => {
    // "Today" would render as a promise every Friday, and there is no rail to
    // keep it; a balance always waits for the next one.
    for (let offset = 0; offset < 7; offset++) {
      const now = new Date(2026, 8, 21 + offset, 9, 0, 0)
      const due = new Date(payoutStatus(1_000, now.getTime()).dueAt)
      expect(due.getDay()).toBe(PAYOUT_WEEKDAY)
      expect(due.toDateString()).not.toBe(now.toDateString())
    }
  })

  it('clears a balance only once it reaches the minimum, and never invents one', () => {
    const now = Date.now()
    expect(payoutStatus(PAYOUT_MINIMUM_INR, now)).toMatchObject({
      clearsInr: PAYOUT_MINIMUM_INR, belowMinimum: false,
    })
    expect(payoutStatus(PAYOUT_MINIMUM_INR - 1, now)).toMatchObject({ clearsInr: 0, belowMinimum: true })
    // Nothing owed is not the same as too little owed.
    expect(payoutStatus(0, now)).toMatchObject({ clearsInr: 0, belowMinimum: false })
    expect(payoutStatus(-50, now).clearsInr).toBe(0)
    expect(payoutStatus(12_345.6, now).clearsInr).toBe(12_346)
  })
})
