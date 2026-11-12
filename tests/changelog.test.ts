import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { assertInsertionOnly, check, parseFragment, planRelease, releaseAt, renderPatch, splitChangelog } from '../scripts/changelog.mjs'

const script = fileURLToPath(new URL('../scripts/changelog.mjs', import.meta.url))
const first = 'changelog.d/pending/00000000-0000-4000-8000-000000000001.md'
const second = 'changelog.d/pending/00000000-0000-4000-8000-000000000002.md'
const note = '### Fixed\n\n- **Saved stops keep their day.** The update keeps the saved day.\n'
const otherNote = '### Added\n\n- **Trips have a map.** Open the map tab to see the route.\n'
const original = '# Changelog\n\nKeep this preamble.\n\n## [Unreleased]\n\n### Fixed\n\n- **Old notes stay here.**\n\n## [1.0.0] - 2026-11-01\n\nPublished text.\n\n## [0.9.0-native] - 2026-10-01\n\nNative text.\n'
const roots: string[] = []
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
function put(root: string, file: string, text: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  writeFileSync(path.join(root, file), text)
}
function commit(root: string) {
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture')
  return git(root, 'rev-parse', 'HEAD')
}
function fixture(withNote = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'changelog-'))
  roots.push(root)
  git(root, 'init', '-q', '-b', 'test')
  git(root, 'config', 'user.email', 'fixture@example.test')
  git(root, 'config', 'user.name', 'Fixture')
  git(root, 'config', 'core.autocrlf', 'false')
  put(root, 'CHANGELOG.md', original)
  if (withNote) put(root, first, note)
  return { root, base: commit(root) }
}
function cli(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '', GITHUB_EVENT_PATH: '', GITHUB_EVENT_NAME: '' } })
}
function applyFixture(root: string, plan: ReturnType<typeof planRelease>) {
  execFileSync('git', ['apply', '--unidiff-zero', '-'], { cwd: root, input: renderPatch(plan), stdio: 'pipe' })
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

describe('fragment format', () => {
  it('keeps section order and bold outcomes', () => {
    expect(parseFragment(first, otherNote + '\n' + note).entries).toHaveLength(2)
    for (const bad of ['', '### Fixed\n', note + '\n### Added\n', note.replace('**', ''), note.replace('Fixed', 'Security'), note.replaceAll('\n', '\r\n')]) {
      expect(() => parseFragment(first, bad)).toThrow()
    }
    expect(() => parseFragment('changelog.d/pending/issue-123.md', note)).toThrow()
  })
  it('runs STE on untracked fragment prose before accepting good prose', () => {
    const { root } = fixture()
    put(root, first, note.replace('The update keeps the saved day.', ['Uti', 'lize the helper.'].join('')))
    const ste = fileURLToPath(new URL('../scripts/lint-ste.mjs', import.meta.url))
    expect(spawnSync(process.execPath, [ste], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '' } }).status).toBe(1)
    expect(() => check(root)).toThrow()
    put(root, first, note)
    expect(spawnSync(process.execPath, [ste], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '' } }).status).toBe(0)
    expect(check(root).fragments).toBe(1)
  }, 20000)
})

describe('release safety', () => {
  it.each(['\n', '\r\n'])('adds lines and preserves raw history with %j', (newline) => {
    const text = original.replaceAll('\n', newline)
    const plan = planRelease(text, [parseFragment(first, note), parseFragment(second, otherNote)], [], '1.1.0', '2026-11-12', 'a'.repeat(40))
    expect(plan.after.startsWith(splitChangelog(text).prefix)).toBe(true)
    expect(plan.after.endsWith(splitChangelog(text).history)).toBe(true)
    expect(plan.after).toContain('Old notes stay here.')
    expect(plan.after.indexOf('### Added')).toBeLessThan(plan.after.indexOf('### Fixed'))
  })
  it('rejects the 830-to-21-line regression even when insertions are claimed', () => {
    const before = original + 'History.\n'.repeat(830)
    expect(() => assertInsertionOnly(before, original, [{ offset: 0, text: 'New lines.\n' }])).toThrow(/line-loss/)
    expect(() => assertInsertionOnly(original, original.replace('Published', 'Rewritten') + '\n', [{ offset: 0, text: '\n' }])).toThrow(/insertions only/)
  })
  it.each([original.replace('## [Unreleased]', '## Pending'), original.replace('## [Unreleased]', '## [Unreleased]\n\n## [Unreleased]'), original + '<<<<<<< branch\n'])('refuses unsafe input without writing', (text) => {
    const { root } = fixture(true)
    put(root, 'CHANGELOG.md', text)
    const source = commit(root)
    expect(cli(root, 'release', '--base', source, '--version', '1.1.0', '--date', '2026-11-12', '--write').status).toBe(1)
    expect(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toBe(text)
    expect(existsSync(path.join(root, 'changelog-release.patch'))).toBe(false)
  })
  it('prints a deterministic patch by default and validates the applied receipt', () => {
    const { root, base } = fixture(true)
    const plan = releaseAt(root, base, '1.1.0', '2026-11-12')
    const result = cli(root, 'release', '--base', base, '--version', '1.1.0', '--date', '2026-11-12')
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(renderPatch(plan))
    expect(git(root, 'status', '--porcelain')).toBe('')
    applyFixture(root, plan)
    expect(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toBe(plan.after)
    expect(check(root, { base }).receipts).toBe(1)
    expect(() => releaseAt(root, commit(root), '1.1.0', '2026-11-12')).toThrow(/already assembled/)
  }, 20000)
  it('rejects duplicate bullets, reused IDs, stale inputs, and fake receipts', () => {
    const { root, base } = fixture(true)
    expect(() => planRelease(original, [parseFragment(first, note), parseFragment(second, note)], [], '1.1.0', '2026-11-12', base)).toThrow(/Duplicate/)
    put(root, first, otherNote)
    expect(cli(root, 'release', '--base', base, '--version', '1.1.0', '--date', '2026-11-12').status).toBe(1)
    put(root, first, note)
    const plan = releaseAt(root, base, '1.1.0', '2026-11-12')
    applyFixture(root, plan)
    put(root, first, note)
    expect(() => check(root)).toThrow(/Retired/)
    rmSync(path.join(root, first))
    put(root, 'CHANGELOG.md', plan.after.replace('Native text.', 'Lost native text.'))
    expect(() => check(root, { base })).toThrow(/does not match/)
  }, 20000)
})

describe('PR coverage', () => {
  it('requires a substantive fragment belonging to this PR', () => {
    const { root, base } = fixture(true)
    expect(() => check(root, { base })).toThrow(/needs a new/)
    put(root, second, note)
    expect(() => check(root, { base })).toThrow(/Duplicate/)
    put(root, second, otherNote)
    expect(check(root, { base }).fragments).toBe(2)
  }, 20000)
  it('does not count whitespace edits or renames', () => {
    const { root, base } = fixture(true)
    put(root, first, note.replace('The update', 'The  update'))
    expect(() => check(root, { base })).toThrow(/needs a new/)
    rmSync(path.join(root, first))
    put(root, second, note)
    expect(() => check(root, { base })).toThrow(/Only a checked release/)
  }, 20000)
  it('checks PR head separately from the merged tree', () => {
    const { root, base } = fixture()
    git(root, 'switch', '-qc', 'feature')
    put(root, 'feature.txt', 'change\n')
    const head = commit(root)
    git(root, 'switch', '-q', 'test')
    put(root, first, note)
    commit(root)
    git(root, 'merge', '--no-edit', 'feature')
    expect(() => check(root, { base, head })).toThrow(/needs a new/)
  }, 20000)
})
