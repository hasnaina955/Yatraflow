# Implementation spec: Trip workspace header (P2) and Overview tab (P12)

Status: implementation-ready. The foundation commit lands before the header and Overview lanes.
Source design: `MOCKUP.html` and `NOTES.md` in this folder. The mockup is sample data only.
Read this file top to bottom. It needs no other context. The last section, "Porting map", holds the file paths.

## Problem Statement

A traveller opens a trip from My trips. My trips shows cream editorial cards. The trip workspace then opens on a dark navy band with a Sora title. This is the largest visual break in the app.

The tab bar is one of three tab styles in the app. The header hides the member row on the Board tab only. The Map tab does not compact it.

The Overview tab has four problems:

- It shows the trip health twice: once as a score and once as a list of reasons.
- It shows a second list of the same warnings.
- It ends each block with a text link and an arrow.
- The route card draws a small plain line. It tells the traveller little about the road.

At 1440 px wide the traveller must scroll to see the verdict, the issues, the route and the totals. At 390 px the page is about 3,660 px tall.

Only the "Open map" link is clickable on the route card. The group pulse drops its decisions link.

## Solution

Replace the navy header with an editorial header on the same cream card language as My trips. Keep every fact the header shows today. Add a calm tab bar with a sliding teal glider.

On the Board and Map tabs the header folds to a slim bar. The page then gives the tab more room.

Rebuild the Overview tab as one calm page:

- One slim verdict block. It shows one score, one band and one sentence. It has one primary button.
- One "What needs you" card. It shows each warning once, with a severity label, a fix and one action.
- A route card that draws the trip as a road over a stylised landscape. Pins, a stop list and a tooltip give the detail.
- Three slim totals tiles.
- The day matrix and the quiet blocks (group pulse, fixed commitments, recent activity, weather).

The mockup sets all of this out. This spec turns the mockup into a build plan. It does not change any engine rule, score or data read.

## User Stories

1. As a traveller, I want the workspace to match the app, so that opening a trip feels calm.
2. As a traveller, I want the trip name in a serif title, so that I know my trip.
3. As a traveller, I want route, dates, party and style under the title, so that I confirm the trip.
4. As a traveller, I want a back control above the title, so that I can leave in one tap.
5. As a traveller, I want a cover picture beside the title, so that I can tell my trips apart.
6. As a traveller with an uploaded cover, I want it shown, so that generated art does not replace my choice.
7. As a trip member, I want to see who else is on the trip, so that I know my team.
8. As a member, I want to see who views the trip now, so that I know changes may be live.
9. As a member who is alone, I want the header to say so, so that I know nobody sees edits.
10. As an editor, I want an "Invite & share" button in the header, so that I can add travellers fast.
11. As a viewer without edit rights, I want no invite button, so that I see no action I cannot use.
12. As a traveller on a phone, I want the invite button within thumb reach, so that I can tap it.
13. As a traveller, I want the header to fold on Board and Map, so that those tabs get more room.
14. As a traveller, I want the header to open again on other tabs, so that I see the trip facts.
15. As a traveller, I want the fold to move smoothly, so that the page does not jump.
16. As a traveller who prefers reduced motion, I want no animation, so that the page does not make me unwell.
17. As a keyboard user, I want arrow keys, Home and End to move tabs, so that I need no mouse.
18. As a screen reader user, I want each tab to name its panel, so that I hear where I am.
19. As a traveller, I want a count badge on Group input, so that I see how many items wait.
20. As a traveller, I want a deep link to open the right tab, so that I can share the link.
21. As a phone user, I want the tab bar to scroll with an edge fade, so that tabs show.
22. As a traveller, I want an honest message for a missing trip, so that I do not wait.
23. As a traveller, I want a loading message while the trip loads, so that I know the page works.
24. As a traveller, I want the Overview to open on one verdict, so that I know the plan state.
25. As a traveller, I want one score, one band word and one sentence, so that I read each fact once.
26. As a traveller, I want the verdict to point me to the issues, so that I know where to start.
27. As a traveller, I want one primary button on the verdict, so that the next step is clear.
28. As a traveller with issues, I want the button to read "Fix N issues", so that I see the job.
29. As a traveller with no issues, I want the button to read "Open Timeline", so that I can carry on.
30. As a traveller, I want each warning to appear once, so that I do not read duplicates.
31. As a traveller, I want each warning to carry a severity word, so that colour is not the only signal.
32. As a traveller, I want each warning to carry a fix and one action, so that I know the step.
33. As a traveller, I want three warnings visible and the rest behind a toggle, so that the card stays short.
34. As a traveller, I want the verdict and issues in view at 1440 px, so that I need not scroll.
35. As a traveller, I want the route in its true shape with north up, so that I recognise my trip.
36. As a traveller, I want the road to be the hero of the card, so that terrain never hides it.
37. As a traveller, I want the start and end named on the route, so that I know the direction.
38. As a traveller, I want a tooltip on each pin with stop, day and leg, so that I get detail.
39. As a traveller, I want a stop list under the map, so that I can reach every stop by keyboard.
40. As a traveller, I want a pin, its row and its leg to light together, so that I link them.
41. As a traveller, I want a pin or row to open the Map there, so that I see more.
42. As a phone user, I want the map to stay readable, so that I do not lose the route.
43. As a mountain traveller, I want the landscape to show the heights ahead, so that I feel the road.
44. As a coastal traveller, I want the sea on the right side, so that the picture matches the place.
45. As a traveller whose data has no heights, I want a plain landscape, so that no terrain is invented.
46. As a traveller with under two mapped stops, I want a clear empty message, so that I know the fix.
47. As a traveller before the road is measured, I want no distance or time, so that no guess looks real.
48. As a traveller, I want three totals tiles, so that I see cost, cost per person and travel effort.
49. As a traveller with an empty plan, I want dashes and "Not scored yet", so that no invented number appears.
50. As a traveller, I want the matrix to mark each day part filled, auto-added or open, so that gaps show.
51. As a traveller, I want a matrix cell to open the Timeline at its stop, so that I fix gaps.
52. As a keyboard user, I want the matrix to answer arrow keys and Enter, so that I skip the mouse.
53. As a phone user, I want the matrix as a list of day buttons, so that I tap each day.
54. As a traveller, I want group pulse to link to open decisions, so that I can vote.
55. As a traveller, I want loading, failed, empty and kept as separate states, so that failure never looks empty.
56. As a screen reader user, I want one alert for the first failed block, so that I am not flooded.
57. As a traveller, I want light and dark themes to look equally finished, so that I can plan at night.
58. As a maintainer, I want the new markup to use design tokens only, so that the design-system gates stay green.
59. As a maintainer, I want the public itinerary to keep its route component, so that a paid surface is safe.
60. As a maintainer, I want each new click target to be an optional prop, so that other callers show none.

## Implementation Decisions

### Scope

- This spec covers the workspace header, the tab bar and the Overview tab. It also covers the page loading and not-found states. It covers nothing else.
- The Board, Map, Timeline, Group input, Budget, Share and Settings tabs keep their content. They gain only the width and fold rules below.
- No engine rule changes. The health score, the warning rank, the road measurement and the weather read keep their logic.
- No database change. No migration.

### Page structure

