# Merged branches pruned — the running record

Point-in-time record. Two prunes happened on **2026-09-20**: the batched sweep of 17 refs
below, and then — under the convention that sweep introduced — a single branch pruned at the
moment its PR merged. A third sweep, recorded in its own section below, pruned the three
`test`-merged hold-outs on **2026-09-22**, once the v0.65.0 promotion made their work
ancestors of `main`. This file is what keeps all of it reversible in writing. `main` was
`55efd21` on 2026-09-20 and `3893ccc` at the 2026-09-22 sweep; `test` was `e5bba2a` during
the first sweep and `9bac779` at the second prune.

## Why these, and why it was safe

Until this date the repo kept every merged branch as archaeology — 26 remote heads, of which
21 described work already contained in `main` or `test`. The 17 below were each verified as
an ancestor of `origin/main` immediately before deletion (`git merge-base --is-ancestor
origin/<branch> origin/main`, all exit 0), which is the strict test: **every commit on them
was already reachable from production**, so deleting the ref removed no content at all.
Their PRs merged via merge commits rather than squash, so nothing was orphaned.

The prune is deliberately partial. Two branches merged into `test` but not yet into `main`
(`docs/creator-market-research` #254, `fix/explore-clipping` #261) were **kept** until the
next promotion, and the branches with unmerged or superseded work were kept outright — see
"Not pruned" below. The argument for the sweep was redundancy, not rot: nothing here was
stale by age, the oldest being nine days old.

## The 17 deleted refs

| Branch | Head SHA | Owning PR |
|---|---|---|
| `audit/ui-complete-2026-09` | `817699daeff5d16795adc8d65fb8100d92be3735` | #257 |
| `chore/untrack-verdent-scratch` | `afb02c012e8a927585021712661e73fbe492a400` | #263 |
| `ci/verify-prs-into-test` | `f1a74760042cfc27a6bd0328b51be3be6538f9b5` | #266 |
| `docs/commercial-launch-docs` | `17a7908c47a6d5c46ec15d0da30960868a524c39` | #214 |
| `feat/clock-living-plan` | `821ee8f1874f1277b35e2c59efef92f18ef4134c` | #262 |
| `feat/clock-map-zones` | `16742e7c25b59405e0813c97be935497677cdf67` | folded into #262 |
| `feat/itinerary-import-v2` | `17640d5c4f87a20d03277ee78efb5d70f7f5764d` | #253 |
| `feat/payments-rail` | `c9487be60e4fbd4f87304b209644bce0f674cc1a` | #251 |
| `feat/seo-discovery` | `358db2e840ec70b82f5d0f82e761866fa23f9b85` | #258 |
| `feat/together-rls-suite` | `2c2cfc7476e5b35fcf2ce3da1cdc335c29fed0c0` | #249 |
| `fix/map-polyline-perf` | `2bbd6edb03b3ac42f473e205c8f3796aaf383d29` | #224 |
| `fix/paywall-rpc-literal` | `1d4467f5f64257ae3fa0132052ab5d2721635da9` | #256 |
| `fix/public-address-bar` | `909c450d4722e81dd66594ad53d557bb119771d1` | #246 |
| `fix/public-surfaces-audit` | `5c69080f4e086eba36597f295b9905983f76a86d` | #250 |
| `freebuff/m6-together` | `eac92eab66728f78d7f781a39c0f55fc4b5cbb4e` | #265 |
| `refactor/design-baseline-selector-keys` | `e05c97f425a7165e75f9f9f173a750e3e7ff2601` | #264 |
| `refactor/map-rail-calm` | `bcf139822458c41545e0b3baaea4604b2edfa340` | #260 |

## Pruned at merge: `feat/settle-nudge-decision-comments` (#268)

The sweep above was a one-off cleanup; this is the first application of the convention it left
behind — **a merged branch is pruned at merge**, because the branch name was only ever a
pointer and the PR is the archaeology. PR #268 merged into `test` as `9bac779`, and its head
was deleted within minutes of the merge.

| Branch | Head SHA | Owning PR |
|---|---|---|
| `feat/settle-nudge-decision-comments` | `607d52fd4bdaf879a685b094d4bbdf314a06f18d` | #268 |

The same pre-flight gate ran, and aborts wholesale on any of its checks: the ref still pointed
at the exact SHA that merged (`607d52f`, not advanced since), no PR was open against the
branch, and `refs/pull/268/head` resolved before deletion.

**One honest difference from the 17 above: this branch is not reachable from `main`.** It
merged into `test` (`9bac779`, 25 commits ahead of `main` at `55efd21`), so it is an ancestor
of `test` only — the "from `main`" recovery path did not apply to it until the next
promotion. The PR path did, and was verified. (It reached `main` with the v0.65.0 promotion,
PR #304, so both paths answer for it now.)

## Pruned at the v0.65.0 promotion (2026-09-22): the three `test`-merged hold-outs

The 2026-09-20 sweep deliberately kept branches whose work had merged into `test` but not yet
into `main`. **PR #304** (the v0.65.0 promotion, `main` and `test` both at `3893ccc`, merged
2026-09-22 16:01 UTC) made all of that work ancestors of `main`, and these three refs were
pruned in its wake. Verified gone 2026-09-22 via `git ls-remote --heads origin` — **5 heads
remain**: `main`, `test`, and the three kept-on-purpose branches in "Not pruned" below.

| Branch | Head SHA | Owning PR |
|---|---|---|
| `docs/creator-market-research` | `09c57d047011efd05929df28dc5db42696764e37` | #254 (→ `test`, merged 2026-09-20) |
| `fix/explore-clipping` | `da0e724e7b339ac5528f98c575b2a3e8fac7ba59` | #261 (→ `test`, merged 2026-09-20) |
| `fix/onboarding-design-audit` | `9270a2e4e974c5010312ec31b0a811b9981cdb51` | #269 (→ `test`, merged 2026-09-20) |

The deleted refs cannot be re-inspected, so each SHA above is its PR's head as GitHub
recorded it (`gh pr view <n> --json headRefOid`), not a fresh ref read. Both recovery paths
answer for all three, and were checked 2026-09-22: `refs/pull/<n>/head` resolves for #254,
#261 and #269, and the compare API reports `main` strictly ahead of each SHA
(`behind_by` 0) — every commit on them is reachable from production.

## How to recover one

Two independent paths, either of which works after the prune:

- **From the PR** — GitHub keeps `refs/pull/<n>/head` for merged *and* closed PRs, so the
  exact head comes back with `git fetch origin pull/<n>/head`. Verified on the remote for
  #235, #254, #261 and #265, including #235, which was closed without merging.
- **From `main`** — every SHA in the 17-ref sweep above is an ancestor of `main`, so
  `git branch <name> <sha>` restores the ref from what production already holds. (The #268
  entry and the three 2026-09-22 hold-outs reached `main` with the v0.65.0 promotion — the
  compare checks in that section are the proof.)

The PR is the durable artifact; the branch name was only ever a temporary pointer to it.

## Not pruned, and why

| Branch | Reason kept |
|---|---|
| `main`, `test` | the two long-lived refs |
| `refactor/brand-seam` | archived by decision; no PR ever, so the branch was the only remote copy of its commit |
| `explore/landing-hero-local` | landing-page experiment; no PR ever, same single-copy situation |
| `feat/share-preview-og` | PR #235 closed as superseded; kept as the counter-example whose `api/i.js`/`shareUrl.ts` must not be merged over the versions that landed |
