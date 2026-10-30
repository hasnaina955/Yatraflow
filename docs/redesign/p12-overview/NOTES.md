# P12 Overview tab (Workspace tabs) - redesign notes

Open `MOCKUP.html` in a browser. Use `?theme=light|dark`, `?state=ready|loading|failed|empty|kept` and `?guides=1`.
For review shots, `?stops=N` sets the route points (0 to 30). `?route=winding|straight|loop` sets the route shape. `?road=pending` hides distance and time and `?days=N` sets the day count (1 to 30).
The data is sample data. The health score logic is not changed. The mockup only shows it.
`?guides=1` draws the 1400px container (normal tabs) and the 1720px width (Board and Map).

## What changes against today

- The Overview opens with one slim verdict block. It shows one band, one score and one sentence. The first issue is named in the sub-line.
- The block has one primary button. It reads "Fix 5 issues", or "Open Timeline" when nothing needs a fix.
- "Fix 5 issues" opens the Timeline at the first issue.
- "Trip health" and "Priority actions" become one card, "What needs you". Each warning appears once, with a severity label, a fix and one action.
- The six text links with arrows become buttons with verbs.
- Four stat tiles become three slim tiles. They sit below "What needs you" at all widths. "Travel effort" shows effort and overnight bases. The route card shows distance and stops.
- "What needs you" and the route card sit side by side. At 1440x900 the verdict, the issues, the route card and the stat row all show without scrolling.
- "2 more warnings" is a text button. It opens the two extra rows in place.
- One verb, "Fix", marks every issue button. The two review buttons keep the pill size: 44px on touch, 40px with a fine pointer.
- The empty state is honest. The score and the totals read a dash. The chip reads "Not scored yet". No number appears above "Nothing planned yet".
- Only the first failed block on the page is an alert. The other failed blocks are status regions.
- Group pulse now links to decisions ("Review decisions"). Today `onOpenDecisions` is dropped. "Invite travellers" moves into the card header.
- Fixed commitments, recent activity and weather become quiet blocks: border only, compact `StateBlock`. Weather runs at full width under the matrix.
- All card and block titles use one size: 18px, line height 1.3 (R20). Body text uses 11, 12, 13, 14 and 15px. The score number (40px, 34px on a phone) is the one display numeral.
- The verdict has no blob and no side stripe. The band shows in the score, the chip and the bar.
- Each data block shows loading, failed, empty and ready as four separate states. A kept state shows the last rows with a note.
- Loading and failed apply only to the reads: weather, decisions and activity. The verdict, issues, totals, route, commitments and day matrix come from the plan on screen.

## Width and spacing

- The container for normal tabs is 1400px (was 1180px). Board and Map share 1720px. Both are variables in the mockup: `--container-w`, `--container-wide`.
- Every gap and padding uses a `--space-*` token, one step below the first draft.
- The mockup shrinks the P2 trip header (72px thumbnail, less padding) so the Overview starts higher. The header content does not change.
- Page height, full page, sample data:

| Width | Before | After | Change |
| --- | --- | --- | --- |
| 1440 | 2319 px | 1881 px | -18.9% |
| 390 | 3664 px | 2900 px | -20.9% |

At 390 the 25% target is not met. Ten day rows of 44px need 440px. The group blocks cannot shrink more without dropping data.
The route card now holds the map, a summary line and a stop list. This adds 230 px at 1440. The 1440 page is now 18.9% shorter, not 28.8%. The map is the main thing on the card. The stop list is the cost.

## Route card

The route is the picture. The card shows the shape of the road and almost no text on it. The map is an SVG with no external tiles. The pins are buttons. The drawing around them is hidden from assistive tech.

