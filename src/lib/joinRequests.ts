// Join requests for a priced trip (D4). A visitor asks; the owner decides. The
// database owns every write: `request_trip_join` records a pending row, and
// `decide_trip_join` is the only path into `trip_members`. Nothing here writes a
// membership. A failed call is reported as `failed`, never as an empty list.
import { supabase } from './supabase'

export type JoinRole = 'editor' | 'viewer'

export interface PendingJoinRequest {
  id: string
  userId: string
  /** The requester's name from their public card, or the fallback when no card exists. */
  name: string
  role: JoinRole
  createdAt: string
}

/** A write's outcome. `failed` covers an RPC error and a thrown network error. */
export type JoinWrite = { kind: 'ok' } | { kind: 'failed' }

/** The owner's pending list. A failed read is `failed`, never an empty list. */
export type PendingRead = { kind: 'ok'; requests: PendingJoinRequest[] } | { kind: 'failed' }

// The generated Supabase types do not know these two RPCs or the join table yet,
// so the calls go through this narrow view of the client. It names only what
// this module uses.
interface SelectBuilder extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(column: string, value: string): SelectBuilder
  order(column: string, options: { ascending: boolean }): SelectBuilder
}
interface LooseClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data?: unknown; error: unknown }>
  from(table: string): { select(columns: string): SelectBuilder }
}
const client = supabase as unknown as LooseClient

/** Ask the owner to let this account in. The code is the one the invite carried. */
export async function requestTripJoin(code: string): Promise<JoinWrite> {
  try {
    const { error } = await client.rpc('request_trip_join', { p_code: code })
    return error ? { kind: 'failed' } : { kind: 'ok' }
  } catch {
    return { kind: 'failed' }
  }
}

/** Shown only for a requester who has no public card. A failed card read shows nothing. */
export const UNNAMED_TRAVELLER = 'Unnamed traveller'

/** Display names from the public cards, keyed by user id. Null when the read fails. */
async function readCardNames(ids: string[]): Promise<Map<string, string> | null> {
  const { data, error } = await client.rpc('get_public_profile_cards', { p_ids: ids })
  if (error || !Array.isArray(data)) return null
  const names = new Map<string, string>()
  for (const card of data as Array<{ id?: unknown; name?: unknown }>) {
    if (typeof card.id === 'string' && typeof card.name === 'string') names.set(card.id, card.name)
  }
  return names
}

/** The owner's pending requests for one trip, oldest first. */
export async function listPendingJoinRequests(tripId: string): Promise<PendingRead> {
  try {
    const { data, error } = await client
      .from('trip_join_requests')
      .select('id,user_id,role,created_at')
      .eq('trip_id', tripId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (error || !Array.isArray(data)) return { kind: 'failed' }
    const rows = data as Array<{ id: string; user_id: string; role: JoinRole; created_at: string }>
    if (rows.length === 0) return { kind: 'ok', requests: [] }
    // One card read for every requester. A failed read fails the whole list,
    // so a name is never invented while the cards cannot be read.
    const names = await readCardNames([...new Set(rows.map(r => r.user_id))])
    if (names === null) return { kind: 'failed' }
    return {
      kind: 'ok',
      requests: rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        name: names.get(r.user_id) ?? UNNAMED_TRAVELLER,
        role: r.role,
        createdAt: r.created_at,
      })),
    }
  } catch {
    return { kind: 'failed' }
  }
}

/** The owner approves or declines one request. */
export async function decideTripJoin(requestId: string, approve: boolean): Promise<JoinWrite> {
  try {
    const { error } = await client.rpc('decide_trip_join', { p_request: requestId, p_approve: approve })
    return error ? { kind: 'failed' } : { kind: 'ok' }
  } catch {
    return { kind: 'failed' }
  }
}
