import { describe, expect, it } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { WORKSPACE_MAP_STYLES } from '../src/lib/workspaceMapStyles'
import { applyViewModeOnMap, resolveHillshadeBeforeId, YF_DEM_SOURCE_ID, YF_HILLSHADE_LAYER_ID } from '../src/lib/mapViewModes'

describe('authored workspace map styles', () => {
  for (const [theme, style] of Object.entries(WORKSPACE_MAP_STYLES)) {
    it(`${theme} passes the installed MapLibre style validator`, () => {
      expect(validateStyleMin(style).map(error => error.message)).toEqual([])
    })

    it(`${theme} retains keyless vector data and leaves POIs and elevation to their owners`, () => {
      expect(style.sources).toEqual({ openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } })
      expect(style.glyphs).toBe('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf')
      expect(style.sprite).toBeUndefined()
      expect(style.terrain).toBeUndefined()
      expect(style.layers.some(layer => layer.type === 'hillshade' || layer.type === 'raster' || layer.type === 'circle')).toBe(false)
      expect(style.layers.some(layer => 'source-layer' in layer && ['poi', 'aerodrome_label'].includes(layer['source-layer']))).toBe(false)
      expect(style.layers.map(layer => layer.id)).toHaveLength(new Set(style.layers.map(layer => layer.id)).size)
    })

    it(`${theme} keeps minor roads at zoom 12 and a water insertion point for existing terrain modes`, () => {
      expect(style.layers.find(layer => layer.id === 'minor-road')?.minzoom).toBe(12)
      expect(resolveHillshadeBeforeId(style.layers)).toBe('water')
      const sources = new Map(Object.entries(style.sources))
      const layers = new Map(style.layers.map(layer => [layer.id, layer]))
      // Run the actual mode reconciler over the authored layer ids.
      const added: string[] = []
      applyViewModeOnMap({
        getStyle: () => style,
        getSource: id => sources.get(id), removeSource: id => { sources.delete(id) },
        addSource: id => { added.push(id) },
        getLayer: id => layers.get(id), removeLayer: id => { layers.delete(id) },
        addLayer: () => { added.push(YF_HILLSHADE_LAYER_ID) },
        getTerrain: () => null, setTerrain: () => undefined,
      }, '2d')
      expect(added).toEqual([])
      expect(sources.has(YF_DEM_SOURCE_ID)).toBe(false)
    })
  }

  it('uses the source land and water colors in each theme', () => {
    expect(WORKSPACE_MAP_STYLES.light.layers.find(layer => layer.type === 'background')?.paint).toEqual({ 'background-color': '#EFE9DF' })
    expect(WORKSPACE_MAP_STYLES.dark.layers.find(layer => layer.type === 'background')?.paint).toEqual({ 'background-color': '#0F1928' })
    expect(WORKSPACE_MAP_STYLES.light.layers.find(layer => layer.id === 'water')?.paint).toEqual({ 'fill-color': '#BCDAD5' })
    expect(WORKSPACE_MAP_STYLES.dark.layers.find(layer => layer.id === 'water')?.paint).toEqual({ 'fill-color': '#13314A' })
  })
})
