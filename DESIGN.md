---
name: YatraFlow
description: Calm Travel Intelligence, papercut edition, for India trips that work in the real world.
colors:
  paper: "#F8F5F0"
  sunken: "#ECE7DE"
  soft: "#F2EDE4"
  card: "#FEFDFB"
  raised: "#FFFFFF"
  line: "#DFDBD1"
  line-soft: "#E8E4DB"
  ink: "#22201E"
  ink-2: "#57524C"
  ink-3: "#6B645C"
  ink-4: "#8C857B"
  sea-900: "#0B3F44"
  sea-700: "#0B5F67"
  lagoon-600: "#0D8D82"
  lagoon-400: "#2EB1A6"
  route: "#9FD9CF"
  lagoon-100: "#DDF1EE"
  lagoon-50: "#F3FAF8"
  marigold-500: "#F2A33A"
  marigold-100: "#FBE7C6"
  marigold-50: "#FFF4E0"
  marigold-ink: "#8A4F0E"
  bloom-700: "#9C2347"
  ok: "#1F6B41"
  ok-100: "#E2F0E8"
  risk: "#B23A2E"
  risk-100: "#FBEDEA"
  night-paper: "#0C1420"
  night-sunken: "#101B2B"
  night-card: "#16233A"
  night-raised: "#1A2A44"
  night-line: "#27395A"
  night-ink: "#E8EFF5"
  night-lagoon: "#3FB8AC"
  night-marigold: "#F5B04E"
typography:
  display-xl:
    fontFamily: "Sora, Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  display-l:
    fontFamily: "Sora, Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  display-m:
    fontFamily: "Sora, Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  display-s:
    fontFamily: "Sora, Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Sora, Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Sora, Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body-l:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.55
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
  ui:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  meta:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  kicker:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.1em"
rounded:
  mark: "4px"
  xs: "8px"
  sm: "12px"
  md: "18px"
  lg: "24px"
  xl: "32px"
  pill: "999px"
spacing:
  space-1: "2px"
  space-2: "4px"
  space-3: "6px"
  space-4: "8px"
  space-4a: "10px"
  space-5: "12px"
  space-6: "14px"
  space-7: "16px"
  space-7a: "18px"
  space-8: "20px"
  space-9: "22px"
  space-10: "24px"
  space-11: "28px"
  space-12: "32px"
  space-13: "40px"
  space-14: "48px"
  space-15: "56px"
  space-16: "64px"
  space-17: "80px"
components:
  button-primary:
    backgroundColor: "{colors.sea-700}"
    textColor: "{colors.raised}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 18px"
  button-paid:
    backgroundColor: "{colors.marigold-500}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 18px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 18px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line-soft}"
    rounded: "{rounded.lg}"
    padding: "22px"
  chip-selected:
    backgroundColor: "{colors.sea-700}"
    textColor: "{colors.raised}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
  pill-paid:
    backgroundColor: "{colors.marigold-100}"
    textColor: "{colors.marigold-ink}"
    rounded: "{rounded.pill}"
  pill-teal:
    backgroundColor: "{colors.lagoon-100}"
    textColor: "{colors.sea-700}"
    rounded: "{rounded.pill}"
  stat-value:
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
---

# Design System: YatraFlow

> **Status (28 Oct 2026; curated repo note).** This file is the adopted design authority.
> The shared Papercut foundation is live in `src/styles.css`: colour, type roles, radius,
> spacing, elevation and motion. Component and page layouts remain deferred to their PW slices.
> `src/styles.css` remains the runtime authority where a component has not yet adopted a rule.
> The supplied source prose is preserved byte-for-byte in
> [`docs/redesign/papercut-warmth/sources/DESIGN.md`](docs/redesign/papercut-warmth/sources/DESIGN.md).
> [`REFERENCES.md`](docs/redesign/papercut-warmth/REFERENCES.md) records its hash.

## Overview

**Creative North Star: "Calm Travel Intelligence", cut from paper.**

YatraFlow is a high-quality travel planning studio, not a booking site and not an
over-styled SaaS dashboard. The papercut edition keeps that brief and gives it a
material: layered cut-paper scenes for places, a cool teal-tinted paper ground,
cards that sit on it like cut card stock, and frosted glass only where chrome floats
over a photo or a scene. Every choice still has to connect to a real travel outcome:
route time, fatigue, cost, stays, commitments, votes, changing plans.

