# P7 Look Inside, immersive prototype

Author: Design Lead (claude-opus-5-5). Date: 2026-10-15. Status: round 2 done (colour, icons, imagery).

## How to open

- Double-click `index.html`. It works from `file://` with no build step and no network.
- Or serve the folder: `node tools/serve.mjs 5301`, then open `http://127.0.0.1:5301/index.html`.
- Pick a trip with the "Prototype" panel (bottom right), or with `?trip=<id>`.
  Ids: `spiti`, `jaipur`, `longway`, `air`, `coorg`, `pondy`, `purulia`.
- Other switches: `?theme=light|dark`, `?state=owned` (paid view), `?as=creator` (teaser editor),
  `?dev=0` (hide the panel), `?static=1` (all reveals on, for full-page captures).
- Only the flight trip (`air`) hot-links one Wikimedia photo. Every other image is local.

## The page in 8 lines

1. The page sells a plan like a book: cover, contents, a free chapter, a locked part, the author and a price.
2. A trip with a photo gets a full-bleed photo cover. A trip with no photo gets a ticket on a collage of its own stop kinds.
3. "What is inside" says the trip in one sentence, lists the places by kind as coloured chips, and says what the locked days hold in counts.
4. Below that, one card per day: the title or the creator's teaser, a plain pace word ("Easy day", "Long drive"), and the places.
5. A free day card lists its real places with a coloured icon each. A locked day card shows only counts, such as "1 temple".
6. "Day by day" is the book. Day 1 is open in full, the other free days open in place, and locked days sit in one block.
7. Unlock is a pretend payment. A receipt opens, the locked cards turn to "Yours", and the buy box becomes "Fork to my trips".
8. Saffron means paid. Teal means yours. Category colours mean a kind of place, and each one always has its word beside it.

## Round 1: the "What is inside" chart

User reaction to round 0: "what even is this? very unintuitive."

Diagnosis, band by band:

| Band | Round 0 | Verdict |
| --- | --- | --- |
| Photo cover, h1, byline, facts, buy box | plain text and a photo | read at once |
| Woven plate (no-photo cover) | one band per day, no labels | read as "a loading graphic" |
| What is inside: the Loom | day bars on a 06:00 to 23:00 axis, a legend and a Lens | needed the legend; nobody read it |
| Book rows and sealed rows | small unlabelled bars | decoration at best |
| Free day, notes, cost, creator, take | text, a scale with a caption | read at once |

Changes:

- The Loom, the Lens and every bar went. Each day is now a card with words: "Day 5", "Locked", the teaser, "Easy day", "1 h 18 m on the road".
- Pace words replace bar shapes: Nothing planned, Flight day, Long drive (180 min or more on the road; "Long travel day" on train trips), Full day (4 or more stops, or a span of 10 hours), Easy day.
- The woven plate became a ticket: the route ("Delhi to Kolkata", "Round trip from Bangalore"), a "via" line, the day count and the travel mode.
- "Sealed" became "locked". The sentence at the top says which days are free and which are locked.

## Round 2: colour, icons and imagery

User reaction to round 1: "slightly better but its not rich visually no images nothing no colours no icons".

### Category system

Source: the app's own map-pin hues (`src/components/TripMap.tsx`, `IDEA_PIN_COLORS`) and its category icons (`src/components/icons.tsx`, `CATEGORY_ICONS`, lucide shapes). `DESIGN_TOKENS.md` has only expense colours, so it is not the source here.

| Key | Word on the page | Icon | Light | Dark | App pin hue |
| --- | --- | --- | --- | --- | --- |
| sightseeing | sight(s) | camera | #1A54A8 | #8DB8F2 | #EAB308 (moved, see costs) |
| nature | nature stop(s) | leaf | #166534 | #6BD08F | #22C55E |
| food | food stop(s) | utensils | #B91C1C | #F59595 | #EF4444 |
| temple | temple(s) | landmark | #6D28D9 | #B9A2F8 | #8B5CF6 |
| museum | museum(s) | building | #4338CA | #A5A8F8 | #6366F1 |
| beach | beach(es) | umbrella | #155E75 | #5FD0E6 | #0EA5E9 |
| shopping | market(s) | bag | #9D174D | #F48FB8 | #EC4899 |
| adventure | outdoor stop(s) | mountain | #3F6212 | #A9D46A | #F97316 (moved) |
| event | evening(s) out | music | #A21CAF | #EE9BF5 | #A855F7 |
| hotel, travel | stay(s), travel | bed, train | #475569 | #A3B1C2 | #06B6D4, #14B8A6 |

