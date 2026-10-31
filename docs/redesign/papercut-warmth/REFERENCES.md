# Papercut warmth references

This file records source identity, authority and conflicts.
The execution plan is in `ROADMAP.md` under Papercut warmth.
The source copies are local and read-only evidence.
No script from the source folder was executed.

## Authority

The Papercut foundation is adopted in `src/styles.css`.
`src/styles.css` is the runtime authority.
The root `DESIGN.md`, `DESIGN_TOKENS.md` and `docs/MOTION-TOKENS.md` are the curated repo design authority.
Component and page layouts remain deferred to their PW slices.
The supplied prose and the curated repo prose are separate:

- **Supplied prose:** the six files under `sources/` are byte-for-byte copies.
- **Curated repo prose:** the root design docs add repo status, brand facts and adoption limits.
- **Runtime truth:** `src/styles.css` wins when a component has not adopted a design rule.

The current source folder is:
`E:\YatraFlow\Redesign`

The earlier source folder was:
`C:\Users\hasna\yatraflow-claude\docs\redesign\papercut-tokens`

That earlier source folder is historical.
You must not edit either source folder.

## Supplied source manifest

Each local copy is byte-for-byte identical to its read-only source.
The SHA256 value covers the full file.

| Local copy | Source file | Bytes | SHA256 | Role |
| --- | --- | ---: | --- | --- |
| `docs/redesign/papercut-warmth/sources/DESIGN.md` | `DESIGN.md` | 23334 | `1DDF5BCB4A976BF4DB4A1CB37A52FB32907E3EB93F13934511248B2CE4CC01F0` | Supplied design system |
| `docs/redesign/papercut-warmth/sources/MOTION-TOKENS.md` | `MOTION-TOKENS.md` | 14393 | `A0C9B8E8C8F787B0C43834A1621CEAC30C4E98C2DC865A7FB7FD6FE5337854B7` | Supplied motion authority |
| `docs/redesign/papercut-warmth/sources/README.md` | `README.md` | 2090 | `8BB47F78474BFFF1FA334EE60854F802E389DBE3C728EA09A6B5E3D00584936C` | Supplied doc-set guide |
| `docs/redesign/papercut-warmth/sources/DESIGN_TOKENS.md` | `DESIGN_TOKENS.md` | 40931 | `1095C098CE64660A7421AE253FDF4BCB3956233D3FEEF1C5E041C5BED4E7B979` | Supplied token reference |
| `docs/redesign/papercut-warmth/sources/papercut-section.md` | `papercut-section.md` | 14447 | `3B4770555CD6F127C76791BFA06958DB2E1C828B04E56490ECCA3F69BD2E90F2` | Supplied token section |
| `docs/redesign/papercut-warmth/sources/papercut-tokens.css` | `papercut-tokens.css` | 4189 | `815151577D1C97A25B45771D10CFBF3500019BF3BDD7CBA3278EB5493C0B0A71` | Supplied token CSS, updated to the Linen surface palette |

## Foundation decisions

The foundation uses the Linen surface palette.
The light ground is paper `#F8F5F0`.
The light sunken, soft and card surfaces are `#ECE7DE`, `#F2EDE4` and `#FEFDFB`.
The light lines are `#DFDBD1` and `#E8E4DB`.
The light inks are `#22201E`, `#57524C`, `#6B645C` and `#8C857B`.
Linen replaced the earlier cool-mist neutrals. The teal, marigold and status hues did not change.
The dark grounds are `#0C1420`, `#101B2B`, `#182740`, `#16233A` and `#1A2A44`.
The dark lines are `#27395A` and `#1E3050`.
The dark inks are `#E8EFF5`, `#ADBCCF`, `#8FA0B5` and `#5F757F`.
The full source tables govern every remaining value.

The shadow hue is `20, 56, 66`.
The supplied elevations and glows are adopted.
Adopted foundation grounds have no grain.
Real covers and art stay in place.
Sora and Plus Jakarta Sans remain.
The type roles map to the supplied hierarchy.

The radius ladder is 4, 8, 12, 18, 24, 32 and 999px.
The spacing ladder has nineteen values and adds 10px and 18px.
You must not normalize unrelated raw spacing.

## Source conflicts

### Dark focus ring

- `papercut-section.md` line 169 records `#2BB8AC`.
- `papercut-tokens.css` line 100 sets dark `--pw-lagoon-600` to `#3FB8AC`.
- The runtime `--yf-teal-600` alias uses `--pw-lagoon-600`.
- The `--ring` token uses `var(--yf-teal-600)`.
- Decision: the dark ring is `#3FB8AC`.
- Reason: the final CSS token and adopted role alias agree.
- The supplied source files remain unchanged.

