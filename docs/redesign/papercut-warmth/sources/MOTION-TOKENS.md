# Motion Tokens

The app's motion system — the companion to the colour, radius and elevation tokens in
`src/styles.css` and `DESIGN.md`. **Every interactive surface ships motion from these tokens;
no ad-hoc durations.** This is the rule that keeps the refined surfaces (Timeline, Board) and
newly added ones at the same level of smoothness: when something changes or gets added, it
picks a pattern from here rather than inventing a feel.

> **Revised 28 Oct 2026 (papercut layer).** The owner adopted calmer durations, a renamed
> default curve (`--ease-paper`), an exit curve, and one narrow exception to the no-bounce rule
> (`--ease-settle`, small pops only). The values below are the agreed ones; the table in
> "Migration" lists what changes in `src/styles.css`. Until that commit lands, the stylesheet
> is the truth for the running app.

## Duration steps

| Token | Value | Was | Use it for |
| --- | --- | --- | --- |
| `--motion-instant` | `90ms` | new | colour-only changes, press feedback |
| `--motion-fast` | `160ms` | 120ms | hovers, chips, small pops, drag sibling glide |
| `--motion-med` | `240ms` | 180ms | dropdowns & popovers, toggle gliders, list rows rising, small position changes |
| `--motion-slow` | `360ms` | 240ms | large surfaces: FLIP settle, drawers, panels, page sections entering |
| `--motion-slower` | `560ms` | 560ms | very large travel — hundreds of px that relayout the page (a day body is ~950px), chart bars growing |

Everything up to `--motion-slow` lands at or under 360ms — the app's motion is "calm and
settled", never showy. The slower steps are one notch calmer than before on purpose: the
papercut surfaces are larger and softer, and the 120/180ms steps read as twitchy beside them.

The fourth step exists because peak frame speed is **distance ÷ duration**: the day collapse at
the old `--motion-slow` (240ms) moved the rows below it 115px inside a single 60Hz frame
(measured, 942px of travel), which is what "the cards collide" looks like; at 560ms it is ~47px.
That step is deliberately above Material's guidance for a large expansion (375–500ms), which is
only defensible because the thing moving is ~950px rather than a panel — reach for it when the
distance is measured in hundreds of px, not when a surface merely feels large. The new 360ms
`--motion-slow` does not replace it for the day collapse.

Anything that must not animate at all (scaffolding, measurement passes) uses no transition.

`--stagger-step` (60ms) stays the one entrance stagger.

## Easing

| Token | Value | Use |
| --- | --- | --- |
| `--ease-paper` | `cubic-bezier(.2, .8, .2, 1)` | the default for everything entering, exiting in place or settling. Replaces `--ease-out` (same decelerating family, a softer tail) |
| `--ease-glide` | `cubic-bezier(.3, .86, .48, 1)` | continuous follow while a drag is live (targets the cursor, no lag bounce); long covers settling |
| `--ease-resize` | `cubic-bezier(.42, 0, .58, 1)` | a surface that resizes **in place** and moves a long way (day collapse): starts and ends at rest, symmetric |
| `--ease-exit` | `cubic-bezier(.4, 0, 1, 1)` | things leaving the screen for good: a toast, a closing sheet, a dismissed popover. Accelerates away |
| `--ease-settle` | `cubic-bezier(.34, 1.32, .64, 1)` | **small pops only, 48px or smaller**: stamps, map pins, badges, the destination dot, a count chip. A slight overshoot, then rest |

`--ease-paper` and `--ease-glide` are one shape to the eye, which is exactly right for a 60px
dropdown — and a pop on a 1000px one. Measured on the Timeline's day collapse (a 967px body):
a decelerate curve spent 24% of the whole height in the first 6ms and then dribbled for 150ms,
which is what "the collapse is not smooth" looks like. Resizes at that scale take
`--ease-resize`, whose gentle start leaves ~3px of movement in the first 60Hz frame and settles
its own tail. It is **symmetric** (`.42,0,.58,1`) rather than Material's asymmetric standard
curve: peak slope is what a long move is felt through, and on the day collapse's ~920px of
travel the asymmetric curve peaks at 2.73× its average (96px inside a 60Hz frame) against 1.72×
(60px) for the symmetric one, for the same total time and the same first frame. Take the
asymmetric curve only for a short move, where the peak is reached before the eye has caught up.

**The settle exception.** Springs and bounce are otherwise not in the system. `--ease-settle`
is allowed only on an element 48px or smaller, only on its entrance, and only as `transform`
(scale or translate) — never on a card, a panel, a row, a sheet or anything that carries text
the user is reading. Anything larger uses `--ease-paper`. A review that finds settle on a
larger element treats it as a raw-duration-class defect.

No scale or border-radius morphing on drag; drag movement is translation only (compositor-only).

