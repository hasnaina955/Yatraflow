# YatraFlow — Itinerary Import Specification

**Version:** 1.0 (2026-09-16) · **Contract twin:** `scripts/validate-itinerary.mjs` · **Engine-true pin:** `tests/golden-itineraries.test.ts`

This is the canonical contract for a JSON itinerary that imports into YatraFlow and
**breaks absolutely nothing** — engine math, map, budget, timeline, lodging identity,
publishing, fork. It exists so gallery-grade trips (see `PLAYBOOK-GALLERY-RESEARCH.md`)
can be authored offline and imported with zero repair.

The machine-checkable half of this contract lives in the validator script; it is
versioned with this file and any rule change lands in both, in the same commit.
What the validator **cannot** see (engine outcomes: health score, real budget totals,
schedule warnings) is pinned by the golden-iteration test, which runs every
`docs/examples/itineraries/*.golden.json` through the real engine in CI.

---

## 1. Shape at a glance

```jsonc
{
  "trip":   { …Trip… },                    // §3 — the full data model object
  "publication": { …PublishedItinerary… }  // §5 — the Explore surface (gallery trips only)
}
```

Everything is nested under `trip` + `publication` so one file carries both halves of a
gallery import. A `trip`-only file is valid for non-gallery imports.

---

## 2. The three failure classes this spec prevents

1. **NaN poisoning.** A missing numeric (`visitMinutes`, `entryFeeInrPerPerson`,
   `transportCostInrTotal`) flows into `simulateDay`/budget sums and renders `NaNh NaNm`
   and poisons the day's dwell. **Every numeric field is required**, even when "zero".
2. **Null Island.** `(0, 0)` — or a mixed placeholder (`lat: 0`, real `lng`) — pins the
   journey to the Gulf of Guinea; every downstream number is honest math over an ocean
   round-trip. **Both coordinates are checked, every stop.**
3. **Broken references.** `expense.stopId` pointing nowhere, day indexes out of range,
   non-contiguous `orderInDay`, `days.length` ≠ the inclusive date span — each breaks one
   surface silently. All are hard errors here.
4. **Silently dropped fields.** An unknown or misspelled key (`transportCostInrPerPersonTotal`
   for `transportCostInrTotal`) is *ignored* by every consumer, so the author believes a value
   is set and the engine never sees it. Unknown keys are rejected outright — a dropped field
   is a lie in the data.

---

## 3. `trip` — field contract

### 3.1 Required always

| Field | Type | Contract |
|---|---|---|
| `name` | string | non-empty; ≤ 80 chars (card display) |
| `startLocation` | string | place name; must match the caption of `startLocationCoords` |
| `startLocationCoords` | `{lat, lng}` | valid ranges (§4); **not** `(0,0)`; never mixed-zero |
| `destinations` | string[] | ≥ 1; last entry is the trip's end anchor |
| `destinationCoords` | `(LatLng\|null)[]` | **parallel array** to `destinations`; gallery trips: every entry non-null + valid |
| `startDate` / `endDate` | `yyyy-mm-dd` | real calendar dates; `endDate ≥ startDate` |
| `travellers` | int | ≥ 1 |
| `transportMode` | enum | `car · rental · motorcycle · train · bus · flight · taxi · mixed` |
| `budgetPerPersonInr` | number | > 0; must match the engine's own estimate within **±15 %** (golden test) — never hand-invented |
| `travelStyle` | enum | `relaxed · balanced · packed · adventure · luxury · budget · family · spiritual · food-focused · creator` |
| `coverEmoji` | string | 1–2 graphemes (the card fallback) |
| `visibility` | enum | `"public"` for gallery imports |
| `days` | Day[] | §3.3 |
| `expenses` | Expense[] | may be `[]`; entries per §3.4 |
| `fixedCommitments` | Fixed[] | may be `[]`; entries per §3.4 |

### 3.2 Required-for-gallery (strongly recommended everywhere)

| Field | Contract |
|---|---|
| `stayStyle` | set it explicitly: `budget · comfort · luxury` — unset derives from legacy `travelStyle`, and you should not be guessing derivations |
| `roundTrip` | boolean; self-drive modes: `true` means the plan *returns to start* — the last day's content must tell that story |
| `fuelEconomyKmL` | plausible for the mode (car 10–25, motorcycle 25–45); implausible values are flagged by the engine |
| `fuelPricePerL` | ₹94–110 band (state pump reality); outside the band is a validator warning |
| `driverCount` | ≥ 1; `2` buys real wheel rotation — set it honestly |
| `hasVulnerable` | infants/seniors aboard → shorter days, earlier dinner |
| `coverImageUrl` | HTTPS; a real image is the single biggest card-CTR lever (broken URLs are hidden by the UI guard, falling back to `coverEmoji`) |

