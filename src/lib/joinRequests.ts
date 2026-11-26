// Join requests for a priced trip (D4). A visitor asks; the owner decides. The
// database owns every write: `request_trip_join` records a pending row, and
// `decide_trip_join` is the only path into `trip_members`. Nothing here writes a
// membership. A failed call is reported as `failed`, never as an empty list.
import { supabase } from './supabase'
import { captureJoinRequestScope } from '../store/store'

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
export type JoinWrite = { kind: 'ok' } | { kind: 'failed' } | { kind: 'cancelled' }

/** The owner's pending list. A failed read is `failed`, never an empty list. */
export type PendingRead = { kind: 'ok'; requests: PendingJoinRequest[] } | { kind: 'failed' } | { kind: 'cancelled' }

// The generated Supabase types do not know these two RPCs or the join table yet,
// so the calls go through this narrow view of the client. It names only what
// this module uses.
interface BoundBuilder extends PromiseLike<{ data: unknown; error: unknown }> {
  setHeader(name: string, value: string): this
}
interface SelectBuilder extends BoundBuilder {
  eq(column: string, value: string): SelectBuilder
  order(column: string, options: { ascending: boolean }): SelectBuilder
}
interface LooseClient {
  rpc(fn: string, args: Record<string, unknown>): BoundBuilder
  from(table: string): { select(columns: string): SelectBuilder }
}
const client = supabase as unknown as LooseClient
type Scope = ReturnType<typeof captureJoinRequestScope>

/** Ask the owner to let this account in. The code is the one the invite carried. */
export async function requestTripJoin(code: string, scope: Scope = captureJoinRequestScope()): Promise<JoinWrite> {
  if (!scope) return { kind: 'cancelled' }
  try {
    const token = await scope.token()
    if (!scope.live()) return { kind: 'cancelled' }
    if (!token) return { kind: 'failed' }
    const { error } = await client.rpc('request_trip_join', { p_code: code })
      .setHeader('Authorization', `Bearer ${token}`)
    if (!scope.live()) return { kind: 'cancelled' }
    return error ? { kind: 'failed' } : { kind: 'ok' }
  } catch {
    return { kind: scope.live() ? 'failed' : 'cancelled' }
  }
}

/** Shown only for a requester who has no public card. A failed card read shows nothing. */
export const UNNAMED_TRAVELLER = 'Unnamed traveller'

/** Display names from the public cards, keyed by user id. Null when the read fails. */
async function readCardNames(ids: string[], token: string): Promise<Map<string, string> | null> {
  const { data, error } = await client.rpc('get_public_profile_cards', { p_ids: ids })
    .setHeader('Authorization', `Bearer ${token}`)
  if (error || !Array.isArray(data)) return null
  const names = new Map<string, string>()
  for (const card of data as Array<{ id?: unknown; name?: unknown }>) {
    if (typeof card.id === 'string' && typeof card.name === 'string') names.set(card.id, card.name)
  }
  return names
}

/** The owner's pending requests for one trip, oldest first. */
export async function listPendingJoinRequests(tripId: string, scope: Scope = captureJoinRequestScope(tripId)): Promise<PendingRead> {
  if (!scope) return { kind: 'cancelled' }
  try {
    const token = await scope.token()
    if (!scope.live()) return { kind: 'cancelled' }
    if (!token) return { kind: 'failed' }
    const { data, error } = await client
      .from('trip_join_requests')
      .select('id,user_id,role,created_at')
      .eq('trip_id', tripId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .setHeader('Authorization', `Bearer ${token}`)
    if (!scope.live()) return { kind: 'cancelled' }
    if (error || !Array.isArray(data)) return { kind: 'failed' }
    const rows = data as Array<{ id: string; user_id: string; role: JoinRole; created_at: string }>
    if (rows.length === 0) return { kind: 'ok', requests: [] }
    // One card read for every requester. A failed read fails the whole list,
    // so a name is never invented while the cards cannot be read.
    const names = await readCardNames([...new Set(rows.map(r => r.user_id))], token)
    if (!scope.live()) return { kind: 'cancelled' }
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
    return { kind: scope.live() ? 'failed' : 'cancelled' }
  }
}

/** The owner approves or declines one request. */
export async function decideTripJoin(requestId: string, approve: boolean, tripId: string, scope: Scope = captureJoinRequestScope(tripId)): Promise<JoinWrite> {
  if (!scope) return { kind: 'cancelled' }
  try {
    const token = await scope.token()
    if (!scope.live()) return { kind: 'cancelled' }
    if (!token) return { kind: 'failed' }
    const { error } = await client.rpc('decide_trip_join', { p_request: requestId, p_approve: approve })
      .setHeader('Authorization', `Bearer ${token}`)
    if (!scope.live()) return { kind: 'cancelled' }
    return error ? { kind: 'failed' } : { kind: 'ok' }
  } catch {
    return { kind: scope.live() ? 'failed' : 'cancelled' }
  }
}