- The header and the tab bar sit together in one wrapper that carries the page skin class. The container does not carry that class (R15).
- The container keeps the page entrance class. The wrapper and the tab panel are its children.
- The root structure is: `div.container.page-enter` holds `div.yf-page` (header and tab bar) and the tab panel.
- The skin rule `.container:is(.yf-page)` (`src/styles.css` line 10013) needs both classes on one element. The wrapper is not a container, so that rule does not match it. The width comes from the container width classes only. The descendant button rules (`:is(.yf-page) .btn`) match the buttons in the wrapper and no button in the tab panel.
- `tests/page-consistency.test.ts` reads page scope from the whole file (line 35, `PAGE_SCOPE_CLASS`). One `yf-page` class name anywhere in `TripWorkspace.tsx` counts. So the change must delete `src/pages/TripWorkspace.tsx` from `pageRootAllowlist` in `tests/page-consistency-baseline.json` in the same commit. The test fails with "carries yf-page now" if you keep it. The test cannot tell a wrapper from a root. A reviewer must check the root structure above by eye.
- Ratchet targets for the `pageFiles` entries (line 140, `compareMetrics`). A count that falls fails the test until you regenerate the baseline with `UPDATE_PAGE_CONSISTENCY_BASELINE=1`. A count that rises fails always. Today the entries read: `TripWorkspace.tsx` `loadingBlock` 3, `inlineStyle` 8, `rawH1` 1; `OverviewTab.tsx` `inlineStyle` 1. The new targets are:
  - `TripWorkspace.tsx` `loadingBlock` 0. The loading state, the not-found state and the Board fallback all use `StateBlock`.
  - `TripWorkspace.tsx` `inlineStyle` 1 at most. Only the uploaded cover address stays inline. Spacing, position and opacity move to classes.
  - `TripWorkspace.tsx` `rawH1` 1. The trip title stays a raw `h1`. Do not add a page header component to the workspace.
  - `OverviewTab.tsx` `inlineStyle` 1. Only the verdict bar width stays inline.
  - Any new file under `src/pages/` starts at 0 for every count. Put the route card component under `src/components/`, which the scan does not read. It still follows the same rule: no `style={{`, no `loading-block`.
- Prove that the baseline diff holds falls only (and the allowlist removal). A rise is a regression, not a baseline update.
- The header is one card. Its rows are: the back control, the title row, and the members row.
- The title row holds the cover slot, the text column and the actions.
- The text column holds the serif title and the facts line.
- The members row holds the member stack, the member note and the presence text.

### Page states

The foundation branch replaces `fetchSharedTrip` on these surfaces with `readSharedTrip`. The reader returns `found`, `unavailable`, `failed` or `cancelled`. A cancelled read does not render. An identity change starts a new read.

The page keeps four states. Each state uses a `StateBlock` with `size="full"` and `titleLevel="h1"` inside `div.container.page-enter`, because the block fills the page (R22):

- Loading. `kind="loading"`, title "Loading trip". The state has no actions. The Board fallback uses `kind="loading"` with `size="compact"` and the title "Loading board".
- Not found. `kind="empty"`, title "Trip not found". The body says the trip may be deleted, private or a wrong link. The state has one action: "Back to my trips" (the existing `onNavigate('trips')`). The state shows no retry, because the read gave a definite answer.
- Signed out. The trip route shows a `StateBlock` with `kind="empty"` and title "Sign in to open this trip". The action builds `/auth?next=...` with `authNext`. The `next` value must be the validated trip path.
- Failed read. `kind="failed"`, title "Could not open this trip". The "Try again" action clears the stored read result. The effect then reads again.
- The baseline effect is in "Page structure": `loadingBlock` falls from 3 to 0.

### Header content

- The header shows the same facts as today. These are the name, the route, the dates, the party size, the transport mode and the travel style. It also shows the members, the viewer's role and presence.
- The title is the only serif text on the page (R14). The facts line and all other text use the body face.
- The cover slot uses this order: the uploaded cover image, the saved emoji, then `TripArt`.
- The "Invite & share" button shows only to editors. It opens the Share tab.
- The button is an outline pill (P12 decision). The verdict button is the only saffron pill on the Overview.
- The header uses one responsive "Invite & share" button. On a phone the button sits in the members row while the header is open. It moves to the top right when the header is folded.
- Each avatar is a focus stop with a tooltip. The tooltip names the person and the state.

### Header fold

- The header folds on the Board tab and on the Map tab. It is open on every other tab.
- A fold hides the facts line and the members row. It shrinks the title and the cover to fixed ratios. It moves the title left to close the gap.
- The fold uses one duration (`--motion-slow`) and one curve (`--ease-glide`).
- Height changes use the grid-rows technique (one fraction to zero). All other changes use transform and opacity. No layout box of the title or the cover changes size, so text does not reflow during the move.
- Overflow stays visible when the header is open, so tooltips can show. It clips only while the header folds.
- Folded content becomes inert only after focus moves to the active tab.
- Reduced motion turns every animation and transition off.

### Widths

- The Overview and the other normal tabs use a 1400 px container. Board and Map use a 1720 px container.
- The container width change animates with a max-width transition.
- The width uses the mockup values. The Map tab must pass its rail-overflow check at 1720 px.

### Tab bar

- The bar is a glass pill with a teal glider behind the active tab.
- Use `SegmentedTabs` with `semantics="tablist"`.
- The tab list has eight stable panel shells. Each tab has an `aria-controls` value that names its shell.
- Only the active shell mounts content. The other seven shells stay hidden and empty.
- It keeps the full tab contract. This covers roving focus, arrow keys, Home, End and the group count.
- The tab order stays as today: Overview, Board, Map, Timeline, Group input, Budget, Share, Settings.
- On a narrow screen the bar scrolls sideways. A mask fades the edge that has more tabs. The mask states are start, middle and end.
- Every tab is 44 px tall.

### Overview structure

The page runs in this order:

1. Verdict.
2. A two-column row. "What needs you" sits left and the route card sits right. The totals row sits under both.
3. A row with the day matrix on the left and a stack of quiet blocks on the right.
4. Weather at full width.

Below 1100 px the lower row becomes one column. Below 960 px the order becomes verdict, issues, totals, route. Below 720 px the matrix becomes a day list and the totals become one stacked card.

### Verdict

- It shows the score, the band word, a bar, one sentence and one button.
- The band comes from the existing band helpers. The sentence comes from the existing band sentence helper. The sample text in the mockup is not product copy.
- The sub-line is a summary. It states the issue count and the severity of the worst issue, for example "3 issues, 1 high severity". It never repeats a warning title. This keeps the one-copy rule: each warning title appears only in "What needs you".
- The button reads "Fix N issues" when warnings exist. It opens the Timeline at the first issue in the existing warning rank. It reads "Open Timeline" when none exist. If the first ranked warning is trip-wide, the button uses the trip-wide focus target.
- The empty plan shows a dash for the score, the chip "Not scored yet" and no bar.
- The verdict has no decorative blob and no side stripe. The band shows in the score, the chip and the bar.

### What needs you

- One card replaces "Trip health" and the old actions card.
- Each row has a severity label, a title, a fix sentence and a "Fix Day N" button.
- A warning that has no day (`dayIndex` is `null` or missing) is trip-wide. Its button reads "Fix" with no day. The current day focus cannot address it, because `canFocusDay` (`src/lib/tripFocus.ts` line 85) accepts only a day that exists. The Timeline shows trip-wide warnings in their own block (`TimelineTab.tsx` lines 733-745). The button uses the one-shot trip-wide target in "Focus wiring".
- The card shows three rows. A text button opens the rest in place and changes to "Show fewer".
- The empty card says "Nothing to check yet" when the plan has no stops. It says the plan flows when the plan has stops and no warnings.
- Every issue button uses the same verb, "Fix".

### Route card

