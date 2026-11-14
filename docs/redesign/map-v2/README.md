# Map tab v2: boards and basemap styles (5 Nov 2026)

The visual target for the Map tab v2 build. The spec is the Claude doc "Map tab v2 · flagship map and suggestion engine". It covers the engine, the lenses, the ranking and the build plan. The boards are on the redesign canvas, to the right of Surface palette.

| File | What it is |
|---|---|
| [`yatraflow-linen.json`](../../../src/lib/mapStyles/yatraflow-linen.json) | MapLibre style for the Linen (day) basemap |
| [`yatraflow-night.json`](../../../src/lib/mapStyles/yatraflow-night.json) | MapLibre style for the Night sky basemap |
| `boards/MapV2Drive.png` | Desktop · Along the drive lens, lunch gap open, pick deck |
| `boards/MapV2Night.png` | Desktop · Fix lens in Night sky, with three previewed fixes |
| `boards/MapV2Stay.png` | Desktop · Around the stay lens, walk and drive rings, place card |
| `boards/MapV2Add.png` | Desktop · add a pick (ghost route, re-timed ribbon, honest preview), stop card, Undo toast, omnibar results |
| `boards/MapV2Phone.png` | Phone 390 · peek, place card at half, Night sky around the stay |
| `boards/MapV2Language.png` | Every map mark in both themes, plus the lens pill |

## The styles

Both styles are built from OpenFreeMap Liberty and use the same free, keyless sources the app already uses:

- vector tiles from `tiles.openfreemap.org/planet`
- glyphs and sprite from OpenFreeMap
- a `dem` raster-dem source on AWS terrarium tiles

The changes from Liberty:

- **Recoloured by layer id** to the palette in the spec's Basemap table.
- **Hidden:** POIs, airports, shields, one-way arrows, the road area pattern, 3D buildings and park outlines.
- **Removed:** the `natural_earth` raster.
- **Added:** a `hillshade` layer before `water`, with exaggeration 0.45 and illumination 315.

Night water was raised to `#13314A`, with lines `#1B4562`. The spec's `#0E2733` was nearly invisible on `#0F1928` land.

Suggested home: `src/lib/mapStyles/` beside `mapViewModes.ts`, chosen by theme. Keep `blankMapStyle` as the fallback when tiles fail. The app draws the route, corridor, gaps and picks on top; they are not part of these files.

- **Terrain mode** raises the hillshade exaggeration.
- **3D mode** adds `setTerrain({ source: 'dem', exaggeration: 1.3 })` and a sky. The boards use pitch 30–40.

## How the board maps were made

The board maps are real MapLibre 4.7.1 renders of these styles:

- **Roads:** OSRM. Munnar to Kumily measures 83.3 km and 92 min at free-flow speed.
- **Corridor:** a 3 km turf buffer.
- **Marks:** HTML placed from `map.project()` pixels.

The trip and places are sample data. The day colour is Day 3's `#7C5CFC` from `TripMap.tsx` DAY_COLORS.

## Build notes (branch copy)

`src/lib/mapStyles/` holds the two JSON styles. Tests validate these runtime files.

- **Source of the styles:** the supplied JSON files are the target. The earlier note that the JSON was absent no longer applies. The app no longer builds a short original style.
- **2D (default):** the supplied style as drawn, flat, with the `hillshade` layer at exaggeration 0.45.
- **Terrain mode:** raises the same `hillshade` layer. No second DEM source is added.
- **3D mode:** `setTerrain({ source: 'dem', exaggeration: 1.3 })` plus a sky. Leaving 3D removes both.
- **Attribution:** the app adds the AWS Terrain Tiles credit to the `dem` source. The vector credit still comes from the OpenFreeMap TileJSON.
- **Fallback:** if tiles fail, the status banner and retry stay. The land colour stays and the route is still drawn.
