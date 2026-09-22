// ============ Crew invites - the growth loop, honestly staged ============
// A trip gets better the moment the crew is in it, and the create page is the
// peak of that motivation. This module holds the parts that must be right
// before anything is sent to anyone: number normalising, the message itself,
// and the WhatsApp link.
//
// CONTRACT:
//  - Nothing here sends anything. It composes; the caller decides.
//  - India-first number handling: +91 / 0 prefixes accepted, 10 digits, first
//    digit 6-9. Anything else is honestly "not a number we can message" rather
//    than a plausible-looking guess.
//  - The message says what the trip is and what the person is being asked to
//    do. No marketing, no fake urgency, no "you have been invited by an
//    exciting app".
//
// Pure module: no react/supabase imports, node-testable.

export interface CrewEntry {
  /** What the planner typed, kept verbatim for the UI. */
  raw: string
  /** A name, when the entry had one. */
  name: string
  /** A 10-digit Indian mobile, or null when the entry had no usable number. */
  phone: string | null
}

/** Normalise an Indian mobile number to its 10 digits, or null.
 *  Accepts "+91 98450 21234", "098450 21234", "919845021234", "98450-21234". */
export function normalizeIndianMobile(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D+/g, '')
  if (!digits) return null
  let d = digits
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length !== 10) return null
  // Indian mobiles begin 6-9. A 10-digit string starting 0-5 is not a mobile.
  if (!/^[6-9]/.test(d)) return null
  return d
}

/** Split a free-form entry into a name and a number. "Ammu 98450 21234" gives
 *  both; a bare number gives a number; a bare name gives a name. */
export function parseCrewEntry(raw: string): CrewEntry {
  const trimmed = (raw ?? '').trim()
  const phone = normalizeIndianMobile(trimmed)
  if (phone) {
    const name = trimmed.replace(/[\d+\-()\s]+/g, ' ').replace(/\s+/g, ' ').trim()
    return { raw: trimmed, name, phone }
  }
  return { raw: trimmed, name: trimmed, phone: null }
}

/** Add an entry to a crew list without duplicates or blanks. Returns a new list,
 *  so callers can keep state updates pure. */
export function addCrewEntry(list: CrewEntry[], raw: string, limit: number): CrewEntry[] {
  const entry = parseCrewEntry(raw)
  if (!entry.raw) return list
  if (list.length >= Math.max(0, limit)) return list
  const dupe = list.some(e =>
    (entry.phone && e.phone === entry.phone) ||
    (!entry.phone && !e.phone && e.name.toLowerCase() === entry.name.toLowerCase()),
  )
  return dupe ? list : [...list, entry]
}

/** A wa.me deep link. The number carries the country code; the text is encoded. */
export function whatsappInviteUrl(phone: string, text: string): string {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
}

/** The invite message. Short, specific, and honest about what joining does -
 *  it is the first thing this product ever says to someone. */
export function crewInviteMessage(opts: {
  tripName: string
  joinUrl: string
  plannerName?: string
}): string {
  const who = opts.plannerName?.trim() ? `${opts.plannerName.trim()} is planning` : "We're planning"
  return [
    `${who} "${opts.tripName}" on YatraFlow.`,
    `Join to vote on stops and keep the plan in one place: ${opts.joinUrl}`,
  ].join('\n')
}

/** The planner-role line the create page shows above the collector. Kept here
 *  so the promise and the invite cannot drift apart. */
export const PLANNER_ROLE_LINE = "You're the planner - the crew votes, you decide."
