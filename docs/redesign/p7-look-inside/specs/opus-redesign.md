# Look Inside: a storefront for every itinerary

Author: Opus advisor (claude-opus-5-5). Date: 2026-10-15. Read-only on the repo.
Files in this folder:

- `opus-redesign.md`: this write-up.
- `build-sketch.mjs`: it renders the proposed head and Contents for all 14 priced fixtures.
- `contents-sheet.html`: the output. Open it in a browser.
- `shot.cjs` and `shot-*.png`: screenshots at 1280 and 390 (Coorg loop, 30-day rail, flight, Jaipur 2-day).

The sketch times are approximate. The real page must use the engine (`simulateDay`).

---

## 0. Verdict

**Replace the Ticket.** The Ticket and round 3 draw the trip's geometry. A buyer does not pay for geometry.
A buyer pays for confidence that the plan is good, that it fits, and that a real person stands behind it.

The new concept is **Look Inside**. It sells an itinerary the way people already buy information
products sight unseen: a cover, a blurb, the author, a table of contents, a free sample chapter, and a price.
Every trip has these parts, so one system serves every trip shape.

The page has two audiences. The buyer must decide to pay. The creator must feel proud to share the link.

---

## 1. The four questions

**(1) What would a top conversion designer do that nobody asked for?**

- They would treat the free day as the main sales asset. Today it is the weakest day by default.
  `ShareTab.tsx:142` defaults the free preview to `[0]`, which is day 1. Day 1 is usually the arrival day.
  Every one of the 14 fixtures uses `[0]`.
- They would sell the product, not a document. A YatraFlow plan is timed, costed and editable.
  A blog post is not. The page never shows this difference.
- They would design the creator side of the page. The creator needs a preview, a quality checklist and a reason to share.
- They would find the creator pitch that already exists. `subscriber_cta` is in the table.
  `publishRules.ts:103` requires it for every priced plan. The page shows it as a small hint under the sidebar button (`PublicItinerary.tsx:793`).
- They would check what the creator reads at publish time. `ShareTab.tsx:634` still says
  "no real payments in this MVP". A creator who reads that will not trust the rail.

**(2) What raw material would they start from?**

- The buyer's doubts, in the buyer's words. Do not start from the data model or from one trip.
- The full 14-trip fixture corpus and the three live rows, read field by field. The Ticket started from Spiti.
- The real wire response of `get_public_trip`. It decides what the page can legally show.
- The publish form, because it decides what data the page will ever get.
- Real storefronts that sell info products: Kindle "Look inside", Udemy course pages, Gumroad and Etsy itinerary listings, and Thatch (a creator itinerary marketplace). I have not checked these pages in this session. Treat this as a teardown to run, not as findings.

**(3) Which methods and tools?**

- A buyer-doubt map: one doubt per row, one page element per doubt, and the data field behind it.
- A swap test: put trip A's title on trip B's page. If the page still fits, the page does not carry the trip.
- A contact sheet: render every fixture at the first screen. Every shape must look intentional.
- Five-second tests, first-click tests and a price-sensitivity survey with real Indian travellers on phones.
- A funnel with intent events (tap "Read free", tap "Unlock"), because 79 views cannot measure payments.
- A creator interview: "Would you post this link on your Instagram?"

**(4) What, other than the user or me, would show it is right?**

- Strangers who can say what the page sells, what they get and what it costs after 5 seconds.
- Creators who choose to share the link. Share-ref traffic is already logged (`registerPubView`).
- The funnel: the rate of "Read free" taps and "Unlock" taps per view, then paid unlocks.
- A test that fails when a locked stop title reaches the wire.
- The contact sheet: no fixture looks broken, empty or Spiti-shaped.

**The rewritten task.** Design one storefront system for every published itinerary. It must answer the
buyer's five doubts above the fold on a phone. It must use the free day as the proof of quality. It must show
the contents of locked days without their places. It must give the creator a page they are proud to share.
Prove it on all 14 fixtures and with strangers, not on Spiti alone.

---

## 2. Diagnosis

### What a stranger needs before they pay