The canvas is quiet and the actions are not. The paper ground, hairline borders and
soft teal-ink shadows carry the atmosphere; deep sea carries the primary planning
verb; marigold carries money and attention; status hues carry only state. Colour is
semantic before it is decorative.

**Key Characteristics:**
- Adopted foundation surfaces use Linen paper (`#F8F5F0`). It is a warm ground with most of the yellow taken out. It reads as soft paper, not brown. These surfaces carry no grain texture.
- One brand family: deep sea `#0B5F67` for primary fills that carry white text (7.4:1),
  lagoon `#0D8D82` for progress, focus and free-day marks. Every teal derives from lagoon.
- **Marigold = paid, teal = free or yours.** The rule holds on every page that sells.
- Sora for display, titles and every decision-bearing figure; Plus Jakarta Sans for
  everything else. Tabular numerals wherever a number is compared.
- Pill-first form language; named radii from 4 to 32 by what an element is, not its size.
- Depth from four named elevations with a teal-ink shadow hue, plus two glows for the
  primary and paid buttons. Never from heavy borders.
- Night is a navy night sky (`#0C1420`), the dark theme the app already had.
- Copy states consequences in plain sentences ("2 travellers still need to vote").

> **Adoption note.** The landing `.landing-canvas` and Explore `.ex-hero` still use warm legacy
> gradients. They use `--yf-mist`, `--yf-peach` and their own `--ex-paper`. PW-10 and PW-16 own
> those page migrations.

## Colors

A teal-tinted paper ground, a blue-teal ink family, one sea/lagoon accent family,
marigold for money, and status hues that keep their meaning across every surface and
both themes. Each token has a night twin under the same name.

### Surfaces
| Token | Light | Night | Use |
|---|---|---|---|
| `--pw-paper` | `#F8F5F0` | `#0C1420` | Page ground (alias `--bg`) |
| `--pw-sunken` | `#ECE7DE` | `#101B2B` | Tracks, segmented wells, quiet chips (`--bg-soft`) |
| `--pw-soft` | `#F2EDE4` | `#182740` | Hover fills, inline panels, collapsed rows |
| `--pw-card` | `#FEFDFB` | `#16233A` | Cards and sheets (`--card`) |
| `--pw-raised` | `#FFFFFF` | `#1A2A44` | Stop cards inside a day card |
| `--pw-line` | `#DFDBD1` | `#27395A` | Control borders, dividers (`--line`) |
| `--pw-line-soft` | `#E8E4DB` | `#1E3050` | Card borders, dashed rules |

Higher means lighter at night: page, sunken, card, raised each step up in brightness,
so a card lifts with light rather than with a border.

### Ink
- **Ink** `#22201E` / night `#E8EFF5`: titles, body, figures (`--text`).
- **Ink 2** `#57524C` / `#ADBCCF`: meta lines, secondary text (`--text-2`).
- **Ink 3** `#6B645C` / `#8FA0B5`: labels, captions, axis text (`--text-3`). 5.7:1 on card light, 5.9:1 night.
- **Ink 4** `#8C857B` / `#5F757F`: chevrons, disabled marks, dots. 3.0:1, **never text**.
- **On sea** `#FFFFFF` / `#0A1622` and **on marigold** `#22201E` / `#1A1408`: labels on filled buttons.

### Sea and lagoon (primary)
- **Deep sea** `#0B5F67` (night `#3FB8AC`, with a dark label): primary buttons, selected
  tabs and chips, links, the driving segment of the time bar (`--color-primary`).
- **Lagoon** `#0D8D82` (night `#3FB8AC`): progress, focus ring, free-day marks, the brand road (`--yf-teal-600`).
- **Lagoon 400** `#2EB1A6`: chart lines and map routes on light ground.
- **Route** `#9FD9CF`: route lines, dashed spines, tint borders.
- **Lagoon 100** `#DDF1EE` / **50** `#F3FAF8`: selected backgrounds, teal pills, info and creator-note panels.
- **Sea 900** `#0B3F44`: text on lagoon tints.

### Marigold (paid, share, attention)
- **Marigold** `#F2A33A` (night `#F5B04E`): paid buttons, the destination dot, attention (`--yf-saffron`).
- **Marigold 100** `#FBE7C6` / **50** `#FFF4E0`: paid and warning panels, the buy box, sealed paid days.
- **Marigold ink** `#8A4F0E` (night `#F2B45C`): text on marigold tints (`--ink-amber`).

