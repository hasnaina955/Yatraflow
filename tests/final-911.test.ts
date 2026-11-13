// 911-final: the phase notes, the Fix tag spot, the viewer gates and the
// fixture provider modes.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LensPhaseNote } from '../src/components/map/lenses/LensPhaseNote'
import { GAP_PHASE_TEXT } from '../src/components/map/lenses/GapDeck'
import { fixtureModeFromSearch, fixtureNearElements, installFixtureTransport } from '../dev/map-workspace-fixture.transport'

const lf = (text: string) => text.replace(/\r\n/g, '\n')
const read = (path: string) => lf(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))

describe('LensPhaseNote', () => {
  const phases = ['unscanned', 'scanning', 'failed', 'quota', 'empty'] as const

  it('draws every phase with its own marker, and keeps the text in the inner paragraph', () => {
    const markup = phases.map(phase => renderToStaticMarkup(createElement(LensPhaseNote, { phase, children: `text ${phase}` })))
    for (const [index, html] of markup.entries()) {
      expect(html).toContain(`data-phase="${phases[index]}"`)
      expect(html).toContain(`<p class="mv2-lens-phase" data-phase="${phases[index]}">text ${phases[index]}</p>`)
      expect(html).toContain('<svg')
    }
    // A failure is an alert. A wait and an empty are status notes.
    expect(markup[2]).toContain('role="alert"')
    expect(markup[1]).toContain('role="status"')
    expect(markup[4]).toContain('role="status"')
  })

  it('tints a failed note apart from an empty note', () => {
    const css = read('src/styles/components/map-v2-rail.css')
    expect(css).toMatch(/\.mv2-lens-phase-note\[data-phase='failed'\] \{[^}]*--pw-risk/)
    expect(css).toMatch(/\.mv2-lens-phase-note\[data-phase='empty'\] \{[^}]*dashed/)
  })

  it('names this day in the gap texts, never the stay', () => {
    for (const text of Object.values(GAP_PHASE_TEXT)) expect(text).not.toMatch(/the stay/)
    expect(GAP_PHASE_TEXT.failed).toBe('Gap search · Failed')
  })
})

