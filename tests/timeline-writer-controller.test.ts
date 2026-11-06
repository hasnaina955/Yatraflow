// ============ Timeline lifecycle controller (#08 R4/R5) ============
// Direct controller calls: the same pure controller the production hook uses.
import { describe, expect, it, vi } from 'vitest'
import type { Trip } from '../src/data/types'
import type { WriterCompletion, WriterRetryTicket } from '../src/pages/trip/map/mapWriterActions'
import {
  ABANDONED_COPY,
  createTimelineWriterController,
  type TimelineIdentity,
} from '../src/pages/trip/timeline/timelineWriterController'
import type { TimelineProjectedWriterConfig } from '../src/pages/trip/timeline/timelineProjectedWriter'

const trip = { id: 'trip-a' } as Trip
const identity: TimelineIdentity = { tripId: 'trip-a', identityGeneration: 1 }

function completion(overrides: Partial<WriterCompletion> = {}): WriterCompletion {
  return {
    operationId: 'op-1', context: { tripId: 'trip-a', dayId: 'day-a', dayIndex: 0 },
    phase: 'applied', acknowledged: true, receipt: null, placed: [], skipped: [], unresolved: [],
    ...overrides,
  }
}

function config(overrides: Partial<TimelineProjectedWriterConfig> = {}): TimelineProjectedWriterConfig {
  return {
    trip, applyChange: () => {}, resolvePick: async h => h,
    road: { routeKmOf: () => 1, road: { routeKey: 'rk' } },
    currentTrip: () => trip, onAcknowledged: vi.fn(),
    ...overrides,
  }
}

function bound(controller: ReturnType<typeof createTimelineWriterController>, cfg: TimelineProjectedWriterConfig) {
  const capture = controller.capture(cfg, identity)
  controller.bind(capture, 'op-1')
  return capture
}

