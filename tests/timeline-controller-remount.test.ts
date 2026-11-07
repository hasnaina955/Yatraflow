// ============ Hook mount/remount recovery (#08 F2) ============
// The real production hook runs against synthetic React hooks. The external
// Workspace-owned controller survives the simulated unmount; current config may
// be null while the captured operation remains recoverable.
import { describe, expect, it, vi } from 'vitest'
import { seedData } from '../src/data/seed'

let slots: unknown[] = []
let depSlots: unknown[][] = []
let index = 0
let pending: Array<() => void> = []

vi.mock('react', () => ({
  useMemo(fn: () => unknown, deps: unknown[]) {
    const i = index++
    if (!depSlots[i] || deps.some((v, k) => !Object.is(v, depSlots[i][k]))) {
      depSlots[i] = deps
      slots[i] = fn()
    }
    return slots[i]
  },
  useRef(initial: unknown) {
    const i = index++
    return slots[i] ?? (slots[i] = { current: initial })
  },
  useCallback(fn: unknown, deps: unknown[]) {
    const i = index++
    if (!depSlots[i] || deps.some((v, k) => !Object.is(v, depSlots[i][k]))) {
      depSlots[i] = deps
      slots[i] = fn
    }
    return slots[i]
  },
  useEffect(fn: () => void, deps: unknown[]) {
    const i = index++
    if (!depSlots[i] || deps.some((v, k) => !Object.is(v, depSlots[i][k]))) {
      depSlots[i] = deps
      pending.push(fn)
    }
  },
  useSyncExternalStore(_subscribe: unknown, get: () => unknown) {
    return get()
  },
}))

import { useTimelineProjectedWriter } from '../src/pages/trip/timeline/useTimelineProjectedWriter'
import { createTimelineWriterController } from '../src/pages/trip/timeline/timelineWriterController'
import type { TimelineProjectedWriterConfig } from '../src/pages/trip/timeline/timelineProjectedWriter'

const trip = seedData.trips[0]

function config(overrides: Partial<TimelineProjectedWriterConfig> = {}): TimelineProjectedWriterConfig {
  return {
    trip,
    applyChange: vi.fn(),
    resolvePick: vi.fn(async hit => hit),
    road: { routeKmOf: () => 10, road: { routeKey: 'rk' } },
    currentTrip: () => trip,
    onAcknowledged: vi.fn(),
    ...overrides,
  }
}

function render(configValue: TimelineProjectedWriterConfig | null, generation: number, controller: ReturnType<typeof createTimelineWriterController>, remount = false) {
  if (remount) { slots = []; depSlots = [] }
  index = 0
  pending = []
  const result = useTimelineProjectedWriter(configValue, false, generation, trip.id, controller)
  for (const effect of pending.splice(0)) effect()
  return result
}

describe('synthetic dispatcher retention (not store admission)', () => {
  it('retains Retry and unresolved with a null hop and invokes the original operation', async () => {
    const controller = createTimelineWriterController()
    const first = config()
    const result = render(first, 1, controller, true)
    const capture = controller.capture(first, { tripId: trip.id, identityGeneration: 1 })
    controller.bind(capture, 'op-remount')
    const ticket = {
      operationId: 'op-remount',
      context: { tripId: trip.id, dayId: trip.days[0]!.id, dayIndex: 0 },
      intent: 'single' as const,
      picks: [],
    }
    controller.settle(capture, {
      operationId: 'op-remount', context: { tripId: trip.id, dayId: 'd', dayIndex: 0 },
      phase: 'uncertain', acknowledged: false, receipt: null, placed: [], skipped: [], unresolved: [], retry: ticket,
    }, { tripId: trip.id, identityGeneration: 1 })
    expect(result.unresolved).toBe(false)

    // Remount with a null hop but the same Workspace-owned controller.
    const remounted = render(null, 1, controller, true)
    expect(remounted.retryAvailable).toBe(true)
    expect(remounted.unresolved).toBe(true)
    expect(remounted.retry).toBeTypeOf('function')
    const apply = first.applyChange as ReturnType<typeof vi.fn>
    remounted.retry?.()
    for (let n = 0; n < 20; n += 1) await Promise.resolve()
    const after = controller.getSnapshot()
    expect(Boolean(after.terminal || after.error)).toBe(true)
    expect(apply).not.toHaveBeenCalled()
  })

  it('retires the held ticket on an owner identity change', () => {
    const controller = createTimelineWriterController()
    const cfg = config()
    render(cfg, 1, controller, true)
    const capture = controller.capture(cfg, { tripId: trip.id, identityGeneration: 1 })
    controller.bind(capture, 'op-old')
    controller.settle(capture, {
      operationId: 'op-old', context: { tripId: trip.id, dayId: 'd', dayIndex: 0 },
      phase: 'uncertain', acknowledged: false, receipt: null, placed: [], skipped: [], unresolved: [],
      retry: {
        operationId: 'op-old',
        context: { tripId: trip.id, dayId: trip.days[0]!.id, dayIndex: 0 },
        intent: 'single',
        picks: [],
      },
    }, { tripId: trip.id, identityGeneration: 1 })
    const next = render(cfg, 2, controller)
    expect(next.retryAvailable).toBe(true) // this render read the pre-effect snapshot
    expect(controller.getSnapshot().ticket).toBeNull()
    expect(controller.hasUnresolved()).toBe(false)
  })
})
