// ============ Timeline covered-row writer hook (#08 R4/R8) ============
// Thin React adapter. The real add/retry loop lives in timelineWriterRunner and
// the ownership state in the pure controller, so node tests call the same code.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { JourneyRow } from '../../../lib/journeyProjection'
import type { TimelineProjectedWriterConfig } from './timelineProjectedWriter'
import { createTimelineWriterController } from './timelineWriterController'
import { runTimelineProjectedAdd, runTimelineProjectedRetry } from './timelineWriterRunner'

export interface TimelineProjectedWriter {
  add?: (row: JourneyRow, dayIndex: number) => void
  busy: boolean
  error: string | null
  terminal: string | null
  unresolved: boolean
  retryAvailable: boolean
  retry?: () => void
}

export function useTimelineProjectedWriter(
  config: TimelineProjectedWriterConfig | null,
  previewOpen: boolean,
  identityGeneration: number,
  ownerTripId?: string,
): TimelineProjectedWriter {
  const controller = useMemo(() => createTimelineWriterController(), [])
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const configRef = useRef(config)
  useEffect(() => { configRef.current = config }, [config])
  const ownerKeyRef = useRef<string | null>(null)

  // The live owner context is updated outside render. Async completion reads it
  // through the controller; the captured config still owns the callback.
  useEffect(() => {
    const ownerKey = `${ownerTripId ?? ''}|${identityGeneration}`
    if (ownerKeyRef.current !== null && ownerKeyRef.current !== ownerKey) controller.retireOwner()
    ownerKeyRef.current = ownerKey
    const current = configRef.current
    controller.setCurrentIdentity({
      tripId: ownerTripId ?? current?.currentTrip()?.id ?? '',
      identityGeneration,
    })
  }, [identityGeneration, ownerTripId, controller])

  const add = useCallback((row: JourneyRow, dayIndex: number) => {
    const current = configRef.current
    if (!current || previewOpen || controller.getSnapshot().busy || controller.currentTicket() || controller.hasUnresolved()) return
    void runTimelineProjectedAdd({ controller, config: current, row, dayIndex })
  }, [previewOpen, controller])

  const retry = useCallback(() => {
    const ticket = controller.currentTicket()
    if (!ticket || previewOpen || controller.getSnapshot().busy) return
    const captured = controller.capturedConfig(ticket.operationId) ?? configRef.current
    if (!captured) return
    void runTimelineProjectedRetry({ controller, config: captured })
  }, [previewOpen, controller])

  return {
    ...(config ? { add } : {}),
    busy: snapshot.busy,
    error: snapshot.error,
    terminal: snapshot.terminal,
    unresolved: snapshot.unresolved,
    retryAvailable: snapshot.ticket != null,
    ...(snapshot.ticket ? { retry } : {}),
  }
}
