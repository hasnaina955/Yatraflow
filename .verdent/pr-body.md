## Summary

Brings the full Calm Travel Intelligence (CTI) redesign from `redesign/calm-travel-intelligence` into `test` — 46 commits culminating in the v0.24.0 release bump.

**What's included**
- **Design-token foundation + landing/workspace rebuild (M1-M3)** — `--yf-*` palette, atmospheric canvas + glass utilities, split landing hero with product-preview card, Bento Overview trip briefing, floating glass-pill topnav, navy workspace header band
- **Timeline polish (M4)** — sticky trip-total strip, day-jump rail, warning state inside affected days, stop-type markers (`stopKindOf`)
- **Board view (M5 + iterations)** — kanban-style Board tab over the pinned route map: cross-day + same-day drag-and-drop (HTML5 + touchDnd), premium insertion-marker drag with single FLIP settle, Trip Pulse glass panel, map-focus peek mode, map-first column layout
- **Budget/Decisions/Share/Suggestions hierarchy pass (M6)** — navy budget hero card, decisions stat strip + filter chips + next-to-unblock, numbered intent tags on Share cards, Best-fit badge
- **Explore + Public Itinerary editorial treatment (M7)** — dark-teal discovery hero, featured itineraries, fork/save CTAs (localStorage-backed), editorial public-itinerary story with route-at-a-glance
- **Motion system** — shared easing/duration tokens, tab-panel + route transitions, staggered entrances, View Transitions theme radiate (with glass-backdrop suppression), My-Trips card cascade, ~30% slower pacing for the calm feel
- **CTI polish pass** — glass-pill dropdowns, floating sticky nav, segmented Decisions filter bar, budget bar sheen, two-column colour-coded map suggestion lanes
- **Docs** — `DESIGN_TOKENS.md`, `docs/redesign/ALIGNMENT.md` tracker, design direction + 10 mockups, AGENTS.md lessons (VT/glass snapshot pitfalls, drag/FLIP conflicts, Verdent workspace resume)

## Verification

- Full `npm run verify` gate green on `aed2827` (release commit): clean typecheck, 218/218 tests, production build with no minify warnings
- Engine/store/Supabase untouched by the redesign — pure UI/CSS + minimal JSX; drag paths keep the mandatory HTML5 + touchDnd pair
- Version: `package.json` + lockfile at 0.24.0; CHANGELOG has the full versioned `## [0.24.0]` section; README documents Board view + editorial Explore
