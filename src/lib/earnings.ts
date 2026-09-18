// ============ Creator earnings — real sales (M7) + projections ============
// Two ledgers, clearly separated:
//
//   ACTUAL — derived from entitlements rows (real money that changed hands).
//   Each row joins a sale back to its publication via `pubId`; the per-sale
//   price snapshot on the entitlement row is what was actually charged, not
//   the publication's current price (I-12). No fee model exists yet, so net
//   mirrors gross and the constant stays honestly named.
//
//   PROJECTION — price × forks, "if every fork had bought the unlock".
//   Labeled a projection in the UI; it is never money.
import type { PublishedItinerary } from '../data/types'
import type { Entitlement } from './payments'

export interface ProjectedEarning {
  pubId: string
  title: string
  priceInr: number
  forks: number
  grossInr: number   // price × forks
  netInr: number     // gross − platform fee (0 until the fee model exists)
}

export interface EarningsProjection {
  rows: ProjectedEarning[]     // priciest potential first
  potentialInr: number         // Σ gross
  netInr: number               // Σ net
  unpricedCount: number        // live publications published as fully free
}

/** Projected platform fee until M7 defines the real one. Applies to the
 *  PROJECTION view only — actuals carry the same constant until a real
 *  fee model exists, and both say so in the UI. */
export const PROJECTED_PLATFORM_FEE_INR = 0

// ---- Actual sales (I-11: per-publication revenue attribution) ----

export interface SaleRow {
  pubId: string
  title: string          // resolved by the caller from its own publications
  /** Rupees actually paid — the entitlement's price snapshot. */
  amountPaidInr: number  /** Epoch ms of the grant (sale time). */
  grantedAt: number}

export interface ActualSales {
  /** Newest first. */
  rows: SaleRow[]
  /** Σ of what buyers actually paid (gross). */
  grossInr: number
  /** gross − fee (fee is ₹0 until the real model lands). */
  netInr: number
  /** Publications with at least one sale. */
  soldPubIds: string[]
}

/** Build the actual-sales ledger from the creator's entitlement rows.
 *  Titles are resolved from the creator's own publications — a publication
 *  unpublished or deleted after a sale still shows, as its row's history.
 *  Publication ids NOT in `pubs` still appear (with the id as the title)
 *  rather than vanishing from the books. */
export function deriveActualSales(entitlements: Entitlement[], pubs: PublishedItinerary[]): ActualSales {
  const titleOf = new Map(pubs.map(p => [p.id, p.title]))
  const rows: SaleRow[] = entitlements
    .map(e => ({
      pubId: e.pubId,
      title: titleOf.get(e.pubId) ?? e.pubId,
      amountPaidInr: e.amountPaidInr,
      grantedAt: e.grantedAt,
    }))
    .sort((a, b) => b.grantedAt - a.grantedAt)
  return {
    rows,
    grossInr: rows.reduce((s, r) => s + r.amountPaidInr, 0),
    netInr: rows.reduce((s, r) => s + r.amountPaidInr, 0) - PROJECTED_PLATFORM_FEE_INR * rows.length,
    soldPubIds: [...new Set(rows.map(r => r.pubId))],
  }
}

export function projectEarnings(pubs: PublishedItinerary[]): EarningsProjection {
  const rows: ProjectedEarning[] = pubs
    .filter(p => (p.premiumPriceInr ?? 0) > 0)
    .map(p => {
      const grossInr = p.premiumPriceInr! * p.copies
      return { pubId: p.id, title: p.title, priceInr: p.premiumPriceInr!, forks: p.copies, grossInr, netInr: grossInr - PROJECTED_PLATFORM_FEE_INR }
    })
    .sort((a, b) => b.grossInr - a.grossInr)
  return {
    rows,
    potentialInr: rows.reduce((s, r) => s + r.grossInr, 0),
    netInr: rows.reduce((s, r) => s + r.netInr, 0),
    unpricedCount: pubs.filter(p => (p.premiumPriceInr ?? 0) === 0).length,
  }
}
