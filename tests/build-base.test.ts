import { describe, expect, it } from 'vitest'
import viteConfig from '../vite.config'

async function buildBase(): Promise<string> {
  if (typeof viteConfig !== 'function') throw new Error('Expected the project configuration factory')
  const config = await viteConfig({ command: 'build', mode: 'production', isSsrBuild: false, isPreview: false })
  return config.base ?? '/'
}

describe('built entry assets stay rooted across history routes', () => {
  // A relative build base resolves an entry script under /trip/<id>/assets
  // after refresh. Vite dev rewrites disguise that failure; the built app does not.
  it.each(['/trip/fixture/timeline', '/creator/fixture', '/pub/fixture'])('loads the same entry asset from %s', async path => {
    const base = await buildBase()
    const asset = new URL(`${base}assets/app.js`, `https://example.invalid${path}`)
    expect(asset.href).toBe('https://example.invalid/assets/app.js')
  })

  it('keeps the Capacitor root shell on its own local asset origin', async () => {
    const base = await buildBase()
    expect(new URL(`${base}assets/app.js`, 'https://localhost/index.html#/trip/fixture/timeline').href)
      .toBe('https://localhost/assets/app.js')
  })
})
