// W8-card: the place card and the scope band. Node env, no DOM.
// Component checks read static markup. CSS checks read the stylesheet.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LensPlaceCard, placeSubLine, ratingText, type LensCostCell } from '../src/components/map/lenses/LensPlaceCard'
import { MapScopeBand, scopeBandCountsText, scopeBandCountParts } from '../src/pages/trip/map/MapScopeBand'

const noop = () => undefined
const css = readFileSync(new URL('../src/styles/components/map-v2-rail.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const CELLS: LensCostCell[] = [
  { key: 'arrive', label: 'Arrive', value: '12:05' },
  { key: 'detour', label: 'Detour', value: '+8 min' },
  { key: 'budget', label: 'Budget', value: '18%' },
]

function card(over: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(createElement(LensPlaceCard, {
    name: 'Nalla Ruchi Kitchen', cells: CELLS, addLabel: 'Add as Day 3 lunch',
    onAdd: noop, ...over,
  } as never))
}

function band(over: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(createElement(MapScopeBand, {
    minutes: 30, onMinutes: noop, counts: { inside: 9, justPast: 2, worthDetour: 1 }, ...over,
  } as never))
}

describe('W8-card place card', () => {
  it('reads a raw category as sentence case', () => {
    expect(placeSubLine({ category: 'nature' })).toBe('Nature')
  })

  it('keeps a proper area line unchanged', () => {
    expect(placeSubLine({ admin1: 'Kerala', category: 'waterfall' })).toBe('Kerala · waterfall')
    expect(placeSubLine({ admin1: 'Kattappana', category: 'Kerala meals' })).toBe('Kattappana · Kerala meals')
  })

  it('shows a rating only when the count is known', () => {
    const html = card({ hit: { rating: 4.4, ratingCount: 1200 } })
    expect(html).toContain('mv2-lens-place-rating')
    expect(html).toContain('4.4')
    expect(html).toContain('1.2k')
    expect(card({ hit: { rating: 4.4 } })).not.toContain('mv2-lens-place-rating')
    expect(ratingText({ rating: 4.4 })).not.toBeNull()
  })

  it('gives the icon tile its category family', () => {
    expect(card({ category: 'food' })).toContain('data-family="needs"')
    expect(card({ category: 'nature' })).toContain('data-family="nature"')
  })

  it('draws reason chips only when real reasons exist', () => {
    expect(card({ reasons: ['breaks a 2 h ghat stretch'] })).toContain('mv2-lens-reasons')
    expect(card()).not.toContain('mv2-lens-reasons')
  })

  it('adds only the buttons whose handlers exist', () => {
    expect(card()).not.toContain('mv2-lens-round')
    const both = card({ selected: true, onShortlist: noop, onSwap: noop })
    expect((both.match(/mv2-lens-round/g) ?? []).length).toBe(2)
    expect(card({ onShortlist: noop, onSwap: noop })).not.toContain('mv2-lens-place-actions')
  })

  it('puts a plus icon inside the add pill', () => {
    const html = card({ selected: true })
    expect(html).toContain('mv2-lens-place-add')
    expect(html).toContain('Add as Day 3 lunch')
    expect(html).toContain('<svg')
  })
})

describe('W8-card scope band', () => {
  it('writes counts with no separators', () => {
    expect(scopeBandCountsText({ inside: 9, justPast: 2, worthDetour: 1 }))
      .toBe('9 Inside 2 Just past it 1 Worth the detour')
    expect(scopeBandCountParts(null)).toBeNull()
  })

  it('shows only the eligible count with a full accessible name', () => {
    const html = band()
    expect(html).toContain('Fits: 9')
    expect(html).toContain('aria-label="9 picks fit scope and budget"')
    expect(html).not.toContain('2 Just past it')
    expect(band({ counts: null })).toContain('Count unavailable')
  })

  it('uses the shared select for the current minute scope', () => {
    expect(band()).toContain('role="combobox"')
    expect(band()).toContain('Within 30 min')
    expect(band()).not.toContain('<select')
  })
})

describe('W8-card stylesheet', () => {
  it('makes the cells one container and the label not amber', () => {
    expect(css).toMatch(/\.mv2-lens-strip \{[^}]*background: var\(--pw-soft\)/)
    expect(css).toMatch(/\.mv2-lens-cell \{[^}]*background: transparent/)
    expect(css).toMatch(/\.mv2-lens-cell-label \{[^}]*color: var\(--pw-ink-3\)/)
  })

  it('uses a 1.5px teal selected border and the soft teal glow', () => {
    expect(css).toMatch(/\.mv2-lens-place\.is-selected \{[^}]*border-width: 1\.5px[^}]*box-shadow: 0 0 0 4px var\(--pw-lagoon-100\)/)
  })

  it('keeps the phone scope rules inside their media block', () => {
    expect(css).toContain('.mv2-workspace .poi-col > .mv2-lens-scope-band[hidden] { display: none; }')
    expect(css).toMatch(/\.poi-col > \.mv2-lens-scope-band \{[^}]*position: sticky/)
  })

  it('gives the chips and round buttons a 44px hit area', () => {
    expect(css).toMatch(/\.mv2-lens-scope-chip::before \{[^}]*inset: -7px 0/)
    expect(css).toMatch(/\.mv2-lens-round::before \{[^}]*inset: -3px/)
  })

  it('uses motion tokens for hover transitions', () => {
    expect(css).toMatch(/\.mv2-lens-place-add \{[^}]*transition:[^}]*--motion-fast/)
    expect(css).toContain('.mv2-lens-place-add:hover:not(:disabled)')
    expect(css).toContain('.mv2-lens-place-add:active:not(:disabled)')
  })
})