### 3.3 `days[]`

| Field | Contract |
|---|---|
| `id` | string, unique |
| `index` | **must equal the array position**, 0-based, contiguous |
| `title` | recommended ("Munnar hills") — shows on the day header |
| `startTime` | `"HH:MM"` 24h; omit to use the 08:30 planning default |
| `stops` | Stop[]; **3–6 per day** for gallery quality (see §6) |

**`days.length` must equal the inclusive span** `endDate − startDate + 1`. Hard error.

### 3.4 `stops[]` — where imports break

| Field | Contract |
|---|---|
| `id` | string, unique across the trip |
| `title` | non-empty; ≤ 60 chars |
| `category` | enum, exact: `sightseeing · food · nature · beach · temple · adventure · shopping · museum · travel · hotel · rest · event · transport-hub` — **stays are `hotel`** (drives the lodging line; there is no `accommodation`) |
| `locationName` | string |
| `placeId` | provider place-id **when the place was picked from a provider**; hand-authored stops omit it — but then lat/lng must be accurate (lodging identity falls back to coordinate-cluster, then normalized name) |
| `lat` / `lng` | numbers, valid ranges, not (0,0), not mixed-zero; see §4 |
| `visitMinutes` | **finite number ≥ 0** (NaN rule); gallery sweet spot 30–180 |
| `openTime` / `closeTime` | `"HH:MM"`, **both or neither**; `open ≤ close` (a venue past midnight is out of spec — split it) |
| `entryFeeInrPerPerson` | number ≥ 0, required — look it up, don't guess (§ playbook) |
| `transportCostInrTotal` | number ≥ 0, required (cost of getting *to* this stop from the previous point) |
| `priority` | `must-do · nice-to-have · optional` |
| `status` | `"confirmed"` for every stop in a gallery import — a published trip full of `suggested` rows reads unfinished |
| `orderInDay` | 0-based, **contiguous per day, no gaps/duplicates** — the drag-reorder contract |
| `weatherSensitive` | `true` for beach / viewpoint / trek / outdoor — feeds the honest warnings |
| `departTime` / `arrivalTime` / `legDistanceKm` / `legTravelMinutes` | **omit.** The engine measures legs itself; stale hand measurements contradict the road math |
| `notes` / `sourceUrl` | optional; HTTPS only. `sourceUrl` on every fee/time-bearing stop is the playbook's citation rule |
| `auto` | omit — tool-managed |

### 3.5 `expenses[]` and `fixedCommitments[]`

- `expenses`: `label`, `category` (`transport · accommodation · food · activities · entry-fees · tolls-parking · local-travel · emergency-buffer`), `amountInr` > 0 finite, optional `perPerson`, `optional`; `stopId` **must reference an existing stop id**; `dayIndex` in range.
- `fixedCommitments`: `title`, `type` (`hotel-checkin · train-departure · flight-departure · event · other`), `dayIndex` in range, `time` `"HH:MM"`.
- IDs: any unique string is accepted; the import tool regenerates them on write — author with readable slugs (`"d1-lunch"`).

---

## 4. Coordinate rules (the hard wall)

```
lat:  −90 … 90      lng: −180 … 180
India corridor (soft warning outside):  lat 6–37.5, lng 68–97.5
```

- `(0, 0)` → error. Exactly one of lat/lng zero → error (the mixed-placeholder case).
- **Geocode, never type from memory.** Hand-recalled coordinates for the Bylakuppe / Dubare /
  Nisargadhama cluster came out ~15 km off in the first draft of the reference itinerary — far
  enough to bend every downstream distance. One Nominatim lookup per place fixes it:
  `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=<place, district, state>`
  (send a User-Agent, stay under 1 req/s).
- Rounding: 4 decimals (~11 m) is plenty; more is noise.
- Coords must sit within ~**40 km** of the place they claim to be (the app's own
  `coLocates` bar). A "Marine Drive" pin in Pune breaks the map's trust, not just the pin.

---

## 5. `publication` — the Explore surface

The published row **is** the public URL (`id` is the slug) and the card everything sees.

