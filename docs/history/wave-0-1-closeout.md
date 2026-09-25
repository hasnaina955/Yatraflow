# Waves 0 and 1 — closeout record

**Closed 2026-09-25** (19:00–19:20 UTC) · **Clone:** the freebuff working clone (Windows)
**Superseded by:** nothing. This is a point-in-time record of work that completed; live state
is `gh issue list --state open` and `git log origin/test`.

The Wave 0–4 audit-fix plan lived in chat and in the predecessor handoff
(`HANDOFF-FREEBUFF.md` in the opencode clone; its successor
`HANDOFF-FREEBUFF-2.md` in the freebuff clone, uncommitted). Neither is in this repo, so this
file records what the first two waves were, what closed them, what evidence existed at the
time, and — deliberately — what was never checked.

## What the waves were

- **Wave 0 — the map batch.** Two PRs closing seven issues about the map lying quietly:
  duplicate road measurement, a vehicle switch that never re-measured, a `(0, lng)`
  placeholder leaking into trip data, unknown detours rendering as free and on-route,
  superseded searches billing quota, un-awaited Add-all writes, and a suggestion-cache hash
  that missed half the engine's inputs.
- **Wave 1 — P0 and security.** Nine issues: the preview chain discarding a staged edit, crew
  slot-votes dead end to end, decision resolution never persisting, a paid unlock that needed
  a reload, create failure/double-submit, unpublishing destroying a buyer's access with no
  refund, `invite_code` handed to anonymous callers, and a retention pruner any signed-in
  account could call to delete every creator's traffic history.

## Wave 0 — closed

| Issue | What it was | PR | Merge | Merged (UTC) |
|---|---|---|---|---|
| #323 | TripMap re-measured the road beside the workspace chain | #380 | `2bcb47d` | 10:19 |
| #328 | Superseded searches billed quota; slider unbounced; quota watch covered 1 of 3 SKUs | #380 | `2bcb47d` | 10:19 |
| #329 | Add-all fanned out un-awaited writes; single Fill had no busy guard | #380 | `2bcb47d` | 10:19 |
| #331 | Suggestion-cache hash missed half the engine inputs; dismiss re-billed a full scan | #380 | `2bcb47d` | 10:19 |
| #324 | Vehicle switch never re-measured; three mode sets disagreed | #399 | `5550fae` | 10:20 |
| #326 | `(0, lng)` placeholder leaked into trip data; vote paths skipped the coord check | #399 | `5550fae` | 10:20 |
| #327 | Unknown detour rendered as on-route at zero cost; budget never filled | #399 | `5550fae` | 10:20 |

## Wave 1 — closed

| Issue | What it was | PR | Merge | Merged (UTC) |
|---|---|---|---|---|
| #334 | A second edit while the preview was open silently discarded the first | #431 | `7a50209` | 14:46 |
| #432 | Resolving a decision never persisted — `resolved_option_id` was `uuid`, option ids are text | #433 | `d996b4b` | 15:31 |
| #335 | `addDecision` rewrote option ids; crew slot-votes were dead end to end | #434 | `7b66120` | 16:44 |
| #349 | Post-unlock the page stayed locked and a buyer's fork yielded placeholders | #435 | `5ff4f4c` | 15:51 |
| #374 | A failed save still routed into the workspace, with no rollback | #436 | `8e69738` | 16:48 |
| #373 | Double-submit minted twin trips; no submitting state on either button | #436 | `8e69738` | 16:48 |
| #350 | Unpublishing destroyed paid buyers' access with no refund | #437 | `36f4975` | 17:29 |
| #351 | The public RPC returned the whole trip row, `invite_code` included, to anonymous callers | #438 | `46a4862` | 17:51 |
| #356 | `prune_pub_events` was callable by any signed-in user and deleted everyone's history | #441 | `1dc3b74` | 18:26 |

