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
