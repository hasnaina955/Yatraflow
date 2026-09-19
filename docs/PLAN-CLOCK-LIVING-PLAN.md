# Option C — the map as a living plan

Execution plan for `feat/clock-living-plan` (draft PR against
`origin/feat/clock-map-zones`), written so any agent can continue: each phase
is independently committable, verifiable (`npm run verify`), and phrased as
its own commit + PR-checkbox.

> **Scope lock.** This branch makes the map a *time-aware* surface. Density
> work (Option B: zoom tiers, bearing-relative offsets, snap-to-stop merging)
> and Option A's meal-label cut stay OUT unless a checkbox below is explicitly
> re-checked — do not smuggle them into these phases.

## Phase 0 — groundwork (the two unconditional fixes)

- [x] **Honest return walk.** `deriveClockMilestones` walks `roundTrip`
      through `planTravelClock` (#145 `returnDays`, terrain profile, party,
      dinner anchors); each label tagged `leg: 'outbound' | 'return'`.
      Commit `9d652ec` + `tests/clockOverlay.test.ts` leg/reversal fixtures.
- [x] **Label rendering.** Dotless flanking chips (time + date left, `Km N`
      right), return labels + home anchor behind the Return home toggle.
      Commit `69df8ae`.
- [ ] **FIX-1 · Single-source walk.** `deriveClockMilestones` currently
      RE-RUNS `planTravelClock` from reconstructed inputs while MapTab already
      holds the identical `clockVerdict`. Refactor: the lib accepts the walk
      result (`TravelClockDay[]` + `returnDays`) instead of re-invoking the
      engine; MapTab passes its `clockVerdict` through. Kill condition: delete
      the local `planTravelClock` call; a walk twice with identical inputs
      returning different labels must be impossible, not unlikely. Verify:
      `clockOverlay.test.ts` keeps passing (fixtures pass a synthetic walk),
      full gate green.
- [ ] **FIX-2 · Disambiguate km.** Return-leg chips currently read `Km N` with
      only the tooltip saying "drive home". Decide + commit one:
      loop-cumulative km on return chips (`Km 2,100`), or a leg marker
      (`Km 500 ↩ home`). Update `ClockMilestone.kmLabel` contract + fixtures.

## Phase 1 — time-awareness (zero-config "today")

"Today" = device date compared against each label's day-date
(`trip.startDate + dayIndex`). No picker, no extra control.

- [ ] **Day status on the label.** Derive `dayState: 'past' | 'today' |
      'future'` per label (lib-pure: `tripTodayISO` in, status out — stays
      node-testable). Undated trips (`startDate` missing): all `future`.
- [ ] **Today pulse.** `today` labels get a pulse treatment on the time chip
      (motion-tokens easing, `prefers-reduced-motion` respected — AGENTS rule
      10). Design-system baseline will shift: re-baseline deliberately,
      confirm the diff is line-number-only.
- [ ] **Past dimming.** Past-leg labels fade to a quiet treatment (opacity +
      solid borders, matching the return-leg whisper, not a new visual
      language). A trip fully in the past renders all-dimmed; a future trip
      renders full.

## Phase 2 — town names on halt labels

- [ ] **Join the halt to a place.** `nightHaltKm` → nearest named halt/town
      from the corridor data the workspace already holds
      (`haltPins`/`nightHalt` suggestions: `loadHaltPinsForTrip`,
      `planJourneyHalts`). Contract: `{ name, km }` or null — null renders
      today's chip unchanged (never a lie, never a blank).
- [ ] **Halt chip copy.** Overnight chips gain the town: `🌙 Jabalpur · Day 3
      · 8:41 PM · Km 912` (keep the left/right split: name+time+date left, km
      right). Tooltip + fixtures updated.

## Phase 3 — halt bottom sheet

- [ ] **Tap a halt → day sheet.** Tapping an overnight label opens the trip's
      day view for that `dayIndex` (Timeline deep-link already exists —
      `onOpenInTimeline(stopId)`; halt labels need the day, not a stop:
      extend the cross-link contract or route to `#/trip/<id>` with the day
      expanded). Today-labelled halt pre-opens nothing — it only pulses.

## Verify + land per phase

Each phase ends with `npm run verify` green (tsc + full suite + build),
CHANGELOG Unreleased updated with editor edits ONLY (AGENTS rule 9), and its
checkbox ticked in the PR body. Push only on explicit user say-so; `main`
merges stay user-gated (AGENTS rule 1).

## Out of scope (tracked elsewhere)

- Option B density work: zoom-tier thinning, bearing-relative offsets,
  snap-to-stop meal merging — file as follow-ups, not this branch.
- Meal-label removal (Option A) — deferred; revisit if Phase 1 proves the map
  is still too busy.