Every issue above is CLOSED in the tracker, and every PR is MERGED into `test`. Wave 0's PRs
merged before the auto-close workflow existed (#429, `6897a95`), so their issues were closed
by hand; from #431 onward the workflow closed them and left a landing comment.

## Evidence that existed at close

- **The gate.** Each PR ran `npm run verify` locally (tsc clean → node suite → production
  build) and passed CI's `Verify` job, Codacy and Vercel before merge. The suite stood at
  **2245 tests / 166 files** at the last of these merges.
- **Migration ledger** (`npm run check:migrations`, re-read 2026-09-25 19:0x):
  **29 migrations · 14 applied · 0 missing · 15 no probe surface (1 optional) · 0 unchecked.**
  Every probe-able migration is live.
- **#432's column type, probed rather than assumed.** That migration only alters a column
  type, so the ledger cannot see it (presence proves nothing) and its absence would fail at
  call time with `22P02`. Discriminated against PostgREST directly:
  `resolved_option_id=eq.opt_abc123` → **200 `[]`** (a `uuid` column cannot parse that),
  control `trip_id=eq.opt_abc123` → **400 `22P02`**, control `no_such_col` → **400 `42703`**
  (a different code, so a 400 is not ambiguous). The column is `text`: applied.
- **#350's policy** shipped as `20260925_publication_soft_unpublish.sql` — probe-able, and
  the ledger reports its artifact present.
- **The three function-only migrations** (#351's, #356's, #352/#353's) are declared rather
  than probed, each pinned by its own suite and by `tests/rls_contract.test.sql`.
- **Live anonymous probes** (the same shape a visitor gets):
  - #351 — `get_public_trip` serves the 31-column list with `invite_code` absent.
  - #356 — anon call returns `42501 permission denied for function prune_pub_events`
    (HTTP 401) while the function itself is intact.
  - #352/#353 — on a priced publication (`premium_price_inr=199`, `free_day_indexes=[0]`):
    expenses **0** (was 10, ₹48,750), fixed commitments **0** (was 3, two on a locked day with
    their notes intact), 11 locked stops still stubbed, price still served, and one real-notes
    free-day teaser kept. A free publication still serves all five free days.
- **Non-vacuity.** The new suites were each shown red against pre-fix source (the grant
  reverted for #356; the pre-fix bodies for the others), so a green run means the assertion
  binds rather than that the test is inert.

## Owed at close — recorded, not hidden

"Closed" here means: merged, gate green, issue closed, and the live probes above. It does
**not** mean a person drove each surface in a browser. Outstanding:

| Item | What is missing |
|---|---|
| #432 / #335 | Resolve a decision on a seeded trip → reload → still resolved; then the map rail round-trip (raise a slot poll → chip reads "Voting · 1 of N" → resolve → the stop lands in that slot). |
| #349 | Unlock a priced plan → the page body unlocks with no reload; fork → full days, no placeholders; signed-out fork → placeholders stay. |
| #374 / #373 | Go offline → submit → stay on the form with inputs intact and an error chip; Try again offline → still on the form; back online → Try again → exactly ONE trip survives reload. Double-click Start planning on a throttled network → one trip. |
| #334 | Stage an add → drag a stop (combined delta); rename / ride-start / status-flip while previewing → refused; Keep after a decision resolved in another tab → stale-base refusal; trip switch with the preview open → dropped with a toast. |
| #353 | The malformed-row path (`free_day_indexes` holding a number or an object) was never exercised against a real row — the clone has no write key. The deployed `prosrc` query is the alternative proof. |

Two findings from this stretch were never filed: a hardcoded invite code in
`tests/forkPersist.test.ts` and `tests/join-invite.test.ts` fixtures (at least one appears to
be a real live code), and a pre-existing double-toast on an un-migrated database.

**Not part of these waves:** #427 (the v0.65.0 create funnel deployed but dark, because
`VITE_CREATE_FUNNEL` was never set in Vercel) remains the repo's only open P0. Its repo half
merged as #443 (`6a46306`) — the switch documented in `docs/DEPLOYMENT.md`, a three-way
parity test, and a production-only build warning — but the funnel stays dark until the
variable is set and the production build is redeployed.

## Refs deleted at this closeout

Gated per the convention in [`branch-prunes.md`](branch-prunes.md): each verified an ancestor
of `origin/test` immediately before deletion, each with no open PR, SHAs recorded first.
Remote heads went **14 → 11**.

| Branch | Head SHA | Owning PR |
|---|---|---|
| `fix/map-core-flaws` | `7a57f642143bd297f2b52950847535a455827992` | #380 |
| `fix/map-safety-batch` | `8f0601566c5a3bf030ccd8c708fb0c99c319de9d` | #399 |
| `fix/public-unlock-freshness` | `e83cb5a05498a972e20803873b59391413c25223` | #435 |

The other eleven Wave 0/1 branches were already gone at merge time, the convention now being
to prune a branch as its PR lands. Kept on purpose, as ever: `refactor/brand-seam` and
`explore/landing-hero-local` (no PR has ever existed, so the branch is the only copy),
`feat/share-preview-og` (closed as superseded — the counter-example warning), and every branch
whose PR is open.
