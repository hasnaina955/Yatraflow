# Feature request — map view modes (2D · Terrain · 3D hero)

**Status:** **shipped** — the Liberty default, the Terrain and 3D hero modes, and the switcher
landed together with this document. Requested 2026-09-12.
**Resolved open questions:** the Board is 2D-only (§2.4) — a pinned backdrop must not spend GPU
on terrain, and it has no toolbar to host the switcher; persistence is **global**, not per trip
(§2.6); dark theme keeps the stock dark style, option 1 as recommended (§2.7). 3D still does not
auto-expand (§5) — deliberately left open. The one carried risk is the mid-range-Android GPU
check (§5), a post-merge device step.
**Prototype:** [`MAP-MOCKUPS.html`](MAP-MOCKUPS.html) — the three proposed modes are **panels 4, 6 and 7**
(open it in a browser; every panel is a live map on real keyless tiles).
**Detail under:** the ROADMAP `## Idea bank` rows **I-17 / I-18 / I-19**, which are the plan of record
for *what/when*; this file is the *how*. No competing plan file is intended.

---

## 1. What's being asked

Three first-class map view modes, plus a change of the default basemap:

| Mode | Basemap | What the user sees |
|---|---|---|
| **2D** — default | **Liberty** | today's behaviour, in the new palette |
| **Terrain** | Liberty + hillshade | the same flat map, with relief shading |
| **3D hero** | Liberty + terrain | pitched camera over real elevation |

The mode switcher is an **optional control in the map toolbar** — the map still opens in 2D for everyone
who never touches it. All three modes share **one palette** (Liberty), so switching modes changes the
camera and the relief, **not the colours** — that is deliberate, and is the reason the request pairs the
Liberty default with the 3D view.

### 1.1 Default basemap: positron → Liberty

`src/components/mapcn/map.tsx:68` holds the basemaps:

```ts
const defaultStyles = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
};
```

`TripMap` passes **no** `styles` prop, so every map in the app is on these defaults today. Changing
`light` to `.../liberty` therefore changes every map in one line — the wrapper already accepts either a
style URL or an inline `StyleSpecification` (plus a `blank` prop), so nothing else needs to move.

**Why Liberty.** Positron is deliberately grey so overlays carry the colour; the product now leans on the
map to sell the trip (routes, day colours, nearby ideas). Liberty is the OSM-carto lineage: cream land,
vivid water, a real place hierarchy, and named roads at trip zoom — it reads like a travel atlas. It is
also the closest stock style to the brand's warm palette, which keeps the teal/saffron overlays legible
on top of it. See panels 1 (today) vs 4 (Liberty) in the prototype for the direct comparison.

### 1.2 Terrain mode — hillshade

A **flat** map with relief shading: one `raster-dem` source plus one `hillshade` layer. No camera change,
no gesture change, cheap on the GPU, and it works in both themes. This is the "the hills are real"
signal at a glance — on the demo route it turns the Kochi→Munnar climb from a blue line into a legible
ascent.

**It genuinely fills a gap rather than doubling up.** Liberty already carries a Natural Earth relief
raster (`ne2_shaded`, layer `natural_earth`), but it is `maxzoom: 6` and its opacity ramps to `0.1` by
zoom 6 — at the trip's fit zoom (~8.4) it contributes nothing. Liberty ships **no `hillshade` layer at
all** (verified against the live style JSON: 111 layers, one `raster`, zero `hillshade`).

### 1.3 3D hero mode

The same DEM through `map.setTerrain()`, with a pitched camera. Real elevation, real occlusion — the
hero shot. Two constraints make it an explicit mode rather than a default:

- **Relief is only visible when pitched.** At `pitch: 0` a terrain-enabled map looks identical to 2D
  while still paying the terrain cost.
- **It is the only GPU-heavy option here**, which matters inside the Capacitor Android shell.

The prototype's camera is aimed down the Adimali→Munnar ghat climb at `pitch: 70`, `bearing: 235`,
`zoom: 11.5`, `exaggeration: 1.8`.

---

## 2. Implementation sketch

### 2.1 The DEM source (shared by both terrain modes)

```ts
const DEM_SOURCE = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium', tileSize: 256, maxzoom: 14,
  // attribution is required — see §2.5
};
```

