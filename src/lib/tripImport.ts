// ============ Trip import ============
// One parser for every JSON a user can hand the app. Two formats exist:
//
//   v1  a bare `Trip`            — what "Download JSON" writes
//   v2  `{ trip, publication }`  — the gallery import format
//                                  (docs/ITINERARY-IMPORT-SPEC.md)
//
// The v2 wrapper is why a shelf itinerary used to fail on import: the shape
// check looked for `days` on the OUTER object and found `trip` / `publication`
// instead, so a file the repo's own gates had certified was rejected as "not a
// valid YatraFlow trip export". The inner `trip` is a valid import — it simply
// omits the tool-managed fields (id / createdAt / updatedAt) and `members`,
// which the importer assigns.
//
// Parsing is pure and side-effect free so it can be tested without a browser.
// Applying it is the store's job (`importTrip`).
import type { Trip } from '../data/types'

/** The `publication` half of a v2 gallery file. Carried through so the caller
 *  can tell the user what the file also contained — never applied silently. */
export interface PublicationDraft {
  id?: string
  title?: string
  tagline?: string
  coverImageUrl?: string
  routeSummary?: string[]
  durationDays?: number
  estimatedBudgetPerPersonInr?: number
  travelStyle?: string
  bestSeason?: string
  travelTips?: string[]
  warningsAndAssumptions?: string[]
  freeDayIndexes?: number[]
  premiumPriceInr?: number
  subscriberCta?: string
}

export interface ParsedTripImport {
  /** A complete `Trip`. `id` / `createdAt` / `updatedAt` are placeholders —
   *  the store assigns real ones and re-ids every day, stop and expense, so
   *  importing a foreign file can never collide with a local row. */
  trip: Trip
  /** Present when the file was a v2 gallery import. */
  publication?: PublicationDraft
  format: 'trip' | 'gallery'
  /** One short phrase for the toast, e.g. "6-day gallery itinerary". */
  summary: string
}

/** Thrown with a message written for the person holding the file. */
export class TripImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TripImportError'
  }
}

const SNAPSHOT_PREFIX = 'yf1_'

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v : fallback
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function list<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** True when the object looks like a `published_itineraries` row rather than a
 *  trip — the two are easy to confuse and the error should say which it is. */
function looksLikePublicationRow(o: Record<string, unknown>): boolean {
  return !Array.isArray(o.days) && (
    Array.isArray(o.route_summary) || Array.isArray(o.routeSummary)
    || typeof o.tagline === 'string' || o.premium_price_inr !== undefined
    || o.premiumPriceInr !== undefined || typeof o.creator_id === 'string'
  )
}

/** Parse a trip export, in either format, into something importable.
 *  Throws `TripImportError` with a specific reason on anything it cannot read. */
export function parseTripImport(text: string): ParsedTripImport {
  const raw = text.trim()
  if (!raw) throw new TripImportError('That file is empty.')
  if (raw.startsWith(SNAPSHOT_PREFIX)) {
    throw new TripImportError(
      'That is a snapshot-link payload, not a file export — open it as a link instead.',
    )
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new TripImportError('That file is not JSON.')
  }
  if (!isObject(data)) {
    throw new TripImportError('That file is not a YatraFlow trip export.')
  }

  let source: Record<string, unknown>
  let publication: PublicationDraft | undefined
  let format: 'trip' | 'gallery'

  if (isObject(data.trip)) {
    // v2 — the gallery import format
    source = data.trip
    publication = isObject(data.publication) ? (data.publication as PublicationDraft) : undefined
    format = 'gallery'
  } else if (Array.isArray(data.days)) {
    // v1 — a bare trip export
    source = data
    format = 'trip'
  } else if (looksLikePublicationRow(data)) {
    throw new TripImportError(
      'That is a published-itinerary row, not a trip export — it carries no itinerary days.',
    )
  } else if (isObject(data.publication)) {
    throw new TripImportError(
      'That file has publish details but no `trip` block — it looks incomplete.',
    )
  } else {
    throw new TripImportError('That export has no itinerary days — it is not a trip.')
  }

  const days = source.days
  if (!Array.isArray(days) || days.length === 0) {
    throw new TripImportError('That export has no itinerary days — it is not a trip.')
  }
  const badDay = days.findIndex(d => !isObject(d) || !Array.isArray(d.stops))
  if (badDay >= 0) {
    throw new TripImportError(
      `Day ${badDay + 1} of that export has no stops list — the file looks truncated.`,
    )
  }

  const destinations = list<string>(source.destinations).filter(d => typeof d === 'string')
  const stopCount = days.reduce((n, d) => n + ((d as { stops: unknown[] }).stops.length), 0)

  const trip = {
    ...source,
    // Placeholders: the store replaces all three and re-ids every nested row.
    id: 'import-pending',
    createdAt: 0,
    updatedAt: 0,
    name: str(source.name, 'Imported trip'),
    startLocation: str(source.startLocation, destinations[0] ?? ''),
    destinations,
    startDate: str(source.startDate),
    endDate: str(source.endDate),
    travellers: num(source.travellers, 2),
    transportMode: str(source.transportMode, 'car'),
    budgetPerPersonInr: num(source.budgetPerPersonInr, 0),
    travelStyle: str(source.travelStyle, 'balanced'),
    // `buildTripCopy` maps both of these, so a missing key is a crash, not a
    // nicety. A hand-written export often omits them.
    fixedCommitments: list(source.fixedCommitments),
    expenses: list(source.expenses),
    days,
    coverEmoji: str(source.coverEmoji, '🧭'),
    // An import is the user's own private plan until they publish it. A v2
    // file carries `visibility: 'public'` from the gallery; that must not
    // decide anything here.
    visibility: 'private',
    // Assigned by the store, never taken from the file.
    members: undefined,
    inviteCode: undefined,
    deletedAt: undefined,
  } as unknown as Trip

  const kind = format === 'gallery' ? 'gallery itinerary' : 'trip'
  return {
    trip,
    publication,
    format,
    summary: `${days.length}-day ${kind}, ${stopCount} stops`,
  }
}