### Bloom and status
- **Bloom** `#9C2347` / `#C9475E` / tint `#FBE3E8`: saved hearts, member avatars, market tiles.
- **OK** `#1F6B41` on `#E2F0E8`: confirmed, under budget, synced.
- **Risk** `#B23A2E` on `#FBEDEA`: over target, blocked, to book, destructive.
- Status colours ship with an icon or a word, never colour alone.

### Data colours
- **Spend categories, fixed order:** Stays `#008C7F`, Transport `#3168C4`, Food `#CF5A2C`,
  Activities `#A04CA8` (night `#26A898`, `#5A8AE6`, `#DC6C3E`, `#BF6BC9`). Validated for
  colour-vision separation. Leg charts reuse them as Road, Air, Rail, Water.
- **Time-budget bar:** driving `#0B5F67`, at places `#C9925A`, waiting `#F2A33A`, free `#DDF1EE`.

### Named Rules
**The One Green Rule.** Every teal derives from lagoon `#0D8D82`. A second, unrelated green is a defect.

**The Paid Rule.** Marigold means money: a price, a paid plan, a buy or join action, a payout.
Teal means free, yours, or done. A page that sells never swaps them.

**The Semantic Colour Rule.** A hue never carries two meanings. Status colours never colour a
chart series; category colours never signal state. Coral/risk means only over target, blocked,
or to book.

**The Cool Paper Rule.** Adopted foundation neutrals are teal-tinted, never yellow, cream or
brown. Page-specific exceptions are listed in the adoption note above. Warm colour comes from
marigold, the papercut scenes and photos, not from the foundation ground.

**The AA Ink Rule.** Text on tints uses the deepened inks (sea 900, marigold ink, ok, risk),
and every colour pair sits inside one CSS rule so the contrast gate can measure it.

## Typography

**Display Font:** Sora 600 / 700 / 800. **Body Font:** Plus Jakarta Sans 400–800.

Sora carries page titles, section and card titles, day titles, the date stamp and every
decision-bearing figure. Plus Jakarta Sans carries prose, controls, labels and meta.

**Ruling (28 Oct 2026), superseding the Phase 0 title-font note and ruling R14.** Sora stays the
title and figure face; Plus Jakarta Sans 800 does not replace it. Playfair Display
(`--font-serif`) and Caveat (`--font-hand`) retire from Explore and My trips. Fraunces, Young
Serif, Instrument Serif and Bricolage Grotesque were explored and set aside, so no new font
ships. When this lands, delete the R14 exceptions counted by `tests/page-consistency.test.ts`.

### Hierarchy
| Style | Face | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `--pw-display-xl` | Sora | 56/1.04 | 700 | -.025em | Page titles on covers (Explore, itinerary, creator) |
| `--pw-display-l` | Sora | 40/1.1 | 700 | -.02em | Board and section heroes, buy price |
| `--pw-display-m` | Sora | 28/1.15 | 700 | -.02em | Section titles |
| `--pw-display-s` | Sora | 22/1.2 | 700 | -.01em | Day titles, card heroes, big figures |
| `--pw-title` | Sora | 18/1.25 | 700 | -.01em | Card titles, h3 |
| `--pw-figure` | Sora | 24/1.1 | 700 | -.02em | Stats and totals (tabular) |
| `--pw-body-l` | Plus Jakarta Sans | 17/1.55 | 500 | 0 | Lede paragraphs |
| `--pw-body` | Plus Jakarta Sans | 15/1.5 | 500 | 0 | Body text |
| `--pw-ui` | Plus Jakarta Sans | 14/1.4 | 600 | 0 | Buttons, tabs, inputs |
| `--pw-meta` | Plus Jakarta Sans | 13/1.4 | 500 | 0 | Meta lines, legends |
| `--pw-caption` | Plus Jakarta Sans | 12/1.4 | 600 | 0 | Pills, captions, chart labels |
| `--pw-kicker` | Plus Jakarta Sans | 11/1.3 | 700 | .1em | Uppercase labels (CSS owns the caps) |

### Named Rules
**The Type Floor Rule.** No new type below 11px. 12px+ for anything carrying a number.

**The Kicker Casing Rule.** Sentence case in source, uppercase in CSS.

**The Figure Rule.** Every compared number is tabular (`font-variant-numeric: tabular-nums`)
and set in Sora when it is the number a decision hangs on.