| Doubt | What answers it | Data |
| --- | --- | --- |
| Is this my kind of trip? | Days, how you travel, season, budget, pace | `duration_days`, `transport_mode`, flights, `best_season`, `estimated_budget_per_person_inr`, `travel_style` |
| Is it good, better than a free blog? | One full free day, shown as the timed plan it is | free days' stops, times, fees, notes |
| What exactly do I get? | A contents list of every day, plus counts | day titles, per-day counts, trip counts |
| Who made it? Can I trust them? | The creator, their pitch, their other plans, "updated" date | profile, `subscriber_cta`, `refreshed_at` |
| Is it worth the money? | The price beside the trip budget, one payment, what happens after | `premium_price_inr`, budget |

### Current live page

- Good: a real hero photo, the creator line, the paywall honesty states (#359, #588).
- Weak: the price sits in a sidebar card. Six identical saffron buttons appear on long trips.
  The free days look the same as locked days until you scroll. The route snapshot draws a gradient line.
- Leak: locked stop titles sit in the DOM under a blur (`PublicItinerary.tsx:702-706`).

### The Ticket

- Good: a rule table for the headline number, conditional bands that never show as empty boxes,
  saffron only for paid, and an acceptance list.
- Fails: six bands of encoded data before the buyer knows what the product is. A 5-second viewer sees a chart, not a plan.
- Fails: the trace is the part the user rejected. It is empty for a one-base trip and noise for 30 days.
- Fails: the headline number flatters road trips. A Goa city break gets "2 days" as its monument.
- Breaks R14: its no-cover plate sets the route in Playfair.

### Round 3 (my honest review of the image mockups)

- Keep: price and Unlock in the first screen. The facts row. The mix moved into the left column.
  Only real data in the left column. The "Inside days 5 to 8" count line. The Unlocked state.
- Fails: the journey line is still the route trace, flattened into a metro map.
- Fails: one dot per stop on a day strip repeats the line and shows nothing new.
- Fails: the number plate on the photo is the Ridge idea again in a new font.
- Fails: the free day is not used as the proof. It is one more band.
- Open: locked day titles name the places. I decide this in section 5.

### v3 prototype

- Each day has its own photo. The platform has no photo per day or per stop. The real page cannot do this.
- The stage photo, the 1,045 km figure and the pin cost about a third of the phone screen and carry one trip's story.

### Does it sell the creator?

None of the versions does. The creator gets one line. A creator feels proud when the page:

- puts their name and their pitch near the price, in their own words;
- shows their best day in full, as a sample of their craft;
- shows their other plans and their links;
- looks as good on a sparse trip as on a dense one.

The platform does not give the creator these things today:

- A "see it as a buyer" preview before publishing.
- Advice on which day to give free. The default is the weakest day.
- A quality checklist with real counts (timed stops, fees, hours, notes).
- A visible pitch slot. The pitch exists but hides in a hint.
- Correct copy on the publish tab (the "no real payments" line).

---

## 3. The concept: Look Inside

### One system or many page types?

**One system.** "All trips cannot use the same concept" is right about the earlier concepts. Each one encoded
one trip's best feature: altitude, then road distance. The answer is not five templates. It is a concept built
only on what every trip has: days, time, places at city level, a creator and a price. Shape changes the words
and the evidence inside the modules. It does not change the page. Five templates would cost five designs and
five test sets, and Explore would sell five different-looking products.

### The centrepiece: the Contents

One row per day. Each row shows:

- the day number;
- the creator's day title;
- one quiet line: stop count, km and time on the road for free days, or category counts for locked days;
- a **day rhythm bar** from 06:00 to 23:00: teal blocks for visits, a dark line for travel, a dark block for a flight;
- "Read free" on free days, "In the full plan" with a saffron edge on locked days.

Why this replaces the route trace:

- It shows the product's real difference: every day is timed. A blog cannot show this.
- It works for every shape. A city break has short travel and dense visits. A rail trip has long dark lines.
  A flight day has a dark block. A sparse trip has one block. Thirty days become a calm texture.
- A locked day shows its rhythm shape and its counts, and no place.
- It needs no photo and no map.

See `contents-sheet.html` for all 14 trips.

### First screen, desktop (1440)

```
+------------------------------------------------------------------------------+
| YatraFlow                                 Explore   My trips      [Log in]   |
| <- Explore                                                                   |
| +------------------------------+   Spiti Valley Circuit         (h1, serif) |
| |                              |   Shimla in, Manali out                     |
| |   cover photo, 4:5           |   tagline, one or two lines                 |
| |   no lines, no numbers       |   (H) Planned by Has9 . 2 plans . updated   |
| |   on the photo               |       12 days ago                           |
| |                              |   -----------------------------------------  |
| |                              |   10 days | By road, about 1,045 km |       |
| +------------------------------+   Jun-Sep | about Rs 15,000 a person      |
| Shimla -> Chitkul -> Kalpa ->      -----------------------------------------  |
| Tabo -> Kaza -> Manali             Rs 499  one payment     [Unlock all 10   |
| (route chain, text only)                                     days] saffron  |
|                                    "My exact homestay contacts..." - Has9   |
|                                    Read days 1-4, 9, 10 free first  (link)  |
+------------------------------------------------------------------------------+
| What is inside                                                               |
| 22 stops over 10 days. 22 have visit times, ...                              |
| 1  Shimla to Sarahan            [==##=#=========]            Read free       |
| 2  ...                                                                       |
```

### First screen, phone (390)

```
+-------------------------------+
| YatraFlow             [Log in]|
| +---------------------------+ |
| | cover photo, 16:10        | |
| +---------------------------+ |
| Spiti Valley Circuit          |
| Shimla in, Manali out  (32px) |
| (H) Has9 . updated 12 days ago|
| 10 days . by road . Rs 15,000 |
| Days 1-4, 9, 10 free  ->      |
| What is inside                |
| 1 Shimla to Sarahan  [==#=#=] |
+-------------------------------+
| Rs 499 [Unlock all 10 days]   |  <- sticky bar, 64px
+-------------------------------+
```

On the phone the price and the Unlock button live in a sticky bottom bar from the first paint.
The bar must hold real text only: no empty square, no clipped text.

### Section order

1. **Head.** Cover, title, tagline, creator line, fit facts, buy box with the creator pitch.
2. **What is inside.** The Contents, then one line of trip counts, then "you get an editable copy in your trips".
3. **Read a day free.** The free day or days in full, in the app's timeline style: times, travel legs, visit
   minutes, fees, hours, notes. One plain line above it: "This is how every day in the plan is written."
4. **The locked days.** One sealed block per run of locked days, not one per day. Each day: title, rhythm,
   category counts, km and road time. Stops appear as fixed-width placeholder bars. One Unlock button per block.
5. **Before you go.** Tips, warnings and assumptions, best season.
6. **What it costs.** The plan price, one payment. The trip estimate per person, marked as the creator's estimate.
7. **The creator.** Avatar, name, bio, links, other plans as Explore cards.
8. **Take this trip.** The buy box again, plus three steps: pay, the days open here, fork to edit dates and people.
9. **Share.** Copy link and WhatsApp as 44px buttons. A compact footer.

Keep the left-column content the user liked (tips, assumptions, Day 1 stops). It moves into sections 3 and 5.

### Every element and its source

| Element | Source | Rule |
| --- | --- | --- |
| Cover | `cover_image_url` | No overlay text, no lines. Missing: flat ink plate with the route chain in Plus Jakarta 800. |
| Title | `title` | Playfair, the only serif on the page (R14). Never truncate. Wrap to 3 lines; above 60 characters use the smaller display step. |
| Tagline | `tagline` | Hide when null. |
| Creator line | profile, `refreshed_at ?? published_at`, creator's plan count | "Updated N days ago". Show plan count at 2 or more. |
| How you travel | `transport_mode`, flights, stop spread, engine km | See the shape table below. |
| Season, budget, pace | `best_season`, budget, `travel_style` | Each hides when empty or 0. Season shows its first clause on the phone. |
| Buy box | `premium_price_inr`, `subscriber_cta`, free days | Pitch in quotes with the creator's name. |
| Contents rows | days, day titles, engine schedule | Untitled day: "Day N". Empty day: "No stops planned". |
| Trip counts | stops with `visitMinutes`, fees, hours, notes | Show a count only when it is above 0. |
| Route chain | `route_summary` | Merge repeats. More than 6 places: first 3, "+N more", last 2. |

### How it adapts to each shape

| Shape | How-you-travel line | What changes |
| --- | --- | --- |
| Road loop (Coorg) | "By road, about 627 km", chain ends "back to Bangalore" | Nothing else. |
| Point to point (Mewar) | "By road, about N km" | Chain has no return. |
| One base (Jaipur 2-day, Goa) | "One base: Jaipur, every stop within 25 km" | Rhythm shows dense visits and short hops. |
| Rail 30-day | "By train, about N km" | Rows go compact (44px, no sub-line). Show the first 10 rows and "Show all 30 days". Locked runs fold into blocks. |
| Flight multi-city | "3 flights: DEL to BOM to GOI" | Flight blocks in the rhythm. Airports only, no flight numbers on locked days. |
| No cover | as the shape | Flat ink plate with the chain. Legacy rows only: publishing already requires a cover. |
| Very sparse (Purulia) | as the shape | Empty days say "No stops planned". The page does not invent filler. The creator checklist is the fix. |
| 120-character title | as the shape | Smaller display step, up to 4 lines, never cut. |

Do not trust `round_trip` alone. `long-30day` has `round_trip: true` and ends in Kolkata, 1,306 km from Delhi.
Say "back to X" only when the last stop is within 40 km of the start.

### The lock moment

- The buyer meets the price three times at most: the head, the locked block, the end. Today it can be six.
- Unlock copy: "Unlock all 10 days". Under it: "Rs 499, one payment, no subscription."
- When the budget is above 0, show it beside the price: "The trip itself costs about Rs 15,000 a person."
  Do not compute a percentage. Let the buyer compare.
- Keep every #359 and #588 state. No price while access is unknown. A failed read says so.

### The unlocked moment

- The buy box becomes "You own this plan" and the date. The main button becomes "Fork to my trips" in teal.
- Locked rows lose the saffron edge. Their rhythm bars turn teal. Their stop lists fill in.
- The existing `UnlockReveal` plays once. With reduced motion, the end state paints at once.

### Free plans (no price)

No saffron anywhere. The buy box says "Free plan" with "Fork to my trips". Every row says "Read".

### The creator's own view of the page

When the creator opens their page, a strip sits above the head: "This is what buyers see." It holds the funnel
glance that exists today, plus a checklist with real counts and one suggestion, such as
"Day 4 is your richest day. Consider giving it free instead of day 1."

### Keep and remove

| Keep | Remove |
| --- | --- |
| Photo first, clean | Route lines on the cover, in any form |
| Price and Unlock in the first screen | The km monument on the photo |
| Facts row (days, travel, season, budget, pace) | The day strip of stop dots |
| Category counts for locked days | Leg labels and dashed locked legs |
| One sealed block per locked run | One Unlock button per locked day |
| Unlocked state and `UnlockReveal` | Blurred real stop titles |
| Saffron for paid only, no gradients, 5 sizes, 44px taps | Per-day photos (no data exists) |
| v3 section order, adjusted as above | Playfair on the no-cover plate |

---

## 4. What works today and what needs new data

### (a) Works with today's data

- The whole head, the facts row, the route chain and the buy box.
- `subscriber_cta` as the creator pitch. It already exists and is required for priced plans.
- The Contents rows, the rhythm bars and all counts, while the client still receives locked stops.
- The free-day sample in full.
- The creator section, the end buy box, share, free and unlocked states.
- The creator's view strip with the funnel glance.

### (b) Needs new data or a product change

| Change | Smallest version | Risk |
| --- | --- | --- |
| Locked-day preview after #774 | The publish path writes `day_previews` (counts, km, road minutes, rhythm in 15-minute steps) to the publication row. The RPC stops sending locked stops. | Creator-written numbers can drift or be forged. A trigger checks the stop counts. Recompute on every refresh. |
| Smarter free-day default | The publish tab pre-selects the day with the most timed stops, and says why. | A creator may want day 1. It stays a suggestion. |
| "See it as a buyer" preview | A button in the publish tab that opens the page in buyer mode without counting a view. | A preview must not record a view or call write RPCs. |
| Quality checklist | Counts from the trip, shown in the publish tab and on the creator strip. No score. | A score invites gaming. Show counts only. |
| Fix the stale publish copy | Replace the "no real payments in this MVP" line. | None. |
| Intent events | Log "read free" and "unlock tap" in the existing funnel table. | The funnel test pins must widen. |
| "Last done this trip" | One optional month and year, shown as the creator's statement. | It is not verified. Label it as the creator's own words. |
| Better no-cover plate | Region art when the image plan lands. | Rare: publishing already requires a cover. |

None of these blocks the concept. The page reads the preview when it exists, and the stop rows until then.

---

## 5. Paywall decision for #774

Locked **day titles stay public**. They are the table of contents, and a contents list is the strongest selling
element an information product has. The share page already prints them (`api/_publicBody.js:73-75`), so they are
public and indexed today. The value a buyer pays for is the order, the timing, the stays, the costs and the
notes, not the names. The creator must own this choice, so the publish tab must show "Strangers see these
day titles" with an edit link. For each locked day the RPC must return the day `id`, `index` and `title` with
an **empty `stops` array**, and nothing else from the day. The per-day preview (stop count, counts by category,
total visit minutes, km, road minutes, counts of stops with hours, fees and notes, and the rhythm rounded to 15
minutes) comes from the publication row. It carries **no coordinates at all**. The new page draws no locked
geometry, so the coarse-grid question goes away. City-level places stay public through `route_summary` and
`destinations`. Two more items for the Gate: the newest definition is
`20261002_trash_purge_publication_guard.sql`, not `20260925` as the issue says (that file already withholds
`invite_code`, `expenses` and `fixed_commitments`). Also, `flights` legs on locked days carry `airline`,
`flightNumber` and `departAt`. Those are booking choices, so the RPC must keep only the two airports and the
day index for locked days. Ship in two SQL steps (§2.17), and pin a test that fails when a locked stop title,
a coordinate or a flight number appears in the anon response.

---

## 6. How to prove it is right

### Cheap checks on disk, now

1. Run `node build-sketch.mjs`, then `node shot.cjs`. Look at every card. Every shape must look intentional. Done for 4 cards at 1280 and 390 with 0 px overflow. Extend `shot.cjs` to all 42 files (free, nocover, priced).
2. The swap test: give each card another trip's title. If any card still reads true, that card is generic.
3. A rule test for the how-you-travel line across all 14 trips, with the expected text written by hand first.
4. A leak test: render a locked fixture and search the HTML for each locked stop title. The count must be 0.
5. A copy check: every sentence comes from a field or a fixed string. No number appears that the data does not hold.

### Tests with people

| Test | Who | Size | What you measure |
| --- | --- | --- | --- |
| 5-second test on the 390 first screen | Indian travellers new to YatraFlow, on phones | 15 to 20 per version | Can they say what it sells, what is free, what it costs? |
| First-click test | same | 15 to 20 | Where do they tap to judge quality? Target: "Read free" or the Contents. |
| Price check (Van Westendorp, 4 questions) | same | 30 or more | A rough fair-price band per trip length. |
| Creator interview | 5 to 8 creators or travel Instagrammers | 5 to 8 | "Would you post this link?" and what they would change. |
| Competitor teardown | one person, one afternoon | 5 storefronts | How each one shows the sample, the contents, the author, the price. |

### Live funnel

With 79 views in total, a payment test cannot reach an answer. Detecting 2% against 5% unlock needs about
600 priced views per version. Detecting 2% against 3% needs about 3,800. Use intent rates first: "Read free"
taps and "Unlock" taps per view. Those rates sit near 10% to 30%, so a few hundred views show a direction.
Report counts, not percentages, until each version has 200 views.

---

## 7. Decisions for the user

| Decision | My recommendation |
| --- | --- |
| Replace the Ticket with Look Inside? | Yes. Keep its rules and acceptance checks, drop its bands. |
| One system or page types by shape? | One system. Shape changes words, not layout. |
| Locked day titles public? | Yes, as the contents list. Add the "strangers see these" note to the publish tab. |
| Who computes the locked-day preview? | The publish path writes it to the publication row. A trigger checks the counts. |
| Change the free-day default from day 1? | Yes: pre-select the richest day, and say why. |
| Show the creator pitch next to the price? | Yes. It exists and is required. Give it a 140-character limit. |
| A map on the page? | Not in the first screen. A regional map of free-day stops later, lower down, is optional. Avoid an India outline map: boundary depiction is a legal risk in India. |
| Show views and forks? | Not until a trip has 25 forks. Small numbers hurt more than they help. |
| A refund line? | Decide the policy first. Refunds exist in the database (`revoke_refunded_entitlement`). If you will honour one, say it in the buy box. |
| Fix the "no real payments in this MVP" copy? | Yes, now. One line. |
