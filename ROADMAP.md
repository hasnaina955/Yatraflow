# YatraFlow — Master Roadmap

The single plan of record. Every roadmap, phase and tracked backlog now lives
here — merged from the phased plan (Sep 2026), the executed v0.23.0/CTI
implementation plan, the CTI alignment deferrals, the completed UI-audit
tracker, and the Sep 2026 comprehensive review (CSS / React / UX audits).

Living document — reviewed each session, updated as items land. Done items
move to [CHANGELOG.md](CHANGELOG.md); this file only tracks what's ahead.

**Release protocol:** every milestone below ships as a **release on a feature
branch off `test`** — version bump (`package.json` + lockfile), CHANGELOG entry,
README update when feature-worthy, `npm run verify` green, both themes QA'd,
user confirmation before any push. Feature work reaches `test` **via pull
request** (never a direct push); `main` merges stay explicitly user-gated
(AGENTS rule 1).

**Snapshot (2026-09-18, verified against the repo):** **`main` and `test` both carry v0.61.0** — the money release: a paid unlock behind a server-side paywall, a versioned itinerary format, the M6 access-rule suite, and the public surfaces' own pass — promoted to `main` on 2026-09-18 (**PR #259**, `main` at `647faf1`). **v0.60.0** (the whole-app refinement pass, **PR #257**) sits under it. **v0.59.1** was promoted to `main` on 2026-09-17 (**PR #248**, `main` at `1d1b85f`), on top of v0.59.0 (promoted 2026-09-17, **PR #247**, `main` at `b4f0a18`). v0.59.1 is a routing correction: the corridor span measurement assigned each leg by its position among the *uncached* legs rather than within the span, so a cached leg inside the span handed its geometry to the leg after it and cached that under its neighbour's key — the drawn route stopped early, and every later measurement of that leg was served the wrong road. v0.59.0 measures the road one corridor at a time rather than one leg at a time, scopes day-filter measurements to the day on screen, and keeps copied public itinerary addresses previewable with navigation that works in any tab. It sits on v0.57.0, the sharing-and-honesty release: the itinerary preview endpoint (`/i/<id>` answered by `api/i.js` with the publication's own Open Graph tags, then the hash route), the one-step trip-JSON import in both formats the repo ships, permanent user deletion in the masteradmin console, the offline companion's routing collisions fixed, and per-route browser-tab titles. v0.58.0 gives that preview an image: a 1200×630 branded card backs any publication with no cover of its own, and auto-picked Wikipedia covers now go through Wikimedia's own resize endpoint instead of shipping the 1.3–3.3 MB original. It sits on v0.56.0, the settings-integrity release, which lands the full six-phase settings-wiring audit (issue #213, PRs #219/#220/#221): Trip settings as its own eighth workspace tab, party/vehicle preferences persisted to the trips table, the propagation fixes that make a settings change re-derive every downstream surface, style-vs-budget separation, Create↔Settings parity, and the numeric defaults that stop car numbers being written onto bikes and EVs. That release was promoted on 2026-09-16 (**PR #223**, `main` at `f314b25`) and sits on v0.55.0's gallery-pipeline release. `admin_delete_user` keeps its `20260916_admin_delete_user.sql` migration gate. The verify gate stands at tsc + **1390 tests** (115 files) + build.
Current version: **0.61.0** on both lines — promoted to `main` on 2026-09-18 (**PR #259**).

**Live open work is tracked in two places, and this file must agree with both:**

1. **The issue queue** — see [Open issues](#open-issues) below for the current list, which is
   derived from the GitHub API rather than recalled. **Fourteen issues are open** (2026-09-16,
   `gh issue list --state open`): the #226–#234 launch-readiness criteria filed from
   [`docs/PLAN-LAUNCH-AND-DISTRIBUTION.md`](docs/PLAN-LAUNCH-AND-DISTRIBUTION.md), and the
   #236–#240 milestone tracks (M5 → M9), which are now issues and not only prose in this file.
   The queue was empty for a day on 2026-09-16: #213 was filed and closed inside it (its six
   phases shipped in #219/#220), the rebrand (#96) is archived — no need or plan to rename —
   and #122's season half is closed as not planned, the late dinner window being deliberate.
   Re-derive with `gh issue list` before quoting counts.
2. **The milestone tracks** — M5 → M9, plus the 1.0 cut. These are *planning* tracks: they are
   directions of travel, not release numbers.

**Read the version labels with care.** The `M` tracks were authored before v0.26–v0.48 existed
and shipped entirely different content (Plan Bench redesign, the v0.27 interface pass, the
#43–#52 store sweep, the Corridor Concierge engine, the masteradmin console). Those version
numbers are now **consumed** — `v0.32.0` in particular shipped "Stabilization completion", not
M6. The `vX.Y.Z` in each M-heading is therefore **historical intent only and is not a booking**;
the ledger tracks content, and only the ledger's version numbers are real. Where a heading's
number collides with a shipped release, the ledger wins.

---

## Open issues

Re-derived from the GitHub API 2026-09-16 (`gh issue list --state open`) — **fourteen issues are
open**, in two sets. The **launch-readiness criteria** (#226–#234) were filed from
[`docs/PLAN-LAUNCH-AND-DISTRIBUTION.md`](docs/PLAN-LAUNCH-AND-DISTRIBUTION.md) and its
`STEP-0-DECISIONS.md` companion; the **milestone tracks** (#236–#240) are the M5 → M9 paragraphs
below, now tracked as issues so the queue and this file cannot drift apart again:

| # | Priority | Issue | State |
|---|---|---|---|
| #226 | P1 | E1 · Make links preview | **Shipped** in v0.57.0: `/i/<id>` serves public metadata and redirects browsers to the hash route, with no cross-deployment shell fetch; the trip-JSON import that PR #235 also carried landed alongside it. v0.58.0 gives that preview a picture — a branded 1200×630 card for any publication with no cover of its own, and auto-picked covers resized through Wikimedia's own endpoint so none exceeds the 600 KB `og:image` ceiling. The single box still open needs a real messaging client: a card rendered in WhatsApp. See `docs/DEPLOYMENT.md`. |
| #232 | P1 | E2 · The gallery is curated | `#/explore` holds one itinerary; the shelf has to read as chosen, not as everything that passed the gate |
| #230 | P1 | E3 · Attribute shares, and settle how the readings are kept | Decides what a share is attributed to, and where the readings live, before any of it is measured |
| #229 | P1 | F1 · Write the thresholds down, before measuring | The four launch signals (shares→views, views→forks, forks→signups, signups→2nd session) and the Stage 1→2 marks, committed in-repo **before** E3's first reading. D5 of [`docs/commercial/STEP-0-DECISIONS.md`](docs/commercial/STEP-0-DECISIONS.md) holds the numbers, which merged into the repo with PR #214 — no longer an unmerged branch; thresholds are immutable once set, so doing this after E3 starts is the failure mode the rule exists to prevent |
| #233 | P1 | F2 · Three real trips, four real people each | Real crews on real trips — the evidence that the planning holds outside a fixture |
| #227 | P1 | F3 · Send one published link to a WhatsApp group | The smallest honest distribution test, in the channel the product is positioned against |
| #231 | P2 | F4 · Four consecutive weekly readings | Four weeks is the shortest window that shows a trend rather than a day |
| #234 | P1 | F6 · CA confirms the merchant-of-record branch | Branch 1 (intermediary) vs Branch 2 (merchant of record) moves the creator's net ~₹27 a sale — ₹161.47 vs ₹134.10 on a ₹199 sale — and the 15% fee must clear the ~3.86% cost floor. Also scopes GST/TDS registration |
| #228 | P2 | F7 · First distribution loop | The repeatable loop, and only after F3 has answered |
| #236 | P2 | M5 · AI companion — user-configurable LLM endpoint | The track below; the unbuilt fix behind closed #22 → #20 |
| #237 | P2 | M6 · Together — collaboration depth | The track below |
| #238 | P2 | M7 · Premium — the payment rail | The track below; needs F6 settled first |
| #239 | P2 | M8 · 1.0 enablers → the 1.0 cut | The track below |
| #240 | P2 | M9 · Invites & onboarding | The track below; exec plan already written |

The queue was empty for exactly one day, and this section said so — the launch set above is what
replaced it. **#213** was filed and closed inside that day: a read-only audit of how the trip
workspace is wired (what reads what, and which surfaces can disagree) found the whole class of
defect behind this file's own "the queue is one issue" note — settings read by the engine but
never persisted, memos whose dependency arrays omitted what they read, and duplicated
vocabularies across Create Trip and Trip settings. Six phases shipped as PRs #219/#220: the
Settings tab split out of Share, party/vehicle persistence (new columns, applied live), the
propagation fixes, style-vs-budget separation, the parity pass, and the numeric defaults.

**#96 — rebrand: ARCHIVED, not planned.** There is currently no need or plan to rename the product.
`refactor/brand-seam` builds the seam (one source of truth for the name across 21 files, `vite.config.ts`
included) and is kept as archaeology — nothing depends on it and it is far behind `test`, so reviving it
is a rebase, not a resume. The caveat to read before ever reviving it: the Android shell's `appId`
(`app.yatraflow.mobile`) breaks updates over existing installs if it changes.

**#122 — the dinner window's season half: closed as not planned.** The late window (dinner 20:00–21:00,
night end 23:00) is correct for this market; deriving it from sunset was attempted and reverted in #210
because it landed dinner at 17:00–18:00. If the underlying problem is ever worth solving, the recording
shapes are an **advisory** ("this day finishes after dark") or an **opt-in** early dinner — never a silent
shift of the meal.

**Correction (2026-09-15) — the M0 seed guard was fixed, and this file said otherwise.** Five
places below claimed the demo-seed guard was "never implemented". It is implemented: `store.ts`
tracks `tripCountUnknown` (set whenever the memberships or trips read errors) and the seed line
reads `if (tripList.length === 0 && seedIfEmpty && !admin && !tripCountUnknown) await seedDemoFor(…)`
— the `#94` comment above it spells out exactly the accumulation trap M0 warned about. Closed by
#94 (the v0.49.0 issue sweep), so the ledger box below is ticked and the warnings removed. The
lesson is the one §6 already states in reverse: **a roadmap row is a claim about code, not a
fact** — this one stayed wrong for weeks because nobody re-read it against `src/`, and it was
found only while auditing the file for a release.

---

## Progress ledger

One checkbox per major update, from the first commit to the 1.0 cut. Shipped
items stay checked (never deleted — this is the at-a-glance history);
remaining items tick in the **same commit as their release** (with the version
and date), per the AGENTS §6 same-edit rule. Detail lives in
[CHANGELOG.md](CHANGELOG.md); this is only the map.

### Shipped — foundation (Aug 23–28, 2026)
- [x] **v0.1.0** — Initial MVP: React 18 + TS app, localStorage store, day-by-day timeline, schedule/budget engine, light/dark theme, India-first seed content
- [x] **v0.2.0** — Collaboration layer: invite-by-link, suggestions with votes/comments, decision polls, activity feed, notifications
- [x] **v0.3.0 → v0.11.x** — early polish wave: onboarding/UX fixes, confirm dialogs, export/import trip JSON, decision & notification hardening, cross-device URL state
- [x] **v0.12.0** — Supabase backend: real accounts, shared persistence, RLS — the app leaves single-browser localStorage
- [x] **v0.13.0 → v0.16.0** — timeline becomes a real itinerary view (time rail, cross-day drag-and-drop), Mappls India-grade place data, opening-hours model

### Shipped — data & platform (Aug 29 – Sep 3, 2026)
- [x] **v0.17.0** — Google Places integration (opt-in key, quota-guarded, free-stack fallback) + full mobile usability pass
- [x] **v0.18.0** — unified journey engine (one travel system for every day), touch drag-and-drop, 12h/24h clock pref, `npm run verify` gate, AGENTS.md founded
- [x] **v0.19.0** — 3-layer design tokens, vite 8 + plugin-react 6, CSS build-blocker fix (#14)
- [x] **v0.20.0** — CI gate (#21), live realtime collaboration (#18), OpenFreeMap basemap swap (#23), fatigue-aware ride-plan suggestions, Google routing (#6)
- [x] **v0.21.0** — vehicle profiles (fuel/EV/CNG range), purpose-tuned halt queries, trip-scoped suggestion cache, fixed impact sheet
- [x] **v0.22.0** — expandable map view, suggestion persistence across tab switches
- [x] **v0.23.0** — publish write-through fix, hydration error logging, **UI audit 32/32 complete** (6 batches)
- [x] **v0.25.0** — Calm Travel Intelligence redesign (M0–M7), user-driven halt planner, contrib integration
- [x] **[Unreleased]** — demo-seed revert + one-off DB prune, master-roadmap consolidation, Sep 2026 comprehensive review
- [x] **v0.41.0** — Corridor Concierge (H1–H3 complete): road personality, enforced detour budget, trip DNA + crew seeds, story arcs, slack prompts, asymmetric detours, hours scoring, fuel advisories; Google-only provider directive; store + AI-drawer sweep (issues 15/15)


### Shipped — the v0.42 → v0.54 line (2026-09-06 → 09-15)
- [x] **v0.42.0** — Hy4 audit P0 fixes: the suggestion engine's persistent state and UI behaviour become reliable ("Add all" write-through, cache invalidation on route change, the degenerate-route guard, the detour budget enforced from the actual itinerary)
- [x] **v0.43.0** — The suggestion engine comes alive — See & do finally fills, the map and the suggestion panels cross-highlight, every add lands in road order, and a bad merge's encoding corruption is repaired
- [x] **v0.44.0** — The mid-trip questions, answered where the planning happens: safe-to-spend pacing, per-day cost/dwell chips, and calendar export
- [x] **v0.45.0** — Create-flow + invites + settings: the Trip Ticket create board, car-rental and local-train fares, range calendar, invite short codes, Plan Bench trip settings and the My Trips search/filter/sort restore
- [x] **v0.46.0** — The masteradmin console — a typed, never-linked `#/admin` god view with audited RPCs and an append-only audit log
- [x] **v0.47.0** — Cleanup and polish: deletes become reversible, the app writes faster, and the small-wins backlog lands together
- [x] **v0.48.0** — Consistency and shell: one green, one kicker recipe, four blur tiers, and a real Android shell
- [x] **v0.49.0** — Board-first editing, trustworthy drag-reorder, and the open-issue backlog closed in one pass
- [x] **v0.50.0** — Every trip edit finally sticks — the "Change saved but nothing changed" defect is dead
- [x] **v0.50.1–v0.50.2** — The installed app stops flashing the marketing site on launch and drops the website's top bar entirely
- [x] **v0.51.0** — The timeline learns to move: the 1,500-line view splits into `components/timeline/*`, the motion vocabulary lands, and drag gets its own geometry
- [x] **v0.52.0** — The map learns relief — Liberty becomes the light basemap, with 2D/Terrain/3D view modes
- [x] **v0.53.0** — The design-system audit gets fixed, not just filed: issue #107 worked to 117/117 across five batches (contrast/ink tier, motion tokens, kicker + hit areas, the ARIA listbox Select, the scenic hue split), with the guardrail gates kept
- [x] **v0.54.0** — The suggestion pipeline tells the truth — honest detours, one road measurement, night halts anchored on real towns, the Day Planner's meal and fuel cadences revived, and Create Trip parity with its route-integrity guardrail
- [x] **v0.55.0** — The gallery gets its pipeline — the import contract and validator, the engine-truth gate in CI, the demand-ranked 20-trip backlog, and six researched, engine-priced shelf itineraries (Goa, Kerala, Mewar, Kashmir, Meghalaya + the Coorg reference); Vercel Web Analytics rides along
- [x] **v0.56.0** — Settings integrity: the six-phase #213 audit lands as one release — Trip settings becomes its own workspace tab, party/vehicle preferences persist to the trips table, a settings change re-derives every downstream surface, style and budget separate into independent dials, Create Trip and Trip settings share one vocabulary, and blank tank/economy fields stop writing car numbers onto bikes and EVs; promoted to `main` on 2026-09-16 (PR #223)
- [x] **v0.57.0** — Sharing and honesty: a published itinerary link previews as a card (`/i/<id>` answered by a Vercel function with that itinerary's own Open Graph tags, then the hash route), trip JSON imports in one step from My Trips and reads both formats the repo ships, permanent user deletion lands in the masteradmin console, the offline companion stops routing overloaded days / cost questions / mentions of children to the wrong handler, and every route gets its own browser-tab title
- [x] **v0.58.0** — The share card gets a picture: a 1200×630 branded card backs any publication with no cover of its own and the shell advertises it too, while auto-picked Wikipedia covers are resized through Wikimedia's own endpoint — the 1.3–3.3 MB originals become 144–406 KB
- [x] **v0.59.0** — One measurement per corridor: the road draws as one chain measurement instead of one request per leg, the day filter measures only the day on screen, Google-keyed routing spends one quota event per corridor, the Return-home toggle steers the suggestion corridor, and copied public itinerary addresses keep their trip-specific previews with navigation that works in any tab; promoted to `main` on 2026-09-17 (PR #247)
- [x] **v0.59.1** — Span measurement gives every leg its own result: a cached leg inside the corridor span can no longer hand its geometry to the leg after it or poison that leg's cache entry, so a drawn route stops stopping early; promoted to `main` on 2026-09-17 (PR #248)
- [x] **v0.60.0** — Whole-app refinement, every route reviewed against its own design language and fixed in place: the phone layouts that pushed their controls off-screen, the Timeline's inert reorder arrows, the calendar painted under the bottom dock, the forced-dark surfaces that stranded white text, the motion that never stopped offscreen, the controls under the 40px touch floor, the keyboard-unreachable scroll regions, and three product claims corrected. No token value changed. The design-system ratchet falls `9 / 11 / 32 / 30 / 1` → `7 / 0 / 28 / 29 / 1`, so the dark theme has no known contrast violation left. Merged to `test` on 2026-09-18 (**PR #257**).
- [x] **v0.61.0** — The money release: a priced publication can be bought — the price is read server-side so a tampered request cannot change it, the unlock is granted only through a buyer-scoped RPC or the idempotent payment webhook, and a purchase confirmed but never saved is recovered instead of charged twice; the paywall moves to the wire, so locked days no longer travel to every visitor in full; the itinerary format declares its version and its importer migrates and repairs an older export rather than refusing it; the crew-facing RLS shape is pinned by an opt-in suite that runs against the live database (M6); and the two public surfaces get a pass of their own. Promoted to `main` on 2026-09-18 (**PR #259**, `main` at `647faf1`).

### Remaining — in release order (details in the tracks below)
- [x] **v0.45.0** — Create-flow + invites + settings release (PR #81 + merged test work): Trip Ticket bento starter (bill print, outline seeding), car rental mode + local-train fares, range calendar, invite short codes + join-flow fixes, auth-refresh fix, Plan Bench trip settings + editable dates, My Trips search/filter/sort restore (branch `feat/create-trip-ticket`)
- [x] **v0.46.0** — Masteradmin console (PR #82): JWT-`app_metadata`-gated `#/admin` god-view (users/trips/invites/content/analytics/audit), audited SECURITY DEFINER RPCs, append-only `admin_audit` log, RESTRICTIVE deny policies for disabled accounts (branch `redesign/masteradmin-v045`, migration applied live)
- [x] **v0.32.0** — Stabilization completion: M0 leftovers (broken `pub:` route, router ready-gate for deep links / invite flash / loading-vs-empty) + M2 remainders (Profile save validation, demo-copy honesty, heading outline) + M1 leftovers (focus-ring gaps, touch targets, stagger freeze). **Note:** this is the row that consumed the `v0.32.0` number also claimed by M6's heading; the M0 **seed guard** was *not* part of it — it landed later, in v0.49.0 (#94).
- [x] **v0.36.0** — Budget + Group-input deep redesign: metric strip, per-day cost bars, payer balances + settlement, quick-add + in-place expense editing, who-voted tallies + needs-you digest, real composer pickers; `bump_published_stats` uuid→text fix, view dedupe, unpublish owner gate (branch `redesign/budget-group`)
- [x] **v0.37.0** — Creator release: public creator page `#/creator/:id`, publications manager with stats/edit/unpublish + stale-page nudge (`refreshed_at` migration), Explore newest sort, shared PubCard/forkPublication paths (local branch `redesign/creator-page` until pushed)
- [x] **v0.38.0** — Creator hub: My publications splits into Overview (lifetime KPIs + manager rows) | Earnings (Gumroad-shaped payouts ledger, honestly empty + labeled projection view via `projectEarnings`); M7 earnings contract documented in ARCHITECTURE (local branch `redesign/creator-hub`)
- [x] **v0.39.0** — Hard-surface pass (full skills-based review, ~70 findings): 5 HIGH fixes (Landing dark-mode bands, AA hero CTA, StopEditor phantom token, CreateTrip `--accent`, ₹₹ double-symbol), one lucide icon language workspace-wide, global tabular-nums utility, tabpanel/aria-pressed/focus-ring/hit-target a11y, one card-header + chip + fork-CTA grammar, dead code purge (local branch `redesign/hard-surface`)
- [x] **M3** — Performance architecture: store immutability → slice selectors → DaySection memo → workspace split into pages/trip/* + weather dedup + lazy routes (in [Unreleased], local branch redesign/perf-architecture)
- [x] **M4** — Design-system hygiene: dead CSS purge, mobile-block consolidation, glass/z-index tokens (in [Unreleased], local branch redesign/perf-architecture; raw-rgba glass stragglers intentionally NOT migrated — see commit `f646b45`)
- [x] **M0 defect** — seed guard: skip demo seeding when hydration had query errors (#94, v0.49.0 — `store.ts` gates the seed on `!tripCountUnknown`)
- [ ] **M5** — AI companion: user-configurable LLM endpoint (#22 → #20 — **both issues closed; not yet scheduled**)
- [ ] **M6** — Together: integration test suite, live co-editing depth, split expenses
- [ ] **M7** — Premium: payment gateway, entitlements, unlock flow
- [ ] **M9** — Invites & onboarding: creator invites (R1) → referral (R2) → invite-only gate (R3); three releases on `platform_invites`, exec plan in [`docs/PLAN-INVITES-ONBOARDING.md`](docs/PLAN-INVITES-ONBOARDING.md). *Added to the ledger 2026-09-11 — it previously existed only as a track section, so it was invisible to any pending list derived from these checkboxes.*
- [ ] **1.0 (M8)** — offline-first/PWA, i18n (EN+HI), the 1.0 cut → then PR to `test`

---

## Stabilization track — COMPLETE (M0–M4 landed; see the ledger)

**Status note (2026-09-11 audit; corrected 2026-09-15).** This track shipped across v0.26.0–v0.39.0
and the `redesign/*` branches; the ledger above carries the release rows. The bullets below are kept
as the **record of what was fixed** — they were written as a live to-do list and are now the
historical description, so read them in past tense. All six M0 items are closed: the seed guard,
previously called out here as never implemented, was fixed by #94 (see the correction at the top of
this file and `store.ts`'s `tripCountUnknown` gate).

### M0 — "Trust & navigation" (P0 bugs)
Small diffs, outsized trust impact. All six items landed — five in the v0.26.0/v0.32.0 stabilization
releases, the seed guard in v0.49.0 (#94):
- ✅ **"View public page" was a broken route** — `TripWorkspace.tsx` emitted `pub:<id>`, the
  router splits on `/` → landed on Landing, so publishers could never reach their own published
  page. Fixed.
- ✅ **Failed hydration fakes an empty state and re-seeds demo data** — `store.ts` logs query
  errors; the **retry banner** half shipped early (`partial` → toast), and the **"skip seeding
  when any query errored"** half landed with #94: `tripCountUnknown` is set whenever the
  memberships or trips read fails, and the seed runs only when the trip count is trustworthy
  (`tripList.length === 0 && seedIfEmpty && !admin && !tripCountUnknown`). A flaky-connection
  sign-in can no longer inject demo trips beside the user's own — the accumulation trap M0
  warned about (AGENTS §5).
- ✅ **Invite links flashed "broken" on cold load** — `InviteGate` showed the error whenever
  `trip` was undefined, which it is until hydration finishes. Fixed via the router ready-gate.
- ✅ **Deep-link reload landed on Landing first** — mid-hydration `me === null` funnelled
  `#/trip/...` to Landing; on failure the user was stranded. Fixed (router ready-gate).
- ✅ **Silent delete failure** — `deleteTrip`'s Supabase error restored the row with no toast
  (the undo had expired), so the delete "didn't work". Fixed.
- ✅ Housekeeping: stale UI-audit progress line.

### M1 — "Theme integrity & mobile" (dark mode + touch)
All verified fixed in the v0.27.0 interface pass (spot-checked 2026-09-11: `.theme-toggle` is
now 40×40, `.avatar-btn` carries `min-width/min-height: 40px`):
- ✅ **White-on-light-teal in dark mode** — `.vote-btn.on`, `.btn-teal`, `.step-num` kept `#fff`
  text while `--teal` flips light (~2.3:1). Sibling rules already used `#06251f`; these were
  missed. Also `.ha-sync` was dark-on-dark.
- ✅ **iOS zoom-on-focus** — the 16px mobile bump lost specificity to `.role-select` (12.5px)
  and two 13px time/number inputs.
- ✅ **Touch targets <40px** — `.theme-toggle` was 36px, `.avatar-btn` 26px, `.dest-chip` delete
  ~18px, plus `.toast-action`, `.board-fit`, filter chips.
- ✅ **Focus-ring gaps** — ~10 interactive controls were missing from the shared
  `:focus-visible` list (`.clamp-toggle`, `.board-fit`, `.save-heart`, `.dest-chip button`,
  `.role-select`, bare inputs…).
- ✅ Reduced-motion gap: `transition-delay` stagger survived the global freeze.

### M2 — "State honesty & UX"
All verified fixed (spot-checked 2026-09-11: the AI drawer has the Escape + focus-trap
contract, and the day title renders as a real `<button className="day-title-btn">` with an
`aria-label` when editable, `<h3>` only when read-only):
- ✅ Loading vs empty distinction on My Trips + Explore ("No trips yet" / "Nothing matches"
  rendered before or without data).
- ✅ Profile save: inline validation + disabled-while-saving (matches CreateTrip).
- ✅ AI drawer: Escape + focus trap + focus restore; nav popovers restore trigger focus on close.
- ✅ Keyboard: day-rename clickable `<h3>` → real button; heading hierarchy (h1→h3 skips in
  5 tabs; SharedTrip/Invite pages lacked h1).
- ✅ Landing "demo mode" copy over-promised (no anonymous demo; seed inserts trips only) —
  rewritten to match reality.
- ✅ Dead "Book a planning consultation" button; "places" vs "stops" terminology.

### M3 — "Performance architecture"
All five landed; the split is confirmed by `DaySection` now living in `pages/trip/TimelineTab.tsx`
alongside its siblings rather than in a 2,932-line `TripWorkspace.tsx`:
1. ✅ **Store immutability** — `Object.assign`/`push` in-place mutations made every
   `useMemo([trip])` stale-prone; it worked by accident.
2. ✅ **Slice-level selectors** — `useDb()` returned the whole cache and every `commit()`
   re-rendered every subscriber (realtime activity pings re-rendered the whole workspace,
   re-running `simulateDay` per day).
3. ✅ **Memoized hot path** — `React.memo(DaySection)` + handler `useCallback`s.
4. ✅ **Split `TripWorkspace.tsx`** (2,932 lines, 8 tabs) into `pages/trip/*`.
5. ✅ Fetch dedup: `DayWeatherChip` per-day weather calls vs Overview forecast; `ClampedText`
   DOM doubling; route-level `React.lazy` for Auth/Profile/CreateTrip/PublicItinerary.

### M4 — "Design-system hygiene" (CSS-only batch) — DONE (in [Unreleased], branch redesign/perf-architecture)
- [x] Purge ~100+ lines dead CSS (hero-preview block, `.route-flow`, `.filter-bar`,
  duplicates, contradictory `.locked-overlay` pair) — template-literal-safe
  recheck first. (Net −80 lines; 30+ zero-usage rules + dead selector
  fragments in compound rules, per-selector usage grep in commit body.)
- [x] Consolidate the 9 scattered mobile blocks (real conflicts: `.map-day-chip`,
  `.vote-btn` sized differently in two blocks) back toward the single-block
  convention. (All max-width blocks grouped at EOF, one 720px block; cascade
  preserved via per-selector audit + declaration-multiset diff.)
- [x] Glass tokens: four blur tiers (`--yf-blur-nav` 18 / `-panel` 14 / `-chip` 8 / `-scrim` 3px, every surface mapped; locked-CTA 1.5px scrim excepted);
  raw-rgba glass stragglers: none migratable — every literal matching a
  `--yf-glass*` value is deliberately theme-invariant (dark flips to .08),
  documented in `f646b45`; saturate normalized to 1.2. z-index: full 15-rung
  `--z-*` ladder, ties documented, ordering preserved (`eea4ebd`).
- [x] Tokenize hardcoded hero-gradient hexes (→ `--gray-900`) + the 26× shadow
  navy (→ `--shadow-navy-rgb`); adopt-or-delete: 18 never-referenced custom
  properties deleted (light+dark mirrors together), DESIGN_TOKENS.md updated.
  (One-off radii left as-is — no value-identical rung exists for them.)

---

## Strategic track (user-directed phases, renumbered after stabilization)

**On the `vX.Y.Z` in these headings (2026-09-11 audit).** These numbers were assigned when the
track was planned and have since been **consumed by other releases** — e.g. `v0.32.0` is
recorded in the ledger as "Stabilization completion", not M6. They are retained only to show
intended grouping, and are **not** bookings. Do not infer "next release" from them; the next
version is whatever the ledger says is unshipped — read the **Snapshot** line at the top of this
file for the current number rather than trusting a sentence that can rot.

### M5 — "AI companion" — **issue #236**
User-configurable OpenAI-compatible endpoint (Profile settings,
`src/lib/aiProvider.ts`), real LLM answers with the deterministic router kept
as offline fallback + "(LLM)/(offline)" badge. The original pair (#22 → #20) are both
**closed** as audit findings, so the unbuilt fix is carried by issue #236. For what *is* live,
see [Open issues](#open-issues) — fourteen issues are open (2026-09-16).

### M6 — "Together" (collaboration depth) — **issue #237**
Supabase integration/RLS test suite first (opt-in `VITE_RUN_INTEGRATION`,
~3h — old item #10), then live multi-user editing sync. Split-expense
settlement groundwork (payer tagging + balances card) shipped in v0.36.0;
M6 adds the multi-currency-free refinement and co-editing depth on top.

### M7 — "Premium" (monetization) — **issue #238**

> Post-unlock value presentation (why the buy feels worth it) and the creator-growth-loop shape are researched with citations in `docs/commercial/RESEARCH-2026-09-18-creator-market-and-paywall-value.md`; the buildable items are I-20…I-27 below.
Gateway integration (Razorpay fits INR), order/entitlement tables + webhook,
purchase state, unlock flow replacing placeholder toasts. Needs an external
gateway account. Deliberately after M6's test-suite groundwork.

### M8 — 1.0 enablers → the 1.0 cut — **issue #239**
Offline-first (IndexedDB + service worker/PWA, ~4–6h), i18n (EN + HI, ~6–8h),
then the 1.0 release.

### M9 — Invites & onboarding — **issue #240** (exec plan: docs/PLAN-INVITES-ONBOARDING.md)
Creator invites (admins mint YF-… member/creator codes with audit + gate) →
referral (R2) → invite-only gate (R3, flagged). R1 ships creator invites and a
clean-slate creator onboarding (no demo seed + badge granted). Three releases on
one `platform_invites` entity — detailed execution guide in
[`docs/PLAN-INVITES-ONBOARDING.md`](docs/PLAN-INVITES-ONBOARDING.md).

---

## 🟣 UI-audit remediation — COMPLETE (32/32)

Full report: [`docs/UI_AUDIT.md`](docs/UI_AUDIT.md). All six batches shipped in
v0.23.0 (both P0s closed: F-28, F-01); narrative in the CHANGELOG. This
section remains the tracker of record per AGENTS rule 5 — reopened findings
get a row here again.

| Batch | Scope | Status |
|---|---|---|
| 1 | Theming & touch CSS (F-18–F-20, F-23–F-30) | ✅ `6a96914` |
| 2 | Shared primitives — `Field` label fix (~30 call sites) (F-01, F-03, F-11) | ✅ |
| 3 | Focus ring (17 selectors) + reduced-motion guard (F-12, F-17) | ✅ |
| 4 | A11y attributes & nav semantics (F-02, F-04–F-10) | ✅ |
| 5 | Form hygiene (F-13–F-16) | ✅ |
| 6 | URL state (tabs, Explore filters) + copy (F-21, F-22, F-31, F-32) | ✅ |
| 7 | Impeccable whole-app refinement pass (2026-09-18) — mobile topnav, timeline reorder, `.two-col` overflow, create-trip calendar occlusion, light-theme contrast, board peek transition, reduced-motion delays, keyboard focus for the ledgers, viewer affordances, role/casing leaks, profile save feedback. Snapshot `.impeccable/critique/2026-09-17T17-42-23Z__src-app-tsx.md` closed; narrative in the CHANGELOG | ✅ |

---
## Idea bank

**Everything not yet built, in one place.** Consolidates the former Backlog pool, Idea pool,
Suggestion-engine / Budget / Creator-hub idea tables (2026-09-11). If an idea is open, it is
here and nowhere else; if it shipped, it is a one-line entry in the record at the foot — never
a row in a table above.

**How to use it.** Pick from **Tier 1** when a milestone has slack. **Tier 2** items are real
but gated on a named dependency — do not start them early. When an item ships, delete its row
here and add it to the shipped record, in the same commit that lands it.

**A row is a claim, not a fact.** These rows arrived from brainstorm tables written on
2026-09-06 and were carried forward during the 2026-09-11 consolidation without being
re-checked against source — by which point v0.47.0 had quietly shipped at least one of them
(Safe-to-spend, which the README described accurately while this file still listed it as
unbuilt). **Before picking up a row, and before quoting one in a plan, confirm it against
`src/` first.** Pruning on ship is not enough; the drift happens *before* anyone notices.

### Tier 1 — ready to pick up (small, unblocked)

| # | Idea | Area | Effort | Note |
|---|---|---|---|---|
| I-1 | CSV export of expense lines | budget | 1 h | Client-side blob download from `trip.expenses`. |
| I-2 | Week-over-week spending insight | budget | 2 h | "Days 1–3 ran 18% hotter than days 4–5" — derived entirely from the existing `byDay` engine data. |
| I-3 | Recurring expense templates | budget | 2 h | One-click re-add of past lines ("Fuel top-up ₹3,000") from an expense-history chip row. |
| I-4 | Overspending alerts | budget | 2 h | Threshold notification when a day/category crosses its cap — plumbing already exists in `realtimeCore`. |
| I-5 | Category envelopes | budget | 3–4 h | Per-category cap (₹) with progress state on the "Where the money goes" bars + a cap editor on the category row. Pattern: YNAB. |
| I-6 | Settlement acknowledgement + reminder | budget | 2 h | Balances card gains a "mark settled" flag and a nudge. The settlement *engine* already runs (`BudgetTab.tsx:363`) and `Expense.paidBy` already drives balances — only the acknowledgement state and its reminder are missing. **Adjacent to M6.** |
| I-7 | Decision comments | collaboration | schema | Needs a `comments` JSON column on decisions (migration) — `StopSuggestion` has one, `TripDecision` does not (`types.ts:226` vs `:244`). |
| I-8 | Monthly statements / invoice export | creator | 2–3 h | Downloadable per-month earnings summary, client-side from the payouts table. **Post-M7.** |
| I-17 | Theme the text selection and the caret | design system | 1 h | `::selection` and `caret-color` are declared **nowhere** in `src/styles.css` — the UA's highlight blue and caret are the last unthemed browser surfaces in the app (found while scoping v0.60.0's craft-floor pass). Cheap to close with the app's own soft-tint pairing (`--teal-soft` + `--text`) and `caret-color: var(--teal-deep)`, but it is a feel change rather than a defect, so it wants a look first — and the baseline's line-keyed entries must be re-mapped in the same commit (AGENTS §4). |

### Tier 2 — blocked on a named dependency

| # | Idea | Blocked on | Note |
|---|---|---|---|
| I-9 | Payout-schedule card | M7 | "Next payout: Friday · clears ₹X once payments live" — the Earnings tab's `Next payout —` tile grows a date + threshold explainer. |
| I-10 | Gross vs net split | M7 | Ledger rows already carry the columns; M7 adds the fee model + a gross/net toggle. |
| I-11 | Per-publication revenue attribution | M7 | Sale rows join on `pub_id`; Overview rows gain an "earned" figure. |
| I-12 | Price history | M7 (schema) | `premiumPriceInr` is overwritten on publish; correct books need a per-sale price snapshot or price-history rows. |
| I-20 | Unlock moment + owned library | creator | 1–2 days | Full-screen "you now own X" reveal with real computed stats (days/stops/km), then a persistent "My purchases" shelf (cover, creator, version badge, update marker) reachable from My Trips. Research: `docs/commercial/RESEARCH-2026-09-18…` §4. **Unblocked: #251 has merged, so the M7 rail and its unlock flow are live.** |
| I-21 | Purchase share card | growth | 3–4 h | WhatsApp-sized "I bought the Spiti plan" og-image the buyer can post — buyers are the distribution channel (research §4.5). Depends on the share-card pipeline (`public/og-default.png`, `api/i.js`). |
| I-22 | Publication funnel UI | creator | 2–3 d | Per-pub views→forks→sales funnel with preview→sale conversion, against a benchmark once measured. **Blocked on E3 instrumentation** — the events do not exist to read yet (research §5). |
| I-23 | Publish-quality score | creator | 1 d | Checklist with nudges (cover photo, budget filled, notes density, preview-day choice) on the hub + Share tab. Ship, measure via I-22, then claim any lift (research §5). |
| I-24 | Pricing assistant | creator | 1 d | Per-day anchor ("6 days · ₹83/day"), the ₹99–499 band, price-change history. **Needs I-12's price-history rows.** Research §3. |
| I-25 | Buyer reviews | creator | 2 d | Post-purchase ratings on itineraries: schema (reviews table + RLS), policy question (purchase-gated?) first. Feeds conversion, creator feedback, and I-26. |
| I-26 | Creator levels | creator | 1–2 d | Progress strip (portfolio, sales, ratings) with tier perks (Explore placement). Needs I-25's reviews to level on. Research §5. |
| I-27 | Hub presentation pass | creator | 1 d | KPI sparklines, activity feed ("Admin unlocked Spiti · 2h ago"), motion per `docs/MOTION-TOKENS.md`. The studio-dashboard pass over the existing Overview + Earnings. Research §5. |
| I-13 | Tiered platform fee | M7 (decision) | Fee % drops above a lifetime-earnings threshold — a pricing decision, surfaced in the fee column. Pattern: X's 90%-tier model. |
| I-14 | Payout method + KYC management | M7 (schema) | Bank/UPI + legal name + PAN on profiles — M7's biggest schema lift. |
| I-15 | Unlock conversion funnel | M7, then events | Views → premium unlocks per publication; needs entitlement events from M7 first. |
| I-16 | Cross-device Trip DNA persistence | M6/M7 infra | The engine is **done** (category mix, detour tolerance, stop-length dims, cross-trip device learning). What remains is persistence: a `user_dna` table + RLS so the profile survives a device change. Deliberately parked on infrastructure, not an engine gap. |
| I-18 | `overdrive` on the four authored surfaces | the owner's direction pick | The v0.60.0 pass scoped `overdrive` for Landing/PlanBench, the Trip Ticket (Create Trip), the Overview hero and the public-itinerary editorial, and deliberately ran without it: the command's contract forbids writing code before 2–3 directions are presented and one is picked, and requires browser iteration plus a banner. Nothing overdrive-shaped has been built anywhere. |

### Tier 3 — milestone-shaped, tracked as tracks (not ideas)

These are not loose ideas but full tracks with their own sections above — listed here only so
the bank is a complete index of unbuilt work:

| Track | Where | State |
|---|---|---|
| Public route at `/i/<id>` with no hash hop (option B) | [#226](#open-issues) | **Deferred.** The address-bar patch already keeps `/i/<id>#/pub/<id>` crawler-readable, so previews no longer need it. It would still drop the function round-trip on every refresh — and the interim "Opening this itinerary…" page that goes with it — by serving the app at the path the crawler already reads. Needs coordinated app routing, Vercel shell delivery, legacy hash-link handling and refresh/Back/Forward coverage; must not redirect `/i/<id>` to itself or fetch a different deployment's shell |
| M5 — AI companion | [Strategic track](#m5--ai-companion-issues-22--20-the-next-feature-to-build) | Next up; issues #22 → #20 |
| M6 — Together | [Strategic track](#m6--together-collaboration-depth) | RLS test suite, co-editing |
| M7 — Premium | [Strategic track](#m7--premium-monetization) | Blocked: needs a gateway account |
| M9 — Invites & onboarding | [`docs/PLAN-INVITES-ONBOARDING.md`](docs/PLAN-INVITES-ONBOARDING.md) | R1 → R2 → R3; exec plan written |
| M10 — Day Planner (travel-clock engine) | [`docs/PLAN-DAY-PLANNER.md`](docs/PLAN-DAY-PLANNER.md) | P1-A → P1-G; exec plan written. Fixes the short-trip suggestion silence (user feedback) and the 700-km-in-Day-1 gap — meals as fixed clock anchors, duration fatigue cap, derived drive days / night halts / defer proposals |
| M8 → 1.0 | [Strategic track](#m8--10-enablers--the-10-cut) | Offline-first PWA, i18n EN+HI |

### Shipped from these sources — record, not backlog

Kept as one line each so the origin is traceable without re-listing the work as open.

- **Suggestion-engine brainstorm (16/16)** — all shipped, culminating in the Corridor Concierge
  engine (v0.41.0). Source: [`docs/SUGGESTION_ENGINE_BRAINSTORM.md`](docs/SUGGESTION_ENGINE_BRAINSTORM.md).
  Road-projected hit positions · two-pass segment assignment · geo-fuzzy candidate dedupe ·
  reason strings on cards · journey-clock segments · crew-aware fatigue cadence ·
  weather-joined ranking · time-based detour cost + on-way asymmetry · ratings in Google mode ·
  road personality · per-day detour budget · Trip DNA learning · crew-seeded corridor
  suggestions + story arcs + slack prompts · fuel-before-long-corridors advisory · opening hours
  in scoring.
- **CTI alignment deferrals (4/4)** — v0.47.0. Source:
  [`docs/redesign/ALIGNMENT.md`](docs/redesign/ALIGNMENT.md). In-map place search · map popup →
  Board/Timeline cross-links · per-decision route/budget impact panel + grounded assistant
  (`decisionGuide.ts`) · suggestions "why it fits" route-position copy (`reasonForSegmentHit`).
- **Old P4 nice-to-haves (5/5)** — v0.47.0. Explore pagination (12/page + Load more) · undo
  coverage (trip/member/expense/stop deletes) · feedback button (`mailto:` with version+route) ·
  trash + 30-day purge · debounced store writes (600 ms trailing coalescer + pagehide flush).
- **Profile & explore pool (5/5)** — v0.47.0. Source: the former "Idea pool" table. Full Profile field editing (`homeCity` / `languages` /
  `travelStyles` / `socialLinks`) · browser push notifications · route polylines on the map ·
  trash + 30-day purge · Explore pagination.
- **Creator hub (3)** — decision cost-impact editor + context field (v0.36.0) · Explore creator
  bios + newest sorting (v0.35.0 + v0.37.0) · creator hub Overview + Earnings pre-shape with
  projection view (v0.38.0).
- **Budget pool (2/2)** — v0.47.0, verified against source 2026-09-11. **Safe-to-spend per
  day** (`engine.ts:715` `safeToSpendPerDay` + `daysRemaining`, rendered as a `StatTile` at
  `BudgetTab.tsx:180`; counts today, clamps a finished trip to zero, returns null rather than a
  fake number when no target is set) · **greedy fewest-transfers settlement**
  (`BudgetTab.tsx:395`, surfaced at `:363`). Both were still listed as unbuilt in the Sep-6
  brainstorm table; the README had described the first correctly all along.
- **#36 bug-hunt triage (10/10)** — all landed; the survivors were spun out as issues and have
  since closed (see [Open issues](#open-issues) for what is actually live).
- **Map view modes (3/3, I-17/I-18/I-19)** — shipped together with the request that spawned them
  ([`docs/FEATURE-REQUEST-MAP-VIEWS.md`](docs/FEATURE-REQUEST-MAP-VIEWS.md)): default basemap →
  Liberty (I-17) · Terrain hillshade over the keyless AWS terrarium DEM (I-18) · 3D hero pitched
  terrain with `maxPitch` 60 → 75 (I-19), behind a segmented switcher on the Map tab; the Board
  stays hard-2D and the choice persists globally. I-19's mid-range-Android GPU check remains a
  post-merge device step.

## Historical plans (executed — kept for the record, not live guidance)

- [implementation plan for v0.23.0 + the CTI redesign](docs/history/implementation-plan-v0.23.0-cti.md)
  — all milestones shipped (M0–M7 + polish passes); superseded by this file.
- [docs/REPORT-2026-08-29-nearby-rework-and-google-maps.md](docs/REPORT-2026-08-29-nearby-rework-and-google-maps.md)
  — shipped in 0.17.0.
- The old phased plan (AI/Together/Premium/1.0) is preserved as the strategic
  track above; the old P0–P4 lettered sections are merged into M0–M4 and the
  idea bank.

---

## Working agreement (see [AGENTS.md](AGENTS.md))

- Every push ships a CHANGELOG entry; releases bump `package.json` + README.
- `npm run verify` before every push; bare commands only (no `cmd /c`).
- Milestones release on `redesign/**`; all-done → PR to `test`; `main` only
  with the user's explicit confirmation.
- Stage explicit paths — never `git add -A` in a shared working copy.
- Update this file (and the UI-audit tracker) in the same commit as the work;
  when ticking tracker rows, update progress lines in the same edit.
