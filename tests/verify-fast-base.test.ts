// verify:fast --base <rev> (scripts/verify-fast.mjs). The pre-push hook passes
// this flag, so the changed files must be the commits between the base and
// HEAD. Without the flag, the list still reads the working tree, as before.
//
// Each run copies the real script into a fixture repo. Stub `tsc` and `vitest`
// files stand in for the real tools, so these tests check only which files
// are chosen.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../scripts/verify-fast.mjs', import.meta.url))

// Real git and node runs take seconds on a slow Windows runner.
const SLOW = 60000

const fixtureRoots: string[] = []
afterAll(() => {
  for (const dir of fixtureRoots) rmSync(dir, { recursive: true, force: true })
})

function git(cwd: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return r.stdout.trim()
}

describe('verify:fast --base', () => {
  let fx = ''
  let commit1 = ''

  beforeAll(() => {
    fx = mkdtempSync(path.join(tmpdir(), 'verify-fast-base-'))
    fixtureRoots.push(fx)
    const put = (rel: string, text: string) => {
      const file = path.join(fx, rel)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, text)
    }
    // The real script, with line endings normalised to LF.
    put('scripts/verify-fast.mjs', readFileSync(SCRIPT, 'utf8').replace(/\r\n/g, '\n'))
    put('node_modules/typescript/bin/tsc', 'process.exit(0)\n')
    put(
      'node_modules/vitest/vitest.mjs',
      "console.log('stub vitest ' + process.argv.slice(2).join(' '))\nprocess.exit(0)\n",
    )
    put('.gitignore', 'node_modules/\n')
    put('src/a.ts', 'export const a = 1\n')
    put('src/c.ts', 'export const c = 1\n')
    put('tests/a.test.ts', 'export {}\n')

    git(fx, ['init', '-q', '-b', 'main'])
    git(fx, ['config', 'user.name', 'Fixture'])
    git(fx, ['config', 'user.email', 'fixture@example.invalid'])
    git(fx, ['config', 'commit.gpgsign', 'false'])
    git(fx, ['add', '.gitignore', 'scripts', 'src', 'tests'])
    git(fx, ['commit', '-q', '-m', 'base'])
    commit1 = git(fx, ['rev-parse', 'HEAD'])
    git(fx, ['update-ref', 'refs/remotes/origin/test', commit1])

    // A committed change after the base.
    put('src/b.ts', 'export const b = 1\n')
    put('tests/b.test.ts', 'export {}\n')
    git(fx, ['add', 'src/b.ts', 'tests/b.test.ts'])
    git(fx, ['commit', '-q', '-m', 'b'])

    // An uncommitted edit and an untracked file. Only the default mode lists them.
    put('src/c.ts', 'export const c = 2\n')
    put('tests/scratch.test.ts', 'export {}\n')
  })

  const run = (args: string[]) => {
    const r = spawnSync(process.execPath, [path.join(fx, 'scripts', 'verify-fast.mjs'), ...args], {
      cwd: fx,
      encoding: 'utf8',
    })
    return { status: r.status, out: `${r.stdout}${r.stderr}` }
  }

  it('without --base, lists the working tree and untracked files against origin/test', () => {
    const r = run([])
    expect(r.status).toBe(0)
    expect(r.out).toContain('changed: 4 files (4 ts/js, 0 other, 0 deleted)')
    expect(r.out).toContain('vitest related --run src/b.ts src/c.ts tests/b.test.ts tests/scratch.test.ts')
  }, SLOW)

  it('with --base, lists only the commits from the base to HEAD', () => {
    const r = run(['--base', commit1])
    expect(r.status).toBe(0)
    expect(r.out).toContain(`base: ${commit1.slice(0, 12)} (--base ${commit1}, committed changes only)`)
    expect(r.out).toContain('changed: 2 files (2 ts/js, 0 other, 0 deleted)')
    expect(r.out).toContain('vitest related --run src/b.ts tests/b.test.ts')
    expect(r.out).not.toContain('src/c.ts')
    expect(r.out).not.toContain('scratch')
  }, SLOW)

  it('with --base naming no commit, fails with exit code 1', () => {
    const r = run(['--base', 'no-such-revision'])
    expect(r.status).toBe(1)
    expect(r.out).toContain('is not a commit in this clone')
  }, SLOW)

  it('rejects an unknown argument with exit code 2', () => {
    const r = run(['--bogus'])
    expect(r.status).toBe(2)
    expect(r.out).toContain('unknown argument')
  }, SLOW)
})