- The card draws the trip as an SVG with no external tiles.
- The route follows the true shape of the stops. The projection is the one the existing route snapshot uses. It scales to fit and uses the cosine of the latitude. North is up. The drawn bounds are centred. The curves are smooth.
- The caption says "Schematic route" when the drawing is not measured road geometry. It says "Measured road" only when a routing service supplies the drawn geometry.
- A flight or train trip uses neutral schematic connectors. Do not call the connectors a road. Do not show road distance or drive time for these trips.
- The road is one thick line with a casing and a cream dashed centre. It is the hero.
- Each leg is its own path, so each leg can draw in and light up alone.
- The plate is a flat stylised landscape. It has a sky wash, a sun or moon, one quiet ground layer and soft contour lines.
- This release draws no ridges, snow caps, sea or river. The product has no reliable point-elevation or water data.
- Light mode is a morning landscape. Dark mode is a dusk landscape.
- The card reads one route view model (see "Route view model" in the Porting map). A point is not only a coordinate and a day. It has a kind, a stop id, a title and an arriving leg.
- Pins are numbered dots. Only the start and the end carry a tag and a city name.
- A pin is a small face over a 44 px transparent hit circle.
- A pin is a button only when its hit circle fits between its neighbours. The start and the end always are.
- Points that sit within one hit-circle diameter of each other after projection share one pin group. A round trip is the main case: the return point has the same coordinate as the start (`tripRoad.ts` lines 66-71). The group draws one pin and one 44 px hit circle, so two targets never overlap. Its tag reads "Start and end". Its tooltip names both rows. The return row in the stop list has no pin of its own. It lights the group pin on hover or focus. The same rule covers a destination point that falls within the hit-circle diameter of another point.
- A pin without room loses its number. The stop list carries the detail.
- A tooltip opens on hover and on keyboard focus. It names the stop and the day. It gives the arriving leg when the road is measured. Escape closes it.
- Under the map sits one summary line: distance, drive time, days and stops. The road states are:
  - Pending: days and stops only. No distance, no time.
  - Failed: days and stops only. A note reads "Road not measured". A "Try again" button calls the road view's `retry`. This state is separate from pending.
  - Measured with every leg from a real router: distance and time of the whole chain.
  - Measured with some legs on the straight-line fallback: `resolvedLegs` accepts a chain when any leg is measured (`tripRoad.ts` line 162). The aggregate then reads "about N km" and "about H h M min". A note reads "K of M legs estimated". The summary never claims a measured road for a chain that holds estimates.
- Each leg figure on a row or in a tooltip follows the leg's `source`. A leg with `source` equal to `estimate` carries the existing `estimated` flag (as `correctionsFromLegs` sets it, `tripRoad.ts` line 269). Its figures end with "(est.)", the suffix the Map pins use. Its tooltip adds "Straight-line estimate, not a measured road." A leg without a flag shows plain figures.
- Under the summary sits a stop list with one row per route view model row. The rows are the start, every stop, the return point of a round trip and the destination tail. A day with three stops gives three rows. The list scrolls above eight rows and fades at the foot.
  - The start row reads "Start" and the start name. It has no arriving leg and no day.
  - A stop row reads the stop title and "Day N". The pin number is the stop order across the trip.
  - The return row reads "Return" and the start name. It has an arriving leg. It opens the Map with no stop.
  - The destination row reads "End" and the last destination name. It has an arriving leg. It opens the Map with no stop.
  - A row whose previous chain point has an invalid coordinate shows no arriving leg. The leg index would no longer match.
- The pin, the list row and the arriving leg highlight together on hover or focus.
- The road draws in once. The ridges settle by one or two pixels. Reduced motion shows the final picture at once.
- Zero or one mapped point keeps the existing empty state. The route needs two valid points.
- On a phone the plate changes to a taller aspect. Lines and text grow in plate units so they stay readable.
- The public itinerary page keeps the old route component with inert pins.

### Totals row

- Three slim tiles: total cost, cost per person and travel effort.
- The travel effort tile shows the effort and the overnight bases.
- Distance and stop count move to the route card summary.
- The empty plan shows dashes and a short hint under each.

### Day matrix

- One grid row per day and one column per part of the day. The parts are breakfast, lunch, fuel, stretch, dinner and stay.
- Each cell shows one of three states: filled, auto-added or open. A part that the day does not hold shows as "not in this day".
- A key in the card header names the three states.
- The grid answers arrow keys, Home, End and Enter. One cell holds the tab stop.
- A tap on a cell opens the Timeline at that cell's day. When the cell is filled, it also asks for the stop that fills it (`DaySlot.filledStop`, `src/lib/daySlots.ts` line 96). An open or auto-added cell opens the day only. The Timeline has no slot-level anchor, so the matrix does not pass a slot key. A tap on a day opens the Timeline at that day.
- The three existing notes (stale, unverified, not counted yet) stay. They move into one quiet line under the grid.
- At 720 px and below the grid becomes a list. Each day is one 44 px button that names every state in words.
- The matrix reads the plan on screen. It has no loading or failed state of its own.

### Quiet blocks

- Group pulse, fixed commitments, recent activity and weather use a border-only block. They have no shadow.
- Group pulse links to the open decisions. It holds the "Invite travellers" action in its header.
- Each block that reads data shows four separate states: loading, failed (with retry), empty and ready. A kept state shows the last rows with a note.
- Loading and failed apply to the reads only: weather, decisions and activity. The verdict, issues, totals, route, commitments and matrix come from the plan on screen.
- Only the first failed block on the page is an alert. The other failed blocks are status regions.
- `StateBlock` gives `role="alert"` to every failed block (`src/components/page/StateBlock.tsx` lines 17-21 and 50). Three failed reads give three alerts. So the change adds an optional `role` override prop to `StateBlock` and to `stateBlockRole`. The override accepts `'alert'` or `'status'`. With no override, the roles stay as today, so every other caller is unchanged.
- "First" means first in page order. The Overview keeps one ordered list of its read-backed blocks: group pulse, recent activity, weather. A pure function takes the list and the failed set and returns the one key that is an alert. The Overview passes `role="status"` to every other failed block. If the first failed block recovers, the next failed block becomes the alert.
- `StateBlock.tsx` and `tests/state-block.test.ts` are in the touch list. See the Porting map and the test table.

### Honesty rules

- A failed read must never render as empty (R23). The three states stay in separate branches.
- The empty plan shows dashes. It never shows a zero as a stand-in for a missing number.
- The sample data in the mockup must never reach the product. Every figure comes from the plan, the road measurement or a read.

### Type, colour, spacing and motion

- Card and block titles use the body face at weight 800, 18 px, line height 1.3 (R20).
- The one display numeral is the verdict score: 40 px, 34 px on a phone. Totals values use the display face at 18 px.
- Every colour is a token or a mix of tokens. The number on the end pin uses the accent foreground token.
- Every gap and padding uses a spacing token. Inline style carries dynamic values only.
- Padding and margin use logical properties.
- Every motion uses the motion tokens. No rule uses `transition: all`. Every animated rule has a reduced-motion opt-out.
- Tap targets are 44 px on touch and 40 px with a fine pointer for the in-card buttons.

## Testing Decisions

### What a good test checks

A good test checks what the user can see or do. Examples are which states exist, which button opens which tab and which text is announced. It does not check class order or markup depth.

The repo runs Vitest in a node environment with no DOM. So a test checks pure logic and source text. It does not mount React.

### The one seam

Use one seam: the Overview and workspace modules read as source text, plus the pure functions they export.

This is the highest seam that `npm run verify` can run today. It is the seam that `overview-tab-classes`, `overview-truth`, `overview-warnings` and `trip-deep-link` already use. It needs no browser.

New logic must go into pure functions that the seam can call. Examples are the route projection, the pin hit-circle test, the stop-list rows and the terrain model. The components stay thin.

### What the seam must pin

