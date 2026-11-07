// ============ Production caller forwarding (#08 R2/R3 migration) ============
// Guards the one strict road source through the real prop/hook constructors.
// Behavior is proved by map-writer-road-binding.test.ts and the writer suites;
// this file only prevents a real caller from dropping the source.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const ws = read('src/pages/TripWorkspace.tsx')
const map = read('src/pages/trip/MapTab.tsx')
const mapWriters = read('src/pages/trip/map/useMapWriters.ts')
const shortlist = read('src/pages/trip/map/useShortlist.ts')
const timeline = read('src/pages/trip/timeline/timelineProjectedWriter.ts')
const builder = read('src/pages/trip/timeline/timelineRoadBinding.ts')

describe('production road-binding forwarding', () => {
  it('captures one binding from the measured builder and exposes a live accessor', () => {
    expect(builder).toContain('measuredRoadFacts({')
    expect(builder).toContain("road.legs.some(leg => leg.source !== 'estimate')")
    expect(builder).toContain('if (!grade.measured) return null')
    expect(builder).toContain('chainPoints: road.chain.points')
    expect(builder).toContain('geometry: leg.geometry.map')
    expect(ws).toContain('buildTimelineRoadBinding({')
    expect(ws).toContain('if (!committed || !roadBinding || timelineRoute.length < 2) return undefined')
    expect(ws).toContain('roadBindingRef.current = roadBinding')
    expect(ws).toContain('const currentRoadBinding = useCallback(() => roadBindingRef.current')
    expect(ws).toContain('roadBinding={roadBinding} currentRoad={currentRoadBinding}')
    expect(ws).toMatch(/binding: roadBinding,\s*currentRoad: currentRoadBinding/)
  })

  it('forwards the source through Map, shortlist, writers and arc', () => {
    expect(map).toContain('roadBinding?: WriterRoadBinding | null')
    expect(map).toContain('currentRoad?: () => WriterRoadBinding | null')
    expect(map).toMatch(/useMapWriters\(\{[\s\S]*?roadBinding, currentRoad,/)
    expect(map).toMatch(/useShortlist\(\{[\s\S]*?roadBinding,/)
    expect(map).toMatch(/useShortlist\(\{[\s\S]*?currentRoad,/)
    expect(map).toMatch(/const arcDeps = \(\): WriterActionDeps[\s\S]*?roadBinding \? \{ roadBinding \}/)
    expect(mapWriters).toMatch(/actionDeps[\s\S]*?roadBinding \? \{ roadBinding \}/)
    expect(shortlist).toMatch(/depsFor[\s\S]*?roadBinding \? \{ roadBinding \}/)
    expect(timeline).toContain('binding?: WriterRoadBinding | null')
    expect(timeline).toContain('currentRoad?: () => WriterRoadBinding | null')
    expect(timeline).toContain('...(config.road.binding ? { roadBinding: config.road.binding } : {})')
    expect(timeline).toContain('...(config.road.currentRoad ? { currentRoad: config.road.currentRoad } : {})')
  })
})
