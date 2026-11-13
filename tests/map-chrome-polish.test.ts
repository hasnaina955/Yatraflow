// The Map tab chrome polish: day pills, one panel by default, the cluster chip,
// the attribution corner and the motion that each panel carries.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const chrome = read('../src/components/map/MapWorkspaceChrome.tsx')
const tab = read('../src/pages/trip/MapTab.tsx')
const tripMap = read('../src/components/TripMap.tsx')
const mapcn = read('../src/components/mapcn/map.tsx')
const css = read('../src/styles/components/map-v2-rail.css')

describe('Days on the map', () => {
  it('draws each day as one pill in its own colour, with no separate dot', () => {
    expect(chrome).toMatch(/className="mv2-day-pill" style=\{\{ '--mv2-day-tone': dayColor\(item\.index\) \}/)
    expect(chrome).not.toMatch(/<span aria-hidden="true" style=\{\{ '--mv2-day-tone'/)
    expect(css).toMatch(/\.mv2-day-strip > \.mv2-day-pill\[aria-pressed='true'\] \{[^}]*background: var\(--mv2-day-tone\)/)
  })
  it('wraps the pills and never scrolls the strip', () => {
    expect(css).toContain('.mv2-workspace .mv2-day-strip { flex-wrap: wrap; overflow: visible; }')
  })
})

describe('One panel by default', () => {
  it('opens only the day rail on a wide screen; the phone sheet keeps its deck', () => {
    expect(tab).toContain("const [deckOpen, setDeckOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches)")
  })
})

describe('Suggestion states', () => {
  it('shows the live states on the deck top and keeps no hidden help button', () => {
    expect(tab).not.toContain('How suggestions work')
    expect(tab).not.toContain('mv2-suggestion-info')
    expect(tab).toMatch(/\{scopeBand\}\n\s*\{deckStatus\}/)
  })
})

describe('Cluster badge', () => {
  it('draws the workspace badge as a ringed white chip with a halo', () => {
    expect(tripMap).toContain('look={workspaceChrome ? WORKSPACE_CLUSTER_LOOK : undefined}')
    expect(mapcn).toContain('id: haloLayerId')
    expect(mapcn).toContain('"circle-stroke-color": look?.ring ?? "#fff"')
    expect(mapcn).toContain('if (map.getLayer(haloLayerId)) map.removeLayer(haloLayerId);')
  })
})

describe('Attribution', () => {
  it('sits in the map corner as a round chip', () => {
    expect(css).toContain('.mv2-workspace .maplibregl-ctrl-attrib.maplibregl-compact:not(.maplibregl-compact-show) { width: 28px; padding: 0; }')
  })
})

describe('Motion', () => {
  it('slides each panel in and restarts the deck rise on a lens change', () => {
    expect(css).toContain('.mv2-workspace .mv2-itinerary { animation: mv2-rail-in var(--motion-slow) var(--ease-paper) backwards; }')
    expect(css).toMatch(/\.poi-col:not\(\[hidden\]\), \.mv2-workspace \.mv2-detail \{ animation: mv2-deck-in/)
    expect(tab).toContain('id="rail-see" data-lens={lens}')
    for (const lens of ['stay', 'gap', 'fix']) expect(css).toContain(`[data-lens='${lens}'] { --mv2-lens-rise: mv2-rise-${lens}; }`)
  })
  it('turns every new animation off for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n\s*\.mv2-workspace \.mv2-itinerary, [^}]*\.mv2-layers-dot \{ animation: none; \}/)
  })
})
