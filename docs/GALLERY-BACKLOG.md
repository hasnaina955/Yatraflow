# YatraFlow — Gallery Backlog (the first 20)

**Version:** 1.0 (2026-09-16) · **Pipeline:** `PLAYBOOK-GALLERY-RESEARCH.md` · **Contract:** `ITINERARY-IMPORT-SPEC.md`

The gallery's job at launch is not to be big. It is to be **the shelf a searcher
recognises**: the trips people already type into Google, priced honestly, in a
shape a human can actually live. This file is the ranked worklist for that shelf.

Two constraints shape every row, and they are not negotiable:

1. **Demand first.** A trip earns its place by being searched for, not by being
   interesting to author. Ranking below is demand-led.
2. **Engine-true.** Every entry must clear the two import gates. The engine's own
   realism rule rejects any day over ~5 h of drive (a HIGH that fails outright),
   so a "7 cities in 5 days" plan cannot ship — it gets reshaped into the version
   a person can survive. That reshaping is the product, not a compromise.

---

## 1. How the order was decided

**Demand evidence used (Sep 2026):**

- **Domestic volume** — Ministry of Tourism domestic-visitor rankings put UP, TN,
  Karnataka, AP, Rajasthan, MP, WB and Uttarakhand at the top; the leisure circuits
  inside those states (Kerala backwaters, Rajasthan forts, Coorg/Ooty from Bangalore)
  are the ones with the deepest repeat-search behaviour.
- **The named-itinerary set** — routes that exist as *a phrase people type* (the
  strongest demand signal there is): "Goa itinerary 4 days", "Kerala itinerary",
  "Rajasthan itinerary", "Leh Ladakh itinerary", "Meghalaya itinerary",
  "Spiti itinerary", "Kashmir itinerary", "Golden Triangle itinerary",
  "Ooty Coorg itinerary", "Rann of Kutch itinerary", "Hampi itinerary".
- **Fly-in premium set** — Ladakh, Kashmir, Andamans, Northeast draw the
  highest-intent (highest-budget) searchers, which is why three of the first five
  are fly-in trips.
- **Season reality** — a gallery that is honest in September (monsoon) about what
  is *actually* in season right now reads as curated; one that lists everything
  year-round reads as a directory.

**Ranking rules applied on top of demand:**

