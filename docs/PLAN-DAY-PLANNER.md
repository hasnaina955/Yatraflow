# Execution plan — The Day Planner (travel-clock engine)

*Status: IMPLEMENTED through P1-G (Sep 13, 2026) — P1-A shipped pure engine
(planDriveDays + clock stretch twin); this PR adds the travel clock
(planTravelClock), the derived arming + proposal/defer/hop banners, fraction
rows, day chips + day types, the lodging bill line, and the day-out presets.
See §17 for the honest deltas from this document (fixture times re-derived,
P1-F scoped to its chips). Consolidates three brainstorm sessions (Sep 2026):
the short-trip silence feedback, the multi-day "dinner ends the day" model,
and the start-time dynamics. Parent brainstorm:
[`SUGGESTION_ENGINE_BRAINSTORM.md`](SUGGESTION_ENGINE_BRAINSTORM.md)
— this plan operationalizes its §2 gaps for trips that are too short *or too
long* for the current highway-tuned cadence.*

## 0. How to use this document

- §1 is the honest map of what the engine does today (with receipts).
- §2–§3 define the model: fixed clock anchors + duration caps, and every
  constant **derived** from constants the engine already has.
- §4 is the file-level change map; §5–§11 are the implementation phases
  (P1-A … P1-G) in release order. Each phase is shippable alone.
- §13 lists the test fixtures that ARE the spec — write these first.
- §15 lists open questions that must be answered before the phase that needs
  them. Nothing else here awaits sign-off.

## 1. What the engine does today (the honest map)

**It thinks in kilometres only.** `planRideSegments` (`src/lib/ridePlan.ts`)
places halts by distance cadence: stretch every `STRETCH_INTERVAL_KM = 150`,
meal every `MEAL_INTERVAL_KM = 300`, overnight every
`OVERNIGHT_INTERVAL_KM = 550` — and only when `multiDay` is armed. The clock
never enters: an 05:00 start and an 08:30 start produce identical plans.

**The multi-day split is armed by the user's plan, not the route.**
`MapTab.tsx:306` — `multiDay: trip.days.length > 1`. Two stops 700 km apart in
a 1-day plan → `multiDay: false` → all 700 km land in Day 1. No overnight is
proposed, no Day 2 exists.

**And by its own numbers, the constants are impossible:**
- `MODE_SPEED.car = 42` kmph (blended all-India) × `OVERNIGHT_INTERVAL_KM = 550`
  = **13.1 h of wheel time in one day**. The current overnight tick demands a
  waking-impossible day by the engine's own speed table.
- `STRETCH_INTERVAL_KM = 150` ÷ 42 kmph = **3.6 h between stretch breaks** — the
  150 km constant was highway-derived (~2 h at 65–75 km/h) but is consumed at
  blended speed.
- Short trips go silent: with `MIN_PLANNED_DRIVE_KM = 90` as the floor, first
  stretch at 150 km and nothing within `ENDNO_KM = 60` of the destination, no
  halt can land below **210 km** — and the MapTab suggestion strip is
  halt-anchored, so it renders nothing. This is the user feedback that opened
  the brainstorm.

## 2. Scope & non-goals

**In scope:** one "Day Planner" pass over the route that plans **drive days,
stay days, meal/stretch halts, and night halts** from *clock time* — honouring
fixed biological meal anchors, a duration-based fatigue cap, and the user's
actual start time. Plus the short-trip surfaces that fall out of the same
model (fraction fallback rows, destination Day-out arc, return-leg awareness).

**Non-goals:** bookings or real hotel inventory (the night halt is a
*suggested place*, accepted into the itinerary like any stop); user-editable
meal windows (a later settings exposure — the windows are constants for now);
offline maps; per-leg live traffic (terrain speeds come from the existing leg
model, not live data).

## 3. What already exists — extend, never duplicate

