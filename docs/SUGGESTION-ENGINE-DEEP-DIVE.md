# The YatraFlow Suggestion Engine — a deep dive

*How a trip-planning app learned to think about fatigue, weather, road shape,
and the people in the car — and why its favourite word is "no".*

---

## 1. What it is

YatraFlow's suggestion engine is the subsystem that answers one question,
continuously, while you plan an India road trip: **"given this route, this
crew, this vehicle, this weather and this day — what should we offer, where,
and when?"**

It is not a "nearby places" box. It is a pipeline that:

1. **plans the journey's breaks first** — spacing stops for human fatigue the
   way a seasoned highway driver would (stretch every ~2 hours behind the
   wheel, lunch inside 11:30–14:30, fuel on the tank's rhythm, the day ending
   before a night-driving wall), and only then
2. **fills those slots with real places** found along the actual road
   corridor, scored by position, detour cost, suitability, opening hours,
   weather and the crew's own history, and finally
3. **explains itself** — every card carries a "why" line ("Breaks a 3 h
   drive · 12 km off-route · near Mirzapur · indoor pick — 80% rain"), reason
   chips ("lunch window", "18% of budget", "★4.5"), and an honest empty state
   when the truthful answer is "nothing good here".

The design creed, stated in the code and enforced by tests, is that **an
honest gap beats a plausible fabrication**. The engine would rather show an
empty meal slot with a "Widen search" button than pin a bad restaurant to
make the UI look full.

Everything below was read straight from the source (`src/lib/ridePlan.ts`,
`src/lib/providers/*`, `src/lib/daySlots.ts`, `src/lib/tripDna.ts`,
`src/pages/trip/MapTab.tsx`, `src/pages/trip/timeline/TravelPanel.tsx`, …).
Where a number matters, it is the number in the code.

---


## 2. The architecture at a glance

```
                 ┌───────────────────────── PROVIDERS ─────────────────────────┐
                 │  Google Places (key)          Free stack (keyless)          │
                 │  · Autocomplete  (cheap SKU)  · Overpass (OSM POIs/towns)   │
                 │  · Text Search Pro            · Wikipedia geosearch         │
                 │    – Search-Along-Route       · Mappls (India POIs)         │
                 │    – point search (bias)      · OSM opening_hours           │
                 │  · searchNearby (towns)                                     │
                 │  · Place Details (on pick)                                  │
                 │  Quota guard: per-SKU monthly soft-caps (80% of free tier)  │
                 └───────────────┬─────────────────────────────────────────────┘
                                 │ PlaceHit[]  (one shared hit model)
                 ┌───────────────▼─────────────────────────────────────────────┐
                 │  geocode.ts — the facade                                    │
                 │  searchPlaces · searchNearbyPoisMulti · planJourneyHalts    │
                 │  provider directive: key present ⇒ Google-only, honest      │
                 │  failures; no silent free-stack fallback                    │
                 └───────────────┬─────────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼─────────────────────────────┐
        │                        │                             │
┌───────▼────────┐   ┌───────────▼───────────┐    ┌────────────▼───────────┐
│ hits.ts        │   │ ridePlan.ts           │    │ ranking: rankAndCap    │
│ corridor model │   │ the fatigue engine    │    │ poiTouristScore        │
│ · anchors ≤12  │   │ planRideSegments:     │    │ · category priority    │
│ · home zone    │   │ cadences, clock walk, │    │ · thumb/description    │
│ · polyline     │   │ meal-window slide,    │    │ · gap bias (itinerary) │
│   projection   │   │ day splits, rain, EV, │    │ · Google ratings       │
│ · detour math  │   │ road personality      │    │ · diversity caps       │
│ (asymmetric,   │   │ assignSegmentHits:    │    └────────────────────────┘
│  spur-based)   │   │ position+detour+fit+  │
└────────────────┘   │ hours+weather+DNA     │
                     └───────────┬───────────┘
                                 │ SegmentHit[] (annotated: purpose, km, ETA…)
        ┌────────────────────────┼──────────────────────────────────┐
        │                        │                                  │
┌───────▼─────────┐   ┌──────────▼─────────┐            ┌───────────▼─────────┐
│ Map tab rail    │   │ Timeline           │            │ Day slots engine    │
│ Nearby ideas:   │   │ TravelPanel:       │            │ daySlots.ts — the   │
│ need halts,     │   │ manual halt        │            │ day as fillable     │
│ See & do, story │   │ planner ("halt     │            │ parts (breakfast…   │
│ arcs, detour    │   │ after 100 km,      │            │ stay): filled /     │
│ budget hold-    │   │ 20 min, meal"),    │            │ empty / auto        │
│ back, search-to │   │ Find-real-spots,   │            └─────────────────────┘
│ add, slot rail  │   │ slack prompts      │
└─────────────────┘   └────────────────────┘
```

Around the core sit the **personalisation modules** — all pure, all
provider-agnostic, all node-testable:

| Module | Horizon | What it does |
|---|---|---|
| `roadPersonality.ts` | 3.1 | Classifies each road window highway / state-road / ghat / city from polyline geometry |
| `detourBudget.ts` | 3.2 | Each day earns a finite detour budget in minutes; suggestions visibly spend it |
| `tripDna.ts` | 3.3 | Remembers accepts/declines, builds a preference vector, bends ties, explains itself |
| (crew seeds, in `tripDna.ts`) | 3.4 | Open group-vote ideas suppress duplicates and bias the corridor toward their kind |
| `storyArcs.ts` | 3.5 | Clusters candidate sights into themed one-tap bundles ("Fort day: …") |
| `slackPrompts.ts` | 3.6 | "You have ~90 min slack in Jodhpur — Jaswant Thada is 15 min away" |
| `railReasons.ts` | — | The reason-chip grammar on every card, derived only from engine numbers |
| `haltFit.ts` | — | The single purpose-fit table: which place categories can serve which halt |

The whole engine sits on top of the planning engine proper (`engine.ts` —
schedule, budget, journey legs, warnings) and reads the road from OSRM
geometry whenever the network has resolved it.

---

## 3. The provider layer: where places come from

### 3.1 One hit model, two stacks

Every place the engine touches is a `PlaceHit` (`providers/hits.ts`): id,
name, coordinates, `kind` ('place' | 'poi'), a category hint, and optional
riches — Wikipedia thumbnail, description, opening hours, Google rating +
review count, real road detour, plus the annotations the planner stamps on
later (`haltPurpose`, `cumKm`, `legKm`, `nearestCity`, `population`, …).

Two provider stacks produce these:

- **Google mode** (when `VITE_GOOGLE_MAPS_API_KEY` is configured), using
  exactly three paid surfaces, chosen for SKU economy:
  1. **Autocomplete** for the location pickers (the cheap SKU; predictions
     carry no coordinates, so a pick costs one Place Details Essentials call).
  2. **Text Search Pro** in two flavours: **Search-Along-Route** — the whole
     OSRM polyline is re-encoded as a Google encoded polyline (a ~20-line,
     dependency-free encoder in `google.ts`) and sent as
     `searchAlongRouteParameters` — and circular-`locationBias` point search
     for single-anchor flows like an empty day's chips. Opening hours ride
     **the same events** via FieldMask (`regularOpeningHours` +
     `currentOpeningHours`), so they cost zero extra SKU. Road position comes
     from `routingSummaries.legs.distanceMeters`; detour is measured as the
     geometric **spur against that same polyline** (never another engine's
     route total — see §8.4).
  3. **Nearby Search (Essentials-only mask)** for the town/city layer —
     `includedTypes: ['locality']`, deliberately cheap fields, because asking
     for hours/ratings would upgrade the SKU.
- **Free mode** (no key configured): Overpass (OSM POIs with purpose-specific
  selectors), Wikipedia geosearch (notability + thumbnails + descriptions),
  and Mappls for India POIs; towns come from OSM `place=city|town` **with
  population**, merged with Wikipedia populated-place articles, larger
  population winning the dedupe.

Both stacks end in the **same** ranking tail (`rankAndCap`), so the tourist
logic is written once.

### 3.2 The provider directive: Google-only, honestly

A deliberate product decision (Sep 2026): **with a key configured, the POI
pipeline is Google-only.** A failed scan, an exhausted quota or an empty
result renders an honest "no match" / quota note — it does **not** silently
fall back to the free stack, because two different data qualities on
different days would make the product incoherent. The free stack is the
keyless mode, whole.

Exactly one exception exists, and it is documented in the code: **the
night-halt town anchor.** Google's `locality` type bottoms out at *village*
level in rural India (live-verified: hamlets like "Gauriyapur" with no
population to rank by), while OSM carries real towns with populations
(Chunar 37k, Mirzapur 234k, Hazaribagh). A night halt needs a town with a
bed, so the halt anchor layer asks OSM even in Google mode, and
`preferTownGrade` drops hamlet-grade entries whenever real towns exist. The
exception is scoped to that layer alone — POIs, meals and fuel never touch
the free stack in Google mode.

The **geocoding search box** (the place-picker inputs) is different: it
*does* degrade Google → free, because a picker that returns nothing is worse
than a picker with free results.

### 3.3 The quota guard: insurance, not billing

`providers/quota.ts` keeps per-SKU monthly counters in localStorage, bucketed
by UTC month (`yf.gquota.2026-09.textSearchPro`), with soft caps at **80% of
the verified India free allowances**:

| SKU | Free allowance /mo | Soft cap |
|---|---|---|
| Autocomplete | 70,000 | 56,000 |
| Place Details | 70,000 | 56,000 |
| Text Search Pro | 35,000 | 28,000 |
| Nearby Search | 10,000 | 8,000 |
| Routes API | 10,000 | 8,000 |

The guard is consulted **before** every request (`quotaAllows`), and an event
is counted **only after a request actually went out** (`quotaCount`). Hitting
a cap throws `QuotaExhaustedError`, and the surfaces say so in words ("Google
Places monthly cap reached — text search is paused until the counter rolls
over; remove the key to search the free stack") instead of rendering a dead
search box. An in-memory mirror keeps the guard working in private mode. The
real billing protection is the referrer-restricted key; this is the second
net if the key ever leaks.

---


## 4. The corridor model: anchors, home zone, and road-true positions

Before any search, the route becomes a **corridor**:

- **`corridorAnchors`** walks the route's stop chain (or the OSRM polyline)
  into at most **12 anchors** spaced roughly one search-radius apart,
  interpolating along cumulative distance. The destination always gets
  coverage.
- **The home zone** — `HOME_ZONE_KM = 15` around the trip's start — is
  excluded from suggestions everywhere: you don't need a computer to tell you
  what's near your own house. The filter is applied in `rankAndCap`, in
  `assignSegmentHits`, and in anchor generation.
- **Positions are road-true.** A hit's "km from start" prefers, in order:
  the provider's own road position (Google's `routingSummaries` leg-0
  distance), then a **nearest-segment projection onto the actual route
  polyline** (`projectOntoPolyline`, stride-sampled to 500 points to bound
  CPU), and only then the coarse straight-line anchor interpolation. This is
  what keeps a "≈300 km lunch" from attaching to a place that's really 380
  road-km into a Himalayan switchback section (the brainstorm's issue #1 —
  fixed).
- **Detours are asymmetric.** `asymmetricDetourKm` measures the perpendicular
  **spur** from the hit to the polyline: a place within 150 m of the road
  (`ON_ROUTE_SPUR_KM`) is *on the way* and costs ~0; a place off the road pays
  the **round trip** (out and back). Detours are then converted to **minutes
  at the trip's own door-to-door speed** (`MODE_SPEED`, default 40 km/h), so
  the same 10 km spur costs a motorcycle and a bus differently. When Google
  says a hit is along-route but gives no detour number, the UI says "on
  route" rather than inventing a small straight-line figure — `detourKm`
  returns `null` on purpose.

Cache keys ride the same model: `anchorHash` (every anchor at 5-decimal
precision) and `routeHash` (first/middle/last geometry points) — so editing,
reordering or re-routing stops invalidates exactly the right caches.

---

## 5. The fatigue engine: segments before places

This is the heart of the system, and the single idea that makes it different:
**plan the breaks, then fill them.** `planRideSegments` turns "1,400 km, ~28
wheel-hours" into an ordered list of `RideSegment`s — *"at ~300 km, a meal;
at ~550 km, end the day in a city"* — each with an acceptance window. Only
after that does a search go out looking for real places.

### 5.1 The cadences (and why they're clock-first)

| Purpose | Cadence | Rationale in the code |
|---|---|---|
| Stretch | every 150 km **and never more than 2 h of wheel time** | ≈2 h at highway speed; `STRETCH_CLOCK_MIN = 120` |
| Meal | every 300 km | ≈4 h; the lunch cadence |
| Fuel | every `0.85 × tank range` (default 450 km → 382.5 km), **corridor-wide** | the tank doesn't reset overnight |
| EV charge | `0.8 × usable range` (min 80 km), 60-minute dwell | hills/AC buffer; the fuel *purpose* stays, labels speak "Charge" |
| Overnight | at the day boundary the **wheel cap** implies | not a fixed 550 km tick |

Two subtleties worth quoting:

- **Fatigue is measured in hours, not km.** The 150 km constant was born as
  "≈2 h at 65–75 km/h", but the engine's blended all-India speed
  (`MODE_SPEED.car = 42` km/h) turns 150 km into 3.6 h. So the stretch
  cadence is `min(150 km, 2 h expressed in km at this journey's own blended
  speed)` — never *looser* than the km cadence, so highways keep their
  rhythm and slow ghat roads get more frequent breaks. This is also why an
  80 km ghat crawl (3 h behind the wheel) earns its stretch even though it's
  under the 90 km "too short to plan" floor: the floor checks *time* too.
- **Fuel runs on a global cadence.** Resetting the fuel step at each day
  start made fuel stops structurally impossible whenever the load-balanced
  day budget (≈350 km) was shorter than the tank stride (382.5 km) — a live
  1,400 km / 4-day plan grew zero fuel segments before this was fixed.


### 5.2 The day split and the wheel cap

Multi-day plans don't divide km by the user's day count. `planDriveDays`
derives day boundaries from a **wheel-time cap**:

- Base cap by style: **packed 11 h · balanced 10 h · relaxed 8.5 h**.
- Mode tuning: a motorcycle rides **1.5 h below** its style's cap ("helmet
  fatigue and exposure compound, and nobody's life should depend on an 11 h
  saddle day").
- Party tuning: two rotating drivers buy **+2 h** (+3 max at 3+);
  infants/seniors aboard cost **−1 h**. Rails: never below 6 h, never above
  12 — "even four packed drivers get a sleep".
- Rain multiplies the cap by `rainFactorFor(pct, wmoCode)` — a
  confidence-*and-severity*-weighted factor clamped to [0.5, 1]: a 60% chance
  of drizzle (severity 0.75) is not a 60% chance of a thunderstorm
  (severity 1.25), and the model deliberately has no "drive faster in rain"
  tail.
- Conducted modes — train, bus, flight, taxi — get **null**: there is no
  wheel to fatigue, so no split verdict and no break planning. (`mixed` stays
  plannable.)

### 5.3 The journey clock

Segments then walk a wall clock (`planTravelClock` / the meal-slide in
`planRideSegments`), anchored on **fixed biological windows**:

- Breakfast 08:00–09:30 · **Lunch 11:30–14:30** · Tea 16:30–17:30 ·
  Dinner 20:00–21:00 (dinner *ends the day*; night-driving wall at 23:00,
  overridable with a stated post-dinner allowance for dhaba-style long runs).
- Meals **slide**: a meal segment whose ETA falls outside the lunch window is
  shifted toward the nearest window edge, clamped to the road, with a
  final-day guard (lunch may never slide later than destination ETA − 90 min
  — "arriving stuffed at midnight helps nobody"). The slide re-runs the
  collision collapse to a fixpoint (≤16 passes).
- **Late-start honesty**: a start that leaves less than 2 h of honest wheel
  time before the night wall produces a *defer* verdict ("leave at 06:00
  tomorrow"), and a waking span under 6 h becomes a *hop* day (≤2 h drive,
  dinner at the halt). The app would rather tell you to sleep than draw a
  fiction.
- Halt durations are honest dwell: stretch 15 min, meal 45, tea 20, fuel 15
  (charge 60), dinner 60 — and **ETAs are dwell-corrected**: every halt's
  dwell earlier in the day pushes later arrivals, per day.


### 5.4 Collision folding and the pins

Cadence ticks closer than **110 km** fold into one segment by priority
(overnight > meal > fuel > stretch), producing combined labels ("Meal +
fuel", "Overnight + charge"). A fuel tick landing within 15% of its stride
of a meal/overnight folds into it ("refuel where you eat or sleep"). A meal
that slides to within ~1 h of the night halt is **absorbed** by it ("dinner
at the halt anyway") — time-bounded, not km-bounded, after a live bug where
every multi-day lunch was eaten by its halt.

**Nothing lands within 60 km of the destination** (scaled down on short
journeys), and **accepted night halts are pinned**: re-planning snaps a
pinned halt to its accepted position; drift under 15 km is silent noise,
beyond that the new position is surfaced as a *proposal* ("Move here /
Stay"), never a silent move. Route re-shapes void the pins.

### 5.5 Filling the segments: the assignment scoring

`assignSegmentHits` maps the candidate pool onto the segments — greedy in
journey order, then one pairwise **swap-improvement sweep** to undo greedy
steals. The score per (hit, segment) pair, lower is better:

```
score = distance-to-target (penalised outside the segment window)
      + 2 × asymmetric detour minutes        (on-the-way ≈ 0, spurs pay round trip)
      + opening-hours penalty                (closed on arrival ≈ a 10 km detour)
      + (3 − purpose-fit) × 4                (the fit table, weather-adjusted)
      − trip-DNA boost                       (≤ 3 points — bends ties only)
```

Hard gates around it:

- **Need-based purposes never take the wrong kind of place.** Fuel, meal and
  overnight segments require fit ≥ 1 — a college with zero fuel-fit leaves
  the segment *empty* (rendered as a gap with a "Widen search" action), never
  filled as a bogus pump.
- **A night halt must sit near its halt**: populated-place anchors more than
  120 km from the overnight target are refused outright (this guard exists
  because a halt once "anchored" on a town 800 km away).
- **Purpose fit** comes from one table (`haltFit.ts`): food serves meal
  (3)/stretch (2)/rest (2); transport hubs serve fuel (3); hotels serve
  overnight (3); cafes serve stretch (3); populated places get +2 for
  meal/fuel/overnight, and overnights add a log-population bonus (capped at
  3) — which is how "the biggest town near the halt" wins honestly.
- **Weather adjusts fit**: on a rainy segment (≥60% rain chance), exposed
  categories (nature, beach, temple, adventure) lose a point and sheltered
  ones (museum, cafe, shopping) gain one — and the card says so: *"indoor
  pick — 80% rain"*.
- **Opening hours degrade, not disqualify**: a hit closed at your ETA earns a
  penalty scaled like ~2 points per 15 minutes of shut door, matched to the
  ×2 detour weight.

Unassigned corridor hits don't vanish: **sight-worthy** leftovers (a strict
category set — dhabas, hotels and pumps are *errands, not attractions*)
become the **See & do** column with synthetic sight segments at their road
positions, capped at 12. Without this the sightseeing column would be empty
*by construction*, because the planner never creates sight segments.

Every assignment is then **annotated** with cumulative km, leg km/minutes
since the previous stop, the nearest big city within 120 km, and a human
hint ("≈2 h wheel time — stretch & hydrate").

---


## 6. The tourist ranking: `poiTouristScore` and the caps

The corridor scan's raw hits go through one ranking tail:

```
score = −8 × category-priority        (see & do 0/1 → … → shopping 5, fuel 4)
      + 5 if a Wikipedia thumbnail    (notability signal)
      + 3 if a meaty description (>40 chars)
      + 3 for sight-class categories
      + itinerary-gap bias            (computeCategoryBias — see below)
      + Google rating boost           (≥4.5 → +4, ≥4.0 → +2 — only with ≥10 reviews)
      − 6 × distance-to-nearest-anchor fraction
```

Then **diversity caps**: no category may take more than a third of the list
(minimum 3), and fuel is hard-capped (4 when fuel is wanted, 0 otherwise) —
"to stop a wall of dhabas or temples". Near-duplicates collapse via
`samePlace` (≤500 m plus word overlap), and anything already on the
itinerary is filtered (`filterPlannedNearby`: within 2 km, or a fuzzy name
match).

**The itinerary-gap bias** (`computeCategoryBias`) is the engine looking at
what you *already planned*: a bare itinerary seeds a plausible tourist day
(sightseeing +5, nature +5, beach/temple/museum +3); a category with 3+
stops is demoted (−4); a self-drive day of 120+ km with no food stop makes
food hungry (+5); a multi-day trip with no hotel boosts stays (+5). Travel
style adds priors on top. The suggestion list therefore *fills holes* rather
than piling on what's already there.

---

## 7. The personalisation layer (the "Concierge" horizons)

### 7.1 Road personality — the engine reads the road's shape

`roadPersonality.ts` classifies each segment's window from polyline geometry:
**sinuosity** (path length ÷ straight-line) and **twist** (total bearing
change per km), stride-sampled to 200 points so it never becomes a mobile CPU
problem. Sinuosity ≥ 1.3 or twist ≥ 0.5 rad/km ⇒ **ghat** — and the segment
carries the warning *"rest before the climb — 40 km of switchbacks ahead"*.
Sinuosity < 1.15 and twist < 0.15 ⇒ **highway**. A day whose *average* speed
is under 30 km/h marks its non-ghat windows **city crawl** ("short hops, slow
traffic").

A delightful honesty detail lives here: per-window speed was *removed*
because the algebra cancelled (`windowKm / (driveMinutes × windowKm /
totalKm / 60)` ≡ day average) — so the crawl verdict moved to the level it
can actually measure. The code comments say exactly that.

A sibling advisory, `fuelGapWarnings`, flags a planned fuel stop when the gap
to the *next* planned refuel (or the journey's end) exceeds 1.4 × the safe
tank stride: *"No scheduled fuel for ~520 km — fill the tank here."*

### 7.2 The detour budget — a finite, honest menu

`detourBudget.ts` gives each day a budget in minutes:

```
budget = max(15, 45 + style delta − 5 × max(0, plannedStops − 2))
         style delta: relaxed +15, packed −15
```

Suggestions **spend it visibly**: cards and map popups show "18% of the day's
detour budget", chips warn "over budget", and the See & do rail — the endless
list — is gated: walking in journey order, whatever would push cumulative
spend past the budget is **held back**, counted and shown as a line, never
offered as an addable card. Zero-detour (on-route) picks never spend. Need
halts are exempt by construction — they're finite already.

### 7.3 Trip DNA — the engine that learns the crew

Every accept/decline/seed is a `DnaEvent` (trip, action, category, halt kind,
detour minutes, visit minutes). `buildDnaVector` folds the log into a small
preference vector: **category affinity** (accepts minus declines, floored at
0), **average accepted detour**, **average visit length**.

It changes the product in three deliberate, *bounded* ways:

1. **Scoring**: a favoured category shaves up to 3 points — the same scale as
   purpose-fit, capped so DNA **bends ties and never outweighs** position,
   detour or fit.
2. **Explanation**: affinity ≥ 2 earns the card a note — *"you've picked 3
   waterfall stops this trip"*; with 3+ accepts of a slot kind, the rail
   learns the crew's habit — *"you usually accept about +12 min for these"*
   (or "you usually take these without a detour").
3. **Memory**: the log lives in localStorage (capped at 500 events) *and* in
   a `user_dna` row per account (debounced 1.2 s push, merged by content key
   so a second device inherits the profile). Sign-out detaches the account
   copy so the next person on the device never inherits it. Every read path
   validates; a malformed event is ignored, never fatal.


### 7.4 Crew seeds — the group's ideas steer the corridor

Open group-input ideas (the Board's suggestions) become **seeds**: they
suppress near-duplicate corridor suggestions around themselves (an idea is
already on the table — offering it again is noise) and they bias the DNA
vector with `seed` events — affinity without acceptance credit, because
*proposing ≠ the crew having gone*. Matching cards say *"more like Arjun's
waterfall"*.

### 7.5 Story arcs — one-tap themed bundles

`storyArcs.ts` clusters the live See-&-do pool by theme — fort, pilgrimage,
beach, waterfall, spice, backwater, museum — from category plus name and
description keywords (Wikipedia's text supplies the tags). A theme with two
or more hits becomes an arc with a generated label — *"Fort day: Amer →
Nahargarh → Jal Mahal"* — offered as a one-tap multi-add, biggest story
first.

### 7.6 Slack prompts — the nudge that knows the clock

After any itinerary change, the Timeline's travel panel recomputes the day's
**slack**: day window minus drive, dwell, planned halts and per-stop buffers,
floored at zero. Below 45 minutes it stays silent. Otherwise it offers the
closest candidate whose **there-and-back detour plus a sensible visit**
(food 45 min, sights 90, transport hubs 20) fits: *"you have ~90 min slack in
Jodhpur — Jaswant Thada is 15 min away."* The candidate pool refreshes only
on explicit searches; the *pick* recomputes live.

### 7.7 The reason-chip grammar

Every card's chips come from `railReasons.ts`, which is forbidden from
inventing estimates — each chip traces to a number the planner already
produced: `over budget` (warn tone, first), `lunch window` (ETA inside
11:30–14:30), `2 h 10 m stretch` (leg ≥ 105 min — a *band* 15 min below the
nominal 2 h, because engine estimates carry ±15% slop and "estimated
quantities get bands, not cliffs"), `★4.5` (only with ≥10 reviews), `18% of
budget`, `first stop`. Three chips max — "the card stays a scan".


---

## 8. Honesty engineering: the failure modes it refuses

A large share of the engine's code — and nearly all of its folklore — is
about *not lying*. The main mechanisms:

### 8.1 Gaps, not fabrications
A segment with no suitable candidate renders as an honest gap ("No good
match near ~300 km yet") whose one action is the lever the engine actually
has: **widen the detour scope** (the slider's steps: 10/20/30/50/80/100 km).
Need-based purposes refuse wrong-kind places outright.

### 8.2 Degraded scans are never cached
The first scan can run before OSRM geometry resolves; a persisted empty or
start-area-only plan would serve the starved corridor for the full 4-hour
TTL. So empty plans and *degraded* ones (no route geometry on a multi-anchor
trip) skip the cache, and the effect re-fires when geometry arrives.

### 8.3 The Null Island guards
Both providers can emit "resolve-on-pick" placeholder coordinates. A live
incident (a route drawn to the Gulf of Guinea, a 116-day split banner,
±45,616 km impact previews) hardened every write-into-a-trip path:
`requireHitCoords` resolves or refuses with a visible toast; `hasCoords`
requires **both** coordinates non-zero (the live bug was a *mixed*
placeholder — lat 0 with a real lng). Autocomplete SKUs stay cheap
(resolve-on-pick); surfaces that *rank* by coordinates before any pick use
Text Search with real coordinates instead.

### 8.4 Never mix two engines' route totals
Google's Search-Along-Route computes its own route start→place→end, so
subtracting an OSRM total inflated detours by up to **+47 km on a 1,400 km
corridor** — a highway petrol pump read "50 km off" and torched the detour
budget. The invariant, now pinned by tests: **a place on the drawn road must
read ≈0**, and detours are the geometric spur against the *same* polyline the
search ran on. The same lesson lives in `routePath`: it degrades internally
to straight-line estimates rather than throwing, so callers grade the
*result* (`source !== 'estimate'`) and retry — a rejection you never receive
is not a failure signal.

### 8.5 Quota and provider honesty
Google-mode quota trips pause surfaces with an explanation, not an empty
state that reads as "nothing around". Free-stack hits carry no ratings, so
rating chips stay silent there rather than implying a sample that doesn't
exist.

### 8.6 One attribution of truth
"Which day does this halt belong to" is derived once
(`tripDayAttribution`, over road-true per-day km) and shared by the rail, the
day chips and the Overview matrix — because "two surfaces deriving the same
day from two different attributions is exactly how a day plan ends up
disagreeing with itself on screen." Unknown km returns null instead of
silently attributing to Day 1.

---


## 9. The surfaces: where the traveller meets it

**Map tab — "Nearby ideas".** The corridor scan's full output: need halts
(stretch/meal/fuel/overnight) as ledger rows with purpose labels, reason
chips, "why" lines, ratings and reported hours; See & do with the
detour-budget hold-back line; story arcs; per-card "also nearby"
alternatives (same family, ranked by position + detour); cross-highlighting
with the map pins; add-to-day inserts **in road order**; a search-to-add box
whose results are projected onto the route ("~275 km into the trip · 12 km
off-route · beyond your detour scope"); and a rotating "engine tips" strip
that teaches the model ("Breaks are spaced for fatigue…", "Every idea is
checked against your detour budget…").

**The slots rail (the day as fillable parts).** `daySlots.ts` projects the
same engine output into the day's grammar — breakfast, lunch, dinner, fuel,
stretch, stay — with three states: **filled** (one quiet line), **empty**
(pre-scored candidates inside: detour minutes, budget share, arrival vs the
window, urgency "closes 14:30"), **auto** (engine-managed stretches ask for
no work). Filling is honest about *why* a stop claims a slot: category,
reported hours overlapping the window, or the nearest-window fallback — and
two slots never claim one stop. Empty slots offer slot-scoped search,
manual candidates, and can be raised as a **crew vote**. Day readiness
("3 of 5 parts") rolls up to the trip.

**Timeline — the travel panel.** Every driving day shows departure → ETA
clocks (dwell-corrected), fuel math, a hand-off to Google Maps for the actual
navigation, and the **manual halt planner**: you say "halt after 100 km, 20
minutes, meal", and *Find real spots* maps the best real places onto your
km marks (opt-in "detour to X instead of the route point" — planned halts
are on-route by default). The live arrival preview includes your planned
halts and buffers. The slack prompt lives here.

**The map itself.** The travel clock is *drawn on the road* as labels — each
planned meal/overnight's wall-clock time and date on the left of the road,
its road-km on the right — projected from the same verdict the banner shows,
so map and banner can never disagree. Round trips model the ride home as a
directed return pass, and a Return-home toggle re-reads km labels as distance
*from home* on the way back.

**Create funnel and friends.** The same engine vocabulary surfaces before the
trip exists: **Anticipation** (the moment after creation: conflicts first,
then weather, meals, fuel — capped at four, "a glance, not a report", with an
explicit no-filler contract), **Route IQ** (one honest line about the longest
hop, labelled as rough), **Seasonality** (climatology notes per region/month
— silence over filler), and the **decision guide** (grounded, offline
recommendations for crew decisions, computed from the same totals/health the
Overview shows).

---

## 10. Caching and invalidation: expensive searches, explicit refresh

Corridor searches are expensive (one SAR event per category, per provider),
so **persistence is the contract**: results persist per trip in localStorage
for 4 hours (`useSuggestionCache`, schema-versioned — bumping the version
invalidates every stale cache at once), keyed by a hash of **every input the
engine reads**: anchors, route, travel style, transport mode, detour scope,
travellers, driver count, vulnerable-party flag, post-dinner allowance,
budget, fuel economy, fuel price, round-trip, vehicle profile. Change the
crew and the cache busts — you never get 4-hour-old suggestions tuned for
the old party.

Hydration **never refetches** on derived-state churn; only explicit user
actions — ↻ Refresh, the detour-scope slider, 📍 Suggest / Find real spots —
re-run a search. Accepted-halt pins live in their own store and are voided
when the route's endpoint hash changes (with a toast, and a map-cache
flush). The halt planner's plan and its resolved spots persist per day, and
rehydration is careful never to clobber an in-progress edit.

---


## 11. How it's tested

The engine is deliberately built as **pure modules with no network and no
env**, exercised directly by node tests — the UI is a thin, honest renderer
over them. The suite (counts at the time of writing):

- `ridePlan.test.ts` — **70** tests: cadences, clock walk, slides, absorbs,
  pins, EV, rain, party caps, day splits, assignment, swaps, gaps.
- `daySlots.test.ts` — **109** tests: slot derivation, fill passes, windows,
  votes, readiness.
- `trip-dna.test.ts` — **30**: vectors, boosts, notes, merges, caps.
- plus dedicated files for nearby/corridor ranking (16), road personality
  (10), detour budget (6), slack prompts (5), story arcs (12), rail reasons
  (10), asymmetric detours (6), time detours (10), suggestion cache (12),
  suggestion dedupe, fuel corridor, road halt placement, providers and quota
  (fetch-mocked route tables), and the golden-itinerary gate that runs real
  shelf trips through the engine's own health arithmetic.

Live-verification scripts (`scripts/verify-google-places.mjs`) replay the
exact FieldMasks against the real API — which is how the team learned that
one bad `includedTypes` member 400s an entire Nearby Search request, and why
the type list is validated against the live API rather than trusted.

---

## 12. Known limits, stated honestly

The engine's own comments are candid about what it cannot do yet:

- **Estimates until the road resolves.** Before OSRM answers, distances are
  straight-line × 1.25 at the mode's blended speed (+10 min per leg) — a
  real 175 km ghat drive can over-read, winding roads can under-read. The
  UI labels these as estimates and re-derives everything when geometry lands.
- **Leg granularity.** Terrain inside a single stop-to-stop leg only moves
  the anchors when the provider returns per-coordinate durations (OSRM does;
  wired in). Finer terrain models are an open decision.
- **The night wall is a clock, not a sunset.** 23:00 defaults from
  dinner-service close, not latitude-aware daylight — northern-winter trips
  should override it (the anchor inputs exist).
- **Meal slides use proportional wheel time**, not per-window speeds; road
  personality warns, it doesn't (yet) re-time the day.
- **Quota counters are per-device** (localStorage), insurance rather than an
  account-global meter.
- **Story arcs are heuristics** over categories and keywords; slack prompts
  need ≥45 min of slack and model detours as there-and-back.
- **DNA is a tie-breaker by design** — ≤3 points — so a young log changes
  nothing and an old one nudges rather than rules.

---

## 13. How it got here (release archaeology)

| Release | What the suggestion engine gained |
|---|---|
| v0.41.0 (2026-09-07) | **Corridor Concierge, Horizons 1–3**: road personality, detour budget, Trip DNA, crew seeds, story arcs, slack prompts, asymmetric detours, hours scoring, fuel advisories; the Google-only provider directive |
| v0.42.0 | Audit fixes: batch "add all" write-through, route-hash cache invalidation, degenerate-route guard, detour budget from actual stops |
| v0.43.0 | Sights join the corridor scan (See & do fed), panel↔map cross-highlighting, route-ordered additions, engine tips |
| v0.47.0 | In-map place search; grounded per-decision offline recommendations |
| v0.54.0 | Spur detours against the searched polyline (#187), one corridor-wide road measurement with honest degraded grading (#188), night halts anchored on OSM towns with the town-grade guard (#189), meal/fuel cadence fixes for load-balanced days |
| v0.55.0 | The golden-itinerary gate: shelf trips must pass the engine's own health math |
| v0.56.0 | Settings integrity: crew/fuel/budget inputs join the cache hash; honest vehicle cadences |
| v0.62–0.63 | The travel clock drawn on the road; presence-era co-editing touches |
| v0.65.0 | Slot search lands real stops, the map's honesty pass (fit frames the drawing), the Create funnel (route IQ, seasonality, readiness, anticipation) |

---


## 14. The one-paragraph version

YatraFlow's suggestion engine treats a road trip as a **fatigue-and-clock
problem before it is a places problem**: it plans where the crew's body and
the vehicle's tank will need the road to pause, walks those plans on an
honest wall clock with biological meal windows and a night-driving wall,
reads the road's own geometry for ghat climbs and city crawls, and only then
fills each slot with real, provider-searched places — scored by position,
round-trip detour minutes at the trip's own speed, purpose fit, opening
hours, weather, and the crew's accumulated DNA, then spent against a finite
per-day detour budget. Every claim on screen traces to a number the engine
computed, every failure renders as an honest gap with a real lever, and the
whole thing is pure, provider-agnostic, and pinned by ~300 tests.

---

### Appendix: the file map

| File | Role |
|---|---|
| `src/lib/ridePlan.ts` (1,639 lines) | The fatigue engine: segments, clock walk, day splits, assignment, annotations, reasons |
| `src/lib/providers/hits.ts` | The shared hit model + corridor math (anchors, projection, detours) + tourist ranking |
| `src/lib/providers/google.ts` | Google Places: autocomplete, Search-Along-Route, point search, cities, hours |
| `src/lib/providers/free.ts` | The keyless stack: Overpass, Wikipedia, Mappls, OSM hours |
| `src/lib/providers/quota.ts` | Per-SKU monthly soft-cap guard |
| `src/lib/geocode.ts` | The facade; `planJourneyHalts` orchestration; provider directive |
| `src/lib/haltFit.ts` | The purpose-fit table (single source of truth) |
| `src/lib/purposeQueries.ts` | Purpose → provider query strings |
| `src/lib/roadPersonality.ts` | Geometry → highway/state-road/ghat/city |
| `src/lib/detourBudget.ts` | The per-day detour budget |
| `src/lib/tripDna.ts` | Trip DNA + crew seeds + account sync |
| `src/lib/storyArcs.ts` | Themed bundles |
| `src/lib/slackPrompts.ts` | Slack math + the nudge |
| `src/lib/daySlots.ts` | The day-as-fillable-parts projection + readiness |
| `src/lib/railReasons.ts` | The reason-chip grammar |
| `src/lib/engine.ts` | The planning engine beneath (journeys, budget, category bias) |
| `src/hooks/useSuggestionCache.ts` | The 4 h trip-scoped suggestion cache |
| `src/pages/trip/MapTab.tsx` | The Nearby-ideas rail + slot rail + map wiring (2,418 lines) |
| `src/pages/trip/timeline/TravelPanel.tsx` | The per-day travel card + manual halt planner + slack prompt |
| `docs/SUGGESTION_ENGINE_BRAINSTORM.md` | The design doc that named the Corridor Concierge |

