# 0003. The mockup palette, hero treatment, and three-column shell are adopted

**Status:** Accepted · **Date:** 2026-10-08 · **Supersedes:** [0002](0002-mockup-palette-not-adopted.md) (§Decision, colour clause only)

## Context

ADR 0002 split the mockup in two: its layout and interactions were adopted, its palette was not. The
reasoning was sound at the time — `src/styles.css` already carried 425 `--yf-*` declarations governed by
`docs/redesign/YATRAFLOW_DESIGN_DIRECTION.md`, and adopting a second palette would have re-pointed all
of them.

Two things changed.

The first is evidence. The redesign landed its structure, and on 2026-10-08 the owner compared the
rendered My Trips surface against `C:\Users\hasna\yatraflow-mockup\hub.html` and reported that it was
"nowhere near as stunning" as the mockup. The gap is not the neutral ramp, which is already warm
(`--gray-50: #FAF7F2`, `--gray-200: #E4DCCC`). It is three things the mockup has and the app does not:
a canvas with real saturation, a full-bleed hero carrying a gradient scrim over photography, and a
three-column shell that gives the page a spine.

The second is that ADR 0002's own emergency clause anticipated this. It says a new colour "must arrive
as a `--yf-*` token in both themes, as M1 did" — so the token discipline it protects is not the thing
being relaxed. What is relaxed is the freeze on the canvas value.

## Decision

**The mockup's palette is adopted, scoped to the tokens named below. Its `assets/` directory remains
forbidden** — `_gen3.json` records that every image there was generated and carries no licence, so no
file from that directory may ship. This clause of ADR 0002 survives intact.

Adopted, as `--yf-*` tokens in both themes, following the M1 pattern:

| Mockup value | App token | Role |
|---|---|---|
| `--page: #F4EDE3` | `--yf-cream` | app canvas (was `#F8F7EF`) |
| `--sand: #FBF5ED` | `--yf-sand` | soft raised surface |
| `--mint: #E8F5F1` | `--yf-mint` | selected and accented surface |

Also adopted as layout, not colour:

- **A full-bleed hero with a gradient scrim.** The hero's image runs edge to edge and the scrim is a
  directional gradient, following the mockup's curve rather than a flat overlay. Where a trip has no
  stored photo the hero falls back to a gradient built from the tokens above, so the surface never
  reads as broken.
- **A three-column shell** on the surfaces the mockup shows it, with the page's width distributed as
  the mockup does.

## Consequences

`docs/adr/0002-mockup-palette-not-adopted.md` keeps its history and its decision on imagery. This ADR
supersedes only its colour clause. Read both.

The design-system contrast gate still applies, and a warmer canvas only lifts contrast for dark ink.
Every colour still arrives as a token in both themes, so the argument two contributors can have is
still about layout — which is the point the split was making in the first place.

The hero now depends on photography the product does not yet have at scale. Trips with a stored
`coverImageUrl` get a full-bleed hero; trips without one get the token gradient. That asymmetry is
visible and is the reason the mockup reads as richer than the app on an empty account.

## Conflict to resolve at merge

`C:\Users\hasna\Yatraflow-minimax` carries `feat/trip-shell-sidebar`, an unreviewed sidebar WIP. This
ADR's three-column shell and that branch's sidebar both want the page's left column. They merge only
if one defers to the other; neither should be rebased onto the other silently.