describe('captured operation completion', () => {
  it('delivers a valid ack once to the captured hop even when a newer hop exists', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const b = config()
    const capture = bound(controller, a)
    controller.settle(capture, completion({ placed: [{ itemId: 'i', dayId: 'day-a', stopId: 's' }] as never }), identity)
    expect(a.onAcknowledged).toHaveBeenCalledTimes(1)
    expect(b.onAcknowledged).not.toHaveBeenCalled()
    controller.settle(capture, completion({ placed: [{ itemId: 'i', dayId: 'day-a', stopId: 's' }] as never }), identity)
    expect(a.onAcknowledged).toHaveBeenCalledTimes(1)
  })

  it('ignores a foreign identity without notifying the new owner', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const capture = bound(controller, a)
    controller.settle(capture, completion({ placed: [{ itemId: 'i', dayId: 'day-a', stopId: 's' }] as never }), {
      tripId: 'trip-a', identityGeneration: 2,
    })
    expect(a.onAcknowledged).not.toHaveBeenCalled()
  })

  it('turns one abandoned event terminal and ignores a late ack', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const capture = bound(controller, a)
    const ticket = { operationId: 'op-1' } as WriterRetryTicket
    controller.settle(capture, completion({ acknowledged: false, phase: 'uncertain', retry: ticket }), identity)
    expect(controller.getSnapshot().ticket).toBe(ticket)
    controller.settle(capture, completion({ acknowledged: false, phase: 'abandoned' }), identity)
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(controller.getSnapshot().terminal).toBe(ABANDONED_COPY)
    controller.settle(capture, completion({ placed: [{ itemId: 'i', dayId: 'day-a', stopId: 's' }] as never }), identity)
    expect(a.onAcknowledged).not.toHaveBeenCalled()
  })

  it('keeps unresolved admission after a terminal retry refusal clears the ticket', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const capture = bound(controller, a)
    const ticket = { operationId: 'op-1' } as WriterRetryTicket
    controller.settle(capture, completion({ acknowledged: false, phase: 'uncertain', retry: ticket }), identity)
    controller.terminal('The saved trip changed after Keep; this retry cannot replay. Check Saved edits.')
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(controller.hasUnresolved()).toBe(true)
    expect(controller.capturedConfig('op-1')).toBe(a)
  })

  it('does not let an older capture overwrite a newer operation state', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const b = config()
    const captureA = controller.capture(a, identity)
    controller.bind(captureA, 'op-a')
    const captureB = controller.capture(b, identity)
    controller.bind(captureB, 'op-b')
    const bTicket = { operationId: 'op-b' } as WriterRetryTicket
    controller.settle(captureB, completion({ operationId: 'op-b', acknowledged: false, phase: 'uncertain', retry: bTicket }), identity)
    controller.settle(captureA, completion({ operationId: 'op-a', placed: [{ itemId: 'i', dayId: 'day-a', stopId: 's' }] as never }), identity)
    expect(a.onAcknowledged).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().ticket).toBe(bTicket)
    controller.settle(captureA, completion({ operationId: 'op-a', acknowledged: false, phase: 'uncertain', retry: { operationId: 'op-a' } as WriterRetryTicket }), identity)
    expect(controller.getSnapshot().ticket).toBe(bTicket)
  })

  it('keeps an older unresolved ticket when a newer operation acks', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const b = config()
    const captureA = controller.capture(a, identity)
    controller.bind(captureA, 'op-a')
    const aTicket = { operationId: 'op-a' } as WriterRetryTicket
    controller.settle(captureA, completion({ operationId: 'op-a', acknowledged: false, phase: 'uncertain', retry: aTicket }), identity)
    expect(controller.getSnapshot().ticket).toBe(aTicket)
    const captureB = controller.capture(b, identity)
    controller.bind(captureB, 'op-b')
    controller.settle(captureB, completion({ operationId: 'op-b', placed: [{ itemId: 'i', dayId: 'day-a', stopId: 's' }] as never }), identity)
    expect(controller.getSnapshot().ticket).toBe(aTicket)
    expect(controller.hasUnresolved()).toBe(true)
  })

  it('keeps an older unresolved ticket when a newer operation is uncertain', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const b = config()
    const captureA = controller.capture(a, identity)
    controller.bind(captureA, 'op-a')
    const aTicket = { operationId: 'op-a' } as WriterRetryTicket
    controller.settle(captureA, completion({ operationId: 'op-a', acknowledged: false, phase: 'uncertain', retry: aTicket }), identity)
    const captureB = controller.capture(b, identity)
    controller.bind(captureB, 'op-b')
    controller.settle(captureB, completion({ operationId: 'op-b', acknowledged: false, phase: 'uncertain', retry: { operationId: 'op-b' } as WriterRetryTicket }), identity)
    expect(controller.getSnapshot().ticket).toBe(aTicket)
  })

  it('retires the previous owner ticket and unresolved state on an identity change', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const capture = bound(controller, a)
    controller.settle(capture, completion({ acknowledged: false, phase: 'uncertain', retry: { operationId: 'op-1' } as WriterRetryTicket }), identity)
    expect(controller.getSnapshot().ticket).not.toBeNull()
    controller.retireOwner()
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(controller.hasUnresolved()).toBe(false)
    expect(controller.getSnapshot().terminal).toBeNull()
  })

  it('keeps a partial ack unresolved and applies each verified stop once', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const capture = bound(controller, a)
    const ticket = { operationId: 'op-1' } as WriterRetryTicket
    const s1 = { itemId: 'i1', dayId: 'day-a', stopId: 's1', hit: { id: 'h1', name: 'A', latitude: 10, longitude: 76, kind: 'poi' } }
    const s2 = { itemId: 'i2', dayId: 'day-a', stopId: 's2', hit: { id: 'h2', name: 'B', latitude: 10.1, longitude: 76.1, kind: 'poi' } }
    controller.settle(capture, completion({ placed: [s1] as never, phase: 'partial', retry: ticket }), identity)
    expect(controller.getSnapshot().ticket).toBe(ticket)
    expect(controller.hasUnresolved()).toBe(true)
    expect(a.onAcknowledged).toHaveBeenCalledTimes(1)
    expect((vi.mocked(a.onAcknowledged).mock.calls[0]?.[0] as WriterCompletion).placed).toHaveLength(1)
    controller.settle(capture, completion({ placed: [s1, s2] as never }), identity)
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(controller.hasUnresolved()).toBe(false)
    expect(a.onAcknowledged).toHaveBeenCalledTimes(2)
    expect((vi.mocked(a.onAcknowledged).mock.calls[1]?.[0] as WriterCompletion).placed.map(p => p.stopId)).toEqual(['s2'])
  })

  it('uses the live identity set by the adapter, not the capture identity', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const capture = bound(controller, a)
    controller.setCurrentIdentity({ tripId: 'trip-a', identityGeneration: 2 })
    controller.settle(capture, completion({ placed: [{ itemId: 'i', dayId: 'day-a', stopId: 's' }] as never }), controller.currentIdentity())
    expect(a.onAcknowledged).not.toHaveBeenCalled()
  })

  it('keeps a captured ack when the live trip id is empty (hop unavailable)', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const capture = bound(controller, a)
    controller.settle(capture, completion({ placed: [{ itemId: 'i', dayId: 'day-a', stopId: 's' }] as never }), {
      tripId: '', identityGeneration: 1,
    })
    expect(a.onAcknowledged).toHaveBeenCalledTimes(1)
  })

  it('suppresses a captured ack for a different non-empty trip', () => {
    const controller = createTimelineWriterController()
    const a = config()
    const capture = bound(controller, a)
    controller.settle(capture, completion({ placed: [{ itemId: 'i', dayId: 'day-a', stopId: 's' }] as never }), {
      tripId: 'trip-b', identityGeneration: 1,
    })
    expect(a.onAcknowledged).not.toHaveBeenCalled()
  })
})
