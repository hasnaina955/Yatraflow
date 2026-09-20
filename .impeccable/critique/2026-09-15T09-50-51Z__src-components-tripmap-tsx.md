---
target: clock-map-zones
total_score: 30
max_score: 36
na_heuristics: 0
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\hasna\\yatraflow-cz\\src\\components\\TripMap.tsx"
target_fingerprint: "sha256:927c9a17b5c860b6f3d1d1f7d4bb49909d290a78511132374fd3c9f2999c0eaa"
target_path: "C:\\Users\\hasna\\yatraflow-cz\\src\\components\\TripMap.tsx"
timestamp: 2026-09-15T09-50-51Z
slug: src-components-tripmap-tsx
---
# Critique — the clock drawn on the map (`feat/clock-map-zones` @ 71d95ed)

⚠️ DEGRADED: single-context (sub-agent spawn hit the harness's daily model cap; Assessments A+B were re-run sequentially in one context, with the detector run strictly after Assessment A was drafted — the skill's ordering invariant was still honoured)

Method: single-context (A: design review · B: detector + contrast/size/a11y evidence)
Score: 30/36 — Good (83.3%)
P0: 0 · P1: 2 · P2: 3 · P3: 1
Detector (`npx impeccable detect src/lib/clockOverlay.ts src/components/TripMap.tsx src/styles.css`): exit 2, 46 findings — **zero inside the clock feature's own code/CSS** (nearest: `.rs-*` and `.hero-bench-cta` families, all pre-existing)
Browser: skipped (no browser tool exposed; no server started)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | The layer is the status: circles/band/moon show where the day stands; toggle reflects on/off via `aria-pressed`; radius is honest (window/2 × kmPerMin) |
| 2 | Match System / Real World | 4 | Real clock ETAs, real km-in, real halt positions on the measured road; moon = position not area, exactly as the plan promised |
| 3 | User Control and Freedom | 3 | 🕑 toggle default-on and instant; not persisted (same as its `Return home` sibling — consistent, but a returning user re-hides every visit) |
| 4 | Consistency and Standards | 3 | Emoji glyphs (🥐🍽️🍷🌙) vs the map's otherwise geometric icon language (lucide + numbered pins); colors don't collide with DAY_COLORS/idea pins, but the language differs |
| 5 | Error Prevention | 4 | No overlay before real OSRM geometry (`deriveClockOverlay` null-guards), defer verdicts render nothing, hop renders only the halt |
| 6 | Recognition Rather Than Recall | 2 | The whole clock story lives in **hover-only** tooltips (`MapLibre.Popup`, `closeButton: false`) — nothing is reachable without a pointer hover; keyboard/touch users get the circles' shape but none of the times |
| 7 | Flexibility and Efficiency | n/a | Map decoration layer; no repeated expert actions |
| 8 | Aesthetic and Minimalist Design | 4 | Circles at 10% fill + 1.3px stroke, band at 0.32–0.4 opacity, "quieter than a stop pin" achieved; dinner 🍷 + 🌙 stacking at the halt fixed this run |
| 9 | Error Recovery | 3 | Layer self-heals on theme flip via the `isLoaded` re-effect + try/catch cleanup; failure mode is silent absence (honest, but unexplained) |
| 10 | Help and Documentation | 3 | Toggle `title` is one good sentence; tooltip copy explains the radius meaning; no legend entry tying circle color → meal |
| **Total** | | **30/36** | **Good (83.3%)** |

## Priority Issues

