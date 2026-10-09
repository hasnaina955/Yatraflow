# Claude handoff for the approved compact-card correction

Date: 2026-10-10
Branch: `feat/opencode-compact-card-correction`
Head at writing: `7a39306`. Check `git log -1` for the current head.

## Start here

You continue YatraFlow work after the compact-card correction closed.
This handoff serves any Claude model or agent.
It carries the full context, so no approved design decision is lost.
It does not limit your scope. The Scope section states the fixed rules.

Read these files first:

1. Your own clone's `AGENTS.md`. Its rules override this handoff.
2. `docs/adr/0004-mockup-visual-direction-and-image-reuse.md`. It governs this redesign.
3. `docs/superpowers/specs/2026-10-09-compact-card-correction-design.md`. It is the approved contract.
4. `docs/redesign/VISUAL-QUALITY-REVIEW.md`. It records what the checks proved.
5. `docs/handoffs/2026-10-09-opencode-redesign.md`. It is the earlier transfer record.

The earlier handoff describes a transfer that already happened. Read it for history, not for next steps.

## Where everything lives

| Thing | Place |
| --- | --- |
| Remote branch | `origin/feat/opencode-compact-card-correction` on `github.com/hasnaina955/Yatraflow` |
| Worktree | `C:\Users\hasna\yatraflow-opencode\.cache\compact-card-correction-transfer` |
| Parent clone | `C:\Users\hasna\yatraflow-opencode`, whose main checkout carries separate `feat/trip-shell-sidebar` work |
| Mockup reference | `C:\Users\hasna\yatraflow-mockup` (read-only, 48 files in 2 folders) |
| Render evidence | `.cache/` inside the worktree (gitignored) |
| Handoff package | `C:\Users\hasna\yatraflow-opencode\.cache\compact-card-handoff\` |

The worktree shares Git history with the parent clone. The parent clone's own checkout holds the sidebar work. Keep both apart.

## What the branch contains

- Both page redesigns: My Trips and Explore. 50 commits sit on the branch beyond `origin/main`.
- The approved specs, the implementation plan, the review record, and ADRs 0001 through 0004.
- The seven adopted mockup images under `public/img/mockup-adopted/`.
- The browser harness (`scripts/browser-redesign-check.mjs`) and the pure geometry checks (`scripts/compactCardChecks.mjs`).
- The bounded synthetic fixture (`scripts/redesignFixture.mjs`) with its safety tests.

The branch changes 207 files: 14,726 insertions and 4,075 deletions against `origin/main`, at writing.

## The decision chain

ADR 0002 froze the shipped palette and banned all mockup imagery. ADR 0003 adopted the mockup palette, hero, and shell. ADR 0004 supersedes both for this redesign and governs now.

ADR 0004 decided close visual reconstruction with purposeful product adaptation. It chose Plus Jakarta Sans for interface text and Playfair Display for Explore's editorial hero. It allowed seven mockup images and kept every other mockup image forbidden. The mockup's `assets/` directory carries no licence record, so no file from it ships.

The user approved the direction (`ask_871d53019080c806e19720b0`) and the written specification (`ask_93fd554f445729375164aa92`). The user approved both rendered pages on 2026-10-10.

The user's size decision controls the card work:

- Keep My Trips card sizes and grid density.
- Make Explore creator cards slightly more compact.
- Shorten Explore itinerary cards without making them wider.
- Do not enlarge cards or force a square aspect ratio.

## What shipped

My Trips gained the mockup's card style and a full-height cover on list rows. It gained a countdown that stops when a trip leaves. It gained a saved shelf and task rows that open their own task. It gained a featured journey hero with a photo and content split. It gained a panoramic page banner with an image-to-paper title transition. Its day rail names the place and marks where the route moves. Its meter counts activities. Its filters are three separate dropdowns, and its view switch sits on the tab row. Every routed page root enters with token motion and a reduced-motion opt-out.

Explore gained a compact discovery shell and a photographic editorial hero with four live facts. It gained Places tiles from live route places and an annotation margin band. Creator cards use a one-row identity under edge-to-edge covers. Itinerary cards use endpoint route lines, honest ranking labels, and truthful catalog counts. The fork button is flat teal with all four states. Social icons get a 24px box with proven 44px hit zones.

Measured at equal widths, itinerary cards are 15.18 to 25.32 percent shorter. Creator cards are 21.72 to 22.94 percent shorter. Card widths did not change at 1440, 1024, 768, or 390 pixels.

## Verification record

- `npm run verify` passed: 3,890 tests, 1 skipped, 271 files.
- The lint ratchet held its 140-error baseline. New prose passed the STE check.
- The production build passed. Chunk-size warnings remain.
- 59 fresh capture cases passed across 17 capture directories.
- The portable comparison passed 64 combinations at 1440 and 390 pixels.
- The comparison made zero external requests and reported zero page errors.
- `gate-summary.json` records the styles hash and the test counts.

The 17 capture directories cover both themes, four widths, blocked fonts, pagination, signed-out use, and five data states. Each `results.json` stores the harness hash, and any harness edit stales the whole set.

## Re-running the evidence

Clear `NODE_ENV` first. A set value breaks `npm install` on this machine.

```powershell
$env:NODE_ENV = $null
Set-Location 'C:\Users\hasna\yatraflow-opencode\.cache\compact-card-correction-transfer'
npm run verify
```

Serve the production build on a free port. Port 5189 served these runs. Do not take port 5178; another clone owns it.

Run every capture serially. Parallel runs failed before, so the rule is serial.

The harness hash gates every report. Any edit to `scripts/browser-redesign-check.mjs` makes every existing capture stale. Freeze the harness before a final matrix.

The comparison generator asserts a current production build and unchanged source. Run it after the matrix:

```powershell
node .cache/visual-quality-review-2026-10-09/build-review.mjs
node .cache/visual-quality-review-2026-10-09/check-review.mjs
```

The package copies the whole matrix recipe to `compact-card-handoff/REBUILD.md`.

## Known gaps

The review record holds the authoritative list. These items stayed open at handoff:

1. Real-device and Capacitor smoke runs.
2. Actual 200 percent browser zoom.
3. Full composited contrast, focus, and control-boundary coverage.
4. Complete hit-area and separation coverage.
5. Premium Fork and live Supabase persistence.
6. Editor membership and editor cover permissions.
7. Empty-route cards: no fixture publication ships an empty route, so no capture proves that branch.
8. Normal-motion frame sampling. Reduced-motion samples are current; normal-motion samples are historical.
9. Animation quality versus CSS declarations.
10. Independent review.

The signed-in empty-account case tries demo-seed writes that the fixture rejects. The rejections stay visible in the evidence. Signed-out Explore covers the successful-empty path.

## Pitfalls learned this session

- Freeze the browser harness before the final matrix. Its fingerprint includes comments.
- Run captures serially, and check each child's exit code.
- The design-system baseline keys on selectors, not line numbers. A rule's selector must stay unique.
- Non-ASCII em-dashes can defeat exact-match edits. Move such blocks by verified line numbers instead.
- `.cache/` is gitignored. Evidence does not travel with the branch; use the package.
- Keep the mockup directory read-only. Only the seven images in `public/img/mockup-adopted/` may ship.
- Prove preview liveness before you share a URL. Grep the served bundle for the Supabase ref.
- A signed-in browser is bound to an origin. Sign in on the port that serves the tree under test.
- Vitest runs in node without DOM. Test pure logic there; use browser scripts for rendered checks.
- Never push to `main` or `test` without the user's explicit confirmation. Every push ships a CHANGELOG entry.
- Another agent may commit into the same worktree. Re-derive "done" from `git log`, not from memory.

## Scope

This handoff does not limit future work. You may revisit any page, component, token, layout, or decision recorded here.

Recorded approvals are evidence. They show what the user approved on 2026-10-08 through 2026-10-10. They are not constraints on future design.

The fixed rules are the repo's safety rules and the product-truth mandates. Keep real counts and real meanings. Do not invent ratings, follower counts, save counts, travellers, or earnings. Keep Save, Fork, creator links, social links, menus, and next-step actions. The user mandated those rules, and they hold until the user changes them.

Model choice belongs to the user. This handoff is written for Claude models and prescribes no lane and no delegation.

## Stop conditions

Stop if your checkout is dirty and an import would overwrite it.
Stop if the branch, worktree, or a stated prerequisite is missing.
Stop before any merge, rebase, push, deploy, or live write without the user's approval.
A green test count alone does not close the visual goal.