Keyless, no signup, CORS-enabled. `terrarium` is a MapLibre-supported encoding; no decoder is needed.

### 2.2 Terrain mode

```ts
map.addSource('yf-dem', DEM_SOURCE);
map.addLayer({
  id: 'yf-hillshade', type: 'hillshade', source: 'yf-dem',
  paint: {
    'hillshade-exaggeration': 0.6,
    'hillshade-shadow-color': '#3E5560',
    'hillshade-highlight-color': '#FFFFFF',
    'hillshade-accent-color': '#3D6B70',
  },
}, beforeId);
```

**`beforeId` is the trap.** The shading must sit *above* the land fills but *below* the water, or the
sea gets hillshaded. Insert before the **first water-ish layer**, matched as `water` **or** `waterway*`:

- In **positron** the order is `water` (idx 2) then `waterway` later — matching `water` alone is fine.
- In **Liberty** the `waterway_*` lines (idx 14–16) sit **above** `water` (idx 17), so matching `water`
  alone inserts *under* the river lines and buries them. Matching either id is required.

This is a real difference between the two styles, not a hypothetical — the prototype hit it and now
matches both ids. Adding a layer whose `beforeId` no longer exists throws, so resolve the id from the
loaded style rather than hard-coding one.

### 2.3 3D hero mode

```ts
map.setTerrain({ source: 'yf-dem', exaggeration: 1.8 });
map.easeTo({ pitch: 70, bearing: 235, duration: prefersReducedMotion() ? 0 : 700 });
```

- **`maxPitch` must be raised.** MapLibre's default is **60**; the hero angle needs 70–75. Set it on the
  map options (or `map.setMaxPitch`) — otherwise `easeTo` silently clamps and the "hero" view is limp.
- Gate the camera move on `prefersReducedMotion()` (`src/lib/motion.ts`), which `TripMap` already uses
  for `fitBounds`/`easeTo` (lines 438, 454, 471).
- Leaving 3D should reset pitch/bearing, and should call `setTerrain(null)` so the GPU cost stops when
  the user is back in 2D.
- Liberty's `building-3d` fill-extrusion is `minzoom: 14`, so 3D buildings do **not** interfere at trip
  scale — they appear only when zoomed into a city. Worth a deliberate check if the hero view is ever
  offered at high zoom.

### 2.4 The switcher: three states → a segmented control

Three modes, **none of which is "off"** — so this is not a switch. `AGENTS.md` already records the rule
and the precedent:

> A `role="switch"` with only an on/off state reads poorly when both states are first-class — the bench's
> return toggle became a segmented control (two `aria-pressed` buttons in a `role="group"`); prefer that
> pattern when neither state is "off".

So: three `<button aria-pressed>` in a `role="group"`, reusing the existing `map-day-chip` styling in
`TripMap`'s toolbar (which already ships `aria-pressed` chips) so it matches the day filter visually.
The button labels need to survive a narrow phone — "2D / Terrain / 3D" with `aria-label`s carrying the
long form ("Flat map", "Terrain relief", "3D terrain").