- **[P1] `.yf-pin-time` referenced an undefined token — FIXED THIS RUN.** `color: var(--muted)` resolves to nothing (`--muted` was deleted in the v0.53.0 token sweep; `grep '^\s*--muted'` finds no definition in either clone), so the arrival chips fell back to **inherited ink** — dark text on the chip's 88%-opaque card, fine in light theme but a **near-invisible ~1.1:1 in dark theme** (dark ink on `--card #16233A`). Sibling chips use `--text-2`. → `polish` **(fixed: `--text-2`, 10.5px, max-width 80px; contrast now 6.19:1 dark / 10.31:1 light — ratchet 93/93 green)**
- **[P1] All clock facts are hover-only.** Meal windows, halt ETA, km-in and the radius explanation exist only inside `MarkerTooltip` popups with `closeButton: false` and no focus target — keyboard users and touch users on a phone (YatraFlow's own "Distracted Mobile User" persona) never see them. The arrival chips under pins show a bare `13:40` with no label. → `polish` (small legend row under the toggle, or `aria-label` on each glyph marker + the chip gaining "arr" text at ≥360px)
- **[P2] Emoji as the icon language — PARTIAL.** The map's pins are lucide icons + numbered discs; the clock layer introduces four emoji glyphs. They are `aria-hidden` (correct) and visually soft-haloed, but emoji render differently per platform (Windows/Android/iOS color sets) and 🍷 for dinner reads "wine bar" more than "dinner halt". Consistent alternative: lucide `UtensilsCrossed`/`Coffee`/`Moon` at the same 13px inside the existing halo. → `colorize`/`polish`
- **[P2] 🍷 dinner glyph stacked on 🌙 moon at every halt — FIXED THIS RUN.** `deriveClockOverlay` pushes a dinner zone centred on `nightHaltKm` *and* a night marker at the same coordinate; the busiest point of the day rendered two overlapping emojis (z-order nondeterministic across zooms). → `distill` **(fixed: one glyph per coordinate — the moon keeps the spot; its tooltip already names dinner + halt km; dinner circles away from halts still render)**
- **[P2] Toggle state is session-only.** `clockOn` starts `useState(true)` every mount (TripMap.tsx:432) while its neighbour `legendOpen` already uses `loadFlag/saveFlag` (L443) — hiding the clock is forgotten on the next tab switch, so users who prefer the plain map re-hide it daily. → `polish` (one `loadFlag('map_clock_on', true)` pair)
- **[P3] No legend for the three circle colors.** Breakfast/lunch/dinner hues are discoverable only by hovering each circle; the map already has a `Key` affordance (L~440 legend) where one row would fit. → `polish`

## Verified-clean (checked, no action)

- **Radius math is honest:** `radiusPxAtZoom0(km, lat) = km·1000 / (156543.03392·cos(lat))`, drawn with an exponential-2 zoom ramp anchored at zoom 3 (`r0`, ×2048 at z14) — the circle tracks true ground scale; 12 fixtures pin the math in `tests/clockOverlay.test.ts`.
- **No duplicate dinner zone:** `TravelClockAnchor['name']` is `'breakfast' | 'lunch' | 'tea'` (ridePlan.ts:320) — dinner only ever comes from the halt path, so the stacking fix removes the only overlap.
- **Cleanup is correct:** `ClockZonesLayer` removes both sources + both layers in its effect teardown, try/catch-guarded against mid-flight style swaps.
- **Detector-clean feature:** none of the 46 detector findings touch the clock code/CSS (the `side-tab`/`bounce-easing`/`layout-transition` hits are all pre-existing elsewhere).
- **Contrast ratchet:** the `.yf-pin-time` recolor passed the design-system gate with **no re-baseline** (93 files / 879 tests, exit 0) — the new pair is strictly better.

## Specificity Verdict

**Grounded.** Every number on this layer comes from the engine: ETAs from the terrain-profile clock walk, km-in from the measured road, radius from the journey's own pace, halts from the split. Nothing is decorative invention — the only "sales" element is the emoji set, which is presentational, not numeric.

## Follow-up queue

1. `polish` — hover-only facts (P1, remaining): aria-labels on glyph markers, labelled arrival chip.
2. `polish` — persist `clockOn` via `loadFlag/saveFlag` (2-line change, matches `legendOpen`).
3. `polish` — legend row for meal colors in the existing Key.
4. `colorize` — lucide glyphs instead of emoji (platform-consistent icon language).

