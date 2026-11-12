// W7 package B. The phone top row, the scope band and the docked ribbon.
// A node test cannot measure a box, so this pins the CSS rules the browser
// proof measures, plus the pure label and placement helpers.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MapScopeBand, phoneLensAriaLabel, scopeBandPlacement } from '../src/pages/trip/map/MapScopeBand'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'src', 'styles', 'components', 'map-v2-rail.css'), 'utf8').replace(/\r\n/g, '\n')
const block = css.slice(css.indexOf('/* 911-W9-phone.'))
const tab = readFileSync(join(root, 'src', 'pages', 'trip', 'MapTab.tsx'), 'utf8')

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

describe('phone scope band placement', () => {
  it('hides the band at peek and docks it at half and full', () => {
    expect(scopeBandPlacement('peek', true)).toBe('hidden')
    expect(scopeBandPlacement('half', true)).toBe('in-sheet')
    expect(scopeBandPlacement('full', true)).toBe('in-sheet')
  })
  it('leaves the desktop band on the map', () => {
    expect(scopeBandPlacement('peek', false)).toBe('map')
    expect(scopeBandPlacement('half', false)).toBe('map')
  })
  it('renders the band hidden at peek', () => {
    const html = renderToStaticMarkup(createElement(MapScopeBand, {
      minutes: 30, onMinutes: () => {}, counts: { inside: 2, justPast: 0, worthDetour: 0 }, snap: 'peek', phone: true,
    }))
    expect(html).toContain('data-placement="hidden"')
    expect(html).toContain('hidden=""')
  })
  it('renders the band in the sheet at half', () => {
    const html = renderToStaticMarkup(createElement(MapScopeBand, {
      minutes: 30, onMinutes: () => {}, counts: null, snap: 'half', phone: true,
    }))
    expect(html).toContain('data-placement="in-sheet"')
    expect(html).not.toContain('hidden=""')
  })
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
  it('hides the band at peek and docks it at half and full', () => {
    expect(block).toContain('.mv2-workspace .poi-col > .mv2-lens-scope-band[hidden] { display: none; }')
    expect(block).toMatch(/\.poi-col > \.mv2-lens-scope-band \{[^}]*position: sticky/)
  })
  it('docks the ribbon in half and full and floats it above peek', () => {
    expect(block).toContain('.mv2-workspace .poi-col > .mv2-ribbon-sheet,')
    expect(block).toMatch(/\.mv2-workspace \.mv2-detail > \.mv2-ribbon-sheet \{[^}]*position: static/)
    expect(tab).toContain("!phoneSheet || !deckOpen || snap === 'peek'")
    expect(block).not.toContain('margin-bottom: 192px;')
  })
  it('uses no raw duration', () => {
    expect(block).not.toMatch(/\d(ms|s)\b/)
  })
})