**Open question:** `TripMap` takes `showToolbar` and the **Board passes `false`** (its toolbar sat behind
the Board's info card). Where does the mode switcher live on the Board, or is the Board 2D-only? This
needs a decision before the UI is built.

### 2.5 Attribution

- The **basemap** credit comes from OpenFreeMap's TileJSON and MapLibre renders it automatically —
  **do not** add it via `customAttribution`, or it appears twice. That mistake is already documented in
  `mapcn/map.tsx` (the first #23 pass shipped it).
- The **DEM** is a new source and needs its own credit (AWS Terrain Tiles / ETOPO1), which MapLibre will
  render from the source's `attribution` field. It should appear only when a terrain mode is active —
  i.e. add the source on demand rather than shipping it in the base style, so a 2D user's attribution
  bar doesn't carry a credit for tiles they never fetched.

### 2.6 Persistence

`src/lib/uiPrefs.ts` already has `loadFlag`/`saveFlag` for named booleans (used for `map_legend_open` in
`TripMap`). A three-way mode is **not** a boolean, so this needs a small string pref — either a
`loadPref`/`savePref` pair alongside the existing flag helpers, or a three-flag encoding (worse). Keep
the existing failure-tolerant shape: missing/corrupt storage must fall back to `'2d'`, never throw.

Open question: should the choice persist **per trip** or **globally**? The prototype assumes globally
(one map preference, like the legend flag).

### 2.7 Dark theme

The app follows `data-theme`, and OpenFreeMap ships **no Liberty dark**. Options, in order of effort:

1. Keep the existing `dark` style for dark mode (2D/terrain/3D all work on it unchanged) — inconsistent
   palette between themes, but zero new work.
2. Ship a recoloured dark twin (the prototype's panel 8 proves the mechanism: the stock dark style uses
   only 22 distinct colours, but it needs its own lookup table — different layer ids than positron — and
   a light-label pass, since it ships dark-grey text).

Recommendation: **1** for the first cut; treat 2 as a follow-up so the default swap doesn't grow into a
theming project.

---

## 3. Evidence (all verified 2026-09-12, not assumed)

| Check | Result |
|---|---|
| `tiles.openfreemap.org/styles/{positron,dark,bright,liberty}` | HTTP 200, `access-control-allow-origin: *` |
| `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | 200; CORS header present **only when `Origin` is sent** — a bare `HEAD` looks like no-CORS |
| Liberty style shape | 111 layers; **no `hillshade`**; one `raster` (`natural_earth`, `maxzoom: 6`); `water` at idx 17, after `waterway_*` at 14–16 |
| `building-3d` (Liberty fill-extrusion) | `minzoom: 14` |
| DEM is real on the demo route (`queryTerrainElevation`) | Adimali foot **335 m** → **1,092 m** → Munnar **2,054 m** → Mattupetty **2,331 m** → Top Station **2,676 m** |
| Prototype render | 8 live canvases; console clean except a `favicon.ico` 404; terrain `exaggeration: 1.8`, `pitch: 70` |

The elevation series is the useful smoke test: it is a ~2.3 km escarpment over ~30 km, so if a build
shows a flat ghat section, the DEM source — not the styling — is what broke.

---

## 4. Acceptance criteria

1. Every map in the app (Trip map, Board backdrop, expanded overlay) renders **Liberty** in light theme
   with no other visual regression.
2. The mode switcher appears in the map toolbar as a **`role="group"` of three `aria-pressed` buttons**,
   keyboard-operable, with the active mode announced.
3. **Terrain**: relief is visible on the ghat section at fit zoom; the sea and backwaters are **not**
   shaded; no extra requests are made while the mode is off.
4. **3D**: the camera reaches at least `pitch: 70`; leaving 3D returns pitch/bearing to 0 and drops the
   terrain (verified by `map.getTerrain()` returning null).
5. The DEM attribution appears **only** in a terrain mode; the basemap credit is not duplicated.
6. The chosen mode survives a reload and falls back to 2D when storage is unavailable.
7. `npm run verify` green; on Android, entering 3D does not tank the frame rate on a mid-range device —
   if it does, the mode ships behind an explicit opt-in label rather than silently.

## 5. Risks / open questions

- **Android GPU** — the one real risk; 3D terrain is the only heavy mode here. Needs a device check
  before it is offered by default anywhere.
- **Board's hidden toolbar** (§2.4) — where does the switcher live there?
- **Persistence scope** (§2.6) — per trip or global?
- **Dark palette** (§2.7) — stock dark vs a recoloured twin.
- **Does 3D deserve to auto-expand?** The map already has a full-screen `⤢ Expand` overlay; a hero view
  that stays 400 px tall inside a scrolling page may undersell itself. Deliberately left open.
- **Label density**: Liberty is busier than positron, and it now sits under our own pins, route lines and
  idea markers. Worth an eyeball pass at phone width before shipping the default swap.

## 6. Out of scope

- Satellite/imagery (there is no keyless source; the old Esri layer was removed in #23 for licensing).
- Recolouring Liberty to the brand palette — the prototype's panels 5 and 8 cover that as a separate
  option; this request is deliberately stock-Liberty plus relief.
- Per-day or per-stop basemap switching.
- Offline map tiles (a much larger M8-shaped job).