- Every tab key still renders one tab with an `aria-controls` that matches its panel.
- The header folds for the Board and Map tabs and for no other tab.
- The "Invite & share" button shows only when the viewer can edit.
- The verdict button reads "Fix N issues" or "Open Timeline" from the warning count.
- The empty plan reads a dash and "Not scored yet".
- Each warning appears once on the page. The first three show and the rest sit behind the toggle.
- Failed, loading, empty and kept are separate branches for activity, decisions and weather.
- Only one alert role exists for failed blocks. The pure alert function returns the first failed key in page order. It returns a later key when the first block recovers. `stateBlockRole` with an override returns that override. Without an override it returns today's roles.
- The verdict sub-line contains no warning title.
- The route view model keeps the order and count of `overviewRoutePoints`. Each row has a kind, a stop id for stop rows, a title and an arriving leg. Rows for a round trip, a destination tail and a point with an invalid coordinate follow the row rules above.
- The projection keeps north up and centres the bounds.
- A pin is a button only when its hit circle fits. The start and the end always are. Co-located points merge into one pin group with one hit circle.
- A leg with `source` equal to `estimate` shows the estimated flag. The aggregate summary follows the road states above.
- A trip-wide warning, a stop-less cell and a filled cell each map to the target in "Focus wiring".
- The page states loading, not found, signed out and failed as four separate branches. None uses `loading-block`.
- The terrain model returns the flat plain. It accepts no invented elevation or water input.
- The new click props are optional. A caller that omits them renders no button.
- The public itinerary page does not pass the new props.

### Prior art

- The class-pin test for the Overview, the Overview truth and warnings tests, and the native read-state test.
- The tab deep-link test and the workspace audit test.
- The page-consistency test (fonts, `page-enter`, page skin scope) and the design-system test (motion, spacing, contrast, glass blur).
- The rail-overflow test, which pins the tab bar mask states.

### Evidence outside the seam

These checks are not tests. They are proof the builder must attach:

- Browser screenshots of every state in the acceptance table, taken with the `verify-yatraflow` skill.
- The `check:motion` run for the motion rules.

## Out of Scope

- A change to the health score, the warning rank or any engine rule.
- A change to the Board, Map, Timeline, Group input, Budget, Share or Settings content.
- The Create trip flow and the public itinerary page.
- A new data source or a new network read for elevation or water. This release uses the flat plain.
- Real road measurement changes. The leg figures show only when the road is measured.
- Generated region art. The header cover uses the existing art component until generated art lands.
- A change to routing, deep-link grammar or tab slugs.
- A new tab or a removed tab.
- Any push, pull request or merge. See Further Notes.

## Further Notes

### Review changes

A code review read this spec against `origin/test` at `dc897c4e`. The spec needs the following:

- The Overview has one alert for failed blocks. `StateBlock` gets a role override, and a test pins first-failed and later-failed behaviour.
- The route card reads a route view model. Each point has a kind, a stop id, a title and an arriving leg. A bare coordinate and day is not enough.
- Focus from the Overview uses new workspace signals: a Timeline target (day, stop, trip-wide block) and a Map stop target. The matrix passes no slot key.
- The verdict sub-line summarises the issues and does not repeat a warning title.
- A trip-wide warning has a one-shot Timeline block target.
- The road summary has four states: pending, failed, measured and partly estimated. A leg estimate shows the existing `estimated` flag.
- The page-consistency ratchet has stated targets and the root element structure is fixed. `TripWorkspace.tsx` leaves the page root allowlist.
- The workspace loading and not-found states use `StateBlock`. A failed read must not read as not found.
- The Map already loads a DEM. The Overview still cannot sample it without a new read. This release uses the flat plain.
- A round trip draws one pin group for the start and the return point.
- The 20 decisions below close the implementation questions.

### Known weaknesses of the mockup

Read these before you trust a pixel.

- Contrast. The matrix dashed edge was raised from 2.3:1 to 3.6:1 (light) and 4.3:1 (dark). No ratio was recorded for the terrain. This covers snow caps, foam, contour lines, pin tags and stop numbers over the landscape. Measure them before you ship. The design-system contrast gate does not read SVG paint.
- Tall and thin routes. A straight north-south route fills only 47% of the plate height. A route that is much taller than wide leaves empty sky at the sides. The mockup has no rule for it.
- Fourteen stops. At 390 px only the start and the end pins stay interactive. The other twelve rely on the stop list. A trip with a loop and many stops is the hardest case. The mockup has no true round trip sample. The `loop` alias maps to a straight coast route, not a loop. The round-trip note of the real component is not drawn.
- Sample-data oddities. Stops are picked by a fixed list, so the default route jumps from Gangtok to Chandigarh. The 14-stop trip zig-zags between Gangtok, Pelling, Darjeeling and Kalimpong. Leg time uses one speed for every trip. Leg distance is a straight line times 1.18. The header says 4 travellers and shows 3 members. These are sample facts. Real values come from the trip.
- Terrain data. Elevations, the sea flag and the river flag are mockup constants. No API in the app returns the elevation of a point, and no data holds a sea or river flag. The Map does load terrain data. It uses AWS Terrain Tiles as a DEM source (`src/lib/mapViewModes.ts` lines 26-32). The map adds it in terrain and 3D modes (line 134). The Overview has no map instance, so it cannot read that source today. This release uses the flat plain.
- Page height. At 390 px the Overview is 22.5% shorter, not the 25% goal. At 1440 px it is 18.9% shorter. The route card stop list adds about 230 px.
- The Board and Map panels in the mockup are placeholders. The mockup does not prove the real Map tab keeps its height under a folded header at 1280 by 800.
- The mockup uses a literal blur value on the tab bar. The product has a blur token.

### Gaps between the mockup and the code

These are facts, not decisions. The Porting map lists the code lines.

- The mockup folds the header on Board and Map. Today only Board compacts, and it hides only the member row and trims padding. The consistency plan says "compact-on-scroll". The mockup does not scroll-compact.
- The mockup container is 1400 px, with 1720 px for Board and Map. Today they are 1180, 1680 and 1760 px. The page skin rule gives 1240 px to a container that carries the skin class.
- The mockup tab bar has its own rules. The product tab bar is a shared look class used by the workspace, Admin and a test.
- The mockup serif title class is not the class that R14 allows.
- The mockup draws presence as dots on member avatars. The product shows a separate presence stack of people who may not be members, plus a "Just you viewing" state.
- The mockup shows "Invite & share" at all times. The product shows it to editors only.
- The mockup does not draw the "Trip not found" or "Loading trip" states of the page. They are plain text lines today. The not-found line also shows for a signed-out viewer and for a failed read.
- The mockup does not draw the round trip note, the cover emoji fallback or the 1 stop case. It also draws no co-located start and return pin.
- The mockup route point is a coordinate with a day. The product needs a stop id and a kind for each point. One day holds several stops. The road chain adds a return point and a destination point with no day.
- The mockup verdict names the first warning, and the issues card lists it again. The one-copy rule forbids this.
- The mockup has no row for a failed road measurement. It has none for a chain with estimated legs.
- The tab list in the mockup answers left and right arrows. The product hook also answers up and down.
- Mockup card text, band word "Tight" and all warning text are sample copy.
- Today's Overview has four stat tiles. The mockup has three.
- Click targets other than "Open map" do not exist today. Every new target needs a new optional prop.
- Existing Overview rules use the `ovw-` prefix. Some names collide with the mockup names. See the Porting map.

### Resolved implementation decisions

The decisions below close all 20 open questions.

1. Header fold. The header folds on Board and Map only. It stays open on the other six tabs.
2. Container widths. Normal tabs use 1400 px. Board and Map use 1720 px. Check the Map rail at 1720 px.
3. Tab bar. Use `SegmentedTabs` with `semantics="tablist"`. Keep the existing tab order and keyboard contract.
4. Serif title. Use `.yf-header-title`. Do not add another serif class.
5. Cover. Use the uploaded image first. Use the saved emoji second. Use `TripArt` last.
6. Verdict action. Open the first ranked issue. A trip-wide issue opens the trip-wide Timeline target.
7. Day matrix. Keep the matrix on the Overview.
8. Phone height. Accept the 22.5% height reduction at 390 px. Keep all four quiet blocks.
9. Terrain. Ship the flat plain. Do not add a DEM read in this release.
10. Water. Draw no sea or river.
11. Presence. Keep members and presence as separate rows. Presence can name a viewer who is not a member.
12. Browser motion check. Keep the signed-in workspace out of CI `check:motion`. Run the existing check and a local browser check.
13. Release split. Use three local commits for three PRs. The honesty foundation lands first. The header lands second. The Overview lands third.
14. Old Overview rules. Leave dead rules to P16. This release removes no old CSS.
15. Verdict sub-line. Summarise the issue count and the worst severity. Never repeat a warning title.
16. Trip-wide issue. Add a one-shot Timeline block target. Move focus to the trip-wide block after the Timeline opens.
17. Estimated legs. Show "about" figures and "K of M legs estimated". Mark each estimated row with "(est.)".
18. Co-located pins. Merge points within one hit circle into one pin group. Give the group one 44 px target.
19. Signed out and failed reads. A signed-out trip link shows a sign-in prompt. The `next` value must be a validated trip path. `readSharedTrip` keeps `failed`, `unavailable` and `cancelled` separate.
20. Map targets. A stop target selects its stop and sets the shared day. A coordinate or bounds target clears the day filter.