## Layout

A centred container (`.container`, 1180px, 20px inline padding) holds page content; the
planned `--page-max` (1240px) is still not defined, so do not use it yet. The redesign boards
are drawn at 1440px wide with 80px gutters; treat that as a picture of the desktop page, not
a new container width.

Rhythm comes from the spacing ladder. New spacing values must land on it; off-ladder values
are frozen and may only shrink.

| Token | Value | Typical use |
|---|---:|---|
| `--space-1` … `--space-4` | 2 / 4 / 6 / 8 | hairline gaps, icon to text, tight stacks, chip rows |
| `--space-4a` | 10 | icon to label in buttons, dense rows (new) |
| `--space-5` … `--space-7` | 12 / 14 / 16 | card inner gaps, grid gaps between cards |
| `--space-7a` | 18 | medium card padding, panel gaps (new) |
| `--space-8` … `--space-10` | 20 / 22 / 24 | card padding |
| `--space-11` … `--space-17` | 28 / 32 / 40 / 48 / 56 / 64 / 80 | page layout only: hero padding, between sections, gutters (new) |

The spacing gate's `LADDER` set in `tests/design-system.test.ts` must list all nineteen values.

Breakpoints stay content-derived (1280↑ split, 720 mobile, narrow rungs at 560/480/440/360/350);
see the repo history for the full accumulated set. Direction-dependent spacing uses logical
properties.

## Elevation & Depth

Four levels and two glows, one recipe each, so a card never invents its own shadow. The
shadow hue follows the surface palette. On Linen it is the ink's warm charcoal (`rgb 34, 32, 30`),
carried by `--shadow-navy-rgb`. A 1px light top edge on resting cards makes them read as cut card stock.

| Token | Light | Night | Use |
|---|---|---|---|
| `--elev-press` | `0 1px 2px rgba(20,56,66,.12)` | `0 1px 2px rgba(0,0,0,.5)` | Segmented thumbs, pressed chips |
| `--elev-1` | `inset 0 1px 0 rgba(255,255,255,.9), 0 2px 4px rgba(20,56,66,.05), 0 18px 36px -20px rgba(20,56,66,.24)` | `inset 0 1px 0 rgba(255,255,255,.05), 0 18px 36px -20px rgba(0,0,0,.7)` | Resting cards and the nav |
| `--elev-2` | `0 2px 4px rgba(20,56,66,.06), 0 16px 30px -14px rgba(20,56,66,.34)` | `inset 0 1px 0 rgba(255,255,255,.06), 0 16px 30px -14px rgba(0,0,0,.75)` | Hover lift, chrome floating on photos |
| `--elev-3` | `0 4px 10px rgba(8,30,40,.08), 0 32px 60px -28px rgba(8,30,40,.55)` | `0 32px 60px -28px rgba(0,0,0,.85)` | Menus, sheets, dialogs, the buy card on a cover |
| `--glow-sea` | `inset 0 1px 0 rgba(255,255,255,.22), 0 6px 14px -6px rgba(11,95,103,.6)` | same | Primary buttons, selected tab |
| `--glow-marigold` | `inset 0 1px 0 rgba(255,255,255,.5), 0 8px 18px -8px rgba(178,104,12,.6)` | same | Paid buttons |

Night depth comes mostly from lighter surfaces; night shadows are black and do less.

### Glass tiers
- **nav** 18px · **panel** 14px · **chip** 8px · **scrim** 3px (`--yf-blur-*`, unchanged).
- Glass is for chrome on covers and scenes: the trip-tab pill inside the hero, the date stamp,
  pills on photos, the buy card, sticky bars, scrims.

### Named Rules
**The Not-Pure-Glassmorphism Rule.** Dense itinerary cards, form fields, tables and money stay
opaque. Glass is for chrome, overlays and map panels.

## Shapes

Pick the radius by what the element is. An element whose radius is at least half its height is
a pill or a circle and uses `--radius-pill`.

| Token | Value | Use |
|---|---:|---|
| `--radius-mark` | 4 | Chart data ends, swatches, month cells (inner joins stay 2px) |
| `--radius-xs` | 8 | Small tiles and thumbs up to 32px, code chips |
| `--radius-sm` | 12 | Thumbnails, 34–40px tiles, inline notes |
| `--radius` | 18 | Inputs, 48px stop tiles, panels inside cards, date stamps |
| `--radius-lg` | 24 | Cards, day cards, sheets, popovers |
| `--radius-xl` | 32 | Covers, heroes, board frames |
| `--radius-pill` | 999 | Buttons, pills, tabs, tracks, avatars |

