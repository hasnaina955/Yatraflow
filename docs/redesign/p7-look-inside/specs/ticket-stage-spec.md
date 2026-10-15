# The Ticket: a storefront stage for any trip (Opus 5.5 advisor, 2026-10-15)

Source: Opus architect report, saved verbatim in substance. Guesses are marked GUESS.

The public itinerary page is a storefront. A stranger on a phone decides in under a minute whether to pay. The design must work for any trip shape (road loop, city break, flights, rail, 30 days). The Spiti trip is one fixture. The earlier altitude "Ridge" concept was rejected because it only suits mountain trips.

## 1. Buyer doubts and the page element that answers each

| Doubt | Answered by |
| --- | --- |
| Will it work for me? | A facts row in the stage: days, how you travel, pace, budget per person, season |
| Is the creator credible? | A creator line with real signals: forks, published or updated date, other trips |
| What exactly do I get? | A contents line counted from the data: stops, visit times, opening hours, costs |
| Is it worth the price? | The price next to the trip budget, inside the stage |
| What is locked? | The day strip, with locked days outlined in saffron, at the fold |

v3 falls short: no transport, pace or season; price missing from the default fold; locked-day towns named on the map; the phone sticky bar has an empty navy square and clipped text.

## 2. Data model

Always present but possibly empty: title, route_summary, duration_days (at least 1), budget (0 = unknown), tips, warnings, free_day_indexes, views, copies, published_at.
Can be null: tagline, cover, travel_style, best_season, price (null or 0 = free), refreshed_at, round_trip, flights.
Per stop: lat, lng, category. Titles can be blank. Travel stops have visitMinutes 0. Days can be empty.
Worst trips: no cover, one day with one stop, 30 days, blank stop names, 120-character title, free days not next to each other, round trip, flight mode with no flights recorded, all stops within 10 km of one hotel.

## 3. The Ticket stage (the pick)

The stage reads like a printed travel pass, in bands. Each band comes from data that always exists. A band that needs richer data joins only when the data qualifies. It never shows as an empty box. Conditional bands collapse with no gap.

1. **Plate.** With a cover: the photo with a flat solid caption bar. Without a cover: a flat brand plate (ink or teal, tint from the trip id, never saffron) with the route_summary set in Playfair as a ticket line ("Kolkata → Purulia → Patratu Valley"), the headline number, and a faint outline trace if the trip qualifies. It must look deliberate, never a grey box.
2. **Headline number.** First rule that fits: road or rail trip of 150 km or more: "about X km"; flights: "N cities" by flight; all stops within 25 km of their middle: "N days from one base"; otherwise "N days".
3. **Trace.** Only with 3 or more distinct stop points spread over at least 5 km. Inline SVG, no base map. Straight legs between cities, flight legs dashed, loop closed if round_trip. Labels come from route_summary only.
4. **Day strip.** Always shown, one cell per day. Cell height shows stop count. A small mark at the base shows the leading category. Locked cells have a saffron outline and a lock. Empty days show a thin rule labelled "free time".
5. **Mix bar.** Only with 4 or more stops of at least 2 categories, not counting travel and hotel.
6. **Facts and price row.** Always shown.

## 4. Free preview and the lock

Show for locked days: day number and the creator's day title, stop count, km, road hours, category pips, and a count of what the day holds ("3 stops with visit times, 2 with opening hours").
Never show for locked days: stop names, locationName, exact coordinates, order, priority, notes, times, costs. Use fixed-width placeholder bars, not blurred real titles. On the trace, locked legs are dashed saffron with no labels, and their points are snapped to a coarse grid.

Unlock moment: one saffron button, "Unlock all 10 days · ₹500". Below it, a contents line ("4 more days, 9 stops with timings and costs, an editable copy in your trips."). Then "One payment." and the trip budget beside it ("Trip budget about ₹15,000 per person"), shown only when the budget is above 0. After paying, the existing UnlockReveal plays: saffron cells turn to ink, labels fade in, next step "Fork to my trips". A signed-out buyer signs in and returns to the same scroll point.

Trust signals use real data only: forks (GUESS: show at 5 or more), views (GUESS: show at 100 or more), "Updated N days ago", "N trips by this creator", the contents counts. When numbers are small, hide them.

Opus Gate decisions (paywall): stop returning locked stop rows from get_public_trip and return a server-built preview of per-day totals and snapped geometry; whether locked day titles stay public; the grid size; the share page and meta tags after the change.

## 5. Layout, states, rules

- Keep the v3 order: Stage, Why this route works, Day by day, Notes, What it costs, The person behind it, Take this trip.
- 1440: Ticket right and sticky; title, facts, price and CTAs left. 768: one column, Ticket first, at most 560px tall. 390: plate, number, strip. Trace and mix bar move into "Why this route works". Price and Unlock are in the first screen.
- States: free (no saffron anywhere, Fork is the main button), locked (saffron only on price, locked cells and locked legs), signed-out (as locked plus "Sign in to fork"), dark (flat plates on dark tokens), no cover (fallback plate), sparse (conditional bands collapse).
- Type at 390: 56, 32, 22, 17, 15px. No line over 60 characters. Titles cut at 3 lines. Strip cells at 390 fold into rows of 7; the strip is one 44px-tall link.
- House rules: no gradients, saffron means paid only, at most 5 font sizes, tap targets 44px or more, no horizontal overflow at 390, no eyebrow labels, motion only transform and opacity with a reduced-motion opt-out.

## 6. Fixtures (test set)

The 3 real trips and 3 synthetic ones in `corpus\fixtures\`, plus four more: Goa base (2 days, 8 stops within 12 km, round trip, no cover, ₹99, day 1 free); flight multi-city (Delhi, Jaipur, Udaipur, Mumbai, 6 days, 3 flights, cover, free); Jaipur no-geo (2 days, 10 stops at one coordinate, 120-character title, no tagline); 30-day rail (free days 1, 15, 30, ₹2,999, six empty days, one 12-stop day, Devanagari names).

## 7. Acceptance checks

1. No horizontal overflow at 390, 768 and 1440 for every fixture.
2. No clipped text.
3. No empty boxes.
4. At most 5 font sizes per width.
5. Every control at least 44x44px.
6. Saffron only in priced states.
7. No locked stop title, locationName or coordinate with more than 2 decimals in the page code or API response for locked days.
8. At 390, price and Unlock visible in the first screen for priced fixtures.
9. No gradients; only transform and opacity animate; reduced motion leaves zero transitions.
10. Headline number and band choice match the rule table for all fixtures, checked by a test.

## 8. Validation kit

5-second test (show the 390 fold, hide it, ask what it is, what you get, how much). First-click test (where do you tap to see what the paid days include?). Six comprehension questions (days, how you travel, which days are free, what you get for the price, who made it, can you edit it after buying). Price question ("Would you pay ₹500 for this? If not, what would you pay?"). It proves understanding, not purchase. Minimum 15 people per variant, on phones, Indian travellers new to YatraFlow. Launch metric: view-to-unlock rate from the funnel log behind a flag (event names not yet checked). A 2% versus 3% difference needs about 3,000 priced views per arm; today the three trips have 79 views in total.
