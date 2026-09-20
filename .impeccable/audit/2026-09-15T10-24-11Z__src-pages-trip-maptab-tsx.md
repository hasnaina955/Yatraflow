---
target: map-panel-side-rails
total_score: 17
max_score: 20
p0_count: 0
p1_count: 0
p2_count: 3
p3_count: 2
target_identity: "file:C:\\Users\\hasna\\yatraflow-cz\\src\\pages\\trip\\MapTab.tsx"
target_path: "C:\\Users\\hasna\\yatraflow-cz\\src\\pages\\trip\\MapTab.tsx"
timestamp: 2026-09-15T10-24-11Z
slug: src-pages-trip-maptab-tsx
---
# Audit — the map panel's redesigned side rails (tidy / recommend / see & do / shortlist / fold)

⚠️ DEGRADED: single-context (sub-agent model at daily cap; assessments run sequentially in one context)

Method: impeccable detector (`npx impeccable detect src/pages/trip/MapTab.tsx` → **exit 0, zero findings**) + code-level checks across the 5 dimensions (a11y, performance, theming, responsive, implementation integrity). No browser session (no tool exposed).

## Audit Health Score

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 1 | Accessibility | 3 | 32 aria- attributes; folds carry `aria-expanded`+`aria-controls`; contrast AA enforced by the line-keyed ratchet. Gap: **no `aria-live`** — the "searching…" state (MapTab L1137) is a visual-only `<span>` |
| 2 | Performance | 3 | arcHits/arcs/altPool/`clusterStoryArcs` memoised (#166/#178); corridor scan cached (anchorHash+routeHash+style+mode). Gap: the detour-budget split runs **un-memoised in the render body** (L763–786) |
| 3 | Theming | 4 | Full 3-layer token system; dark parity on every rail surface; `--app-bar` uses intentional fallbacks; no raw hex in the rail blocks; the clock's `CLOCK_COLORS`/`CLOCK_BAND` are documented constants |
| 4 | Responsive Design | 3 | `poi-split` stacks at ≤720px; chips strip scrolls horizontally. Gap: **`map-day-chip` ≈ 25px tall** (5px pad + 12px font) vs the 40px project target — and the toolbar holds ~8 of them |
| 5 | Implementation Integrity | 4 | Detector-clean; design-system ratchet (contrast/hues/durations/duplicate selectors) green at 93/879; `railReasons`/`railRuler`/`vote-resolve-flow` node tests; #182 remediation carried evidence comments |
| **Total** | | **17/20** | **Good (address weak dimensions)** |

## Detailed Findings

### [P2] Map toolbar chips are below the 40px touch target
- **Location**: `styles.css` `.map-day-chip` (L1792: `padding: 5px 12px; font-size: 12px`) — renders ≈25px tall; the toolbar rows hold day chips + Recentre + Directions + 2D/Terrain/3D + Clock + Return home, all siblings of the same size.
- **Category**: Responsive / A11y (WCAG 2.5.8 Target Size Minimum, AA)
- **Impact**: the map tab is the most touch-dense surface in the app; mis-taps on a 25px strip are frequent one-handed.
- **Recommendation**: raise to `padding: 8px 14px` (≈31px) + an inset hit-area via `::after` (like the timeline's 40px pattern), or `min-height: 40px` on coarse pointers only (`pointer: coarse`).
- **Suggested command**: `/impeccable adapt`

### [P2] Loading and empty transitions are invisible to screen readers
- **Location**: `MapTab.tsx` L1137 (`<span className="small muted">{loadingPois ? 'searching…' : …}</span>`), L1244 (empty state gated on `!loadingPois`); **zero `aria-live` regions in the file**.
- **Category**: Accessibility (WCAG 4.1.3 Status Messages)
- **Impact**: a corridor re-scan takes seconds (16-POI + city search); non-sighted users get no announcement that results are being replaced — the panel content just swaps.
- **Recommendation**: put `aria-live="polite"` on the count/status span (announces "searching…" then the new count); keep the visual text as-is.
- **Suggested command**: `/impeccable polish`

### [P2] The clock layer's facts are hover-only (carried from the critique)
- **Location**: `TripMap.tsx` `ClockGlyphs` — `MapLibre.Popup` tooltips, `closeButton: false`, no focus target; glyphs are `aria-hidden` spans; arrival chips are bare times.
- **Category**: Accessibility (WCAG 1.4.13 Content on Hover or Focus)
- **Impact**: keyboard/touch users see circles and a moon but none of the times or the radius meaning.
- **Recommendation**: `aria-label` on each glyph marker; a labelled arrival chip at ≥360px; a legend row in the existing `Key`.
- **Suggested command**: `/impeccable polish`

### [P3] Detour-budget split recomputes on every render
- **Location**: `MapTab.tsx` L763–786 — `budgetHeldIds`/`splitByDetourBudget` run in the component body, not a `useMemo`.
- **Category**: Performance
- **Impact**: small (bounded POI pool), but it re-runs on every keystroke/shortlist toggle alongside the memoised neighbours.
- **Recommendation**: wrap in `useMemo([needsByDay, trip.travelStyle, …])`.
- **Suggested command**: `/impeccable optimize`

### [P3] `var(--text-1)` is undefined (the `--muted` bug class, adjacent surface)
- **Location**: `styles.css` L1402 — `.board-col-day { … color: var(--text-1) }` (Board view, not the map rails). Same class as the fixed `--muted`: the v0.53.0 scale sweep left a dangling reference; the token list check also flags `--surface`/`--accent` (both unused in the rails).
- **Category**: Theming / Implementation Integrity
- **Recommendation**: `--text-1` → `--text`; add a CI grep for used-but-undefined `var(--*)` tokens so this class dies permanently.
- **Suggested command**: `/impeccable harden`

## Patterns & Systemic Issues
- **Undefined-token class**: `--muted` (fixed this branch) and `--text-1` (still live) are both references to tokens the v0.53.0 scale sweep deleted. One grep in CI (`var(--x)` used vs `--x:` defined, minus runtime-injected names) kills the class.
- **Small chip hit-areas**: every map toolbar control shares the 25px `map-day-chip` recipe — fix the class once, fix all ~8.

## Positive Findings
- **Detector-clean** on a 1,482-line component is rare — the #182 remediation holds.
- Fold semantics are correct and complete (`aria-expanded` + `aria-controls` pairs).
- The contrast ratchet means rail text AA is *mechanically enforced*, not aspirational.
- Honest states everywhere: quota-out, "Rough estimate", held-back rows — the panel never lies.

## Recommended Actions
1. **[P2] `/impeccable adapt`**: 40px hit-areas for the map toolbar chip family.
2. **[P2] `/impeccable polish`**: `aria-live` on the scan status; labelled clock facts.
3. **[P3] `/impeccable optimize`**: memoise the detour-budget split.
4. **[P3] `/impeccable harden`**: `--text-1` fix + used-vs-defined token CI check.
5. **[P2] `/impeccable polish`**: final pass over the above together.