- Contrast: every colour passes 4.5:1 on its 14% chip tint and on the saffron-soft locked surface, in both themes. The lowest is event in light mode at 5.01:1.
- Chip text is the body text colour. The colour sits on the icon and the tint, so the word never depends on the hue.
- The ticket is cream in both themes, so its chips keep the light shades.

### What each band shows now

| Band | Content |
| --- | --- |
| Cover, photo trips | the credited photo, unchanged |
| Cover, no-photo trips | a cream ticket (route, via, top 3 kinds as chips, days, mode) on a navy collage of round category tiles in the trip's own mix |
| Section headings | a small teal badge with an icon before each h2 |
| What is inside | the trip sentence, "The 22 places, by kind" as chips, then a saffron line: "Inside days 5 to 8: 4 nature stops, 3 sights and 2 temples." |
| Day cards | a thin colour ribbon in the day's mix, Day N and a Free / Locked / Yours chip, the title or teaser, the pace word and travel time, then real places with icons (free) or count chips (locked) |
| Day by day | each stop has a coloured category badge; locked rows show count chips |
| Owned state | the locked line goes, the chips turn to "Yours", the sentence says all days are open |

### Imagery

- Real photos only, from the v3 credited set. Nothing was downloaded.
- A trip with no photo gets the collage. It is drawn from the trip's own stop counts and is seeded by the trip id, so it is stable. It is `aria-hidden`.
- The slot code is one function (`coverArt`): it returns the photo when one exists and the plate when not. A new photo needs one line in the data.
- Purulia has no categorised stops, so its collage is travel tiles only.

## Naive-reader test (a proxy, not user research)

One Sonnet worker (claude-sonnet-5-5) played a first-time traveller. It saw only 4 screenshots per run and had about 5 seconds per screen. One reader is a weak signal.

| Question | Round 0 | Round 2 |
| --- | --- | --- |
| What is inside, understood in 5 s? | no on both pages ("made me squint") | yes on both pages |
| No-photo cover | "a bar chart or a loading graphic, meaningless" | "a decorative pattern of food, camera and shopping icons" |
| Free and locked | "sealed" unclear | "Free to read" and "Locked" were clear |
| Price | clear | clear |

Still open after round 2:

- The big colour bar above the chips "meant nothing until I matched it to the tag colours". I removed it. The chips carry the mix alone.
- The ticket said "Bangalore round trip" and the title said "Coorg Loop". It read as two things. It now says "Round trip from Bangalore", with the via line below.
- Locked cards with counts only ("1 food stop") still feel vague. That is the limit of selling without naming. The teaser line is the creator's lever.
- Coorg gives only 1 free day of 5, which felt stingy. That is the creator's choice, not a layout problem.
- "Has9" reads as a username. It is the real handle.

## House-rule costs

- Sight and outdoors moved off the app's yellow and orange pins. Both sit too close to saffron, which means paid.
- Locked travel legs are not drawn dashed. The inspector flags dashed borders.
- In dark mode the locked surface is a brown panel. It is the price of one paid accent.
- The closed book rows sit on the page, with no card. The inspector flags a row of same-size boxed rows with a small icon, and a list set in large type is its own advice. Only the open day is a card.
- At most 5 font sizes: chips, card meta and stop names share 15px.

## Checks (2026-10-15, all 7 trips, 1440 and 390, light and dark)

