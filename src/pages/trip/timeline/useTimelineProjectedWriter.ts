// ============ Timeline covered-row writer hook (#08 S4 repair) ============
// One hook around `stageProjectedRow`. It owns a synchronous busy latch so a
// same-tick second click cannot stage twice, refuses while the workspace preview
// is open, keeps the real uncertain retry ticket, and reports truthful failures.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { JourneyRow } from '../../../lib/journeyProjection'
import type { WriterCompletion, WriterRetryTicket } from '../map/mapWriterActions'
import {
  retryProjectedRow,
  stageProjectedRow,
  type TimelineProjectedRefusal,
  type TimelineProjectedWriterConfig,
} from './timelineProjectedWriter'

export interface TimelineProjectedWriter {
  /** Undefined when the Workspace/Map owner has not supplied the writer hop. */
  add?: (row: JourneyRow, dayIndex: number) => void
  busy: boolean
  error: string | null
  /** True only while a real uncertain ticket is held. */
  retryAvailable: boolean
  retry?: () => void
}

const REFUSAL_COPY: Record<TimelineProjectedRefusal | string, string> = {
  'invalid-row': 'This place has no usable day or map position.',
  'current-trip-unavailable': 'The current saved trip is not available, so nothing was added.',
  'foreign-trip': 'This row belongs to another trip, so nothing was added.',
  'mismatched-day': 'This row does not match the current day or slot, so nothing was added.',
  'gate-busy': 'Another save is already in progress.',
  'road-evidence-unavailable': 'The measured road cannot place this stop, so nothing was added.',
  'no-placements': 'The measured road did not accept this stop.',
  'nothing-pinned': 'The place could not be pinned on the map, so nothing was added.',
}

export function useTimelineProjectedWriter(
  config: TimelineProjectedWriterConfig | null,
  previewOpen: boolean,
): TimelineProjectedWriter {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticket, setTicket] = useState<WriterRetryTicket | null>(null)
  const busyRef = useRef(false)
  const configRef = useRef(config)
  useEffect(() => { configRef.current = config }, [config])

  const handleCompletion = useCallback((completion: WriterCompletion) => {
    const hop = configRef.current
    if (!hop) return
    if (completion.acknowledged && completion.placed.length > 0) {
      setTicket(null)
      setError(null)
      hop.onAcknowledged(completion)
      return
    }
    if (completion.retry) {
      setTicket(completion.retry)
      hop.onUncertain?.(completion)
      setError('The save is not confirmed yet. Retry to resend the same write.')
      return
    }
    setError('The place was not saved.')
  }, [])

  const add = useCallback((row: JourneyRow, dayIndex: number) => {
    const current = configRef.current
    if (!current || previewOpen || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    void stageProjectedRow(current, row, dayIndex, handleCompletion)
      .then(result => {
        if (result.status === 'refused') setError(REFUSAL_COPY[result.reason] ?? 'The place was not added.')
      })
      .catch(() => setError('The save could not start. Nothing was added.'))
      .finally(() => {
        busyRef.current = false
        setBusy(false)
      })
  }, [previewOpen, handleCompletion])

  const retry = useCallback(() => {
    const current = configRef.current
    if (!current || !ticket || busyRef.current || previewOpen) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    void retryProjectedRow(current, ticket, handleCompletion)
      .then(result => {
        if (result.status === 'refused') setError(REFUSAL_COPY[result.reason] ?? 'The retry did not start.')
      })
      .catch(() => setError('The retry failed. The write is still unconfirmed.'))
      .finally(() => {
        busyRef.current = false
        setBusy(false)
      })
  }, [ticket, previewOpen, handleCompletion])

  return {
    ...(config ? { add } : {}),
    busy,
    error,
    retryAvailable: ticket != null,
    ...(config && ticket ? { retry } : {}),
  }
}