## Motion decisions

The supplied motion document is the authority.
The durations are `--motion-instant` 90ms, fast 160ms, med 240ms, slow 360ms and slower 560ms.
The entrance stagger is 60ms and keeps a six-item cap.
`--t-fast` uses fast.
`--t-med` and `--t-slow` use slow.
The easing set is paper, glide, resize, exit and settle.
Settle is allowed only on an entrance transform for an element 48px or smaller.

The named exit lifetimes are:

- List: 240ms on `--ease-exit`.
- Map shell: 360ms on `--ease-exit`.
- Menu and toast: 160ms on `--ease-exit`.
- Drawer: 240ms on `--ease-exit`.

The list and map lifecycles are implemented.
The menu, toast and drawer exit lifecycles are deferred to their owning slices.
You must not claim those deferred lifecycles as shipped.

Reduced motion is immediate.
Charts, covers, routes, pins and numbers show their final state.
Earlier 120ms reduced-fade statements are superseded.
The earlier global 75 percent exit rule is superseded.

## Current limits

PW-15 foundation scope is complete.
The wider legacy motion migration remains with the page and component slices.
PW-03 records shared foundation adoption, not all 19 PW tasks.
Legacy page-specific warm gradients remain in `.landing-canvas` and `.ex-hero`.
They use `--yf-mist`, `--yf-peach` and `--ex-paper`.
PW-10 and PW-16 own those page migrations.
The v2 Overview layout is implemented for local review.
The fixture uses synthetic heights. The app reads public heights at trip places.
P12Warm2.dc.html remains the full workspace cover-header visual authority.
The P2 spec keeps its behavioral contracts.
Signed-in browser checks need a session on the origin under test.

## Current source archive manifest

Each path is under `E:\YatraFlow\Redesign`.
The inventory is [archive-inventory-20261028.json](archive-inventory-20261028.json).
The raw extracted exports are under [exports-20261028](exports-20261028).
The archive hash covers the full ZIP file.
The HTML hash covers the extracted entry.

| Source archive | HTML entry | Archive SHA256 | HTML SHA256 | Task |
| --- | --- | --- | --- | --- |
| `E:\YatraFlow\Redesign\P12 Overview · warmth v2 (compact + elevation route)-html.zip` | `P12Warm2.dc.html` | `f075b30573a22240af5ae432ae944b288c99e8287eb38c176f97527eaab1099c` | `e8617dceada3487df612f9467d13cbf9ae809b9b8897610c8ab9b7959eccfca7` | PW-05, PW-06, PW-14 |
| `E:\YatraFlow\Redesign\Route card · flat, coast, flights and city stays (animated)-html.zip` | `FlatRoute.dc.html` | `5ad6fc3c25536d5d7e10a3ce6e2961a2bb9a58fe187dc4834b054da9f56b327a` | `a390c4f7af153e7aa8bb77b2b4aa523efaa39561410203210745f449ef15ea30` | PW-06 |
| `E:\YatraFlow\Redesign\Papercut warmth · tokens (named scales, light + night)-html.zip` | `Tokens.dc.html` | `af1af930ccfb01c6ec261cc7631df3fe98dd4b309bde9809bd93752b4a55db56` | `83c4fcdf491451663fc1f905307fde32e68d76b6da032e200fabf4de5ca053ba` | PW-03 |
| `E:\YatraFlow\Redesign\Papercut warmth · Component kit-html.zip` | `ComponentKit.dc.html` | `e59e0a6529261d169cfe203ff24552a759e77ce99591b7b4480f7cf3b1ff538b` | `753544d45075e06e3f17057f59aa1c2e8c10c73150ef29cf885524f900a18a89` | PW-04 |
| `E:\YatraFlow\Redesign\Dark theme · night sky palette-html.zip` | `DarkTheme.dc.html` | `7acd1873251c6ab956d3c7f6e114aca9cae6f3de4d7c48ab8010c7fe804483ab` | `5757c0f9ad3745810a791d7e03a4c4b3a18a182824292292ffcf1264f35930d8` | PW-03 |
| `E:\YatraFlow\Redesign\Design system proposal · Papercut warmth · Day 2 before after-html.zip` | `WarmSystem.dc.html` | `6a4dc4748247639b229b8bb2c92700fca4e9d5756252008b2c0e77f2d5ad0d1b` | `74f4d928285301c2556db9318633571248571e1a0a026a1aa441f72b26c67ad0` | PW-03, PW-07 |
| `E:\YatraFlow\Redesign\Motion system · live demos-html.zip` | `Motion.dc.html` | `3ad08bf651955859b4fbf477371089fca73d0e1460ddcaecfdd11318fa7e0f1f` | `e24af2c0047be13e981a0c65d2bae400ef3b6b0edf7aa3830d9b4cc401eaa4c1` | PW-15 |

