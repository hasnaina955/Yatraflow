// ============ Production Timeline add/retry runner (#08 R4/R8) ============
// The actual orchestration the hook calls. It is a plain function over the pure
// controller and the real stage/retry service, so a node test can drive the same
// loop with the real workspace/store without a React mount.
import type { JourneyRow } from '../../../lib/journeyProjection'
import {
  CURRENT_TRIP_UNAVAILABLE_COPY,
  writerResumePresentation,
} from '../map/writerResumeDisposition'
import {
  retryProjectedRow,
  stageProjectedRow,
  type TimelineProjectedWriterConfig,
} from './timelineProjectedWriter'
import type { TimelineWriterController } from './timelineWriterController'

const REFUSAL_COPY: Record<string, string> = {
  'invalid-row': 'This place has no usable day or map position.',
  'current-trip-unavailable': 'The current saved trip is not available, so nothing was added.',
  'foreign-trip': 'This row belongs to another trip, so nothing was added.',
  'mismatched-day': 'This row does not match the current day or slot, so nothing was added.',
  'gate-busy': 'Another save is already in progress.',
  'road-evidence-unavailable': 'The measured road cannot place this stop, so nothing was added.',
  'no-placements': 'The measured road did not accept this stop.',
  'nothing-pinned': 'The place could not be pinned on the map, so nothing was added.',
}

export async function runTimelineProjectedAdd(input: {
  controller: TimelineWriterController
  config: TimelineProjectedWriterConfig
  row: JourneyRow
  dayIndex: number
}): Promise<void> {
  const { controller, config, row, dayIndex } = input
  if (controller.currentTicket() || controller.hasUnresolved()) {
    controller.refuse('Resolve the unconfirmed save before adding another place.')
    return
  }
  const current = controller.currentIdentity()
  const capture = controller.capture(config, {
    tripId: current.tripId || config.currentTrip()?.id || '',
    identityGeneration: current.identityGeneration,
  })
  controller.begin()
  try {
    const result = await stageProjectedRow(
      capture.config,
      row,
      dayIndex,
      completion => controller.settle(capture, completion, controller.currentIdentity()),
      operationId => controller.bind(capture, operationId),
    )
    if (result.status === 'refused') controller.refuse(REFUSAL_COPY[result.reason] ?? 'The place was not added.')
  } catch {
    controller.refuse('The save could not start. Nothing was added.')
  } finally {
    controller.finish()
  }
}

export async function runTimelineProjectedRetry(input: {
  controller: TimelineWriterController
  config: TimelineProjectedWriterConfig
}): Promise<void> {
  const { controller, config } = input
  const ticket = controller.currentTicket()
  if (!ticket) return
  const current = controller.currentIdentity()
  const capture = controller.capture(config, {
    tripId: current.tripId || config.currentTrip()?.id || '',
    identityGeneration: current.identityGeneration,
  })
  controller.begin()
  try {
    const result = await retryProjectedRow(
      capture.config,
      ticket,
      completion => controller.settle(capture, completion, controller.currentIdentity()),
      operationId => controller.bind(capture, operationId),
    )
    if (result.status === 'refused') {
      const d = result.resume?.disposition
      if (d) {
        const presentation = writerResumePresentation(d)
        if (presentation.terminal) controller.terminal(presentation.text)
        else controller.refuse(presentation.text)
      } else if (result.reason === 'current-trip-unavailable') {
        controller.refuse(CURRENT_TRIP_UNAVAILABLE_COPY)
      } else {
        controller.refuse(REFUSAL_COPY[result.reason] ?? 'The retry did not start.')
      }
    }
  } catch {
    controller.refuse('The retry failed. The write is still unconfirmed.')
  } finally {
    controller.finish()
  }
}
