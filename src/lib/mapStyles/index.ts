import type { SkySpecification, StyleSpecification } from 'maplibre-gl'
import linenJson from './yatraflow-linen.json'
import nightJson from './yatraflow-night.json'
import type { MapViewMode } from '../mapViewModes'

// The supplied Linen and Night styles (docs/redesign/map-v2). They are modified
// OpenFreeMap Liberty styles with a DEM source and a hillshade layer. The app
// draws the route, corridor and marks on top of them.
export const WORKSPACE_DEM_SOURCE_ID = 'dem'
export const WORKSPACE_HILLSHADE_LAYER_ID = 'hillshade'
/** Hillshade strength in 2D, as set in the supplied styles. */
export const HILLSHADE_2D_EXAGGERATION = 0.45
/** Terrain mode shows more relief on the same layer. */
export const HILLSHADE_TERRAIN_EXAGGERATION = 0.8
/** 3D mode lifts the real elevation by this factor. */
export const TERRAIN_3D_EXAGGERATION = 1.3
export const DEM_ATTRIBUTION = 'Terrain: AWS Terrain Tiles / ETOPO1'

type Theme = 'light' | 'dark'

// The sky must be there for pitched views only. Colours follow each basemap land colour.
export const WORKSPACE_SKY: Record<Theme, SkySpecification> = {
  light: { 'sky-color': '#CFE3E6', 'horizon-color': '#EFE9DF', 'fog-color': '#EFE9DF', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4 },
  dark: { 'sky-color': '#0A1A2E', 'horizon-color': '#1B2C46', 'fog-color': '#0F1928', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4 },
}

// The DEM source ships its own credit, so the attribution control names the terrain data.
function withDemAttribution(style: unknown): StyleSpecification {
  const base = style as StyleSpecification
  const dem = base.sources[WORKSPACE_DEM_SOURCE_ID]
  if (!dem || dem.type !== 'raster-dem') return base
  return { ...base, sources: { ...base.sources, [WORKSPACE_DEM_SOURCE_ID]: { ...dem, attribution: DEM_ATTRIBUTION } } }
}

export const LINEN_STYLE: StyleSpecification = withDemAttribution(linenJson)
export const NIGHT_STYLE: StyleSpecification = withDemAttribution(nightJson)
export const WORKSPACE_BASEMAP_STYLES: Record<Theme, StyleSpecification> = { light: LINEN_STYLE, dark: NIGHT_STYLE }

/** The slice of the map the view-mode reconciler touches. */
export interface WorkspaceViewMap {
  getSource(id: string): unknown
  getLayer(id: string): unknown
  setPaintProperty(layerId: string, name: string, value: unknown): void
  getTerrain(): unknown
  setTerrain(terrain: unknown): void
  setSky(sky?: SkySpecification): void
}

/**
 * Reconcile the supplied style to the view mode. It is safe to run again after
 * each style swap. A missing DEM source (tiles failed) leaves the flat map as is.
 */
export function applyWorkspaceViewMode(map: WorkspaceViewMap, mode: MapViewMode, theme: Theme): void {
  const hasDem = !!map.getSource(WORKSPACE_DEM_SOURCE_ID)
  if (map.getLayer(WORKSPACE_HILLSHADE_LAYER_ID)) {
    map.setPaintProperty(WORKSPACE_HILLSHADE_LAYER_ID, 'hillshade-exaggeration', mode === 'terrain' ? HILLSHADE_TERRAIN_EXAGGERATION : HILLSHADE_2D_EXAGGERATION)
  }
  if (mode === '3d' && hasDem) {
    map.setTerrain({ source: WORKSPACE_DEM_SOURCE_ID, exaggeration: TERRAIN_3D_EXAGGERATION })
    map.setSky(WORKSPACE_SKY[theme])
    return
  }
  if (map.getTerrain()) map.setTerrain(null)
  map.setSky(undefined)
}
