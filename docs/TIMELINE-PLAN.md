# YatraFlow — Timeline restructure: implementation plan

**Companion to `TIMELINE-MOCKUPS.html`** (the three visual proposals + build-order table).
This document is the *implementation* plan: what to build, in what order, touching which
files, with acceptance criteria. The mockups are approved (user, 2026-09-11).

> **Updated 2026-09-11 after a full code audit of the plan's claims** (branch
> `feat/timeline-day-summary`). Facts corrected, the three open decisions are signed off
> (see §6), and Phase 1's design was tightened: the summary row is the *enhanced collapsed
> header inside `DaySection`*, not a separate swapped-in component — this keeps the
> `day-card-${index}` id that `jumpToDay` scrolls to and avoids duplicating the 19-prop
> signature.

## 0. Verified current state (audited against the tree)
- `src/pages/trip/TimelineTab.tsx` — **1,289 lines**, **16 `useState`** (+1 `useRef`), `DaySection`
  has **19 props** (defined React.memo at 384).
- **Per-day collapse already ships**: `loadDayCollapsed` / `saveDayCollapsed` in
  `src/lib/uiPrefs.ts`, keyed `tripId:dayIndex` in `localStorage` (`yatraflow_day_collapsed`),
  default **expanded** for unknown days; toggle at `TimelineTab.tsx:442-449`. The only new
  behaviour is the *default flip* + accordion + a richer summary row.
- **A "day rail" already exists** — the horizontal "Jump to day" chip strip
  (`TimelineTab.tsx:275-289`, `.day-rail` in `styles.css`, ≥4 days, warn chips, `scrollIntoView`).
  The collapsed summary rows are therefore **`DaySummaryRow` content inside `DaySection`**, not
  a second "rail" — and the jump chips should open the day they scroll to.
- **The collapsed day header already shows**: route line (start → end, km, drive time, halts,
  visits, start/ends times), day-progress bar, top-warning pill (`sev-*`), and `DaySpark`.
  Hidden while collapsed: weather chip, cost/dwell chips, and the whole body (commitments,
  warning cards, `TravelPanel`, suggestions, stop rows). Phase 1 adds the stop-name route
  chain, the amber busiest-stop bar, the stay-day dimmed variant and kind tags.
- Inside `TimelineTab.tsx`: `DaySection` (384), `TravelPanel` (815 — the *unified* travel
  panel; its docstring records that a previous split `LongRidePanel` was deliberately
  unified), `HaltPlanRow` (1202), `DaySpark` (1239), `MoveStopModal` (1267).
- Warnings already computed: `dayWarnings` (`useMemo` in `TimelineTab`, line 165) ←
  `collectWarnings(trip)` in `src/lib/engine.ts` (571), typed `ScheduleWarning[]`. Surfaced to
  `DaySection` at line 304. Fatigue gating is **minutes-based** (420 min), not km; km cadence
  constants live in `ridePlan.ts` (90–550 km).
- "Continue to X" (612) and nearby-POI chips (615) render inline inside `DaySection`.
- **Memoization discipline is load-bearing**: `DaySection` is `React.memo`, `NO_WARNINGS`
  keeps prop identity stable, handlers are `useCallback`-stable (file comments at 46-48 /
  87-93 / 380-383 warn against regressing this). Any state lift must keep the props passed to
  `DaySection` referentially stable.
- Tests run in the **node environment only** (no jsdom anywhere in the repo) — "integration"
  tests must be written as pure-logic tests of extracted helpers, mirroring
  `tests/uiPrefs.test.ts` ("Node env: no localStorage. That's deliberate.").
- `content-visibility: auto` exists only on Landing sections (`styles.css:1417-1419`);
  timeline days have no render containment.

## 1. Goal / non-goals
**Goal:** make the Timeline tab readable *and* editable for a multi-day trip without six walls
of UI rendering at once.
**Non-goals this round:** no data-model change (`days` JSONB, `orderInDay`, `dayIndex` stay);
no change to the impact-preview / Keep-Remove flow; no Board changes; **do not regress the
reorder echo fix on `main`** (`markLocalWrite` arm before persist + the v0.50.0 `updateTrip`
reconcile fix; guarded by `tests/realtime-echo-window.test.ts`, `tests/board-reorder.test.ts`,
`tests/reconcile-days.test.ts`).