### Additional contracts

- `readSharedTrip` returns `found`, `unavailable`, `failed` or `cancelled`. The compatibility `fetchSharedTrip` returns a trip or `null`.
- A failed, loading or empty read has its own state. Failure never renders as empty.
- `StateBlock.titleLevel` accepts `h1`, `h2` or `h3`. `StateBlock` accepts an optional `role` of `alert` or `status`.
- A flight or train trip uses neutral schematic connectors. It shows no road distance or drive time.
- The eight tabpanel shells stay stable. Only the active shell mounts content.
- Folded header content becomes inert only after focus moves to the active tab.
- The header has one responsive invite button. Do not render a second copy.
- The route caption reads "Schematic route" unless measured road geometry is drawn.

### Process rules

- Never push. Never open a pull request. The user says when a batch is finished (AGENTS.md section 2.1, 2.8 and 2.11).
- After the user agrees, open one pull request into `test`. Do not merge it. Close the issues it names by hand after the merge (section 2.12).
- Work only in your own clone (section 2.16). Cut the branch from `origin/test`. Run `git fetch origin` with no wildcard refspec.
- Claim the work before you start: assign the issue and run `git ls-remote --heads origin` for the issue number (section 2.4).
- The honesty foundation lands before the visual pass (R23). `readSharedTrip` keeps failure separate from an unavailable trip.
- Write all new prose in Simplified Technical English (section 2.13).

---

## Porting map

Line numbers are for `origin/test` at `dc897c4e`. Re-derive them before you edit. Paths are relative to the clone root.

### Files you will touch

| File | Lines (origin/test) | Job |
| --- | --- | --- |
| `src/pages/TripWorkspace.tsx` | 587 total. Tab table 108-117. Timeline focus state 255-260. Shared focus 294-304. Not-found and loading branches 337-342. Container 376. Header 377-422. Tab bar 424-441. Panel 443. Overview call 444. Board fallback 449. | New header and tab bar markup. Fold flag. Page states with `StateBlock`. New focus handlers. Pass new props. |
| `src/pages/trip/OverviewTab.tsx` | 645 total. Props 89-95. Verdict area 140-175. Stat tiles 178-183. Priority actions 186-210. Route card 214-249. Commitments 253-277. Activity 279-305. Group pulse 310-338. `WeatherCard` 348-500. `SlotMatrix` 502 on. | Rebuild markup. Add optional props. |
| `src/components/ui.tsx` | `RouteSnapshot` 554 on. `catmullRomPath` 691. `StatTile` 703. | Reuse the projection and the smoothing. Do not break the public caller. |
| `src/lib/overviewTruth.ts` | `overviewRoutePoints` 43-54 | Source of route points. Keep its return value. Add a sibling that returns the route view model. See below. |
| `src/lib/overviewWarnings.ts` | `rankWarnings` 18, `warningKey` 28, `severityLead` 42 | Reuse. `ScheduleWarning` carries `dayIndex`. |
| `src/lib/healthBand.ts` | helpers | Reuse for the verdict band, tone and sentence. |
| `src/components/page/SegmentedTabs.tsx` | tablist variant | Use it with `semantics="tablist"`. Keep the shared tab-bar look. |
| `src/components/PillNav.tsx` | glider | Today's glider. |
| `src/hooks/useTablist.ts` | roving focus | Keep. |
| `src/components/page/StateBlock.tsx` | `stateBlockRole` 17-21, root 50 | Add the optional `role` override. Use `size="compact"` for every state in a tab. Use `size="full"` for the page states. |
| `src/lib/tripRoad.ts` | `buildRoadChain` 50-81, `resolvedLegs` 162, `correctionsFromLegs` 255-276 | Additive only: parallel arrays for the point kind and the stop id, beside `ptDay`. Do not change `points`, `ptDay`, `outboundCount`, `roadChainSig` or the legs. |
| `src/pages/trip/TimelineTab.tsx` | props 101-126, focus effect 534-547, trip-wide block 733-745 | Optional `focusBlock` prop (one shot) and an anchor on the trip-wide block. |
| `src/pages/trip/MapTab.tsx`, `src/components/TripMap.tsx` | MapTab props 147-180; TripMap `selectedStop` 570 | Optional one-shot stop focus prop that selects the stop. |
| `tests/page-consistency-baseline.json` | `pageRootAllowlist`, `pageFiles` | Remove `TripWorkspace.tsx` from the allowlist. Regenerate the counts. See "Page structure". |
| `tests/state-block.test.ts` | role cases | Add the override cases. |
| `src/store/store.ts` | `readSharedTrip` | The foundation commit supplies this reader. The visual lanes consume it. |
| `src/components/trips/TripArt.tsx` | `TripArt({ region })` line 146 | Header cover art. |
| `src/styles.css` | 12,275 lines. Append at the end. | New rules. See below. |
| `tests/overview-tab-classes.test.ts` | pins `Surface` class strings and counts | Must change. |
| `CHANGELOG.md` | `[Unreleased]` | One final-state entry. |
| `ROADMAP.md`, `docs/consistency/app-consistency-plan.md` | P2, P12 rows | Tick in the same commit if the rows exist. |

New files are allowed. Suggested names: a pure route and terrain module under `src/lib`, and one test file beside the existing Overview tests.

### Mockup block to React component and class

| Mockup block | Real target | Class or note |
| --- | --- | --- |
| `div.yf-page` wrapper | New wrapper in `TripWorkspace` around header and tab bar | Wrapper only. `.container` must not carry `yf-page` (R15). |
| `header.yf-trip-head` with `data-compact` on the wrapper | Replaces `.trip-head-card` | The fold flag is `tab === 'board' \|\| tab === 'map'`. |
| `.yf-back` | The existing "All trips" button | Keeps `onNavigate('trips')`. 44 px tall. |
| `.yf-thumb-slot`, `.yf-thumb` | Cover slot with the image, emoji or `TripArt` | Replaces `.trip-cover-badge`. Use the stated fallback order. |
| `h1.yf-header-title` | The trip name | Serif, R14. Do not add a second serif class. |
| `.yf-fold`, `.yf-fold-in`, `.yf-fade` | Facts line wrapper | Keeps the existing facts string (lines 387-389). |
| `.yf-head-actions` | One responsive "Invite & share" button | Keep the `editable` gate. Use an outline pill. |
| `.yf-extra`, `.yf-members` | Member stack, count note, presence | Reuse `Avatar`, `presenceRow`, `userById`. Keep the role text. |
| `.yf-avatar` with `.dot` and `.tip` | Existing `.presence-peer`, `.presence-dot`, `.presence-tip` | Keep members and presence separate. Do not copy the mockup avatar colours. |
| `.yf-tabbar`, `.yf-glider`, `.yf-tab`, `.yf-count` | `SegmentedTabs` with `.tabbar`, `.tab-btn`, `.tab-count` | Use `semantics="tablist"`. Keep `id`, `aria-controls`, `data-pill-key`, `useTablist`. |
| `.container` with width variants | `.container`, `.container--board`, `.container--map` | Normal tabs use 1400 px. Board and Map use 1720 px. |
| `.tab-panel` | Existing `tab-panel` div | Keep `key={tab}` and the ARIA ids. |
| `.ovw-verdict` | New markup in `OverviewTab` | Replaces "Trip briefing" and "Trip health". |
| `.ovw-needs`, `.ovw-need`, `.ovw-sev`, `.ovw-more-btn` | Replaces "Priority actions" | Keep `rankWarnings`, `warningKey`, `severityLead`. |
| `.ovw-stats`, `.ovw-stat` | Three `StatTile` replacements | Merge "Travel effort" and "Stops planned". |
| `.ovw-route`, `.ovw-map`, `.ovw-stoplist` | New route card component | Same empty branch. `PublicItinerary` keeps `RouteSnapshot`. |
| `.tr-*` layers | Flat landscape layer of the route card | Draw no ridges, snow, sea or river. |
| `.rm-*` road, pins, tooltip | Road layer of the route card | One path per leg. |
| `.mx-*` | `SlotMatrix` | New grid markup and keyboard handler. Keep `daySlots` and `matrixFreshness`. |
| `.ovw-block` group pulse, commitments, activity | Existing `Surface` blocks | Quiet class. Pass `onOpenDecisions` through. |
| `.ovw-weather`, `.ovw-wx` | `WeatherCard` | State logic stays. |
| `.yf-state` copies | `StateBlock size="compact"` | Do not copy the mockup rules. |

