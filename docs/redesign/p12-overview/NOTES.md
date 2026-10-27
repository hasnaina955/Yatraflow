# P12 Overview tab (Workspace tabs) - redesign notes

Open `MOCKUP.html` in a browser. Use `?theme=light|dark`, `?state=ready|loading|failed|empty|kept` and `?guides=1`.
For review shots, `?stops=N` sets the route points (0 to 30) and `?days=N` sets the day count (1 to 30).
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
| 1440 | 2319 px | 1651 px | -28.8% |
| 390 | 3664 px | 2841 px | -22.5% |

At 390 the 25% target is not met. Ten day rows of 44px need 440px. The group blocks cannot shrink more without dropping data.

## Route card

The card shows a schematic SVG with no external tiles. The SVG is hidden from assistive tech. A stop list carries the same facts.

- A calm grey base line runs under the route. The route is brand teal on top.
- Pins mark the start, each overnight base and the end. The header counts every stop, so it can read 14 stops while the map shows 6 pins.
- Numbered pins: the start pin is solid teal and the end pin is saffron. Both carry a START or END tag. One stop gives one centred pin and no leg labels.
- Each leg has an 84-unit label on the line. It shows distance, drive time, day range and a stripe in the day colour (tokens). The day band strip is gone.
- Leg labels hide when the pins sit closer than 110 units (more than 6 pins). The 84-unit label needs 84 units plus the pin width.
- Names stop at 14 characters. The full name is in the pin title. The script tries the preferred side, then the others. A name that fits nowhere drops to 8 characters, then to no label.
- Above 8 pins the card shows the stop list at all widths. The list scrolls and fades at the foot.
- At 720px or less the map becomes the same vertical stop list. It shows pins, a coloured bar for each leg, distance, time and the day range.
- Zero points keep the empty state.
- Above 720px the stop list is in the page for screen readers and is visually hidden. Its label names the stop count.

What the real data can supply (`OverviewTab.tsx`, route snapshot):

- `overviewRoutePoints(trip)` gives an ordered list of `{ lat, lng, day | null }`. It gives an empty list when fewer than two points have valid coordinates. That case shows the empty state.
- A point with `day: null` is a start, a return leg or a destination tail. It has no day badge.
- Distance and drive time per leg come from `road.legs` (`distanceKm`, `durationMinutes`). They exist only after the app measured the road. Before that, the map must show pins and names without leg labels.
- The code must project latitude and longitude to the sketch. The mockup uses fixed positions.

## Day matrix

Above 720px the matrix is an ARIA grid: days are rows, the six parts are columns.

- Header row with an icon and a name for each part, and a "Filled" column. The header row stays in view when the grid scrolls. The grid is 560px high at most.
- The first column is sticky. It holds the day, the date and a "Today" marker (white on dark teal, above 4.5:1). The today row has a teal edge and a soft tint.
- A planned part is a chip with a kind icon and the stop title. An auto-added part is an outlined chip that reads "Auto-added by the app". An open part is a quiet dashed cell. A part that is not in this day shows a dash. The grid cell carries the label for a dash.
- A row highlights on hover (devices with a hover pointer only). The thinnest day shows in amber. The header names it only when there are two days or more and the days differ.
- Each interactive cell is a button of at least 44px height. It opens the Timeline at that day.
- Keyboard: one tab stop, which starts on the Today row. Arrow keys move between cells. Home and End go to the row ends.
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
3. At 390 the page is 22.5% shorter, not 25%. Do you accept that, or do you want the group blocks to collapse?
