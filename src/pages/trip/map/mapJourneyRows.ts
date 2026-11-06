// ============ Map rows over the shared journey projection (#08 L2) ============
// The Map's rail and place card read ONE fact source: the L1 projection. This
// adapter adds only presentation facts the ticket-03 drive row already owns
// (reason chips and the page's live/added/dismissed/held-back state) and keeps
// every cost, time, identity, source, freshness and action fact from the row.
//
// Lookup is provider-aware (`isSameEntity`), never a raw hit id: two providers
// that both number a place "1" are two rows, and a slot row that replaced a
// drive row in place is still the row the rail and the card read.
import { isSameEntity } from '../../../lib/placeIdentity'
import type { PlaceHit } from '../../../lib/providers/hits'
import type { RailChip } from '../../../lib/railReasons'
import type { SlotKey, SlotRef } from '../../../lib/daySlots'
import type { JourneyActions, JourneyProjection, JourneyRow } from '../../../lib/journeyProjection'
import type { DriveSuggestionRow, DriveSuggestionState } from './driveSuggestionView'

/** One projected row with the Map's presentation extras attached. */
export interface MapJourneyRow extends JourneyRow {
  /** Reason chips from the existing presentation path, never a cost fact. */
  readonly chips: RailChip[]
  /** The page's own rail state for this place. */
  readonly state: DriveSuggestionState
}

/** The occurrence a selection actually names. An absent field is no constraint. */
export interface MapRowBinding {
  slotKey?: SlotKey | null
  slotRef?: SlotRef | null
  stopId?: string | null
}

/** The ticket-03 row for a place, matched by entity (provider-aware). */
export function driveRowForHit(
  driveRows: readonly DriveSuggestionRow[],
  hit: PlaceHit,
): DriveSuggestionRow | undefined {
  return driveRows.find(row => isSameEntity(row.hit, hit))
}

/**
 * The projection's rows in their own order, with chips and rail state attached.
 * Order is the projection's: engine order with each slot row already in the
 * position of the drive row it replaced.
 */
export function mapJourneyRows(
  projection: JourneyProjection,
  driveRows: readonly DriveSuggestionRow[],
): MapJourneyRow[] {
  return projection.rows.map(row => toMapRow(row, driveRows))
}

/**
 * Every row the Map may display: the day's rows first, then the explicit
 * unassigned bucket (a drive row with no day or another day). The Map rail is
 * whole-trip, so it looks up a foreign row in its own real day; the projection
 * still keeps that row out of the day's `rows` and slot replacement.
 */
export function mapAllJourneyRows(
  projection: JourneyProjection,
  driveRows: readonly DriveSuggestionRow[],
): MapJourneyRow[] {
  return [
    ...projection.rows.map(row => toMapRow(row, driveRows)),
    ...projection.unassigned.map(row => toMapRow(row, driveRows)),
  ]
}

function toMapRow(row: JourneyProjection['rows'][number], driveRows: readonly DriveSuggestionRow[]): MapJourneyRow {
  const drive = driveRowForHit(driveRows, row.hit)
  return {
    ...row,
    chips: drive?.chips ?? [],
    state: drive?.state ?? 'live',
  }
}

/**
 * Every projected row for one place, optionally scoped to a day. Used to tell a
 * missing row apart from several occurrences that no selection can separate.
 */
export function mapRowsForHit(
  rows: readonly MapJourneyRow[],
  hit: PlaceHit,
  dayIndex?: number | null,
): MapJourneyRow[] {
  const matches = rows.filter(row => isSameEntity(row.hit, hit))
  if (dayIndex == null) return matches
  return matches.filter(row => row.dayIndex === dayIndex)
}

function satisfies(row: MapJourneyRow, binding: MapRowBinding): boolean {
  if (binding.slotKey != null && row.slotKey !== binding.slotKey) return false
  if (binding.stopId != null && row.stopId !== binding.stopId) return false
  if (binding.slotRef != null) {
    const ref = row.slotRef
    if (!ref || ref.tripId !== binding.slotRef.tripId || ref.dayId !== binding.slotRef.dayId || ref.key !== binding.slotRef.key) return false
  }
  return true
}

/**
 * The row for one place. A day hint scopes the match. A selection binding (slot
 * key, slot ref or stop id) must identify ONE occurrence; several same-day
 * occurrences without a binding return undefined instead of guessing another
 * occurrence's facts.
 */
export function mapRowForHit(
  rows: readonly MapJourneyRow[],
  hit: PlaceHit,
  dayIndex?: number | null,
  binding?: MapRowBinding | null,
): MapJourneyRow | undefined {
  const matches = mapRowsForHit(rows, hit, dayIndex)
  const bound = binding ? matches.filter(row => satisfies(row, binding)) : matches
  return bound.length === 1 ? bound[0] : undefined
}

/**
 * The first projected row for a place, in projection order. The rail uses this
 * for its corridor row: a slot row that replaced the drive row is emitted in
 * that position, so the first match is the engine's own row for that segment.
 */
export function mapRailRowForHit(
  rows: readonly MapJourneyRow[],
  hit: PlaceHit,
  dayIndex?: number | null,
): MapJourneyRow | undefined {
  return mapRowsForHit(rows, hit, dayIndex)[0]
}

/** The rows a slot occurrence owns, in projection order. */
export function mapRowsForSlot(
  rows: readonly MapJourneyRow[],
  slotKey: JourneyRow['slotKey'],
): MapJourneyRow[] {
  if (slotKey == null) return []
  return rows.filter(row => row.slotKey === slotKey)
}

/**
 * Every day's projected rows in one list. The Map's whole-trip rail/card must
 * see rows for a day other than the active one; a single active-day projection
 * loses them.
 */
export function mapAllJourneyRowsForDays(
  days: Iterable<{ readonly projection: JourneyProjection }>,
  driveRows: readonly DriveSuggestionRow[],
): MapJourneyRow[] {
  const out: MapJourneyRow[] = []
  for (const day of days) out.push(...mapJourneyRows(day.projection, driveRows))
  return out
}

/**
 * The card's actions. An ambiguous projected occurrence (the card knows the
 * place was projected but cannot bind one occurrence) disables mutation until
 * a binding exists; navigation stays available.
 */
export function mapCardActions(
  row: MapJourneyRow | undefined,
  projected: boolean,
): JourneyActions | undefined {
  if (row) return row.actions
  if (!projected) return undefined
  return { preview: false, add: false, shortlist: false, vote: false, navigate: true }
}