| Field | Contract |
|---|---|
| `id` | slug, `^[a-z0-9-]+$`, ≤ 48 chars, stable forever (it *is* the link) |
| `title` | ≤ 70 chars, name-style ("Spiti Valley Circuit — Shimla in, Manali out") |
| `tagline` | one honest sentence; no superlatives the trip can't cash |
| `coverImageUrl` | **required for gallery-grade**; the first impression lives here |
| `routeSummary` | ordered place names, start → end (renders as the route chips) |
| `durationDays` | must equal `trip.days.length` |
| `estimatedBudgetPerPersonInr` | must equal `trip.budgetPerPersonInr` (the fork must not re-price) |
| `travelStyle` | must equal `trip.travelStyle` (drives the Explore filter) |
| `bestSeason` | recommended ("Jun–Sep") |
| `travelTips` | 3–6 concrete, trip-specific tips |
| `warningsAndAssumptions` | honest array — the app's ethos (e.g. fuel price basis, season caveats) |
| `freeDayIndexes` | ≥ 1 day, and ≥ ~40 % of days — the generosity lever that proves quality |
| `premiumPriceInr` | omit or pick from the seed ladder `149 / 199 / 249 / 499` |
| `subscriberCta` | optional |
| `views` / `copies` / `publishedAt` | omit — tool-managed (start at 0/0/now) |

**Provenance rule (hard):** never import a publication derived from someone else's
forked/copied trip. Publish only trips authored for the gallery. The gallery already
wears one `(copy)` duplicate; this rule is why there will not be a second.

---

## 6. The quality bar — "scores high by default"

Explore ranks by `views + copies×5`; the featured card shows the engine's **health
score**. But before anyone clicks, the card is judged on completeness. Gallery imports
must clear all of:

1. **Health ≥ 85 with no HIGH-severity warning** — asserted in CI by the golden test via
   `computeHealth` (never re-implemented in the validator). The arithmetic matters when
   shaping a route: high = −11, medium = −7, low = −3, so **at most two mediums** fit under
   the bar. A transfer day of 3.5–5 h of driving is a medium — expected, and exactly why the
   reference itinerary breaks its two driving days at Mysore rather than absorbing one
   seven-hour slog (a >5 h day is a HIGH, and fails outright).
2. **Budget honesty** — declared vs engine within ±15 % (golden test). Understating to
   look cheap betrays the app's "estimates, not facts" ethos on its most public page.
3. **Rhythm** — 3–6 stops/day; no day whose wheel+visit time exceeds ~12 h; `hotel`
   stops where nights actually fall.
4. **Card completeness** — cover image, tagline, best season, 3+ tips, warnings present.
5. **Filterable bands** — duration and budget land where real people filter
   (2–10 days; ₹4k–60k/person).

---

## 7. How to validate (the loop)

```bash
# coordinates first — looked up, never recalled (exits 1 on a miss):
node scripts/gallery-geocode.mjs "Abbey Falls, Madikeri, Karnataka" "Dubare Elephant Camp, Karnataka"

# structural contract — instant, offline, no deps:
node scripts/validate-itinerary.mjs docs/examples/itineraries/coorg-loop-from-bangalore.golden.json

# engine truth — health, budget ±15 %, schedule warnings (also runs in CI):
npx vitest run tests/golden-itineraries.test.ts
```

Authoring loop: write JSON → validator until clean → drop it into
`docs/examples/itineraries/` → golden test prices it → set `budgetPerPersonInr` and
`estimatedBudgetPerPersonInr` from the engine's own printed estimate → validator again →
PR. Never hand-pick the budget number.

### 7.1 Worked example — the reference itinerary, and what the gate rejected

`docs/examples/itineraries/coorg-loop-from-bangalore.golden.json` is the first shelf entry.
Its **first draft was a 3-day Bangalore→Coorg weekend, and Gate 2 rejected it**: day 1 came
out at **423 min / 268 km** — a HIGH "heavy travel time" warning, because Bangalore→Madikeri
is a 6–7 hour drive at the engine's blended speed, whatever the brochure says. The 5-day
replacement then scored **69** on its own first run — a day with no meal break (Day 3), a
backtracking final day, and one travel day 2 minutes over the medium band. Three fixes
(a Kushalnagar lunch, Srirangapatna moved beside Ranganathittu instead of onto the last
day, Channapatna added on the road home) brought it to a passing **≥ 85**: a **5-day loop
that breaks the drive at Mysore in both directions** (max day: 262 min), every ticketed fee
cited, at **₹12,100/person** against an engine estimate of ₹12,102 — 0.02 % drift.

The lesson is the point of the gate: **a gallery itinerary is shaped by the engine's realism,
not by the route's marketing.** The 3-day Coorg weekend is a popular plan and a bad plan; it
now appears in the gallery as the 5-day loop instead.
