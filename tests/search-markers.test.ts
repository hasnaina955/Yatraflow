
// ---- In-map search-result markers (found live 2026-09-24) ----
// Search hits join the map through mapPois, but they rendered IDENTICALLY to
// corridor ideas (dashed gold), so a user could not tell a result from a
// suggestion — and nothing tied a pin's tap back to its result row. The pin is
// a wiring contract between MapTab (state) and TripMap (drawing), so it is
// pinned by source invariants, the same pattern as trip-road/mobile-shell.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readCssSource } from '../scripts/css-source-graph.mjs'

const mapTab = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8')
const omnibar = readFileSync(new URL('../src/pages/trip/MapOmnibar.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tripMap = readFileSync(new URL('../src/components/TripMap.tsx', import.meta.url), 'utf8')

describe('in-map search-result markers (wiring)', () => {
  it('MapTab derives the search-hit id set and hands it to the map', () => {
    expect(mapTab).toMatch(/const searchHitIds = useMemo\(/)
    expect(mapTab).toMatch(/searchHitIds=\{searchHitIds\}/)
  })

  it('MapTab clears omnibar results when its single search is edited', () => {
    // The clearing already existed for #164 (stale rows); the map markers ride
    // the same state, so this single clear is what empties the pins.
    expect(mapTab).toMatch(/setOmniResults\(\[\]\)/)
    expect(mapTab).toMatch(/setOmniPicked\(null\)/)
  })

  it('TripMap renders search hits as a distinct selectable pin class', () => {
    expect(tripMap).toMatch(/yf-map-pin-search/)
    expect(tripMap).toMatch(/isSearchHit \? <Search size=/)
    // selection parity: the pin reports pressed state like a toggle
    expect(tripMap).toMatch(/aria-pressed=\{isSearchHit \? active/)
  })

  it('the search-result row carries data-hit-id so a pin tap scrolls it into view', () => {
    expect(omnibar).toMatch(/data-hit-id=\{r\.h\.id\}/)
    // and the scroll effect looks in BOTH lists (rail + search results)
    expect(mapTab).toMatch(/searchListRef\.current\?\.querySelector/)
  })

  it('the search-pin style exists in the stylesheet (CRLF-tolerant)', () => {
    const css = readCssSource('src/styles.css')
    expect(css).toMatch(/\.yf-map-pin-search \{/)
    expect(css).toMatch(/\.yf-map-pin-search--active \{/)
  })
})
