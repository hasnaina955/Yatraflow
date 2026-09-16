# Changelog

All notable changes to YatraFlow. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versions are pre-1.0 MVP milestones.

> **Two version lines, cut from the same commits.** `X.Y.Z` headings are the **web app**
> (semver, mirrored in `package.json`, deployed by Vercel from `main`). The `-native` suffix
> is the **Android shell's** own numbering (`versionCode`/`versionName` in
> `android/app/build.gradle`, surfaced in Settings → Apps), which does **not** interleave
> with web semver — so `0.7.0-native` is newer than `0.48.0` despite the smaller number.
> Entries below are ordered newest-first by date, not by version number.
>
> **History note.** Entries before `0.42.0` were removed in `adf5f66` (Sep 7, 2026) — that
> record still exists in `git log`, not here. Archived release notes live in
> [`docs/history/`](docs/history/).

## [Unreleased]

### Added
- **True user deletion in the masteradmin console.** The Users tab gains a permanent Delete alongside Disable (the existing reversible soft-ban): an audited `admin_delete_user` RPC deletes the auth account, which cascades every trip the user owns (plan, expenses, votes, decisions, activity, publications), their memberships and authored rows in other crews' trips, and their notifications — while other people's trips survive for the remaining crew. Protected by an explicit force confirmation before destroying published Explore listings, self-deletion and last-admin deletion are refused outright, and the audit log records the blast radius (email, owned-trip count, published count, force flag) before the delete. The console confirms by typing the user's email.

### Changed

### Fixed

### Docs

## [0.56.0] - 2026-09-17