The extracted copies are references only.
Do not import `support.js`, `vendor/*` or fixed demo data into the product.

## Historical Downloads archive manifest

The paths below are historical.
The current manifest above replaces them.
Each old path is under the local Downloads folder.
The old hash covers the old archive.

| Local archive path | HTML entry | SHA256 | Target |
| --- | --- | --- | --- |
| `C:\Users\hasna\Downloads\Budget tab · animated charts, Play to replay-html.zip` | `Budget.dc.html` | `4a6433ce432e52ef4695c7b5fddcd233cfe4cf2e11766011a495212db023bd1e` | PW-13 |
| `C:\Users\hasna\Downloads\Creator page · Has9 storefront + owner view-html.zip` | `Creator.dc.html` | `c319c3f8f7c18a6b4264d0495770135f8c8ce3126554f0191c4e541f0ad5172d` | PW-12a, PW-12b |
| `C:\Users\hasna\Downloads\Dark theme · lantern night palette-html.zip` | `DarkTheme.dc.html` | `fc56f827470af244cb64893f6c0db10a08c102d6dc3e41814869ec86bcbc759b` | PW-03 |
| `C:\Users\hasna\Downloads\Design system proposal · Papercut warmth · Day 2 before after-html.zip` | `WarmSystem.dc.html` | `8ee98f3d61bc3c10e0bb221a7f08153bd6c8d7b6eb4762ada960019748435342` | PW-03, PW-07 |
| `C:\Users\hasna\Downloads\Desktop · Drive day with fixed times-html.zip` | `DriveDay.dc.html` | `61626e9412bcb8ebccd93213a1a76eababbff686c80be70fba5cedfdd7d7a35b` | PW-08 |
| `C:\Users\hasna\Downloads\Desktop · One day · Day 2 open (stay day)-html.zip` | `Main.dc.html` | `52cdd74922f4e14f3e67cca0acd1af7ce2d2c849200725ad0cbe8d3d2fab73ca` | PW-07 |
| `C:\Users\hasna\Downloads\Explore · redesign (desktop 1440)-html.zip` | `Explore.dc.html` | `356fd0e3a99e7283cd48d5a97526e24610c94249247f065f48c5b6c452c23d9f` | PW-10 |
| `C:\Users\hasna\Downloads\Motion system · live demos-html.zip` | `Motion.dc.html` | `3ad08bf651955859b4fbf477371089fca73d0e1460ddcaecfdd11318fa7e0f1f` | PW-15 |
| `C:\Users\hasna\Downloads\P12 Overview · warmth v2 (compact + elevation route)-html.zip` | `P12Warm2.dc.html` | `e15c0ee58284ca906d0ffa4d6e23bc625bd2de30d24b6530bb6f9353492791a1` | PW-05, PW-06, PW-14 |
| `C:\Users\hasna\Downloads\Papercut warmth · Component kit-html.zip` | `ComponentKit.dc.html` | `416e7c83f45b3e0f83f67438221b15f44a5a370cba3b857d23de3e1af67cc60d` | PW-04 |
| `C:\Users\hasna\Downloads\Plan a trip · guided flow, restyled-html.zip` | `PlanTrip.dc.html` | `7ff9d79677a32074ee4f5f4eecf423cee2f438a8b99eff66fbc95d8d301ec9e1` | PW-09b |
| `C:\Users\hasna\Downloads\Public itinerary · Look inside, on the trip kit-html.zip` | `LookInside.dc.html` | `b49cc16cfeec67a54728f53b56f0e8ae04cff1105e462ea2d0d5165b49eb7e7f` | PW-11a |
| `C:\Users\hasna\Downloads\Public itinerary · Ride along, on the trip kit-html.zip` | `PublicRide.dc.html` | `16faed79e48527e269b3a8a043d6328c54e499962137c6023ae6c6700fc136ca` | PW-11b |
| `C:\Users\hasna\Downloads\Trip settings · redesign (desktop 1440)-html.zip` | `TripSettings.dc.html` | `1f39c10b0b530a1111a707ad31eb61e6c2c528e9e5c6f7a537c13ad46d3ca4a4` | PW-09a |
