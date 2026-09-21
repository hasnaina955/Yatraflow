// ============ Creator earnings — real sales (M7) + projections ============
// Two ledgers, clearly separated:
//
//   ACTUAL — derived from entitlements rows (real money that changed hands).
//   Each row joins a sale back to its publication via `pubId`; the per-sale
//   price snapshot on the entitlement row is what was actually charged, not
//   the publication's current price (I-12).
//
//   PROJECTION — price × forks, "if every fork had bought the unlock".
//   Labeled a projection in the UI; it is never money.
//
// THE FEE MODEL (I-13, decided 2026-09-21) ---------------------------------
// The platform's cut is a MARGINAL ladder over a creator's LIFETIME gross:
// 15% up to ₹25,000, then 10%.
//
//   * MARGINAL, not "re-rate the whole balance once you cross the line": the
//     fee is then a function of cumulative gross rather than of the order
//     sales happened to arrive in, and the rule fits in one sentence a creator
//     can read on the ledger.
//   * 15% because that is the number the commercial plan's own decision table
//     asked to confirm (docs/commercial/PLAN-MONETISATION.md §11), and because
//     it has to clear the ~2–3% payment-processing floor with margin to be
//     worth charging at all (REPORT-2026-09-15 §7).
//   * ₹25,000 is ~125 sales at ₹199 — reachable for a creator with real
//     distribution, which is the point of a threshold: it rewards volume
//     rather than being decorative.
//
// The whole model is `PLATFORM_FEE_TIERS` below. Changing the business decision
// is one edit there; every number on the ledger derives from it.
//
// TWO ARITHMETIC RULES the figures obey, because a ledger that does not add up
// is worse than one that is a rupee out: each ROW's fee is rounded to the
// rupee, and every TOTAL is the sum of its rows rather than the ladder applied
// to the total. So `deriveActualSales(...).feeInr` === Σ row fees, and the same
// holds for the projection.
//
// WHAT IS NOT SETTLED HERE: payout RUNS are not automated. There is no payouts
// table and no gateway payout API anywhere in this repo — `payoutStatus` is the
// schedule this ledger is built around, and the card that renders it says so in
// as many words rather than implying money is on its way.
import type { PublishedItinerary } from '../data/types'
import type { Entitlement } from './payments'

// ---- The platform fee (I-13) ----

export interface FeeTier {
  /** Lifetime gross up to which this rate applies; `null` = no ceiling. */
  upToInr: number | null
  /** Fraction of that slice the platform keeps (0.15 = 15%). */
  rate: number
}

export const PLATFORM_FEE_TIERS: readonly FeeTier[] = [
  { upToInr: 25_000, rate: 0.15 },
  { upToInr: null, rate: 0.10 },
]

/** The model as the one sentence the ledger and the changelog use. */
export const PLATFORM_FEE_SUMMARY = '15% of the first ₹25,000 you earn, 10% after that'

/**
 * The ladder's fee over the slice of lifetime gross between two positions.
 * This IS the model — every other number here is this function applied to a
 * slice — which is why it is exported rather than kept private.
 */
export function feeForSliceInr(fromInr: number, toInr: number): number {
  if (!(toInr > fromInr)) return 0
  let fee = 0
  let cursor = Math.max(0, fromInr)
  for (const tier of PLATFORM_FEE_TIERS) {
    const ceiling = tier.upToInr ?? Number.POSITIVE_INFINITY
    if (cursor >= ceiling) continue
    const end = Math.min(toInr, ceiling)
    if (end <= cursor) continue
    fee += (end - cursor) * tier.rate
    cursor = end
  }
  return fee
}

/** What the ladder charges on a total lifetime gross. */
export function platformFeeInr(grossInr: number): number {
  return feeForSliceInr(0, Math.max(0, grossInr))
}

/** What a creator keeps of a given gross. */
export function netOfFeeInr(grossInr: number): number {
  const gross = Math.max(0, grossInr)
  return gross - platformFeeInr(gross)
}

