// ============ Trip presence (M6 · B1) ============
// Who is viewing a trip right now. Pure state first (node-tested), the
// Supabase presence channel second (integration-tested — a presence
// round-trip needs a second live session, which the mocked tests cannot
// pretend to be).
//
// Deliberately a SEPARATE channel from the store's `yatraflow-live`
// postgres_changes subscription: presence re-syncs on every join/leave and
// heartbeat, while row changes are comparatively rare. Sharing one channel
// would route the noisy stream through the store's event dispatch, and the
// store must stay lean (plan doc B1).
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

// ---------------- pure state ----------------

/** One live viewing session of the trip, as presence reports it. Presence
 *  keys SESSIONS, not users — one signed-in user in two tabs is two sessions,
 *  and the dedupe below collapses them to one avatar per user. */
export interface PresencePeer {
  /** Opaque per-session identity (presenceKey()) — the join/leave unit. */
  sessionKey: string
  userId: string
  /** Best display name available at broadcast time (profile name > email). */
  name: string
  /** Millisecond timestamp of when this session (re)joined — drives the
   *  "longest-standing viewer first" avatar order, so a re-sync never
   *  reshuffles the row. */
  joinedAt: number
}

/** The pure presence state a trip's UI renders. */
export interface PresenceState {
  peers: PresencePeer[]
}

export const EMPTY_PRESENCE: PresenceState = { peers: [] }

/**
 * Add/replace one session's presence. Replace = a session re-joins (refresh,
 * reconnect) in place. Ordering is stable: by joinedAt asc, ties broken by
 * userId, so re-syncs never reshuffle.
 */
export function reducePresence(state: PresenceState, sessionKey: string, peer: { userId: string; name: string }, joinedAt: number): PresenceState {
  if (!sessionKey || !peer.userId) return state
  const peers = state.peers.filter(p => p.sessionKey !== sessionKey)
  peers.push({ sessionKey, userId: peer.userId, name: peer.name, joinedAt })
  return { peers: dedupeByUser(peers) }
}

/** Remove one session's presence (leave/refresh/untrack). */
export function removePresence(state: PresenceState, sessionKey: string): PresenceState {
  if (!sessionKey) return state
  return { peers: dedupeByUser(state.peers.filter(p => p.sessionKey !== sessionKey)) }
}

/**
 * One user, one avatar: a user with two live sessions (two tabs) appears once,
 * keeping their OLDEST session's join position so the row stays stable when a
 * second tab opens.
 */
function dedupeByUser(peers: PresencePeer[]): PresencePeer[] {
  const byUser = new Map<string, PresencePeer>()
  for (const p of peers) {
    const held = byUser.get(p.userId)
    if (!held || p.joinedAt < held.joinedAt) byUser.set(p.userId, p)
  }
  return [...byUser.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId))
}

/**
 * Build the presence state from a full sync snapshot (the authoritative shape
 * on every 'sync' event — replaces local state wholesale). Each entry is
 * keyed by the session key and carries that session's broadcast payload;
 * entries without a usable userId are skipped (never crash on a malformed
 * payload — realtime payloads come off the wire, so they are not ours to
 * trust, same rule as the store's postgres_changes dispatch).
 */
export function presenceFromSync(snap: Record<string, Record<string, unknown>>): PresenceState {
  const peers: PresencePeer[] = []
  for (const [sessionKey, meta] of Object.entries(snap ?? {})) {
    if (!meta || typeof meta !== 'object') continue
    const userId = typeof meta.userId === 'string' ? meta.userId : ''
    if (!userId) continue
    const name = typeof meta.name === 'string' && meta.name ? meta.name : userId
    const joined = Number(meta.joinedAt)
    peers.push({ sessionKey, userId, name, joinedAt: Number.isFinite(joined) ? joined : 0 })
  }
  return { peers: dedupeByUser(peers) }
}

/** The peers the UI shows: everyone except the caller's own session. */
export function visiblePeers(state: PresenceState, selfSessionKey: string): PresencePeer[] {
  return state.peers.filter(p => p.sessionKey !== selfSessionKey)
}

// ---------------- channel wrapper ----------------

/** The channel name for one trip's presence room. */
export function presenceChannelName(tripId: string): string {
  return `presence:${tripId}`
}

/** Opaque per-session identity that survives across join/leave/untrack. */
export function presenceKey(userId: string): string {
  return `${userId}:${Math.random().toString(36).slice(2, 10)}`
}

/** What this client broadcasts about itself on join. */
export function presencePayload(userId: string, name: string): Record<string, unknown> {
  return { userId, name, joinedAt: Date.now() }
}

export interface PresenceSession {
  /** Live channel, null when presence is not running (anon view, no trip). */
  channel: RealtimeChannel | null
  /** This session's own presence key (to filter self out of the UI). */
  selfKey: string
  /** Latest peer state, replaced on every remote sync event. */
  get: () => PresenceState
  /** Graceful leave: untrack + remove channel. Safe to call twice. */
  stop: () => void
}

/**
 * Join one trip's presence room. Callbacks receive the full peer state on
 * every sync/join/leave — the caller renders it, this module owns nothing
 * but the channel. Config is read at call time so tests and callers without
 * a backend get a no-op session (channel null) instead of a throw.
 */
export function joinTripPresence(
  client: SupabaseClient | null,
  tripId: string,
  identity: { userId: string; name: string },
  onState: (state: PresenceState) => void,
): PresenceSession {
  const selfKey = presenceKey(identity.userId)
  let state: PresenceState = EMPTY_PRESENCE
  const emit = () => onState(state)

  if (!client || !tripId || !identity.userId) {
    return { channel: null, selfKey, get: () => state, stop: () => {} }
  }

  const channel = client.channel(presenceChannelName(tripId), { config: { presence: { key: selfKey } } })
  channel
    .on('presence', { event: 'sync' }, () => {
      // supabase-js types presenceState() as Presence[] — structurally a
      // session-keyed record once keyed; cast through unknown (repo pattern:
      // structural casts for mapcn-style third-party shapes).
      state = presenceFromSync(channel.presenceState() as unknown as Record<string, Record<string, unknown>>)
      emit()
    })
    .subscribe(status => {
      // Join-track only once the channel is actually live — tracking on
      // SUBSCRIBING races the join and the server drops it silently.
      if (status !== 'SUBSCRIBED') return
      void channel.track(presencePayload(identity.userId, identity.name))
    })

  return {
    channel,
    selfKey,
    get: () => state,
    stop: () => {
      try {
        void channel.untrack()
      } catch { /* already gone */ }
      void client.removeChannel(channel)
    },
  }
}
