import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import packageJson from './package.json' with { type: 'json' }

const providerMock = fileURLToPath(new URL('./dev/mocks/map-workspace-geocode.ts', import.meta.url))

export default defineConfig({
  plugins: [react(), {
    name: 'isolated-map-provider-transport', enforce: 'pre',
    resolveId(source, importer) {
      if (importer?.replaceAll('\\', '/').endsWith('/dev/mocks/map-workspace-geocode.ts')) return null
      if (/(?:^|\/)geocode(?:\.ts)?$/.test(source)) return providerMock
      return null
    },
  }],
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
  server: { port: 5211, strictPort: true, host: '127.0.0.1' },
})