## 2. Proposals (recap — visuals in the mockup)
- **P1 Day rail** — days collapsed by default; one scannable summary row each; click opens the one day you're working on.
- **P2 Plan/Inspect split** — same data, two modes; editing tools hidden in Inspect.
- **P3 Evict specialist tools** — halt planner + "Continue to X" + nearby chips → one collapsed "Long-ride tools" panel, km-ordered, only when a day's drive > 100 km.

## 3. Phased build — cheapest-first, each phase independently shippable & reversible

### Phase 1 — Collapsed accordion + summary rows (P1)  ← **this branch**
Why first: ~80% of the perceived complexity; small; collapse machinery already exists; fully
reversible. (Reassess P3's premise after this ships — collapsed-by-default already hides the
specialist tools inside the one open day.)

**New files**
- `src/lib/daySummary.ts` — **pure** helpers (node-testable, no DOM/React):
  - `routeChain(day)` → visible stop names joined by `→` (rejected stops excluded, `orderInDay` order).
  - `busiestStop(stops)` → the stop with the largest dwell — drives the amber bar.
  - `stayDaySummary(day)` → dimmed stay-day line ("No driving today · free morning").

**Modified**
- `uiPrefs.ts` — add `loadOpenDay(tripId)` / `saveOpenDay(tripId, index | -1)` backed by a new
  `yatraflow_open_day` key (tripId → open index, **-1 = all collapsed**). The old
  `yatraflow_day_collapsed` map is retired from active use (its per-day booleans are
  meaningless under an accordion); functions stay exported for compatibility.
- `TimelineTab.tsx` — owns `openIndex` state (init `loadOpenDay(trip.id)`, default -1);
  stable `openDay` / `closeDay` callbacks passed down; `jumpToDay(i)` now opens day `i`
  before scrolling.
- `DaySection` — internal `collapsed` `useState` replaced by controlled `open` + `onToggleOpen`
  props (accordion). Collapsed header becomes the summary row: existing stats/progress/warn
  pill/spark stay; add route chain, busiest-stop bar, stay-day dim, `drive day`/`stay day`
  kind tag. `Copy` / `+ Add here` remain in the header. `aria-expanded` preserved.

**Steps**
1. uiPrefs open-day API + tests.
2. `daySummary.ts` helpers + tests.
3. Lift state to `TimelineTab`, convert `DaySection` to controlled `open`.
4. Summary-row UI in the collapsed header per mockup P1 (kind tag, route chain, amber busiest
   segment, dimmed stay day). Click row → expand that day (accordion: siblings collapse).
5. Jump rail: chip click → open + scroll.
6. Legs already compress to one line; align copy to `"12 km · 28 min"`.

**Acceptance**
- Fresh load of the seed 6-day trip → 6 collapsed summary rows, no expanded day.
- Click a row → only it expands; siblings collapse; the open index survives reload.
- Row shows route chain, stats, spark, and any real `ScheduleWarning` (seed Day 5
  "over-packed", Day 2 closing-time).
- Drag-reorder inside the expanded day still works (regression gate: `realtime-echo-window`
  + `board-reorder` tests green).

**Risk:** low; reversible by restoring the old default (open-day read falls back to -1 → all
collapsed; flip the initial value to "all open" to undo).

### Phase 2 — Evict specialist tools (P3)  ← **reassess after Phase 1 ships**
Why: removes the inline halt planner + chips from every day. **Signed off: per-drive-day
mount; 100 km threshold.** Note `TravelPanel`'s docstring: a previous split (`LongRidePanel`)
was deliberately unified — Phase 2 re-splits *tools only* (stats card stays), which is
coherent once days are collapsed by default, but must justify itself against Phase 1's result.

**New file**
- `LongRideToolsPanel` — wraps the halt planner + "Continue to X" + nearby chips behind a
  collapsible header, mounted **inside each drive day whose drive exceeds 100 km** (new
  constant, neighbours: `MIN_PLANNED_DRIVE_KM = 90`, `MIN_BREAK_GAP_KM = 110`). A stay day
  never shows it.

**Modified**
- `TimelineTab.tsx` / `DaySection` — remove inline `TravelPanel` tools + "Continue to X"
  (608–614) + nearby chips (615–617) from the day body; render `LongRideToolsPanel` instead.

