# P12 Overview tab (Workspace tabs) - redesign notes

Open `MOCKUP.html` in a browser. Use `?theme=light|dark` and `?state=ready|loading|failed|empty|kept`.
The data is sample data. The health score logic is not changed. The mockup only shows it.

## What changes against today

- The Overview opens with one verdict block. It shows one band, one score and one sentence.
- The block has one primary button. It reads "Fix 5 issues", or "Open Timeline" when nothing needs a fix.
- "Trip health" and "Priority actions" become one card, "What needs you". Each warning appears once, with a severity label, a fix and one action.
- The six text links with arrows become buttons with verbs. Two of them used to go to the Timeline. Now only the primary button and the day rows do.
- Four stat tiles become three. "Travel effort" now holds effort, distance, stops and overnight bases.
- The route card shows papercut art beside the stop list. It has one "Open map" button.
- Weather, group pulse, recent activity, fixed commitments and the day matrix become quiet blocks: border only, 16px titles, compact `StateBlock`.
- Group pulse now links to decisions ("Review decisions"). Today `onOpenDecisions` is dropped.
- The empty copy no longer starts with a dash.
- Each data block shows loading, failed, empty and ready as four separate states. A kept state shows the last rows with a note.
- Loading and failed apply only to the reads: weather, decisions and activity. The verdict, issues, totals, route, commitments and day matrix come from the plan on screen.

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
| Stat row | `StatTile` (:178-183) | Three `StatTile`. Merge the last two. |
| Route card | `RouteSnapshot`, `overviewRoutePoints`, `StateBlock` (:214-249) | Add `TripArt` beside it. Same empty branch. |
| Group pulse | `Surface.ovw-strip` (:310-337) | Pass `onOpenDecisions` through. |
| Fixed commitments | `Surface` (:253-277) | Quiet block class. |
| Recent activity | `overviewSliceView`, `StateBlock` (:279-305) | Quiet block class. |
| Weather | `WeatherCard` (:431-500) | Quiet block class. State logic stays. |
| Day matrix | `SlotMatrix` (:565-640) | Quiet block class. Matrix logic stays. |

Size: about 350 of the 645 lines are markup that changes. About 295 lines stay: helpers, hooks and the weather state logic.
The one inline style (health bar `width`, line 159) stays. It is a dynamic value. It moves to `.ovw-bar i`.

## Tests that pin this area

- `tests/overview-truth.test.ts`: route points. Stays valid.
- `tests/overview-warnings.test.ts`: warning rank. Stays valid.
- `tests/overview-native-read-state.test.ts`: slice states and retry. Stays valid.
- `tests/health-band.test.ts`: band mapping. Stays valid.
- `tests/overview-tab-classes.test.ts`: pins the `Surface` class strings and the "Group pulse" heading. It must change with the port.

## Open design questions

1. Answered. The header button "Invite & share" is now an outline button. The verdict button is the only saffron pill.
2. "Fix 5 issues" opens the Timeline at the first issue. Is that the right target when the first issue is on a later day?
3. Should the day matrix stay on the Overview, or move to the Timeline?
