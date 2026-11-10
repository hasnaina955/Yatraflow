// W9-phone: the phone sheet holds the ribbon and the Drive band in flow.
// Each test fails when its rule breaks.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { scopeBandPlacement } from '../src/pages/trip/map/MapScopeBand'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const tab = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8')

/** The 911-W9-phone block, from its comment to the next comment. */
function phoneBlock() {
  const start = css.indexOf('/* 911-W9-phone.')
  expect(start, 'the W9 phone block exists').toBeGreaterThan(-1)
  const rest = css.slice(start + 1)
  const end = rest.indexOf('/* 911-W8-edit:')
  return end < 0 ? rest : rest.slice(0, end)
}

describe('911-W9-phone sheet structure', () => {
  it('drops every magic offset var and margin from the sheet', () => {
    const block = phoneBlock()
    expect(block).not.toContain('--mv2-lens-ribbon-h')
    expect(block).not.toContain('--mv2-lens-band-h')
    expect(block).not.toContain('margin-bottom: 64px')
    expect(block).not.toContain('margin-bottom: 192px')
    expect(css).not.toContain('var(--mv2-lens-ribbon-h)')
    expect(css).not.toContain('var(--mv2-lens-band-h)')
  })

  it('keeps the ribbon in the sheet flow and the band sticky under the grip', () => {
    const block = phoneBlock()
    expect(block).toMatch(/\.poi-col > \.mv2-ribbon \{[^}]*position: static/)
    expect(block).toMatch(/\.poi-col > \.mv2-lens-scope-band \{[^}]*position: sticky; top: var\(--mv2-sheet-grip-h\)/)
    expect(block).toMatch(/--mv2-sheet-grip-h: 44px/)
  })

  it('fits the grip, the ribbon and one peek row in the peek sheet', () => {
    // 44 px grip + 56 px ribbon + 48 px peek row = 148 px.
    expect(44 + 56 + 48).toBeLessThanOrEqual(148)
    expect(phoneBlock()).toMatch(/\[data-snap='peek'\] \.mv2-peek/)
  })

  it('renders the ribbon and the band above the deck list in the see sheet', () => {
    const see = tab.indexOf("id=\"rail-see\"")
    expect(see).toBeGreaterThan(-1)
    const ribbon = tab.indexOf("{ribbonSheet === 'see' && phoneRibbon}", see)
    const band = tab.indexOf("{ribbonSheet === 'see' && scopeBand}", see)
    const deck = tab.indexOf('<MapLensPanel', see)
    expect(ribbon).toBeGreaterThan(see)
    expect(band).toBeGreaterThan(ribbon)
    expect(deck).toBeGreaterThan(band)
  })

  it('keeps the desktop places unchanged', () => {
    expect(tab).toContain('{!phoneSheet && scopeBand}')
    expect(tab).toContain('{ribbonSheet === null && phoneRibbon}')
  })

  it('gives each sheet its own ribbon slot and hides the band at peek', () => {
    expect(tab).toContain("{ribbonSheet === 'needs' && phoneRibbon}")
    expect(tab).toContain("{ribbonSheet === 'detail' && phoneRibbon}")
    expect(scopeBandPlacement('peek', true)).toBe('hidden')
    expect(scopeBandPlacement('half', true)).toBe('in-sheet')
    expect(scopeBandPlacement('full', true)).toBe('in-sheet')
    expect(scopeBandPlacement('half', false)).toBe('map')
  })
})

describe('911-W9-phone attribution', () => {
  it('collapses the compact control once on a phone', () => {
    expect(tab).toContain("document.querySelector('.mv2-workspace .maplibregl-ctrl-attrib')")
    expect(tab).toContain("node.classList.remove('maplibregl-compact-show')")
    expect(tab).toContain("node.removeAttribute('open')")
  })

  it('keeps the control above the sheet', () => {
    expect(phoneBlock()).toMatch(
      /\.mv2-workspace \.maplibregl-ctrl-bottom-right \{ bottom: calc\(var\(--mv2-sheet-height\) \+ 8px\); \}/,
    )
  })
})
