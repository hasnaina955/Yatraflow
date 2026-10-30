## Papercut warmth layer (28 Oct 2026)

**Status: values agreed, not yet adopted. `src/styles.css` is unchanged.** The owner decided the three open questions on 28 Oct 2026 (see Decisions). Same day, the surfaces were cooled: the yellow paper and brown inks became teal-tinted paper and blue-teal inks (lightness kept, so contrast holds), the grain texture was dropped, shadows moved to a teal ink, and night returned to the app's existing night-sky navy (`#0C1420` ground, `#16233A` cards). This section names the values the redesign boards use, so the CSS can adopt them one consumer at a time under the adopt-or-delete rule. The canvas board "Tokens" shows every value. Where this section and `src/styles.css` disagree, the CSS still wins until a token lands with its first adopter.

Naming rule: an existing repo name is reused when its meaning already fits (`--radius`, `--radius-sm`, `--radius-lg`, `--space-1…10`, `--icon-stroke`, `--yf-blur-*`, `--ring`). New families take the `--pw-` prefix until the owner picks final names. Each `--pw-*` row names the token it would replace or alias.

### Colour

Every token is mirrored in `[data-theme='dark']`. Contrast was measured for the text pairs: `--pw-ink-3` on `--pw-card` is 5.68:1 light and 5.89:1 night; tinted pairs (sea-900 on lagoon-100, marigold-ink on marigold-100, ok on ok-100, risk on risk-100, bloom-700 on bloom-100) are all at least 5.2:1 in both themes. `--pw-ink-4` is 3.0:1 and is for marks only, never text.

**Surfaces**

| Token | Light | Night | Use | Replaces or aliases |
|------|-------|-------|-----|------|
| `--pw-paper` | `#F0F8F6` | `#0C1420` | Page ground (no grain texture) | `--bg / --yf-cream` |
| `--pw-sunken` | `#E0EBE9` | `#101B2B` | Tracks, segmented wells, quiet chips | `--bg-soft` |
| `--pw-soft` | `#EAF3F2` | `#182740` | Hover fills, inline panels, collapsed rows | — |
| `--pw-card` | `#FCFEFD` | `#16233A` | Cards and sheets | `--card / --yf-surface` |
| `--pw-raised` | `#FFFFFF` | `#1A2A44` | Stop cards inside a day card | — |
| `--pw-line` | `#D3DEDC` | `#27395A` | Control borders, dividers | `--line / --yf-border` |
| `--pw-line-soft` | `#DCE7E6` | `#1E3050` | Card borders, dashed rules | — |

**Ink**

| Token | Light | Night | Use | Replaces or aliases |
|------|-------|-------|-----|------|
| `--pw-ink` | `#142329` | `#E8EFF5` | Titles, body, figures | `--text` |
| `--pw-ink-2` | `#45565D` | `#ADBCCF` | Meta lines, secondary text | `--text-2` |
| `--pw-ink-3` | `#556972` | `#8FA0B5` | Labels, captions, axis text | `--text-3 / --yf-text-muted` |
| `--pw-ink-4` | `#79929E` | `#5F757F` | Chevrons, disabled marks, dots. Not for text (3.0:1) | — |
| `--pw-on-sea` | `#FFFFFF` | `#0A1622` | Labels on sea and lagoon fills (7.4:1) | `--color-primary-foreground` |
| `--pw-on-marigold` | `#142329` | `#1A1408` | Labels on marigold fills (7.7:1) | `--color-accent-foreground` |

**Sea (primary)**

| Token | Light | Night | Use | Replaces or aliases |
|------|-------|-------|-----|------|
| `--pw-sea-900` | `#0B3F44` | `#E3F4F0` | Text on lagoon tints | — |
| `--pw-sea-700` | `#0B5F67` | `#3FB8AC` | Primary buttons, selected tabs, links | `--color-primary` |
| `--pw-lagoon-600` | `#0D8D82` | `#3FB8AC` | Progress, focus, free-day marks | `--yf-teal-600` |
| `--pw-lagoon-400` | `#2EB1A6` | `#5CC8BC` | Charts, map routes on light ground | — |
| `--pw-lagoon-300` | `#6CCAB3` | `#6CCAB3` | Illustration water, sparkline fill | — |
| `--pw-route` | `#9FD9CF` | `#2D5E58` | Route lines, dashed spines, tint borders | — |
| `--pw-lagoon-100` | `#DDF1EE` | `#13302C` | Selected backgrounds, teal pills | `--yf-teal-100` |
| `--pw-lagoon-50` | `#F3FAF8` | `#162A27` | Info panels, creator notes | — |