Boundaries are one hairline in `--pw-line-soft` (cards) or `--pw-line` (controls); list rows
separate with a dashed rule. Focus uses the solid 3px `--ring` (`0 0 0 3px var(--yf-teal-600)`).
The light ring is `#0D8D82`, and the night ring is `#3FB8AC`. The light ring measures 3.8:1 on
paper and 4.0:1 on card. Never remove the outline.

### Icons
- One stroke: `--icon-stroke: 1.9` on every 24-unit icon. Sizes 14 (pills, dense meta),
  16 (buttons, rows), 20 (toolbar, nav), 24 (glyph inside a 48px tile).
- Duotone tiles: 32 and 40px on `--radius-sm`, 48px on `--radius`, each with its kind's tint
  and glyph colour (sight, temple, food, nature, market, water, road, and so on).
- Platform icons (Instagram, YouTube, Threads) are generic line glyphs, never brand logos.

## Illustration

Papercut scenes are the picture for trip, day and place cards when the user has no cover
photo: layered cut paper, flat colour, no text, no faces, no maps. One image serves both
themes; the dark scrim sits over it, and covers dim to brightness .78 / saturation .9 at night.
A user's own cover photo always wins over a generated scene, and every photo carries its credit.

The scenes keep their own warm palette and paper texture. The UI ground around them does not:
that contrast is what lets the scenes glow. Files, manifest and budget are in
[`docs/ART-PIPELINE.md`](docs/ART-PIPELINE.md); the style brief is
[`design/art/STYLE.md`](design/art/STYLE.md).

## Components

### Buttons
- **Shape:** pill. Heights 36 (sm), 44 (default), 52 (lg); 14.5px / 700 label; 8px icon gap.
- **Primary:** deep sea fill, white label, `--glow-sea`.
- **Paid:** marigold fill, ink label, `--glow-marigold`. Only for buy, unlock, join, plan-with.
- **Secondary:** card ground, `--pw-line` border, `--elev-press`. **Ghost:** no ground, sea label.
- **Hover:** a 1px rise; **press:** scale .98. Durations from the motion tokens only.

### Pills and chips
- Pills: 12px / 700, 3–9px padding, tones teal, paid, ok, quiet (sunken ground, ink 2),
  glass (on photos). Each states its own ink in the same rule as its ground.
- Chips: 34px pills, 1px line border on card; selected is a sea fill with white label and
  `aria-pressed`.

### Tabs
- A frosted pill (`.tabs`) with 38px pill buttons; the selected tab is a sea fill with
  `--glow-sea`. On every trip screen and public itinerary, the trip tabs sit **inside the hero
  cover**. Inside cards, segmented controls use a sunken well with no shadow.

### Cards
- Card ground, `--pw-line-soft` border, `--radius-lg`, `--elev-1`, 22–24px padding.
- Interactive cards (`dcard`) lift 3px to `--elev-2` on hover.
- Tinted panels inside a card: lagoon 50 for info and the creator's note, marigold 50 for
  paid or locked content, ok 100 / risk 100 for state.

### Navigation
- One shared chrome on every page: a 64px card-ground pill nav with `--elev-1`, the Ribbon Y
  lockup, section links (My trips, Plan a trip, Explore, Creator hub) and an account tray
  (theme, notifications, avatar). Signed-out pages swap the tray for Log in / Sign up free.

### Trip kit
- **Stop card:** 64px time gutter (Sora clock + duration), a dashed lagoon spine with a
  numbered pin, a 48px duotone tile, title, meta, status pills, and a panel inside the card for
  a warning or the creator's note. Fixed commitments show a lock at their clock.
- **Time-budget bar:** driving / at places / waiting / free, 3px gaps, round ends, over the
  day window (08:00–21:00 on public pages), always with a legend.
- **Date stamp:** glass, DAY + number on public pages, weekday + number + month in the app.
- **Trip ribbon:** the totals plus each day as a stop on a route line, ending in the marigold
  destination dot; each day shows its place, load and a health mark.