Do not port the mockup-only items. They are: `.mock-bar`, `.mock-note`, `.mock-toast`, `.app-nav-stub`, `.notes`, `.ph-*` placeholders, the Guides overlay, the query parameters and every sample constant.

### Route view model

`overviewRoutePoints` returns `{ lat, lng, day | null }` and nothing more (`src/lib/overviewTruth.ts` lines 23-29 and 43-54). `buildRoadChain` adds the start with `day` null, the round-trip return with `day` null, and the destination tail with `day` null (`tripRoad.ts` lines 53-79). A day can hold several stops, so a day does not identify a stop. A bare coordinate and day cannot give one list row per stop, a stop-level Map target or an honest leg for each row.

The route card reads this view model, one row per chain point that has a valid coordinate:

| Field | Meaning |
| --- | --- |
| `key` | Stable row key: `start`, `stop:<stopId>`, `return`, `destination`. |
| `kind` | `start`, `stop`, `return` or `destination`. |
| `lat`, `lng` | The coordinate. Same predicate as `overviewRoutePoints` (`coordValid`). |
| `dayIndex` | The day for a stop row. `null` for the other kinds. |
| `stopId` | The stop id for a stop row. `null` for the other kinds. |
| `title` | The stop title, the start name or the last destination name. |
| `chainIndex` | The index of the point in the unfiltered chain. The leg that arrives at the point is `legs[chainIndex - 1]`. |
| `arrivingLeg` | `{ distanceKm, durationMinutes, estimated }` or `null`. `null` for the start, while the road is not measured, and when the previous chain point was dropped for an invalid coordinate. |

How to build it:

- Extend `buildRoadChain` with two parallel arrays beside `ptDay`: one for the point kind and one for the stop id. The change is additive. `points`, `ptDay`, `outboundCount`, `hasDestTail` and `roadChainSig` do not change. The existing `tripRoad.test.ts` case that matches `roadChainSig` to the chain still passes.
- Add a sibling function in `overviewTruth.ts` that returns the rows. It uses the same `coordValid` filter and the same two-point minimum as `overviewRoutePoints`. Keep `overviewRoutePoints` and its tests unchanged. The public itinerary page still reads it.
- Take the arriving leg from the road view (`road.legs`) only when `road.status` is `ok`. A leg with `source` equal to `estimate` gets `estimated: true`.
- Do not drop a row because it is close to another one. The projection may merge pins into a group (see the route card rules). The stop list keeps every row.

### Focus wiring

The workspace owns all focus state. Today it holds `timelineFocusDay` and `timelineFocusStop` (lines 255-260), cleared by `clearTimelineFocus`. It also holds the shared `focus` and `sharedDay` (lines 294-304). `TimelineTab` takes `focusDay` and `focusStopId` (lines 101-126). It has no slot key. `MapTab` takes `dayFocus` only (lines 147-180). It has no stop focus.

New props and handlers:

| Where | Addition | Behaviour |
| --- | --- | --- |
| `OverviewTab` | `onOpenTimeline?: (target?: { dayIndex?: number; stopId?: string; block?: 'trip-wide' }) => void` | Today the prop is `() => void`. With no argument the Timeline opens with no focus. |
| `OverviewTab` | `onOpenMap?: (target?: { dayIndex?: number; stopId?: string }) => void` | With no argument the Map opens with no focus. |
| `TripWorkspace` | `openTimeline(target)` | Validates `dayIndex` with `canFocusDay(focusDayRequest(dayIndex), trip)`. Sets `timelineFocusDay`. Sets `timelineFocusStop` only when the stop sits on that day (the rule at lines 285-287). For `block: 'trip-wide'` sets a new `timelineFocusBlock`. Then calls `setTab('timeline')`. A failed validation opens the Timeline with no focus. |
| `TripWorkspace` | `timelineFocusBlock` state | One shot. `clearTimelineFocus` clears it with the other two. |
| `TimelineTab` | `focusBlock?: 'trip-wide' \| null` | A second one-shot effect scrolls to the trip-wide warning block, gives it an id and `tabIndex={-1}`, moves focus to it, then calls `onFocusConsumed`. The existing effect at lines 534-547 returns when `focusDay` is null, so it cannot carry this request. |
| `TripWorkspace` | `openMap(target)` | A stop target sets the shared day focus and a one-shot `mapFocusStop`. A coordinate or bounds target clears the day filter. Then it calls `setTab('map')`. |
| `MapTab` | `focusStopId?: string \| null`, `onFocusConsumed?: () => void` | When set, the Map selects that stop and calls `onFocusConsumed`. `TripMap` owns the selection (`selectedStop`, line 570), so it gets a matching optional prop that selects the stop and flies to it. |
| Route card | `onSelectStop?(row)` | A pin or row for a stop calls `onOpenMap({ dayIndex, stopId })`. Other rows call `onOpenMap()`. |
| `SlotMatrix` | `onSelectCell?(dayIndex, stopId \| null)` | A filled cell passes `DaySlot.filledStop.id`. An open or auto-added cell passes `null`. The Overview calls `onOpenTimeline({ dayIndex, stopId })`. |
| `SlotMatrix` | `onSelectDay?(dayIndex)` | The Overview calls `onOpenTimeline({ dayIndex })`. |
| Verdict and issue buttons | `onOpenTimeline({ dayIndex })` | A trip-wide warning calls `onOpenTimeline({ block: 'trip-wide' })`. |

Every new prop is optional. A caller that omits a prop renders no button. The public itinerary page passes none of them and keeps `RouteSnapshot`.

### Terrain data

The route view model and the road are enough for the road, the pins and the stop list. This release draws a flat landscape.

- The terrain model has one `flat` kind. It carries no ridge, peak, snow, sea or river.
- The order and count of route points do not change.
- The model uses no elevation read and no water flag.
- A later release can add a terrain source and a richer model. Do not invent elevation.

### CSS to append

Append at the very end of `src/styles.css`, under one section comment per area. Never insert above an existing rule (R6). The design-system baseline is keyed by line number. An append keeps it valid.

Groups, with the prefixes from the mockup:

- Header.
  Names: `yf-trip-head`, `yf-back`, `yf-head-row`, `yf-thumb-slot`, `yf-thumb`, `yf-head-text`, `yf-trip-title`, `yf-fold`, `yf-fold-in`, `yf-fade`, `yf-head-meta`, `yf-head-actions`, `yf-extra`, `yf-members`, `yf-member-note`, `yf-viewing`, the 720 px phone block. The h1 also carries the existing `.yf-header-title`.
