// The fixture has one host for every review mode. A mode must stay mountable.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('../dev/map-workspace-fixture.tsx', import.meta.url))
const MOCK = fileURLToPath(new URL('../dev/mocks/map-workspace-geocode.ts', import.meta.url))

describe('map workspace fixture modes', () => {
  it('keeps every review state in the synthetic provider', () => {
    const mock = readFileSync(MOCK, 'utf8')
    for (const state of ['failed', 'empty', 'quota']) {
      expect(mock).toContain(`'${state}'`)
    }
  })

  it('passes editable through the same host cell for viewer mode', () => {
    const source = readFileSync(FIXTURE, 'utf8')
    expect(source).toContain("params.get('role') !== 'viewer'")
    expect(source).toContain('editable={params.get')
  })

  it('keeps writes synthetic and never names a real trip id', () => {
    const source = readFileSync(FIXTURE, 'utf8')
    expect(source).toContain('No trip or backend was changed')
    expect(source).toContain("id: 'fixture-map-local-only'")
    expect(source).not.toContain('supabase')
  })
})
