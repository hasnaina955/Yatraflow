# Merged branches pruned on 2026-09-20

Point-in-time record. Two prunes happened on **2026-09-20**: the batched sweep of 17 refs
below, and then — under the convention that sweep introduced — a single branch pruned at the
moment its PR merged. This file is what keeps both reversible in writing. `main` was `55efd21`
throughout; `test` was `e5bba2a` during the sweep and `9bac779` at the second prune.

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
of `test` only — the "from `main`" recovery path does not apply to it until the next
promotion. The PR path does, and was verified.

## How to recover one

Two independent paths, either of which works after the prune:

- **From the PR** — GitHub keeps `refs/pull/<n>/head` for merged *and* closed PRs, so the
  exact head comes back with `git fetch origin pull/<n>/head`. Verified on the remote for
  #235, #254, #261 and #265, including #235, which was closed without merging.
- **From `main`** — every SHA in the 17-ref sweep above is an ancestor of `main`, so
  `git branch <name> <sha>` restores the ref from what production already holds. (The #268
  entry is not in `main` yet — use the PR path for that one.)

The PR is the durable artifact; the branch name was only ever a temporary pointer to it.

## Not pruned, and why

| Branch | Reason kept |
|---|---|
| `main`, `test` | the two long-lived refs |
| `docs/creator-market-research` | #254 merged into `test`, not yet in `main` |
| `fix/explore-clipping` | #261 merged into `test`, not yet in `main` |
| `fix/onboarding-design-audit` | PR #269 open |
| `refactor/brand-seam` | archived by decision; no PR ever, so the branch was the only remote copy of its commit |
| `explore/landing-hero-local` | landing-page experiment; no PR ever, same single-copy situation |
| `feat/share-preview-og` | PR #235 closed as superseded; kept as the counter-example whose `api/i.js`/`shareUrl.ts` must not be merged over the versions that landed |

---

# Merged branches pruned on 2026-09-22

Point-in-time record: the sweep after the **v0.65.0** promotion (`3893ccc`). 41 remote heads
before, **5** after — `main`, `test`, and the three keeps from the section above
(`refactor/brand-seam`, `explore/landing-hero-local`, `feat/share-preview-og`). PR **#294**
was closed by hand first (with a comment recording that the queue integration merged its
branch directly), so the gate's open-PR check ran against the real world.

## Why these, and why it was safe

One scripted pre-flight that aborts wholesale, per the AGENTS prune gate: each of the 36 was
verified (a) an ancestor of `origin/main` **or** `origin/test` (both `3893ccc` after the
promotion), (b) with **no open PR**, and (c) with PR history present — or, for the two
never-PR'd refs, ancestry alone, which is the strict test (their commits are reachable from
`main`). All 36 passed. This is not an age-based cleanup: `docs/roadmap-slots-decisions` was
four days old and went for merged-ness alone.

Two mechanics this sweep taught (now rules in AGENTS §1.1):

1. **Enumerate with `git ls-remote --heads origin`**, not `for-each-ref refs/remotes/origin` —
   the namespace's own `origin/HEAD` prints as a phantom `origin` "branch", passes an ancestry
   check (it carries `main`'s SHA), and cannot be deleted: one un-deletable name in a batched
   `git push --delete` **aborts the entire sweep** (the first attempt deleted nothing).
2. **Record every head SHA before deleting** — a successful `push --delete` also prunes the
   local remote-tracking refs. The SHAs below come from each PR's `head.sha` (GitHub keeps
   `refs/pull/<n>/head` after branch deletion, so every deleted head stays fetchable).

