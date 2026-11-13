// W7 package B. The phone top row, the scope band and the docked ribbon.
// A node test cannot measure a box, so this pins the CSS rules the browser
// proof measures, plus the pure label and placement helpers.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MapScopeBand, phoneLensAriaLabel } from '../src/pages/trip/map/MapScopeBand'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'src', 'styles', 'components', 'map-v2-rail.css'), 'utf8').replace(/\r\n/g, '\n')
const block = css.slice(css.indexOf('/* 911-W9-phone.'))
const tab = readFileSync(join(root, 'src', 'pages', 'trip', 'MapTab.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('phone lens aria labels', () => {
  it('names the lens and carries the count', () => {
    expect(phoneLensAriaLabel('Along the drive', 6)).toBe('Along the drive, 6')
    expect(phoneLensAriaLabel('Day plan', 0)).toBe('Day plan, 0')
  })
  it('says the count is unknown when it is null', () => {
    expect(phoneLensAriaLabel('Fix', null)).toContain('Fix')
    expect(phoneLensAriaLabel('Fix', null)).toMatch(/unknown/i)
  })
})

describe('phone deck scope', () => {
  for (const snap of ['peek', 'half', 'full']) {
    it(`keeps scope in the deck at ${snap}`, () => {
      const html = renderToStaticMarkup(createElement(MapScopeBand, {
        minutes: 30, onMinutes: () => {}, counts: null, snap, phone: true,
      }))
      expect(html).toContain('data-placement="deck"')
      expect(html).toContain('role="combobox"')
      expect(html).not.toContain('hidden=""')
    })
  }
})

describe('W7 phone CSS block', () => {
  it('is one appended block at the end', () => {
    expect(block.length).toBeGreaterThan(200)
    expect(css.indexOf('/* 911-W9-phone.')).toBe(css.lastIndexOf('/* 911-W9-phone.'))
  })
  it('puts the omnibar and the pill on one row and drops the words', () => {
    expect(block).toMatch(/\.mv2-workspace \.mv2-omnibar \{[^}]*top: 60px/)
    expect(block).toMatch(/\.mv2-workspace \.mv2-lenses \{[^}]*top: 60px/)
    expect(block).toContain('.mv2-workspace .mv2-lenses > button > span { display: none; }')
  })
  it('keeps scope above the deck instead of on the map', () => {
    const see = tab.indexOf('id="rail-see"')
    expect(tab.indexOf('scopeSlot={scopeBand}', see)).toBeGreaterThan(tab.indexOf('<MapLensPanel', see))
    expect(tab).not.toContain('{!phoneSheet && scopeBand}')
  })
  it('shows one requested ribbon on the map, with a phone day-menu entry', () => {
    expect(tab).toContain('const phoneRibbon = ribbonShown && (')
    expect(tab).toContain('inSheet={false}')
    expect(tab).not.toContain('ribbonSheet')
    expect(block).toMatch(/\.mv2-workspace \.mv2-ribbon \{[^}]*bottom: calc\(var\(--mv2-sheet-height\)/)
  })
  it('uses no raw duration', () => {
    expect(block).not.toMatch(/\d(ms|s)\b/)
  })
})