| Check | Result |
| --- | --- |
| Horizontal overflow | 0 on all runs |
| Clipped text | none |
| Font sizes per page | 5 on every run |
| Controls under 44 px | none; the take-section buttons read 44 px but can measure a fraction under while the section scales in |
| Motion under reduced motion | 0 transitions and 0 animations (390, light, all trips) |
| Locked-only names in the page before unlock | 0 (spiti 0 of 9, jaipur 0 of 4, longway 0 of 115, coorg 0 of 16, pondy 0 of 1) |
| Console errors | 0 |

## Lint and inspect

- `lint.mjs`: **RESULT: 0 FAIL, 15 WARN.** Two category lines carry `taste-skill-ignore`: the violet is the app's temple pin hue, a data colour, not an accent. The WARNs are the brand faces, the word "unlock", and em-dashes inside creator titles.
- `inspect.mjs http://127.0.0.1:5301/index.html` (Spiti): **RESULT: 0 FAIL, 2 WARN** (`no-footage`, `side-scroll` for the photo strip).
- Other trips: Long Way and Jaipur add `few-pictures` (they have no photo; see wished photos). Jaipur at 768 adds `covered-text` while the creator name scrolls under the fixed price bar. Coorg's h1 plus subtitle runs 3 lines (creator data, never cut).

## Weaknesses

- The collage is decoration. It says "food, sights, nature" but nothing about the place. Only a real photo fixes that.
- The flight trip's cover is a Shimla hillside for a Delhi, Mumbai and Goa trip. It is the fixture's cover.
- The day-card ribbon is unlabelled colour. It repeats the chips below it, so nothing depends on it.
- Locked cards can only show counts. A thin teaser makes a thin card.
- Travel figures are approximate (straight line times 1.15 at 38 km/h by road, 55 km/h by train). The live page must read them from the engine.

## Wished photos (not downloaded; credited and licensed sources needed)

Most value first:

1. Coorg: coffee estates near Madikeri, Abbey Falls, Dubare elephant camp.
2. The rail route (Long Way Round): a long-distance train at a platform, Howrah Bridge, Varanasi ghats.
3. Jaipur: Hawa Mahal at morning, Amber Fort ramparts.
4. Goa and Mumbai (flight trip): Marine Drive, Fontainhas in Panaji. This replaces the wrong Shimla cover.
5. Pondicherry: White Town streets, Promenade Beach at dawn.
6. Purulia: Ayodhya Hills, Bamni Falls, palash in bloom.

## Needs new data

1. `day.teaser` (about 80 chars): the creator's public line for a locked day. The creator view edits it (`?as=creator`).
2. `publication.pitch` (140 chars): the creator's line in the buy box.
3. `publication.gallery`: credited photos. Today a plan has one cover at most.
4. `day_previews` in the public RPC: per locked day, the stop count, the category counts and the travel time, with no names.
5. The public RPC must withhold locked stops entirely (#774).
6. `creator.bio` and `creator.plans` for "The person behind it".

## Samples (marked `sample: true` in the data)

| Trip | Creator (sample) | Pitch | Teasers |
| --- | --- | --- | --- |
| spiti | Has9 (real handle), sample bio | sample | days 5 to 8 |
| jaipur | Aditi Rathore | sample | day 2 |
| longway | Rahul Menon | sample | days 2 to 14; days 15 to 30 show "Opens when you buy the plan" |
| air | Sana Qureshi | sample | none (free plan) |
| coorg | Kavya Iyer | sample | days 2 to 5 |
| pondy | Neha Pillai | sample | days 2 to 3 |
| purulia | Has9 (real handle), sample bio | none | none (free plan) |

## Folder map

- `index.html`: the page shell and the dev panel.
- `assets/style.css`, `assets/app.js`: tokens, components, motion and behaviour.
- `assets/fonts/`, `assets/photos/` (+ `credits.json`): copied from the v3 credited assets.
- `data/*.js`: public payloads (locked days carry counts, never names). `data/*.paid.js`: paid payloads.
- `tools/prep-data.mjs`: builds `data/`. `tools/serve.mjs`: static server. `tools/shoot.mjs`: screenshot driver.
- `screenshots/`: the proof set. `screenshots/compare/`: `old-*` (round 0) next to `new-*` (round 2). Names starting `mid-` are mid-animation frames.
