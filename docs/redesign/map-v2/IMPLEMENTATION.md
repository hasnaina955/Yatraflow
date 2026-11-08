# Map workspace UI

The map is a full canvas behind a timed day list, one search and a pick panel. The panels fold without clearing their contents. Place details use the existing add dialog and impact preview. The UI does not own ranking, placement or acknowledged writes.

The supplied six HTML boards in the MapTab redesign folder are the visual target. The current UI implements their workspace composition. The Map workspace uses authored Linen and Night paint on the existing OpenFreeMap vector tiles. The user approved the revised day palette, and the six changed tones of the seven are in use. The existing 2D behavior is retained. New elevation changes and full visual acceptance remain unapproved. It does not claim complete visual acceptance of all six boards.

## Data and interaction

The itinerary and journey clock read `buildJourney` with the workspace's leg corrections. The clock keeps midnight crossings on one time axis. The clock holds the stop's position throughout a visit. Between stops it can follow supplied ground geometry. Missing, estimated or air geometry does not produce a precise road cursor.

**Journey clock interaction (local checkpoint).** Pure helpers in `src/lib/mapJourneyRibbon.ts` hold the scrub, keyboard and reset rules. The clock scrubs absolute minutes across midnight and resets on a new trip or day. Only measured road or stop facts move the camera; an estimated leg keeps the real stop mark. The phone sheet handle uses one gesture module in `src/lib/mapSheetGesture.ts`. A keyboard snap moves focus to the visible sheet panel, and a pointer snap keeps focus on the handle. Next-day clock, day-change reset, offscreen reveal, estimate-only copy and native gestures remain unrun.

The day list and phone day switcher share the workspace day focus. The suggestion panel retains the current day-part and extra-pick paths. Select a place to open its details. The Add action still uses the existing day choice and preview flow. Viewer mode has no Add or Shortlist action in the detail card.

The phone sheet has peek, half and full heights. Its handle supports pointer movement, activation and arrow keys. Search and the planning switcher share one row. The switcher drops to its own row inside the search card for typed text. It does the same for Clear, a busy search and a paused search. A narrow phone with a folded deck does the same. Escape closes the place card and restores focus. The ribbon sits above the sheet. Map tools opens the zoom and layer controls on phones. The canvas uses the space below the workspace header. Map camera padding reserves space for floating controls and clamps large insets to retain usable map space.

The Map workspace uses 32-pixel numbered stops and 36-pixel house marks for stays. A lock badge follows a stop's fixed commitment on its trip day. Tentative stops have a dashed ring. Suggested places use 30-pixel tiles, with a 40-pixel selected tile. The visual key explains existing marks and road estimates. Close or Escape restores focus to the key control. Other map surfaces retain their current marks. The approved day palette is in use.

The authored basemaps use the source land, water, green, road and label colours. The versioned style objects live in `src/lib/workspaceMapStyles.ts`. These are new styles, not the missing JSON files claimed by the source document. Vector data and Noto glyphs use the existing keyless provider. The vector TileJSON supplies attribution. Basemap place icons are absent. Minor roads start at zoom 12. The current 2D, Terrain and 3D behavior remains in place. A failed map source keeps the background, trip stops and route estimates. Its status offers a manual retry. These local styles await full visual acceptance. An app-level browser check of the day palette stays unrun. A style-load crash in the map component blocked it. The same batch fixes that crash at source, and the browser check is still pending. No app browser proof exists yet.

**The day plan and its writers (#841).** The rail, the comparison, the vote and Fill the day read one effective day plan per day. Each slot carries a stable trip, day and slot identity. A renamed or reordered day keeps its choices. The writers share one road-order policy. A proposed stop inserts before its measured endpoint. An unmeasured road refuses with a reason. A keep reports success only on a checked receipt and verified stops. The resolved vote lands through the `submit_collab_command` transition with ordered placement. Migration `20261026a` must be applied on the shared backend before the ordered landing serves a live trip.

**The shared journey projection (#08).** The Map is the one corridor publisher and refreshes its snapshot as facts change. The workspace derives every day's slots, plan, drive rows and shared rows from it. The Map and Timeline read the same covered suggestion rows, so identity, cost and time agree. Manual picks use one shared manual-pick read adapter and one pure builder. Current schedules supply arrivals; a stored label is marked saved. A missing fact stays unknown and a known zero stays zero. Every change keeps the existing impact preview and acknowledged Keep path. One drive assembly and one upstream detour feed the rail, card, marker and Timeline. AC5 is met in the local code. A place's confirmed visit length drives fit, card, add, vote draft and slack. Explicit overrides and incomplete or non-family fallbacks stay unchanged.

**Net added minutes (#08 AC2).** `src/lib/netAddedMin.ts` is the one producer. A candidate's net added minutes are the change in the day's total road and stop time when that place is inserted into its day. The module re-simulates the existing engine and impact function for that insert, so the number equals the impact preview's own `timeDeltaMin`. Unknown inputs stay null: no day, no proven insert position, no usable coordinate or no finite visit length. A known zero visit length stays a number. One memoised producer serves each trip and day, so a repeat render costs nothing. The projection reads it through one optional `netAdded` seam. No Map or Timeline caller supplies the seam yet, so every row reads null in the app today.

Ticket 08 remains partial on the wiring for net added minutes; ticket 09 remains partial with no family-query caller. Focused local checks are green: 19 test files and 351 tests, both typechecks, ratchet, STE, CSS, UI and diff. Freshness stays unknown until #842. Ticket 11 stays off by default with AC6 unapproved, and the #841 live SQL gates remain open.

## Local fixture

Run `node node_modules/vite/bin/vite.js --config vite.map-fixture.config.ts` from the repository root. Open `http://127.0.0.1:5211/dev/map-workspace-fixture.html`.

The fixture renders the actual Map tab, map renderer and engine. A development-only resolver replaces the provider facade's discovery calls with synthetic results. Its write callback records a preview request and does not change a trip. The normal application build does not use this config.

Use `theme=dark`, `role=viewer` or `state=empty`, `state=failed`, `state=quota` as query parameters. The quota case uses the real Google pause error class. Public map tiles and the MapLibre worker need network access. Block unrelated requests before opening the fixture during verification.

These checks do not prove provider performance, hosted persistence, server acknowledgement, RLS, concurrency or native gestures. Use the existing live-acceptance gates for those claims.

## Remaining work

The shared Map and Timeline suggestion model is locally integrated. The Around Stay, Gap and Fix lenses retain their approved dependencies and policy gates. Provider photos, live-position changes and advanced map edits also retain their gates. The two current planning controls do not add those four future lenses. The combined gate and live acceptance remain parent-owned.

Coordinate the final phone acceptance with the phone lane before integration. The root phone checkout and its shared files were not edited by this UI pass.
