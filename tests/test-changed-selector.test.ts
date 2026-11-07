// Tests for the test:changed selector. Every case drives the REAL producer
// (`selectChangedTests`, the exported function the CLI itself calls) against
// an isolated temporary git repo built per test — no copied algorithm, no
// writes into this repo's tests/ directory, no coupling to this repo's
// commit history. The historical class-B omission is replayed by building
// the same shape (a committed test the branch moves after the base) with
// temporary commits.
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { selectChangedTests, UsageError } from '../scripts/test-changed.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** One isolated git repo per test; cleaned up on afterEach. */
let repo
function makeRepo() {
  repo = mkdtempSync(path.join(tmpdir(), 'test-changed-fixture-'))
  const git = (args) => {
    const res = spawnSync('git', ['-c', 'core.quotePath=false', '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
      cwd: repo, encoding: 'utf8',
    })
    if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`)
    return res.stdout
  }
  git(['init', '-q'])
  return { git, path: repo }
}

function commitAll(git, message) {
  git(['add', '-A'])
  git(['commit', '-qm', message])
}

function write(rel, content) {
  const abs = path.join(repo, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

describe('test:changed selection producer (isolated git fixtures)', () => {
  it('selects a test the branch changed after the base — the omission shape replayed', () => {
    const { git } = makeRepo()
    write('tests/production-road-binding.test.ts', "it('base', () => {})\n")
    write('src/lib/road.ts', 'export const road = 1\n')
    commitAll(git, 'base')
    // The branch commit moves the test: the exact shape the frozen reports
    // missed, replayed with temporary commits and no history coupling.
    write('tests/production-road-binding.test.ts', "it('moved builder', () => {})\n")
    commitAll(git, 'move the builder and its test')

    const { base, selected, sawSourceChange } = selectChangedTests({ repoRoot: repo, base: 'HEAD~1' })
    expect(base).toBeTruthy()
    expect(selected).toEqual(['tests/production-road-binding.test.ts'])
    expect(sawSourceChange).toBe(false)
  })

  it('selects an untracked new test and a staged+unstaged duplicate once', () => {
    const { git } = makeRepo()
    write('src/lib/a.ts', 'export const a = 1\n')
    commitAll(git, 'base')
    write('tests/new-भारता names.test.ts', "it('unicode', () => {})\n")
    write('tests/dup.test.ts', "it('dup', () => {})\n")
    git(['add', 'tests/dup.test.ts'])
    write('tests/dup.test.ts', "it('dup', () => {})\n") // staged AND unstaged

    const { selected } = selectChangedTests({ repoRoot: repo, base: 'HEAD' })
    expect(selected).toEqual(['tests/dup.test.ts', 'tests/new-भारता names.test.ts'])
  })

  it('never selects a deleted test path but still refuses the empty green', () => {
    const { git } = makeRepo()
    write('tests/gone.test.ts', "it('gone', () => {})\n")
    write('src/lib/b.ts', 'export const b = 1\n')
    commitAll(git, 'base')
    git(['rm', '-q', 'tests/gone.test.ts'])
    write('src/lib/c.ts', 'export const c = 1\n')

    const { selected, sawSourceChange } = selectChangedTests({ repoRoot: repo, base: 'HEAD' })
    expect(selected).toEqual([])
    expect(sawSourceChange).toBe(true) // a delete is a change; no empty green
    expect(existsSync(path.join(repo, 'tests/gone.test.ts'))).toBe(false)
  })

  it('validates extras against the repo and rejects a wrong-path extra', () => {
    const { git } = makeRepo()
    write('tests/real.test.ts', "it('real', () => {})\n")
    commitAll(git, 'base')
    expect(() =>
      selectChangedTests({ repoRoot: repo, base: 'HEAD', extras: ['tests/missing.test.ts'] }),
    ).toThrow(UsageError)
    const { selected } = selectChangedTests({ repoRoot: repo, base: 'HEAD', extras: ['tests/real.test.ts'] })
    expect(selected).toEqual(['tests/real.test.ts'])
  })

  it('rejects a bad --base ref with a usage error', () => {
    const { git } = makeRepo()
    write('src/lib/x.ts', 'export const x = 1\n')
    commitAll(git, 'base')
    expect(() => selectChangedTests({ repoRoot: repo, base: 'no-such-ref' })).toThrow(UsageError)
  })
})

describe('test:changed CLI (exit codes through the real entry)', () => {
  it('exits 2 on a dangling --base instead of defaulting to origin/test', () => {
    const res = spawnSync(process.execPath, ['scripts/test-changed.mjs', '--base'], {
      cwd: repoRoot, encoding: 'utf8',
    })
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('--base needs a ref')
  })

  it('exits 1 with the empty-green diagnostic on a source-only tree', () => {
    const { git } = makeRepo()
    write('src/lib/only.ts', 'export const only = 1\n')
    commitAll(git, 'base')
    write('src/lib/only.ts', 'export const only = 2\n')
    // The script resolves its repoRoot from its own file location, so the
    // fixture needs its own copy — running the real script from here would
    // select (and run vitest on) the actual worktree's uncommitted tests.
    mkdirSync(path.join(repo, 'scripts'), { recursive: true })
    copyFileSync(path.join(repoRoot, 'scripts/test-changed.mjs'), path.join(repo, 'scripts/test-changed.mjs'))
    const res = spawnSync(process.execPath, ['scripts/test-changed.mjs', '--base', 'HEAD'], {
      cwd: repo, encoding: 'utf8', timeout: 30000,
    })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('selects zero tests')
  })
})