| Rule | Effect |
|---|---|
| Engine-fit (short daily legs, real overnight towns) | Promotes compact loops (Goa, Mewar, Meghalaya) over sprawl (Golden Triangle's 280 km closing leg) |
| Season honesty | Rann of Kutch and Spiti rank by their windows, not their volume |
| Filter spread (duration / budget / style / mode) | Ensures the first ten cards don't all read "5 days, ₹12k, relaxed" |
| Distinctness | One trip per archetype: beach, backwater, forts, mountains, northeast, desert, plateau |

**Days/season/mode are planning targets, not promises** — the gates decide the
final shape (see the Coorg note: a 3-day weekend became a 5-day loop).

---

## 2. The backlog — 20 trips, demand-ranked

Status: ✅ shipped · 🔜 next batch · ⏳ queued

| # | Trip | Route | Days | Mode | Season | Why it ranks here | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Goa, North to the Quiet South** | Panaji → Old Goa → Candolim → Anjuna → Colva → Palolem → Panaji | 5 | rental | Nov–Feb | The single highest-volume leisure search in Indian travel; compact enough to be engine-perfect | ✅ |
| 2 | **Kerala Hills & Backwaters** | Kochi → Munnar → Thekkady → Alappuzha → Kumarakom → Kochi | 6 | taxi | Sep–Mar | The honeymoon/family circuit with the deepest year-round demand; every leg inside the 5 h rule | ✅ |
| 3 | **Mewar Forts & the Blue City** | Udaipur → Nathdwara → Kumbhalgarh → Ranakpur → Jodhpur | 5 | taxi | Oct–Mar | "Rajasthan itinerary" demand, in its most compact and least-convoy-shaped form (one-way, ends in Jodhpur) | ✅ |
| 4 | **Kashmir Valley in Six** | Srinagar → Gulmarg → Pahalgam → Srinagar | 6 | taxi | Apr–Oct | Highest-intent fly-in searcher after Ladakh; short mountain legs | ✅ |
| 5 | **Meghalaya — Rain, Caves & Root Bridges** | Guwahati → Shillong → Sohra → Mawlynnong → Dawki → Shillong | 5 | taxi | Sep–Apr (post-monsoon peaks) | The Northeast's highest-under-served search: real demand, almost no priced itineraries | ✅ |
| 6 | **Ladakh — Leh, Nubra, Pangong** | Leh → Nubra → Pangong → Leh | 7 | rental | Jun–Sep | The most-searched itinerary in India. Needs permit modelling + an acclimatisation day before it can pass the gates honestly | 🔜 |
| 7 | **Spiti Circuit** | Shimla → Kalpa → Kaza → Chandratal → Manali | 8 | rental | Jun–Sep | The connoisseur's Ladakh alternative; one-way over two passes; biggest "am I doing this right?" search | ⏳ |
| 8 | **Golden Triangle (without the slog)** | Delhi → Agra → Jaipur | 5 | taxi | Oct–Mar | Highest-volume *international* search into India. The closing 280 km leg needs a train leg or an open-jaw ending — model it, don't fake it | ⏳ |
| 9 | **Rann of Kutch & Bhuj** | Ahmedabad → Bhuj → Dhordo → Mandvi | 5 | car | Nov–Feb (Rann Utsav window) | Sharp seasonal demand spike; white-desert + craft villages is a distinct archetype | ⏳ |
| 10 | **Hampi & Badami, Karnataka's Stone Age** | Bangalore → Hampi → Badami → Pattadakal → Bangalore | 4 | car | Oct–Feb | Deep Bangalore-origin demand; short legs between the ruins | ⏳ |
| 11 | **Ooty & Kodaikanal, Nilgiri Loop** | Bangalore → Ooty → Kodaikanal → Bangalore | 5 | car | Oct–Jun | The single most-searched weekend from Bangalore after Coorg | ⏳ |
| 12 | **Andamans — Port Blair & Havelock** | Port Blair → Havelock → Neil Island | 6 | mixed | Oct–May | Highest-intent island search; ferry legs make it a `mixed`-mode showcase | ⏳ |
| 13 | **Darjeeling & Sikkim** | Bagdogra → Gangtok → Pelling → Darjeeling | 7 | rental | Mar–May, Oct–Dec | Kolkata's premium circuit; permits for Nathu La need care | ⏳ |
| 14 | **Coorg Loop from Bangalore** *(reference, already shipped)* | Bangalore → Mysore → Madikeri → Kushalnagar → Bangalore | 5 | car | Oct–Feb | The flagship weekend from Bangalore — and the file that proved the gate reshapes drafts | ✅ |
| 15 | **Varanasi & Sarnath** | Varanasi → Sarnath → Varanasi | 3 | taxi | Oct–Mar | Short-break, spiritual, very high search; a real test of the 3-day format | ⏳ |
| 16 | **Amritsar & the Wagah Border** | Amritsar → Wagah → Anandpur Sahib | 3 | taxi | Oct–Mar | Short-break food/spiritual trip; commitments-heavy (ceremony timings) | ⏳ |
| 17 | **Konkan Coast Road Trip** | Mumbai → Ganpatipule → Malvan → Tarkarli → Goa | 6 | car | Nov–Feb | The self-drive coastal classic; monsoon-closed stretches make honesty the selling point | ⏳ |
| 18 | **Uttarakhand — Rishikesh, Auli & the Char Dham Road** | Dehradun → Rishikesh → Auli → Dehradun | 5 | car | Mar–Jun, Sep–Nov | Delhi's mountain escape; a genuine snow-season variant later | ⏳ |
| 19 | **Valley of Flowers & Hemkund** | Rishikesh → Govindghat → Ghangaria → Rishikesh | 6 | mixed | Jul–Sep (monsoon window only) | Peak seasonal search; a trekking archetype the shelf is missing | ⏳ |
| 20 | **Puri, Konark & Chilika** | Bhubaneswar → Puri → Konark → Chilika → Bhubaneswar | 4 | taxi | Oct–Feb | Odisha's coastal triangle; the WB/Odisha search demand with no priced plans anywhere | ⏳ |

---

## 3. What "first 5" optimises for

The five shipped trips (**#1–#5**) were chosen together, not individually:

- **Four different archetypes** — beach (Goa), backwater/hill (Kerala), heritage
  forts (Rajasthan), alpine valley (Kashmir), plus the Northeast discovery
  (Meghalaya). A visitor's first Explore scroll shows range, not five hill trips.
- **Three of five are fly-in** (`taxi` mode) and one is a self-drive rental — the
  transport filter has something real in it from day one.
- **Budgets bracket the market** — from a backpacker-band Goa trip to a
  comfort-band Kashmir week, so the price filter never returns an empty shelf.
- **All five are season-honest for the launch window** (Oct–Nov), and each
  names its real season in `bestSeason`.
- **None needs a permit** — the backlog's Ladakh/Sikkim entries do, which is why
  they are batch two: permit modelling is real work, not a claim.

## 4. Authoring rules for this backlog (from the playbook)

1. Coordinates are **geocoded, never recalled** (`scripts/gallery-geocode.mjs`).
2. Every fee carries a `sourceUrl`; conflicting sources are reconciled **in the
   open** in `warningsAndAssumptions`.
3. Budgets are **set from the engine's printed estimate**, never hand-picked.
4. Gate 1 (structure) and Gate 2 (engine truth) must both pass before a file is
   renamed `.golden.json`; the CI test walks the whole directory.
5. A trip that fails the gate gets **reshaped, not exempted** — and the reshaped
   shape is the one that ships (Coorg #14 is the proof).