## Pattern catalog

| Pattern | Recipe | Where it lives |
| --- | --- | --- |
| Dropdown / popover entrance | fade 0→1 + rise 4px, `--motion-med`, `--ease-paper`; leaving uses `--motion-fast`, `--ease-exit` | `.popover` (location list, calendar, menus), `.map-legend-body`, `.map-filters-pop` |
| Page / section entrance | fade 0→1 + rise 8px, `--motion-slow`, `--ease-paper`, `backwards`, staggered per direct child with `animation-delay: calc(var(--stagger-step) * N)`. The **container owns it** — children never opt in, so a block added to the page later cannot miss one (My Trips once had a cascade on its cards and none on its hero, which reads as broken rather than calm). Write the rule at the TOP level, not inside `prefers-reduced-motion: no-preference`: the design-system gates read top-level rules only — the opt-out is instead asserted against the raw file | `.page-enter > *` (every routed page root, discovered from `src/App.tsx`), `.empty-state > *` |
| Cover settle | a hero cover image scales 1.08→1 while the page enters, `--motion-slower` × ~3 (1.8s), `--ease-glide`, transform only; the card over the cover rises with the page cascade | trip hero, public itinerary cover, creator page cover |
| Chart entrance | bars and columns grow from their baseline (`scaleY`/`scaleX` from the zero edge), `--motion-slower`, `--ease-paper`, staggered by `--stagger-step`; money owed grows out from the even line; a stacked bar grows as **one** element, never per segment (segments animated separately open visible gaps); lines and route paths draw with `stroke-dashoffset` on `pathLength="1"`; rings fade rather than draw when they carry a dasharray. Labels fade in after their mark | Budget charts, time-budget bars, creator stats, hub KPIs, rankings score bars |
| Small pop | scale .4→1 + fade, `--motion-fast` to `--motion-med`, `--ease-settle`, ≤48px only | date stamps, map pins and stop numbers as the route line reaches them, badges, avatar entrance |
| Toggle glider | thumb slide on the glider's own **box** — `left`/`top`/`width`/`height` transition together, `--motion-med`, `--ease-glide`. A `scaleX` transform version was tried and **rejected**: scaling a rounded pill stretches its ends into ellipses (scaleX 1.93 on a 76px → 146px tab change). The box is affordable because the glider is absolutely positioned, so it cannot reflow its siblings | `.pill-glider` (workspace tabs, Plan/Inspect, filters, composer mode) |
| Segmented-control glider | The same glider for a group of equal-width buttons where one is pressed at a time: a grid of equal columns, a `::before` glider behind the pressed button, moved by the group's `data-layout` between fixed `left` values, `--motion-med`, `--ease-glide`. Text colour changes on the same clock. Use `PillNav` when the buttons differ in width. The group must carry a reduced-motion opt-out; `tests/motion-state-change.test.ts` checks both | `.mt-seg` (My trips Grid \| List), `.mt-grid` keyed by layout |
| List exit | A card, row or button that leaves a list stays mounted for `--motion-med`, fades 1→0 and sinks 6px with a .97 scale, `--ease-exit`, then unmounts. `usePresenceList` (src/lib) keeps the item, marks it `data-presence="exit"`, makes it inert and moves focus off it BEFORE it goes inert, to the first focusable thing in the next live item. The item keeps its slot while it fades. When it drops, the items that stay glide into the gap (FLIP, transform only): `--motion-slow` for a short move, `--motion-slower` above 200px, both on `--ease-resize`. Under `prefers-reduced-motion` or in a hidden tab the hook drops the item at once. An empty message waits for `exiting` to end; do not add a wrapper element | `[data-presence='exit']` (My trips cards and Trash rows, Explore cards, saved-shelf rows), `.ex-clear[data-presence='exit']` |
| Day collapse | grid-rows `0fr↔1fr`, `--motion-slower`, `--ease-resize`, unmount after that token's duration (a clip that unmounts the focused element hands focus to the day's collapse control as the close begins). Anything that changes the header's height rides the same collapse in reverse | `.day-body-clip` (SmoothCollapse) |
| Drawer / sheet | slide in from its edge (translate 18px→0 + fade), `--motion-slow`, `--ease-paper`; out with `--motion-med`, `--ease-exit`. Closing must not cancel work in flight (the AI companion's pending answer lands in the transcript) | `.ai-drawer`, impact sheet, phone action sheets |
| Drag carry | pointer-pinned `translate3d(var(--carry-x/-y))` on the row, **no transition** — position never eases | `.is-carried` (Timeline `.tl-row`, Board `.board-row`) |
| Drag warp | skin `rotate(tilt) scale(...)` from pointer velocity, `--motion-fast`, `--ease-paper`; JS calm timer (`WARP_CALM_MS` 90ms) flattens the vars when the finger stops | `.is-carried .stop-card / .travel-endpoint` |
| Drag sibling glide | rows between slot and target translate by the carried row's height, `--motion-fast`, `--ease-glide` | Timeline `.tl`, Board `.board-row` |
| Drag settle | FLIP translate→none, `--motion-slow`, `--ease-paper`; the carried row settles from its release point (engine `consumeCarryRect`) | same surfaces, on commit |
| Map shell expand / collapse | `scale(.94↔1)` + fade, `--motion-slow`, `--ease-paper`; TripMap's unmount timer reads `motionTiming('--motion-slow')` so CSS and JS can't drift (0 under reduced motion) | `.map-shell--expanded` / `.map-shell--closing` |
| Rail fold | `grid-template-columns` glide, `--motion-slow`, `--ease-resize`; the fold icon rides the same clock | `.map-ideas-grid` folded states |
| Toast | rise 8px + fade in, `--motion-med`, `--ease-paper`; out `--motion-fast`, `--ease-exit` | toast zone |

**A list row keeps its own entrance.** The page cascade (`.page-enter > *`) reaches direct
children only. A list row is not a direct child, so it uses `.yf-surface.is-entering`, as the
purchase rows do.

**Ambient loops are the cadence's own exception.** An `infinite` keyframe — the map skeleton's
breathe, the live dot's ping — is exempt from the raw-duration ratchet because its cadence
belongs to the effect, not to a UI transition; its easing still rides a token, and it still
stops under `prefers-reduced-motion`.

**Replay is a design-board device, not a product pattern.** The redesign boards carry a Play
button that replays their entrance; the app plays an entrance once, on arrival.

The drag is pointer-events–driven (lib/touchDnd.ts): mouse starts on an 8px move, touch keeps
the long-press gate. The warp is a skin-only deformation, never the position layer, and is
skipped entirely under reduced motion. No goo/metaball morphing.

## Migration

One commit swaps the values; consumers keep their token names.

| In `src/styles.css` | Today | After |
| --- | --- | --- |
| `--motion-fast` / `-med` / `-slow` | 120 / 180 / 240ms | 160 / 240 / 360ms |
| `--motion-instant` | — | 90ms (new) |
| `--motion-slower` | 560ms | 560ms |
| `--ease-paper` | — | `cubic-bezier(.2, .8, .2, 1)` (new) |
| `--ease-out` (191 uses) | `cubic-bezier(.22, .61, .36, 1)` | alias: `var(--ease-paper)`; rename consumers as surfaces are touched, then delete |
| `--ease-soft` (2 uses) | `cubic-bezier(.3, .7, .4, 1)` | alias of `--ease-paper`, then delete |
| `--ease-exit`, `--ease-settle` | — | new |
| `--t-fast` / `--t-med` / `--t-slow` (55 uses, legacy) | 180 / 300 / 440ms | alias to `--motion-fast` / `--motion-slow` / `--motion-slow`, then migrate |

JS that reads durations through `motionTiming('--motion-*')` (`src/lib/motion.ts`, TripMap,
touchDnd, usePresenceList, the Timeline day section) picks up the new values with no change.
Re-run the frame sampling below on the day collapse and the map shell after the swap.

## Governance (AGENTS.md rule 10)

Any PR that adds or changes an interactive surface must:

1. pick durations/easings from the tokens above — a raw `ms` value in a new rule is a review flag;
2. pick the motion pattern from the catalog (or extend the catalog in this file in the same PR);
3. use `--ease-settle` only within the 48px small-pop exception;
4. respect `prefers-reduced-motion: reduce` (transitions off; state changes become instant;
   charts and covers show their final state) — every animated rule carries the opt-out.

## Verification

`grep -n "ms" src/styles.css` should show new durations as `var(--motion-*)`; legacy literals
are grandfathered on already-refined surfaces and migrate when those surfaces are next touched.

A timing change is proved by sampling, not by feel: record each item's rect every animation
frame across a toggle, then read three numbers per item — first-frame delta (a non-zero value
means the move starts with a snap, which no duration can smooth), peak per-frame delta (how hard
one frame hits), and whether the peak sits mid-animation rather than on frame one. Peak
per-frame speed ≈ `distance × curve peak slope ÷ duration`, so when a move reads as a collision,
check the distance first: if the element travels hundreds of px, duration is the only honest
lever. Quote it as **px/ms**, not px per frame — a 145fps renderer hands you 7ms frames and
makes the same motion look half as fast as it will on a 60Hz screen. Two more noise traps: a
single long frame inflates one delta (read the p90 as well as the max, and report the frame
intervals beside them), and an element that unmounts mid-sample reports a zero-rect, which
reads as a jump to the top of the page — skip anything that is no longer connected.
