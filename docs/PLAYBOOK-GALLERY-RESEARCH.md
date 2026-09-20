# YatraFlow — Gallery Research Playbook

**Version:** 1.0 (2026-09-16) · **Companion:** `ITINERARY-IMPORT-SPEC.md` (the JSON contract) · **Validator:** `scripts/validate-itinerary.mjs`

This playbook is the *workflow* for scouring the internet for the best available
information and turning it into gallery-grade YatraFlow itineraries — trips that import
clean, price honestly, and make a solid positive first impression by default. The spec
says what the JSON must be; this says how to find what goes in it.

The ground rule is the repo's own: **no invented numbers, ever.** Every fee, timing and
distance in a published itinerary must come from a source a reader could check — the same
rule that makes the app's estimates trustworthy is the rule that makes its gallery
worth featuring.

---

## 1. The pipeline (five stages)

```
SELECT → RESEARCH → DRAFT → VALIDATE → PUBLISH
 (day)    (sources)  (JSON)   (2 gates)   (author account)
```

Each stage has an output the next stage consumes. Nothing skips the two validation gates.

---

## 2. Stage 1 — SELECT: pick trips that rank by construction

Before any research, choose routes that already clear the demand bar. Selection
criteria, in order:

1. **Proven search demand** — "Delhi to Spiti itinerary", "Goa 4 day trip cost" are
   queried thousands of times monthly. Pick from the launch plan's priority list:
   Leh–Ladakh · Spiti · Goa · Kerala · Rajasthan · Meghalaya · Coorg · Rann of Kutch ·
   Hampi · Andamans.
2. **Seasonally honest** — the trip must be good *in the season it names*. A Spiti plan
   tagged "best season Jun–Sep" survives scrutiny; the same route in January does not.
3. **Road-trip shaped** — the engine (wheel caps, clock-anchored meals, night halts) is
   built for drives; a 10-stop metro walking tour fights it.
4. **Budget lands in the filter band** — ₹4k–60k/person, 2–10 days (spec §6.5).

**Output:** one line per candidate: route, days, season, transport mode.

---

## 3. Stage 2 — RESEARCH: the source ladder

Research each candidate against this ladder. **Tier 1 sources are required for every
number that becomes money or time; lower tiers corroborate, never originate.**

| Tier | Source | Use for |
|---|---|---|
| **1** | Official state tourism sites (hptdc.nic.in, keralatourism.org, meghalayatourism.in…), ASI ticket pages, national-park/permit portals, IRCTC | entry fees, permit costs, timings, seasonal closures |
| **2** | The route's own engineering: OSRM (the app's router) distances, Google Maps cross-check | road km between consecutive stops — **compute, don't transcribe**; road distances are the one thing you derive rather than look up |
| **3** | Recent (≤ 18 months) trip reports with costs — travel blogs, r/india_travel, team-bhp drives | realistic daily rhythm, fuel costs, where nights actually fall, "the dhaba after X is the last one" |
| **4** | Wikipedia / Wikivoyage | place descriptions, elevation, order-of-magnitude checks |

**Per-candidate research sheet** (keep it beside the JSON; `sourceUrl` fields cite it):

