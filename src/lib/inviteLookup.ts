// ============ #1019 — what a code lookup's answer means ============
//
// The get_trip_by_invite_code RPC answers with an array of trip rows. This file
// decides whether that answer is a trip, a dead link, or a failed read. The
// store and the join gate both use it, so the rules live in one place.
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

export function classifyInviteRows(data: unknown): InviteRowVerdict {
  // A refused shape is a server fault, not a dead code, so it is a failed read.
  if (!Array.isArray(data)) return { kind: 'failed' }
  // The RPC answered, and no trip has this code: a dead link.
  if (data.length === 0) return { kind: 'dead' }
  const row = data[0] as Partial<TripRow> | null
  // B3 (round 10) — provenance: no shape, no trip. A preview that names no trip
  // id, or carries no usable revision, is not an answer this client can act on.
  if (typeof row?.id !== 'string' || row.id.length === 0 || !validWriteVersion(row.write_version)) {
    return { kind: 'failed' }
  }
  return { kind: 'found', row: row as TripRow }
}