- `planRideSegments` already knows halt *purposes* with priority
  (`overnight > meal > fuel/stretch`), collision folding, `ENDNO` exclusion,
  and **cadence reset after an overnight** ("day-2's stretch lands ~150 km into
  day 2, not 600 km from the origin").
- `dayIndexAt(km, dayStarts)` already re-attributes route positions to days.
- `planJourneyHalts` already receives `totalKm` **and** `driveMinutes`, and the
  corridor scan already runs purpose-specific queries (incl. hotel text
  searches for overnight segments).
- `MEAL_WINDOW = [11:30, 14:30]` exists — the lunch anchor is already clock-
  based; the model below generalizes it.
- `DEFAULT_DAY_START = 08:30` and `dayStartTimes` already flow into the planner.
- `countHotelNights` already prices nights from stay stops — an accepted
  structural overnight automatically gains its bill line.
- `cadenceForCrew` already tunes cadence by crew size and style; `dayRainPct`
  already flows into the planner.
- `HOME_ZONE_KM = 15` exists for close-to-home suggestions.
- Detour honesty: `dayDetourBudgetMin` (45 min/day, style-tuned) and
  `asymmetricDetourKm` (direction-aware) are untouched by this plan — the
  planner changes *which gaps exist*, not what a detour costs.

## 4. The model (one pass, plain words)

**Meals are fixed anchors on the clock** (biology, not the route):

| Anchor | Window | Note |
|---|---|---|
| Breakfast | 08:00–09:30 | fires only when the day intersects it (early starts) |
| Lunch | 12:00–14:30 | generalizes the existing `MEAL_WINDOW` |
| Tea | 16:30–17:30 | stretch cadence often lands here; merges into tea |
| Dinner | 20:00–21:00 | **ends the driving day** |

**Stretch breaks fill the gaps between meals** — every `STRETCH_CLOCK_MIN`
(derived §6) of *actual driving*, merging into a meal window when they coincide
(clock twin of `MIN_BREAK_GAP_KM`).

**A duration cap ends the day when dinner doesn't**: `WHEEL_HOURS_CAP` (~10 h
of real wheel time, style/crew/rain-tuned). When the cap or dinner arrives —
whichever first — **the car stops at a place that has a room.** That stop is
the night halt. The road beyond it is tomorrow; every suggestion past it is
born with tomorrow's day index.

**The start time never changes capacity, only the schedule.** The cap is
duration-based — fatigue counts hours behind the wheel, not clock hours. An
early start buys *slack and rest*, not more km:

| Start | Dinner (fixed) | The day (same ~420 km, car) |
|---|---|---|
| 05:00 | 20:30–21:00 | drive → breakfast 08:30 → lunch 13:00 → tea 17:00 → **night halt ~17:30** → rest → dinner at the halt |
| 08:30 | 20:30–21:00 | lunch 13:00 → tea 17:00 → night halt right at dinner |
| 14:00 | 20:30–21:00 | tea 17:00 → ~190 km → dinner **is** the night halt |
| 22:00 | — | < 2 h honest wheel left → **defer proposal**: "start tomorrow 06:00 instead" |

**Night cap**: the driving day hard-caps at `NIGHT_END = 23:00` (a stated
default, exposed as a setting later). Late starts that can't fill a minimum
honest drive produce a **short hop** (drive 1–2 h to a night halt) or the defer
proposal — never silent night driving.

**The engine proposes the split; it doesn't wait for day-tabs.** When
`totalKm > dailyKmBudget` (derived §6), the planner proposes
`driveDayCount = ceil(totalKm / dailyKmBudget)` days at `perDay = totalKm /
driveDayCount` each — **minimize the maximum daily wheel time** (classic load
balance; never 585+115). The user's planned day count is an *input to respect
when it matches*, not the arming condition. If the user insists on one day for
700 km, warn honestly (fatigue verdict goes red) and respect it.

**Stay days are derived, not labelled.** Days with wheel time are DRIVE days;
days anchored at the destination with no wheel time are STAY days. Stay days
get local-radius suggestions (walk scale, not corridor scale).

**Structural overnights ride outside the detour budget.** The night halt is
not an optional detour — its minutes are not charged against the 45-min/day
detour honesty. Its *cost* is charged honestly: accepting a structural night
halt inserts a stay stop and the bill gains "+1 night: the drive needs a stay"
with its formula line.

## 5. Derived constants (every number a consequence, no example needed)