- Tab bar. Use `SegmentedTabs` with the existing `.tabbar`, `.pill-glider`, `.tab-btn` and `.tab-count`. Add `yf-tabbar` only for workspace spacing. Keep `tests/rail-overflow.test.ts` green.
- Overview.
  Names: `ovw-card`, `ovw-title`, `ovw-head`, `ovw-head-meta`, `ovw-btn` (primary, quiet, review), `ovw-link`, `ovw-verdict`, `ovw-score`, `ovw-score-num`, `ovw-score-of`, `ovw-band`, `ovw-verdict-text`, `ovw-verdict-line`, `ovw-verdict-sub`, `ovw-bar`, `ovw-split`, `ovw-needs`, `ovw-count`, `ovw-need-list`, `ovw-need`, `ovw-sev`, `ovw-need-title`, `ovw-need-fix`, `ovw-need-text`, `ovw-more-btn`, `ovw-stats`, `ovw-stat`, `ovw-stat-label`, `ovw-stat-val`, `ovw-stat-sub`, `ovw-lower`, `ovw-stack`, `ovw-block`, `ovw-block-foot`, `ovw-pulse-row`, `ovw-commit`, `ovw-commit-when`, `ovw-feed`, `ovw-wx`, `ovw-wx-cell`, `ovw-legend`.
- Route card.
  Names: `ovw-route`, `ovw-route-empty`, `ovw-map`, `ovw-rsum`, `ovw-stoplist`, `ovw-stop-btn`, `ovw-stop-pin`, `ovw-stop-name`, `ovw-stop-d`, `ovw-stop-km`, `ovw-stop-t`, `ovw-sample` (drop it; it labels sample data), `rm-case`, `rm-hl`, `rm-road`, `rm-dash`, `rm-leghit`, `rm-pin`, `rm-hit`, `rm-ring`, `rm-dot`, `rm-num`, `rm-tag`, `rm-name`, `rm-tip`, `rm-leg`.
- Terrain.
  Names: `tr-sky`, `tr-glow`, `tr-orb`, `tr-ground`, `tr-contour`, `tr-l`, and the `rmDraw` and `rmFade` keyframes. Do not add ridge, snow, sea or river rules.
- Matrix.
  Names: `mx-scroll`, `mx-wrap`, `mx-th`, `mx-day`, `mx-daycol`, `mx-row`, `mx-cell`, `mx-chip`, `mx-btn`, `mx-g`, `mx-key`, `mx-bar`, `mx-total`, `mx-today`, `mx-fade`, and the phone list `mx-compact`, `mx-crow`, `mx-cday`, `mx-chead`, `mx-ctot`.

Name collisions with rules that exist today. Resolve each with a new name or a same-element compound selector (R5). Do not edit the old rule in place.

| Existing rule (line) | Mockup name | Resolution |
| --- | --- | --- |
| `.stat-grid.ovw-stats` (10221) | `.ovw-stats` | Use a new name such as `.ovw-totals`. |
| `.ovw-route-empty` (10223) | `.ovw-route-empty` | Reuse or rename. Check the values match. |
| `.ovw-card-title` (10430) | `.ovw-title` | Keep one. R20 asks for one title class. |
| `.yf-surface.ovw-panel` (10427-10429) | `.ovw-card` | Choose `Surface` plus a role class, or the new card class. Do not use both. |
| `.avatar` | mockup `.avatar` | Do not port. The product `Avatar` component owns it. |

The old header rules become dead after the port. Their lines are:

- `.trip-head-card` at 2812 and 3764.
- The Board overrides at 1600-1606.
- `.member-stack` at 1604 and 2830.
- `.trip-hero-back` at 2823.

`tests/design-system-baseline.json` lists `.trip-head-card` and `.member-stack` as duplicate selectors. Delete dead CSS in its own commit (consistency plan P16). Re-baseline the design-system file only as that plan says. Prove the diff is line numbers only.

The mockup defines these as new names in `:root`: `--container-w` and `--container-wide`. The product has no such tokens. Add them once at the end of the file, or use the numbers in one rule. Do not define a token twice. The mockup copies the other tokens from the product. Do not copy them again.

### Tokens

These existing tokens exist.

`--motion-fast`, `--motion-med`, `--motion-slow`, `--ease-out`, `--ease-glide`, `--stagger-step`, `--space-1` to `--space-10`, `--radius`, `--radius-sm`, `--radius-lg`, `--shadow-card`, `--shadow-soft`, `--ring`, `--yf-nav-glass`, `--yf-glass-border`, `--yf-blur-nav`, `--btn-accent`, `--btn-accent-fg`, `--font-serif`, `--font-body`, `--font-display`

The colour tokens that the mockup lists also exist.

The terrain colours are mixes of tokens with `color-mix`. The dark theme needs its own mixes (snow, foam, line). The mockup sets them. Check each one against the contrast gate.

### Motion and reduced-motion duties

- Every duration comes from a motion token. A raw `ms` value in a new rule is a review flag (AGENTS.md section 2.10).
- Header fold, thumb, title and members: `--motion-slow` with `--ease-glide`.
- Glider: `--motion-med` with `--ease-out`.
- Hover and ring: `--motion-fast`. Tooltip: `--motion-med`.
- Road draw-in: `--motion-slow`, delay one `--stagger-step` per leg, capped at eight legs.
- Ridge settle: twice `--motion-slow`.
- The workspace root keeps `page-enter`. The shared rule gives its children the entrance. The new wrapper must be a direct child so it takes part.
- Add a reduced-motion rule for each new animated rule, or one rule that covers the new scope. The design-system test checks the opt-out.
- The page-block motion check in CI samples page roots in a real browser. Do not add a block that appears between two frames.

### Tests to update or add

| Test | Action |
| --- | --- |
| `tests/overview-tab-classes.test.ts` | Update. It pins `<Surface className="card` counts (10), `enterIndex` counts, 11 title headings, the "Group pulse" heading, five `kind="empty"` uses, the empty-state titles and one inline `style=`. Rewrite to the new markup. Derive each new count from the final markup and change it in the same commit. Keep these true: every card root is a `Surface` with an `enterIndex`; every card heading uses one title class; the empty states use the compact `StateBlock`; only the verdict bar width stays inline (`style=` count 1, matching the page-consistency target). Keep the two exact-rule pins because this release removes no old CSS. |
| `tests/state-block.test.ts` | Update. Add cases for the role override: `alert` on a failed block, `status` on a failed block, and no override. The default roles for all five kinds stay as today. |
| New: route view model test | Pin the rows for a one-way trip, a round trip (start, stops, return), a destination tail, a trip with an invalid coordinate (the arriving leg is `null` for the next row), and an unmeasured road (no arriving legs). Pin the co-located merge rule. Pin the estimated flag. |
| New: alert function test | Pin first-failed alert, later-failed status, and the switch when the first block recovers. |
| `tests/overview-truth.test.ts`, `overview-warnings.test.ts`, `overview-native-read-state.test.ts`, `health-band.test.ts` | Keep green. They pin logic you reuse. |
| `tests/trip-deep-link.test.ts`, `workspace-audit-a6-a8.test.ts`, `presence.test.ts`, `presence-list.test.ts`, `trip-focus-wiring.test.ts` | Keep green. Read them before you edit the header. |
| `tests/rail-overflow.test.ts` | Keep green. It pins the tab bar mask rules for the `.tabbar` class. |
| `tests/page-consistency.test.ts` and `tests/page-consistency-baseline.json` | Keep green. The test pins the serif scope (`.ex-hero h1`, `.yf-header-title`), `page-enter` on page roots, and the page skin class. It reads page scope from the whole file (line 35). Remove `TripWorkspace.tsx` from `pageRootAllowlist`. Regenerate the baseline with `UPDATE_PAGE_CONSISTENCY_BASELINE=1` for the falls listed in "Page structure". Prove the diff holds falls only. |
| `tests/design-system.test.ts` and its baseline | Keep green. Append CSS only. Re-baseline only by the documented step. |
| New: header test | Pin the fold rule, the `editable` gate and one tab with `aria-controls` per tab key. |
| New: Overview view-model test | Pin the verdict button text, the warning toggle, the state branches and the alert rule. |
| New: route and terrain test | Pin the projection, the pin hit-circle rule, the stop-list rows and the flat-plain fallback. |