### Data visuals
- Legend for 2+ series plus selective direct labels; text in ink, never in the series colour.
- Thin marks, 4px rounded data ends on the baseline, 2px gaps between stacked segments.
- One axis only; no pies. Hover tooltips and a plain-table view for every chart.
- Movement in rankings is an arrow plus a number, never colour alone.
- Estimates say so (fuel cost, CO₂, trip totals); evidence says where it came from
  ("From 14 trips tracked in YatraFlow").

### Signature component: the recorded-traffic trend
The Creator hub trend keeps one shared scale for visits, forks and unlocks (a second axis would
make unlocks look healthy beside a visits collapse), one window rule and one clock with the
table beneath it, and a failed read never renders as zero.

### Page primitives (unchanged from Phase 0)
`PageHero`, `PageHeader`, `StateBlock` (full and compact), `SectionHead` and `Surface` live in
`src/components/page/`. Rulings R15 (button skin scope), R16 (segmented tabs) and R22 (compact
state block) still stand; R14 is superseded above.

## Dark theme: night sky

Night is the navy the app already had, not a warm brown. Grounds `#0C1420` → `#101B2B` →
`#16233A` → `#1A2A44`, line `#27395A`; ink `#E8EFF5` / `#ADBCCF` / `#8FA0B5` (15.9 / 9.6 / 6.9:1
on the page). Deep sea becomes lagoon `#3FB8AC` with a near-black `#0A1622` label (7.5:1);
marigold becomes `#F5B04E` with `#1A1408` (9.8:1). Status sits on dark tints: ok `#7FCF9A` on
`#17291E`, attention `#F2B45C` on `#33240F`, risk `#F08A7A` on `#3A1C18`. Toasts flip to paper
at night so they stand out from cards.

## Brand mark

**The Ribbon Y.** Two routes fold into one road. A marigold dot marks the shared destination.
The Y also stands for Yatra.

### Construction
- The mark uses a 64-unit grid. Each copy uses the same path data.
- The fold is `M15 6C15 26 32 24 32 40`. It uses the deeper teal and an 11-unit stroke.
- The road is `M49 6C49 26 32 24 32 40V46`. It uses Calm Teal and an 11-unit stroke.
- The road draws over the fold. The stroke ends stay flat.
- The destination is a 5.5-unit circle at `(32,56)`.

### Wordmark and lockup
- The wordmark sets "Yatra" in Ink and "Flow" in Calm Teal. It uses Sora 800.
- The mark is 1.78 times the wordmark cap height in a lockup.
- The lockup gap is 0.31 em. The exported lockups use outlines.

### Colour versions
- **Primary:** fold `#0B6B63`, road `#0D8D82`.
- **Dark:** fold `#1E9D92`, road `#2BB8AC`.
- **Reversed:** fold `#BFE3DD`, road white, on Planning Teal or Chart Navy.
- **One colour:** Ink only. A 2-unit gap cuts the fold where the road crosses it.
- The token-driven dot uses `--saffron`. The Papercut foundation resolves it to
  `#F2A33A` in light and `#F5B04E` in dark.

### Files and use
- `public/brand/` holds the mark and lockup SVGs in each version.
- `public/favicon.svg` is the primary mark. `public/icons/` holds the PWA and touch icons.
- `BrandMark` in `src/components/ui.tsx` reads `--teal-700`, `--teal-500` and `--saffron`.
- The exported SVG files keep their recorded static fills.
- Clear space is half the mark width. The smallest mark is 16px.
- The smallest lockup is 96px wide.
- Do not rotate, stretch or recolour the mark.

## Do's and Don'ts

### Do:
- **Do** keep the ground cool and calm and the actions obvious: paper, hairlines, soft depth,
  then one unmistakable primary control per view.
- **Do** keep marigold for money and teal for free or yours, on every page that sells.
- **Do** use tabular Sora figures for every number that drives a decision.
- **Do** say what is measured and what is estimated, and where the evidence came from.
- **Do** use the named scales (colour, type, spacing, radius, elevation, icon, motion);
  promote a reusable value to a token instead of inventing a local one.
- **Do** give every control a visible focus ring, a hover state and a disabled state.

### Don't:
- **Don't** bring back yellow, cream or brown neutrals, or a grain texture on UI surfaces.
- **Don't** build pure glassmorphism; dense data stays opaque.
- **Don't** drift into a fintech dashboard or a booking-site grid.
- **Don't** use colour decoratively, use a status colour as a series, or a brand logo as an icon.
- **Don't** introduce a second green, a raw duration, an off-ladder spacing value, a new font,
  or type below 11px.
