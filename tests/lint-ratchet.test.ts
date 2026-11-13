// The lint ratchet (AGENTS.md §2 rule 14) is a guardrail, so it gets pinned.
// A ratchet that stops catching a regression is worse than no ratchet: it
// reports green while the count climbs.
//
// These tests run the real script. They do not re-implement its comparison,
// because a copy of that logic here could pass while the script fails.
//
// The suite pays for one real `eslint src` run, in beforeAll. Every other case
// replays a saved report through the script's LINT_RATCHET_REPORT seam and
// writes to a fixture baseline through LINT_RATCHET_BASELINE. Both seams are
// documented in the header of scripts/lint-ratchet.mjs.
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'scripts', 'lint-ratchet.mjs')
const BASELINE = path.join(ROOT, 'eslint-baseline.json')
const PROBE_REL = 'src/__ratchet_probe_tmp.ts'

// One full `eslint src` run took about two minutes on this tree. The default
// 5s timeout would fail on the work, not the assertion.
const REAL_RUN_MS = 300_000
// A replayed case is one node process, far under this budget.
const CASE_MS = 20_000

type Seam = 'LINT_RATCHET_REPORT' | 'LINT_RATCHET_SAVE_REPORT' | 'LINT_RATCHET_BASELINE'

function ratchet(args: string[] = [], seams: Partial<Record<Seam, string>> = {}): SpawnSyncReturns<string> {
  const env: NodeJS.ProcessEnv = { ...process.env }
  // An inherited seam would replace the real ESLint run, so drop them all first.
  for (const key of Object.keys(env)) {
    if (key.startsWith('LINT_RATCHET_')) delete env[key]
  }
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...env, ...seams },
  })
}

// Scratch files for the replayed cases. The directory is removed after the file.
const workDir = mkdtempSync(path.join(tmpdir(), 'lint-ratchet-'))
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

let scratchCount = 0
function scratch(text: string, name = `scratch-${++scratchCount}.json`): string {
  const file = path.join(workDir, name)
  writeFileSync(file, text, 'utf8')
  return file
}

// One eslint result entry, in the shape `eslint -f json` writes. Every message
// is an error, and `ruleIds` holds one rule id per message.
function lintFile(rel: string, ruleIds: string[]) {
  return {
    filePath: path.join(ROOT, rel),
    messages: ruleIds.map(ruleId => ({ ruleId, severity: 2 })),
    errorCount: ruleIds.length,
    warningCount: 0,
  }
}

// A baseline file in the committed format. `files` maps a path to rule counts.
function baselineFile(files: Record<string, Record<string, number>>): string {
  let errors = 0
  for (const rules of Object.values(files)) {
    for (const n of Object.values(rules)) errors += n
  }
  const text = JSON.stringify({ generatedBy: 'npm run lint:ratchet -- --update', errors, warnings: 0, files }, null, 2) + '\n'
  return scratch(text)
}

// Runs the check against a replayed report and a fixture baseline.
function check(report: unknown[], baselinePath: string, args: string[] = []): SpawnSyncReturns<string> {
  return ratchet(args, {
    LINT_RATCHET_REPORT: scratch(JSON.stringify(report)),
    LINT_RATCHET_BASELINE: baselinePath,
  })
}

const output = (r: SpawnSyncReturns<string>) => r.stdout + r.stderr

describe('lint ratchet, one real eslint run (scripts/lint-ratchet.mjs)', () => {
  const savedReport = path.join(workDir, 'real-report.json')
  let real!: SpawnSyncReturns<string>

  beforeAll(() => {
    real = ratchet([], { LINT_RATCHET_SAVE_REPORT: savedReport })
  }, REAL_RUN_MS)

  it('passes against the committed baseline', () => {
    expect(real.stdout).toContain('eslint:')
    expect(real.status, output(real)).toBe(0)
  })

  it('fails when a file adds errors', () => {
    // The real report, plus one probe file that adds a new error of each rule.
    // The probe is never written to src/, so the tree is left as it was.
    const report = JSON.parse(readFileSync(savedReport, 'utf8')) as unknown[]
    report.push(lintFile(PROBE_REL, ['no-explicit-any', 'no-unused-vars']))
    const r = check(report, BASELINE)
    expect(r.status).toBe(1)
    // It must name the file and each rule, not just report a higher total.
    expect(output(r)).toContain(PROBE_REL)
    expect(output(r)).toContain('no-explicit-any')
    expect(output(r)).toContain('no-unused-vars')
  })

  it('reports what --update wrote, so a raise shows in the diff', () => {
    // A stale baseline forces the rewrite. The result must be the committed
    // file, byte for byte, because the real tree has not changed.
    const committed = readFileSync(BASELINE, 'utf8')
    const stale = baselineFile({ 'src/stale.ts': { 'no-unused-vars': 9 } })
    const r = ratchet(['--update'], { LINT_RATCHET_REPORT: savedReport, LINT_RATCHET_BASELINE: stale })
    expect(r.status, output(r)).toBe(0)
    expect(r.stdout).toContain('baseline updated:')
    expect(readFileSync(stale, 'utf8')).toBe(committed)
    expect(readFileSync(BASELINE, 'utf8')).toBe(committed)
  })
})