### Added
- **Party + vehicle preferences persist across reloads.** `driverCount` (2 / 3), `hasVulnerable`, `driveAfterDinnerMin` and `vehicleProfile` are now persisted to the trips table — the four fields that the Day Planner finishing batch (#205 / #207) shipped as UI-only and that silently reverted to "1 driver / adults / dinner ends the day / no profile" on every reload. A trip set to "2 drivers, infants, drive after dinner, motorcycle" is now a trip set to that on the next reload too. Migration `20260915_trip_party_prefs.sql` adds the four columns (applied to the live Supabase project); the store's optional-column probe gates writes until then, exactly like the stay-budget pattern.
- **The persisted vehicle profile drives fuel-stop spacing.** `MapTab`'s corridor-search options now pass `vehicleProfile` through to `planJourneyHalts`, so a 60 L / 20 km-L motorcycle is planned at motorcycle cadence and a 50 kWh EV is planned at charge cadence — previously every self-drive fell through to the 450 km car fallback because no app caller ever set `opts.vehicleProfile`. Junk profiles from a hand-edited row are dropped on read (`normalizeVehicleProfile` rejects unknown `vehicleType`/`fuelType`, non-finite or out-of-range `capacity`/`economy`), so the engine never sees garbage math.

### Changed
- **Trip settings is now its own workspace tab.** The crew, dates, places, budget, mileage, fuel price and vehicle profile controls leave the Share tab — Share now carries Plan together, Share publicly and Keep a record alone — and surface as the eighth workspace tab (`#/trip/<id>/settings`), where they are deep-linkable, swipable into on mobile and no longer compete with invite / publish / record for the same sub-tablist.
- **Trip settings changes propagate everywhere, every time.** Five concrete fixes close the realtime gap that hid the trip settings tab from the rest of the workspace (#213 Phase 3):
  - `MapTab`'s `wholeTrip` memo now depends on `trip`, so a transport-mode / round-trip / driver-count / vulnerable tweak re-derives the plan totals — previously it was stable on `[stopSig, routeTotalKm, routeTotalMin]` with the eslint-disable masking the omission.
  - The suggestion cache hash (`planInputsHash`, a one-owner pure function in `useSuggestionCache.ts`) now covers every input the search reads — travellers, driverCount, hasVulnerable, driveAfterDinnerMin, budgetPerPersonInr, fuelEconomyKmL, fuelPricePerL, roundTrip, vehicleProfile — not just anchors, route, scope, travel style and transport mode. A crew / fuel / budget tweak now busts the cache and re-searches at the new fatigue cadence instead of serving 4-hour-old suggestions tuned for the old party. `CACHE_VERSION` bumped 3→4 so old entries are dropped on next load.
  - `MapTab`'s split / clock verdicts now include `dayWeatherCode` in their deps, so a storm-code change with an unchanged rain percent re-weights the rain factor honestly (previously the banner stayed stale).
  - `TripWorkspace`'s road chain now memoises on a geometry-only signature (`roadChainSig(trip)` in `lib/tripRoad.ts`), not on the cloned trip object — a fuel-price / crew / dates / budget save keeps the existing chain and legs, so totals don't blink to haversine, the corridor search isn't re-planned, and the split/clock verdicts keep their numbers.
  - `Group` and `Budget` tabs now read `effective = pending?.proposed ?? trip` instead of `trip`, so while an impact preview is open, the suggested day's expense / fuel / lodging line on the Budget tab and the Group Input filters follow the proposed values, not the persisted ones. Share still reads `trip` (it doesn't render day plans, so the split is immaterial).
  - `DaySection`'s nearby-ideas effect now includes `trip.transportMode`, `trip.startLocationCoords`, and `trip.travelStyle` in its deps, so a transport-mode / start move / style change re-derives the mode-tuned chips instead of keeping the old ones until a stop change.
- **The bed's price can no longer go silently wrong.** Three faults in the stay-budget dial (#213 Phase 4): an unrecognised `stay_style` (the column deliberately has no CHECK constraint) indexed the rate table to `undefined` and multiplied the whole lodging line — and the trip total with it — into `NaN`; the Plan Bench hand-off mapped its stay tier onto the *travel* style and never set the dial, so a Luxury bench run (₹8,000 a room-night) created a trip that billed comfort (₹3,200); and Create Trip's travel-style copy claimed that dial prices the bed, which it does not. The stored key is now validated (anything outside `budget`/`comfort`/`luxury` falls through to the legacy rule, so no stored trip is re-priced), the bench passes its tier through as an explicit dial, and the copy says what the algorithm actually does.
- **Create Trip and Trip settings offer the same choices.** Six vocabulary mismatches closed (#213 Phase 5): **every transport mode is now creatable** (the create grid was a hand-rolled six, missing `taxi` and `mixed`, so a trip could be switched to a mode it was impossible to create — the tiles are now derived from `TRANSPORT_MODES` through an exhaustive Record, so a new mode is a compile error rather than a silent gap); **one crew vocabulary** (`CREW_CHIPS` / `CREW_MIN` / `CREW_MAX` / `clampCrew` in `lib/crew.ts`, with the custom-size field on both surfaces — Trip settings used to render a fixed 1–12 and clamp the display at 12, so a 15-person trip showed "12" and any tap silently dropped the party); **the stay tiers are one list** (`STAY_STYLES` in `data/types.ts`, replacing four hand-written copies — including one inside the bench's random-preset helper); **one fuel-economy default** (`DEFAULT_FUEL_ECONOMY_KML = 15`, which Trip settings used to show as 18); **the party controls are gated by the engine's own `isSelfDrivenMode`** on both surfaces (Create listed `taxi`, which the engine ignores, and omitted `mixed`, which it honours — dead dials in one place, hidden ones in the other); and **Create Trip accepts a ₹0 per-person budget**, matching the settings page and the pacing tile's honest "no target yet" state instead of an arbitrary ₹500 floor. A trip switched to a conducted mode now clears the party dials it can no longer use.

### Fixed
- **A blank tank or economy no longer writes car numbers onto a bike or an EV.** Trip settings fell back to `Number(capacity) || 45` / `|| 15` regardless of the chosen vehicle, so leaving either field empty on a motorcycle (12 L / 40 km-L) or an EV (50 kWh / 6 km-kWh) persisted a car's profile — and the same form re-saved it on every later edit (#213 Phase 6). The defaults now come from `defaultVehicleProfile(vehicleType)`. Also: the per-person figure is divided by `Math.max(1, travellers)` so the bill can never render `₹∞`/`₹NaN` (`engine.ts`), a stored custom "drive after dinner" allowance (say 60 min) is no longer silently rewritten to 120 by any unrelated save, and a fuel price entered without a mileage now says so plainly instead of being quietly ignored in favour of the blended rate.

### Docs
- **The status docs record the settings audit and the queue's real state.** `AGENTS.md` §1.1 now lists the audit among this cycle's landed work and carries the gate's measured size (**961 tests across 96 files**, read from the green CI run on `test`), and the roadmap's snapshot, queue paragraph and Open-issues section say what actually happened: issue #213 was filed and closed the same day, its six phases shipped as PRs #219/#220. Three stale claims are corrected with it — the "nothing is open" line dated to the previous day, the M5 paragraph still pointing at "five items", and the snapshot's "leads `main` by that release" written before the audit landed.

## [0.55.0] - 2026-09-16

### Added
- **A gallery import pipeline with a contract, a validator and an engine gate.** `docs/ITINERARY-IMPORT-SPEC.md` is the canonical JSON contract for an itinerary import that breaks nothing: every numeric is required (a missing `visitMinutes` renders `NaNh NaNm` and poisons the day's dwell), **both** coordinates are checked (a `(0,0)` or mixed-placeholder pin drags the whole route to the Gulf of Guinea), unknown keys are rejected outright (a typo'd field is otherwise silently dropped), and `days.length` must equal the inclusive date span. `scripts/validate-itinerary.mjs` is that contract's executable half — zero dependencies, run against any file or an `examples/` directory — and `scripts/gallery-geocode.mjs` supplies the coordinates the way the spec demands (Nominatim lookups with punctuation fallbacks, so an apostrophe or a comma cannot lose a stop). `tests/golden-itineraries.test.ts` is the second gate: it spawns the validator, then runs each `docs/examples/itineraries/*.golden.json` through the real engine and requires **health ≥ 85 with no HIGH-severity warning** and a declared budget within **±15 %** of the engine's own estimate. It also pins the validator's enum tables to `src/data/types.ts`, so a schema change cannot silently desync the two.
- **`docs/PLAYBOOK-GALLERY-RESEARCH.md` — how the gallery gets filled.** The five-stage workflow (select → research → draft → validate → publish) with the source ladder (official tourism/ASI/IRCTC pages for every fee, the app's own router for every distance, recent trip reports for rhythm), a research sheet, the publish step, a gallery ledger, and the first-impression checklist. It records the two rules the first shelf entry taught: **coordinates are geocoded, never recalled** (hand-typed coordinates for the Bylakuppe/Dubare cluster were ~15 km off), and **fee conflicts are reconciled in the open** (Mysore Palace shows ₹50 in the palace's own announcement and ₹70 in guidebooks — publish the official figure, cite it, and say so in `warningsAndAssumptions`).
- **The first shelf entry — `coorg-loop-from-bangalore`, 5 days, ₹12,100/person against the engine's ₹12,102.** Its first shape was the popular 3-day Bangalore→Coorg weekend, and Gate 2 rejected it: day 1 measured **423 min / 268 km** — a HIGH "heavy travel time" warning, because that drive is honestly 6–7 hours. The published loop breaks the drive at Mysore in both directions (max day 262 min), cites every ticketed fee to a Tier-1 source, and geocodes every stop against OSM — the same provider stack the app uses.
- **The gallery shelf's first five trips, every one engine-priced and fee-cited.** With Coorg as the reference entry, the shelf now carries `goa-north-to-south` (5 days, ₹14,350), `kerala-hills-and-backwaters` (6 days, ₹17,500), `mewar-forts-and-the-blue-city` (Udaipur → Jodhpur, one-way, 5 days, ₹14,300), `kashmir-valley-in-six` (6 days, ₹16,200) and `meghalaya-rain-and-root-bridges` (5 days, ₹8,150) — five archetypes, three fly-in `taxi` trips and one self-drive rental, spanning a backpacker band and a comfort week. Every ticketed stop cites its source, conflicting figures are reconciled in `warningsAndAssumptions` instead of quietly picked, every coordinate is a geocoder lookup, and every declared budget is the engine's own printed estimate (worst drift 0.6 %). Health after the gates: 97 / 100 / 93 / 100 / 100. The gate earned its keep by reshaping three drafts — Mewar's Ranakpur→Jodhpur day measured **319 min**, a HIGH, so Mehrangarh moved to the next morning; Meghalaya's declared budget sat **97 % above** the engine's; and two drafts had same-coordinate stops tripping the backtracking rule.
- **`docs/GALLERY-BACKLOG.md` — the twenty shelf trips, ranked by demand rather than by taste.** Domestic visitor data, the itineraries that exist as search phrases, season honesty and the engine's own shape constraints set the order; the page records what the first five optimise for as a set (archetype and budget spread, no trip needing a permit) and why Ladakh, Spiti and the Golden Triangle come next rather than first. The docs index carries it beside the spec and the playbook.
- **Vercel Web Analytics is wired into the app shell.** The keyless `<Analytics />` component mounts at the root of the web app (deliberately not in the Capacitor shell, where the insights endpoint can't be reached) and reports pageviews and web vitals to the Vercel dashboard. One honest caveat: the app's router is hash-based and the script auto-tracks via the History API, so the dashboard counts sessions and totals, not per-route visits — funnel-level route tracking will ride on explicit `track` events later.
- **An accepted night halt now holds its position.** Accepting a night halt remembers it by **night ordinal** (0 = the first overnight), so a re-split that shifts day indices can't misattribute it, and every later plan snaps that overnight back to the accepted spot. When the route genuinely moves the halt — a new stop, a different start time — the plan **asks**: drift beyond 15 km surfaces as a "Move here" proposal rather than silently relocating the night, drift below it holds quietly, and changing the trip's endpoints clears its pins outright (#143).
- **An existing trip can change who is driving (#142).** The party inputs — drivers sharing the wheel, infants or seniors aboard, drive after dinner — shipped in the Create-trip flow, so a trip was frozen at whatever crew it was created with: `driverCount` appeared seven times in `CreateTrip.tsx` and **zero** times in `TripSettingsForm.tsx`. Trip settings now carries the same three controls, and because the engine already honours them, changing them moves the split verdict, the daily wheel cap and the clock walk on the next re-plan (#142).

### Changed
- **Dinner stays late — the sunset does not move it.** Deriving the dinner window from sunset shipped and was reverted the same day: it landed dinner at 17:00–18:00 through a northern winter, and that is not how this market eats. The window is back to its late norm for everyone (20:00–21:00, night end 23:00), and the sunset plumbing is deleted rather than left dormant so nothing quietly depends on it. #122's season half stays open, and the honest shape for it is an **advisory** ("this day finishes after dark") or an opt-in early dinner — never a silent shift of the meal.
- **The terrain profile resolves terrain inside a leg (#204).** The profile added for #124 was built from leg totals, so a hill route only heard about its ghat if a stop happened to sit at the boundary — on Jaipur→Shimla or Kochi→Munnar the whole climb lives inside the first stop-to-stop leg and the anchors drifted by tens of km. The road measurement now asks OSRM for per-coordinate distance and duration on the **same** request it already makes (no extra call, no billing) and builds the profile at that resolution, so the ghat reaches the anchors. Where a provider returns no annotations — Google Routes, or the haversine fallback — the leg-total behaviour is unchanged.

### Fixed
- **The enhancement batch is reconciled onto the released realism design, and now fixture-pinned.** The batch's engine pieces — party-aware caps (+2 h with two drivers, +3 h with three, −1 h with infants or seniors, inside 6–12 h rails), dinner as an input rather than a biological absolute (kids and seniors eat at 19:00; a trip allowing post-dinner driving halts for the meal and carries on within its allowance and the night end), severity-banded rain, fuel ticks folding into a nearby meal or halt with an EV charging on its own cadence, the directed return walk, and lodging identity by provider place-id — are unified onto the shipped design instead of duplicating it: **one** mode gate (`isSelfDrivenMode`, replacing the batch's private `DRIVEN_MODES`) and **one** rain model, with the motorcycle's saddle fatigue priced through the mode-tuned cap rather than a second constant. Nine acceptance fixtures pin each behaviour, so the reconciliation cannot silently drift apart again (#122, #126, #141, #142, #144, #145, #146).
- **The Day Planner stopped walking the day on one blended speed.** Every anchor — lunch, tea, the night halt — and every arrival ETA was positioned with a single `totalKm / driveMinutes` rate, so on any day whose terrain differed from the trip's average the times were wrong in the direction of the mismatch: a ghat-first day put lunch **81 km** past where the car actually is at 11:30 (156 km against a true 75) and the halt 47 km late, while a plains-first day undershot by 24 km — the same average cannot serve both. The walk now converts time↔km through the measured road's own terrain profile (the legs it already fetches), and the split's night-halt boundary is placed where **cumulative wheel time** is even rather than where km is even — so its reported `maxDailyWheelMin` is a real number again (it was reporting 520 min for a day that takes 590, understating exactly the fatigue the cap exists to enforce). One-way trips are untouched: with no profile the blended rate is used byte-for-byte, which every existing fixture pins (#124).
- **The trip's road is measured once, by one owner.** The workspace and the Map tab each ran their own routing chain over the same points — doubling the load on the shared OSRM demo server (the rate-limiting behind the transient failures) and letting the map draw a road the detour math could not see. One measurement now feeds both the engine's leg corrections and the map's line, totals and suggestion corridor, with the single retry living in that one place. A chain where every leg fell back to the straight-line estimate counts as *unresolved* rather than passing as a measured road, so a rate-limited day degrades honestly instead of drawing chords as if they were roads (#188).

### Docs
- **Status docs refreshed for the promotion to `main`.** `AGENTS.md` §1.1 and the ROADMAP snapshot still described the promotion as pending — `main` at v0.53.0, `test` nine commits ahead — and the verify-gate counts predated the batch. They now record the converged state: both lines carry v0.54.0, `test` is an ancestor of `main` with nothing outstanding, and the gate stands at 93 files / 885 tests (#212).
- **The issue queue is empty, and the plan of record says so.** The rebrand (#96) is archived — there is no need or plan to rename, so `refactor/brand-seam` is kept as archaeology rather than pending work (with the `appId`-breaks-updates caveat recorded for any revival) — and #122's season half is closed as not planned: the late dinner window is deliberate, and the advisory/opt-in shapes are recorded on the issue if it is ever revisited. The ROADMAP's table, snapshot counts and the AGENTS in-flight note all reflect it.
- **The roadmap's stale claims are gone, and its ledger reaches the present.** Six claims were checked against the repo and corrected: the snapshot stanza (it still described `main` at v0.53.0 and a ~45-commit gap, when both branches had carried v0.54.0 for hours), a closed issue listed as open, M5's "the only milestone with open issues" (both of its issues closed, so it has none — the framing had now been wrong in both directions), a "next version" line frozen at `0.48.0` + 1, an open-issues table whose rows understated shipped code, and a progress ledger that stopped at v0.41 — **fourteen releases, v0.42 through v0.54, are now recorded**, each summarised from the CHANGELOG's own banner rather than recalled (#202).
- **#124's roadmap row and the issue now read fixed.** The terrain-blind walk is done (above); the row records the residual as data GRANULARITY — a leg-derived profile cannot see a terrain change inside a single leg — pointing at its own issue rather than at the walk.
- **The roadmap stopped claiming a fixed defect was pending.** Five places in `ROADMAP.md` said the M0 demo-seed guard was "never implemented" — the code has gated it since #94 (`store.ts` seeds only when `!tripCountUnknown`, i.e. only when the trip count could actually be read), so the plan of record was carrying an unchecked box and a "headline defect" note for a problem that no longer existed. Verified against source and corrected.
- **The doc index covers the docs again.** `docs/README.md` gained the missing rows — `MOTION-TOKENS.md`, `DESIGN-SYSTEM-GUARDRAILS.md` (the two halves of the design system the v0.53.0 audit documented), `PERFORMANCE_AUDIT_2026-09-05.md` and `SUGGESTION_ENGINE_BRAINSTORM.md` — each tagged with its Diátaxis flavor, per the §6 protocol.
- **The roadmap's queue is one issue, and the Day Planner finishing set is recorded.** #122 (the dinner window now follows the sun), #142 (trip settings carries the party controls), #202 and #204 (the intra-leg terrain profile) all shipped, so the open-issues table and the live-queue sentence now name the rebrand (#96) alone — and the snapshot's gap counts were re-derived against the repo (test 6 ahead, main 8).

- **Strategy, monetisation and launch docs added** (`docs/`), anchored to the shipped product rather than to a projection: `REPORT-2026-09-15-strategy-and-position.md` (the position, every figure tagged *measured / derived / assumption / unknown / decision*, the vendor market-sizing spread, the staged ladder) · `PLAN-MONETISATION.md` (the paywall surface that already ships, the fee arithmetic — Razorpay 2% TDR + 18% GST = 2.36% effective, a ~3.86% floor before the platform earns anything, Rs 25.30 net per Rs 199 unlock, and the ~Rs 27/sale gap between intermediary and merchant-of-record — pricing, five stages with gates and kill criteria, the M7 schema, conversion mechanics, failure modes) · `PLAN-LAUNCH-AND-DISTRIBUTION.md` (the live deployment measured in a real browser, the share-preview gap, the public gallery, instrumentation, the first distribution loop). Two live captures added under `docs/screenshots/`.
- **`PLAN-MONETISATION.md` §6.0 records a fix that precedes M7 — the premium lock is not an access control.** Publishing flips `trips.visibility` to `'public'`; the `trips read` policy carries no `to` clause, so it applies to `anon`; and the whole itinerary is the `days` column on that row. Locked days are therefore readable without an entitlement, so entitlements alone would not make the unlock real. The redacting read path (a `SECURITY DEFINER` RPC mirroring `get_invite_trip`, plus a narrowed table policy — shipping together, or the public page breaks) is **item zero of M7 and gates the first sale**. The full audit write-up, including its reproduction detail, is deliberately held outside this repository until the fix ships; §6.0 carries the finding, the evidence and the fix without the how-to.
## [0.54.0] - 2026-09-15

**The suggestion pipeline tells the truth.** Three faults had been quietly draining the Map tab's suggestions and the Day Planner's halts: detours were computed by subtracting one routing engine's route total from another's internal legs, so every on-road dhaba read "50 km off-route" on a long corridor and the per-day budget withheld almost everything behind it; the workspace and the Map tab each measured the same road, doubling the load that caused the transient failures they then could not recover from; and the night-halt town layer was asking for a place type that Google rejects outright, so it had been returning nothing at all. All three are fixed — detours are measured against the road the search actually ran on, one measurement feeds every surface, and night halts anchor on real towns with beds. The Day Planner's meal and fuel cadences came back with them (a load-balanced 350 km day was absorbing its own lunch and could never fit a fuel stop), Create Trip learned the Plan Bench's money motion and its route integrity, and a rate-limited day now degrades visibly instead of drawing straight lines as if they were roads.

### Added
- **A route-integrity guardrail** (`tests/route-integrity.test.ts`): every `#/…` link and
  `navigate('/…')` call in `src/` must resolve to a route `App.tsx` handles — the
  `switch (parts[0])` cases plus the pre-switch `parts[0] === '…'` checks. Comments are
  stripped first, so a route named in prose is not read as a live link, and both
  assertions carry a vacuity guard, so a parse that found nothing cannot pass.
- **The fatigue cadence is hours, not km.** Stretch breaks fire at `STRETCH_CLOCK_MIN`
  (120 min) of wheel time — 150 km was ≈2 h at highway speed but 3.6 h at the engine's own
  blended 42 km/h — and `planDriveDays` derives the drive-day split a route **demands**
  from the style/rain-tuned wheel-hour cap, load-balanced (700 km → 2 × 350, never
  585 + 115).
- **Fixed meal anchors on the clock** (`planTravelClock`): breakfast 08:00–09:30 fires
  only for pre-08:00 starts, lunch 11:30–14:30, tea 16:30–17:30, dinner 20:00–21:00
  **ends the driving day**. The night halt lands where the day's km budget, dinner, or
  the wheel cap arrives first — never night driving. Late starts get honest outcomes: a
  short hop to a night halt, or a "leave tomorrow 06:00" defer proposal.
- **The Map tab proposes the split the route demands** — "this drive needs N travel days
  — apply?" — counted from the travel clock, which knows the start time and bills round
  trips there and back, so one drive tells one story (#123). Applying it stamps real day
  shells (title, 08:30 start, extended trip dates); declining is respected with the
  honest red fatigue verdict (#133, #135).
- **Short trips stopped being silent.** The 90 km floor yields to the 2-hour clock rule
  (80 km of ghat crawl earns its stretch), the destination exclusion zone scales with
  journey length, and ¼/½/¾ fraction rows keep the strip useful below the fatigue floor —
  serving sights and meals, not errands, and no place wins two quarters (#128).
- **Derived day attribution everywhere:** DRIVE/STAY/MIXED labels on timeline day headers
  share the planner's own km-or-hours floor (#134); suggestion rows carry the wall clock
  their halt was derived from, "Day N · after your night stop" chips, and return-leg
  chips on the far quarter of round trips.
- **The bill prices the bed.** Hotel stops — accepted night halts or hand-added stays —
  gain a lodging line (overnights × rooms × style rate) from one stay-rate table shared
  with the budget bench (#125b); lodging identity keys on the provider place-id first
  (#146 — carried from picked hits through StopEditor and Add-to-timeline), with the
  coordinate cluster and normalized-name fallbacks beneath it for hand-typed stops
  (#125a). The night halt's minutes are never charged to the day's detour budget.
- **Create-trip helps from the first two points**: the route's own verdict — "The drive
  wants N travel days" with one-tap "Make it N days" (and the honest single-stretch wheel
  time when it doesn't fit the dates); it says "there and back" when the round-trip
  toggle is billing the drive home.
- **Style and budget are separate dials.** Travel style tunes stop frequency and
  suggestion flavors and never touches pricing; a **Stay budget** dial
  (Budget/Comfort/Luxury, ₹1,200/₹3,200/₹8,000 per room per night) prices the bed.
  Existing trips derive the dial from their legacy style — nothing re-prices silently.
- **Trip-aware map search**: results project onto the trip's own road and rank by detour
  (then road position), each showing "~X km into the trip · Y km off-route"; anything
  beyond the detour scope renders muted with an honest toast.
- **Optional-spend watch (opt-in)**: a soft 20%-of-estimate line on the Budget tab —
  tips only, nothing changes, off by default.
- **"Day out" / "Weekend dash" presets** on trip creation. The hero map frames the
  trip's own road (`heroBearingForRoute`) and always opens 2D.
- The planner is documented in [docs/PLAN-DAY-PLANNER.md](docs/PLAN-DAY-PLANNER.md) and
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §8; the fixtures in
  `tests/dayPlanner.test.ts` are the spec.

### Changed
- **Night halts anchor on real towns.** Google's locality data bottoms out at village level on rural corridors (hamlets like "Gauriyapur", nothing to rank by), so the night-halt town anchor now also consults OpenStreetMap's `place=city\|town` — population-ranked, free and keyless, and the only source carrying town-grade data out there (Chunar 37k, Mirzapur 234k, Hazaribagh on the same corridor). When real towns are available the hamlet-grade entries are dropped, so a halt lands somewhere with a bed; where OSM has no town (dense urban corridors, where Google's locality coverage is strongest) the previous list is kept. This is a deliberate, narrow amendment to the Google-only provider directive — scoped to the town anchor; POIs, meals and fuel stay Google-only (#189).
- **Trip settings opens with two bars, not one.** Budget preference (Budget / Comfort /
  Luxury) and Travel style used to share a single block with the style bar on top and
  the price bar tucked underneath it, so the second read as a sub-option of the first.
  Each is now its own bar, at the top of Trip settings and of Create Trip, in that
  order: Budget preference answers what the bed costs, Travel style answers how the trip
  moves and what it suggests. Neither touches the other.
- **Suggestion rows sync to the map on click, not hover** — hovering a row no longer
  glides the camera (accidental map movement); rows show a pointer cursor.
- **Directions sits beside the travel card's title**, not on its own line.
- **Resolving a map-sourced vote adds the winner to the plan.** Shortlisted stops
  sent to a group vote carry their place with the option; hitting "Resolve" lands
  the winning place as a confirmed stop on the suggested day (clamped to the trip's
  range) — so it shows up on the Timeline, Board and Map at once, and the
  suggestion rail drops the rows it settles, winner included. Hand-raised
  decisions without a place resolve exactly as before.
- **Deleting a stop from the map pin.** The pin popup gains a Remove action
  (editors only) with an Undo toast — the undo restores the stop at its original
  position within the day instead of appending it at the end.
- **Shared sources under the planner**: one lunch window, one stay-rate table
  (`src/lib/rates.ts`), one drive-day floor (`isDriveDay`), tolerant style/rain
  parsing (#130, #132).
- **Create Trip's money figures roll like the Plan Bench** — the rough bill's transport /
  stay / food rows, the total, the per-head figure and the mobile dock amount animate
  into place instead of swapping, so tuning travellers or dates reads as a recalculation
  rather than a silent replacement. `Odometer` and `useMedia` move out of `PlanBench.tsx`
  into `src/components/ui.tsx` as shared exports — the rolling figure is the app's, not
  the landing page's — and `Odometer` takes an optional `label` so each call site renders
  the `sr-only` alternative it needs. Reduced motion still gets plain text, and the Plan
  Bench imports the same two primitives with its own rendering unchanged.

### Fixed
- **A night halt can no longer be anchored to a town hundreds of kilometres away.** The town candidates are filtered against *any* halt position, so a segment with nothing nearby could take the least-bad candidate from further down the corridor — live-verified: a 350 km halt "anchored" on Jhumri Tilaiya, 800 km later. A populated-place anchor more than 120 km from its own halt is now rejected, and the segment reports an honest gap instead (#189).
- **Night halts stopped starving on the corrected city lookup.** The city anchor layer's switch to Google's Nearby Search asked for `administrative_area_level_3` alongside `locality` — a type Nearby Search rejects, so the whole request returned 400 and the layer reported **zero cities everywhere**. Because the caller catches, that read as "no towns near any halt" rather than as a broken request: every overnight suggestion quietly starved on every trip. The lookup asks for `locality` alone now (live-verified: 6 places per rural halt point), and night halts anchor again (#189).
- **The trip's road is measured once, by one owner.** The workspace and the Map tab each ran their own routing chain over the same points — doubling the load on the shared OSRM demo server (the rate-limiting behind the transient failures) and letting the map draw a road the detour math could not see. One measurement now feeds both the engine's leg corrections and the map's line, totals and suggestion corridor, with the single retry living in that one place. A chain where every leg fell back to the straight-line estimate counts as *unresolved* rather than passing as a measured road, so a rate-limited day degrades honestly instead of drawing chords as if they were roads (#188).
- **Suggestions stopped charging phantom detours on long drives.** A dhaba or petrol pump sitting right on the highway could read "50 km off-route" on a 1,400 km corridor — the detour math subtracted one routing provider's route total from another's internal leg sums, and the difference (≈47 km on that corridor, a plausible-looking 1–3 km on short trips) was charged to every suggestion. That torched the per-day detour budget, held back most See & do ideas, and thinned the halt rails. Detours are now measured geometrically against the same road line the search ran along, so a place on the drawn road reads "on route" no matter which routing engine answered (#187).
- **Multi-day drives grew their lunch and fuel stops back.** On a load-balanced plan (say 4 days × 350 km) the planner's lunch was silently absorbed into every night halt — it slides to the 14:30 window edge, ~2 h 20 m of wheel time before the halt, inside the old merge bound — and the fuel cadence restarted at each day's start, so it could never land inside a day shorter than the tank stride. A 1,400 km trip produced zero meal and zero fuel suggestions. Lunch now survives as its own stop unless it lands within an hour of the halt (that is dinner at the halt anyway), and fuel follows the tank on a corridor-wide cadence (#189).
- **Night halts find their towns again.** The city anchor layer asked Google's Text Search for "towns and cities" — a query that matches POI names, not places, so it had quietly returned nothing and every night-halt suggestion starved. It now uses Google's Nearby Search with the locality place type, searched at each night halt's actual road position, and refuses to fill a halt with a town hundreds of kilometres away — an honest gap instead of a misleading card (#189).
- **The budget tier reverted on every reload.** The dial shipped in `deecbcc` with no
  column and no row mapping, so the tier a traveller picked was session-only and
  silently fell back to the legacy-derived value. It is persisted now
  (`20260914_trip_stay_budget.sql`), and the mapping is covered by tests — including
  the pre-migration path, which must stay a no-op rather than write a column the
  database does not have.
- **Create Trip's bill priced the bed from the travel style.** `estimateTripStarter`
  took a `travelStyle` and derived the tier from it, so the bill and the settings page
  could disagree about the same room. The bill takes the budget dial.
- **Trip deletion works again** — the production "trips read hide trashed" policy
  rejected the tombstone UPDATE (its added-row check saw a trashed row that
  nobody, including the owner, could read), so Delete silently rolled back and
  the trip reappeared after refresh. The policy now lets tombstoned rows reach
  their owner/editors while everyone else still never sees them, hydration
  filters tombstoned rows out of the live list itself (the Trash view reads
  them via `get_trashed_trips`), and `supabase/fix-trashed-read-policy.sql` is
  the idempotent Dashboard repair. Reproduced with a live QA account before and
  after.
- **The travel clock walks every day of a long drive** — the re-balance loop subtracted
  the absolute halt position from a relative budget, truncating a ~3,300 km walk at 4
  days (#137).
- **Night halts never land inside the destination exclusion** (#140), and the final
  day's arrival is clock-checked — past-night arrivals are flagged, not hidden (#138).
- **Segment ETAs carry halt dwell time** (#129); a meal folds into the overnight halt
  instead of sitting inside its gap floor (#131), and a fuel tick lands in the halt too
  when it falls within the fold window before the overnight — no refuel-then-sleep
  double stop at dusk (#144).
- **A wet day caps only that day** — the clock walk takes per-day rain instead of one
  trip-wide factor (#127), and the cap weights rain *severity*, not just chance: a 90%
  drizzle day damps ≈0.66× while a 90% thunderstorm hits the 0.5 floor (#141).
- **Conducted modes get no split verdict** — train/bus/flight/taxi legs (someone else
  drives) stay silent in the Map tab's banner, day chips, Apply-split and CreateTrip's
  verdict, and a motorcycle rides 1.5 h below the same style's car cap (#126).
- **Corrupt `startTime` can't silently become midnight** — out-of-range input clamps
  to a valid, loudly non-midnight start (#136).
- **The corridor search no longer re-runs on unrelated edits** — verdict memos key on
  stable signatures instead of object identity (#135).
- **The drive-day banner no longer flashes on map open** — it waits for the OSRM road
  measurement instead of rendering from the rough haversine estimate.
- **Saving trip settings no longer toasts success on a rejected save** — a date shrink
  blocked by a day holding stops shows only the reason.
- **Select's keyboard scroll honours reduced motion** (`scrollBehavior()`), as does the
  suggestion panel's cross-highlight scroll (#118).
- **Haptics DEV logs tell the truth** — they fire only where a backend exists,
  native-plugin failures surface in DEV, and vibrate-less browsers stay silent (#119).
- **Landing hero sheen leak** — the glass-sheen sweep is `position: absolute` but `.btn`
  never established a clipping box, so a skewed bar swept the whole hero face and read as
  a stray grey blob sliding across empty space beside the CTAs. Each hero button is now
  its own clip box.
- **The Map tab's suggestion rails pass a dedicated accessibility and consistency audit (#152–#181).** Warn text on light theme reads through the AA-passing ink tier (5.3:1) on facts, chips and the map spur, which now paints from `--warn` instead of a hardcoded hex; rail cards are keyboard-operable with real names and the fold buttons carry `aria-controls`; the rotating engine tip no longer spams screen readers every 7 s. Card, ruler and map now tell one story: ruler dots nudge apart instead of stacking at shared km and read the same km the card prints, the detour spur snaps to the same road projection the card's minutes use, one "fits-budget" predicate decides warn/held-back, unknown-km hits say so instead of silently attributing to Day 1, and "Best fit" appears only on the top-scoring pick. Chip filtering keys on stable ids instead of display copy, ratings endorse only with a 10+ review sample, the detour whisker's spur length now scales with share of the day's budget, quota outages get one honest story on every rail (never dressed up as a short trip), the detour-scope preference is guarded and namespaced with the rest, threshold chips got estimate-proof bands, and stale planner copy was rewritten to describe the clock-first engine.
- **Map zoom/fullscreen controls were unusable** — mapcn's `MapControls` ships Tailwind
  utility classes this app doesn't compile, so the group rendered as static flow under
  the canvas (invisible in 2D, stray and clipped otherwise). The handful of rules it
  needs are hand-ported in app tokens under `.yf-map-ctrls`, pinned top-right, above
  the canvas, in both themes.
- **Dark-mode pin hover tooltips unreadable** — maplibre's stock popup chrome is bare
  white regardless of theme, and light text on it vanished. Popups (hover tips + the
  stop cross-link popup) are reskinned to the app card in both themes, tip included.
- **Map search results carry real coordinates** — the search-to-add box ranked Google
  autocomplete hits, which are deliberate (0,0) "resolve on pick" placeholders, so every
  row measured Null Island and rendered the identical "~1675 km · 8448 km off-route".
  It now runs one free-form Text Search (the same event the corridor scan pays) whose
  hits carry real locations; coord-less stragglers are resolved-or-dropped; quota
  exhaustion toasts honestly.
- **Placeholder coordinates can't poison a trip** — Add-to-timeline and location picking
  resolve "resolve on pick" placeholders before any write, refuse unpinnable hits with a
  visible error, and mixed placeholders (latitude 0, real longitude) are rejected — the
  route can no longer dive to the Gulf of Guinea on an unnoticed (0,0) stop.
- **Timeline drag got cropped at the day card** — the carried row escaped nothing: the
  day-collapse clip (`overflow: hidden`) cut it off at the card edge. While a drag is
  live the owning section unclips (`drag-live`), same fix applied to Board columns.
- **Plan/Inspect pill jumped sides** — the long Plan copy's max-content pushed the
  header tools row into a left-aligned wrap. The copy is now the flexible item and the
  tools pin right (margin-left auto keeps them right-aligned even when wrapped).
- **The Plan Bench's "Turn these numbers into a real trip" went nowhere** — the CTA set
  `location.hash = '#/create'` and the router has no `create` case, so its `default:`
  branch rendered the landing page: the button read as inert and the prefill it had just
  stashed was never read. It targets `#/new`, the Create Trip route the nav already uses.
- **The admin console's published-itinerary links landed on the landing page** — the
  table linked `#/p/<id>` where every other published link (PubCard, Creator Hub,
  Explore, the share link) uses `#/pub/<id>`.
- **On a phone the printed bill had nowhere to appear** — `.ts-rail` was `display:none`
  at ≤900px, so "Print bill" fed a hidden container: no split, no formulas, no pace
  verdict, and the dock's figure only arrived after the tap. The ticket stays in the page
  flow at that width, as the Plan Bench shows its receipt, and its own "Create trip"
  button steps aside so the fixed dock stays the single primary CTA. Printing scrolls the
  bill into view (`block: 'nearest'` via `scrollBehavior()`) — minimal scroll,
  reduced-motion aware, and a no-op on desktop where the sticky rail already has it.
- **The hand-off copy named figures that do not transfer** — the Plan Bench stashes
  travellers, mode, travel style, budget, the return flag and the fuel figures, not the
  distance (`km`) or trip length (`nights`) its own headline price is built on. The
  fineprint names what actually carries over.
- **The smart budget rewrote its field unannounced** — the rough take landing in the
  per-person budget as the plan grows is deliberate, but a value changing under a
  screen-reader user is a mutation they never hear. A polite live region reports the new
  amount when the auto-fill writes, and stays quiet while the field is the user's focus.
- **ROADMAP status section refreshed to v0.53.0** — snapshot, open-issues table and the
  stale #84–#90 evidence bullets brought up to date, plus `tests/roadmap-status.test.ts`
  pinning ROADMAP/package.json/CHANGELOG version parity.

### Docs
- **Status docs refreshed for the `main` promotion** — `AGENTS.md` §1.1 recorded the #107 tracker as
  "96 ticked/annotated" over "five batches (PRs #109–#114)"; it now records the true final state:
  **117/117 boxes closed** across PRs #109–#116, plus the post-release UI fixes promoted alongside.
- **README screenshots refreshed** — the pre-build concept mockup on the landing hero is replaced by two real captures of the shipped page (`docs/screenshots/landing-hero.png`, `docs/screenshots/plan-bench.png`), taken from a production build of `main` with the scroll-reveal animations settled; the original concept boards stay in `docs/redesign/` as the design-history record.
- **Status docs reflect the final #107 state** — `AGENTS.md` §1.1 records
  **117/117 boxes closed**, and the Day Planner docs carry honest open-item
  markers (lodging-anchored halt placement is P1-C, not shipped).
- **The design-system contrast gate now covers the Map rails (#154)** — a new
  pinned contract measures the rail's warn-ink pairs against their real
  surfaces in both themes; color-only overrides can no longer ship a
  sub-AA pair unnoticed (the hole #152 slipped through).

## [0.53.0] - 2026-09-13

**The design-system audit gets fixed, not just filed.** An independent AI audit of all 19
pages, 20 overlay surfaces and 20 native selects became issue #107 — a root-cause-grouped
tracker — and five batches worked it to the floor: a per-theme contrast pass that fixed every
live AA failure (deepened light inks, dark-foreground swaps on solid-teal fills, literal navy
gradient stops where `--gray-900` broke dark), the motion vocabulary consolidated onto the
tokens (one stagger step, JS timing read from CSS), the mechanical tail (kicker recipe for
every micro-label, coarse-pointer hit areas, disabled states that look disabled, layout
shifts), native-select popups replaced by a real ARIA listbox on the high-traffic surfaces,
and the last design decisions resolved — including a scenic 292° hue that finally separates
the "places to see" lane and the viewpoint spine from the day-route palette they'd been
borrowing. The map's day filter draws the selected day's whole journey again. Android
`versionCode 14 / 0.14-native`.

### Added

- **Page-by-page UI design-system audit committed as a reference doc** —
  `docs/UI-PAGE-AUDIT.md` is a diagnostic-only (no fixes applied) pass over all 19 pages/sections,
  20 overlay surfaces and 20 native `<select>`s, measured against the project's own token/motion
  system with computed WCAG values and `file:line` citations. It is the write-up behind
  **[issue #107](https://github.com/hasnaina955/Yatraflow/issues/107)**, now the complete fix
  tracker (contrast · tokens · motion · layout · a11y · selects), grouped by root cause so the
  "known rule, siblings unfixed" families (light-ink deepening, dark-foreground swap, motion
  tokens, `pointer: coarse` hit areas) each collapse to one change. Indexed in `docs/README.md` as
  a companion to the earlier accessibility `UI_AUDIT.md`, not a replacement. A provenance banner
  notes the line cites predate v0.51.0/v0.52.0 — re-locate by selector.

### Fixed

- **Single-day map view draws only the selected day's journey** (PR #106, on `test`). A regression
  from the engine-journeys change: the single-day branch switched its source to every day that *has*
  a route and dropped the day filter, so selecting Day 2 kept rendering all days' lines while the
  camera fit Day 2 alone. Restores the one-day-in, one-day-out contract; the selected day still
  shows its whole engine journey (anchor-only outbound and ride-home included), and the Board
  backdrop regains its documented `focusDay` behaviour.
- **UI audit #107 — contrast, ink-tier, a11y and layout batch (verified per theme).** Fixing the
  root causes first, every value re-computed against the *current* tokens (many audit rows had
  already shipped fixed in v0.51/v0.52 — e.g. `notif-badge` is 8.2:1 now — so only the live
  failures were touched):
  - A **deepened light text-ink tier** (`--ink-amber` #8F5B06 · `--ink-ok` #1F6B41; dark re-declares
    them to the already-passing raw aliases) now backs `chip-ok`, `metric-good`/`balance-pos`,
    `metric-warn`, `impact-head`, `.delta-neg`, `tl-total-warn`, the amber-sibling block and the
    `tab-count--hot` (which also lost a dark-on-dark hardcoded `#8F5B06`).
  - The **solid-teal-fill + white** family (`step-num`, `vote-btn.on`, `mode-btn.on`, `crew-btn.on`,
    `cal-day.edge`, `route-dot`) moves to `--teal-deep` in light and the `#06251f` dark-foreground
    swap in dark — the pattern `.map-legend-toggle.map-live-on` already used; the mode-tile hint gets
    its dark ink too. `--color-primary` (light) steps one notch deeper so the primary CTA's white
    label clears 5.19:1 at rest (which also lifts `.share-tab.is-active`, it shares the token).
  - **Explore:** the Saved chip's selected state drops white-on-saffron (1.97:1) for the soft-fill +
    deep-ink recipe its siblings use; the hero search placeholder goes to full `#e2f1ef`; and the
    focus now declares a **white** ring so the dark-teal hero can't wash the shared `.input:focus`
    indicator out to 1.18:1.
  - **SYS-5:** `.card.route-snap` and `.trip-head-card` end their gradients in a **literal** navy
    (not `--gray-900`, which flips near-white in dark and stranded the white text at ~1.1:1) — which
    also makes the Public Itinerary glance text legible in both themes as a side effect.
  - **A11y:** `PayerSelect` now forwards the `id`/`aria-*` that `Field` injects (the "Paid by" label
    previously pointed at a non-existent id — no accessible name); the Budget metric strip gets
    `role="group"` (so its `aria-label` isn't ignored); the expense table's empty actions `<th>` gets
    a screen-reader label; the Group Input **consensus bar** low/mid segments move to a neutral→amber
    →green ramp (was `--line` 1.18 / `--saffron` 1.85 — the low bar was invisible in both themes).
  - **Layout / state-drawn:** `.form-row` wraps again (its flex override had dropped the original
    responsive intent — the `commitment-row` grid tracks were dead code behind it), `.pulse-bar` spans
    its grid row full-width, `.chip-count` drops the `opacity:.65` that washed it to ~2.5–3.2:1, and
    `.btn.on-teal` gets the missing rule so the My Trips Trash toggle's pressed state is drawn (its
    `aria-pressed` was always correct — a sighted-only gap).
- **UI audit #107 — fill contrasts + motion-token batch.** The border/fill half of the ink work,
  plus the motion vocabulary:
  - **Fills** (3:1 non-text, light only — dark passes as authored): the health "Tight" number and
    bar move `--yf-amber` → `--warn-600` (2.01/1.89 → 3.92/3.69), the Board pulse band routes
    through the ink tier (`mid` 1.94, `ok` 4.03) with the `bad` band taking the deep red in light
    (3.83 → 6.43), the day-progress medium-severity fill (1.85 → 3.40) and the daily-average tick
    (2.40 → 3.40) go to `--warn-600`, `--cat-tolls-parking` deepens to slate (2.76/2.77 → pass), the
    white switch knob gets dark ink on the checked dark-teal track (2.05 → 6.5), and the stop-kind
    **food/rest** pair — 3.9° apart (the same colour) and ~2:1 as the spine — separates to **18°**
    AND clears 3:1 in light (burnt orange #C2410C / gold #A16207; dark keeps its primitives).
    The remaining cat-hue re-space (food vs local-travel vs emergency, all within 6°) is the one
    deliberately open palette decision.
  - **Motion (SYS-7):** the snap controls (`route-btn`, `mode-btn`, `crew-btn`, `cal-day`,
    `quick-budget .chip`, `move-btn`, `board-fit`, `board-pulse-link`, `vote-btn`) gain the shared
    `--t-fast` ease; the `.clickable-chip` duplicate transition is merged into one declaration (the
    old pair fought — colour and glow popped while the fill eased); every raw `.15s`/`.3s`/`.4s`/
    `.5s` duration routes through `--t-fast`/`--t-med`/`--t-slow` + `--ease-out` (28 values across
    13 rules; the one `.15s` stagger *delay* stays literal for SYS-7f); and the Board FLIP pass now
    resolves its timing from the tokens via `motionTiming()` (`--motion-slow` + `--ease-out`) instead
    of a byte-for-byte duplicated easing string. The pill glider was verified already token-driven
    and frozen under reduced motion.
- **UI audit #107 — the mechanical tail: type recipes, hit areas, layout and state bugs.** The
  root-cause method applied to the remaining discrete rows:
  - **Kicker / micro-labels (SYS-1):** Create-Trip's eight section labels had no base rule at all —
    they rendered as 15px/400 sentence-case body text and the page hierarchy collapsed to h1→body.
    `.eyebrow` (and the calendar's `.cal-wd`) joins the kicker-unification recipe, and the five
    sibling specs that pre-dated it (`.bench-eyebrow`, `.group-lab`, `.mini-lab`, `.route-tag`,
    `.editorial-kicker`) drop their dead font declarations — the recipe block is now the single
    source of type truth (colour stays per-label).
  - **Touch (SYS-4):** the `pointer: coarse` hit-area extensions now also cover `.link-btn`,
    `.move-btn`, `.board-pulse-link`, `.cal-day`, `.route-btn` and `.vote-btn` (the vote — the
    flow's primary control — was 34×30).
  - **Form states:** disabled `.input`/`.select`/`.textarea` finally *look* disabled
    (opacity + not-allowed, matching `.btn:disabled`) — three shipped identical to enabled ones;
    the travel panel's hand-styled time/number fields move onto the shared `.input` surface via a
    compact variant (same focus ring as every other field), and the halt planner's stray
    `.input`-classed select becomes a real `.select` (the last of the two conventions).
  - **My Trips:** the empty-state CTA demotes to outline (one filled primary per view — the header
    already owns one); the Clear button is always mounted (visibility-toggled) so the search field
    stops shrinking on the first keystroke; the header gets real classes, killing the
    `:first-child` structural selector and the inline-style `!important` fight; the style chips'
    Explore-only margin is scoped out of the toolbar; and trash rows drop their trailing border
    via `:last-child`.
  - **Explore:** the hero search gains an in-field clear affordance (the only Clear button sat in
    the filter card ~300px below the input that set `q`); the featured card labels itself
    "outside your filters" when filters are active (it deliberately ignores them); the hero kicker
    is typed in sentence case (CSS uppercases it) and the hero h1 rejoins the global ramp instead
    of running a second `clamp`; PubCard's social icon links and the creator-line anchor get
    interactive affordances (hover + `focus-visible`) instead of copying `.muted`.
  - **Overview:** the six identical heading-underlines come out (a `.card-head` gap replaces them —
    dividers return only where two groups share a card) and the page-head h2 steps down under
    578px, where the global h1's 26px floor made the two adjacent heading levels render the same
    size on every phone.
  - **Budget:** the ≤700px category-name track gets `min-width: 0` + ellipsis (a 44px track was
    handing "Accommodation" ~14px); "over the daily average" gains a ▲ shape cue + screen-reader
    text instead of fill-colour-only; and the inline-JS fills normalize onto the alias token
    family (`--teal`/`--saffron`/a new `--coral` alias — zero visual change).
  - **Board / timeline:** the phantom `--focus` token (never defined) is gone from the two
    focus-visible outlines; the timeline's three copies of the `74px 1fr` rail geometry merge into
    one rule.
  - **Dark-theme inks:** NativeHome's live trip thumb (white icon on dark-lightened teal, 2.47:1)
    and bell count (3.21) get dark ink, as does the AI drawer's user bubble (2.11); and the
    Create-Trip dock switches to near-solid glass (90%) so the amount's teal can't be dragged
    below AA by whatever scrolls beneath it.
  - **Motion (SYS-7f):** one stagger step — `--stagger-step: 60ms` now drives the board columns,
    My Trips cards (previously a 70ms step) and the Create-Trip blocks (was a 40ms lead-in) via
    `calc`.
  - **POI tokens (SYS-8a):** the hardcoded `#7C5CFC`/`#5540B8` purple pair moves to
    `--yf-poi-see`/`--yf-poi-see-ink` (dark lifts to `#B4A5FF` via the token, so two override
    rules delete). Re-measured, the sight chip passes ~5.7/6.9:1 — the audit's 1.99/1.84 had
    compared the ink against the raw, uncomposited hex.
  - **Admin:** the 5–6 column tables scroll on phones (block-level `overflow-x`) instead of
    clipping the page; the tablist row was verified already correct (stale in the audit).
  - **Public itinerary:** the floating hero stats card — the one surface that ignored the theme —
    gains a dark variant. **Share:** the scrollable tablist gets edge fades that only show where
    content remains, and arrowing through tabs scrolls the focused tab into view (in `useTablist`,
    so every tablist surface inherits it). **Auth:** the support link gains an underline tell.
  - Deliberately left: the budget category hues (user decision — keep as authored), the
    native-select popup rebuild (A-family, its own batch), the stop-kind spine+tag double encoding
    and the viewpoint hue (design decisions), and the token-scale adopt-or-delete (SYS-2a/b).
- **UI audit #107 — native-select popups replaced on the high-traffic surfaces (A-family).**
  The themed `.select` trigger stayed, but its popup was OS-rendered — on Capacitor Android that
  ships as a stock system dialog (the "still looks html" complaint). A shared `Select` component
  (`components/Select.tsx`, the WAI-ARIA select-only combobox on the `LocationInput` contract)
  now backs the **14 editing/filtering selects**: StopEditor's category/priority/status, the
  Create-Trip commitment type/day, Trip Settings vehicle + fuel (including the disabled state
  that used to render enabled), My Trips when/sort, Explore duration/budget/sort, the travel
  panel halt purpose (compact variant) and the map's add-POI day pick. Focus stays on the
  trigger; the popup is `aria-activedescendant`-driven with wrapping arrows, Home/End,
  typeahead and Esc/outside-click/Tab dismiss — and Esc no longer bubbles into the enclosing
  dialog. Keyboard math is node-tested in `lib/listbox.ts` + `tests/listbox.test.ts`. The six
  low-traffic selects keep the native control by design (trigger look is identical; only the
  popup differed).
- **UI audit #107 — SYS-2 decided and cleaned up.** The adopt-or-delete call on the unused
  token scales lands on **delete**: the `--text-*` scale (1 of 8 steps used) and the `--s-*`
  spacing scale (0 uses) are gone — with 340+ literal sizes in the cascade, a parallel scale
  nobody routed through was a trap, not a tool (`--text-xs` stays for the bottom-nav label;
  sizes elsewhere stay literal by design). SYS-2c: Profile's eight inline card margins move
  to a `.stack-gap` class, and the commitment row weights its fields by content again (the
  grid's 2fr/1fr/.8fr intent, re-expressed in flex — "What" grows, "Day" no longer takes half
  the row).
- **UI audit #107 — the design-decision tail.** The last open rows, resolved:
  - **The scenic hue split (SYS-8a, finished):** the "places to see" lane and the viewpoint
    stop-kind now own **292° magenta-violet** (`--yf-poi-see` #db4cf0 light / #e488f2 dark,
    ink `--yf-poi-see-ink` #8a2999 / #f0a7fb) — 40° clear of the Day-3 route violet they used
    to share byte-for-byte, 38° clear of the activity purple (which sat ~2° from the old
    POI colour), and clear of every other day colour. The viewpoint spine also stops wearing
    the interactive teal (the selection colour) on every viewpoint card. Computed per theme:
    spine 3.33/7.61:1, chip ink 5.78/8.00:1.
  - **Explore gains its entrance choreography** — grid cards ride the shared `trip-enter`
    stagger (`--stagger-step`, capped at 8 like My Trips), via a new `enterIndex` prop on
    PubCard; the discovery page no longer arrives instantly while every other page cascades.
  - **StopEditor's priority/status options carry tone dots** in the custom listbox (dual-coded
    with their text labels). Category icons were skipped deliberately: no category→icon map
    exists in the codebase to reuse, and inventing one for a nicety wasn't worth the surface.
  - **Landing repaint mitigation:** `background-attachment` drops from `fixed` to `scroll` on
    coarse pointers — the pinned full-page ramp forces a repaint every scroll frame on the
    Android WebView. Desktop keeps the seamless pinned ramp; the touch change still needs a
    low-end device check to confirm the win.

## [0.52.0] - 2026-09-12

**The map learns relief.** The light basemap moves to Liberty — cream land,
vivid water, named roads: it reads like a travel atlas instead of a grey
canvas — and the Map tab gains three view modes on one shared palette: flat 2D,
Terrain relief (hillshade over the keyless AWS terrarium DEM, never burying the
river lines), and a pitched 3D hero that rides real elevation and puts the
terrain back exactly when the theme swaps reload the style underneath it. The
Board stays hard-2D by design; the choice persists; the spec and live
prototype landed with the code. Android `versionCode 13 / 0.13-native`.

### Added

- **Map view modes: 2D · Terrain · 3D hero** (spec + prototype live in
  `docs/FEATURE-REQUEST-MAP-VIEWS.md` and `docs/MAP-MOCKUPS.html`). The Map tab's
  toolbar gains a segmented switcher (`role="group"` of three `aria-pressed` chips
  in the day-filter's glass language; the long form — "Flat map", "Terrain
  relief", "3D terrain" — lives in the `aria-label`s). **Terrain** lays a single
  hillshade layer over the still-flat map — relief with no camera or gesture
  change — sourced from the keyless AWS terrarium DEM, whose credit appears only
  while a terrain mode is on (the source is added on demand, and the basemap
  credit is never duplicated). **3D hero** drives the same DEM through
  `setTerrain` (exaggeration 1.8) with an eased camera to pitch 70 / bearing 235
  — `maxPitch` is raised 60 → 75 because MapLibre silently clamps a higher ease —
  instant under prefers-reduced-motion; leaving 3D resets the camera and drops
  the terrain stack (`getTerrain()` back to null). The choice persists globally
  and degrades to 2D on corrupt storage, and the terrain stack re-applies itself
  after every theme style swap (a full reload wipes sources, layers AND terrain).
  The Board stays hard 2D: a pinned backdrop must not spend GPU on terrain, and
  one surface's mode choice must not hijack another's. The pure half — the
  water/waterway `beforeId` resolution (Liberty's river lines sit above `water`;
  matching `water` alone buries them), mode parsing, and the idempotent
  reconcile step — is `lib/mapViewModes.ts` with 19 node tests.

### Changed

- **The light-theme basemap is Liberty now, not positron.** The product leans on
  the map to sell the trip, and positron's deliberate grey undersells it: Liberty
  (OpenFreeMap's OSM-carto lineage) has cream land, vivid water, a real place
  hierarchy and named roads at trip zoom — it reads like a travel atlas and is
  the closest stock style to the brand's warm palette, keeping the teal/saffron
  overlays legible on top. One line in `mapcn/map.tsx`'s `defaultStyles`; every
  map surface (Map tab, Board backdrop, expanded overlay) inherits. Dark theme
  keeps the existing dark style — OpenFreeMap ships no Liberty dark, and a
  recoloured twin is a follow-up, not part of this swap (spec §2.7).

## [0.51.0] - 2026-09-11

**The timeline learns to move.** The 1,500-line TimelineTab monolith is split into
modules, every pill toggle animates like the workspace tab bar, dropdowns and the
calendar/location pickers share one frosted-glass recipe, drag-reorder is rebuilt on
pointer events (the carried card rides the finger, warps with the throw, and the drop
zones read the card's centre against stable layout), the day planner gains an
Optimise button (2-opt ordering + real road polylines + Google Directions), and Plan
a trip prefills a live rough-bill budget you can hand back to the maths with one
tap. Motion is governed by a token system (`docs/MOTION-TOKENS.md`, AGENTS rule 10)
so the older-vs-newer smoothness gap stays closed. Android `versionCode 12 / 0.12-native`.

### Added

- **bencho-grade drag: the row rides the finger.** Drag-reorder on the Timeline
  and the Board now runs entirely on pointer events (`lib/touchDnd.ts`); the
  HTML5 drag API — whose OS-owned ghost bitmap and throttled `dragover` capped
  how smooth a reorder could ever feel — is gone. The carried row is pinned to
  the pointer with no easing at all (free, unfenced: only the insertion
  *reading* is clamped, so carrying a row out of the list and back is a real
  gesture), its inner card stretches along the moving axis, thins the other
  and leans into the throw (velocity warp, signed tilt — a flick back rights
  it), and a 90ms calm timer eases the deformation flat the moment the finger
  stops. Position and deformation live on two separate transforms (row vs
  skin) because one must never ease while the other always must. Drops settle
  once via the FLIP pass, with the carried row springing from where it was
  released; a no-op release springs it home. Touch keeps its long-press gate,
  now with the same visible carry; mouse drags start on an 8px move. The
  goo/metaball morphing stays excluded, and the drag-start wiggle is retired.
- **Every pill toggle animates like the workspace tab bar.** The Plan/Inspect
  toggle and the Group Input composer switch are the tabbar's exact glass
  capsule with `.tab-btn` children, and inside *any* PillNav the sliding
  glider is now the only thing that paints the active state — the per-chip
  glow shadow that used to pop off/on while the background glided (the
  "two-step switch" feel) is gone. Saffron highlights hand their paint to the
  glider the same way (dark-amber ink for 4.8:1 on saffron).
- **Location + calendar: the real frosted glass, plus a modernised combobox.**
  Root cause of the dropdowns never matching the navbar's frost: the
  CreateTrip section entrance used `animation-fill-mode: forwards`, which
  keeps each block a compositor group after it ends — blinding
  `backdrop-filter` on the `.popover` dropdowns inside them (they rendered as
  plain translucent sheets). The entrance now fills `backwards` and the frost
  is the navbar's, exactly. The combobox itself got the design-language pass:
  option rows with a 32px tinted icon chip, hover/keyboard highlight on one
  teal surface, and the provider caption ("Place search · Google") became a
  quiet footer row inside the dropdown instead of a floating caption below it.
  The calendar range reads as one capsule (start day rounds left, end day
  rounds right), month steppers are proper round buttons, and form controls'
  transitions moved onto the motion tokens.
- **Quick budget amounts are a toggle, not a one-way trap.** ₹10k/15k/25k
  chips claim the field for manual editing when clicked — and clicking the
  highlighted amount again releases it: `budgetTouched` resets and the rough
  bill's suggested amount flows back in, with the field hint explaining the
  state ("Manual amount — tap the highlighted quick amount again to hand the
  field back to our maths").
- **The Timeline opens collapsed — one day at a time, as scannable summary rows.** Phase 1 of
  the Timeline restructure (`docs/TIMELINE-PLAN.md`, mockups in `docs/TIMELINE-MOCKUPS.html`):
  every day now starts as a summary row — the collapse control is a visible circular chevron
  button that rotates open/closed, and under the title a single "Drive day · Tea Museum →
  Top Station → Kundala Lake" line names the middle stops the stats line never showed (stay
  days read "Stay day · No driving today — …", dimmed). Stop names wrap instead of truncating
  mid-word, the full chain rides in a tooltip, and a new per-stop dwell chart puts amber on
  the stop that eats the most of the day (with a measured 3:1 boundary in light theme).
  Opening a day collapses the others (accordion), and the one open day is persisted per trip
  (`yatraflow_open_day` in `uiPrefs.ts`) so a reload restores where you were — the old
  per-day collapsed map is retired, since per-day booleans can't express accordion state.
  The "Jump to day" chip rail now opens the day it scrolls to, and `+ Add here` on a
  collapsed day expands it before opening the editor, so an add never lands in a hidden day.
  Collapse state is lifted into `TimelineTab` (`DaySection` is now a controlled component
  with `open` / `onToggleOpen`); pure helpers live in the new node-testable
  `src/lib/daySummary.ts` (route chain, stay-day summary, accordion transition, dwell
  segments), pinned by `tests/daySummary.test.ts` plus open-day persistence tests in
  `tests/uiPrefs.test.ts` — including the negative-control that opening Day 2 collapses
  Day 1. Drag-reorder, cross-day moves and the realtime echo guard are untouched.
- **Plan/Inspect modes + Board-parity drag + smooth day open/close (restructure Phase 3).**
  A segmented Plan/Inspect toggle lives in the Timeline header and persists per user like the
  theme: **Plan** is today's editing timeline; **Inspect** is the same data with every
  editing affordance off — no drag, delete, add, rename, halt-planner actions or impact
  sheet — rendered through the existing `editable` permission seam, so the plan is safe to
  study on a phone during the trip itself. Drag-reorder now uses the Board's premium kanban
  pattern (until now only the Board had it): the DOM order never changes mid-drag, a slim
  teal marker glides to the insertion slot, drops resolve through the marker, and a FLIP
  pass settles the arrangement once on commit — no more per-card shuffle. Day bodies now
  animate open and closed (grid-rows `0fr→1fr`, height-agnostic, reduced-motion aware) while
  still unmounting when closed, so collapsed days cost nothing. The mode hook lives in
  `src/pages/trip/timeline/useTimelineMode.ts`.
- **Motion tokens + a liquid drag feel, everywhere (the "newer sections feel
  cheaper" fix).** `docs/MOTION-TOKENS.md` is the design-tokens doc for motion:
  three duration steps (`--motion-fast/med/slow`: 120/180/240ms), the easing set,
  and a pattern catalog (dropdown entrance, toggle glider, day collapse, drag
  follow/settle) — and AGENTS.md gains rule 10: every new interactive surface
  ships motion from the tokens, so the gap between long-refined surfaces and
  fresh ones stays closed. The drag on both the Timeline and the Board is now
  bencho-style liquid arrangement: siblings glide out of the way in real time
  while you drag (transform-only, no scale/bounce morphing), the carried row
  sits as a dashed ghost slot, and the FLIP settle snaps the final arrangement
  home — the gliding teal marker is retired. Dropdowns and menus share one
  `.popover` surface (the navbar's exact glass recipe with entrance motion —
  location list, calendar, notifications, account menu), and the Plan/Inspect
  toggle is a real animated glider whose switching no longer reflows the header
  (the add button dims in place instead of vanishing).
- **Plan a trip prefills the budget with the app's own maths.** The rough-bill
  estimate (stay + food + transport, `estimateTripStarter`) was already computed
  live but hidden behind a "Print my bill" reveal — it now shows under the
  budget field ("Our rough take ≈ ₹X/head · ₹Y total") and **auto-fills the
  per-person field** (rounded to ₹500) as dates, crew, mode and route make the
  number possible, until you edit the field yourself. The round-trip control is
  "Drive back to start" with a real hint (≈ N km back to your start), and the
  return-stops switch is "Plot the drive back".
- **Travel-style chips now tell the truth — and the truth got wired in.**
  Copy states exact engine values (relaxed: halts ~120 km / meals ~260 km /
  60 min detour slack; packed 180/300/30; balanced 150/300/45; budget/luxury:
  the ₹1,200/₹8,000 stay tiers vs comfort ₹3,200), the fake claims are gone,
  and the five decorative styles now really act: `computeCategoryBias` gains
  style→category priors (adventure→adventure/nature, spiritual→temple,
  food-focused→food, creator→sightseeing/museum) consumed by the nearby-POI
  ranking, so "suggestions favour temple stops" is a fact, not a promise.
- **Group Input speaks one filter language.** The duplicate count-pill row and
  filter bar are merged into a single workspace-style pill rail with the counts
  inside the pills (All · n open, Need you with its amber badge, Resolved), the
  composer's Stop idea/Question switch is a visually distinct segmented mode
  toggle, the unstyled `.gi-guide` box is styled, and the text-glyph vote
  buttons are lucide chevrons.
- **Timeline restructure plan and mockups (planning artefacts).** `docs/TIMELINE-PLAN.md` is
  the phased, code-audited implementation plan (collapsed accordion day rows → evict
  specialist tools → Plan/Inspect split + file split) with the three design decisions signed
  off; `docs/TIMELINE-MOCKUPS.html` is the approved visual prototype rendered in YatraFlow's
  design tokens.

- **"Optimise day" — the anti-crisscross reorder** (Timeline, per-day header). Days with 3+ movable stops whose current order wastes travel show an `Optimise (−X km)` button: it opens a before/after preview (travel distance, estimated driving time at the trip's average speed, and the full new stop order) and commits through the same impact-preview gate as a manual drag. Under the hood, a new pure `optimizeDayOrder` engine helper runs greedy nearest-neighbour from the day's wake-up origin (where the previous day's journey ended — `originOf`, not a naive first-stop guess) followed by a full 2-opt improvement sweep, with an open-time tie-break so two near-equal candidates pick the earlier-opening door. Auto anchors (your base and the day's destination/continuation waypoints) stay pinned first/last — the engine builds the journey around them; a mid-day auto anchor (an unusual shape) refuses to optimize rather than risk dropping it, and rejected stops ride along untouched. 8 node tests pin the behaviours (crisscross collapse, unchanged days, anchor pinning + mid-anchor refusal, no-op <3 stops, rejected survival, never-worse guarantee, open-time tie-break). The per-leg travel chips between stops (km, minutes, cost — OSRM-corrected) and the mapped route this builds on already existed. Delta figures use the canonical font-weight ramp (650/750 are not loaded faces — caught by the design-system invariant after the base adopted it).

- **"Open in Google Maps" — a day's ride opens with turn-by-turn directions.** The travel panel (Timeline) and the map's day toolbar gain a Directions action that hands the ride to your own Google Maps — origin, your stops in order, destination, `travelmode=driving` (the URL API has no two-wheeler mode; switch once inside the app if you ride with it on). The URL is built from the engine's day journey, so synthesized legs are included: the Day-1 outbound from an anchor-only day and the final day's ride home both open complete. Waypoints are capped at Google's 9-waypoint limit with the true destination always preserved. New pure `googleMapsDirectionsUrl` in `lib/externalMaps.ts`, 5 node tests.

### Changed

- **The 1,500-line `TimelineTab.tsx` monolith is split into modules** (`restructure Phase 3`,
  same behaviour, prop-identity discipline preserved): the shell (364 lines — tab state,
  accordion open-day, mode, StopEditor, warnings grouping) composes
  `timeline/DaySection.tsx` (689 — day header/summary row, animated body, stop rows,
  suggestions), `timeline/TravelPanel.tsx` (471 — travel card + halt planner),
  `timeline/DaySpark.tsx`, `timeline/MoveStopModal.tsx` and `timeline/useTimelineMode.ts`.
  `DaySection`'s prop signature remains the shared contract.

### Fixed

- **Drag drop zones no longer make you hunt for the slot.** The insertion
  reading was a function of the *pointer* against the *live transformed row
  boxes*, with holes in it: where you grabbed the card shifted when the slot
  flipped, the gliding rows moved the very hit areas being aimed at (the
  target chased itself), and over the 8px margins or whitespace the reading
  froze until a row was found again. It is now a pure geometric function of
  the carried card's **centre** against each row's own midpoint measured in
  **stable layout** (`insertionIndexFor` + `rowLayoutBoxes`, lib/touchDnd.ts —
  `offsetTop` ignores transforms), and the whole list root is a live surface
  (`data-yf-list`), so the gap opens the moment the card's centre crosses a
  neighbour's centre regardless of grab point, and dropping in the gap
  between rows commits instead of springing back. Own-list drops now always
  consume the engine's carry rect, so a release at rest can no longer leak a
  stale rect into a later FLIP settle.
- **The drag gap-glide slid rows the wrong way.** The live sibling-glide
  offsets had their signs inverted in both the Timeline and the Board: rows
  between the carried slot and the cursor slid DOWN onto their neighbour on a
  downward drag (and up on an upward one) instead of toward the vacated slot —
  with the offset being exactly one row pitch, the displaced row landed
  precisely on top of the next one. The math now lives in a pure
  `glideOffsetPx` (lib/touchDnd.ts) with tests pinning the directions, and
  both surfaces consume it.
- **Forking a published itinerary no longer vanishes on reload.** Every trip copy inherited
  the source's `inviteCode` — and since invite codes carry a unique index
  (`idx_trips_invite_code`), forking any trip that had ever been invite-shared failed the
  `trips` insert, left a cache-only copy that toasted success anyway, and silently
  disappeared on the next reload (verified live: all three published trips on the production
  project carry invite codes). `buildTripCopy` in `src/store/store.ts` now strips
  `inviteCode` and `deletedAt` from every copy (a fork of a trashed source also used to
  arrive pre-trashed); `duplicateTripPersisted` / `duplicateTripPublicPersisted` report
  whether the rows actually landed, retract the copy on failure instead of leaving a zombie,
  and `forkPublication` toasts the truth. Pinned by `tests/forkPersist.test.ts`.
- **Forking from the Explore grid works now.** The grid cards fork via `tripById`, but the
  membership-scoped hydration only ever caches your own trips — every foreign publication
  answered "That itinerary is no longer available." `forkPublication` now falls back to
  `fetchSharedTrip` (public by definition) before giving up.
- **"Trip not found" is no longer the answer to a cache hiccup.** `TripWorkspace` opened
  strictly from the hydration cache, so a partial hydrate (a failed trips read on a flaky
  connection — including one that wiped previously-loaded trips, since the hydration patch
  overwrote good rows with an empty result) rendered "Trip not found" for trips that exist.
  The workspace now fetches the row directly on a cache miss (`fetchSharedTrip`; it merges
  into the cache and shows a loading state, with "Trip not found" reserved for genuinely
  unreadable trips), and hydration keeps the previous cache when the trips/memberships reads
  fail instead of overwriting them. Seeded demo trips whose membership insert fails are now
  logged instead of silently leaving invisible rows.

- **"Optimise day" no longer mutates the live trip while merely rendering.**
  The review of the optimise-day feature caught `optimizeDayOrder` renumbering
  `orderInDay` on the caller's stop objects — violating its own "input
  untouched" contract — while the Timeline calls it in a render-phase memo
  with the live store stops. On any day with a suggested improvement, that
  wrote the optimized order into the store outside the impact-preview gate:
  the day silently reordered on the next re-render without approval, and the
  preview then compared against the already-mutated state. The helper now
  clones the stops before renumbering (a regression test pins the contract),
  and a no-op ternary in its 2-opt objective is cleaned up.
- **Day routes on the map follow what the engine plans, not just the stored stops.** Selecting a day on the map drew only lines between that day's *stored* stops, so any day whose ride exists in the engine's synthesis drew nothing — the anchor-only outbound (Day 1 of a Kolkata → Mandarmani trip showed nothing at all when only the anchors existed) and the final day's ride home (Mandarmani → Kolkata, which the timeline's travel panel already described) were invisible on the map. Single-day routes now build from `buildJourney`'s points — origin → stops → synthesized destination — so every day the travel panel describes as a drive draws its route on the map, and stay days stay quiet.
- **Manually planned halts sit on the road now, not off it.** A halt added "after N km" was placed by interpolating straight-line km along the sparse stop-to-stop chain, while the km the travel panel displays (and the route the map draws) are OSRM/Google road km — on anything but a ruler-straight highway the halt landed at the wrong spot, visibly floating off the drawn route, and could even slot next to the wrong stop in the day's order. The routing layer's per-leg road geometry is now retained instead of discarded, the day's ride is assembled into one continuous road polyline (`dayRoadPolyline`), and halt placement, halt ordering, corridor-spot km and slack-pick km all measure along it — falling back to the old chord math only while routing hasn't resolved (offline/estimate). Roadside breaks stay exactly what bikers want: on-route points at your km, with the detour-to-a-named-spot checkbox still opt-in as before.
- **The Map tab's halt plan budgets time and picks days on road km too.** `planKm` already used the OSRM road total, but the wheel-time budget (`wholeTrip.min`) and the "which day does this km belong to" default still summed haversine estimates — on curvy routes the fatigue cadence ran ~15–40% short and halts could default to the wrong day. The routing legs already fetched for the map now also yield road-true total minutes and per-day road km (a leg is ridden on the day of its destination), with the journey sums kept as the fallback.
- **The Optimise-day preview speaks road km now.** Its before/after figures and "saves ~X km" were straight-line sums, unreconcilable with the travel panel's road distance shown on the same screen. The ordering objective stays straight-line (pairwise road km between arbitrary stops would need N² route calls), but every displayed number is rescaled by the day's road-vs-chord ratio from the corrected legs.
- **The Timeline's halt-spot scan is road-aware like the Map tab's.** Search anchors sample the day's road polyline when routing has resolved (chord anchors sat off-highway on curvy rides), Google mode runs one Search-Along-Route request with routingSummary detours instead of per-anchor scans, and the slack prompt's "cheapest detour" ranking measures detours asymmetrically against the road — all matching what the Map tab already did.
- **`package-lock.json`'s version field matches `package.json` again** (0.50.2 — the 0.50.x release cuts skipped re-syncing it; caught when a local `npm install` corrected the field).

## [0.50.2] - 2026-09-11

**The Android app drops the website's top bar entirely.** The floating topnav was website chrome — wrong inside the installed app. The signed-in shell now hides it completely; its controls relocate to the Profile page (a bottom-nav destination): theme toggle under Appearance, the in-app notifications list with Mark all read, and the account actions (Creator hub, Send feedback, Log out). Theme state is shared via a new `src/lib/theme.ts` hook so the web topnav toggle and the Profile card can't drift. The topnav — and the web — are byte-identical; it stays for signed-out users as the login entry. Pinned by a new `mobile-shell.test.ts` invariant. `versionCode 11 / 0.11-native`.

### Changed

- **The top bar is gone from the signed-in Android app.** `App.tsx` gates the topnav behind `(!isNative || !me)`; signed-out users and the web keep it.
- **Controls relocated to Profile.** Appearance (dark/light), in-app notifications (list + mark-all-read), and account (Creator hub / Send feedback / Log out).
- **Theme is shared.** New `useTheme()`/`setTheme()` in `src/lib/theme.ts` keep the web toggle and the Profile card in sync and paint the Android status bar.

## [0.50.1] - 2026-09-11

**The installed app no longer flashes the marketing website on launch.** The hydration ready-gate excluded the bare route unconditionally — a web-first choice (the landing paints instantly instead of a spinner) that backfired in the shell: every app launch rendered the website's home — its chrome and all — for as long as hydration took past the splash, before flipping to the app home. In the shell the loading block now covers the bare route, and an unknown deep link falls back to the app home instead of the landing. The web is byte-identical.

### Fixed

- **No more website flash at app launch (shell).** `App.tsx`'s ready-gate now covers the bare route when `isNative`: a signed-in user opening the app sees splash → loading → app home, never the marketing landing. Signed-out users still get the landing (it is the login entry).
- **Unknown deep links in the shell fall back to the app home**, not the marketing landing — same parity rule, pinned by two new static invariants in `mobile-shell.test.ts`. Android `versionCode 10 / 0.10-native` so phones update cleanly over 0.9-native.

## [0.50.0] - 2026-09-11

**Every trip edit finally sticks — the "Change saved but nothing changed" defect is dead.** `updateTrip()` treated *every* full-trip save from the impact-preview flow as a date change (a full `Trip` always carries truthy `startDate`/`endDate`), rebuilt the day grid from the *pre-edit* cached days, and overwrote the proposed reorder/delete/move in both the cache and the persisted row — while still toasting "Change saved". The day grid now reconciles only when the dates actually changed, and reconciles the *incoming* days, so reorders, arrow moves, drag-and-drop, deletes and cross-day moves all persist in real time and survive reload. Pinned by two regression tests that fail on the old code and pass with the fix.

### Fixed

- **Trip edits (reorder / arrows / drag-and-drop / delete / cross-day move) no longer silently discard themselves on Keep.** `updateTrip` in `src/store/store.ts` gated day-grid reconciliation on `patchFields.startDate || patchFields.endDate` — always truthy for the full-Trip `pending.proposed` that `keepPending()` / `moveToAnotherDay()` pass — then ran `reconcileDays(t.days, …)` over the *old* days and assigned the result back over the proposal. The fix compares resolved dates against the cached trip and skips reconciliation entirely when unchanged; when dates did change it reconciles `patchFields.days ?? t.days`. `tests/reconcile-days.test.ts` gains two regression tests (full-Trip reorder keeps the new order in cache + persisted payload; full-Trip delete keeps the deletion).
- **Board delete, in-place edit and tab order from v0.49.0 verified live on this release** (Board cards carry delete + edit, tab rail is Overview → Board → Map → Timeline).

## [0.49.0] - 2026-09-11

**The Board becomes a first-class editor, drag-reorder becomes trustworthy, and the entire open-issue backlog closes.** The Board tab can now add, edit and delete stops in place (sharing one stop-form implementation with the Timeline instead of a drifting copy) and moves to the front of the tab rail; the realtime echo-suppression guard is armed at commit time so a collaborator's stale echo can no longer revert an accepted reorder — the third and final symptom of that family; and all eight open issues close in one pass: two P1 data-integrity fixes (demo trips no longer seed into real accounts on a flaky connection; "Delete forever" finally confirms), five accessibility repairs (the unread badge and five warn-on-tint labels now pass WCAG AA, the cover-URL field is labelled, the notifications panel stops silently truncating at 12), a single APG tablist contract across all four tab surfaces, and Profile drops its empty desktop gutter.

### Added

- **The Board can now add, edit and delete stops without leaving the view.** The
  board had up/down reorder and a move-to-day modal but no way to delete a stop, no
  way to edit one, and its only "+ Add a stop" button navigated away to the Timeline.
  All three now happen in place: a delete button on each card routes through the same
  impact-preview flow as the Timeline's (so Keep/Remove remains the confirmation step),
  the card title opens the shared stop editor, and each day column's dashed foot zone
  is a click-to-add button while keeping its drag-drop role. The add/edit plumbing
  (`initialValues` / `legContextFor` / `dayIndexOfStop`) moved from TimelineTab's
  private scope into `lib/stopForm.ts` so both views share one implementation instead
  of drifting — the same drift that already made their rejected-stop handling disagree.

### Changed

- **Tab order is now Overview → Board → Map → Timeline.** The Board — the
  rearrange/edit/delete surface with the route visible — is the first stop after
  Overview; the Timeline becomes the deliberate, information-dense view you open when
  you need timings and legs, rather than the default editing surface. Deep links are
  unaffected (tabs are addressed by slug, not position).

### Fixed

- **Board and Timeline drag-reorder no longer reverts after you accept the change.**
  `persistTripFieldNow` (and the trip INSERT path, `persistTrip`) recorded its
  realtime echo-suppression stamp *after* awaiting the row write, so the guard only
  covered the moment the write **resolved** — the whole server round trip was
  unguarded. An echo that arrived in that hole was read as a collaborator's edit and
  replaced the freshly reordered `days` with the stale server row, so an accepted
  reorder visibly snapped back. The stamp is now taken *before* the await. This also
  fixes the reported cross-day drag, which failed for the same reason: a cross-day
  drag routes through the identical persist → realtime path.

- **Reorder no longer reverts from an echo that lands *during* the debounce window.**
  The previous fix armed the echo-suppression stamp only inside `persistTripFieldNow`,
  i.e. when the debounced row write fired ~600 ms *after* you clicked Keep. A
  `postgres_changes` echo that arrived in that 600 ms gap — before any write was even
  issued — found no stamp and was therefore *not* suppressed, so it reverted the
  optimistic reorder in the cache and the trailing debounced write then persisted the
  reverted (stale) order. The stamp is now also taken synchronously inside
  `persistTripField`, at the moment the change is committed, so the guard spans the
  whole commit → write → echo span. This is the residual symptom that survived the
  first fix on the live preview. (A negative-control test fires a stale echo during the
  gap and fails on the old code.)

- **Timeline reorder now drops where you put it.** `useReorder`'s card-level drop
  passed the *hovered card's index* straight to `onMove`, with no adjustment for the
  dragged item's removal shift. Dragging **downward** therefore landed one slot too
  far — dropping a card onto its immediate neighbour moved it when the pointer was
  aimed at a no-op, and dropping onto the last card overshot the end. Upward drags
  were unaffected, which is why the bug read as intermittent. A drop now resolves the
  hovered card to an insertion slot, using which half of the card the cursor is over.

- **#94 (P1): a flaky connection can no longer seed demo trips into a real account.** `hydrateFromSupabase` trusted "the trip list came back empty" even when the membership or trips query had *errored* — so a sign-in on a bad connection could write ten fake trips alongside the user's real ones (right after telling them "some data didn't load"). The seed condition now consults a `tripCountUnknown` flag set by any query whose failure could fake an empty account; a genuinely new account (clean reads, zero trips) still seeds exactly as before. Three regression tests in `store-sweep.test.ts`: the membership-fail and trips-fail cases block the seed, the clean-empty control still seeds.
- **#89 (P1): "Delete forever" in the Trash is confirmed now.** It was the app's only irreversible, protection-free action — one click destroyed the trip, its votes, decisions, activity and publication with no dialog and no undo (every other destructive path confirms first; trashing even offers undo). It now opens a dedicated `ConfirmDialog` whose copy states plainly that this cannot be undone.
- **#90: the unread badge is readable.** White on saffron measured 2.14:1 (light) / 1.97:1 (dark). Same lightness-not-hue fix as the selected chips: dark ink (`#06251F`) on the identical bright fill — 7.6:1 / 8.3:1.
- **#85: the same `--warn`-on-tint failure was fixed at the source once and never propagated.** Five sibling surfaces (`.day-warn-pill`, `.day-rail-chip.warn`, `.share-intent--saffron`, `.stop-num.cat-food`, `.gi-stat.hot b`) measured 3.48–3.69:1 in light theme; all five now share the `.chip-saffron` precedent's deeper amber (`#8F5B06`, 5.1–5.4:1) in one light-theme-only rule. `.day-warn-pill.sev-high` (danger on coral, 4.54:1) is excluded — it already passes.
- **#88: the cover-image URL field is labelled for screen readers.** It sits two levels below `Field` (a custom URL box inside a picker div), outside `Field`'s direct-child label wiring, so SR users heard "edit text, blank". Explicit `aria-label="Cover image URL"` with a comment naming the constraint.
- **#84: the notifications panel is no longer silently lossy.** It capped at 12 items with no path to older ones — the badge could count 27 while 12 were reachable. Past-12 accounts now get a "Show all N notifications" disclosure row inside the popover (the full list is already in the store, so this is pure disclosure); the list resets to the recent view when the popover closes, and the expanded view caps its height to the viewport.
- **#86: the Profile page stopped reserving an empty 340px column.** Its whole body is one column inside a `1fr 340px` grid — at desktop widths the right track sat empty and the page read as half-finished. Now a single readable column (`.profile-col`, max-width 720px) instead of the gutter.
- **#87: one ARIA tablist, not four dialects.** Only ShareTab implemented the APG contract; `Auth` declared `role="tablist"` over `aria-pressed` buttons (spec mismatch), `AdminPage` used `aria-pressed` on real tabs, and the workspace tab bar had `aria-selected` but left every tab in the tab order with dead arrow keys. ShareTab's exact behavior (roving tabindex + Arrow/Home/End with automatic activation) is now the shared `hooks/useTablist.ts` primitive, applied to all four surfaces; the three panels got their `role="tabpanel"` + `aria-labelledby` links too.
- **`.env.example` now exists — the documented first step works again.** The README's
  Getting-started block and the runtime hint in `src/lib/supabase.ts` both told contributors
  to `cp .env.example .env.local`, but the file had never been committed, so the first command
  a new contributor runs failed. Adding it needed a `.gitignore` change too: the bare `.env*`
  rule swallowed the template (and would have swallowed it forever, silently). A
  `!.env.example` negation now tracks the template while `.env`, `.env.local`,
  `.env.production` and `.env.*.local` stay ignored — verified with `git check-ignore`.
  The template documents all six `VITE_*` variables the app reads (two required, four
  optional with their fallbacks), and ships `https://YOUR-PROJECT.supabase.co` as its
  placeholder on purpose: `isRealSupabaseUrl()` already rejects anything containing
  `YOUR-PROJECT`, so an unedited copy fails loudly instead of silently.

### Changed

- **README corrections from a full source audit.** A v0.48.0 section was added (the release
  narrative had stopped one release short, leaving the newest work invisible while two older
  runs had sections of their own); the "Hotel/flight booking — placeholder buttons only"
  constraint was reworded because no booking UI exists (stops carry a *needs booking* flag);
  `AdminPage.tsx`, `CreatorHubPage.tsx` and `NativeHome.tsx` were added to the project-
  structure map, which had omitted three files that each own a feature the README describes.

## [0.7.0-native] - 2026-09-11 (`v0.7.0-native` — APK attached to the GitHub release)

**The web app is now an installable Android app.** Capacitor 8 wraps the Vite build in a native shell (`app.yatraflow.mobile`), CI builds a signed APK on every push to main and every `v*` tag, and every capability the WebView does badly — clipboard, share sheets, geolocation, vibration, external links, system bars, the back button — is routed through a real native plugin instead. The web app runs the exact same code and never touches a plugin: every native path is behind a platform check with the browser API as fallback. Signed-in users on a phone get a task-first app home instead of the marketing landing.

_History note (2026-09-11): a stub for the pre-`0.42.0` record is deliberate and tracked in
`docs/history/README.md`. Do not bulk-rewrite this file with a script — that path has eaten
leading bytes out of code spans twice (see `adf5f66` and the `[0.43.0]` repair note below)._

### Added

- **A native bridge with one job: make the app's web-API calls work on-device.** `lib/native.ts` centralises clipboard (`nativeCopyText`), image clipboard (`nativeCopyImage` — the plugin takes a full data URL, the browser path takes a `ClipboardItem`), text and file share (`nativeShareText`, `nativeShareImage` — the Share plugin only accepts `file://` URLs, so the trip-bill PNG is written to the cache dir via the Filesystem plugin before the native sheet sees it), one-shot and streaming location (`nativeLocate`, `nativeWatch`) and external-URL opening (`openExternal`). Every helper no-ops or falls back on the web, so the same bundle ships to both platforms. Call sites migrated: CopyButton, the Share tab's snapshot link, Plan Bench's copy-text and bill-image share chain, and the map's locate button.
- **App-shell wiring (`lib/appShell.ts`): splash, system bars, Android back.** The launch splash hides when the store's ready-gate flips (2.5s worst-case cap), so it never lingers behind a loading block. System-bar styling rides Capacitor 8's core `SystemBars` API — one call styles status + navigation bars, and it replaces the separate `@capacitor/status-bar` plugin the scaffold started with (one dependency lighter). The Android back button maps to the app's own UX: open overlays close first, then the WebView history walks back, and at the first entry a second press within 2s exits.
- **"Locate me" — a live GPS layer on the trip map.** A toggle chip by the map key starts a continuous position watch: the user renders as a pulsing blue dot, the camera follows the latest fix until *they* pan away (self-initiated `movestart` releases the follow; the layer's own `easeTo` never counts as a pan), and toggling off stops the watch entirely so GPS burns nothing idle. On-device the stream is the plugin's fused provider behind the system permission dialog; on the web it's the plain browser watch. A denied permission turns the dot red. One-shot locate on the map controls was migrated to the same bridge.
- **Haptics that actually fire on Android.** The app always had `navigator.vibrate` calls — which Android WebViews don't implement, so every one was silently dead in the APK. `lib/haptics.ts` now routes the same named intents (tick / select / toggle / success / surprise / warn / heavy) through `@capacitor/haptics`: a delegated `pointerup` listener gives every button, chip and tab in the tree (lazy pages included) a light tick; toasts buzz success/warn; confirm dialogs thump heavy; long-press drag pickup gets the strongest pattern. The web keeps the Vibration API path, reduced-motion still silences everything.
- **A CI pipeline that produces an installable, updatable APK** (`.github/workflows/yatraflow-apk.yml`). Builds run on every push to main and every `v*` tag: `npm ci` → web build (env keys from repo secrets) → `cap sync android` → signed `assembleDebug`, uploaded as `YatraFlow-v<tag>.apk` on tags (branch builds fall back to versionName + short SHA). The APK release cadence is decoupled from Vercel web deploys without forking the code. The web bundle needs `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_MAPPLS_KEY`/`VITE_GOOGLE_MAPS_API_KEY` at compile time; they live only in gitignored local files, so CI writes a `.env.production` from secrets — the first APK was built keyless and greeted testers with the auth page's "no backend configured" banner.
- **Android sizing pass.** Coarse-pointer devices get Material's 48dp touch-target floor on the compact controls (`.btn-sm` ~33px, `.icon-btn` 40px, chips ~28px) via invisible negative-margin hit-area extensions — visuals unchanged. Bottom-sheet modals cap their height and padding to the safe area so the last row clears the gesture bar. The My Trips page reworks its phone layout: header stacks with a full-width primary CTA (demo-trips collapses to icon-only), When/Sort selects split one row, cards go single-column without hover-lift.
- **A task-first app home for the shell** (`pages/NativeHome.tsx`). The website's `/` is a marketing landing — right for a browser first-timer, wrong for a signed-in app user. In the native shell the root route renders an Android-grammar home instead: greeting by time of day with an unread-notification bell and avatar, a two-tile action row (Plan a trip primary / Explore secondary), and trip rows ordered live → upcoming (soonest) → recently-edited, each showing phase (a steady "Live now" dot), per-person cost, crew size and start date — capped at six with an "All N trips" row. Empty accounts get a one-tap onboarding card. Platform-gated at the router (`isNative && me`), so the website is byte-for-byte unchanged.

### Fixed
- **Updates install — every build now signs with one stable key.** GitHub's runners generate a *fresh* debug keystore per run, so every APK had a different signature — and Android refuses to update an app whose signature changed (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), silently keeping the old build. On-device this read as "nothing I do changes anything". One PKCS#12 keystore is generated once, stored in repo secrets (base64), materialised by CI where gradle expects it, and `signingConfigs.stableDebug` signs every debug build with it. Verified end-to-end: the shipped APK's signature block contains exactly that certificate. The signing config lives in `android/app/build.gradle`; releases bump `versionCode`/`versionName` there (this release: 7 / "0.7-native") so builds are visibly distinct under Settings → Apps.
- **External links did nothing — target="_blank" is a no-op in a WebView.** WebViews create no new window, so the Maps button, stop source links and social links went nowhere on tap. All external links now route through `openExternal()` (`window.open`), which the Capacitor bridge converts into an `ACTION_VIEW` intent — Maps opens in the real app or browser.
- **Content sat under the system bars (Android 15 edge-to-edge).** Android 15 forces the WebView full-bleed behind translucent bars, but the WebView reports `env(safe-area-inset-*)` as **0** — the pre-existing safe-area guards compensated for nothing, so the topnav tucked under the status bar and the last page row under the gesture bar. Capacitor's `SystemBars.insetsHandling: 'css'` injects real `--safe-area-inset-*` values; every fixed/sticky call site now consumes them via a `var()` → `env()` → `0px` fallback chain, and the topnav's sticky offset and the app-shell's bottom padding follow the inset. (One `useStoreReady()` call that had briefly duplicated in App.tsx during this work was consolidated back.)
- **The homepage lagged badly in the shell — the desktop choreography is now budgeted for phones.** The landing page layered 18px backdrop-blur glass across ~27 surfaces, two 340–380px blobs drifting under an 80px blur, an infinite ticker, dash-animated SVG road and odometer digits — a desktop GPU show that janked a phone WebView. `@media (pointer: coarse)` and `.native-shell` (set on `<html>` before first paint in `main.tsx`) cap every oversized blur at 8px, freeze the blobs and ticker as static washes, and the below-fold landing sections skip layout/paint entirely until scrolled near (`content-visibility: auto` with intrinsic sizes). The website keeps the full look.
- **A yellow smear bled through the nav behind the logo.** The landing canvas paints a peach radial at 88%/28% — directly behind the 58%-opaque glass nav pill, which on a small screen read as a stain, not the intended wash. In the native shell the canvas is a flat cream ramp and the nav pill is near-opaque (light and dark variants), so it reads as a solid Android top bar.
- **The thick right-edge scrollbar is gone.** Android apps never draw one — the finger is the scroll indicator. The shell hides page scrollbars in CSS *and* at the WebView level (`MainActivity` disables the view's scrollbars and overscroll glow), so scrolling is pure content motion.
- **Notifications stalled while backgrounded.** Android freezes the WebView when backgrounded; Supabase's realtime websocket dies without an event, so anything that happened while away never arrived until a manual refresh. `resumeSync()` (full re-hydrate + realtime re-subscribe, bypassing hydrate's same-user dedupe with a fresh generation) now runs on Capacitor's `appStateChange → active`. Anonymous and mid-auth-switch sessions correctly skip it.
- **Two CI traps worth recording.** (1) `gradlew` lost its executable bit in the Windows checkout — `Permission denied` on the Linux runner; fixed with `git update-index --chmod=+x` plus a defensive `chmod` in the workflow. (2) Storing the keystore secret: `gh secret set` was fed the **raw binary** PKCS12 — an invalid-UTF-8 secret makes GitHub's job-creation die instantly (`startup_failure`, zero jobs, no logs to read), which killed every build until a bisect with secret-free workflow variants isolated it. The secret is ASCII base64 now; secrets ride via step `env:` rather than inline `${{ }}` interpolation as defense in depth.

### Added

- **The Android shell scaffold and its seven native plugins.** `android/` (Capacitor 8, compileSdk 36, minSdk 24) and `capacitor.config.ts` with `SystemBars.insetsHandling: 'css'`; manifest permissions for coarse/fine location (locate-me) and vibrate (haptics). Seven plugins: app, clipboard, filesystem, geolocation, haptics, share, splash-screen. Keys never enter the repo; the keystore file itself is gitignored.

## [0.48.0] - 2026-09-11

**A consistency-and-shell release: the design system collapses to one green, one kicker recipe and four blur tiers, and the Android shell gains a real bottom navigation bar — with map gestures that stop fighting the page scroll and a keyboard that resizes the WebView.**

### Added
- **Execution playbook for the invites & onboarding milestone (M9).** A new
  `docs/PLAN-INVITES-ONBOARDING.md` guide turns the approved plan into an
  executor-ready playbook: one unified `platform_invites` entity shipped as R1
  creator invites → R2 referral → R3 invite-only gate, with phase-by-phase
  implementation steps (migration + RLS + RPCs, `src/lib/accessCode.ts`, the
  `#/access/<code>` gate, the masteradmin Invites-tab rebuild, creator
  onboarding flush, tests) and per-phase acceptance criteria. ROADMAP picks up
  an M9 strategic-track section plus an idea-pool pointer; docs/README indexes
  the new plan.
- **A real bottom navigation bar in the Android shell.** `components/BottomNav.tsx`
  gives the installed app the primary navigation it never had: four Material
  destinations — Home, My trips, Explore, Profile — in a fixed 58px glass bar
  above the gesture bar, four equal columns, icon over an 11px label, the active
  one tinted like a selected tab, `aria-current="page"` for assistive tech, and
  a 48px tap floor per item. It is gated on `isNative && me` exactly like the
  shell home, so the website never renders a byte of it. `/trip/:id` counts as
  My trips (the workspace is opened from that list and back returns there);
  every other route lights nothing. The floating pill is hidden in the shell,
  but the hamburger tray stays as the overflow — Plan a trip, Creator hub and
  Log out all remain reachable.
- **One bottom-chrome offset every page-level bottom layer clears.**
  `--shell-nav-h` is the shell's navigation row (58px inside `html.native-shell`,
  **0px** everywhere else) and `--bottom-ui-offset` is that plus the device's
  gesture bar, so a single `var()` now lifts the app shell's padding, the toast
  zone, the AI button, the Plan Bench dock, the sticky settings save bar and the
  trip dock above the new nav. The overlays that deliberately own the true bottom
  edge — modals, the impact sheet, the AI drawer, the expanded map — keep the raw
  inset. `scroll-padding-bottom` moves with it, so focus and scroll-into-view
  landings clear the bar too.
- **`tests/mobile-shell.test.ts`** — 19 static invariants over the shipped files
  pin the whole pass: the four destinations and their native gate, the hidden
  pill and the surviving tray, the safe-area `var()` fallback chain (no bare
  `env()` left anywhere), the offset tokens and their exact consumer list, the
  cooperative-gesture switch, and the manifest's keyboard mode.

### Changed

- **Design-system consistency pass: fonts, casing, glass and colour.** One green
  (CTI teal `#0D8D82`) now drives primary buttons, focus rings and form
  accents. Glass blur is unified into four tiers (chrome 18 / panel 14 / chip 8 /
  scrim 3) with every translucent surface mapped to one. Card and popover radii
  touched by the pass snap to the token set (12/18/24), and a handful of one-off
  card radii remain, staged with the spacing sweep. Mobile row actions rise to
  40px. Every micro-label shares one recipe (10.5px / 700 / .06em, uppercase via
  CSS). Type- and spacing-token scales join the existing token ladder.
- **The shell navigates from the bottom, so the floating pill steps aside.** The
  `.nav-links` pill is hidden under `html.native-shell` — a class gate, not the
  ≤720px width gate, because the shell also ships to tablets and landscape — and
  the four destinations live in the new bar instead. Nothing was deleted: the
  pill is still the website's primary nav, and the hamburger tray still carries
  Plan a trip, Creator hub and Log out.
- **`.app-home-section` stops being a one-off.** The shell home's section
  heading carried its own 13px / 800 / .08em / uppercase recipe; it now joins the
  unified kicker block (`--kicker-size` / `--kicker-weight` / `--kicker-tracking`,
  uppercase via CSS) with its margin and colour kept.

### Fixed

- **Off-scale font weights flattened the hierarchy, and the declarations lied
  about it.** The stylesheet declared 550 (×3), 650 (×20), 750 (×11) and Inter
  800; the font link loaded none of them — but CSS font matching resolves an
  unloaded weight to the nearest real face (550→600, 650→700, 750→700,
  Inter-800→700), so **nothing rendered as browser-synthesised faux bold**. The
  real defect was a flattened hierarchy and declarations that lied about it.
  Inter now loads 400–800 and every declared weight rounds to a loaded face.
- **Literal ALL-CAPS strings** are retyped in sentence case across the app
  (public itinerary, Explore, trips list, Plan Bench, trip settings, timeline),
  and the uppercase look now comes from CSS `text-transform`, which also stops
  screen readers spelling the words out.
- Casing and typography nits: "Trip board", "Master admin", "Explore
  itineraries", capitalised helper sentences, typographic apostrophes.
- **An inline map no longer swallows the page scroll.** A one-finger drag that
  started on the trip map panned the map and left the page stuck. Every embed now
  opts into MapLibre's cooperative gestures on touch devices — one finger scrolls
  the page, two fingers pan the map, and MapLibre paints its own "use two
  fingers" hint — while the expanded fullscreen map hands normal gestures back
  (there is no page scroll left to protect once it owns the viewport). The gate is
  the pointer type, so a mouse-driven desktop keeps plain wheel-zoom and
  one-finger drags unchanged.
- **The soft keyboard resizes the WebView instead of floating over it.** The
  manifest left `windowSoftInputMode` to the platform's `adjustUnspecified`
  heuristic, which picks pan-or-resize per window; `MainActivity` now pins
  `adjustResize` so the layout reflows deterministically and a focused field is
  never left behind the keyboard.
- **The Create-trip dock was the last fixed surface reading `env()` directly.**
  `.trip-dock` — the fixed bar carrying **Print bill** and the primary
  **Create trip** CTA — was the one fixed/sticky call site still reading
  `env(safe-area-inset-bottom)` directly, a value Android WebViews report as
  `0`, so the bar sat under the gesture navigation bar and took its primary CTA
  with it. It now uses the same `var()` → `env()` → `0px` chain as every other
  call site.

## [0.47.0] - 2026-09-10

**A cleanup-and-polish release: deletes become reversible, the app writes faster, and the whole backlog of small wins lands at once.**

### Added
- **Browser push notifications (local Notification API, no service worker).** Profile & settings gains a Notifications card with an explicit opt-in toggle: enabling it requests OS permission *in the click* (browsers ignore prompts outside a user gesture) and stores `yatraflow_browser_notif=1`. From then on, new unread in-app rows for the session user also fire an OS-level ping — but only when the tab is in the background (`document.hasFocus()` guard, so a focused tab never double-announces via bell + OS), only once per notification id (per-session seen-set, seeded at login so the existing inbox never replays), and never for rows already marked read. New pure `src/lib/browserNotifications.ts` (13 node tests: flag round-trip, support/permission guards, prompt gating, dedupe vs read-flag vs focus matrix); wiring is a small `useEffect` in `App.tsx` off the existing subscribed notifications slice.
- **A "Send feedback" link** in the account menu and the landing footer. It opens a `mailto:` to `support@yatraflow.app` (the same address the password-reset flow already uses) pre-filled with the app version and current route — the version is inlined at build time from `package.json` via a new `__APP_VERSION__` Vite `define`, so a report is reproducible without the reporter typing a word. Closes the P4 "feedback button" pool item.
- **Explore itineraries pagination.** The community grid renders 12 cards at a time with a "Load more · N more" button instead of dumping the whole catalog; the window resets to the first page whenever a filter/sort changes (but not on a live realtime insert, so a new publication doesn't yank you back to the top). Closes the P4 "Explore pagination" pool item.
- **In-map place search (CTI §6.5).** The Map tab's "Nearby ideas" card gains a free-text search box over the same provider facade (`searchPlaces` — Google when keyed, the free stack otherwise), with the top 5 results listed inline and a "+ Add" that drops the place into the existing pick-a-day flow. Closes the "In-map place search" deferral.
- **Map popup → Timeline/Board cross-links (CTI §6.5).** Clicking a stop pin now raises a compact popup over the map offering "Open in Timeline" and "Open in Board", jumping straight to those tabs — the "compact selected-stop popup with direct navigation" the design doc asked for. Closes the "Map popup cross-links" deferral.
- **Per-decision trip context + offline recommendation (CTI §6.8).** Open decision cards now show a grounded one-liner ("Xh Ym on the road · ₹Z total · health 82/100") and a deterministic, data-grounded recommendation — the option with the smallest declared cost, then time, else the leading vote — labelled "(offline)". New pure `src/lib/decisionGuide.ts` (7 node tests) so the recommendation is testable and honest; M5's configurable LLM assistant will layer on top. Closes the "Per-decision impact panel + grounded assistant" deferral.
- **Trip trash + 30-day purge (soft-delete).** "Delete" now moves a trip to the trash instead of hard-deleting: the row's `deleted_at` tombstone is stamped and a restrictive RLS policy hides it from normal reads, so it survives 30 days for restore before a `purge_trashed_trips()` sweep hard-deletes it. My Trips gains a **Trash** view (populated from a new `get_trashed_trips()` RPC) with per-trip **Restore** and **Delete forever** (`restore_trashed_trip` / `purge_trashed_trip` RPCs). Two migrations ship the backend (`20260910_trip_trash.sql` — column + policy + bulk purge; `20260910_trip_trash_rpc.sql` — per-user RPCs); the client paths are probe-gated on the `deleted_at` column so un-migrated/test databases keep the old hard-delete behaviour.

### Changed
- **Bursty trip edits now write to Supabase once instead of once per keystroke.** `persistTripField` coalesces rapid edits to the same trip (drag-reorder, settings keystrokes, undo/redo chains) into a single trailing 600 ms row UPDATE whose snapshot is always the freshest cache state; deletes and member changes stay immediate. Pending writes flush on `visibilitychange(hidden)`/`pagehide` (guarded — the node test env has no DOM) and via an exported `_flushTripWrites()`. A `_setTripWriteDebounceMs(0)` test hook restores immediate writes for the existing write-through suite, and a new `tests/store-debounce.test.ts` pins the coalescing + flush behaviour (3 tests). Closes the P4 "debounced store writes" pool item.

## [0.46.0] - 2026-09-09

**The masteradmin console: command over the whole app, from one unlinked route.** `#/admin` — typed, never linked — gives the two administrators a god-view over every user, trip, invite, publication and audit row, with every destructive action behind an audited, role-rechecking RPC and an append-only audit log. Shipped alongside PR #81's v0.45.0 create-flow release on the same day; the backend migration was applied and verified live before the PR opened.
### Added
- **A masteradmin console (`#/admin`) gives you command over the whole app.** A new private route (never linked from any nav — admins type it; non-admins fall through to the landing page) surfaces seven tabs driven by the JWT `app_metadata` role, not a database column: **Overview** KPI tiles (users, trips, private/public split, published count, Explore views/forks, open suggestions/decisions, avg crew per trip, 7d activity with the prior week, creators, disabled), **Users** (searchable directory with owned-trip counts, creator/disabled/you chips, make/unmake creator, and a reversible disable that signs the account back out — v1's "delete", hard deletion deferred), **Trips** (every trip, owner, crew, visibility, date, plus make-private/make-public and a type-to-confirm permanent delete that keeps an audit snapshot), **Invites & sharing** (30-day member-join velocity over the member slice), **Content** (the published catalog with an admin unpublish), **Analytics** (activation, collaboration, publish and view→fork funnels plus a 12-week signup/trip growth table), and an **Audit log** showing every admin action with who, what, when and the target. Every destructive button calls an audited `SECURITY DEFINER` RPC and renders through the plain existing cards/tables — no new component system.
- **The masteradmin role is a JWT claim, not a self-grantable column.** The role lives in `auth.users.raw_app_meta_data` (`{"role":"masteradmin"}`), so RLS reads it via `auth.jwt()` and there is deliberately no `is_admin` boolean on `profiles` — a column would be promotable through the "profiles update self" policy. Administrators hydrate the **entire** app (all trips, all collab slices, the audit log); everyone else keeps the membership-scoped cache. Under the hood: `is_admin()` + `is_disabled()` RLS helpers, RESTRICTIVE deny policies on every table for disabled accounts, permissive admin read/write bypass policies, an append-only `admin_audit` table, and six audited RPCs (`admin_set_disabled`, `admin_set_creator`, `admin_set_trip_visibility`, `admin_remove_member`, `admin_unpublish`, `admin_delete_trip`) — each re-checks the role inside, refuses self-harm / last-admin removal, and writes the audit row in the same transaction before the effect. Grant/revoke are SQL one-liners in `supabase/migrations/20260909_masteradmin.sql` (hasnaina955@gmail.com + shabtab@outlook.com documented there; sign out/in to mint the new JWT).

## [0.45.0] - 2026-09-09

**The create flow gets its ticket, invites get their codes, and trip settings get the bench.** Creating a trip becomes the Trip Ticket — a live boarding-pass starter that prints its rough bill on demand and seeds your timeline; invites shrink to trip-shaped codes with a join flow that actually completes; and Trip settings is rebuilt on the Plan Bench's own controls with editable dates that reconcile the day grid. My Trips gets its search/filter/sort back, car rental joins the transport modes, and two reliability fixes land: the pre-patch `updateTrip` persistence bug and the auth-refresh logout race.
### Added
- **Trip settings is now the Plan Bench, inside your trip.** The Share tab's settings
  panel was a flat stack of twelve look-alike fields with Save parked below the fold. It
  now speaks the landing calculator's own control language — the same classes at the same
  proportions, nothing re-invented: eyebrow-headed blocks carrying a big live value, the
  transport-mode icon grid (icon, name, ≈speed), the 1–12 travellers crew buttons, slider
  dials with drag bubbles for budget and fuel, and the pill rail for travel style. A sticky
  **settings bill** on the right mirrors every choice as you make it — the group budget
  (₹ × head-count, live), what the date range will do to the day grid, and whether costs run
  on fuel or per-km fares — so the outcome is readable *before* saving rather than after.
  Below 980px the receipt drops under the controls; Save rides a sticky, safe-area-aware bar
  spanning both columns. Two shared primitives came out of it (`RangeDial`, `StickyFormBar`
  in `ui.tsx`); everything else is the bench's own CSS, so the two surfaces can no longer
  drift apart. The publish editor keeps the matching density: neutralised field margins, a
  2-column free-preview day grid, inline styles replaced by tokens.
- **Trip dates are finally editable after creation — and the day grid follows them.** Trip settings (Share tab) gains Start/End date pickers. Lengthening the range appends empty days at the end; shortening drops trailing *empty* days only — a day holding stops or a fixed commitment is load-bearing and blocks the shrink with a toast naming the day ("Day 4 still has stops — move or delete them before shortening"), rather than silently deleting a user's plan. Indexes re-sequence after any change. The End-date field's live hint shows what the save will do ("Adds 2 empty days at the end" / "Drops 1 empty trailing day"). New pure `reconcileDays` helper in the store (11 node tests: grow/shrink, load-bearing stops and commitments, invalid and inverted dates, 1-day ranges).
- **My Trips search, filters and sort (restored).** The upstream squash-merge of the on-the-road PR carried the calendar/print exports but silently dropped this file, so My Trips had reverted to a bare recently-edited list. Restored from the fork's `feat/on-the-road` branch: a search box (name, start/destination, and every stop title), travel-style chips with counts (Explore's pattern), a When filter (upcoming & live / past / drafts — date-bucketed on the trip's end date so an in-progress trip counts as upcoming; dirty dates count as drafts), and sort by recently-edited / name / longest / budget low→high / high→low. Filtering to nothing shows its own "no trips match" empty state with a clear action, distinct from the no-trips onboarding. Local view state only (a private page — no URL sync, unlike Explore's shareable filters).

### Fixed
- **`updateTrip` persisted the pre-patch trip, not the edit.** The settings save path persisted the *current* trip row and only then applied the patch to the in-memory cache — so every Trip-settings edit (name, budget, cover, day titles…) reached the database only if a *later, unrelated* write happened to persist the trip again; otherwise it silently vanished on reload. Found while wiring the date fields: the flow now mutates the cache first and persists the draft that already contains the patch, pinned by a write-through test asserting the DB payload carries the *new* budget.
- **The bench's selected controls failed AA contrast in *both* themes.** The saturated
  selected states (`.bench-mode-btn.on`, `.bench-crew-btn.on`) painted white on teal-600:
  4.08:1 in light and 2.46:1 in dark against the 4.5:1 floor. The pale-tinted ones
  (`.bench-toggle.on`, `.bench-stay-row.on`) passed light at 5.14:1 but fell to 4.08:1 in
  dark, because teal-700 *is* the bright shade there. Fixed at the source rather than
  per-surface, since the same classes now render on the landing hero and in Trip settings:
  light fills step down to teal-700 (5.84:1), and a dark-theme override flips the saturated
  fills to the near-black ink the pill-nav glider already uses (#06251f on #2BB8AC = 6.62:1)
  and the tinted ones to teal-600 (5.55:1). Every ratio computed from the token values.
- **Pill navigation is readable in light mode.** Inside a `PillNav` the active chip's background is painted by the glider — pale teal in light mode — but the chip inherited `#fff` ink from its selected style: white on near-white, ~1.2:1. The Creator Hub and Group Input filter pills were the visible casualties. The active chip now carries deep-teal ink on the pale glider (5.05:1); dark mode keeps its saturated glider with dark ink. The new settings tiles/stepper were switched to the same tinted-selected pattern after computing their filled style at 4.1:1 (light) and 2.6:1 (dark) — both failing AA.
- **Per-day cost bars got the sheen.** The "Where the money goes" category bars sweep a calm light gradient; the per-day bars above them were the only budget bars without it (a bare width transition only). Both now share the same `barSheen` sweep; the global reduced-motion guard freezes it as before.
- **Every enum the UI renders is now sentence-cased.** Trip Settings' transport-mode and travel-style dropdowns showed raw machine values — "car", "food-focused" — because the form never ran any label formatter; the Plan Bench masked its raw values with CSS `text-transform` but carried the same debt. The root cause was systemic: **thirteen** private copies of the same three formatters had drifted apart (StopEditor's replaced only the *first* hyphen, rendering "Transport-hub"). They collapse into one `lib/labels.ts` (`cap`, `titleCase`, `statusLabel`), with tests pinning the exact wording. The Trip Settings fix also had to add the missing `value=` attributes — without them an `<option>`'s value is its *text*, so capitalising the label alone would have written "Car" into `trip.transportMode` and corrupted the data model.

## [0.44.0] - 2026-09-08

**The numbers you actually ask mid-trip, answered where you're planning.** The Budget tab now says what is still safe to spend today, timeline day headers show what each day costs and how long you'll be at its stops — and three reliability fixes make already-open tabs survive a deploy while public itinerary pages and invite links finally work for people who aren't members yet.

### Added
- **"Safe to spend / day" pacing tile on the Budget tab.** The metric strip gains a fifth tile answering the one question a running trip actually asks: given the group's target and what's been spent, how much can we still spend each remaining day without blowing the budget. Backed by two new pure engine helpers — `daysRemaining` (today counts as a full remaining day; dirty `startDate`/`endDate` strings clamp to the day count instead of returning `NaN`, and a finished trip returns 0) and `safeToSpendPerDay` (returns `null` when no per-person target is set, so the tile honestly asks you to set one in Trip settings rather than inventing an infinity). Overspend renders the figure in the danger colour. Strip goes 4 → 5 columns with new 1400px / existing 1100px responsive steps.
- **Per-day cost and time-at-stops chips on timeline day headers.** Each day header now carries two quiet metadata pills — "≈ ₹X" (tooltip splits travel from day costs incl. entry fees) and "Xh Ym at stops" (visit time plus buffers; driving time stays in the day summary line) — so the numbers the engine already computes (`computeTotals().byDay` and `simulateDay` dwell) surface where the plan is actually edited. Both hide while a day is collapsed, keeping a folded header calm, and the dwell chip drops out below 720px.

### Fixed
- **Open tabs survive deploys instead of crashing.** Every deploy replaces the hashed lazy chunks, so an already-open tab's next lazy import (Board, map, any page) 404'd with "Failed to fetch dynamically imported module" — and since the browser caches the failed module fetch, "Try again" could never recover; only a manual reload worked. The error boundary now recognises stale-chunk failures and reloads into the fresh deploy automatically (once — a session flag guards against reload loops; if the reload itself fails you get an honest "YatraFlow was just updated" screen with a reload button). Real bugs keep the existing recovery UI.
- **Public itinerary pages and invite links work again for non-members.** The membership-scoped hydration (the v0.41 anti-bloat fix) deliberately keeps other people's trips out of the cache — which silently broke every flow that needs them: an anonymous visitor opening an Explore card hit "Itinerary not found", and an invite link showed "This invite link is broken" for anyone who wasn't already a member (the join itself reads the cached trip). Both pages now fetch the trip on demand (`fetchSharedTrip`): a direct row read covers owner/member/public trips, and a new `get_invite_trip` security-definer RPC covers private invite previews — holding the link (the trip's unguessable UUID) is the capability, the same trust as the public URL. Publishing now also flips the trip to `visibility='public'` (and unpublishing back to private) so the RLS read path is the primary one. The companion migration `supabase/migrations/20260907_shared_trip_reads.sql` — backfilling `visibility='public'` for everything already published and creating the RPC + grant — has been applied to the live database.
- **The public page no longer crashes with React #310 when its trip loads.** The fetch-on-miss fix made the backing trip arrive after first render, exposing four `useMemo` calls that sat *below* the not-found gate — a hooks-count change between renders crashes React. All memos now run unconditionally with null-guards.

## [0.43.0] - 2026-09-07

**The suggestion engine comes alive: See & do finally fills, the map and the suggestion panels point at each other, and every add lands in road order.** This release fixes the structural reason sightseeing never appeared, turns the Map tab into one connected surface, and locks the AI companion away ahead of its paid launch. It also repairs a bad merge that had corrupted two core files and silently reverted the tabbed Share page.

### Added
- **Sightseeing suggestions actually exist now.** See & do was empty *by construction*, on every route: the fatigue planner only schedules food/fuel/rest/overnight segments, and the sightseeing column was filled from whatever the food and hotel searches happened to return as leftovers — so a long Kolkata → Jaipur drive got dhabas and hotels and nothing else, however far you drove. The corridor scan now always includes a sightseeing pass — "tourist attractions" through Google's `tourist_attraction` type gate, Overpass attraction/viewpoint/monument selectors in the keyless free mode — so real sights (forts, viewpoints, temples, waterfalls) surface along the corridor, flow into the See & do panel with their story arcs, and pin to the map. Fuel halts remain self-drive-only by design (car/motorcycle), anchored to your tank range.
- **The panels and the map now point at each other.** Hovering or selecting a suggestion card makes its map pin glow and glides the camera to it — "where is this?" answered without touching the map. Hovering or clicking a pin highlights the matching card and scrolls it into view — "which card is this?" answered without scanning the list. Because pin clicks now mean "locate", adding moved to an explicit teal + chip under each pin, so the quick-add is still one click away (and pins are real keyboard-focusable buttons).
- **New stops insert in road order, not at the end.** Add a stop that sits between two confirmed stops and it lands between them — the plan reads A → B → C, not A → C → B. Each addition is projected onto the real OSRM road geometry to find its position, the day's stop order is renumbered, and the Timeline agrees. Works for single adds, "Also nearby" chips, and the story-arc "Add all" batches (which insert pre-sorted so a multi-stop arc lands in journey order).
- **A rolling guide to the engine, on the Map tab itself.** A quiet purple strip cycles through what the suggestion engine actually does — fatigue spacing (stretch ~150 km, lunch ~300, tuned to crew size and travel style), the lunch clock sliding meals into 11:30–14:30, fuel cadence on your tank's rhythm, overnight cities every ~550 km, per-day detour budgets, Trip DNA learning from your accepts and declines, the rain re-rank, road-personality warnings, story arcs, and the new cross-highlighting — so the intelligence is discoverable without a docs trip. Dots jump between tips; it holds still under reduced motion.

### Changed
- **Travel style and transport mode now re-tune suggestions immediately.** Both settings change the plan — relaxed drives get a 120/260 km cadence vs packed 180/300, and fuel stops only make sense for self-drive — but the suggestion cache ignored them, so switching style kept serving suggestions tuned for the old setting until you hit ↻ Refresh. The cache key now includes both, so changing them re-searches straight away (an explicit user action, so it doesn't violate the expensive-search persistence rule).
- **The AI companion is locked, not deleted.** The drawer, its trip-grounded answers and the FAB are fully implemented but unmounted behind a `VITE_AI_COMPANION=on` flag (`lib/featureFlags.ts`) while the premium milestone (M8) decides its paywall shape. Nothing was removed — flip the flag for local preview.

### Fixed
- **The AI drawer closes again — and looks like YatraFlow.** A merge had deleted the drawer's display-when-closed rule, so the panel rendered permanently open on every trip page, with its long quick-prompt labels wrapping into tall ovals inside the pill radius. The close rule is restored, and the panel is redesigned onto the CTI design language: navy→teal gradient header with a glass icon badge, brand-teal user bubbles (white on `--teal-deep`, 5.2:1 AA), bordered bot bubbles, single-line quick-prompt pills on a horizontal scroll rail, a teal-gradient FAB with the brand glow, and a safe-area-aware input row.
- **Encoding corruption repair.** The same bad merge had mojibake-corrupted every non-ASCII character in `styles.css` and `ShareTab.tsx` — em-dashes and section signs turned into double-encoded garbage, including user-visible strings like the snapshot-copied toast — and silently reverted the tabbed Share-page refactor (PR #74). Both files were restored byte-clean from the pre-merge commit and the intended additions re-applied on top: the print/PDF day-card styles, the per-day cost/dwell chip styles, the saffron idea-pin gradient, and the ICS/print buttons threaded with OSRM leg corrections. Corrupted CHANGELOG notes (a BEL character where an "a" should be; a split `routeHash` line) were repaired too.

## [0.42.0] - 2026-09-07

**C1–C4: Hy4 audit P0 fixes.** The suggestion engine's persistent state and UI behaviour are now reliable: 'Add all' batch-applies with write-through (C1), the suggestion cache expires when the route geometry changes (C2), the degenerate-route guard stops short routes crashing (C3), and the detour budget is enforced from the actual itinerary (C4).

### Fixed
- **C1: 'Add all' button now batch-applies all stops with write-through** — previously collected stops only updated UI state without persisting to the database. Now uses `applyChange` to batch-add all selected stops, with the same optimistic UI pattern as per-stop 'Add to timeline'.
- **C2: Suggestion cache invalidates when route geometry changes** — added `routeHash` to include OSRM road geometry in the cache key. When OSRM resolves the route after mount and the road changes, the cache now correctly expires instead of showing stale corridor suggestions.
- **C3: Guard corridorAnchors when all stops are within 500m** (pts.length < 2) prevents cum[1] undefined crash on degenerate routes.
- **C4: Detour budget now enforced from actual itinerary stops** instead of skipping added/dismissed suggestions.


<!-- Link references. Only tags that exist on the remote are linked; untagged releases
     fall back to a friendly commit-range compare so no heading 404s. -->

[Unreleased]: https://github.com/hasnaina955/Yatraflow/compare/v0.54.0...HEAD
[0.54.0]: https://github.com/hasnaina955/Yatraflow/compare/v0.53.0...v0.54.0
[0.53.0]: https://github.com/hasnaina955/Yatraflow/compare/v0.52.0...v0.53.0
[0.7.0-native]: https://github.com/hasnaina955/Yatraflow/releases/tag/v0.7.0-native
[0.48.0]: https://github.com/hasnaina955/Yatraflow/compare/v0.47.0...v0.48.0
[0.47.0]: https://github.com/hasnaina955/Yatraflow/compare/v0.46.0...v0.47.0
[0.46.0]: https://github.com/hasnaina955/Yatraflow/compare/v0.45.0...v0.46.0
[0.45.0]: https://github.com/hasnaina955/Yatraflow/compare/v0.44.0...v0.45.0
[0.44.0]: https://github.com/hasnaina955/Yatraflow/compare/v0.43.0...v0.44.0
[0.43.0]: https://github.com/hasnaina955/Yatraflow/compare/v0.42.0...v0.43.0
[0.42.0]: https://github.com/hasnaina955/Yatraflow/releases
