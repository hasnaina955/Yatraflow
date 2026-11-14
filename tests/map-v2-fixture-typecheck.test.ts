// The fixture host must keep the MapTab contract. The main tsconfig includes
// only src, so this test runs the fixture config and checks a missing prop.
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const CONFIG = path.join(ROOT, 'tsconfig.map-fixture.json')
const FIXTURE = path.join(ROOT, 'dev', 'map-workspace-fixture.tsx')
const SLOW = 120000

function typecheck() {
  return spawnSync(process.execPath, [TSC, '-p', CONFIG, '--pretty', 'false'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: '' },
  })
}

describe('map workspace fixture typecheck', () => {
  it('passes for the committed host', () => {
    const result = typecheck()
    expect(result.status, result.stdout + result.stderr).toBe(0)
  }, SLOW)

  it('fails when a required MapTab prop is missing', () => {
    const source = readFileSync(FIXTURE, 'utf8')
    expect(source).toContain('crewSeeds={crewSeeds}')
    const dir = mkdtempSync(path.join(tmpdir(), 'map-fixture-typecheck-'))
    const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as { include: string[] }
    const broken = source.replace(' crewSeeds={crewSeeds}', '')
    // The copy stays in dev/ so its ../src imports still resolve.
    const brokenFixture = path.join(ROOT, 'dev', 'map-workspace-fixture.typecheck-broken.tsx')
    const brokenConfig = path.join(dir, 'tsconfig.json')
    writeFileSync(brokenFixture, broken)
    try {
      config.include = config.include.map(entry => entry === 'dev/map-workspace-fixture.tsx' ? brokenFixture : path.join(ROOT, entry))
      writeFileSync(brokenConfig, JSON.stringify({ ...config, extends: path.join(ROOT, 'tsconfig.json') }))
      const result = spawnSync(process.execPath, [TSC, '-p', brokenConfig, '--pretty', 'false'], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: '' },
      })
      expect(result.status).not.toBe(0)
      expect(result.stdout + result.stderr).toMatch(/crewSeeds/i)
    } finally {
      rmSync(brokenFixture, { force: true })
    }
  }, SLOW)
})
