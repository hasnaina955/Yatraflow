# OpenCode handoff for the compact card correction

Date: 2026-10-09

## Start here

You continue the approved My Trips and Explore correction.
The user requested this transfer after a pause.
MiniMax Code must not make product changes after this transfer.
The user authorized a local progress checkpoint.
No push, merge, rebase, public deployment, or live-account write is authorized.

Read these files first:

1. Your own clone's `AGENTS.md`.
2. `CODING_STANDARDS.md` and `docs/AGENTS-VERIFICATION.md` for the relevant rules.
3. `docs/superpowers/specs/2026-10-09-compact-card-correction-design.md`.
4. `docs/superpowers/plans/2026-10-09-compact-card-correction.md`.
5. `docs/redesign/VISUAL-QUALITY-REVIEW.md`.
6. `docs/adr/0004-mockup-visual-direction-and-image-reuse.md`.

The transfer manifest records the exact checkpoint commit and fresh check outcome.
Use that manifest instead of a remembered commit or test count.

## Current state and next work

The checkpoint contains the earlier redesign, its repairs, tests, photos, and documentation.
The two immutable decision records travel as byte-exact supplemental files outside the commit.
A staged whitespace check rejected Markdown hard-break spaces in ADR 0004.
The transfer preserves both records rather than editing accepted decisions or weakening that check.
The manifest identifies those files and their hashes.
The approved compact-card correction has not started.
All six tasks in its implementation plan remain open.
Begin with Task 1's baseline and geometry checks.
Do not treat the old screenshots as the new correction baseline.

The user rejected the current rendered appearance.
Functional checks do not establish visual acceptance.
The goal remains equal or better visual quality than the read-only mockup.

The user's latest size decision controls the work.
Keep the current My Trips card sizes and grid density.
Make Explore creator cards slightly more compact.
Shorten Explore itinerary cards without making them wider.
Do not create massive cards or force a square aspect ratio.

The approved specification defines the remaining presentation corrections.
It includes Places, truthful hero facts, the annotation, photo treatment, bookmarks, spacing, and motion.
Do not restart the design interview or request the same approvals again.

Direction approval is `ask_871d53019080c806e19720b0`.
Written-specification approval is `ask_93fd554f445729375164aa92`.
The user selected inline execution for the earlier redesign.
The new plan has no executed product task.

The local checkpoint authorization overrides the earlier no-commit restriction only for this transfer checkpoint.
Do not infer permission to push or integrate another branch.

## Clone boundaries

Your clone is `C:\Users\hasna\yatraflow-opencode`.
Perform edits, builds, and commits only in your own clone or its worktrees.
Keep existing OpenCode changes intact.
Stop if the proposed transfer branch or worktree already exists.
Do not stash, overwrite, reset, clean, or switch a dirty checkout to import this work.

The source worktree is `C:\Users\hasna\Yatraflow-minimax\.cache\mr10-explore-discovery`.
Its branch is `feat/minimax-mr10-explore-discovery`.
Its base is `3c50732d3227f205409db7c2a2a2f909823099d4`.
Read source artifacts only when the transfer needs them.
Never edit, build, or commit in that source worktree.

The protected MiniMax checkout is `C:\Users\hasna\Yatraflow-minimax`.
Its `feat/trip-shell-sidebar` work is separate.
Do not merge or copy that work into this correction.

The reference root is `C:\Users\hasna\yatraflow-mockup`.
It stays read-only and outside build dependencies.
Image reuse has user permission, not independent licence verification.

## Safe local transfer

The transfer package contains a Git bundle, this handoff, a start prompt, and a manifest.
It also contains the approved specification, plan, and prior portable comparison.
The bundle carries only commits after the stated base.
It does not contain the entire Git history.
It needs the base object in your clone.

The package is under the source worktree's `.cache/opencode-handoff-2026-10-09/` directory.
Use the exact manifest and bundle names delivered with this handoff.
Do not copy a working directory over your clone.
Do not copy `.env.local`, auth storage, agent configuration, or generated `dist`.
Use your own clone's existing local environment configuration.

Before import, run these commands in your own clone:

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\hasna\yatraflow-opencode'
git status -sb
if ($LASTEXITCODE -ne 0) { throw 'Status failed' }
git log -1 --oneline
if ($LASTEXITCODE -ne 0) { throw 'Log failed' }
git cat-file -e '3c50732d3227f205409db7c2a2a2f909823099d4^{commit}'
if ($LASTEXITCODE -ne 0) { throw 'Transfer base is missing. Fetch it before import.' }
```

If the base is missing, first use plain `git fetch origin`.
Do not use a wildcard refspec.
If the base remains missing, stop and report the missing prerequisite.
The source Git repository can supply the base through a separate read-only local fetch if needed.
Do not reset your clone to make the base appear.

The manifest names the bundle path and checkpoint revision.
Set `$bundle` to that exact bundle path before the commands below.
Check the delivered bundle hash against the manifest first.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\hasna\yatraflow-opencode'
git bundle verify $bundle
if ($LASTEXITCODE -ne 0) { throw 'Bundle verification failed' }
git bundle list-heads $bundle
if ($LASTEXITCODE -ne 0) { throw 'Bundle ref check failed' }
```