**Steps**
1. Extract those three blocks, preserving callbacks (`onSetDayStart`, `onAddPlannedHalts`,
   `onAddQuickStop`, `suggestionCache`, `nextAnchor`, `nearby`). Lift the per-`DaySection`
   `nearby` `useState` (452) into the panel.
2. km-ordering: `HaltPlanRow` is already ordered by distance — preserve.
3. Panel dismiss state via existing `loadRideHintsHidden` / `saveRideHintsHidden` (uiPrefs).

**Acceptance**
- Munnar base-camp (stay) day → no long-ride panel.
- Drive day > 100 km → collapsed "Long-ride tools" header; expanding shows the km-ordered
  halt list + Continue-to + nearby, behaviour-identical to today.
- No change to what halts get added (impact preview still fires via `onAddPlannedHalts` →
  `applyChange`).

**Risk:** low; a move, not a rewrite.

### Phase 3 — Plan / Inspect split (P2) + file split  ← **do last**
Why last: needs P1+P2 so there are clean "editing" vs "studying" surfaces to toggle; and it is
the moment to break the 1,289-line file. **Lean on the existing `editable` seam**
(`canEdit(role)` → `editable` prop flows through `TripWorkspace.tsx:97`): Inspect is close to
today's viewer rendering, so build `DayInspectView` on that path rather than inventing a
parallel read-only mode.

**New files** (`src/pages/trip/timeline/`)
- `TimelineTab.tsx` (shell, < ~200 lines) → imports the modules below.
- `DaySection.tsx` — the **editing** view (today's expanded day, minus the evicted tools).
- `DayInspectView.tsx` — **read-only** dense view (clocks, fuel, per-leg cost, opening-hours
  risk, warnings, `DaySpark`, weather).
- `useTimelineMode.ts` — `Plan | Inspect` mode state, persisted via `loadFlag` / `saveFlag`
  (`timeline_mode`).
- `TravelPanel.tsx`, `HaltPlanRow.tsx`, `DaySpark.tsx`, `LongRideToolsPanel.tsx`,
  `MoveStopModal.tsx` — extracted from the monolith.

**Steps**
1. Mode toggle where the collapse controls live today; persist per user (localStorage flag).
2. **Plan** mode = current editing Timeline (accordion + expanded `DaySection` with
   edit/delete/drag/add). **Inspect** mode = `DayInspectView`, read-only: no drag handles,
   delete buttons, add zones, or impact sheet. Nothing the Timeline shows today is dropped.
3. Extract components out of the monolith (nearly free now that P1/P3 already isolated the
   summary row / long-ride panel). Both views consume the same `day`, `trip`, `journey`,
   `dayTotals`, `dayWarnings`.
4. Keep `useReorder` drag **only in Plan mode** (Inspect is read-only by design).

**Acceptance**
- Toggle switches the whole Timeline between editing and studying; persists across reload.
- Inspect shows all info the Timeline has today and has zero editable affordances (no
  fat-finger deletes while reading).
- File < ~400 lines per module; `TimelineTab.tsx` shell < ~200 lines.

**Risk:** medium — prop threading across new modules; keep `DaySection`'s 19-prop signature as
the shared contract during the split to avoid behaviour changes.

## 4. Testing
- **Unit:** `daySummary` helpers (route chain, busiest stop, stay-day text) and the uiPrefs
  open-day API — pure, node-testable (mirror `parseDayCollapseMap` style in uiPrefs).
- **Logic integration:** accordion reducer / open-day semantics as pure functions (node env —
  there is no jsdom in this repo, so DOM render tests are out; assert state semantics instead).
- **Regression:** drag-reorder + Keep/Remove impact flow must still pass — reuse
  `tests/realtime-echo-window.test.ts`, `tests/board-reorder.test.ts`,
  `tests/reconcile-days.test.ts`.
- **Negative-control:** accordion test asserts opening Day 2 collapses Day 1 (fails if state
  isn't lifted).

## 5. Rollout
- Each phase on its own feature branch → PR to `test` (repo ladder: local → `test` → `main`).
- Phase 1 can ship alone; Phase 2/3 follow.
- **No `main` push without explicit confirmation** (APK builds on `main` merge).

## 6. Decisions — SIGNED OFF (user, 2026-09-11)
1. **Accordion** — one day open at a time (mockup frame B; persisted as a single open index
   per trip). ✅
2. **Long-ride panel mount** — per-drive-day inline, inside each long drive day. ✅
3. **Drive-day threshold** — 100 km confirmed. ✅
