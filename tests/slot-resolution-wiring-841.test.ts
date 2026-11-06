import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source pins for every hop of the Group input slot-resolution context.
// Each pin has a negative control: removing its marker must break the pin.
// These checks fail on the known-bad wiring, not only on a missing helper.
const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const workspace = read('src/pages/TripWorkspace.tsx')
const group = read('src/pages/trip/GroupInputTab.tsx')
const adapter = read('src/pages/trip/slotResolutionAdapter.ts')

function assertLivePin(label: string, source: string, pattern: RegExp, marker: string) {
  expect(source, `${label}: live source`).toMatch(pattern)
  expect(source, `${label}: marker present`).toContain(marker)
  const dropped = source.replace(marker, '')
  expect(dropped, `${label}: negative control`).not.toMatch(pattern)
}

describe('#841 slot-resolution context reaches the production caller', () => {
  it('TripWorkspace builds the context from the COMMITTED trip', () => {
    assertLivePin('workspace builds context', workspace,
      /\{\s*trip,\s*road:\s*slotResolutionRoadFor\(trip,\s*road\)\s*\}/,
      'slotResolutionRoadFor(trip, road)')
    expect(workspace, 'the staged draft is not the resolution trip').not.toMatch(/slotResolutionRoadFor\(effective/)
  })

  it('TripWorkspace memoizes with both inputs named in the key', () => {
    expect(workspace).toMatch(/useMemo<SlotResolutionContext \| null>/)
    expect(workspace).toMatch(/\[trip, road\]/)
  })

  it('TripWorkspace passes the context to GroupInputTab', () => {
    assertLivePin('workspace to tab', workspace,
      /<GroupInputTab[^>]*slotResolution=\{groupInputResolution\}[^>]*\/>/,
      'slotResolution={groupInputResolution}')
  })

  it('GroupInputTab passes the context to DecisionCard', () => {
    assertLivePin('tab to card', group,
      /<DecisionCard[^>]*slotResolution=\{slotResolution\}/,
      'slotResolution={slotResolution}')
  })

  it('DecisionCard calls the one production orchestration branch', () => {
    assertLivePin('card to orchestration', group,
      /runDecisionResolution\(\s*\{\s*context:\s*slotResolution,/,
      'context: slotResolution')
    assertLivePin('orchestration binds the real writers', group,
      /resolveDecision,\s*toast,\s*reportCollabOutcome,\s*refuseWhileStaged,/,
      'resolveDecision, toast, reportCollabOutcome, refuseWhileStaged')
  })

  it('the orchestration feeds the adapter with the committed trip and graded road', () => {
    assertLivePin('orchestration to adapter', adapter,
      /trip:\s*input\.context\.trip,[\s\S]{0,160}?road:\s*input\.context\.road/,
      'trip: input.context.trip')
  })

  it('the staged guard covers every resolve route inside the orchestration', () => {
    assertLivePin('staged guard', adapter,
      /deps\.refuseWhileStaged\(input\.previewOpen\)/,
      'deps.refuseWhileStaged(input.previewOpen)')
    expect(group, 'the day-picker retry is a guarded route').toMatch(
      /void resolveChoice\(pickerOptionId, \{ dayId: placementDayId \}\)/,
    )
  })

  it('the road grade reuses the Map tab measuredRoadFacts', () => {
    expect(adapter).toMatch(/import \{ measuredRoadFacts[^}]*\} from '\.\/map\/mapTabPipeline'/)
    expect(adapter).toMatch(/measuredRoadFacts\(\{ trip, road, hasLine:/)
    expect(adapter, 'no local epsilon copy').not.toMatch(/0\.000005|function samePoint/)
  })

  it('geometry pairs use real typeof narrowing, not as-number casts', () => {
    expect(adapter).toMatch(/typeof lng === 'number'/)
    expect(adapter, 'no as-number cast').not.toMatch(/as number/)
  })

  it('the revision check matches the store safe-integer rule', () => {
    expect(adapter).toMatch(/Number\.isSafeInteger\(revision\)/)
  })

  it('the refusal copy is honest for terminal and recoverable roads', () => {
    expect(adapter).toMatch(/'road-unavailable': '[^']*unavailable[^']*'/)
    expect(adapter, 'no false readiness promise').not.toMatch(/Try again when the route is ready/)
    expect(adapter).toMatch(/'missing-day': '[^']*Choose a day below/)
  })

  it('the day picker is reachable while the poll is still open', () => {
    expect(group).toMatch(/const pickerOptionId = needsPlacement \?/)
    expect(group, 'the picker no longer needs a resolved status').not.toMatch(/\{needsPlacement && \(/)
  })
})
