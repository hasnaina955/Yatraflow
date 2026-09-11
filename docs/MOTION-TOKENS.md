# Motion Tokens

The app's motion system — the companion to the colour/radius tokens in
`src/styles.css`. **Every interactive surface ships motion from these tokens;
no ad-hoc durations.** This is the rule that keeps the refined surfaces
(Timeline, Board) and newly added ones at the same level of smoothness: when
something changes or gets added, it picks a pattern from here rather than
inventing a feel.

## Duration steps

| Token | Value | Use it for |
| --- | --- | --- |
| `--motion-fast` | `120ms` | hovers, chip/press feedback, colour-only transitions |
| `--motion-med` | `180ms` | dropdowns & popovers, toggle gliders, drag sibling glide, small position changes |
| `--motion-slow` | `240ms` | large surfaces: day collapse, FLIP settle, drawers, panels |

Both ends land under ~250ms — the app's motion is "quick and settled", never
showy. Anything that must not animate at all (scaffolding, measurement passes)
uses no transition.

## Easing

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(.22, .61, .36, 1)` | the default for everything entering, exiting or settling |
| `--ease-glide` | `cubic-bezier(.3, .86, .48, 1)` | continuous follow while a drag is live (targets the cursor, no lag bounce) |

Springs/bounce are not in the system. No scale or border-radius morphing on
drag; movement is translation only (compositor-only).

## Pattern catalog

| Pattern | Recipe | Where it lives |
| --- | --- | --- |
| Dropdown / popover entrance | fade 0→1 + rise 4px, `--motion-med`, `--ease-out` | `.popover` (location list, calendar, menus) |
| Toggle glider | thumb `transform` slide, `--motion-med` | `.pill-glider` (workspace tabs, Plan/Inspect, filters, composer mode) |
| Day collapse | grid-rows `0fr↔1fr`, `--motion-slow`, unmount after | `.day-body-clip` (SmoothCollapse) |
| Drag carry | pointer-pinned `translate3d(var(--carry-x/-y))` on the row, **no transition** — position never eases | `.is-carried` (Timeline `.tl-row`, Board `.board-row`) |
| Drag warp | skin `rotate(tilt) scale(1+x−y·.55, 1+y−x·.55)` from pointer velocity, `--motion-fast`, `--ease-out`; JS calm timer (`WARP_CALM_MS` 90ms) flattens the vars when the finger stops | `.is-carried .stop-card / .travel-endpoint` |
| Drag sibling glide | rows between slot and target translate by the carried row's height, `--motion-fast`, `--ease-glide` | Timeline `.tl`, Board `.board-row` |
| Drag settle | FLIP translate→none, `--motion-slow`, `--ease-out`; the carried row springs from its release point (engine `consumeCarryRect`) | same surfaces, on commit |

The drag is pointer-events–driven (lib/touchDnd.ts): mouse starts on an 8px
move, touch keeps the long-press gate. The warp is a skin-only deformation
(the row's inner card), never the position layer, and is skipped entirely
under reduced motion. No goo/metaball morphing — explicitly excluded.

## Governance (AGENTS.md rule 10)

Any PR that adds or changes an interactive surface must:

1. pick durations/easings from the tokens above — a raw `ms` value in a new
   rule is a review flag;
2. pick the motion pattern from the catalog (or extend the catalog in this
   file in the same PR);
3. respect `prefers-reduced-motion: reduce` (transitions off; state changes
   become instant) — every animated rule carries the media-query opt-out.

## Verification

`grep -n "ms" src/styles.css` should show new durations as `var(--motion-*)`;
legacy literals are grandfathered on already-refined surfaces and migrate when
those surfaces are next touched.
