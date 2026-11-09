import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import packageJson from './package.json' with { type: 'json' }

const providerMock = fileURLToPath(new URL('./dev/mocks/map-workspace-geocode.ts', import.meta.url))

const ROUTING_MOCK_ID = '\0isolated-map-routing-transport'
const ROUTING_MOCK = `
import { legBetween } from '/src/lib/engine.ts'
export function coordValid(point) {
  if (typeof point.lat !== 'number' || typeof point.lng !== 'number') return null
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null
  if (point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) return null
  if (point.lat === 0 && point.lng === 0) return null
  return point
}
export async function routePath(points, assumptions) {
  return points.slice(1).map((point, index) => {
    const from = points[index]
    const estimate = legBetween(from, point, assumptions)
    return {
      distanceKm: estimate.distanceKm,
      durationMinutes: estimate.durationMinutes,
      source: 'osrm',
      geometry: [[from.lng, from.lat], [point.lng, point.lat]],
    }
  })
}
export async function roadLegBetween(from, to, assumptions) {
  return (await routePath([from, to], assumptions))[0]
}
export function clearRouteCacheForTests() {}
export function routeCacheSizeForTests() { return 0 }
export function routeGeometryToAnchors(geometry) {
  return geometry.map(([lng, lat]) => ({ lat, lng }))
}
export function routesEnabled() { return false }
export async function googleRoute() { throw new Error('Synthetic routing does not call Google') }
export function travelModeFor() { return 'DRIVE' }
export class QuotaExhaustedError extends Error {}
`

export default defineConfig({
  plugins: [react(), {
    name: 'isolated-map-provider-transport', enforce: 'pre',
    resolveId(source, importer) {
      const importerPath = importer?.replaceAll('\\', '/') ?? ''
      if (importerPath.endsWith('/dev/mocks/map-workspace-geocode.ts')) return null
      if (/(?:^|\/)geocode(?:\.ts)?$/.test(source)) return providerMock
      if (/(?:^|\/)routing(?:\.ts)?$/.test(source)) return ROUTING_MOCK_ID
      if (/(?:^|\/)providers\/routes(?:\.ts)?$/.test(source)) return ROUTING_MOCK_ID
      return null
    },
    load(id) { if (id === ROUTING_MOCK_ID) return ROUTING_MOCK },
  }, {
    name: 'local-maplibre-worker', enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/components/mapcn/map.tsx')) return null
      if (!code.includes('unpkg.com/maplibre-gl@')) return null
      return { code: code.replace('`https://unpkg.com/maplibre-gl@${MapLibreGL.getVersion()}/dist/maplibre-gl-worker.mjs`', '`/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs`'), map: null }
    },
  }],
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
  server: { port: 5211, strictPort: true, host: '127.0.0.1' },
})
