# Merged branches pruned on 2026-09-20

Point-in-time record. The refs below were deleted from `origin` on **2026-09-20**; this file
is what keeps that reversible in writing. `main` was `55efd21` and `test` `e5bba2a` at the
moment of the prune.

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

## How to recover one

Two independent paths, either of which works after the prune:

- **From the PR** — GitHub keeps `refs/pull/<n>/head` for merged *and* closed PRs, so the
  exact head comes back with `git fetch origin pull/<n>/head`. Verified on the remote for
  #235, #254, #261 and #265, including #235, which was closed without merging.
- **From `main`** — every SHA above is an ancestor of `main`, so
  `git branch <name> <sha>` restores the ref from what production already holds.

The PR is the durable artifact; the branch name was only ever a temporary pointer to it.

## Not pruned, and why

| Branch | Reason kept |
|---|---|
| `main`, `test` | the two long-lived refs |
| `docs/creator-market-research` | #254 merged into `test`, not yet in `main` |
| `fix/explore-clipping` | #261 merged into `test`, not yet in `main` |
| `feat/settle-nudge-decision-comments` | PR #268 open |
| `fix/onboarding-design-audit` | PR #269 open |
| `refactor/brand-seam` | archived by decision; no PR ever, so the branch was the only remote copy of its commit |
| `explore/landing-hero-local` | landing-page experiment; no PR ever, same single-copy situation |
| `feat/share-preview-og` | PR #235 closed as superseded; kept as the counter-example whose `api/i.js`/`shareUrl.ts` must not be merged over the versions that landed |
