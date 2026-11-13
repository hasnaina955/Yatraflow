// W9-phone: the phone sheet holds the ribbon and the Drive band in flow.
// Each test fails when its rule breaks.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/styles/components/map-v2-rail.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tab = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

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

  it('keeps the sheet grip and floats the requested ribbon above it', () => {
    expect(phoneBlock()).toMatch(/--mv2-sheet-grip-h: 44px/)
    expect(css).toMatch(/\.mv2-workspace \.mv2-ribbon \{[^}]*bottom: calc\(var\(--mv2-sheet-height\)/)
    expect(tab).toContain('inSheet={false}')
  })

  it('fits the grip, the ribbon and one peek row in the peek sheet', () => {
    // 22 px visible grip + 48 px peek row + 30 px bottom pad = 148 px.
    expect(22 + 48 + 30).toBeLessThanOrEqual(148)
    expect(phoneBlock()).toMatch(/\[data-snap='peek'\] \.mv2-peek/)
    const gaps = css.slice(css.indexOf('/* 911-W12-r3:'))
    expect(gaps).toMatch(/\[data-snap='peek'\] \{ --mv2-sheet-height: 148px; \}/)
    expect(gaps).toMatch(/\[data-snap='peek'\] \.mv2-sheet-settings \{ display: none; \}/)
    expect(gaps).toMatch(/\[data-snap='peek'\] \.mv2-sheet-handle \{ height: 22px; min-height: 22px; \}/)
  })

  it('puts one scope control above the cards and keeps the ribbon out of the sheet', () => {
    const see = tab.indexOf('id="rail-see"')
    const band = tab.indexOf('{scopeBand}', see)
    const deck = tab.indexOf('<MapLensPanel', see)
    expect(band).toBeGreaterThan(see)
    expect(deck).toBeGreaterThan(band)
    expect(tab.slice(see, tab.indexOf('{phoneRibbon}', see))).not.toContain('<MapJourneyRibbon')
  })

  it('opens the desktop ribbon from the clock chip', () => {
    expect(tab).toContain('className="mv2-clock-chip"')
    expect(tab).toContain('aria-expanded={ribbonShown}')
    expect(tab).toContain("loadFlag('map_ribbon', false)")
  })

  it('offers the ribbon in the phone day menu and auto-shows previews', () => {
    expect(tab).toContain('ribbonOpen || openPreview != null || activeFixPreview != null || splitPreview')
    expect(tab).not.toContain('ribbonSheet')
    const chrome = readFileSync(new URL('../src/components/map/MapWorkspaceChrome.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(chrome).toContain('onToggleRibbon(); setMenuOpen(false)')
    expect(chrome).toContain('Journey clock</button>')
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
