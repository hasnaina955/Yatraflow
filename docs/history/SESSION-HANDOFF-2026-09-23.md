# Session handoff — 2026-09-23 (PWA + audit batch)

> Archivally useful, not live guidance. This records the state of one working
> session whose six pull requests were all resolved on 2026-09-22/23, so a later
> session can tell what was integrated, what was superseded, and what is still
> waiting on a human — without re-reading six PR threads.

## The six PRs from this batch

| PR | Subject | Fate |
|---|---|---|
| #289 | M5 AI companion — real LLM on the user's key, Jev fast-path, design-system polish (review fixes: guarded `AbortSignal.any` merge, dead `computeTotals`, flag-gated settings cards) | **Merged** 2026-09-22 → v0.65.0 |
| #290 | APK: the signed-out shell's hamburger gate + the APK audit | **Merged** 2026-09-22 → v0.65.0 (its CI-lane half rides in that PR's comment as a patch — see below) |
| #291 | Security audit fixes — webhook refund guard, CSPRNG invite codes, web headers + report-only CSP, APK `allowBackup=false`, password floor | **Merged** 2026-09-22 → v0.65.0 |
| #292 | Design audit — the light-theme AA debt cleared to zero, categorical ramp de-collided from the status palette, `--space-*` ladder re-homed, day-dot collision fixed | **Merged** 2026-09-22 → v0.65.0 |
| #293 | PWA phase 1 — the installable shell (manifest, brand icons, shell-caching service worker, install affordance) | **Merged** 2026-09-22 → v0.65.0 |
| #294 | PWA phases 2+3 — offline read (IndexedDB snapshot) + offline write (durable queue + replay) | **Closed unmerged, content landed anyway** — `src/lib/offlineCache.ts`, `src/lib/writeQueue.ts` and the banner are in v0.65.0 |

## Still waiting on a human (nothing here is code)

1. **Codacy dashboard**: five warnings on `scripts/generatePwaIcons.mjs` (loop-counter
   indices, a 256-entry CRC table, `import.meta.url` paths — no user input anywhere).
   Triage and justification are in PR #293's comment; they need marking *managed* in
   the dashboard or they re-report on every future PR touching that file.
2. **The APK CI-lane patch** (PR #290's comment): monotonic `versionCode`, `versionName`
   from the tag, sourcemap stripping, GitHub Release publishing for tag APKs. It touches
   `.github/workflows/**`, which the sandbox push credential may not write — apply with
   `git am` from a machine whose token has the `workflows` permission.
3. **Google Maps key restriction** — bake it into the APK audit's findings: API-restrict
   the key to Places/Routes in the Google Cloud console (the referrer question decides
   whether the shell's calls can work at all).
4. **F6 (#234)** — the chartered accountant's merchant-of-record call; the one M7 row no
   commit can close.
5. **M6 (#237)** — the two-account presence confirmation pass (presence excludes your own
   session by design, so it needs two distinct accounts on one trip, on a real network).

## State at the time of writing

- `main` == `test` at **v0.65.0** (annotated tag → `3893ccc`, PR #304 promoted it; the APK
  workflow ran green on the tag push).
- Open issues: **13** — the #227–#234 launch-readiness set, the #236/#237/#239/#240 tracks,
  plus #252 (who may publish) and #255 (Overdrive), all listed in `ROADMAP.md`.
- Idea bank: Tier 1 = I-1…I-5, I-8, I-23, I-25, I-27; Tier 2 = I-12, I-14, I-18, I-22,
  I-24, I-26; the M-tracks are indexed in Tier 3. Gallery backlog: `docs/GALLERY-BACKLOG.md`.
- In flight at the time of writing: PR #310 (Create funnel to the mockups, crew channels,
  interface-review fixes).

## Verification snapshot for this batch

Every PR above passed `npm run verify` (tsc clean · full suite · production build) on its own
tree; the counts quoted in the PR bodies were 1897–1919 tests across 133–135 files as the
stack grew. The audit work also produced the design-system ratchet moving to
`contrastLight: []` (no tolerated light-theme AA failure) and `hueCollisions: []`.