| Constant | Derivation | Value |
|---|---|---|
| `STRETCH_CLOCK_MIN` | 150 km ÷ highway 65–75 km/h = 2.0–2.3 h → floor | **120 min** of wheel time |
| Halt durations | stretch 15 · meal 45 · tea 20 · fuel 15 · dinner 60 (new named constants; tea is the stretch cadence landing in the tea window) | new |
| Waking span | `DEFAULT_DAY_START 08:30` → dinner end 21:00 | 12.5 h (varies with start; dinner end fixed) |
| In-day halt time | stretches @ 120 min × 15 + meal 45 + tea 20 (+ fuel) | ≈ 2.5 h |
| `WHEEL_HOURS_CAP` | 12.5 − 2.5 | **10 h** (packed 11 / relaxed 8.5 / rain ×0.85 / crew ≥ 5 per `cadenceForCrew`) |
| `NIGHT_END` | night-driving default | **23:00** (setting later) |
| `dailyKmBudget` | `WHEEL_HOURS_CAP × MODE_SPEED[mode]` → 10 × 42 | **≈ 420 km** (car; terrain via per-leg speeds) |
| `driveDayCount` | `ceil(totalKm / dailyKmBudget)` | per trip |
| `perDay` | `totalKm / driveDayCount` — minimize max daily wheel | fatigue-optimal |
| Split-arming threshold | `totalKm > dailyKmBudget` | replaces `trip.days.length > 1` |
| `ENDNO_day` | `min(60, perDay × 0.15)` | per-day exclusion zone |
| Hop/defer floor | < `MIN_PLANNED_DRIVE_KM` (90) of honest wheel left, or < 2 h | hop or defer |

**Evaluations of the formula** (the 700 km from the brainstorm demoted to one
of three): 300 km → 1 drive day, 7.1 h wheel, home ~19:00 — no overnight
proposed. 700 km → 2 × 350, 8.3 h wheel each. 1200 km → 3 × 400, 9.5 h each.
Ghat legs shrink automatically because the cap is in hours and leg speeds are
per-leg.

## 6. The engine changes (file-level)

