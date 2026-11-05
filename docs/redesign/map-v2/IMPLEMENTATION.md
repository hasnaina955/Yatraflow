# Map workspace UI

The map is a full canvas behind a timed day list, one search and a pick panel. The panels fold without clearing their contents. Place details use the existing add dialog and impact preview. The UI does not own ranking, placement or acknowledged writes.

The supplied six HTML boards in the MapTab redesign folder are the visual target. The current UI implements their workspace composition. The Map workspace uses authored Linen and Night paint on the existing OpenFreeMap vector tiles. Day-colour approval and the 2D elevation decision remain open. It does not claim complete visual acceptance of all six boards.

## Data and interaction

The itinerary and journey clock read `buildJourney` with the workspace's leg corrections. The clock keeps midnight crossings on one time axis. The clock holds the stop's position throughout a visit. Between stops it can follow supplied ground geometry. Missing, estimated or air geometry does not produce a precise road cursor.

The day list and phone day switcher share the workspace day focus. The suggestion panel retains the current day-part and extra-pick paths. Select a place to open its details. The Add action still uses the existing day choice and preview flow. Viewer mode has no Add or Shortlist action in the detail card.

The phone sheet has peek, half and full heights. Its handle supports pointer movement, activation and arrow keys. Search and the planning switcher share one row. The switcher drops to its own row inside the search card when text, Clear, a busy or paused search, or a narrow folded deck needs the width. Escape closes the place card and restores focus. The ribbon sits above the sheet. Map tools opens the zoom and layer controls on phones. The canvas uses the space below the workspace header. Map camera padding reserves space for floating controls and clamps large insets to retain usable map space.

The Map workspace uses 32-pixel numbered stops and 36-pixel house marks for stays. A lock badge follows a stop's fixed commitment on its trip day. Tentative stops have a dashed ring. Suggested places use 30-pixel tiles, with a 40-pixel selected tile. The visual key explains existing marks and road estimates. Close or Escape restores focus to the key control. Other map surfaces retain their current marks. The current day palette remains in use.

The authored basemaps use the source land, water, green, road and label colours. The versioned style objects live in `src/lib/workspaceMapStyles.ts`. These are new styles, not the missing JSON files claimed by the source document. Vector data and Noto glyphs use the existing keyless provider. The vector TileJSON supplies attribution. Basemap place icons are absent. Minor roads start at zoom 12. The current 2D, Terrain and 3D behavior remains in place. A failed map source keeps the background, trip stops and route estimates. Its status offers a manual retry. These local styles await full visual acceptance.

## Local fixture

Run `node node_modules/vite/bin/vite.js --config vite.map-fixture.config.ts` from the repository root. Open `http://127.0.0.1:5211/dev/map-workspace-fixture.html`.

The fixture renders the actual Map tab, map renderer and engine. A development-only resolver replaces the provider facade's discovery calls with synthetic results. Its write callback records a preview request and does not change a trip. The normal application build does not use this config.

Use `theme=dark`, `role=viewer` or `state=empty`, `state=failed`, `state=quota` as query parameters. The quota case uses the real Google pause error class. Public map tiles and the MapLibre worker need network access. Block unrelated requests before opening the fixture during verification.

These checks do not prove provider performance, hosted persistence, server acknowledgement, RLS, concurrency or native gestures. Use the existing live-acceptance gates for those claims.

## Remaining work

The shared Map and Timeline suggestion model still needs the reserved owner handoffs. The Around Stay, Gap and Fix lenses retain their approved dependencies and policy gates. Provider photos, live-position changes and advanced map edits also retain their gates. The two current planning controls do not add those four future lenses.

Coordinate the final phone acceptance with the phone lane before integration. The root phone checkout and its shared files were not edited by this UI pass.