**Marigold (paid, share, attention)**

| Token | Light | Night | Use | Replaces or aliases |
|------|-------|-------|-----|------|
| `--pw-marigold-500` | `#F2A33A` | `#F5B04E` | Paid buttons, destination dot, attention | `--yf-saffron / --color-accent` |
| `--pw-marigold-300` | `#F6CF8E` | `#8A6526` | Borders of paid tints | — |
| `--pw-marigold-100` | `#FBE7C6` | `#33240F` | Paid and warning panels | `--yf-saffron-100` |
| `--pw-marigold-50` | `#FFF4E0` | `#2B2212` | Buy box, sealed day ground | — |
| `--pw-marigold-ink` | `#8A4F0E` | `#F2B45C` | Text on marigold tints | `--ink-amber` |

**Bloom (people, saved)**

| Token | Light | Night | Use | Replaces or aliases |
|------|-------|-------|-----|------|
| `--pw-bloom-700` | `#9C2347` | `#F08AA0` | Saved hearts, market tiles | — |
| `--pw-bloom-500` | `#C9475E` | `#F08AA0` | Member avatars | — |
| `--pw-bloom-100` | `#FBE3E8` | `#3A1E26` | Bloom tints | — |

**Status (never series colours)**

| Token | Light | Night | Use | Replaces or aliases |
|------|-------|-------|-----|------|
| `--pw-ok` | `#1F6B41` | `#7FCF9A` | Confirmed, under budget | `--ok-500 / --ink-ok` |
| `--pw-ok-100` | `#E2F0E8` | `#17291E` | Confirmed pills and panels | — |
| `--pw-risk` | `#B23A2E` | `#F08A7A` | Over target, blocked, to book | `--danger-500 / --ink-coral` |
| `--pw-risk-100` | `#FBEDEA` | `#3A1C18` | Risk pills | `--color-destructive-soft` |

**Spend categories (charts, fixed order)**

| Token | Light | Night | Use | Replaces or aliases |
|------|-------|-------|-----|------|
| `--pw-cat-stays` | `#008C7F` | `#26A898` | Stays · Road on leg charts | `--cat-accommodation` |
| `--pw-cat-transport` | `#3168C4` | `#5A8AE6` | Transport · Air | `--cat-transport` |
| `--pw-cat-food` | `#CF5A2C` | `#DC6C3E` | Food · Rail | `--cat-food` |
| `--pw-cat-activity` | `#A04CA8` | `#BF6BC9` | Activities · Water | `--cat-activities` |

**Time-budget bar**

| Token | Light | Night | Use | Replaces or aliases |
|------|-------|-------|-----|------|
| `--pw-time-drive` | `#0B5F67` | `#3FB8AC` | Driving | — |
| `--pw-time-stop` | `#C9925A` | `#D9A673` | At places | — |
| `--pw-time-wait` | `#F2A33A` | `#F5B04E` | Waiting | — |
| `--pw-time-free` | `#DDF1EE` | `#13302C` | Free time | — |

The four `--pw-cat-*` values replace the first four `--cat-*` categories only where a chart shows four or fewer series. They passed the categorical palette checks (lightness band, chroma, colour-blind separation, contrast) in both themes. Status colours never colour a series, and category colours never signal state.

### Place tiles

Duotone icon tiles for stops: tint ground, light fill, darker stroke. The glyph is half the tile.

