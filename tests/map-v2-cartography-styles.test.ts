import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { WORKSPACE_MAP_STYLES } from '../src/lib/workspaceMapStyles'
import {
  applyWorkspaceViewMode, DEM_ATTRIBUTION, HILLSHADE_2D_EXAGGERATION, HILLSHADE_TERRAIN_EXAGGERATION,
  TERRAIN_3D_EXAGGERATION, WORKSPACE_DEM_SOURCE_ID, WORKSPACE_HILLSHADE_LAYER_ID, type WorkspaceViewMap,
} from '../src/lib/mapStyles'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('supplied Linen and Night styles', () => {
  for (const [theme, style] of Object.entries(WORKSPACE_MAP_STYLES)) {
    it(`${theme} passes the MapLibre style validator`, () => {
      expect(validateStyleMin(style).map(error => error.message)).toEqual([])
    })

    it(`${theme} keeps the keyless vector source, glyphs and a DEM with a credit`, () => {
      expect(style.sources.openmaptiles).toEqual({ type: 'vector', url: 'https://tiles.openfreemap.org/planet' })
      expect(style.glyphs).toBe('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf')
      expect(style.sources[WORKSPACE_DEM_SOURCE_ID]).toMatchObject({ type: 'raster-dem', encoding: 'terrarium', attribution: DEM_ATTRIBUTION })
      expect(style.layers.map(layer => layer.id)).toHaveLength(new Set(style.layers.map(layer => layer.id)).size)
    })

    it(`${theme} shades relief at 0.45 below the water layer`, () => {
      const ids = style.layers.map(layer => layer.id)
      const shade = style.layers[ids.indexOf(WORKSPACE_HILLSHADE_LAYER_ID)]
      expect(shade.type).toBe('hillshade')
      expect(shade.paint).toMatchObject({ 'hillshade-exaggeration': HILLSHADE_2D_EXAGGERATION })
      expect(ids.indexOf(WORKSPACE_HILLSHADE_LAYER_ID)).toBeLessThan(ids.indexOf('water'))
    })

    it(`${theme} hides POIs, as the app draws its own marks`, () => {
      expect(style.layers.some(layer => 'source-layer' in layer && ['poi', 'aerodrome_label'].includes(layer['source-layer'] as string))).toBe(false)
    })
  }

  it('keeps the names the basemap status code matches on', () => {
    expect(WORKSPACE_MAP_STYLES.light.name).toBe('YatraFlow Linen')
    expect(WORKSPACE_MAP_STYLES.dark.name).toBe('YatraFlow Night sky')
  })

  it('uses the Linen and Night land colours', () => {
    const land = (theme: 'light' | 'dark') => WORKSPACE_MAP_STYLES[theme].layers.find(layer => layer.type === 'background')?.paint
    expect(land('light')).toEqual({ 'background-color': '#EFE9DF' })
    expect(land('dark')).toEqual({ 'background-color': '#0F1928' })
  })

  it('keeps the docs copy byte-identical to the app copy', () => {
    for (const name of ['yatraflow-linen.json', 'yatraflow-night.json']) {
      expect(read(`../docs/redesign/map-v2/${name}`)).toBe(read(`../src/lib/mapStyles/${name}`))
    }
  })
})

function fakeMap(hasDem = true) {
  const calls: string[] = []
  let terrain: unknown = null
  const map: WorkspaceViewMap = {
    getSource: id => (hasDem && id === WORKSPACE_DEM_SOURCE_ID ? {} : undefined),
    getLayer: id => (hasDem && id === WORKSPACE_HILLSHADE_LAYER_ID ? {} : undefined),
    setPaintProperty: (id, name, value) => { calls.push(`paint ${id} ${name} ${String(value)}`) },
    getTerrain: () => terrain,
    setTerrain: value => { terrain = value; calls.push(`terrain ${JSON.stringify(value)}`) },
    setSky: sky => { calls.push(`sky ${sky ? 'on' : 'off'}`) },
  }
  return { map, calls, terrain: () => terrain }
}

describe('workspace view modes', () => {
  it('2D keeps the style hillshade and adds no terrain or sky', () => {
    const { map, calls, terrain } = fakeMap()
    applyWorkspaceViewMode(map, '2d', 'light')
    expect(calls).toEqual([`paint hillshade hillshade-exaggeration ${HILLSHADE_2D_EXAGGERATION}`, 'sky off'])
    expect(terrain()).toBeNull()
  })

  it('terrain mode raises the same hillshade layer', () => {
    const { map, calls } = fakeMap()
    applyWorkspaceViewMode(map, 'terrain', 'dark')
    expect(calls[0]).toBe(`paint hillshade hillshade-exaggeration ${HILLSHADE_TERRAIN_EXAGGERATION}`)
    expect(HILLSHADE_TERRAIN_EXAGGERATION).toBeGreaterThan(HILLSHADE_2D_EXAGGERATION)
  })

  it('3D sets terrain from the dem source at 1.3 and a sky, and leaving 3D removes both', () => {
    const { map, calls, terrain } = fakeMap()
    applyWorkspaceViewMode(map, '3d', 'dark')
    expect(terrain()).toEqual({ source: 'dem', exaggeration: TERRAIN_3D_EXAGGERATION })
    expect(TERRAIN_3D_EXAGGERATION).toBe(1.3)
    expect(calls).toContain('sky on')
    applyWorkspaceViewMode(map, '2d', 'dark')
    expect(terrain()).toBeNull()
    expect(calls.at(-1)).toBe('sky off')
  })

  it('3D without a DEM source stays flat instead of throwing', () => {
    const { map, terrain } = fakeMap(false)
    expect(() => applyWorkspaceViewMode(map, '3d', 'light')).not.toThrow()
    expect(terrain()).toBeNull()
  })
})
