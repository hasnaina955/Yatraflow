import type { ExpressionSpecification, FillLayerSpecification, FilterSpecification, LineLayerSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl'

// Original map paint from the supplied Map V2 palette. Sources and glyphs use
// the same keyless OpenFreeMap endpoints as the existing map styles.
const palettes = {
  light: { land: '#EFE9DF', built: '#E8E1D5', green: '#DCE4CF', water: '#BCDAD5', river: '#A6CEC8', highway: '#FFFFFF', primary: '#FBF7F0', minor: '#F6F1E8', casing: '#D6CCBC', boundary: '#C9BFAF', text: '#3C3833', halo: '#F8F5F0' },
  dark: { land: '#0F1928', built: '#132036', green: '#13241F', water: '#13314A', river: '#1B4562', highway: '#2A3B57', primary: '#1E2C42', minor: '#18253A', casing: '#0C1420', boundary: '#2C3E5C', text: '#ADBCCF', halo: '#0C1420' },
}
type Palette = typeof palettes.light

function classes(values: string[]): FilterSpecification {
  return ['in', ['get', 'class'], ['literal', values]]
}

function fill(id: string, sourceLayer: string, color: string, filter?: FilterSpecification): FillLayerSpecification {
  return { id, type: 'fill', source: 'openmaptiles', 'source-layer': sourceLayer, ...(filter ? { filter } : {}), paint: { 'fill-color': color } }
}

function width(low: number, high: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 5, low, 16, high]
}

function road(id: string, kinds: string[], minzoom: number, low: number, high: number, color: string, palette: Palette): LineLayerSpecification[] {
  const base = { source: 'openmaptiles', 'source-layer': 'transportation', minzoom, filter: classes(kinds), layout: { 'line-cap': 'round', 'line-join': 'round' } } satisfies Partial<LineLayerSpecification>
  return [
    { ...base, id: `${id}-casing`, type: 'line', paint: { 'line-color': palette.casing, 'line-width': width(low + 0.6, high + 1.5) } },
    { ...base, id, type: 'line', paint: { 'line-color': color, 'line-width': width(low, high), 'line-opacity': ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.55, 1] } },
  ]
}

function places(id: string, kinds: string[], minzoom: number, low: number, high: number, palette: Palette): SymbolLayerSpecification {
  return {
    id, type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', minzoom, filter: classes(kinds),
    layout: {
      'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'],
      'text-size': width(low, high), 'text-max-width': 9, 'text-padding': 5,
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 10],
    },
    paint: { 'text-color': palette.text, 'text-halo-color': palette.halo, 'text-halo-width': 1.5 },
  }
}

function createStyle(theme: keyof typeof palettes): StyleSpecification {
  const p = palettes[theme]
  return {
    version: 8, name: theme === 'light' ? 'YatraFlow Linen' : 'YatraFlow Night',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.land } },
      fill('built-up', 'landuse', p.built, classes(['residential', 'industrial', 'commercial', 'retail'])),
      fill('green-cover', 'landcover', p.green, classes(['wood', 'grass', 'wetland'])),
      fill('green-use', 'landuse', p.green, classes(['forest', 'grass', 'orchard', 'vineyard', 'cemetery'])),
      fill('parks', 'park', p.green),
      fill('water', 'water', p.water, ['!=', ['get', 'brunnel'], 'tunnel']),
      { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': p.river, 'line-width': width(0.5, 3) } },
      { id: 'country-boundary', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2], paint: { 'line-color': p.boundary, 'line-width': width(0.8, 1.5) } },
      { id: 'state-boundary', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', minzoom: 5, filter: ['==', ['get', 'admin_level'], 4], paint: { 'line-color': p.boundary, 'line-width': 1, 'line-dasharray': [3, 3] } },
      { ...fill('buildings', 'building', p.built), minzoom: 14 },
      ...road('minor-road', ['minor', 'street', 'street_limited', 'service', 'track', 'path', 'pedestrian'], 12, 0.3, 3, p.minor, p),
      ...road('secondary-road', ['secondary', 'tertiary'], 8, 0.4, 4, p.minor, p),
      ...road('primary-road', ['primary'], 6, 0.6, 5, p.primary, p),
      ...road('highway', ['motorway', 'trunk'], 5, 0.8, 7, p.highway, p),
      {
        id: 'road-names', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 12,
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-padding': 8 },
        paint: { 'text-color': p.text, 'text-halo-color': p.halo, 'text-halo-width': 1.5 },
      },
      {
        id: 'water-names', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water_name', minzoom: 10,
        layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-max-width': 8 },
        paint: { 'text-color': p.text, 'text-halo-color': p.water, 'text-halo-width': 1.5 },
      },
      places('village-names', ['village', 'hamlet', 'suburb'], 11, 11, 12, p),
      places('town-names', ['town'], 8, 11, 14, p),
      places('city-names', ['city'], 5, 12, 18, p),
      places('state-names', ['state'], 4, 11, 14, p),
      places('country-names', ['country'], 1, 13, 20, p),
    ],
  }
}

export const WORKSPACE_MAP_STYLES = { light: createStyle('light'), dark: createStyle('dark') }
