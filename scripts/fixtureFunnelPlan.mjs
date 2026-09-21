// ============================================================================
// YatraFlow — the creator fixture's TRAFFIC plan (the funnel's event log)
// ============================================================================
// A separate module from `seedCreatorFixture.mjs` for one reason: this file is
// PURE. The fixture script runs its whole seed on import (it has to — it is a
// CLI), so a test cannot import it to check its numbers. This file has no I/O,
// no env, no side effects, which lets BOTH of them read the same plan:
//
//   * `scripts/seedCreatorFixture.mjs` seeds these events, so the hub's
//     Visits → Forks → Unlocks window renders a real trend instead of an empty
//     one; and
//   * `tests/pub-funnel.test.ts` runs the SHIPPED derivation
//     (`src/lib/pubFunnel.ts`) over the same events, which is what makes the
//     browser check have an answer key rather than an opinion.
//
// WHY SHARE RATHER THAN COPY: the repo's earlier fixture pinned its five SALES
// by writing them out again inside `tests/earnings.test.ts`. That works, but it
// is two copies of one plan and only a human stops them drifting. Events are
// cheap to generate, so they are generated once, here.
//
// WHAT THE SHAPE IS FOR — three things the hub's screen needs to be honest:
//
//   1. A RAMP, so the 7 / 30 / 90-day windows differ. A flat plan makes every
//      window show the same number, which looks like a rendering bug and proves
//      nothing about the window control.
//   2. SOME ZERO DAYS EARLY ON (the ramp starts tiny), so the log has a real
//      "recording since" date rather than claiming traffic on day one.
//   3. DIFFERENT RATES PER PUBLICATION, so the rows are not interchangeable:
//      the cheap plan gets more visits, the dearer one converts better per
//      visit. A fixture where every plan funnels identically cannot show a
//      creator which of their plans is working.
//
// DETERMINISTIC ON PURPOSE: no `Math.random`, so the numbers a test pins are
// the numbers the fixture writes, every run.
//
// UTC-ALIGNED ON PURPOSE: buckets are laid out from UTC midnight and spread
// WITHIN a day, because `get_creator_funnel` buckets with `at time zone 'utc'`
// and `funnelWindowStart` counts whole UTC days. Local-midnight timestamps would
// put a day's events in the neighbouring bucket for anyone east of Greenwich.
// ============================================================================

const DAY_MS = 86_400_000

/** UTC midnight of `ms` — the same day boundary the SQL and `pubFunnel.ts` use. */
function utcDayStart(ms) {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * One plan per publication SLUG (the same key `--clean` and the re-run guard
 * already match on, so a plan cannot silently belong to nothing).
 *
 * `viewsFrom`/`viewsTo` are the ends of a linear ramp over `days`; `weekendViews`
 * is added on Saturday and Sunday, scaled by the same progress so the log's
 * early days stay quiet; `forkRate` is applied with a running carry so a rate
 * like 0.13 produces the right TOTAL over the run instead of rounding to zero
 * every day (which is what `Math.round(views * rate)` alone would do at 1–3
 * views a day).
 */
export const FUNNEL_PLAN = {
  kerala: { days: 100, viewsFrom: 1, viewsTo: 6, weekendViews: 2, forkRate: 0.13 },
  goa: { days: 100, viewsFrom: 0, viewsTo: 3, weekendViews: 1, forkRate: 0.20 },
  spiti: { days: 100, viewsFrom: 0, viewsTo: 2, weekendViews: 0, forkRate: 0.08 },
}

/** `n` events for one publication spread across one UTC day.
 *
 *  `at > now` is SKIPPED, and that guard is load-bearing rather than tidy: the
 *  events are spread through the day, so on a run early in the UTC day the tail
 *  of "today" would otherwise be timestamped in the future — an event that
 *  claims a visit nobody could have made yet, and which inflates the window. */
function spread(pubId, kind, dayStart, n, now) {
  const out = []
  for (let i = 0; i < n; i++) {
    const at = dayStart + Math.round(((i + 1) / (n + 1)) * DAY_MS * 0.9)
    if (at > now) continue
    out.push({ pub_id: pubId, kind, at: new Date(at).toISOString() })
  }
  return out
}

/**
 * The `pub_events` rows for one publication, oldest day first.
 *
 * Row shape matches the table exactly (`pub_id`, `kind`, `at`) so the fixture can
 * hand these straight to either transport, and so the SQL it prints for a
 * keyless machine names the same columns the elevated writer sends.
 */
export function planFunnelEvents({ slug, pubId, now }) {
  const plan = FUNNEL_PLAN[slug]
  if (!plan) throw new Error(`no funnel plan for "${slug}" — add it to FUNNEL_PLAN`)
  const rows = []
  let forkCarry = 0
  const oldest = utcDayStart(now) - (plan.days - 1) * DAY_MS
  for (let i = 0; i < plan.days; i++) {
    const dayStart = oldest + i * DAY_MS
    const progress = plan.days === 1 ? 1 : i / (plan.days - 1)
    const ramp = plan.viewsFrom + (plan.viewsTo - plan.viewsFrom) * progress
    const dow = new Date(dayStart).getUTCDay()
    const weekend = dow === 0 || dow === 6 ? plan.weekendViews * progress : 0
    const views = Math.max(0, Math.round(ramp + weekend))
    const exact = views * plan.forkRate + forkCarry
    const forks = Math.floor(exact)
    forkCarry = exact - forks
    rows.push(...spread(pubId, 'view', dayStart, views, now))
    rows.push(...spread(pubId, 'fork', dayStart, forks, now))
  }
  return rows
}

/** All-time views/forks in a set of rows — what the publication row's lifetime
 *  counters are set to, so the hub's history line and its window agree instead
 *  of contradicting each other. */
export function funnelTotals(rows) {
  let views = 0
  let forks = 0
  for (const r of rows) {
    if (r.kind === 'view') views += 1
    else if (r.kind === 'fork') forks += 1
  }
  return { views, forks }
}

/**
 * What sits inside a `days`-day window — the same boundary rule as
 * `funnelWindowStart` in `src/lib/pubFunnel.ts`.
 *
 * This duplication is DELIBERATE and it is the cross-check: the test runs this
 * helper and the shipped derivation over the same rows and asserts they agree,
 * so if the shipped window rule ever moves (a different day boundary, an
 * inclusive/exclusive flip), the browser's answer key fails instead of quietly
 * describing a window the app no longer computes.
 */
export function windowTotals(rows, days, now) {
  const start = utcDayStart(now) - (Math.max(1, Math.floor(days)) - 1) * DAY_MS
  let views = 0
  let forks = 0
  for (const r of rows) {
    const at = Date.parse(r.at)
    if (!(at >= start)) continue
    if (r.kind === 'view') views += 1
    else if (r.kind === 'fork') forks += 1
  }
  return { views, forks }
}

/** The windows the hub offers, so the fixture prints what the pills show. */
export const PLAN_WINDOWS = [7, 30, 90]
