// ============ Publication funnel: views → forks → unlocks (I-22 / I-15) ======
//
// The per-publication funnel a creator can act on: which of their published
// plans gets seen, which gets taken, which gets paid for.
//
// WHERE EACH STAGE COMES FROM — they do not come from the same place, and
// pretending they do is how this kind of view goes wrong:
//
//   views, forks — the DATED event log (`pub_events`, read per day through
//     `get_creator_funnel`). The lifetime counters on the publication row
//     still exist and are still shown, but they carry no time dimension, so a
//     funnel drawn from them could only ever say "all time" — and a window
//     cannot be recovered from a total afterwards.
//
//   unlocks — the SALES LEDGER (`entitlements`, read through
//     `get_creator_sales`), windowed by `grantedAt` against the same boundary.
//     Deliberately NOT re-recorded as an event: a sale already IS a dated row,
//     and a second copy would be a second source of truth for the same money.
//     Rupees stay the Earnings tab's job — this counts unlocks, it does not
//     price them.
//
// TWO RULES the numbers obey:
//
//   1. A ZERO DENOMINATOR IS ZERO, NEVER NaN. A publication with no recorded
//      traffic renders 0%, not "—" and not a crash, and `conversionPct` is the
//      one place that decides it.
//
//   2. THE STAGES ARE NOT FORCED TO BE MONOTONE, and the fork rate can honestly
//      exceed 100%. A fork needs no visit: Explore's card carries its own Fork
//      CTA, while a visit is counted once per browser session on the plan's own
//      page. Clamping the rate at 100 would hide a real, fixable product fact
//      (people fork from the card without reading the plan), so the rate is
//      computed straight and `forksExceedViews` names the case for the UI to
//      explain rather than the arithmetic to hide.
//
// WHAT IT WILL NOT DO: invent a stage. There is no "unlock started" or
// "paywall seen" event to read, so this funnel begins at a visit and ends at a
// sale; nothing here guesses at the drop-off in between.

/** A recorded day, as `get_creator_funnel` returns it. */
export interface FunnelDailyRow {
  pubId: string
  /** `YYYY-MM-DD`, the UTC day the SQL bucketed into. */
  day: string
  views: number
  forks: number
}

/** One sale, reduced to what a funnel counts. */
export interface FunnelSale {
  pubId: string
  grantedAt: number
}

/** A publication as the funnel needs it: identity, price, and the lifetime
 *  counters that PREDATE the event log (shown as history, never as a window). */
export interface FunnelPub {
  id: string
  title: string
  priceInr: number | null
  lifetimeViews: number
  lifetimeForks: number
}

export interface PubFunnel {
  pubId: string
  title: string
  priceInr: number | null
  /** Recorded INSIDE the window. */
  views: number
  forks: number
  unlocks: number
  /** The publication's own lifetime totals, for the history line — not the
   *  window's numbers, and not comparable to them. */
  lifetimeViews: number
  lifetimeForks: number
  lifetimeUnlocks: number
  /** Each is a percentage of the stage before it; 0 when the denominator is 0. */
  forkRatePct: number
  unlockRatePct: number
  viewToUnlockPct: number
  /** Forks outnumber visits — possible for a real reason (see the header). */
  forksExceedViews: boolean
  /** Earliest day the log holds for this publication within the fetched range,
   *  or null when it holds none. Lets the UI date what it is showing. */
  recordingSinceDay: string | null
  /** No recorded step at all in the fetched range. Distinct from a window with
   *  no traffic: this is a publication whose trend nothing can speak for yet. */
  unreported: boolean
}

/** The windows the hub offers. Days, so the label and the arithmetic cannot
 *  drift apart. */
export const FUNNEL_WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const

export type FunnelWindowDays = (typeof FUNNEL_WINDOWS)[number]['days']

/** UTC midnight of `ms` — the same bucketing the SQL does (`at time zone
 *  'utc'` then `::date`), so the client's window and the server's buckets agree
 *  on where a day begins. Mixing a local-midnight window with UTC buckets would
 *  put today's traffic in or out of the window depending on the reader's
 *  timezone. */
