#!/usr/bin/env node
// verify:fast, a quick check of the work on this branch. It is NOT the gate.
//
// It runs two steps and prints what it ran and what it skipped:
//   1. tsc -b (no --clean). Typechecks src. tsc writes tsconfig.tsbuildinfo,
//      so a rerun reuses that cache.
//   2. vitest related --run <changed files>. Runs each test that imports a
//      changed module, plus each changed test file.
//
// The changed files are everything that differs from the merge base with
// origin/test: committed, uncommitted and untracked. A deleted file is not
// passed to vitest, so the tests of a deleted module are not found. tsc still
// reports a broken import from that module.
//
// With `--base <rev>` the changed files are only the commits from <rev> to HEAD.
// Uncommitted and untracked files are left out. The pre-push hook passes this
// flag. tsc still reads the whole working tree, so the hook also refuses a dirty
// tree.
//
// It does not replace `npm run verify`, which must pass before any push.
//
// It runs node on the tool bins with argument arrays, never through a shell,
// so it behaves the same on Windows and Linux.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE_REF = 'origin/test'
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/
const TSC_BIN = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const VITEST_BIN = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { ok: r.status === 0, out: r.stdout ?? '', err: (r.stderr ?? '').trim() }
}

// `-z` output is NUL-separated, so a path with a space or a quote stays whole.
function nulSplit(text) {
  return text.split('\0').filter(Boolean)
}

// Without committedOnly, `git diff <base>` reads the working tree, so it sees
// uncommitted edits, and the untracked list adds new files.
function changedFiles(base, { committedOnly = false } = {}) {
  const diff = git(
    committedOnly ? ['diff', '--name-only', '-z', base, 'HEAD'] : ['diff', '--name-only', '-z', base],
  )
  if (!diff.ok) return { error: diff.err || `git diff against ${base} failed` }
  const names = nulSplit(diff.out)
  if (!committedOnly) {
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
    if (!untracked.ok) return { error: untracked.err || 'git ls-files failed' }
    names.push(...nulSplit(untracked.out))
  }
  const all = new Set(names.map(p => p.replace(/\\/g, '/')))
  return { files: [...all].sort() }
}

function runNode(bin, args) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd: ROOT, stdio: 'inherit' })
  if (r.error) {
    console.error(`verify:fast: could not start ${path.relative(ROOT, bin)}: ${r.error.message}`)
    return 1
  }
  return r.status ?? 1
}

// Reads the one optional flag, --base <rev>. Anything else is an error.
function parseArgs(argv) {
  let base = null
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--base') {
      base = argv[++i] ?? ''
    } else if (arg.startsWith('--base=')) {
      base = arg.slice('--base='.length)
    } else {
      return { error: `verify:fast: unknown argument "${arg}". Usage: verify:fast [--base <rev>]` }
    }
  }
  if (base !== null && base.trim() === '') return { error: 'verify:fast: --base needs a revision' }
  return { base }
}

function main(argv) {
  const args = parseArgs(argv)
  if (args.error) {
    console.error(args.error)
    return 2
  }
  for (const bin of [TSC_BIN, VITEST_BIN]) {
    if (!existsSync(bin)) {
      console.error(`verify:fast: ${path.relative(ROOT, bin)} is missing. Install dependencies first.`)
      return 1
    }
  }

  let base
  let changed
  if (args.base === null) {
    const mergeBase = git(['merge-base', 'HEAD', BASE_REF])
    if (!mergeBase.ok) {
      console.error(`verify:fast: no merge base with ${BASE_REF}. Run: git fetch origin`)
      if (mergeBase.err) console.error(`  git said: ${mergeBase.err}`)
      return 1
    }
    base = mergeBase.out.trim()
    console.log(`base: ${base.slice(0, 12)} (merge base of HEAD and ${BASE_REF})`)
    changed = changedFiles(base)
  } else {
    const resolved = git(['rev-parse', '--verify', '--quiet', `${args.base}^{commit}`])
    if (!resolved.ok) {
      console.error(`verify:fast: --base ${args.base} is not a commit in this clone. Run: git fetch origin`)
      return 1
    }
    base = resolved.out.trim()
    console.log(`base: ${base.slice(0, 12)} (--base ${args.base}, committed changes only)`)
    changed = changedFiles(base, { committedOnly: true })
  }
  if (changed.error) {
    console.error(`verify:fast: ${changed.error}`)
    return 1
  }
  const present = changed.files.filter(f => existsSync(path.join(ROOT, f)))
  const deleted = changed.files.filter(f => !present.includes(f))
  const code = present.filter(f => CODE_FILE.test(f))
  console.log(
    `changed: ${changed.files.length} files (${code.length} ts/js, ${present.length - code.length} other, ${deleted.length} deleted)`,
  )

  let failed = false

  console.log('\nran:     tsc -b   (no --clean)')
  if (runNode(TSC_BIN, ['-b']) !== 0) {
    failed = true
    console.log('failed:  tsc -b')
  }

  if (code.length === 0) {
    console.log('\nskipped: vitest related (no changed ts or js file)')
  } else {
    console.log(`\nran:     vitest related --run ${code.join(' ')}`)
    if (runNode(VITEST_BIN, ['related', '--run', ...code]) !== 0) {
      failed = true
      console.log('failed:  vitest related')
    }
  }

  if (deleted.length > 0) {
    console.log(`\nskipped: ${deleted.length} deleted file(s), not passed to vitest: ${deleted.join(' ')}`)
  }
  const other = present.filter(f => !CODE_FILE.test(f))
  if (other.length > 0) {
    console.log(`skipped: ${other.length} non-code file(s), no test to run: ${other.join(' ')}`)
  }

  console.log(`\nresult: ${failed ? 'FAILED' : 'passed'}`)
  console.log('verify:fast does not replace `npm run verify`. Run `npm run verify` before any push.')
  return failed ? 1 : 0
}

process.exitCode = main(process.argv.slice(2))
