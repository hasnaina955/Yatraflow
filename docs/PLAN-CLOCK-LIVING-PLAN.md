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
- [x] **FIX-1 · Single-source walk.** `deriveClockMilestones` now accepts the
      walk result (`TravelClockVerdict`) instead of re-invoking the engine —
      MapTab projects its own `clockVerdict` onto the resolved road; a walk
      twice with identical inputs returning different labels is impossible,
      not unlikely. Kill-condition fixture: two projections of one verdict
      agree field-for-field.
- [x] **FIX-2 · Disambiguate km.** Chose the leg marker: return-leg chips read
      `Km 500 ↩` against the outbound's plain `Km 500` — per-leg km kept (no
      renumbering, no silent collision), the arrow says which leg. Fixture:
      both legs asserted chip-for-chip.

## Phase 1 — time-awareness (zero-config "today")

"Today" = device date compared against each label's day-date
(`trip.startDate + dayIndex`). No picker, no extra control.

- [x] **Day status on the label.** `dayState: past | today | future` derived
      lib-pure from `tripStartDate + dayIndex` vs injected `todayISO` (device
      date in production, fixture date in tests — ISO-string comparison, no
      Date objects, no tz flips). Undated overlays are all `future`; a malformed
      "now" degrades to timeless.
- [x] **Today pulse.** Ambient `yf-today-pulse` keyframe loop on the active
      day's time chip (deliberately outside the raw-duration ratchet — cadence
      is a property of the effect — with a comment saying so),
      `prefers-reduced-motion: reduce` freezes it. `todayISO()` helper in
      `weather.ts` uses local getters, never toISOString (the +5:30 trap
      `isoAddDays` already documents).
- [x] **Past dimming.** `past` labels take the return-leg whisper treatment
      (dim + dashed, one visual language) — a trip fully behind today renders
      all-dimmed, a future trip all-full.

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
