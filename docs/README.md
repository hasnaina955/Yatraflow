# YatraFlow Docs

Start here. The codebase is documented across the files below — read the ones relevant to your task.

| Doc | What's in it |
|---|---|
| [`README.md`](../README.md) | Project overview, features, MVP scope, roadmap, quick start. The front door. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the pieces fit: data model, store, engine math, AI, geocoding, routing, maps, theming, extension points, gotchas. Read before changing core logic. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Supabase setup, Vercel + other static hosts, env vars, release checklist. |
| [`DESIGN_TOKENS.md`](../DESIGN_TOKENS.md) | The 3-layer design-token system (primitive → semantic → component) and the button/input state matrix. |
| [`USER_GUIDE.md`](USER_GUIDE.md) | End-user how-to: planning a trip, the timeline, map, budget, sharing. |
| [`UI_AUDIT.md`](UI_AUDIT.md) | Full UI audit (2026-09-01, v0.22.0): 32 findings vs the Vercel Web Interface Guidelines — file:line references, severity, and an example fix for every finding, plus a 6-batch fix roadmap. |
| [`UI-PAGE-AUDIT.md`](UI-PAGE-AUDIT.md) | Design-system *consistency* audit (2026-09-12, v0.50.2): page-by-page pass (19 pages · 20 overlays · 20 selects) against the token/motion system, with computed WCAG values and `file:line`. Diagnostic only — the fix list is **[issue #107](https://github.com/hasnaina955/Yatraflow/issues/107)**. Complements (does not replace) `UI_AUDIT.md`; line cites have drifted since v0.52.0 — re-locate by selector. |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Setup + ground rules for contributors. |
| [`AGENTS.md`](../AGENTS.md) | Operating manual for AI coding agents (Cline/Hermes). **Read fully before automating any change here.** Includes the documentation protocol (§6). |
| [`ROADMAP.md`](../ROADMAP.md) | **Single plan of record**: open issues, stabilization + strategic milestone tracks, UI-audit tracker, and the **idea bank** (all unbuilt ideas, tiered by readiness). |
| [`PLAN-INVITES-ONBOARDING.md`](PLAN-INVITES-ONBOARDING.md) | Execution playbook for the M9 invites & onboarding milestone (creator invites → referral → invite-only gate). The *how* under ROADMAP's *what/when*. |
| [`FEATURE-REQUEST-MAP-VIEWS.md`](FEATURE-REQUEST-MAP-VIEWS.md) | Feature request (explanation): three map view modes — 2D on Liberty (the new default), Terrain (hillshade relief), 3D hero (pitched terrain) — with a code-grounded implementation sketch, verified keyless endpoints, acceptance criteria and the open decisions. The *how* under ROADMAP idea-bank rows I-17–I-19. **Shipped together with this document** (Board 2D-only; global persistence; stock dark style). |
| [`MAP-MOCKUPS.html`](MAP-MOCKUPS.html) | Visual prototype (reference) for the map view modes: eight live MapLibre panels over the Kerala demo route's real OSRM geometry. Panels 4 / 6 / 7 are the three requested modes; 5 and 8 show the brand recolour in light and dark. |
| [`TIMELINE-PLAN.md`](TIMELINE-PLAN.md) | Implementation plan (how-to) for the Timeline restructure — Day-rail collapse → evict specialist tools → Plan/Inspect split + `src/components/timeline/*` file split. Planning only; three decisions await sign-off. |
| [`TIMELINE-MOCKUPS.html`](TIMELINE-MOCKUPS.html) | Visual prototype (reference) for the Timeline restructure, rendered in YatraFlow's design tokens. |
| [`history/implementation-plan-v0.23.0-cti.md`](history/implementation-plan-v0.23.0-cti.md) | ⚠️ HISTORICAL decision record — the executed v0.23.0 + CTI redesign plan (all milestones shipped). |
| [`history/CHANGELOG-through-0.41.1.md`](history/CHANGELOG-through-0.41.1.md) | ⚠️ HISTORICAL archive — releases `0.1.0`–`0.41.1`, recovered after the v0.42.0 cleanup truncated the live changelog. See [`history/README.md`](history/README.md). |
| [`REPORT-2026-08-29-nearby-rework-and-google-maps.md`](REPORT-2026-08-29-nearby-rework-and-google-maps.md) | ⚠️ HISTORICAL design record (shipped in 0.17.0). Decision log, not live guidance. |

## Diagrams
- [`diagrams/yatraflow-architecture.json`](diagrams/yatraflow-architecture.json) — hand-authored source of the architecture diagram; the generated `.html` is gitignored (regenerate from the JSON, don't hand-edit).

## Changelog
- [`CHANGELOG.md`](../CHANGELOG.md) — every notable change, Keep-a-Changelog style.