Note: three rows of the "Not pruned" table above expired and were pruned here —
`docs/creator-market-research` (#254) and `fix/explore-clipping` (#261) at this promotion,
`fix/onboarding-design-audit` (#269) at its merge. Local refs were **not** touched:
`feat/migration-status-check` and `fix/map-day-fit` remain as local branches — and the latter
carries two unpushed coordinate commits (`55a3a5a`, `7845d0e`) whose only copy is this clone.

## The 36 deleted refs

| Branch | Head SHA | Owning PR |
|---|---|---|
| `cline/g9wfhxqs` | `68c3764df212952b9001b7254a91009d3a6ba935` | — (no PR; cline artifact of `feat/ai-companion-m5`, same head) |
| `docs/creator-market-research` | `09c57d047011efd05929df28dc5db42696764e37` | #254 |
| `docs/roadmap-slots-decisions` | `23a9d0df701f925cd2d7d9f5b41af08cbfae4ad5` | #299 |
| `feat/admin-revenue` | `32fa5d0d5bc89def53d5f472c86c47ffedabb97e` | #277 |
| `feat/agents-sandbox-docs` | `30be334aeb27b80bb98e0df1199e6fb96ce79a51` | #280 |
| `feat/ai-companion-m5` | `68c3764df212952b9001b7254a91009d3a6ba935` | #289 |
| `feat/console-by-pub` | `c5d839032bfba687a701035e5b0062942b150352` | #284 |
| `feat/create-funnel-p1` | `6453ff199a88d72cffc0e3e25f02f850d85f9751` | #302 |
| `feat/day-slots-engine` | `3b6a814df5c95419005d0afcae612e843b11176f` | #271 |
| `feat/doc-drift-gate` | `8aeb913fd0902cb7b3e46b484674ec6794c31fbf` | #282, #278 |
| `feat/fee-ladder-payouts` | `5df9d357d9a6525c11391cc1fba51cdc7fdb2086` | #276 |
| `feat/fixture-kit` | `7a26605adc6e0468c4b9681f09ed2e16d9b46a5e` | #286 |
| `feat/fixture-v2` | `f1bdb9faf61b6574ff088bdc7c690989510d198c` | #283 |
| `feat/funnel-record` | `76cb93cb5cf8bb583c6cc4e04d96f791022e2e3f` | #281 |
| `feat/funnel-surface-retention` | `3fd1106df754ee0cd917c6fed73a0f30ea12bacc` | #285 |
| `feat/i21-share-card` | `ee55e799baad74ee00cc7aa97d9075359e7dc938` | #275 |
| `feat/m6-followups-i19-i16` | `643cbd537b2c66ba2d21d8e02d51f219b048303e` | #272 |
| `feat/map-search-fixes` | `43f2a8ce8c5fe317d9a78cf932a055171276e7c4` | #274 |
| `feat/map-slot-search` | `97a96cfde4297c3e8410a5374631ec8381a11379` | #301 |
| `feat/offline-read` | `50724b39536896c941b226624049c53d97892da4` | #294 |
| `feat/purchases-shelf-i20` | `372826e246afd33a1928870c29572041bf51dea1` | #273 |
| `feat/pwa-shell` | `b9ad58269d178b984f6f64e200e9d0cb0feb863e` | #293 |
| `fix/agents-recipe-and-eol` | `b7719bb2954462a02d705e1726daca9e54af0c52` | #288 |
| `fix/apk-native-shell` | `1d28676d7a3c1d8755981e5be30d5915acd3e49c` | #290 |
| `fix/board-kind-glyphs` | `4e25744c0b116651a9de0c7c9f174bfa7e3d674c` | #296 |
| `fix/design-language-audit` | `f613d9e9d1fc0ad93a837c92710c347bca1ee880` | #292 |
| `fix/explore-clipping` | `da0e724e7b339ac5528f98c575b2a3e8fac7ba59` | #261 |
| `fix/map-day-fit` | `a558bfccddefec4166320ece2148b7d5fa699731` | #300 |
| `fix/map-tab-batch` | `317179179179a9feecf3b47dde9942c4137397ce` | #297 |
| `fix/map-tab-p3s` | `d7feae5082180cd7904062daccf33be97973953a` | #303 |
| `fix/map-tab-review-round` | `7f4c58bf2a42ef93bc33f5d3ff5eb8834db48c28` | #295 |
| `fix/map-tab-tray-drift` | `d7e3f4b4ce0d1c064df9d2a63632b95a9327ffab` | #298 |
| `fix/migration-guard` | `144de63f17df397d426be98b1d381588bcf8eb1d` | #287 |
| `fix/onboarding-design-audit` | `9270a2e4e974c5010312ec31b0a811b9981cdb51` | #269 |
| `redesign/landing-taste-pass` | `e8c0a1881f7f83b0dd0f80c431bdd37dab87d5ea` | #279 |
| `security/audit-fixes` | `e3598507dce627b84a5511c6229778d285b20e49` | #291 |
