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

describe('Map interaction round two', () => {
  it('hides a route tick that collides, so ticks never stack', () => {
    expect(tripMap).toContain("maxTravel: mark.kind === 'tick' ? 0 : 160")
    expect(tripMap).toMatch(/const TICK_ROOM = \d+/)
  })
  it('closes open map surfaces on a blank map click, but never on a pin or a cluster badge', () => {
    expect(tripMap).toContain("target.closest('.maplibregl-marker, .maplibregl-popup')) return")
    expect(tripMap).toContain(".some(f => f.layer.id.startsWith('clusters-'))")
    expect(tripMap).toContain('onBlankMapClickRef.current?.()')
    expect(tripMap).toContain("document.addEventListener('pointerdown', onPointerDown, true)")
    expect(tab).toContain('onBlankMapClick={() => { if (detailId != null) setDetailId(null) }}')
  })
  it('glides the camera on one eased curve, with no zero-time settle jump', () => {
    expect(tripMap).toContain('duration, easing: easeInOutCubic')
    expect(tripMap).toContain('duration: nudge, easing: easeInOutCubic')
  })
  it('puts a fold tab on the centre of each panel edge', () => {
    expect(tab).toContain('className={`mv2-edge-tab mv2-edge-tab--day')
    expect(tab).toContain('className={`mv2-edge-tab mv2-edge-tab--deck')
    expect(css).toMatch(/\.mv2-edge-tab \{[^}]*top: 50%;[^}]*translate: 0 -50%;/)
  })
  it('keeps a closing panel mounted while its exit plays', () => {
    expect(tab).toContain('const railPresence = usePresence(itineraryOpen)')
    expect(tab).toContain('const deckPresence = usePresence(deckOpen)')
    expect(css).toContain('.mv2-workspace .map-edit-keys.is-leaving .mv2-itinerary { animation: mv2-rail-out var(--motion-med) var(--ease-exit) forwards;')
  })
  it('replays the day cascade on a day change', () => {
    expect(chrome).toContain("<div className=\"mv2-day-head\" key={allDays ? 'all' : activeDay}>")
    expect(css).toContain('animation: mv2-day-swap var(--motion-slow) var(--ease-paper) backwards;')
  })
  it('keeps the corner controls one even inset from the edge when the deck folds', () => {
    expect(css).toContain('.mv2-workspace.is-deck-folded { --mv2-deck-width: 0px; --mv2-deck-gutter: 0px; }')
    expect(css).toContain('right: calc(var(--mv2-deck-width) + var(--mv2-inset) + var(--mv2-edge-tab-w) + var(--space-4));')
  })
  it('stacks each lens fact label over its value, so a fact never runs into the next column', () => {
    expect(css).not.toMatch(/\.mv2-lens-drive \.mv2-lens-cell \{[^}]*flex-direction: row/)
    expect(css).toContain('.mv2-lens-drive .mv2-lens-cell-value { white-space: nowrap; }')
  })
})

describe('Every tappable map mark answers a hover', () => {
  const marks = read('../src/components/map/mapMarks.css')
  it('gives the problem diamond a pointer and a lift, and the gap ring a fill', () => {
    expect(marks).toMatch(/\.mv2-warn-diamond \{[^}]*cursor: pointer;/)
    expect(marks).toContain('button.mv2-warn-diamond:hover {')
    expect(marks).toContain('button.mv2-lens-gap-ring:hover {')
    expect(marks).toContain('.mv2-warn-diamond, button.mv2-lens-gap-ring { transition: none; }')
  })
})