| Kind | Use | Tint | Fill | Stroke |
|------|-----|------|------|--------|
| sight | Sights, viewpoints | `#DDEBF2` | `#B9D3E1` | `#2F6A8A` |
| temple | Temples, monasteries | `#EFE4F1` | `#D9C2DF` | `#6E4A7E` |
| food | Food, dhabas | `#F8E3D6` | `#EFC3A8` | `#A4492A` |
| nature | Nature stops | `#E3EFDC` | `#BFDDAE` | `#2F6B3A` |
| water | Lakes, beaches, boats | `#DDF1EE` | `#6CCAB3` | `#0B5F67` |
| market | Markets, shopping | `#FBE3E8` | `#F4C3CE` | `#9C2347` |
| stay | Stays, check-in | `#FBE7C6` | `#F6CF8E` | `#8A4F0E` |

### Type styles

Sora for display and figures, Plus Jakarta Sans for everything else, weights 500–800 only. This retires the catalog-page exception above: Explore and My trips stop using `--font-serif` (Playfair Display) and `--font-hand` (Caveat). The owner decided on Sora + Plus Jakarta Sans in Oct 2026.

| Token | Family | Size / line | Weight | Tracking | Use |
|------|--------|------|------|------|-----|
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
| `--pw-kicker` | Plus Jakarta Sans | 11/1.3 | 700 | .1em | Uppercase labels (CSS text-transform) |

### Spacing

The `--space-1…10` ladder keeps its values (2/4/6/8/12/14/16/20/22/24) and gains two in-between rungs, `--space-4a` (10px) and `--space-7a` (18px). Seven layout rungs are added for page layout only. Add all nine to the spacing gate's `LADDER` set in the same commit.

| Token | Value | Use |
|------|------:|-----|
| `--space-4a` | 10px | icon to label in buttons, dense rows |
| `--space-7a` | 18px | card padding (medium), panel gaps |
| `--space-11` | 28px | hero inner padding |
| `--space-12` | 32px | between page sections |
| `--space-13` | 40px | hero gutters |
| `--space-14` | 48px | board padding |
| `--space-15` | 56px | page bottom |
| `--space-16` | 64px | time gutter |
| `--space-17` | 80px | desktop page gutter |

### Radius

Pick the radius by what the element is, not by its size on screen. An element whose radius is at least half its height is a pill or a circle and uses `--radius-pill`. Charts keep 2px inner joins between stacked segments.

| Token | Value | Use | Status |
|------|------:|-----|--------|
| `--radius-mark` | 4px | Chart data ends, swatches, month cells (inner joins stay 2px) | new |
| `--radius-xs` | 8px | Small tiles and thumbs up to 32px, code chips | new |
| `--radius-sm` | 12px | Thumbnails, 34–40px tiles, inline notes, small buttons in sheets | existing |
| `--radius` | 18px | Inputs, 48px stop tiles, panels inside cards, date stamps | existing |
| `--radius-lg` | 24px | Cards, day cards, sheets, popovers | existing |
| `--radius-xl` | 32px | Covers, heroes, board frames | new |
| `--radius-pill` | 999px | Buttons, pills, tabs, tracks, avatars | existing value, new name |

### Elevation

One recipe per level. The shadow hue moves from navy (`--shadow-navy-rgb`) to a teal ink (`20, 56, 66`), so `--shadow-navy-rgb` can simply take the new value. Night depth comes from lighter surfaces plus a faint top edge; night shadows are black and do less.

