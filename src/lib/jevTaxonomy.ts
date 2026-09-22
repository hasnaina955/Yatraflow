// ============ Companion intent taxonomy — the one truth about capabilities ===
// Every word in this file is consumed in TWO places that must never drift:
// the deterministic keyword router (`lib/ai.ts`'s if-chain) and the Jev
// classifier's criteria (the runtime option + the dev audit). The taxonomy is
// what the assistant CAN do — placing a stop, booking, or live data are app
// features, deliberately absent, and fall to "none".

/** All classifiable intents. `none` is special: it means no capability serves
 *  the request, which the keyword router answers with the general reply. */
export const INTENTS = [
  'tiring', 'airport', 'cheaper', 'rain', 'family', 'kids', 'compare',
  'risks', 'delay', 'youtube', 'cost', 'summary',
] as const

export type CompanionIntent = (typeof INTENTS)[number] | 'none'

export const INTENT_NONE: CompanionIntent = 'none'

/** The set as a plain string[] (Jev's payload and the tests want that). */
export const INTENT_KEYS: string[] = [...INTENTS, INTENT_NONE]

/** What the traveller WANTS, phrased as intent not keywords — handed to Jev
 *  verbatim; the development audit imports this same object. */
export const INTENT_CRITERIA: Record<string, string> = {
  tiring: 'Make one particular day less demanding — less travel, walking or fewer stops.',
  airport: 'Check whether a fixed flight or train departure can actually be reached in time.',
  cheaper: 'Propose changes that reduce what the trip costs.',
  rain: 'Plan alternatives for wet weather.',
  family: 'Re-cast the itinerary to be gentler and better suited to a family group.',
  kids: 'Identify which specific stops are unsuitable when travelling with children.',
  compare: 'Compare a relaxed itinerary against a packed one.',
  risks: 'Identify what could go wrong — the biggest risks in the plan.',
  delay: 'Get a contingency plan for being delayed in transit.',
  youtube: 'Draft publishable promotional text (video description, blog or caption) from the trip.',
  cost: 'Report the cost breakdown as it stands — total, per person, per day, by category.',
  summary: 'Give a high-level recap of the whole plan.',
  none: 'None of the above serve this request — it needs something the assistant cannot do.',
}