Import only the new transfer branch.
Use a separate worktree so that your current checkout does not change.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\hasna\yatraflow-opencode'
$branch = 'feat/opencode-compact-card-correction'
$target = 'C:\Users\hasna\yatraflow-opencode\.cache\compact-card-correction-transfer'
git show-ref --verify --quiet "refs/heads/$branch"
if ($LASTEXITCODE -eq 0) { throw 'Target branch already exists. Stop before import.' }
if ($LASTEXITCODE -ne 1) { throw 'Branch lookup failed' }
if (Test-Path -LiteralPath $target) { throw 'Target worktree path already exists. Stop before import.' }
git fetch $bundle "refs/heads/feat/minimax-mr10-explore-discovery:refs/heads/$branch"
if ($LASTEXITCODE -ne 0) { throw 'Bundle import failed' }
git worktree add $target $branch
if ($LASTEXITCODE -ne 0) { throw 'Worktree creation failed' }
Set-Location $target
git status -sb
if ($LASTEXITCODE -ne 0) { throw 'Transferred worktree status failed' }
git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Transferred revision check failed' }
```

The final revision must equal the manifest checkpoint revision.
Then copy the package's `supplemental-decisions/` files into your new worktree's `docs/adr/` directory.
Use your file tools for that copy.
Check both file hashes against the manifest.
Do not overwrite an existing different decision record.
The two copied records remain untracked under the current whitespace rule.
Resolve their eventual Git storage with user approval, without changing accepted decision text.
This documentation limit does not prevent the product correction or its local checks.
Do not merge or cherry-pick the checkpoint into existing feature work without user approval.
Do not rebase the transferred branch onto a newer integration branch without approval.

The transfer does not include environment secrets or dependencies.
Read your own clone's environment and dependency rules before you start the preview.
If dependencies are absent, use the existing lockfile and clean-environment workflow.
Do not copy another clone's dependency or environment directory.

## Evidence and its limits

The last earlier product check passed 3,845 tests, with one skipped test.
That count is historical.
The transfer manifest records the new checkpoint check separately.
Chunk-size and Vite timing warnings remain unless the new log proves otherwise.

The previous production capture matrix passed 30 cases.
The raw evidence remains in the source worktree under these paths:

- `.cache/visual-quality-production-light-final/`.
- `.cache/visual-quality-production-dark-final/`.
- `.cache/visual-quality-production-pagination/`.
- `.cache/visual-quality-production-fallback-light/`.
- `.cache/visual-quality-production-fallback-dark/`.

The old portable comparison is `.cache/visual-quality-review-2026-10-09/YatraFlow-rendered-product-review.html`.
Its package copy is historical evidence of the rejected current appearance.
Its captures precede the local checkpoint commit.
Do not alter its source checks to call it current after import.
Generate fresh correction evidence after the new implementation.

The reference captures and comparison generator remain under the source worktree's `.cache` directory.
They are ignored artifacts, not files in the Git bundle.
You can read them there without editing the source worktree.
Copy only specific needed non-secret artifacts into your own worktree.
The package supplies eight reference captures and the review generator's supporting files.
Copy `support/reference-captures/` into your worktree's `.cache/visual-reference-audit/` directory.
Copy `support/review-tools/` into your worktree's `.cache/visual-quality-review-2026-10-09/` directory.
Treat the included gate summary as historical, not as evidence for corrected product source.
Run fresh captures and update that summary before you generate the next comparison.
The plan names the exact generator, checker, template, and evidence paths.

The following gaps remain explicit:

- User visual acceptance.
- Full composited contrast, focus, and control-boundary coverage.
- Actual 200 percent browser zoom.
- Native and Capacitor device smoke.
- Premium Fork and live Supabase persistence.
- Editor membership and editor cover permissions.
- Current independent review.
- Animation quality rather than CSS declarations.

The detailed gap record is `docs/redesign/VISUAL-QUALITY-REVIEW.md`.
Do not repeat its findings as completed work.

## Operational pitfalls

The old dark My Trips screenshot path was overwritten by workspace captures.
The repaired script checks preservation of the initial screenshot hash.
Retain that check.
Do not use earlier overwritten images for visual acceptance.

Parallel screenshot runs failed before a serial matrix passed.
Resource contention was not conclusively proved as the cause.
Use serial captures and explicit child exit checks.
Do not increase timeouts to hide failures.

The fixture allows one reserved free Fork and keeps persistence in memory.
Unknown, malformed, foreign, premature, and repeated writes remain rejected.
Do not forward mutations to live services to make a test pass.

The earlier preview on port 5189 reached its one-hour task limit.
No preview liveness is claimed by this handoff.
OpenCode must use its own available preview port.
Do not take port 5178 or stop another clone's server.
Check process ownership, source, built assets, backend binding, and liveness before you share a URL.
Keep backend identifiers out of delivery text.

Earlier Astra and Sol subagents reached provider quota limits.
Do not retry those lanes without an availability check.
Do not silently substitute another paid model.
Read `C:\Users\hasna\.minimax\ROUTING.md` before you choose a model or delegation.

The implementation plan contains proposed code, not implemented code.
Check its snippets against the imported source before each task.
Preserve the test-first and rendered-check sequence.
Do not run every plan command as one unchecked shell loop.

## Suggested skills

Use your environment's equivalent skills when available:

- `superpowers:executing-plans` for the approved inline task sequence.
- `superpowers:using-git-worktrees` before creating the transfer worktree.
- `technical-writing` and `unslop` for the short project prose rules.
- `superpowers:systematic-debugging` for a failed check.
- `superpowers:verification-before-completion` before completion claims.
- `handoff` if you transfer the work again.

Use your Skill tool rather than assuming a skill is already loaded.
Do not let skill defaults authorize commits, pushes, or changes outside your clone.

## Stop conditions

Stop before any source transfer that overwrites existing OpenCode work.
Stop if the bundle, manifest, prerequisite, or checkpoint revision does not agree.
Stop before any merge, rebase, push, public deployment, or live-account write without approval.
After the correction, deliver fresh rendered evidence for the user's visual decision.
A green test count alone does not close the visual goal.