/**
 * Attribute the ladder across a run of amounts, IN THE ORDER GIVEN, so the
 * parts sum to the ladder applied to their total. Callers own the order:
 * actual sales are passed oldest first (that is when they were charged);
 * the projection passes its rows in display order and says so on screen.
 */
export function attributeFeesInr(amounts: number[]): number[] {
  let cursor = 0
  return amounts.map(amount => {
    const fee = Math.round(feeForSliceInr(cursor, cursor + amount))
    cursor += amount
    return fee
  })
}

// ---- Payout schedule (I-9) ----

/** Payouts run weekly, on Fridays (0 = Sunday). */
export const PAYOUT_WEEKDAY = 5

/** Below this a balance stays put instead of triggering a run. */
export const PAYOUT_MINIMUM_INR = 500

export interface PayoutStatus {
  /** Epoch ms of the next run — the coming Friday, 00:00 local. */
  dueAt: number
  /** What would be disbursed then; 0 while the balance is under the minimum. */
  clearsInr: number
  /** There is a balance, but it is too small to send yet. */
  belowMinimum: boolean
  minimumInr: number
}

/**
 * The next payout run strictly after `ms` — the coming Friday at local
 * midnight. Strictly, because a run that has already started is not one a sale
 * made today can join, and "0 days away" would render as "today" every Friday
 * and invite a creator to wait for money that has no rail to arrive on.
 */
export function nextPayoutRun(ms: number): number {
  const day = new Date(ms)
  day.setHours(0, 0, 0, 0)
  const ahead = ((PAYOUT_WEEKDAY - day.getDay() + 7) % 7) || 7
  day.setDate(day.getDate() + ahead)
  return day.getTime()
}

/**
 * The schedule this ledger is built around — NOT an automated disbursement.
 * See the file header: no payout rail exists, so callers must not present this
 * as money in transit.
 */
export function payoutStatus(netInr: number, now: number): PayoutStatus {
  const balance = Math.max(0, Math.round(netInr))
  return {
    dueAt: nextPayoutRun(now),
    clearsInr: balance >= PAYOUT_MINIMUM_INR ? balance : 0,
    belowMinimum: balance > 0 && balance < PAYOUT_MINIMUM_INR,
    minimumInr: PAYOUT_MINIMUM_INR,
  }
}

/** One payout run, as the history table reads it. */
export interface PayoutPeriod {
  /** The run date this period pays on. */
  dueAt: number
  salesCount: number
  grossInr: number
  feeInr: number
  netInr: number
  /** What that run would actually send — 0 when the period is under the
   *  minimum and therefore rides into a later one. */
  clearsInr: number
  /** The date has passed. NOT "paid": nothing disburses, so a past run is
   *  money owed, and the UI has to say which of the two it means. */
  past: boolean
  belowMinimum: boolean
}

/**
 * How a run reads in one table cell. Lives here rather than in either page
 * because two surfaces render it — a creator's own hub and the platform's
 * console — and the wording is the honesty: "Owed", never "paid", because
 * nothing disburses, so a date in the past is money the platform holds for a
 * creator and not money it sent.
 */
export function payoutPeriodStatus(period: PayoutPeriod): string {
  if (period.belowMinimum) return `Under ₹${PAYOUT_MINIMUM_INR.toLocaleString('en-IN')} — rolls over`
  if (period.past) return 'Owed — not disbursed'
  return 'Scheduled'
}

/**
 * Group sales into the payout runs they would land in, newest run first.
 *
 * The input must be the rows from `deriveActualSales` — their `feeInr` is the
 * lifetime-ladder attribution, and re-deriving a fee per period would charge the
 * 15% tier again for every run. Period totals are sums of those rows, so the
 * periods add up to the ledger exactly.
 */
