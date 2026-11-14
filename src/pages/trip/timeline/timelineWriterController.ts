// ============ Timeline operation lifecycle controller (#08 R4/R5) ============
// Pure, React-free per-hook controller. Each add/retry captures its hop, trip and
// identity BEFORE the first await. The writer's synchronous onOperationStart binds
// the operation id after gate admission and before any resolver. Completion is
// delivered to that captured record only; a new hop, null config or foreign
// identity can never steal an ack, error or retry ticket.
import type { WriterCompletion, WriterRetryTicket } from '../map/mapWriterActions'
import type { TimelineProjectedWriterConfig } from './timelineProjectedWriter'

export interface TimelineIdentity {
  tripId: string
  identityGeneration: number
}

export interface TimelineOperationCapture {
  config: TimelineProjectedWriterConfig
  tripId: string
  identityGeneration: number
  operationId: string | null
  done: boolean
}

export interface TimelineLifecycleSnapshot {
  busy: boolean
  error: string | null
  ticket: WriterRetryTicket | null
  terminal: string | null
  /** True while any admitted operation is still unresolved, even if its visible
   *  ticket was retired by a terminal retry refusal. Cleared only by a real ack
   *  or proven discard. */
  unresolved: boolean
}

type Listener = () => void

export interface TimelineWriterController {
  subscribe: (listener: Listener) => () => void
  getSnapshot: () => TimelineLifecycleSnapshot
  capture: (config: TimelineProjectedWriterConfig, identity: TimelineIdentity) => TimelineOperationCapture
  bind: (capture: TimelineOperationCapture, operationId: string) => void
  settle: (capture: TimelineOperationCapture, completion: WriterCompletion, current: TimelineIdentity) => void
  begin: () => void
  finish: () => void
  refuse: (message: string) => void
  terminal: (message: string) => void
  currentTicket: () => WriterRetryTicket | null
  hasUnresolved: () => boolean
  capturedConfig: (operationId: string) => TimelineProjectedWriterConfig | null
  retireOwner: () => void
  /** Stable live owner context, updated by the React adapter in an effect. */
  setCurrentIdentity: (identity: TimelineIdentity) => void
  currentIdentity: () => TimelineIdentity
}

export const ABANDONED_COPY = 'This saved edit was discarded; choose again.'

