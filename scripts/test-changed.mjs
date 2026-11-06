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

function git(args) {
  const res = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (res.error) throw new Error(`git ${args.join(' ')} failed to start: ${res.error.message}`)
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${res.status}: ${(res.stderr || '').trim()}`)
  }
  return res.stdout
}

// NUL-separated git output is the only shape that survives every path a
// repository can carry (spaces, Unicode, quotes). NUL never appears in a path.
function gitLinesZ(args) {
  const out = git(args)
  return out.split('\0').filter(Boolean)
}

const TEST_RE = /(^|[\\/])tests[\\/].+\.test\.tsx?$/

const changedTests = new Set()
let sawSourceChange = false

function addPaths(paths) {
  for (const p of paths) {
    const rel = p.split(path.sep).join('/')
    if (TEST_RE.test(rel)) changedTests.add(rel)
    else sawSourceChange = true
  }
}

function usage(message) {
  console.error(`test:changed: ${message}`)
  console.error('usage: npm run test:changed [-- --base <ref>] [--extra <test path>...] [--print]')
  process.exitCode = 2
}

function main() {
  const argv = process.argv.slice(2)
  const argValue = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const extras = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--extra') {
      const v = argv[i + 1]
      if (!v) return usage('--extra needs a test path.')
      extras.push(v)
      i++
    } else if (argv[i] === '--base') {
      i++ // its value; validated below by rev-parse
    } else if (argv[i] !== '--print') {
      return usage(`unknown argument ${argv[i]}.`)
    }
  }
  for (const e of extras) {
    if (!TEST_RE.test(e.split(path.sep).join('/'))) {
      return usage(`--extra ${e} is not a tests/**/*.test.ts path.`)
    }
    if (!existsSync(path.join(repoRoot, e))) {
      return usage(`--extra ${e} does not exist in the repo.`)
    }
  }

  // The batch base. An explicit --base must resolve to a commit and share a
  // merge base with HEAD; the default is origin/test (the integration branch).
  let base
  const baseArg = argValue('--base')
  if (baseArg !== undefined) {
    const sha = git(['rev-parse', '--verify', '--quiet', `${baseArg}^{commit}`]).trim()
    if (!sha) return usage(`--base ${baseArg} is not a commit in this repository.`)
    const mb = git(['merge-base', sha, 'HEAD']).trim()
    if (!mb) return usage(`--base ${baseArg} shares no merge base with HEAD.`)
    base = mb
  } else {
    base = git(['merge-base', 'origin/test', 'HEAD']).trim()
    if (!base) return usage('origin/test shares no merge base with HEAD; pass --base <ref> explicitly.')
  }

  // One union, five sources. NUL separators everywhere; no shell.
  addPaths(gitLinesZ(['diff', '--name-only', '-z', `${base}..HEAD`]))
  addPaths(gitLinesZ(['diff', '--name-only', '-z', '--cached']))
  addPaths(gitLinesZ(['diff', '--name-only', '-z']))
  addPaths(gitLinesZ(['ls-files', '--others', '--exclude-standard', '-z']))
  addPaths(extras)

  const selected = [...changedTests].sort()

  if (argv.includes('--print')) {
    console.log(JSON.stringify({ base, selected }, null, 2))
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

  console.log(`test:changed: base ${base.slice(0, 7)} — ${selected.length} test file(s):`)
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

main()
