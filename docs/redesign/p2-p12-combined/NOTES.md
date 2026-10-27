# P2 and P12 combined mockup

One file shows two designs together. The Trip workspace header and tab bar (P2) sit on top. The redesigned Overview tab (P12, Workspace tabs) sits under them. Open `MOCKUP.html` in a browser. It makes no external requests.

## What comes from where

- Header, member stack, tab bar, glider, compact motion and widths: the final P2 mockup. One copy of the rules.
- Overview content: the P12 mockup. The verdict block, "What needs you", route card, stat row, day matrix and compact blocks are unchanged.
- The header "Invite & share" button is an outline button. P12 decided this. The verdict button is the only saffron pill on the Overview.

## Behaviour

- Overview uses a 1400px container. Board and Map use 1720px and show a labelled placeholder. Timeline, Group input, Budget, Share and Settings show a labelled placeholder at 1400px.
- The header compacts on Board and Map. It expands on every other tab. The motion uses `grid-template-rows`, `--motion-slow` (240 ms) and `--ease-glide`. The container width uses a `max-width` transition.
- The tab bar answers the arrow keys, Home and End. Click targets on the Overview show a "Would open" line. The matrix grid and the route pins keep their keyboard behaviour.
- `prefers-reduced-motion` turns off all animation. Tap targets are 44px.

## Query parameters

| Parameter | Values |
| --- | --- |
| `tab` | `overview`, `board`, `map`, `timeline`, `group`, `budget`, `share`, `settings` |
| `state` | `ready`, `loading`, `failed`, `empty`, `kept` (Overview only) |
| `route` | `winding`, `straight`, `loop` |
| `stops`, `days` | number of route points, number of days |
| `theme` | `light`, `dark` |
| `guides` | `1` draws the wrapper, the container width and the 1720px line |

## Merge rules for the port

- You must keep `yf-page` on the header and tab bar wrapper only. You must not put it on `.container` (R15).
- You must keep one definition of each token. The mockup adds `--ease-glide` to the P12 token list.
- The mockup re-uses the P12 sample data. The Board and Map panels are placeholders, not designs.

## Route card: terrain journey strip

The route card draws the trip over a stylised landscape. It replaces the flat navy grid plate.

- The road follows the true shape of the stops. The mockup projects real latitude and longitude with an equirectangular fit and a cosine of the latitude. North is up. The drawn bounds are centred. Catmull-Rom curves smooth the line, as RouteSnapshot does.
- The sample trips use real place coordinates. They are approximate and labelled as a sample. Use `?route=north-south` (default), `ladakh`, `bengal-sikkim` or `goa-coast`. The old names winding, straight and loop still map to the first three.
- The landscape has no tiles. It has a sky wash, a sun or moon, three ridge layers and soft contour lines. High peaks get snow caps. Water sits low. The sea or a river sits where the trip names it. Light mode is a morning landscape. Dark mode is a dusk landscape.
- The ridges rise where the stops are high. A stop at 3,500 m lifts the ridge under it. The mockup stores an elevation for each stop.
- The road is one thick line with a casing and a cream dashed centre. It stays the hero. Light mode uses a navy casing. Dark mode uses a bright saffron body. All colours are tokens or mixes of tokens.
- The road draws in once. The ridges settle by 1 to 2 px. `prefers-reduced-motion` turns both off.
- Pins that sit closer than a tap target shrink and lose their number. The stop list below carries the detail. Pins still open the Map at that stop.
- On a phone the plate is 420 by 320 units, so the map is about 250px high at 390px.

### What the real data supplies

- `overviewRoutePoints` gives ordered points `{ lat, lng, day | null }`. It is enough for the road, the pins and the stop list.
- The landscape needs more. It needs an elevation for each point and a flag for sea or river. Today the data has neither.
- You must choose one source before you port the landscape. Use an elevation read for each point, or a small fixed region table.
- Without either source, draw the flat plain kind. The road is not affected.
- Leg distance and time come from `road.legs` only after the road is measured.