- The map follows the dark plate of `RouteSnapshot`. Sample points are projected with the same maths: scale to fit, north up, and the drawn bounds centred. The viewBox is 720 x 240.
- The road is a thick line (8 units, round caps) with a soft casing. A cream dashed centre line (2 units, dash 7 9) runs on top. Each leg is its own path. Catmull-Rom smoothing joins the legs.
- The road gradient runs from saffron to a warm red. Both colours come from tokens (`--yf-saffron` and `--danger`). The mockup mixes them with `color-mix`. The plate stays dark navy in light and dark themes.
- The shape fills 93% of the width and 78% of the height for the default route. The loop fills 87% and 81%. The straight route fills 93% of the width and 47% of the height.
- Add `?route=winding|straight|loop` to review the three shapes. Add `?road=pending` to see the route before the road is measured.
- The map has almost no text. Pins are small numbered dots with no names. Only the Start and the End carry a tag ("Start", "End") and the city name, one time each. There are no leg pills, no distance or time on the line, and no day strip.
- Detail sits in a tooltip. It opens on hover and on keyboard focus of a pin. It names the stop and the day. It also gives the leg that arrives there ("520 km, 7 h 58 min from Kolkata"). Hover on a leg shows the same facts for that leg. Escape closes the tooltip.
- Under the map, one summary line gives total distance, drive time, days and stops. Under it, a compact stop list shows one row for each stop: pin number, name, day, distance and time. The list is the screen reader path.
- A pin, its list row and the leg that arrives at it highlight together. Hover or focus on any one of them lights the other two. The highlight uses a 2px ring on the pin and a wider glow on the leg.
- A pin is a small face over a transparent hit circle of 44px. Each pin and each row opens the Map at that stop. The mockup shows a small status line: "Would open: Map at Gangtok".
- When the card is narrower than 720px, the map keeps the same shape. Lines, dots and text grow in map units, so the pins stay readable at 328px wide. The stop list sits below the map in one column.
- A pin is a button only when its 44px circle fits between its neighbours. The Start and the End always are. With 14 stops at 390, only those two stay interactive. The rows in the list stay the way to reach every stop.
- Above 8 stops the list scrolls inside the card and fades at the foot.
- Legs are not focusable. The tooltip of the pin at the end of a leg carries the leg facts. A keyboard user loses nothing.
- Zero points keep the empty state. One point shows one pin and one row. Before the road is measured, the summary and the rows show no distance or time.
- The route draws in once, with `stroke-dashoffset`. Each leg uses `--motion-slow` (240ms) and `--ease-out`. The delay grows by one `--stagger-step` (60ms) for each leg, up to eight legs. With reduced motion the route shows at once.
- Colour contrast, measured: the road on the plate is 5.8:1 or more. The red end in light is 3.27:1, above the 3:1 graphic limit. White labels are 11.5:1 or more. Pin numbers are 5.19:1 or more. The tooltip and the list text are 6.8:1 or more.

What the real data can supply (`OverviewTab.tsx`, route snapshot):

- `overviewRoutePoints(trip)` gives an ordered list of `{ lat, lng, day | null }`. It gives an empty list when fewer than two points have valid coordinates. That case shows the empty state.
- A point with `day: null` is a start, a return leg or a destination tail. It has no day badge.
- Distance and drive time per leg come from `road.legs` (`distanceKm`, `durationMinutes`). They exist only after the app measured the road. Before that, the map and the list show pins and names with no distance or time.
- The port can reuse the projection and `catmullRomPath` from `RouteSnapshot`. The mockup uses sample points.
- The mockup sample total (2,500 km) differs from the 2,140 km text in other sample blocks. Both are sample data.

## Day matrix

Above 720px the matrix is an ARIA grid: days are rows, the six parts are columns.

- Header row with an icon and a name for each part, and a "Filled" column. Header text is sentence case, 12px, weight 700, no letter spacing. The header row stays in view when the grid scrolls. The grid is 560px high at most.
- The first column is sticky. It holds the day, the date and a "Today" marker (white on dark teal, above 4.5:1). The today row has a teal edge and a soft tint.
- A planned part is a chip with a kind icon and the stop title. An auto-added part is an outlined chip that reads "Auto" on one line, with a 1.5px inset ring at 55%. The words "Auto-added by the app" sit in the `title` and the `aria-label`. An open part is a quiet dashed cell. A part that is not in this day shows a dash. The grid cell carries the label for a dash.
- The chip radius is 8px inside a cell with 8px of padding, so the cell radius is 16px. The focus ring follows the cell.
- The "Filled" column shows n/6 and a 4px bar (teal; amber on the thinnest day). The thinnest day keeps the word "Thin".
- The card key lists "Thinnest: Day 3, 2 of 6" as its own item, then the three swatches. The items sit in a flex row with a 12px gap. No dots separate them.
- A row highlights on hover (devices with a hover pointer only): teal at 8%, on `background-color` only, with `--motion-fast`. The header names the thinnest day only when there are two days or more and the days differ.
- Cells and day names are clickable. A day cell is a button of at least 44px height. It opens the Timeline at that slot. On hover a planned chip tints with its part colour at 26%. An open cell stays dashed and turns teal. The day name is a 44px button. It opens the Timeline at that day.
- The mockup shows the target in a small status line, for example "Would open: Timeline at Day 4, Lunch". A dash cell does nothing.
- Keyboard: the grid has role `grid` with `gridcell` cells and exactly one tab stop, which starts on the Today row. Arrow keys move between cells. Home and End go to the row ends. Enter opens the target.
- The matrix never draws zeros as a stand-in. The empty state, the loading read and the ready grid stay separate. The grid comes from the plan on screen.
- Chip tints and the dashed edge use shared custom properties, so the key and the cells cannot drift. The dashed edge mixes the muted text colour at 80%. The first value of 55% gave only 2.3:1, so it was raised: 3.6:1 in light and 4.3:1 in dark.
- At 720px or less the grid becomes a list. Each day is one 44px button. It shows the day, the date, six state glyphs and the count n/6. The label of the button names every state in words.
- A short key sits in the card header. It names the three chip states.