| Token | Light | Night | Use |
|------|-------|-------|-----|
| `--elev-press` | `0 1px 2px rgba(20,56,66,.12)` | `0 1px 2px rgba(0,0,0,.5)` | Segmented thumbs, pressed chips |
| `--elev-1` | `inset 0 1px 0 rgba(255,255,255,.9), 0 2px 4px rgba(20,56,66,.05), 0 18px 36px -20px rgba(20,56,66,.24)` | `inset 0 1px 0 rgba(255,255,255,.05), 0 18px 36px -20px rgba(0,0,0,.7)` | Resting cards and the nav |
| `--elev-2` | `0 2px 4px rgba(20,56,66,.06), 0 16px 30px -14px rgba(20,56,66,.34)` | `inset 0 1px 0 rgba(255,255,255,.06), 0 16px 30px -14px rgba(0,0,0,.75)` | Hover lift, stamps and chrome floating on photos |
| `--elev-3` | `0 4px 10px rgba(8,30,40,.08), 0 32px 60px -28px rgba(8,30,40,.55)` | `0 32px 60px -28px rgba(0,0,0,.85)` | Menus, sheets, dialogs, buy card on a cover |
| `--glow-sea` | `inset 0 1px 0 rgba(255,255,255,.22), 0 6px 14px -6px rgba(11,95,103,.6)` | same | Primary buttons, selected tab |
| `--glow-marigold` | `inset 0 1px 0 rgba(255,255,255,.5), 0 8px 18px -8px rgba(178,104,12,.6)` | same | Paid buttons |
| `--ring` | `0 0 0 3px var(--yf-teal-600)` (#0D8D82) | `0 0 0 3px var(--yf-teal-600)` (#2BB8AC) | Keyboard focus (repo token, unchanged): 3.8:1 on paper, 4.0:1 on card |

The existing `--shadow`, `--shadow-soft`, `--shadow-card` and `--shadow-card-hover` would become aliases of `--elev-1`, `--elev-1`, `--elev-1` and `--elev-2`.

### Glass

The four `--yf-blur-*` tiers stay as they are. Glass floats only over photos, maps and covers, never over plain paper: the frosted pill nav, tabs inside a cover, a buy card on a cover, stamps and chips on photos.

### Icons

`--icon-stroke` and `--icon-stroke-sm` stay 1.9. Line icons are drawn at 14, 16, 20 or 24px. Duotone tiles come in three sizes:

| Tile | Radius | Glyph |
|------|--------|-------|
| 32px | `--radius-sm` | 16px |
| 40px | `--radius-sm` | 20px |
| 48px | `--radius` | 24px |

### Motion (decided)

These values replace the ones in `docs/MOTION-TOKENS.md` and `src/styles.css` when motion is adopted. The no-bounce rule in `docs/MOTION-TOKENS.md` gets one written exception: `--ease-settle` on small pops.

| Token | Repo today | Adopted | Use |
|------|-----------|----------|-----|
| `--motion-instant` | — | 90ms | Colour-only changes, press |
| `--motion-fast` | 120ms | 160ms | Hovers, chips, small pops |
| `--motion-med` | 180ms | 240ms | Popovers, gliders, list rows rising |
| `--motion-slow` | 240ms | 360ms | Drawers, panels, page sections entering |
| `--motion-slower` | 560ms | 560ms | Long travel (day collapse), chart bars growing |

| Easing | Curve | Status |
|------|-------|--------|
| `--ease-out` | `cubic-bezier(.22,.61,.36,1)` | repo today |
| `--ease-paper` | `cubic-bezier(.2,.8,.2,1)` | adopted: replaces --ease-out (same family, softer tail) |
| `--ease-glide` | `cubic-bezier(.3,.86,.48,1)` | repo today, unchanged |
| `--ease-resize` | `cubic-bezier(.42,0,.58,1)` | repo today, unchanged |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | adopted: exits only |
| `--ease-settle` | `cubic-bezier(.34,1.32,.64,1)` | adopted: small pops only, 48px or smaller (stamps, pins, badges). Everything larger uses `--ease-paper` |

### Decisions (28 Oct 2026)

1. **Bounce on small pops: kept.** `--ease-settle` stays for stamps, pins and badges, 48px or smaller. Anything larger uses `--ease-paper`. Write this exception into `docs/MOTION-TOKENS.md`.
2. **Slower durations: adopted.** instant 90ms (new), fast 120→160ms, med 180→240ms, slow 240→360ms, slower 560ms (unchanged).
3. **10px and 18px: back on the ladder** as `--space-4a` and `--space-7a`. The boards were re-snapped with them. The gate's `LADDER` set needs both values.

### Adoption order

1. Colour primitives with their dark mirrors, aliased from the legacy names so no consumer breaks.
2. Radius and elevation, replacing literal radii and shadows component by component. The measured appendix shows 206 literal radii today.
3. Type styles, starting with Explore and My trips, where the serif and the handwritten face retire.
4. Motion: swap the five durations and the easings in one commit, then add the settle exception to `docs/MOTION-TOKENS.md`.
