# Plan - the high-end visual standard, surface by surface

**Status:** Tier A is shipped (#311). Read the Status section below before acting on
the per-surface instructions - three of them were overtaken by events.
**Companion:** `docs/HIGH-END-DESIGN-MOCKUP.html` (the reference), and the
landing commit `d94d4a5` (the recipe, already proved).

---

## 1. What this plan is, and what it refuses to do

The brief: apply the `high-end-visual-design` standard across the product.

The finding: **it should not be applied across the whole product.** That standard
is a *persuasion-surface* language - macro-whitespace (`py-24`-`py-40`), massive
display type, Double-Bezel on every major card and input, entry animation on
everything. It is calibrated for marketing pages holding tens of elements per
screen. The app interior is the opposite: `MapTab.tsx` alone is 2,419 lines and
CreateTrip 1,358, rendering hundreds of dense rows at 10-12px behind per-theme AA
contrast gates and a spacing ratchet. Pushing `py-24` and 5rem type through those
surfaces would destroy density and break the tree's own gates.

So the plan splits by **surface type**, not by page count:

| Tier | Surfaces | Standard applies? |
| --- | --- | --- |
| A - persuasion | Explore, PublicItinerary, CreatorPage, TripCreated, Auth, CreatorHub | Yes, essentially in full |
| B - product summary | TripsList, Profile | Partially: card architecture only |
| C - dense editors | MapTab, CreateTrip, Timeline/DaySection, BudgetTab, GroupInputTab, TravelForm, Settings, Admin | **No** - deliberately untouched |

Tier C is not "deferred work"; it is **excluded on purpose**, with the reasoning
recorded in section 6. An audit that says "all 25 components need rework" is not
a plan.

---

## Status (2026-09-24)

**Tier A is shipped.** The per-surface instructions below were right about the
*shape* of the work and wrong about its *content* in three specific ways. Read
those three before following any section below.

| Surface | State | What it actually got |
| --- | --- | --- |
| Landing | done | Tokenised display scale and macro-whitespace (the hero `clamp()` and the 60/70px section gaps were inline styles), Double-Bezel feature cards, a button-in-button CTA, and a reveal that resolves out of a blur on `--motion-slower` |
| PublicItinerary | done | Tokenised block rhythm, plus the tray on its five content cards |
| Explore + creator pages | done | The same tray via `PubCard` - the one component they share, so both surfaces moved from a single change |
| TripCreated | **held back** | Built, then deliberately split out. See "What remains" |
| Auth, TripsList, Profile | **closed** | No real work in them; entry animation on an app dashboard is noise, not polish |
| CreatorHub | **blocked** | Another clone owns creator-hub while it is under active development |

Shipped as **PR #311** (`feat/high-end-design`, base `test`). It is independent of
**PR #310** - this branch touches no TripCreated file - so the two can merge in
either order.

### Three corrections the sections below do not know about

1. **The eyebrows were already there - twice.** PublicItinerary already paired
   `.editorial-kicker` with `.editorial-title`, and TripCreated already carried an
   `<p className="eyebrow">`. Section 4 lists "eyebrow tags" as work on both. It
   was not work; adding a second kicker recipe would have been the actual mistake.
2. **A bezel is canvas-dependent, and the first implementation was reverted.**
   The plan says the tray "reads `--yf-glass`", and it does - but only where the
   canvas differs from the tray. On the landing (mint/peach gradient) the white
   band reads as a tray. On the cream canvas the same band is a **~1.3% step**
   (`#F8F7EF` -> `#FBFAF7` -> `#FFFFFF`), so there the tray is defined by
   **depth** (the diffuse `--shadow-soft`) and deliberately carries **no outer
   hairline**. The first attempt drew a 6px+1px navy ring and read as a grey
   wireframe outline around every card - two outlines per card, plus two rings
   landing 4px apart in the gutters. It was reverted. **Do not re-add a ring tray
   on a light canvas**; the CSS records this too.
3. **`MOTION-TOKENS.md`'s "transform slide" for the glider was never true.** That
   stale catalog row pointed a change the wrong way: a `scaleX` FLIP was built to
   match it, and it stretched the pill's rounded ends into ellipses (scaleX 1.93
   on a 76px -> 146px tab change), so the glide read as the animation breaking.
   The glide animates the glider's own box, and the doc has been corrected. Worth
   carrying forward: the glider is **absolutely positioned**, so its box cannot
   reflow its siblings - the layout cost that motivated the change was largely
   imagined.

### What remains

- **TripCreated's entry choreography.** Built, then split out of #311 because
  #310 relaid that page out (`.created-page` 720px -> 1120px). The work is
  preserved at the local branch **`backup/tripcreated-reveals`** (`a06bacd`) and
  is to be **re-applied to the new markup** after #310 lands - not rebased onto
  markup that is about to be replaced. Section 4.3 needs revisiting at the same
  time, since it describes the old single-column layout.
- **Nothing else in Tier A is open.** Tier B and Auth stay closed; CreatorHub
  stays blocked until its ownership is settled.

