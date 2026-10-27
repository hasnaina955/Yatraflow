# P12 Overview tab (Workspace tabs) - redesign notes

Open `MOCKUP.html` in a browser. Use `?theme=light|dark`, `?state=ready|loading|failed|empty|kept` and `?guides=1`.
The data is sample data. The health score logic is not changed. The mockup only shows it.
`?guides=1` draws the 1400px container (normal tabs) and the 1720px width (Board and Map).

## What changes against today

- The Overview opens with one slim verdict block. It shows one band, one score and one sentence.
- The block has one primary button. It reads "Fix 5 issues", or "Open Timeline" when nothing needs a fix.
- "Fix 5 issues" opens the Timeline at the first issue.
- "Trip health" and "Priority actions" become one card, "What needs you". Each warning appears once, with a severity label, a fix and one action.
- The six text links with arrows become buttons with verbs.
- Four stat tiles become three slim tiles. They sit under the verdict. "Travel effort" now holds effort, distance, stops and overnight bases.
- "What needs you" and the route card sit side by side. At 1440x900 the verdict, the issues, the stat row and the route card all show without scrolling.
- Group pulse now links to decisions ("Review decisions"). Today `onOpenDecisions` is dropped. "Invite travellers" moves into the card header.
- Fixed commitments, recent activity and weather become quiet blocks: border only, 15px titles, compact `StateBlock`.
- Each data block shows loading, failed, empty and ready as four separate states. A kept state shows the last rows with a note.
- Loading and failed apply only to the reads: weather, decisions and activity. The verdict, issues, totals, route, commitments and day matrix come from the plan on screen.

## Width and spacing

- The container for normal tabs is 1400px (was 1180px). Board and Map share 1720px. Both are variables in the mockup: `--container-w`, `--container-wide`.
- Every gap and padding uses a `--space-*` token, one step below the first draft.
- The mockup shrinks the P2 trip header (72px thumbnail, less padding) so the Overview starts higher. The header content does not change.
- Page height, full page, sample data:

| Width | Before | After | Change |
| --- | --- | --- | --- |
| 1440 | 2319 px | 1627 px | -29.8% |
| 390 | 3664 px | 2896 px | -21.0% |

At 390 the 25% target is not met. Ten day rows of 44px need 440px. The route list and the group blocks cannot shrink more without dropping data.

## Route card

The card shows a schematic SVG with no external tiles.

- A calm grey base line runs under the route. The route is brand teal on top.
- Numbered pins mark each point. The start pin is solid teal. The end pin is saffron. Both carry a START or END tag.
- Each leg has a small label on the line: distance, drive time and a stripe in the day colour.
- A band under the map shows the day ranges. The colours are tokens: saffron, purple, green, grey and teal.
- Labels never overlap. The script tries four spots for each stop name: below, above, right, left. It takes the first spot that touches no pin, no leg label and no earlier name. It also keeps the label inside the frame.
- At 390px the map becomes a vertical stop list. It uses the same pins, a coloured bar for each leg, and the same distance and time text.
- The mockup labels the route "Sample route, schematic and not to scale".

What the real data can supply (`OverviewTab.tsx`, route snapshot):

- `overviewRoutePoints(trip)` gives an ordered list of `{ lat, lng, day | null }`. It gives an empty list when fewer than two points have valid coordinates. That case shows the empty state.
- A point with `day: null` is a start, a return leg or a destination tail. It has no day badge.
- Distance and drive time per leg come from `road.legs` (`distanceKm`, `durationMinutes`). They exist only after the app measured the road. Before that, the map must show pins and names without leg labels.
- The code must project latitude and longitude to the sketch. The mockup uses fixed positions.

## Day matrix

The matrix is an ARIA grid: days are rows, the six parts are columns.

- Header row with an icon and a name for each part, and a "Filled" column.
- The first column is sticky. It holds the day, the date and a "Today" marker. The today row has a teal edge and a soft tint.
- A planned part is a chip with a kind icon and the stop title. An auto-added part is an outlined chip in italic. An open part is a quiet dashed cell. A part that is not in this day shows a dash.
- A row highlights on hover. The thinnest day shows in amber, and the header names it.
- Each interactive cell is a button of at least 44px height. It opens the Timeline at that day. All cells have a full sentence as `aria-label`.
- Keyboard: one tab stop. Arrow keys move between cells. Home and End go to the row ends.
- At 390 the grid scrolls sideways. A fade on the right edge shows that more columns exist.
- A short key sits in the card header. It names the three chip states. The key is the only legend.

Data shape (`daySlots`): each slot has `key`, `kind`, `label`, `state` (`filled`, `auto`, `empty`) and `filledStop.title`. A part that is missing from `slots` is the "not in this day" case.

The real card has three notes that the mockup does not draw: stale (numbers hidden), unverified and "not counted yet". Port them as one quiet line under the grid.

## Design rules used

- Serif font on the page h1 only (R14). Card titles use Plus Jakarta Sans 800 (R20).
- Compact `StateBlock` inside cards (R22). Failed stays separate from empty (R23).
- Buttons are pills at 44px height. The skin stays inside the page scope (R15).
- The header "Invite & share" button is an outline button. The verdict button is the only saffron pill on the Overview.
- Motion uses `--motion-*`, `--ease-out` and `--stagger-step`. A reduced-motion rule turns it off.

## Port map

| Mockup block | Existing code | Change |
| --- | --- | --- |
| Verdict | `Surface` + `Chip`, `healthBandClass`, `healthBandSentence`, `healthBandTone` (OverviewTab.tsx:147-175) | New `ovw-verdict` markup. Same band helpers. |
| What needs you | `rankWarnings`, `warningKey`, `severityLead`, `StateBlock` (:186-210) | One `Surface`. Rows keep `.warn-item` content. Add a per-row action. |
| Stat row | `StatTile` (:178-183) | Three slim `StatTile`. Merge the last two. |
| Route card | `RouteSnapshot`, `overviewRoutePoints`, `StateBlock` (:214-249) | New SVG map with leg labels and a stop list. Same empty branch. `PublicItinerary` keeps the old component. |
| Group pulse | `Surface.ovw-strip` (:310-337) | Pass `onOpenDecisions` through. |
| Fixed commitments | `Surface` (:253-277) | Quiet block class. |
| Recent activity | `overviewSliceView`, `StateBlock` (:279-305) | Quiet block class. |
| Weather | `WeatherCard` (:431-500) | Quiet block class. State logic stays. |
| Day matrix | `SlotMatrix` (:502-640) | New grid markup and keyboard handler. `daySlots` and the freshness logic stay. |

The one inline style (health bar `width`) stays. It is a dynamic value.

## Tests that pin this area

- `tests/overview-truth.test.ts`: route points. Stays valid.
- `tests/overview-warnings.test.ts`: warning rank. Stays valid.
- `tests/overview-native-read-state.test.ts`: slice states and retry. Stays valid.
- `tests/health-band.test.ts`: band mapping. Stays valid.
- `tests/overview-tab-classes.test.ts`: pins the `Surface` class strings and the "Group pulse" heading. It must change with the port.

## Open design questions

1. "Fix 5 issues" opens the Timeline at the first issue. Is that the right target when the first issue is on a later day?
2. Should the day matrix stay on the Overview, or move to the Timeline?
3. The stat row now sits above "What needs you". Do you want it below instead?
4. At 390 the page is 21% shorter, not 25%. Do you accept that, or do you want the group blocks to collapse?
