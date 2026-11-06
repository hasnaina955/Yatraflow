// ============ #841 — the hooks call the exported factories ============
//
// A correct helper can hide an incorrect wiring: the page can keep its old
// closures while a new tested module sits unused. These source checks pin the
// actual call sites, because the hooks cannot run in the node test environment
// (they need React). They are tripwires, not behaviour tests: the behaviour is
// in tests/map-writer-operations-841.test.ts.
//
// They also pin the boundary this wave did NOT cross: MapTab is not edited here.
// The new deps are OPTIONAL on the hooks, so MapTab keeps compiling until its
// own Sonnet wiring lease passes the measured-road grade, the presence identity
// and the stable manual picks.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const writers = read('../src/pages/trip/map/useMapWriters.ts')
const shortlist = read('../src/pages/trip/map/useShortlist.ts')
const filing = read('../src/pages/trip/map/useSlotSearch.ts')
const gate = read('../src/pages/trip/map/writerOperationGate.ts')
const mapTab = read('../src/pages/trip/MapTab.tsx')
const dayPlan = read('../src/lib/dayPlan.ts')

describe('#841 writer hooks use the exported action factories', () => {
  it('the writers hook stages through the shared factory, not a local placement path', () => {
    expect(writers).toContain("from './mapWriterActions'")
    expect(writers).toContain('stageWriterPicks(')
    expect(writers).toContain('guardedUndo(')
    expect(writers).toContain('acknowledgedStopsFrom(')
    // The old fillSlot undo deleted by id straight into the store, without the
    // acknowledged stop or a content check.
    expect(writers).not.toContain('deleteStop(')
    // No second road-order comparator in the hook.
    expect(writers).not.toMatch(/\.sort\(\(a, b\) =>\s*\(routeKmOf/)
  })

  it('the writers hook reads ONE effective plan for the single, batch and vote paths', () => {
    expect(writers).toContain('buildDayPlanForDay(')
    expect(writers).toContain('readManualPicksForDay(')
    expect(writers).toContain('batchSelection(')
    expect(writers).toContain('voteSelection(')
    expect(writers).toContain('effectiveDaySlotOf(')
    expect(writers).not.toContain('mergeSlotCandidates(')
  })

  it('the writers hook keeps the resolve-or-prompt guard and the pinned vote payload', () => {
    expect(writers).toContain('resolvePick(c.hit)')
    expect(writers).toContain('usable.length < 2')
    expect(writers).toContain('was not created')
    expect(writers).toMatch(/lat:\s*pinned\.latitude/)
    expect(writers).toMatch(/lng:\s*pinned\.longitude/)
    expect(writers).not.toMatch(/lat:\s*c\.hit\.latitude/)
    expect(writers).toContain('buildSlotVoteOption(')
    expect(writers).toContain('createSlotVoteRequest(')
  })

  it('the writers hook defaults its entry to the shared workspace gate', () => {
    expect(writers).toContain('operationGate = mapWriterOperationGate')
    expect(writers).toContain('writerContextFor(')
    expect(shortlist).toContain('operationGate = mapWriterOperationGate')
  })

  it('the shortlist hook places through the same factory and keeps unverified places', () => {
    expect(shortlist).toContain("from './mapWriterActions'")
    expect(shortlist).toContain('stageWriterPicks(')
    expect(shortlist).toContain('guardedUndo(')
    expect(shortlist).toContain('acknowledgedStopsFrom(')
    expect(shortlist).toContain('orderByRoad(trayShortlist, routeKmOf)')
    expect(shortlist).toContain('isSameEntity(')
    // The pre-repair fallback put an unpositionable place on Day 1.
    expect(shortlist).not.toContain('dayForKm(hit.cumKm) ?? 0')
    expect(shortlist).not.toContain('dayForKm(h.cumKm) ?? 0')
  })

  it('the filing hook binds a pick to the stable trip + day + slot context', () => {
    expect(filing).toContain("from './manualSlotContexts'")
    expect(filing).toContain('manualContextForSlot(slot)')
    expect(filing).toContain('MANUAL_SLOT_REFUSAL')
    expect(filing).toContain('store.file(context, h)')
  })
})

describe('#841 hook surface stays compatible for the MapTab lease', () => {
  it('the new writer inputs are optional, so MapTab mounts unchanged', () => {
    for (const dep of ['dayId?: string | null', 'presence?: PlaceIdentity', 'slotManual?: Record<string, PlaceHit[]>', 'roadMeasured?: boolean', 'routeKey?: string', 'operationGate?: WriterOperationGate']) {
      expect(writers, `the hook lost its optional ${dep} input`).toContain(dep)
    }
    // The four outputs the page mounts are unchanged.
    for (const output of ['addPoiToDay', 'fillSlot', 'fillTheDay', 'raiseSlotVote']) {
      expect(writers).toContain(output)
    }
    // The page still mounts the hook; the additive `dayPlan` return is the only
    // new binding the Sonnet MapTab lease may add.
    expect(mapTab).toContain('useMapWriters({')
    for (const output of ['addPoiToDay', 'fillSlot', 'fillTheDay', 'raiseSlotVote']) {
      expect(mapTab).toContain(output)
    }
  })

  it('the writers hook returns the additive effective day plan for MapTab', () => {
    expect(writers).toContain('dayPlan: DayPlan')
    expect(writers).toContain('dayPlan: displayDayPlan ?? planForDay()')
    // The return value and every action read the SAME producer.
    expect(writers.match(/planForDay\(\)/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('the shortlist hook keeps its existing surface and required inputs', () => {
    for (const dep of ['tripId: trip.id', 'identity', 'resolvePick', 'applyChange', 'setAddedIds', 'newStopId', 'dayForKm', 'poiVisitMinutes', 'routeKmOf', 'detourMinFor', 'busy: addingAny', 'setBusy: setAddingAny']) {
      expect(mapTab).toContain(dep)
    }
    for (const output of ['addShortlisted', 'raiseShortlistVote', 'toggleShortlist', 'clearShortlist']) {
      expect(shortlist).toContain(output)
    }
  })

  it('the acknowledged callback contract is the workspace definition, not a local invention', () => {
    for (const source of [writers, shortlist]) {
      expect(source).toContain("import type { ApplyChange } from '../../../lib/mutationLifecycle'")
      expect(source).toContain('applyChange: ApplyChange')
    }
    // The factory is the one call site that passes the optional fifth argument
    // and the operation-owned discard callback.
    const actions = read('../src/pages/trip/map/mapWriterActions.ts')
    expect(actions).toContain('onDiscard: () =>')
    expect(actions).toContain('id: operationId')
    expect(actions).toContain('deps.applyChange(')
    expect(shortlist).toContain('onCompletion: completion =>')
  })

  it('the effective slot keeps the complete DaySlot metadata for live callers', () => {
    for (const field of ['source: DaySlot', 'segment: DaySlot[\'segment\']', 'windowMin: DaySlot[\'windowMin\']', 'filledStop: DaySlot[\'filledStop\']', 'drift: DaySlot[\'drift\']', 'urgencyMin: DaySlot[\'urgencyMin\']']) {
      expect(dayPlan, `the adapter lost ${field}`).toContain(field)
    }
    expect(dayPlan).toContain('export function effectiveDaySlotOf(')
    expect(dayPlan).toContain('export function daySlotOf(')
  })
})

describe('#841 repair invariants at the owned call sites', () => {
  it('an uncertain Undo never claims the plan was not changed', () => {
    // The inverse may already be in the local cache. The copy must say the
    // result is unconfirmed and point at Saved edits, not promise no change.
    for (const source of [writers, shortlist]) {
      expect(source).not.toContain('The plan was not changed')
      expect(source).toContain('Saved edits')
    }
  })

  it('the operation id uses the platform CSPRNG helper, never Math.random', () => {
    expect(gate).toContain("from '../../../lib/randomId'")
    expect(gate).toContain('randomToken(')
    expect(gate).not.toContain('Math.random')
  })

  it('a refusal after planning is never reported as staged success', () => {
    const actions = read('../src/pages/trip/map/mapWriterActions.ts')
    expect(actions).toContain('applyPlannedStops(')
    expect(actions).toContain('apply: { reason:')
    expect(actions).toContain("reason: 'missing-anchor'")
    // A discarded operation's late kept callback must not complete.
    expect(actions).toContain("phase === 'discarded'")
    // The hooks tell the user why an actual-draft refusal differed.
    expect(writers).toContain('result.apply')
    expect(shortlist).toContain('result.apply')
  })
})

// ---- F1/F2/F3/F5 contract fixes (independent writer review) ----

describe('#841 writer contract fixes at the owned call sites', () => {
  it('the direct add stages through the shared factory and never splices locally', () => {
    // F5: addPoiToDay rides the same stageWriterPicks pipeline as the other
    // writers. There is no second placement path left in the hook.
    expect(writers.match(/stageWriterPicks\(/g)?.length).toBeGreaterThanOrEqual(2)
    expect(writers).not.toContain('applyChange(')
    expect(writers).not.toMatch(/day\.stops\.splice\(|day\.stops\.push\(/)
    // The verified success copy exists only inside the Undo surface; staging
    // alone never says "added".
    expect(writers.match(/added to Day/g)?.length).toBe(1)
  })

  it('no hook reports an acknowledged-but-unverified write as a landed save', () => {
    // F3: a valid receipt with zero verified stops keeps its truthful copy.
    for (const source of [writers, shortlist]) {
      expect(source).not.toContain('The save landed')
      expect(source).toContain('ZERO_VERIFIED_SAVE_MESSAGE')
    }
  })

  it('the hooks speak the precise resume dispositions', () => {
    // F2: a changed request under an uncertain operation is a distinct
    // boundary, and an unverifiable retry points at Saved edits recovery.
    for (const source of [writers, shortlist]) {
      expect(source).toContain('payload-changed')
      expect(source).toContain('resume-unverifiable')
      expect(source).toContain('already-in-plan')
    }
  })
})