| File | Change |
|---|---|
| `src/lib/ridePlan.ts` | rework `planRideSegments` to clock-first cadence (stretch by `STRETCH_CLOCK_MIN`, meals at windows, dinner/night-end as day terminators); new pure `planDriveDays(totalKm, opts)` → `{ driveDayCount, perDay, nightHalts[] }`; keep km as the route language, hours as the budget |
| `src/lib/geocode.ts` | `planJourneyHalts` arms the split from `planDriveDays` (route), passes `dayStartTimes` per *derived* day; overnight segments query lodging |
| `src/pages/trip/MapTab.tsx` | replace `multiDay: trip.days.length > 1` with the derived arming; **fraction fallback rows** (¼/½/¾ gap rows, "add a stop and suggestions pin themselves") when segments are empty but the corridor has POIs; night-halt accept flow; defer-proposal UI |
| `src/pages/trip/TimelineTab.tsx` | day chips on suggestion rows ("Day 2 · 70 km after your night stop"); derived day-type labels DRIVE / STAY / MIXED; **ripple re-plan** on every stop mutation (add/reject/commitment) so day attribution and the night-halt position stay honest |
| `src/pages/CreateTrip.tsx` | "Day out / Weekend dash" preset chip: forces `roundTrip`, pre-opens return stops, tunes the bench bill (meal cost instead of stay + parking/entry-fee lines) |
| `src/lib/planBench.ts` | day-out bill template; structural-night formula line |
| bill / `PrintExport` | "+1 night: the drive needs a stay" formula line when a structural overnight is accepted |
| `src/pages/trip/MapTab.tsx` (arc) | destination-anchored **Day-out arc** (lunch near the sight, what's open after, "your return starts 17:40 — sunset point 12 min off-route"); return-leg suggestions via `asymmetricDetourKm`; home-zone flip (`HOME_ZONE_KM`) for the outbound morning |

## 7. Phase P1-A — `ridePlan` clock rework + `planDriveDays` (pure, tests first)

- Introduce the named constants from §5 (with derivation comments).
- `planDriveDays(totalKm, { mode, terrainSpeeds, wheelCap })` — pure;
  returns drive days + night-halt km positions.
- Rework `planRideSegments` to the clock model: stretch cadence by wheel
  minutes; meals at windows (breakfast fires only for early starts); day
  terminators = dinner end or `WHEEL_HOURS_CAP`; per-day exclusion via
  `ENDNO_day`; merges by clock (`MIN_BREAK_GAP` twin).
- **Write the fixtures (§13) as failing tests first** — the 700 km @ 05:00
  narrative is the headline fixture.
- Out of scope: everything DOM.

## 8. Phase P1-B — arming + lodging (planner wiring)

- `planJourneyHalts` arms the split from `planDriveDays`; passes derived
  `dayStartTimes`; overnight segments query lodging (existing hotel query
  path).
- MapTab: derived arming replaces `trip.days.length > 1`; one-line + proposal
  UI ("this drive needs 2 travel days — apply?").

## 9. Phase P1-C — night-halt accept + defer + fraction rows (MapTab)

- Night-halt suggestions (top 3 lodging near the per-day km, ± `ENDNO_day`,
  projected clock ≤ 20:00 — pulled earlier when late). Accept → stay stop →
  bill line (P1-E rides on this).
- Defer proposal for late starts (< 2 h honest wheel): "start tomorrow 06:00".
- Fraction fallback rows for short trips (the strip never renders empty again
  below 210 km when the corridor has POIs).

## 10. Phase P1-D — next-day re-anchoring + day types (Timeline)

- Day chips on all suggestion rows ("Day 2 · after your night stop").
- Derived day-type labels DRIVE / STAY / MIXED; stay days get local-radius
  suggestions.
- Ripple re-plan on stop mutations — the night-halt km and day attribution
  recompute; late night halt → "move it to X?" warning.
- User override respected with an honest red fatigue verdict.

## 11. Phase P1-E — bill honesty + day-out preset (bench + CreateTrip)

- Structural-night formula line; day-out bill template (meal cost, parking,
  entry fees; no stay).
- CreateTrip "Day out / Weekend dash" chip (force `roundTrip`, pre-open return
  stops, prefill).

## 12. Phase P1-F — destination arc + return leg + home zone (suggestion surfaces)

- Day-out arc at the destination (open-after, lunch-near, return-drive picks
  via `asymmetricDetourKm`).
- Return-leg cadence ("on the way back you'll pass X — 4 min off-route, crew
  hungry ~14:00").
- Home-zone flip for the outbound morning.
- Repeat-visitor novelty via Trip DNA ("4th visit — new this time: X").

## 13. Phase P1-G — docs & gate

- `docs/ARCHITECTURE.md` planner section; `USER_GUIDE` "travel clock" explainer;
  `CHANGELOG` under `[Unreleased]`.
- Full `npm run verify`; the fixtures of §14 as the release gate.

## 14. Test fixtures (write first — these ARE the spec)

| Fixture | Expected |
|---|---|
| 700 km, car, 08:30 | 2 drive days × 350 km; night halts @ ~350 km; day-1: lunch 13:00, tea 17:00, halt at dinner 20:30; day-2 cadence resets |
| 700 km, car, 05:00 | same 2 × 350; breakfast window fires; night halt reached ~17:30; dinner at the halt |
| 700 km, car, 14:00 | ~190 km day 1 (dinner = night halt); remainder day 2 |
| 300 km, car, 08:30 | 1 drive day, no overnight proposed; home ~19:00 |
| 80 km, 3 h (ghat/traffic) | stretch fires by clock (120 min) despite < 90 km floor debate — the 2 h rule owns it; strip renders |
| 1200 km | 3 × 400 (load-balanced, never 585+115+95) |
| 22:00 start | defer proposal, no plan produced |
| 18:00 start | short hop ~190 km or defer |
| rain 60% day 1 | wheel cap ×0.85 → split shifts |
| packed style | cap 11 h; relaxed 8.5 h; crew ≥ 5 per `cadenceForCrew` |
| detour accepted day 1 (+45 min) | ripple: night halt re-derives; day attribution stays honest |
| user insists 1 day / 700 km | red fatigue verdict, plan respected |
| structural halt accepted | bill gains "+1 night" formula line; not charged to detour budget |

## 15. Release map

| PR | Content | Depends on |
|---|---|---|
| P1-A | clock rework + `planDriveDays` + fixtures | — |
| P1-B | derived arming + lodging query | P1-A |
| P1-C | night-halt accept + defer + fraction rows | P1-B |
| P1-D | day chips + day types + ripple | P1-B |
| P1-E | bill lines + day-out preset | P1-C |
| P1-F | destination arc + return leg + home zone | P1-D |
| P1-G | docs + gate | all |

P1-A + P1-C alone make the original feedback disappear (suggestions render
from ~60 km up; splits propose themselves above 420 km). P1-D/P1-F are what
make short trips feel *equally helpful* rather than merely tolerated.

## 16. Open questions (answer before the phase that needs them)

1. **Lodging category coverage** — do the current provider queries return
   usable stay results at corridor km positions for all modes? (P1-B)
   **ANSWERED:** yes — the purpose-specific corridor scan already runs hotel
   text searches for overnight segments (`hotel` fits `overnight` at 3), so
   P1-B arms the split without a new query path.
2. **`NIGHT_END` as a setting** — constants for v1; expose when settings gain a
   "travel clock" group. (P1-C) **ANSWERED:** constants for v1 (`NIGHT_END_MIN`),
   deferred to a settings group.
3. **Defer-proposal default** — suggest always, or only when night driving is
   actually unsafe (rain)? Default: always, honest copy. (P1-C)
   **ANSWERED:** always — the banner states the honest reason, one tap applies
   the 06:00 start.
4. **Day-out preset + bench template** — one chip or two (Day out vs Weekend
   dash differ in return-leg pricing)? (P1-E) **ANSWERED:** two chips, one
   code path — `applyDayOutShape(days)` presets dates + round trip (1 or 2
   days); the bill's no-stay honesty falls out automatically (no hotel stops →
   no lodging line).

## 17. Session log (append here as you work)

- 2026-09-12 — brainstormed and consolidated (three sessions); this plan
  written on `docs/day-planner-plan`. No engine code touched.
- 2026-09-12 — P1-A: `planDriveDays` (pure, load-balanced, rain/style-tuned)
  + the stretch clock twin in `planRideSegments` (day boundaries from the
  duration cap, never the 550 km tick).
- 2026-09-13 — P1-B..P1-G in one pass:
  - **Engine:** `planTravelClock` — fixed meal anchors (breakfast fires only
    for pre-08:00 starts), night halt at the first of km budget / dinner /
    wheel cap, defer (< 2 h honest wheel) and hop (< 6 h waking span) verdicts,
    late-start day-1 shrink with honest re-balancing of the remainder (count
    grows when a shrunk first day would overload the rest).
  - **Short-trip silence fix:** the 90 km floor yields to the 120-min clock
    rule, and the destination exclusion zone scales with journey length
    (`min(60 km, 15%)`) — 80 km of ghat crawl now earns its stretch.
  - **P1-B/C wiring:** MapTab arms the split from `planDriveDays` (+ hop),
    proposes "this drive needs N travel days — apply?" (decline respected with
    the red fatigue verdict), defer/hop banners, and ¼/½/¾ fraction fallback
    rows so the strip never reads empty below the fatigue floor.
  - **P1-D:** "Day N · after your night stop" chips on suggestion rows;
    DRIVE/STAY/MIXED day-type labels derived from the journey on every day
    header (the ripple re-plan was already real — the strip recomputes from
    trip state on every mutation).
  - **P1-E:** the bill prices the bed — hotel stops gain a lodging line
    (bases × rooms × style rate, per-base share on its day, formula stated on
    the Budget tab); CreateTrip gains "Day out" / "Weekend dash" shape presets.
  - **P1-F (scoped):** return-leg chips on round trips ("you pass here on the
    drive back"). The full destination Day-out arc (open-after reasoning,
    lunch-near-the-sight bundles) stays open — it needs the hours-joined
    destination scan and is the first candidate for a follow-up PR. The
    home-zone flip (near-home picks valid again on the return leg) rides with
    it.
  - **P1-G:** ARCHITECTURE §8 planner paragraph, USER_GUIDE §4 travel-clock
    explainer, CHANGELOG [Unreleased], fixtures in `tests/dayPlanner.test.ts`
    (16 tests — the §14 spec).
  - **Honest deltas from §14's expected values:** the brainstorm's clock times
    assumed full-cap days (420 km @ 42 km/h); the load-balanced split gives
    350 km/day, so the 08:30 day honestly ends ~17:55 (dinner at the halt)
    rather than "halt at dinner 20:30", and the 05:00 day halts ~14:50 with
    more rest — an early start buys slack, never km. The 14:00 fixture's
    "remainder day 2" is honestly 3 days at blended 42 (a 461 km remainder
    would break the cap it must respect); the fixture asserts the dinner halt
    + cap-respecting remainder instead of the literal day count.
