import type { Phrasing } from './jev-router-corpus'

export interface Harvested extends Phrasing {
  /** file:line the string came from */
  origin: string
  /** why it is labelled this way, or what makes it awkward */
  note?: string
}

export const HARVESTED_PROVENANCE =
  'The 34 harvested entries are demo, copy, SEO and maintainer-written snippets taken from this ' +
  'repository — seed data written for the app, docs examples, backlog search phrases, and ' +
  'maintainer-described complaints. They are not traveller transcripts, and they are not an ' +
  'independent holdout: the router was tuned against these files.'

export const HARVESTED: Harvested[] = [
  // ---- 1. seed data: the only question-shaped user text written for the app ----
  {
    id: 'h01',
    text: 'Day 2 is packed — which stop do we drop?',
    want: 'tiring',
    origin: 'src/data/seed.ts:361 (TripDecision.question, dc_1)',
    note: 'A demo crew decision. The ask is "which stop do we drop" = lighten the day, but it contains "packed", which the original baseline router read as a pace comparison.',
  },
  {
    id: 'h02',
    text: 'Six activities in one day. Health score flags Day 2 as Tight.',
    want: 'none',
    origin: 'src/data/seed.ts:362 (TripDecision.context, dc_1)',
    note: 'Context, not a request. Should abstain — no handler takes a bare diagnosis.',
  },
  {
    id: 'h03',
    text: 'Vegetarian-only houseboat menu or mixed?',
    want: 'none',
    origin: 'src/data/seed.ts:373 (TripDecision.question, dc_2)',
    note: 'A demo crew decision, but about food preference — no handler for it.',
  },
  {
    id: 'h04',
    text: 'I read mixed reviews about this place — can we check an ethical operator?',
    want: 'none',
    origin: 'src/data/seed.ts:353 (StopSuggestion comment, cm_2)',
    note: 'A request, but for something the companion cannot do.',
  },
  {
    id: 'h05',
    text: 'Quiet viewpoint over the tea valleys — better than Echo Point honestly.',
    want: 'none',
    origin: 'src/data/seed.ts:341 (StopSuggestion.description, sg_1)',
    note: 'A statement justifying a stop, not a question.',
  },
  {
    id: 'h06',
    text: 'Ethical elephant bathing session, 45 min. Kids would love it.',
    want: 'none',
    origin: 'src/data/seed.ts:350 (StopSuggestion.description, sg_2)',
    note: 'Statement. Contains "kids" — the original baseline router claimed it for removeForKids, the wrong direction entirely.',
  },
  {
    id: 'h07',
    text: 'Yes! Echo Point was a letdown last time.',
    want: 'none',
    origin: 'src/data/seed.ts:344 (StopSuggestion comment, cm_1)',
  },
  {
    id: 'h08',
    text: 'Popular echo viewpoint; skip if short on time.',
    want: 'none',
    origin: 'src/data/seed.ts:152 (ItineraryStop.description)',
    note: 'A stop note. "time" should not trip anything.',
  },

  // ---- 2. docs/USER_GUIDE.md — the product's own example questions ----
  {
    id: 'h09',
    text: 'Can we still make the airport if we add this?',
    want: 'airport',
    origin: 'docs/USER_GUIDE.md:101',
  },
  {
    id: 'h10',
    text: 'What should we cut with kids along?',
    want: 'kids',
    origin: 'docs/USER_GUIDE.md:101',
    note: 'Paraphrase of quickPrompts[5] with "children" replaced by "kids".',
  },
  {
    id: 'h11',
    text: 'Beach day or backwater day?',
    want: 'none',
    origin: 'docs/USER_GUIDE.md:84',
    note: 'An example crew decision. It is a choice between two days, but not the relaxed-vs-packed comparison the compare handler produces.',
  },
  {
    id: 'h12',
    text: 'forecast says one beach afternoon is a washout',
    want: 'rain',
    origin: 'src/pages/trip/GroupInputTab.tsx:483 (Field hint, decision context example)',
    note: 'The product teaches users to write this. It is a statement of fact, but rain planning is what it implies.',
  },
  {
    id: 'h13',
    text: 'Are the times and costs real?',
    want: 'none',
    origin: 'docs/USER_GUIDE.md:118-130 (FAQ)',
    note: 'A question about data honesty, not a cost breakdown request. "costs" sent it to costSummary in the original baseline.',
  },
  {
    id: 'h14',
    text: 'Can I actually book hotels/trains here?',
    want: 'none',
    origin: 'docs/USER_GUIDE.md:118-130 (FAQ)',
    note: 'Booking is an explicit non-goal. Contains "trains" — must not reach the airport handler.',
  },
  {
    id: 'h15',
    text: 'Why does the map route look like crow-flies lines?',
    want: 'none',
    origin: 'docs/USER_GUIDE.md:118-130 (FAQ)',
  },
  {
    id: 'h16',
    text: 'Someone deleted everything?!',
    want: 'none',
    origin: 'docs/USER_GUIDE.md:118-130 (FAQ)',
  },

  // ---- 3. search phrases (docs/GALLERY-BACKLOG.md) ----
  // Search-intent, not question-intent. None of these are companion asks, so every
  // one is an abstain test — and they are the highest-risk abstain tests, because a
  // keyword like "itinerary" or "cost" appears in most of them.
  { id: 'h17', text: 'Goa itinerary 4 days', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h18', text: 'Kerala itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h19', text: 'Rajasthan itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h20', text: 'Leh Ladakh itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h21', text: 'Meghalaya itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h22', text: 'Spiti itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h23', text: 'Kashmir itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h24', text: 'Golden Triangle itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h25', text: 'Ooty Coorg itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h26', text: 'Rann of Kutch itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h27', text: 'Hampi itinerary', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:28-32' },
  { id: 'h28', text: 'am I doing this right?', want: 'none', origin: 'docs/GALLERY-BACKLOG.md:66' },
  { id: 'h29', text: 'Delhi to Spiti itinerary', want: 'none', origin: 'docs/PLAN-LAUNCH-AND-DISTRIBUTION.md:158-159' },
  {
    id: 'h30',
    text: 'Goa 4-day trip cost',
    want: 'none',
    origin: 'docs/PLAN-LAUNCH-AND-DISTRIBUTION.md:158-159',
    note: 'Search-shaped, but contains "cost" — the clearest abstain test in this group.',
  },

  // ---- 4. maintainer-described complaints (CHANGELOG / ROADMAP) ----
  {
    id: 'h31',
    text: 'Change saved but nothing changed',
    want: 'none',
    origin: 'CHANGELOG.md:755 (maintainer-described complaint)',
    note: 'A bug report, not a companion ask. "saved" should not make this a savings question.',
  },
  {
    id: 'h32',
    text: 'nothing I do changes anything',
    want: 'none',
    origin: 'CHANGELOG.md:867 (maintainer-described complaint)',
  },
  {
    id: 'h33',
    text: 'the delete didn\'t work',
    want: 'none',
    origin: 'ROADMAP.md:195 (maintainer-described complaint)',
  },
  {
    id: 'h34',
    text: 'the app told me what it already shows me',
    want: 'none',
    origin: 'docs/PLAN-MONETISATION.md:94 (quoted hypothetical user reaction)',
    note: 'Hypothetical rather than transcribed — flagged for honesty.',
  },
]