Convert CRLF to LF when a test scans source text (AGENTS.md rule). Tests must not count prose that quotes a pinned literal (CODING_STANDARDS pitfall on source-scanning guards).

### Gate checklist

Run each command in the clone. Paste the last lines of the output into the report.

- [ ] `npm run clean:env`. Clear `NODE_ENV` before any install.
- [ ] `npm run verify` (type check, lint ratchet, STE lint, Vitest, build).
- [ ] `npm run lint:ratchet`. Never raise `eslint-baseline.json`.
- [ ] `npm run lint:ste` on every changed prose file, including the changelog entry.
- [ ] `npm run check:ui`.
- [ ] `npm run check:motion` (runs the build, then the browser motion check).
- [ ] `tests/page-consistency.test.ts` green. The baseline diff shows falls only, plus the removal of `TripWorkspace.tsx` from the allowlist.
- [ ] `tests/design-system.test.ts` green with no baseline change. If you need one, use the documented step and prove the diff is line numbers only.
- [ ] Screenshots for every row of the acceptance table, taken with the `verify-yatraflow` skill. Hand the user the exact localhost URL (section 2.7).
- [ ] Confirm the dev server compiles in the backend (section 2.7). A signed-in check needs a session on that port.
- [ ] `git status -sb` and `git log --oneline -5` agree with your report (section 2.6).

### CHANGELOG rule

Edit `CHANGELOG.md` with editor primitives only. Never use a script, a heredoc or shell interpolation (section 2.9). Check the diff stat after the edit.

Add one entry under `[Unreleased]`. The first bold sentence states the user-visible result. The entry states final state, not session history. It names no branch, round or finding story. Issue numbers may trail the entry. Write it in STE.

### Hard rules from AGENTS.md that apply here

- Never push to `main`. Never push at all before the user says (sections 2.1, 2.8, 2.11).
- Every push ships a changelog entry in the same commit (2.2).
- Links must use `appLink(path)` (section 1).
- Keep failed, loading and empty states separate. Do not invent data.
- Append CSS only at the end of `src/styles.css`.
- Edit with unique anchors. Read the "Scripted edits" section of `CODING_STANDARDS.md` before any scripted edit.
- The serif face appears only on the page title. The handwritten face appears at most once per page and never in a state block (R14).
- Use the compact `StateBlock` inside tabs and cards (R22).
- New interactive surfaces ship motion from the tokens (2.10).
- Lint is a ratchet. Never add errors (2.14).
- Work only in your own clone (2.16).
- Tests run in a node environment with no DOM (section 1).

### Acceptance table: mockup state to real state

Every row must pass in four views: 1440 px light, 1440 px dark, 390 px light, 390 px dark. Attach a screenshot for each cell. A cell without a screenshot fails review.

| Mockup state | Real state | Must show | Must not show |
| --- | --- | --- | --- |
| Overview `state=ready` | A trip with stops, warnings and all reads done | Verdict with score, band, bar and "Fix N issues". Three warning rows and the toggle. Route card with road, pins and stop list. Three totals. Matrix. Four quiet blocks. | A second copy of any warning. Text links with arrows. A zero as a stand-in for a missing value. |
| Overview `state=loading` | Slice reads in `reading` | Compact loading blocks for weather, decisions and activity. Plan-based blocks fully drawn. | A loading block on the verdict, issues, totals, route, commitments or matrix. |
| Overview `state=failed` | A slice read failed | A failed block with a retry for each failed read. One alert role only, on the first failed block in page order. The others are status regions. | A failed read drawn as an empty block. Two alerts. |
| Overview `state=failed`, three reads | Group pulse, activity and weather all failed | Exactly one `role="alert"` on the page (group pulse). Two `role="status"` failed blocks. After the first retry succeeds, the activity block becomes the alert. | Three alerts. |
| Overview `state=empty` | A trip with no stops | Dash score, "Not scored yet", "Open Timeline", "Nothing to check yet", the route empty state, dash totals, the matrix empty state. | Any number above "Nothing planned yet". A zero total. |
| Overview `state=kept` | A read failed after a good read | The last rows with a note and a retry. | The note without the rows. A blank block. |
| Route card, no terrain data | Elevation or water missing | The road, pins and stop list on a flat plain. | Invented ridges, sea or river. |
| Route card, road pending | Road not measured yet | Days and stops in the summary. No distance or time on rows. | A guessed distance or time. |
| Route card, road failed | `road.status` is `failed` | Days and stops in the summary. "Road not measured" and a "Try again" button. | A distance or time. A note that reads as pending. |
| Route card, partly estimated | A chain with at least one `estimate` leg | "about" before the aggregate, "K of M legs estimated", "(est.)" on each estimated row and the tooltip note. | A plain figure on an estimated leg. |
| Route card, round trip | Start and return at one coordinate | One combined pin tagged "Start and end" with one 44 px target. A return row in the list that lights that pin. | Two overlapping targets. A return row with a pin of its own. |
| Route card, many stops on one day | A day with three stops | Three rows and three pins, each with its own title and "Day N". A pin opens the Map at its own stop. | One row for the day. A pin that opens the wrong stop. |
| Warning button, trip-wide | A warning with no day | "Fix" with no day. The Timeline opens and focuses the trip-wide block. | A button that opens a stranger day. |
| Matrix cell | A filled cell and an open cell | A filled cell opens its day and its stop. An open cell opens its day. | A slot-level scroll that does not exist. |
| Route card, fewer than two points | Fewer than two valid coordinates | The existing empty state with its text. | One pin or a line. |
| Header, open | Overview, Timeline, Group input, Budget, Share, Settings | Back control, cover, serif title, facts line, members row, outline invite button for editors. | Invite button for a viewer without edit rights. |
| Header, folded | Board, Map | Back control, small cover, small title. Members row and facts line hidden and not focusable. On a phone the invite button sits top right. | A hidden control that still takes focus. Layout jump during the fold. |
| Header, presence | Peers, solo, none | Peer names in tooltips. "Just you viewing" when alone. | A peer shown as a member when they are not one. |
| Tab bar | Any tab | One active tab with the glider. Count badge on Group input when items are open. Edge fade when the bar scrolls. | A tab without `aria-controls`. A tab stop on every tab. |
| Width | Overview and Board and Map | 1400 px container on Overview. Wide container on Board and Map. Width change animates. | Horizontal page scroll at 390 px. |
| Page not found | Trip missing | A full `StateBlock` (`empty`): "Trip not found" and a "Back to my trips" action. No retry. | A bare text line (today's state). `loading-block`. |
| Page loading | Trip loading | A full `StateBlock` (`loading`): "Loading trip". The Board fallback is a compact `StateBlock`. | A bare spinner line. `loading-block`. |
| Page failed read | The trip read failed | A full `StateBlock` (`failed`) with "Try again". | The not-found copy for a failed read. |
| Page signed out | No signed-in user | A full `StateBlock` with "Sign in to open this trip". The action keeps a validated trip path in `next`. | A not-found message for a signed-out viewer. |
| Reduced motion | `prefers-reduced-motion: reduce` | Final picture at once. No fold animation. No road draw-in. | Any running animation. |
| Keyboard | Tab bar, matrix, pins | Arrow keys, Home, End and Enter work. Focus ring visible. Escape closes a tooltip. | A focus trap. A pin that is a button without a 44 px target. |