describe('lint ratchet comparison, on replayed reports (no eslint run)', () => {
  it('fails when a file gains an error, and names the file and the rule', () => {
    const r = check([lintFile('src/a.ts', ['no-unused-vars', 'no-unused-vars'])], baselineFile({ 'src/a.ts': { 'no-unused-vars': 1 } }))
    expect(r.status).toBe(1)
    expect(output(r)).toContain('src/a.ts  no-unused-vars  1 -> 2')
  }, CASE_MS)

  it('fails when a new file adds an error, even though the total falls elsewhere', () => {
    // The total drops from 2 to 1, but src/new.ts is a new error in a new file.
    const r = check([lintFile('src/new.ts', ['no-explicit-any'])], baselineFile({ 'src/a.ts': { 'no-unused-vars': 2 } }))
    expect(r.status).toBe(1)
    expect(output(r)).toContain('src/new.ts  no-explicit-any  0 -> 1')
  }, CASE_MS)

  it('fails when one rule grows while the total holds still', () => {
    const r = check([lintFile('src/a.ts', ['no-explicit-any'])], baselineFile({ 'src/a.ts': { 'no-unused-vars': 1 } }))
    expect(r.status).toBe(1)
    expect(output(r)).toContain('src/a.ts  no-explicit-any  0 -> 1')
  }, CASE_MS)

  it('passes when a count falls, and says how to lower the baseline', () => {
    const r = check([lintFile('src/a.ts', ['no-unused-vars'])], baselineFile({ 'src/a.ts': { 'no-unused-vars': 2 } }))
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('ratchet: 1 errors and 0 warnings fixed.')
    expect(r.stdout).toContain('Run: npm run lint:ratchet -- --update')
  }, CASE_MS)

  it('--update writes the baseline it is given, and leaves the committed one alone', () => {
    const committed = readFileSync(BASELINE, 'utf8')
    const target = path.join(workDir, 'update-target.json')
    const r = check([lintFile('src/a.ts', ['no-unused-vars'])], target, ['--update'])
    expect(r.status, output(r)).toBe(0)
    expect(r.stdout).toContain('baseline updated: 1 errors, 0 warnings, 1 files')
    const expected = JSON.stringify({ generatedBy: 'npm run lint:ratchet -- --update', errors: 1, warnings: 0, files: { 'src/a.ts': { 'no-unused-vars': 1 } } }, null, 2) + '\n'
    expect(readFileSync(target, 'utf8')).toBe(expected)
    expect(readFileSync(BASELINE, 'utf8')).toBe(committed)
  }, CASE_MS)

  it('fails closed when the report is not JSON', () => {
    const r = ratchet([], { LINT_RATCHET_REPORT: scratch('eslint crashed here') })
    expect(r.status).toBe(2)
    expect(output(r)).toContain('eslint report was not JSON')
  }, CASE_MS)

  it('fails closed when the report is empty', () => {
    const r = ratchet([], { LINT_RATCHET_REPORT: scratch('') })
    expect(r.status).toBe(2)
    expect(output(r)).toContain('eslint produced no report.')
  }, CASE_MS)

  it('fails closed when the baseline is missing', () => {
    const r = check([lintFile('src/a.ts', ['no-unused-vars'])], path.join(workDir, 'no-such-baseline.json'))
    expect(r.status).toBe(2)
    expect(output(r)).toContain('No eslint-baseline.json')
  }, CASE_MS)
})

describe('lint ratchet baseline file', () => {
  it('the baseline records its own totals', () => {
    const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
    expect(typeof base.errors).toBe('number')
    expect(typeof base.warnings).toBe('number')
    expect(base.errors).toBeGreaterThan(0)
  })
})