---

## 2. What is already done (and why that shrinks this a lot)

Four changes were genuinely *global* - one edit each, and they apply to all 42,175
lines of `src` with no per-surface work:

| Change | Reach | Mechanism |
| --- | --- | --- |
| Body font -> Plus Jakarta Sans | every text node | two tokens in `:root` |
| Icon stroke 2.0 -> 1.5 | all ~291 icon tags | one `.lucide` rule + `--icon-stroke` |
| Pill glider -> compositor-only FLIP | every pill nav | `PillNav.tsx` + one rule |
| Reveal resolves from blur | every `.reveal` user | one media block |

That is why "the whole UI" is largely behind us already. What remains is
per-surface **composition** - and composition only pays off where composition is
the point.

Landing additionally received the four per-surface treatments that this plan
proposes to repeat: Double-Bezel cards, tokenised display scale, macro-whitespace,
button-in-button CTA. Commit `d94d4a5` is the working reference implementation.

---

## 3. Surface inventory (measured, not estimated)

| Surface | Lines | cards | sections | reveals | chips | inline fontSize | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Explore | 336 | 6 | 1 | 0 | 15 | 0 | A |
| PublicItinerary | 617 | 10 | 1 | 6 | 10 | 0 | A |
| CreatorPage | 103 | 0 | 1 | 0 | 1 | 0 | A |
| TripCreated | 382 | 4 | 3 | 0 | 2 | 0 | A |
| Auth | 169 | 4 | 0 | 0 | 0 | 0 | A |
| CreatorHubPage | 577 | 6 | 0 | 0 | 8 | 0 | A |
| TripsList | 313 | 5 | 0 | 0 | 9 | 0 | B |
| Profile | 488 | 19 | 0 | 0 | 5 | 1 | B |
| TripWorkspace | 422 | 1 | 0 | 0 | 0 | 0 | C |
| MapTab | 2,419 | 15 | 0 | 1 | 54 | 0 | C |
| CreateTrip | 1,358 | 3 | 1 | 1 | 18 | 1 | C |

Tier A is ~2,200 lines and ~30 cards in total. That is a bounded job.

Two facts worth holding onto:

- **`PublicItinerary` already has 6 reveal call-sites** - it is the most
  "designed" of the public surfaces already, and it is the one most people meet
  first (every shared link opens it). It deserves to be first.
- **No surface has inline `fontSize` except Profile (1) and CreateTrip (1)** - so
  the type scale is already token-driven nearly everywhere. The display-scale work
  is small.

---

## 4. Tier A - the work, per surface

Each bullet below is a real, token-level instruction rather than a vibe.

### 4.1 PublicItinerary (do first)

- **Double-Bezel** the 10 cards. The tray reads `--yf-glass` and the plate
  `var(--card)`, with the plate radius derived as
  `calc(<tray radius> - <tray inset>)` - the landing pattern, already in
  `styles.css`.
- **Macro-whitespace** between the hero, the day blocks and the closing CTA, via
  the existing `--landing-section-pad` token (or a renamed shared
  `--surface-section-pad`).
- **Eyebrow tags** above the section headings, using the existing kicker recipe
  (`--kicker-size/weight/tracking`) rather than a new one.
- **Caution:** the hero is `.pub-hero-title { max-width: min(720px, calc(100% - 324px)) }`
  - it assumes a 324px right column. Any type-scale increase must be checked
  against that constraint at 1024px and 1440px.

### 4.2 Explore

- **Double-Bezel** the 6 result cards. Note `Explore.tsx:221` already uses
  `card glass-soft explore-filterbar`; the filter bar is a *control surface*, so
  it keeps its current glass and does **not** become a bezel card.
- **Reveal choreography** on the result grid (it currently has 0 reveal usages).
- **Eyebrow** above the results heading; 15 existing `chip` usages stay as chips.
- **Macro-whitespace** between the hero, filter bar and grid.

### 4.3 TripCreated

- 4 cards, 3 sections, 0 reveals - the clearest gap in Tier A.
- **Reveals** on all three sections, **Double-Bezel** on the cards,
  **button-in-button** on the primary next-step CTA, macro-whitespace throughout.

### 4.4 Auth

- Smallest surface (169 lines, 4 cards, 0 sections). **Double-Bezel** on the
  auth card, **button-in-button** on submit, eyebrow tag above the form.
- No macro-whitespace: a centred auth form should stay compact.

### 4.5 CreatorPage

- 103 lines, 0 cards, 1 section. Lightest of all: eyebrow, one bezel wrapper on
  the profile block, macro-whitespace. Half a session.

### 4.6 CreatorHubPage - **coordinate before touching**