export function utcDayStart(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** The first instant a `days`-day window includes: the start of the day
 *  `days - 1` back, so a 7-day window is seven whole UTC days INCLUDING today
 *  — what a reader means by "last 7 days". */
export function funnelWindowStart(days: number, now: number): number {
  return utcDayStart(now) - (Math.max(1, Math.floor(days)) - 1) * 86400000
}

/** A stage's conversion. Rule 1 lives here: a missing denominator reads 0, and
 *  the result is never NaN or Infinity. Not clamped — see rule 2. */
export function conversionPct(from: number, to: number): number {
  if (!(from > 0)) return 0
  return (to / from) * 100
}

/** `YYYY-MM-DD` for an epoch ms, matching the day keys the RPC returns. */
export function utcDayKey(ms: number): string {
  return new Date(utcDayStart(ms)).toISOString().slice(0, 10)
}

/**
 * The per-publication funnel over a window.
 *
 * Returns one entry per publication GIVEN, in the order given — including ones
 * with nothing to show, because a publication missing from a list of a
 * creator's own plans reads as a bug rather than as an empty funnel.
 *
 * Unlocks whose publication is not in `pubs` are ignored: both reads are scoped
 * server-side to the same live publications, so that pair cannot occur, and
 * inventing a row for one would be a phantom in a creator's dashboard.
 */
export function buildPubFunnels(input: {
  daily: readonly FunnelDailyRow[]
  sales: readonly FunnelSale[]
  pubs: readonly FunnelPub[]
  days: number
  now: number
}): PubFunnel[] {
  const { daily, sales, pubs, days, now } = input
  const start = funnelWindowStart(days, now)

  // Fold the day rows once: windowed totals, lifetime-in-range totals, and the
  // earliest day per publication (which is what dates the trend).
  const inWindow = new Map<string, { views: number; forks: number }>()
  const inRange = new Map<string, { views: number; forks: number }>()
  const earliestDay = new Map<string, string>()
  for (const row of daily) {
    const at = Date.parse(`${row.day}T00:00:00Z`)
    const bucket = inRange.get(row.pubId) ?? { views: 0, forks: 0 }
    bucket.views += row.views
    bucket.forks += row.forks
    inRange.set(row.pubId, bucket)
    if (Number.isFinite(at) && at >= start) {
      const w = inWindow.get(row.pubId) ?? { views: 0, forks: 0 }
      w.views += row.views
      w.forks += row.forks
      inWindow.set(row.pubId, w)
    }
    const prev = earliestDay.get(row.pubId)
    if (!prev || row.day < prev) earliestDay.set(row.pubId, row.day)
  }

  const unlocksInWindow = new Map<string, number>()
  const unlocksInRange = new Map<string, number>()
  for (const sale of sales) {
    unlocksInRange.set(sale.pubId, (unlocksInRange.get(sale.pubId) ?? 0) + 1)
    if (sale.grantedAt >= start) {
      unlocksInWindow.set(sale.pubId, (unlocksInWindow.get(sale.pubId) ?? 0) + 1)
    }
  }

  return pubs.map(pub => {
    const windowed = inWindow.get(pub.id) ?? { views: 0, forks: 0 }
    const lifetime = inRange.get(pub.id)
    const views = windowed.views
    const forks = windowed.forks
    const unlocks = unlocksInWindow.get(pub.id) ?? 0
    return {
      pubId: pub.id,
      title: pub.title,
      priceInr: pub.priceInr,
      views,
      forks,
      unlocks,
      lifetimeViews: pub.lifetimeViews,
      lifetimeForks: pub.lifetimeForks,
      lifetimeUnlocks: unlocksInRange.get(pub.id) ?? 0,
      forkRatePct: conversionPct(views, forks),
      unlockRatePct: conversionPct(forks, unlocks),
      viewToUnlockPct: conversionPct(views, unlocks),
      forksExceedViews: forks > views,
      recordingSinceDay: earliestDay.get(pub.id) ?? null,
      unreported: !lifetime || (lifetime.views === 0 && lifetime.forks === 0),
    }
  })
}

/** Percentages as a reader expects them — one decimal only when it carries
 *  information ("9.2%", "0.4%", "12%"). Shared so two surfaces cannot round the
 *  same rate differently. */
export function formatPct(pct: number): string {
  if (!(pct > 0)) return '0%'
  const rounded = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)
  return `${rounded.replace(/\.0$/, '')}%`
}