Data shape (`daySlots`): each slot has `key`, `kind`, `label`, `state` (`filled`, `auto`, `empty`) and `filledStop.title`. A part that is missing from `slots` is the "not in this day" case.

The real card has three notes that the mockup does not draw: stale (numbers hidden), unverified and "not counted yet". Port them as one quiet line under the grid.

## Design rules used

- Serif font on the page h1 only (R14). Card titles use Plus Jakarta Sans 800 (R20).
- Compact `StateBlock` inside cards (R22). Failed stays separate from empty (R23).
- Buttons are pills at 44px height. The skin stays inside the page scope (R15).
- The header "Invite & share" button is an outline button. The verdict button is the only saffron pill on the Overview.
- Motion uses `--motion-*`, `--ease-out` and `--stagger-step`. A reduced-motion rule turns it off. Measured values: route draw-in 240ms, delay 60ms for each leg, hover and ring 120ms, status line 180ms. No rule uses `transition: all`.
- The number on the end pin uses `--btn-accent-fg`, not `--gray-900`. In dark, `--gray-900` turns light, and light text on the saffron end pin fails contrast.
- Padding and margin use logical properties (`padding-inline-end`, `margin-inline-start`).

## Port map

| Mockup block | Existing code | Change |
| --- | --- | --- |
| Verdict | `Surface` + `Chip`, `healthBandClass`, `healthBandSentence`, `healthBandTone` (OverviewTab.tsx:147-175) | New `ovw-verdict` markup. Same band helpers. |
| What needs you | `rankWarnings`, `warningKey`, `severityLead`, `StateBlock` (:186-210) | One `Surface`. Rows keep `.warn-item` content. Add a per-row action. |
| Stat row | `StatTile` (:178-183) | Three slim `StatTile`. Merge the last two. |
| Route card | `RouteSnapshot`, `overviewRoutePoints`, `StateBlock` (:214-249) | New SVG map (geometry first), tooltip, summary line and stop list. Same empty branch. `PublicItinerary` keeps the old component. |
| Group pulse | `Surface.ovw-strip` (:310-337) | Pass `onOpenDecisions` through. |
| Fixed commitments | `Surface` (:253-277) | Quiet block class. |
| Recent activity | `overviewSliceView`, `StateBlock` (:279-305) | Quiet block class. |
| Weather | `WeatherCard` (:431-500) | Quiet block class. State logic stays. |
| Day matrix | `SlotMatrix` (:502-640) | New grid markup and keyboard handler. `daySlots` and the freshness logic stay. |

Inline styles carry dynamic values only: the health bar `width`, the "Filled" bar `width` and the part colour `--k`.

### Click targets: new optional props

Today only "Open map" (`OverviewTab.tsx:247`) is clickable. `onOpenTimeline` and `onOpenMap` take no arguments. The matrix gets `onOpenMap` as `onRefreshMatrix`.
The port adds these props. All of them are optional.

| Component | New prop | Opens |
| --- | --- | --- |
| `OverviewTab` | `onOpenTimeline(dayIndex?, slotKey?)` | The Timeline at that day or slot. |
| `OverviewTab` | `onOpenMap(focus?: { dayIndex?, stopId? })` | The Map tab at that stop. |
| `RouteSnapshot` | `onPointSelect?(dayIndex)` | The Map at the stop for that day. Pins and stop rows both call it. |
| `SlotMatrix` | `onSelectCell?(dayIndex, kind)` | The Timeline at that slot. |
| `SlotMatrix` | `onSelectDay?(dayIndex)` | The Timeline at that day. |

`PublicItinerary` does not pass these props. Its pins and cells stay inert. A component renders a button only when its prop exists.
A pin with `day: null` has no day index. It opens the Map with no day.

## Tests that pin this area

- `tests/overview-truth.test.ts`: route points. Stays valid.
- `tests/overview-warnings.test.ts`: warning rank. Stays valid.
- `tests/overview-native-read-state.test.ts`: slice states and retry. Stays valid.
- `tests/health-band.test.ts`: band mapping. Stays valid.
- `tests/overview-tab-classes.test.ts`: pins the `Surface` class strings and the "Group pulse" heading. It must change with the port.

## Open design questions

1. "Fix 5 issues" opens the Timeline at the first issue. Is that the right target when the first issue is on a later day?
2. Should the day matrix stay on the Overview, or move to the Timeline?
3. At 390 the page is 22.5% shorter, not 25%. Do you accept that, or do you want the group blocks to collapse?