- Route ordered start → end with the overnight towns circled (night halts anchor real
  towns in the engine — pick towns with beds, per the #189 lesson)
- Entry fee + timing for every ticketed stop (Tier 1)
- Road km per leg (Tier 2 — run the OSRM call or read it off Maps; record both)
- Fuel: mode economy (the trip's `fuelEconomyKmL`) × current pump price band ₹94–110/L
  for the states crossed (state excise varies — cite the band)
- 3–6 trip-specific tips that a local would nod at; generic tips fail the quality bar
- The warnings a reader must see: season closures, permit caps, altitude, fuel deserts

**Coordinates are researched, not recalled.** One Nominatim lookup per place, with a
User-Agent and ≤1 req/s:
`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=<place, district, state>`.
A first draft of the reference itinerary was typed from memory and the Bylakuppe / Dubare /
Nisargadhama cluster came out **~15 km off** — far enough to bend every distance the engine
computed. OSM is also the app's own free provider, so the pipeline and the product agree.

**Fees: reconcile conflicts in the open.** Sources genuinely disagree — Mysore Palace shows
₹50 in the palace's own Dec-2025 announcement and ₹70 in most guidebooks. The playbook's
rule: publish the **official/most recent** figure, cite it in `sourceUrl`, and state the
conflict in `warningsAndAssumptions` ("older guides print ₹70 — verify at the gate"). Never
silently pick the number that makes the trip look cheaper.

**Red flags that stop the pipeline:** a fee no Tier 1 source carries (drop the fee, or drop
the claim), a season split into sub-windows too fine for `bestSeason`, or a route whose
overnight town has no Tier-3 evidence of lodging — each means the plan isn't ready to be
published honestly.

**Output:** the filled research sheet.

---

## 4. Stage 3 — DRAFT: from sheet to JSON

Author the file against the spec (`ITINERARY-IMPORT-SPEC.md` §3–§5). The draft rules
that keep quality high:

1. **Rhythm first**: 3–6 stops/day; one "anchor" sight + food + a stretch per day beats
   six ticketed boxes. The engine's clock walk (breakfast/lunch/tea/dinner windows) will
   judge you — write days a driver could actually live. **Every day needs a food or rest
   stop**: a span over 6 h with none is a −7, and it is the easiest medium to avoid.
2. **Draft against the engine's arithmetic, not the map's.** `legBetween` measures
   straight-line × 1.25 at the mode's speed (car/rental 42 km/h) **plus a 10-minute pad per
   leg**, so a day's engine distance is what decides the verdict: **> ~120 km is a medium
   (>210 min), > ~182 km is a HIGH that fails outright (>300 min)**. Two consequences bit
   this batch: a real 175 km drive read as 283 min and had to move off its day, and the
   winding hill roads everyone fears (Pahalgam, Munnar) read *shorter* than the road sign
   because the model is straight-line. Plot the legs before naming the days.
3. **Never put two consecutive stops on identical coordinates ahead of the day's long
   leg.** A zero-length inbound leg followed by a long outbound one trips the backtracking
   warning (its "reorder stops" fix is impossible when the day must return home), and the
   same pattern fires when a zero-hop stop sits mid-day. Give each stop its own real
   coordinate — lunch has a market, the fort has a gate — and the warning disappears.
4. **Distinct pins are a rule, not a preference** (spec §4.2): a coordinate carries at most
   two stops and one of them must be the meal or the night. The first six shelf files were
   authored before this rule existed and shared 27 coordinates between different places —
   the map showed one pin for a four-stop Gulmarg day. `validate-itinerary.mjs` now prints
   every rejected cluster with its titles; the fix is one `gallery-geocode.mjs` lookup per
   place, and the cluster list *is* the fix list.
5. **Nights where nights fall**: a `hotel` stop in each overnight town; `stayStyle`
   matching the budget tier you're publishing.
6. **Fees and visit minutes from the sheet only** — never from memory, never rounded
   to "look better".
7. **`status: "confirmed"` everywhere**, honest `priority` tags, `weatherSensitive` on
   every viewpoint/beach/trek — but **no more than two flagged stops per day**: three
   weather-sensitive stops in one day is a low-severity flag, and a "weather-sensitive"
   tag on a *walk through town* earns it dishonestly.
8. **Lodging prices per base, not per night.** `computeTotals` counts **distinct overnight
   towns**, so two nights in Shillong is one base — and `stayStyle` moves the total further
   than any other field (budget ₹1,200 vs comfort ₹3,200 per room-night in the current
   model). Set the style deliberately, and let the engine's printed estimate set the
   declared budget afterwards.
9. **Publication copy last**: title/tagline/tips/warnings written *from* the sheet, not
   from marketing instinct. The tagline must be cashable by the itinerary.
10. **IDs as readable slugs** (`"d2-magnetic-mez"`) — the import tool regenerates them — and
    **`orderInDay` runs 1..n per day** (the app's own base; the importer renumbers from any
    base, the validator wants the convention).

**Output:** `docs/examples/itineraries/<slug>.draft.json`.

---

## 5. Stage 4 — VALIDATE: the two gates

**Gate 1 — structural (instant):**

```bash
node scripts/validate-itinerary.mjs docs/examples/itineraries/<slug>.draft.json
```

Every rule from the spec checked offline: numeric presence, coordinate ranges and the
Null-Island wall, enum membership, contiguity, date-span vs days count, reference
integrity, publication/trip cross-agreement, quality-bar heuristics (rhythm, coverage,
free-day share).

**Gate 2 — engine truth (the one that sets the price):**

```bash
npx vitest run tests/golden-itineraries.test.ts
```

Runs every `*.golden.json` through the real `computeHealth`/budget engine in CI:

- health ≥ 85 with **no HIGH-severity warning** — high = −11 points, medium = −7, low = −3,
  so **at most two mediums** fit under the bar. A 3.5–5 h transfer day is a medium; a day over
  5 h of engine travel is a HIGH and fails.
- `budgetPerPersonInr` within ±15 % of the engine's own estimate
- the test also prints per-day minutes, distance and the engine's priced total

Rename `.draft.json` → `.golden.json` only when both gates pass. Then set the budget
fields **from the engine's printed estimate** and re-run Gate 1 (it cross-checks trip ↔
publication agreement). Never hand-pick the number.

**What the gate is for.** The reference itinerary's first shape — a 3-day Bangalore→Coorg
weekend — was rejected on day 1 at 423 min / 268 km. That is not a bug to route around: the
drive really is 6–7 hours, and the gallery's job is plans people can live, so the fix was a
5-day loop breaking the drive at Mysore both ways. Expect the gate to reshape roughly one
draft in three.

**Output:** `<slug>.golden.json`, validator-clean, engine-priced.

---

## 6. Stage 5 — PUBLISH

1. Import the golden file as the author account (the gallery tool's import path), which
   writes the trip + publication rows with regenerated real IDs.
2. The creator flow's own pre-publish preview is the last human look — tagline, cover,
   free-day split (spec §5 requires ≥ ~40 % of days free).
3. Add it to the gallery ledger below, so the shelf and the plan agree.

**Gallery ledger** (append one row per file; keep in this file). A row means the file passes
**both gates** and is shelf-ready — the live import into the app happens at publish (Stage 5),
under the author account.

| Slug | Route | Days | Season | Budget/person (engine) | Health | Gates passed |
|---|---|---|---|---|---|---|
| `coorg-loop-from-bangalore` | Bangalore–Mysore–Madikeri–Kushalnagar–Bangalore | 5 | Oct–Feb | ₹12,100 (₹12,102) | 86 | 2026-09-16 |
| `goa-north-to-south` | Panaji–Old Goa–Candolim–Anjuna–Colva–Palolem–Panaji | 5 | Nov–Feb | ₹14,350 (₹14,350) | 97 | 2026-09-16 |
| `kerala-hills-and-backwaters` | Kochi–Munnar–Thekkady–Alappuzha–Kumarakom–Kochi | 6 | Sep–Mar | ₹17,500 (₹17,388) | 100 | 2026-09-16 |
| `mewar-forts-and-the-blue-city` | Udaipur–Nathdwara–Kumbhalgarh–Ranakpur–Jodhpur | 5 | Oct–Mar | ₹14,300 (₹14,284) | 93 | 2026-09-16 |
| `kashmir-valley-in-six` | Srinagar–Gulmarg–Pahalgam–Srinagar | 6 | Apr–Oct | ₹16,200 (₹16,188) | 100 | 2026-09-16 |
| `meghalaya-rain-and-root-bridges` | Guwahati–Shillong–Sohra–Mawlynnong–Dawki–Shillong | 5 | Sep–Apr | ₹8,150 (₹8,113) | 100 | 2026-09-16 |

The ranked worklist behind these — twenty trips with their demand evidence, and what batch
two needs (Ladakh's permits, Spiti's one-way pass crossing) — lives in
[`GALLERY-BACKLOG.md`](GALLERY-BACKLOG.md).

---

## 7. The first-impression checklist (what a visitor sees in 5 seconds)

The card must clear all six — the validator enforces 1–4 structurally; 5–6 are craft:

1. Real cover image (not the emoji fallback)
2. Title that names the route ("Spiti Valley Circuit — Shimla in, Manali out")
3. Route chips read start → end with the famous names present
4. Budget/person present and plausible for the duration
5. Tagline with one specific, cashable promise
6. Health score ≥ 85 once forked — the featured card wears it publicly

---

## 8. Tooling map

| Tool | Role |
|---|---|
| `scripts/validate-itinerary.mjs` | Gate 1 — the spec executable (structure, coords, distinct pins, `formatVersion`, unknown keys) |
| `tests/golden-itineraries.test.ts` | Gate 2 — engine truth in CI (health, budget ±15 %, per-day load) |
| `docs/examples/itineraries/*.golden.json` | The shelf's source files |
| `scripts/new-itinerary.mjs` | Scaffold — copies the reference skeleton, renames the slug, geocodes what you hand it, then runs Gate 1. `--slug x --title "X" --days 5` |
| `scripts/geocode-places.mjs` | The shared geocoder all the other tools call |
| `scripts/gallery-geocode.mjs` | Stage-2 coordinates — `geocode-places.mjs` with punctuation fallbacks, ≤1 req/s, exits 1 on any miss |
| Wikipedia REST summary API | Cover images (`.thumbnail.source`), verified live before use |
| `PLAYBOOK` (this file) | How the numbers were found |
| `ITINERARY-IMPORT-SPEC.md` | What the JSON must be |