export function createTimelineWriterController(): TimelineWriterController {
  let snapshot: TimelineLifecycleSnapshot = { busy: false, error: null, ticket: null, terminal: null, unresolved: false }
  const listeners = new Set<Listener>()
  let active: { capture: TimelineOperationCapture; operationId: string } | null = null
  let liveIdentity: TimelineIdentity = { tripId: '', identityGeneration: 0 }
  const captures = new Map<string, TimelineOperationCapture>()
  const unresolvedOps = new Set<string>()
  const acknowledgedOps = new Set<string>()
  const appliedStops = new Set<string>()

  const publish = (next: Partial<TimelineLifecycleSnapshot>) => {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }
  const completedOperation = (operationId: string) => {
    unresolvedOps.delete(operationId)
    captures.delete(operationId)
  }
  /** Only stops not already applied by this operation reach the effect callback. */
  const freshCompletion = (completion: WriterCompletion): WriterCompletion | null => {
    const fresh = completion.placed.filter(item => !appliedStops.has(item.stopId))
    if (fresh.length === 0) return null
    for (const item of fresh) appliedStops.add(item.stopId)
    return { ...completion, placed: fresh }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => snapshot,
    capture(config, identity) {
      return {
        config,
        tripId: identity.tripId,
        identityGeneration: identity.identityGeneration,
        operationId: null,
        done: false,
      }
    },
    bind(capture, operationId) {
      capture.operationId = operationId
      captures.set(operationId, capture)
      active = { capture, operationId }
    },
    settle(capture, completion, current) {
      if (capture.done) return
      // A completion belongs to the operation that started it. A foreign
      // operation id can never settle this capture.
      if (!capture.operationId || completion.operationId !== capture.operationId) return
      const isActive = active?.operationId === completion.operationId
      // A foreign trip/identity retires the old owner silently. An EMPTY live
      // trip id means the road hop is unavailable, not that the owner changed;
      // the captured operation still owns its valid late acknowledgement.
      const foreignTrip = current.tripId !== '' && current.tripId !== capture.tripId
      const foreignIdentity = current.identityGeneration !== capture.identityGeneration
      if (foreignTrip || foreignIdentity) {
        capture.done = true
        if (isActive) {
          active = null
          unresolvedOps.delete(completion.operationId)
          publish({ busy: false, ticket: null, error: null, terminal: null, unresolved: unresolvedOps.size > 0 })
        }
        return
      }
      if (completion.phase === 'abandoned') {
        capture.done = true
        completedOperation(completion.operationId)
        if (isActive) {
          active = null
          publish({ busy: false, ticket: null, error: null, terminal: ABANDONED_COPY, unresolved: unresolvedOps.size > 0 })
        }
        return
      }
      if (completion.acknowledged && completion.phase === 'partial') {
        // A partial Kept save confirms only some stops. The operation is still
        // unresolved in the gate; keep its ticket/reservation and its active
        // record so a later full ack can clear it. Effects run once per stop.
        unresolvedOps.add(completion.operationId)
        acknowledgedOps.add(completion.operationId)
        if (isActive) {
          publish({
            ticket: completion.retry ?? snapshot.ticket,
            error: 'Part of the save was confirmed. The remaining stops still need recovery.',
            terminal: null,
            unresolved: true,
          })
        }
        const fresh = freshCompletion(completion)
        if (fresh) capture.config.onAcknowledged(fresh)
        return
      }
      if (completion.acknowledged && completion.placed.length > 0) {
        capture.done = true
        acknowledgedOps.delete(completion.operationId)
        completedOperation(completion.operationId)
        if (isActive) {
          active = null
          const held = snapshot.ticket
          if (!held || held.operationId === completion.operationId) {
            publish({ ticket: null, error: null, terminal: null, unresolved: unresolvedOps.size > 0 })
          } else {
            publish({ error: null, terminal: null, unresolved: unresolvedOps.size > 0 })
          }
        }
        const fresh = freshCompletion(completion)
        if (fresh) capture.config.onAcknowledged(fresh)
        return
      }
      if (completion.retry) {
        // Only the active operation may publish a visible ticket or uncertain
        // copy. An older capture can receive its own callback without stealing
        // the newer operation's UI state. A new operation cannot replace an
        // older unresolved ticket.
        if (isActive) {
          unresolvedOps.add(completion.operationId)
          const held = snapshot.ticket
          if (!held || held.operationId === completion.operationId) {
            publish({ ticket: completion.retry, error: 'The save is not confirmed yet. Retry to resend the same write.', unresolved: true })
            capture.config.onUncertain?.(completion)
          } else {
            publish({ error: 'Another save is still unconfirmed. Resolve it before this one.', unresolved: true })
          }
        }
        return
      }
      if (isActive) {
        active = null
        publish({ busy: false, error: 'The place was not saved.' })
      }
    },
    begin: () => publish({ busy: true, error: null, terminal: null }),
    finish: () => publish({ busy: false }),
    refuse: message => publish({ busy: false, error: message }),
    terminal: message => publish({ busy: false, error: null, ticket: null, terminal: message }),
    currentTicket: () => snapshot.ticket,
    hasUnresolved: () => snapshot.unresolved,
    capturedConfig: operationId => captures.get(operationId)?.config ?? null,
    retireOwner: () => {
      active = null
      unresolvedOps.clear()
      captures.clear()
      publish({ busy: false, ticket: null, error: null, terminal: null, unresolved: false })
    },
    setCurrentIdentity: identity => { liveIdentity = identity },
    currentIdentity: () => liveIdentity,
  }
}