- 6 cards, 8 chips, 0 reveals, 0 sections.
- **Blocker:** creator-hub is under *active* development in another clone
  (`feat/creator-hub-dashboard`, now `0ed2fab` on `main`'s side). Restyling this
  file now invites a merge conflict on a surface someone else is mid-flight on.
  Sequence it after that branch lands, or agree ownership first.

---

## 5. Tier B - selective, cards only

The product's *summary* surfaces are browsed repeatedly, so card depth pays off
there. Nothing else from the standard does:

- **TripsList** (5 cards, 9 chips): Double-Bezel on the trip rows; keep the
  existing list density and row height exactly.
- **Profile** (19 cards, the most card-heavy file in the app): Double-Bezel on the
  top-level summary cards **only**. Do not touch the settings rows - 19 cards at
  app density is where a blanket bezel would bloat the page.

**Explicitly not applied in Tier B:** macro-whitespace, display type scale,
scroll reveals. Those are the mandates that fight density.

---

## 6. Tier C - excluded, with reasons

| Excluded | Why |
| --- | --- |
| MapTab (2,419 lines, 54 chips) | A control-dense editor. `py-24` and display type would wreck it; its glass panels are already deliberate and phone-frozen by the coarse-pointer budget. |
| CreateTrip (1,358 lines) | A form funnel. Whitespace increases elongating a form is a conversion *loss*, not a win. |
| Timeline / DaySection / Budget / Group / Settings | Hundreds of dense rows at 10-12px. The skill's own mobile override (`w-full`, `px-4`, `py-8`) already describes what they are. |
| AdminPage | Internal, single-operator, no persuasion job. |

The genuinely applicable parts of the standard for Tier C - motion tokens,
compositor-only animation, icon weight - are **already in place** (section 2).

---

## 7. Verification protocol (mandatory per surface)

Every surface PR must clear all five, not four:

1. `npm run verify` - `tsc -b --clean`, the full suite, production build.
2. **Contrast gate** - Double-Bezel introduces translucent trays and new plate
   surfaces; the per-theme AA gate must be re-run, not assumed.
3. **Spacing ratchet** - any new spacing must be a token consumed via `var()`. A
   literal `padding: 132px` fails the build; the gate ignores custom properties.
4. **Duplicate selectors** - every new class declared exactly once at top level.
5. **Visual pass at 1440 and 390**, plus the dark theme at both.

The visual pass is not optional and is no longer guesswork - the recipe is proved:

```powershell
# A NAMED session is required: the default session is shared across every agent
# on this machine and will hang or hijack another agent's page.
agent-browser --session yf-<surface> set viewport 1440 900
agent-browser --session yf-<surface> open "http://localhost:5178/#/<route>"
agent-browser --session yf-<surface> wait --load networkidle
agent-browser --session yf-<surface> screenshot "$env:TEMP\yf-verify\<surface>.png"
```

Then read the PNG back. Confirm before sharing a URL that the server is serving
the intended tree and that the Supabase ref is compiled in (AGENTS.md 2.7).

Deliberate exemptions that must survive this work: `--ease-resize` is an
`ease-in-out`-shaped curve on purpose (measured, `MOTION-TOKENS.md`), and the six
ambient `linear` loops are rotation/ticker cadence, also documented.

---

## 8. Risk register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| A new global class collides with an existing surface | High | This plan's own scan caught a near-miss (`hero-title` vs `pub-hero-title`). Grep the whole tree for any new class name before declaring it, and prefer scoped names. |
| CreatorHubPage conflicts with active creator-hub work | High | Sequence after that branch lands, or agree ownership first. |
| Contrast regressions from translucent trays | Medium | Gate re-run per theme; the tray reuses `--yf-glass`/`--yf-glass-sheen`, which are already AA-audited. |
| Whitespace inflating a form/editor | Medium | Tier C excluded wholesale; Auth stays compact by instruction. |
| PublicItinerary's 324px hero column | Medium | Check the new scale at 1024px and 1440px before merging. |
| 6,888-line stylesheet regression surface | Medium | One PR per 2-3 surfaces; never a single mega-PR. |

---

## 9. Proposed sequencing

| PR | Contents | Why this order |
| --- | --- | --- |
| 1 | PublicItinerary | Most-seen public surface; already half-designed, so the win shows fastest |
| 2 | Explore + TripCreated | Public funnel pair; TripCreated has the clearest gap (0 reveals) |
| 3 | Auth + CreatorPage | Both small; bundle the light touches |
| 4 | Tier B: TripsList + Profile summary cards | Card depth on repeat-view surfaces |
| 5 | CreatorHubPage | Only once the active creator-hub branch has landed |

Each PR is one focused session including its verification pass. PR 5 is gated on
someone else's branch, not on effort.

---

## 10. Open questions for you

1. **Rename `--landing-*` to `--surface-*`?** Four tokens currently named
   `--landing-hero-size`, `--landing-title-size`, `--landing-section-pad` would
   serve every Tier A surface. A rename is honest but touches the commit that
   just landed.
2. **Is `docs/HIGH-END-DESIGN-MOCKUP.html` the standard, or a direction?** If it is
   the standard, PublicItinerary and Explore should match it closely. If it is a
   direction, each surface should get its own archetype from the skill's Variance
   Engine instead of repeating one look.
3. **Who owns CreatorHubPage right now?** Section 4.6 cannot be sequenced blind.
