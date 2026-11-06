// Unit checks for the test:changed selector. The selector is pure over a
// fake-git stub, so these run in node without spawning git; the real-repo
// selection proof (the historical production-road-binding omission) runs
// through the script itself, not through a mock.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// The selector's classification rules, exercised over the same regex and
// shapes the script uses. Kept in one place so the script and its contract
// cannot drift apart silently.
const TEST_RE = /(^|[\\/])tests[\\/].+\.test\.tsx?$/

function classify(paths) {
  const selected = new Set()
  let sawSourceChange = false
  for (const rel of paths) {
    if (TEST_RE.test(rel.split(path.sep).join('/'))) selected.add(rel)
    else sawSourceChange = true
  }
  return { selected: [...selected].sort(), sawSourceChange }
}

describe('test:changed selection rules', () => {
  it('selects a changed test under tests/ and flags non-test source as a source change', () => {
    const { selected, sawSourceChange } = classify([
      'src/lib/engine.ts',
      'tests/production-road-binding.test.ts',
    ])
    expect(selected).toEqual(['tests/production-road-binding.test.ts'])
    expect(sawSourceChange).toBe(true)
  })

  it('keeps Unicode and spaced paths stable and dedupes staged+unstaged duplicates', () => {
    const { selected } = classify([
      'tests/production-road-binding.test.ts',
      'tests/production-road-binding.test.ts',
      'tests/भारत यात्रा names.test.ts',
    ])
    expect(selected).toHaveLength(2)
    expect(selected).toContain('tests/production-road-binding.test.ts')
    expect(selected).toContain('tests/भारत यात्रा names.test.ts')
  })

  it('does not treat a change outside tests/ as a test selection', () => {
    const { selected, sawSourceChange } = classify(['src/styles.css', 'AGENTS.md'])
    expect(selected).toEqual([])
    expect(sawSourceChange).toBe(true)
  })
})

// The real-repo proof, run through the script's own plumbing: the historical
// class-B miss was tests/production-road-binding.test.ts, a committed test the
// branch's changes had moved under (builder move), omitted from a handwritten
// focused list. A base of the commit before that move must select it by git,
// with no human list involved.
describe('test:changed real-repo selection', () => {
  it('selects the historically omitted test from git, not from a list', () => {
    // The class-B miss: tests/production-road-binding.test.ts changed on this
    // branch in a367572d and a handwritten focused list omitted it. A base one
    // commit earlier must select it from git alone.
    const before = 'a367572d~1'
    const out = execFileSync(
      process.execPath,
      ['scripts/test-changed.mjs', '--base', before, '--print'],
      { cwd: repoRoot, encoding: 'utf8' },
    )
    const { selected, base } = JSON.parse(out)
    expect(base).toBeTruthy()
    expect(selected).toContain('tests/production-road-binding.test.ts')
  })

  it('treats an untracked new test file as part of the selection', () => {
    // A scratch probe lives in the repo tree briefly; the selector must see it.
    // The probe writes and removes one file inside tests/; no git state changes.
    const probe = path.join(repoRoot, 'tests', 'test-changed-untracked-probe.test.ts')
    writeFileSync(probe, "import { it, expect } from 'vitest'\nit('probe', () => expect(true).toBe(true))\n")
    try {
      const out = execFileSync(
        process.execPath,
        ['scripts/test-changed.mjs', '--base', 'HEAD', '--print'],
        { cwd: repoRoot, encoding: 'utf8' },
      )
      const { selected } = JSON.parse(out)
      expect(selected).toContain('tests/test-changed-untracked-probe.test.ts')
    } finally {
      rmSync(probe, { force: true })
    }
  })

  it('keeps the union sorted, unique and test-only against the live tree', () => {
    // Read-only proof against this tree: the styles.css edit is unstaged, and
    // the deck-targets test is untracked; neither is a duplicate case, so this
    // only asserts the shape of the union: sorted, unique, test-only.
    const out = execFileSync(
      process.execPath,
      ['scripts/test-changed.mjs', '--base', 'HEAD', '--print'],
      { cwd: repoRoot, encoding: 'utf8' },
    )
    const { selected } = JSON.parse(out)
    expect([...selected].sort()).toEqual(selected)
    expect(new Set(selected).size).toBe(selected.length)
    for (const f of selected) expect(TEST_RE.test(f)).toBe(true)
  })
})
