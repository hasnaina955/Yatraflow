// ============ Trip presence hook (M6 · B1) ============
// Joins `presence:<tripId>` while the trip workspace shows the trip and
// exposes the crew members currently viewing it. Pure state lives in
// lib/presence.ts (node-tested); this hook is only lifecycle + render glue.
import { useEffect, useRef, useState } from 'react'
import { presenceClient } from '../store/store'
import {
  joinTripPresence, visiblePeers, EMPTY_PRESENCE,
  type PresencePeer, type PresenceSession,
} from '../lib/presence'

export interface useTripPresenceResult {
  /** Crew members (not this session) currently viewing the trip. */
  peers: PresencePeer[]
  /** True once the channel has gone live at least once — distinguishes
   *  "nobody else here" from "presence not connected". */
  connected: boolean
}

/**
 * @param tripId  trip whose presence room to join (null = stay out)
 * @param self    the signed-in viewer (null on anon/public views — no presence)
 * @param name    display name broadcast to the room
 */
export function useTripPresence(tripId: string | null, self: { id: string } | null, name: string): useTripPresenceResult {
  const [peers, setPeers] = useState<PresencePeer[]>([])
  const [connected, setConnected] = useState(false)
  // Hold the session in a ref so cleanup always stops the SAME session that
  // was opened, even if the effect re-runs mid-flight.
  const sessionRef = useRef<PresenceSession | null>(null)

  useEffect(() => {
    // Anon/public views never join: presence is a crew surface.
    if (!tripId || !self?.id) return
    const session = joinTripPresence(presenceClient(), tripId, { userId: self.id, name }, state => {
      setPeers(visiblePeers(state, session.selfKey).map(p => ({ ...p })))
    })
    sessionRef.current = session
    setConnected(session.channel !== null)
    return () => {
      session.stop()
      sessionRef.current = null
      setPeers([])
      setConnected(false)
    }
  }, [tripId, self?.id, name])

  return { peers, connected: sessionRef.current?.channel != null && connected }
}

/** Convenience export for tests/storybook. */
export { EMPTY_PRESENCE }
