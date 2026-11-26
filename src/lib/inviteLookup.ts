// ============ #1019 — what a code lookup's answer means ============
//
// The get_trip_by_invite_code RPC answers with an array of trip rows. This file
// decides whether that answer is a trip, a dead link, or a failed read. The
// store and the join gate both use it, so the rules live in one place.
import { EXPENSE_CATEGORIES, STOP_CATEGORIES, STOP_STATUSES, TRANSPORT_MODES, TRAVEL_STYLES } from '../data/types'
import { validWriteVersion, type TripRow } from './tripRow'
import type { InviteRole } from './inviteLandingCopy'

export type InviteRowVerdict =
  | { kind: 'found'; row: TripRow }
  | { kind: 'dead' }
  | { kind: 'failed' }

/**
 * The two facts the preview RPC carries on top of the trip (20261126).
 * `ownerFirstName` is the trip owner's first name or handle, already normalised
 * by the server; `inviteRole` is the role the code admits.
 *
 * They are read HERE and not by the trip row mapper on purpose: a Trip built
 * from a row must never carry a role claim (#1012), and this row never enters
 * the cache. `null` on either field means the read carried none, which is the
 * state the invite screen degrades to.
 */
export interface InvitePreviewIdentity {
  ownerFirstName: string | null
  inviteRole: InviteRole
}

export function invitePreviewIdentity(row: Partial<TripRow> | null | undefined): InvitePreviewIdentity {
  const name = typeof row?.owner_first_name === 'string' ? row.owner_first_name.trim() : ''
  const role = row?.invite_role
  return {
    ownerFirstName: name || null,
    inviteRole: role === 'editor' || role === 'viewer' ? role : null,
  }
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPoint(value: unknown): boolean {
  return value === null || (isRecord(value) && isFiniteNumber(value.lat) && isFiniteNumber(value.lng))
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isDay(value: unknown): boolean {
  return isRecord(value) && isNonEmptyText(value.id) && validWriteVersion(value.index)
    && (value.title === undefined || typeof value.title === 'string')
    && Array.isArray(value.stops) && value.stops.every(stop =>
      isRecord(stop) && isNonEmptyText(stop.id) && typeof stop.title === 'string'
      && typeof stop.locationName === 'string'
      && STOP_CATEGORIES.some(category => category === stop.category)
      && STOP_STATUSES.some(status => status === stop.status)
      && (stop.priority === 'must-do' || stop.priority === 'nice-to-have' || stop.priority === 'optional')
      && [stop.lat, stop.lng, stop.visitMinutes, stop.entryFeeInrPerPerson, stop.transportCostInrTotal, stop.orderInDay].every(isFiniteNumber),
    )
}

function isInviteRow(value: unknown): value is TripRow {
  if (!isRecord(value)) return false
  for (const id of [value.id, value.owner_id]) {
    if (typeof id !== 'string' || !UUID.test(id)) return false
  }
  if (!validWriteVersion(value.write_version)) return false
  if (value.visibility !== 'private' && value.visibility !== 'public') return false
  if (!isNonEmptyText(value.invite_code) || value.deleted_at !== null) return false
  if (!TRANSPORT_MODES.some(mode => mode === value.transport_mode)) return false
  if (!TRAVEL_STYLES.some(style => style === value.travel_style)) return false

  const text = ['name', 'start_location', 'start_date', 'end_date', 'cover_emoji']
  if (!text.every(field => typeof value[field] === 'string')) return false
  if (![value.travellers, value.budget_per_person_inr, value.created_at, value.updated_at].every(isFiniteNumber)) return false

  if (!Array.isArray(value.destinations) || !value.destinations.every(item => typeof item === 'string')) return false
  if (!isPoint(value.start_location_coords)) return false
  if (value.destination_coords !== null && !(Array.isArray(value.destination_coords) && value.destination_coords.every(isPoint))) return false
  if (!Array.isArray(value.days) || !value.days.every(isDay)) return false
  if (!Array.isArray(value.fixed_commitments) || !value.fixed_commitments.every(item =>
    isRecord(item) && isNonEmptyText(item.id) && typeof item.title === 'string'
    && typeof item.type === 'string' && validWriteVersion(item.dayIndex) && typeof item.time === 'string',
  )) return false
  if (!Array.isArray(value.expenses) || !value.expenses.every(item =>
    isRecord(item) && isNonEmptyText(item.id) && typeof item.label === 'string' && isFiniteNumber(item.amountInr)
    && EXPENSE_CATEGORIES.some(category => category === item.category),
  )) return false

  const numbers = [
    value.fuel_economy_km_per_l, value.fuel_price_per_l, value.driver_count, value.drive_after_dinner_min,
    value.tank_l, value.rent_per_day_inr, value.access_version,
  ]
  if (!numbers.every(number => number == null || isFiniteNumber(number))) return false
  const flags = [value.round_trip, value.has_vulnerable, value.drives_part, value.local_train]
  if (!flags.every(flag => flag == null || typeof flag === 'boolean')) return false
  const labels = [value.cover_image_url, value.stay_style, value.ref, value.creation_kind, value.source_pub_id, value.campaign_id]
  if (!labels.every(label => label == null || typeof label === 'string')) return false
  if (value.vehicle_profile != null && !isRecord(value.vehicle_profile)) return false
  if (value.flights != null && !(Array.isArray(value.flights) && value.flights.every(isRecord))) return false

  const hasName = Object.prototype.hasOwnProperty.call(value, 'owner_first_name')
  const hasRole = Object.prototype.hasOwnProperty.call(value, 'invite_role')
  if (!hasName && !hasRole) return true
  return hasName && hasRole
    && (value.owner_first_name === null || isNonEmptyText(value.owner_first_name))
    && (value.invite_role === 'editor' || value.invite_role === 'viewer')
}

export function classifyInviteRows(data: unknown): InviteRowVerdict {
  if (!Array.isArray(data)) return { kind: 'failed' }
  if (data.length === 0) return { kind: 'dead' }
  const row: unknown = data[0]
  if (data.length !== 1 || !isInviteRow(row)) return { kind: 'failed' }
  return { kind: 'found', row }
}
