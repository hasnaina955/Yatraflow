import { describe, expect, it } from 'vitest'
import linen from '../src/lib/mapStyles/yatraflow-linen.json'
import night from '../src/lib/mapStyles/yatraflow-night.json'

// The README hides park outlines. Liberty draws them bright green, which
// reads as noise on both themes, so each outline must match its fill.
describe('map v2 basemaps hide park outlines', () => {
  for (const [theme, style] of [['linen', linen], ['night', night]] as const) {
    it(`${theme} draws the park outline in the park fill colour`, () => {
      const park = (style.layers as Array<{ id: string; paint?: Record<string, unknown> }>).find(layer => layer.id === 'park')
      expect(park?.paint?.['fill-outline-color']).toBe(park?.paint?.['fill-color'])
    })
  }
})
