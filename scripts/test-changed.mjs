#!/usr/bin/env node
// ============================================================================
// test:changed — the smallest honest focused-test selection.
//
// AGENTS.md §2 (agent rule): hand-written focused test lists twice omitted
// tests the change had touched (tests/production-road-binding.test.ts after a
// builder move; changed prose pinned by lint-ste.test.ts), so the local
// "focused" run went green while the full gate went red. This script derives
// the list from git instead of from memory.
//
// Selection = the union of test files among:
//   - files changed vs the merge base of --base and HEAD (default: origin/test)
//   - staged files
//   - unstaged files
//   - untracked files
// plus every path passed via --extra (an existing test file, by exact path).
//
// Usage:
//   npm run test:changed                    # vs merge base of origin/test
//   npm run test:changed -- --base <ref>    # a named batch base; pass it for
//                                           # a batch whose base is not the
//                                           # integration branch, so the
//                                           # selection cannot silently drift
//   npm run test:changed -- --extra tests/x.test.ts [--extra ...]
//   npm run test:changed -- --print         # print the selection, run nothing
//
// Contract:
//   - every git call spawns an argument array (no shell, no interpolation);
//     paths stay stable for Unicode and Windows names (git -z + core.quotePath off)
//   - prints the selected files, then runs `vitest run <files>`, then exits
//     with the child's exact exit code — no empty green: a run whose source
//     changed but that selects zero tests exits 1 with a named diagnostic
//   - it does not replace the full gate; `npm run verify` and CI still run
//     the whole suite
// Exit codes: 0 pass · 1 no selection / nothing to verify / child failure ·
// 2 usage error.
// ============================================================================

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TEST_RE = /(^|[\\/])tests[\\/].+\.test\.tsx?$/

/** A bad invocation or a bad ref. The CLI turns this into exit code 2. */
export class UsageError extends Error {}

/**
 * The selection producer. Real git against `repoRoot` (default: this repo),
 * NUL-separated, argument-array spawns, no shell. Returns the plan; running
 * vitest stays with the CLI. A changed test path that no longer exists
 * (deleted on the branch) is deliberately NOT selected — vitest must never
 * receive a missing file — and counts as a source change, so a delete cannot
 * slip through as an empty green either.
 */
export function selectChangedTests({ repoRoot: root = repoRoot, base, extras = [] } = {}) {
  const git = (args) => {
    const res = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (res.error) throw new UsageError(`git ${args.join(' ')} failed to start: ${res.error.message}`)
    if (res.status !== 0) {
      throw new UsageError(`git ${args.join(' ')} exited ${res.status}: ${(res.stderr || '').trim()}`)
    }
    return res.stdout
  }
  const gitLinesZ = (args) => git(args).split('\0').filter(Boolean)

  for (const e of extras) {
    if (!TEST_RE.test(e.split(path.sep).join('/'))) {
      throw new UsageError(`--extra ${e} is not a tests/**/*.test.ts path.`)
    }
    if (!existsSync(path.join(root, e))) {
      throw new UsageError(`--extra ${e} does not exist in the repo.`)
    }
  }

  // The batch base. An explicit --base must resolve to a commit and share a
  // merge base with HEAD; the default is origin/test (the integration branch).
  let baseSha
  if (base !== undefined) {
    const sha = git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).trim()
    if (!sha) throw new UsageError(`--base ${base} is not a commit in this repository.`)
    const mb = git(['merge-base', sha, 'HEAD']).trim()
    if (!mb) throw new UsageError(`--base ${base} shares no merge base with HEAD.`)
    baseSha = mb
  } else {
    baseSha = git(['merge-base', 'origin/test', 'HEAD']).trim()
    if (!baseSha) throw new UsageError('origin/test shares no merge base with HEAD; pass --base <ref> explicitly.')
  }

  const changedTests = new Set()
  let sawSourceChange = false
  const addPaths = (paths) => {
    for (const p of paths) {
      const rel = p.split(path.sep).join('/')
      if (TEST_RE.test(rel) && existsSync(path.join(root, rel))) changedTests.add(rel)
      else sawSourceChange = true
    }
  }

  // One union, five sources. NUL separators everywhere; no shell.
  addPaths(gitLinesZ(['diff', '--name-only', '-z', `${baseSha}..HEAD`]))
  addPaths(gitLinesZ(['diff', '--name-only', '-z', '--cached']))
  addPaths(gitLinesZ(['diff', '--name-only', '-z']))
  addPaths(gitLinesZ(['ls-files', '--others', '--exclude-standard', '-z']))
  for (const e of extras) changedTests.add(e.split(path.sep).join('/'))

  return { base: baseSha, selected: [...changedTests].sort(), sawSourceChange }
}

function usage(message) {
  console.error(`test:changed: ${message}`)
  console.error('usage: npm run test:changed [-- --base <ref>] [--extra <test path>...] [--print]')
  process.exitCode = 2
}

function main() {
  const argv = process.argv.slice(2)
  const extras = []
  let base
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--extra') {
      const v = argv[i + 1]
      if (!v) return usage('--extra needs a test path.')
      extras.push(v)
      i++
    } else if (argv[i] === '--base') {
      const v = argv[i + 1]
      // A dangling `--base` must not silently fall back to origin/test: the
      // operator asked for a boundary, and a default would hide the drift.
      if (!v || v.startsWith('--')) return usage('--base needs a ref.')
      base = v
      i++
    } else if (argv[i] !== '--print') {
      return usage(`unknown argument ${argv[i]}.`)
    }
  }

  let plan
  try {
    plan = selectChangedTests({ base, extras })
  } catch (error) {
    if (error instanceof UsageError) return usage(error.message)
    throw error
  }
  const { base: baseSha, selected, sawSourceChange } = plan

  if (argv.includes('--print')) {
    console.log(JSON.stringify({ base: baseSha, selected }, null, 2))
    return
  }

  if (selected.length === 0) {
    if (sawSourceChange) {
      console.error(
        'test:changed: the tree changes source files but selects zero tests. ' +
        'Add or name a test with --extra, or run the full gate (npm run verify). Not passing this as green.',
      )
      process.exitCode = 1
      return
    }
    console.error('test:changed: no changed files and no --extra; nothing to run.')
    process.exitCode = 1
    return
  }

  console.log(`test:changed: base ${baseSha.slice(0, 7)} — ${selected.length} test file(s):`)
  for (const f of selected) console.log(`  ${f}`)

  // Windows: `npx` needs a shell to resolve, which would reintroduce the
  // interpolation this script exists to avoid. Vitest ships a JS entry, so
  // spawn the current Node against it directly.
  const viteEntry = path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs')
  const res = spawnSync(process.execPath, [viteEntry, 'run', ...selected, '--maxWorkers=1'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  })
  if (res.error) {
    console.error(`test:changed: could not start vitest: ${res.error.message}`)
    process.exitCode = 1
    return
  }
  // The child's verdict is this script's verdict, exactly.
  process.exitCode = res.status ?? 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