export function payoutPeriods(rows: SaleRow[], now: number): PayoutPeriod[] {
  const byRun = new Map<number, PayoutPeriod>()
  for (const row of rows) {
    const dueAt = nextPayoutRun(row.grantedAt)
    const period = byRun.get(dueAt) ?? {
      dueAt, salesCount: 0, grossInr: 0, feeInr: 0, netInr: 0, clearsInr: 0, past: false, belowMinimum: false,
    }
    period.salesCount += 1
    period.grossInr += row.amountPaidInr
    period.feeInr += row.feeInr
    period.netInr += row.netInr
    byRun.set(dueAt, period)
  }
  return [...byRun.values()]
    .map(p => ({
      ...p,
      past: p.dueAt <= now,
      belowMinimum: p.netInr < PAYOUT_MINIMUM_INR,
      clearsInr: p.netInr >= PAYOUT_MINIMUM_INR ? p.netInr : 0,
    }))
    .sort((a, b) => b.dueAt - a.dueAt)
}

/**
 * One weekly window of revenue, as a revenue-over-time table reads it.
 *
 * Deliberately NOT a `PayoutPeriod`: the minimum, the rollover and the
 * "owed" status are facts about ONE creator's balance, and the platform does
 * not pay itself out — a console rendering `payoutPeriodStatus` over everyone's
 * sales would claim the platform's own revenue "rolls over" under ₹500.
 * What transfers is only the time axis: the same run dates creators are told
 * about, so a figure in the console and a run in a creator's hub line up.
 */
export interface RevenuePeriod {
  /** The payout run date this window's sales belong to. */
  runAt: number
  salesCount: number
  grossInr: number
  feeInr: number
  netInr: number
}

/**
 * Group a ledger into the weekly run windows it falls in, newest first.
 *
 * `rows` must be a ledger's own rows: their `feeInr` is the lifetime-ladder
 * attribution, so the windows are sums of the ledger's rows and add up to its
 * totals exactly. Re-deriving a fee per window would charge the 15% tier again
 * for every week.
 */
export function revenuePeriods(rows: SaleRow[]): RevenuePeriod[] {
  const byRun = new Map<number, RevenuePeriod>()
  for (const row of rows) {
    const runAt = nextPayoutRun(row.grantedAt)
    const period = byRun.get(runAt) ?? { runAt, salesCount: 0, grossInr: 0, feeInr: 0, netInr: 0 }
    period.salesCount += 1
    period.grossInr += row.amountPaidInr
    period.feeInr += row.feeInr
    period.netInr += row.netInr
    byRun.set(runAt, period)
  }
  return [...byRun.values()].sort((a, b) => b.runAt - a.runAt)
}

// ---- Actual sales (I-11: per-publication revenue attribution) ----

export interface SaleRow {
  pubId: string
  title: string          // resolved by the caller from its own publications
  /** Rupees actually paid — the entitlement's price snapshot. */
  amountPaidInr: number
  /** The platform's cut on THIS sale — its own slice of the ladder. */
  feeInr: number
  /** What the creator keeps of it: amountPaidInr − feeInr. */
  netInr: number
  /** Epoch ms of the grant (sale time). */
  grantedAt: number
}

export interface ActualSales {
  /** Newest first. */
  rows: SaleRow[]
  /** Σ of what buyers actually paid (gross). */
  grossInr: number
  /** Σ of the rows' fees — the platform's cut, not a rounded integral. */
  feeInr: number
  /** gross − fee, summed over the rows. */
  netInr: number
  /** Publications with at least one sale. */
  soldPubIds: string[]
}

/** One sale, before it has a title or a fee. */
export interface SaleEntry {
  pubId: string
  amountPaidInr: number
  grantedAt: number
}

/** The ledger from raw sale entries — one ladder pass, one total rule.
 *
 *  `deriveActualSales` is this plus mapping entitlements onto entries, and the
 *  admin console's platform-wide revenue is this over everyone's rows. That is
 *  the point of the extraction: the platform's total and the sum of the
 *  creators' nets are then the SAME function, so they cannot drift apart. */