describe('the Fix tag spot', () => {
  const chart = read('src/components/TripMap.tsx')

  it('starts beside the badge, on its left, and reads the stop box for its first fallback', () => {
    const start = chart.indexOf('id: `fix-tag:${p.id}`')
    const block = chart.slice(start - 600, start + 700)
    expect(block).toContain('baseTagBox(')
    expect(block).toContain('x: box.x, y: box.y')
    expect(block).toContain('alternates')
  })

  it('anchors the tag to the stop edge in CSS and uses a token for the badge ground', () => {
    const css = read('src/styles/components/map-v2-rail.css')
    expect(read('src/components/map/mapMarks.css')).toMatch(/\.mv2-pin-anchor > \.mv2-stop-tag--fix \{[^}]*right: calc\(100% \+ 8px\)/)
    expect(css).toMatch(/\.mv2-stop-warn \{[^}]*background: var\(--pw-risk\)/)
    expect(css).not.toMatch(/\.mv2-stop-warn \{[^}]*#[0-9A-Fa-f]{3,6}/)
  })
})

describe('the viewer role', () => {
  const tab = read('src/pages/trip/MapTab.tsx')

  it('shows no route-arc Add all, no shortlist heart and no tray action to a viewer', () => {
    expect(tab).toContain('{editable && arcs.slice(0, 2).map(arc => (')
    expect(tab).toContain('editable && !filterActive && arcs.slice(0, 2).length > 0')
    expect(tab).toContain('{editable && <ShortlistTray')
    expect(tab).toMatch(/\{\.\.\.\(editable \? \{ onShortlist:/)
  })
})

describe('the fixture provider modes', () => {
  it('reads the mode from the query and falls back to the default answer', () => {
    expect(fixtureModeFromSearch('?provider=fail')).toBe('fail')
    expect(fixtureModeFromSearch('?provider=hang')).toBe('hang')
    expect(fixtureModeFromSearch('?provider=empty')).toBe('empty')
    expect(fixtureModeFromSearch('?provider=near')).toBe('near')
    expect(fixtureModeFromSearch('?provider=other')).toBe('answer')
    expect(fixtureModeFromSearch('')).toBe('answer')
  })

  it('answers a failed mode with a server error and an empty mode with no place', async () => {
    const make = (mode: 'fail' | 'empty') => {
      const original = (() => Promise.resolve(new Response('real'))) as unknown as typeof fetch
      const scope = { fetch: original }
      installFixtureTransport(scope, mode)
      return scope.fetch
    }
    const failed = await make('fail')('https://maps.mail.ru/osm/tools/overpass/api/interpreter', { method: 'POST', body: 'data=x' })
    expect(failed.status).toBe(503)
    const empty = await make('empty')('https://maps.mail.ru/osm/tools/overpass/api/interpreter', { method: 'POST', body: 'data=x' })
    expect(((await empty.json()) as { elements: unknown[] }).elements).toEqual([])
  })

  it('never settles in the hang mode', async () => {
    const scope = { fetch: (() => Promise.resolve(new Response('real'))) as unknown as typeof fetch }
    installFixtureTransport(scope, 'hang')
    const outcome = await Promise.race([
      scope.fetch('https://maps.mail.ru/osm/tools/overpass/api/interpreter', { method: 'POST', body: 'data=x' }).then(() => 'settled'),
      new Promise<string>(resolve => setTimeout(() => resolve('waiting'), 30)),
    ])
    expect(outcome).toBe('waiting')
  })

  it('puts one near place beside each distinct anchor', () => {
    const query = '[out:json];(node(around:5000,10.1,77.0);node(around:5000,10.2,77.1);node(around:5000,10.1,77.0););'
    const answer = fixtureNearElements(query)
    expect(answer.elements).toHaveLength(2)
    expect(Math.abs(answer.elements[0].lat - 10.1)).toBeLessThan(0.01)
  })
})

describe('failed lens note retry', () => {
  type El = { type?: unknown; props?: { className?: string; onClick?: () => void; children?: unknown } }
  type Node = El | string | null | false | undefined
  const find = (node: unknown, className: string): Node => {
    if (node == null || typeof node !== 'object') return null
    const el = node as El
    if (el.props?.className === className) return el
    const kids = el.props?.children
    for (const kid of Array.isArray(kids) ? kids : [kids]) {
      const hit = find(kid, className)
      if (hit) return hit
    }
    return null
  }

  it('calls the retry when the Retry button is pressed', () => {
    let calls = 0
    const tree = LensPhaseNote({ phase: 'failed', onRetry: () => { calls += 1 }, children: 'The search failed. Try again.' })
    const button = find(tree, 'mv2-lens-retry') as { props: { onClick: () => void } } | null
    expect(button).not.toBeNull()
    button!.props.onClick()
    expect(calls).toBe(1)
  })

  it('draws the Retry button only for a failed note that has a retry', () => {
    const withRetry = (phase: (typeof phasesAll)[number], retry?: () => void) => renderToStaticMarkup(createElement(LensPhaseNote, { phase, onRetry: retry, children: 'text' }))
    const phasesAll = ['unscanned', 'scanning', 'failed', 'quota', 'empty'] as const
    expect(withRetry('failed', () => {})).toContain('mv2-lens-retry')
    expect(withRetry('failed')).not.toContain('mv2-lens-retry')
    for (const phase of ['unscanned', 'scanning', 'quota', 'empty'] as const) expect(withRetry(phase, () => {})).not.toContain('mv2-lens-retry')
  })

  it('wires one scan retry to the Refresh button and to the Drive, Stay and Gap decks', () => {
    const tab = read('src/pages/trip/MapTab.tsx')
    expect(tab).toContain('const retryScan')
    expect(tab).toMatch(/onRetry=\{retryScan\}/)
    const panel = read('src/pages/trip/map/MapLensPanel.tsx')
    expect(panel.match(/props\.onRetry == null \? \{\} : \{ onRetry: props\.onRetry \}/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    for (const deck of ['DriveTabs', 'StayDeck', 'GapDeck']) expect(read(`src/components/map/lenses/${deck}.tsx`)).toMatch(/<LensPhaseNote[^>]*\{\.\.\.\(\w*\.?onRetry == null/)
  })

  it('keeps one message per phase and the page banner away from an open deck', () => {
    expect(read('src/pages/trip/MapTab.tsx')).toMatch(/!deckOpen/)
    expect(read('src/components/map/lenses/DriveTabs.tsx')).toContain('DRIVE_NOTE_TITLE')
    expect(read('src/components/map/lenses/GapDeck.tsx')).toContain('GAP_NOTE_TITLE')
  })
})