export function buildSalesLedger(entries: SaleEntry[], titleOf: (pubId: string) => string): ActualSales {
  const rows: SaleRow[] = entries.map(e => ({
    pubId: e.pubId,
    title: titleOf(e.pubId),
    amountPaidInr: e.amountPaidInr,
    feeInr: 0,
    netInr: 0,
    grantedAt: e.grantedAt,
  }))

  // Fees are attributed OLDEST FIRST, because that is the order the ladder was
  // actually walked: the sale that carried the lifetime gross past ₹25,000 is
  // the one that gets the cheaper rate, and a later re-sort for display must
  // not move a fee to a different sale.
  const chronological = [...rows].sort((a, b) => a.grantedAt - b.grantedAt)
  const fees = attributeFeesInr(chronological.map(r => r.amountPaidInr))
  chronological.forEach((row, i) => {
    row.feeInr = fees[i]!
    row.netInr = row.amountPaidInr - row.feeInr
  })

  rows.sort((a, b) => b.grantedAt - a.grantedAt)
  const grossInr = rows.reduce((s, r) => s + r.amountPaidInr, 0)
  const feeInr = rows.reduce((s, r) => s + r.feeInr, 0)
  return {
    rows,
    grossInr,
    feeInr,
    netInr: grossInr - feeInr,
    soldPubIds: [...new Set(rows.map(r => r.pubId))],
  }
}

/** Build the actual-sales ledger from the creator's entitlement rows.
 *  Titles are resolved from the creator's own publications — a publication
 *  unpublished or deleted after a sale still shows, as its row's history.
 *  Publication ids NOT in `pubs` still appear (with the id as the title)
 *  rather than vanishing from the books. */
export function deriveActualSales(entitlements: Entitlement[], pubs: PublishedItinerary[]): ActualSales {
  const titleOf = new Map(pubs.map(p => [p.id, p.title]))
  return buildSalesLedger(
    entitlements.map(e => ({ pubId: e.pubId, amountPaidInr: e.amountPaidInr, grantedAt: e.grantedAt })),
    pubId => titleOf.get(pubId) ?? pubId,
  )
}

// ---- Projection ----

export interface ProjectedEarning {
  pubId: string
  title: string
  priceInr: number
  forks: number
  grossInr: number   // price × forks
  /** The ladder applied to this row's potential, attributed in the order the
   *  rows are listed (priciest first) — illustrative, because which sale gets
   *  the lower rate depends on what actually sells first. The TOTAL is exact
   *  either way: it is the ladder over the whole potential. */
  feeInr: number
  netInr: number
}

export interface EarningsProjection {
  rows: ProjectedEarning[]     // priciest potential first
  potentialInr: number         // Σ gross
  feeInr: number               // Σ the rows' fees
  netInr: number               // potential − fee
  unpricedCount: number        // live publications published as fully free
}

export function projectEarnings(pubs: PublishedItinerary[]): EarningsProjection {
  const priced = pubs
    .filter(p => (p.premiumPriceInr ?? 0) > 0)
    .map(p => ({
      pubId: p.id,
      title: p.title,
      priceInr: p.premiumPriceInr!,
      forks: p.copies,
      grossInr: p.premiumPriceInr! * p.copies,
    }))
    .sort((a, b) => b.grossInr - a.grossInr)
  const fees = attributeFeesInr(priced.map(r => r.grossInr))
  const rows: ProjectedEarning[] = priced.map((r, i) => ({
    ...r,
    feeInr: fees[i]!,
    netInr: r.grossInr - fees[i]!,
  }))
  const potentialInr = rows.reduce((s, r) => s + r.grossInr, 0)
  const feeInr = rows.reduce((s, r) => s + r.feeInr, 0)
  return {
    rows,
    potentialInr,
    feeInr,
    netInr: potentialInr - feeInr,
    unpricedCount: pubs.filter(p => (p.premiumPriceInr ?? 0) === 0).length,
  }
}
