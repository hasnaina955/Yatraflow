// The opt-in pre-push gate (.githooks/pre-push) and its switch (scripts/hooks.mjs).
//
// The push tests run the real hook through real `git push` calls into a bare
// fixture remote. A stub `npm` on PATH logs each call and exits with the code
// the test sets, so the pass, fail and skip paths run without the real type
// check or test suite. Source files are read with CRLF converted to LF, except
// the CRLF check itself, which reads raw bytes.
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const HOOK_FILE = path.join(REPO, '.githooks', 'pre-push')
const HOOKS_SCRIPT = path.join(REPO, 'scripts', 'hooks.mjs')

// Real git and sh runs take seconds on a slow Windows runner.
const SLOW = 60000

// The stub npm. Its --version call exits with $STUB_VERSION_EXIT. Any other call
// appends its arguments to $STUB_LOG and exits with $STUB_NPM_EXIT.
const STUB_NPM = [
  '#!/bin/sh',
  'if [ "$1" = "--version" ]; then exit "${STUB_VERSION_EXIT:-0}"; fi',
  'echo "$*" >> "$STUB_LOG"',
  'exit "${STUB_NPM_EXIT:-0}"',
  '',
].join('\n')

const fixtureRoots: string[] = []
afterAll(() => {
  for (const dir of fixtureRoots) rmSync(dir, { recursive: true, force: true })
})

function readLf(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

// The hook's executable lines. Its comment lines may name anything.
function codeLines(text: string): string {
  return text
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')
}

// Git and sh accept forward slashes on every platform.
function slash(p: string): string {
  return p.replace(/\\/g, '/')
}

// Puts the stub directory first on PATH, under whichever key the platform uses.
function withPath(env: NodeJS.ProcessEnv, dir: string): NodeJS.ProcessEnv {
  const key = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH'
  return { ...env, [key]: `${dir}${path.delimiter}${env[key] ?? ''}` }
}

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync('git', args, { cwd, env, encoding: 'utf8' })
}

function gitOk(cwd: string, args: string[], env: NodeJS.ProcessEnv): string {
  const r = git(cwd, args, env)
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return r.stdout.trim()
}

describe('pre-push hook: files and wiring', () => {
  it('the hook file exists, starts with a POSIX sh shebang and has no CRLF', () => {
    expect(existsSync(HOOK_FILE)).toBe(true)
    // Raw bytes on purpose: a CRLF file must fail here, so this read does not normalise.
    const raw = readFileSync(HOOK_FILE, 'utf8')
    expect(raw.startsWith('#!/bin/sh\n')).toBe(true)
    expect(raw.includes('\r')).toBe(false)
  })

  it('the hook runs the fast gate on its code lines, never the full gate', () => {
    const code = codeLines(readLf(HOOK_FILE))
    expect(code).toContain('npm run verify:fast -- --base')
    expect(code).not.toMatch(/npm run verify(?!:)/)
  })

  it('the hook honours YF_SKIP_PRE_PUSH and prints that it skipped', () => {
    const code = codeLines(readLf(HOOK_FILE))
    expect(code).toContain('"${YF_SKIP_PRE_PUSH:-}" = "1"')
    expect(code).toContain('pre-push: skipped.')
  })

  it('the hook is tracked as executable, so Linux and macOS clones run it', () => {
    const listed = gitOk(REPO, ['ls-files', '-s', '.githooks/pre-push'], process.env as NodeJS.ProcessEnv)
    expect(listed.startsWith('100755 ')).toBe(true)
  })

  it('.gitattributes pins the hook folder to LF endings', () => {
    expect(readLf(path.join(REPO, '.gitattributes'))).toMatch(/^\.githooks\/\* text eol=lf$/m)
  })

  it('package.json has both switches and no script that installs the hook', () => {
    const pkg = JSON.parse(readLf(path.join(REPO, 'package.json'))) as { scripts: Record<string, string> }
    expect(pkg.scripts['hooks:install']).toBe('node scripts/hooks.mjs install')
    expect(pkg.scripts['hooks:uninstall']).toBe('node scripts/hooks.mjs uninstall')
    expect(pkg.scripts.prepare).toBeUndefined()
    expect(pkg.scripts.postinstall).toBeUndefined()
  })
})

describe('pre-push hook: real pushes into a fixture remote', () => {
  let root = ''
  let remote = ''
  let work = ''
  let log = ''
  let env: NodeJS.ProcessEnv = {}
  let mainSha = ''
  let f1 = ''
  let f2 = ''
  let f3 = ''

  const npmCalls = (): string[] =>
    existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []

  const lastCall = (): string => {
    const calls = npmCalls()
    return calls[calls.length - 1] ?? ''
  }

  const remoteSha = (branch: string): string => {
    const r = git(remote, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], env)
    return r.status === 0 ? r.stdout.trim() : ''
  }

  const commit = (file: string, text: string, message: string): string => {
    writeFileSync(path.join(work, file), text)
    gitOk(work, ['add', file], env)
    gitOk(work, ['commit', '-q', '-m', message], env)
    return gitOk(work, ['rev-parse', 'HEAD'], env)
  }

  const push = (args: string[], opts: { exit?: number; skip?: boolean; version?: number } = {}) => {
    const pushEnv: NodeJS.ProcessEnv = {
      ...env,
      STUB_NPM_EXIT: String(opts.exit ?? 0),
      STUB_VERSION_EXIT: String(opts.version ?? 0),
      STUB_LOG: log,
    }
    if (opts.skip) pushEnv.YF_SKIP_PRE_PUSH = '1'
    const r = git(work, ['push', ...args], pushEnv)
    return { status: r.status, output: `${r.stdout}${r.stderr}` }
  }

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'pre-push-hook-'))
    fixtureRoots.push(root)
    remote = slash(path.join(root, 'remote.git'))
    work = path.join(root, 'work')
    log = slash(path.join(root, 'npm.log'))

    const bin = path.join(root, 'bin')
    mkdirSync(bin)
    writeFileSync(path.join(bin, 'npm'), STUB_NPM)
    chmodSync(path.join(bin, 'npm'), 0o755)

    // A global config file that is empty, so no user or system setting leaks in.
    const emptyGlobal = path.join(root, 'empty.gitconfig')
    writeFileSync(emptyGlobal, '')
    const base: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: slash(emptyGlobal) }
    delete base.YF_SKIP_PRE_PUSH
    env = withPath(base, bin)

    gitOk(root, ['init', '-q', '--bare', '-b', 'main', remote], env)
    gitOk(root, ['init', '-q', '-b', 'main', slash(work)], env)
    gitOk(work, ['config', 'user.name', 'Hook Fixture'], env)
    gitOk(work, ['config', 'user.email', 'hook-fixture@example.invalid'], env)
    gitOk(work, ['config', 'commit.gpgsign', 'false'], env)
    gitOk(work, ['config', 'core.autocrlf', 'false'], env)
    gitOk(work, ['config', 'core.hooksPath', slash(path.join(REPO, '.githooks'))], env)
    gitOk(work, ['remote', 'add', 'origin', remote], env)

    commit('README.md', 'base\n', 'base')
    // The first push has no origin/test or origin/main to compare with, so the
    // setup push skips the gate. Every later push runs it.
    gitOk(work, ['push', '-q', 'origin', 'main'], { ...env, YF_SKIP_PRE_PUSH: '1' })
    mainSha = gitOk(work, ['rev-parse', 'main'], env)
  })

  it('skips the gate when YF_SKIP_PRE_PUSH=1 is set, and says so', () => {
    gitOk(work, ['checkout', '-q', '-b', 'feature'], env)
    f1 = commit('feature.txt', 'one\n', 'feature one')
    const before = npmCalls().length
    const r = push(['origin', 'feature'], { skip: true })
    expect(r.status).toBe(0)
    expect(r.output).toContain('pre-push: skipped.')
    expect(npmCalls().length).toBe(before)
    expect(remoteSha('feature')).toBe(f1)
  }, SLOW)

  it('passes a new branch, tested against the merge base with origin/main', () => {
    gitOk(work, ['checkout', '-q', 'main'], env)
    gitOk(work, ['checkout', '-q', '-b', 'topic'], env)
    const t1 = commit('topic.txt', 'topic\n', 'topic one')
    const r = push(['origin', 'topic'], { exit: 0 })
    expect(r.status).toBe(0)
    expect(r.output).toContain('pre-push: verify:fast passed for refs/heads/topic')
    expect(lastCall()).toBe(`run verify:fast -- --base ${mainSha}`)
    expect(remoteSha('topic')).toBe(t1)
  }, SLOW)

  it('passes an existing remote branch, tested against the tip the push replaces', () => {
    gitOk(work, ['checkout', '-q', 'feature'], env)
    f2 = commit('feature.txt', 'two\n', 'feature two')
    const r = push(['origin', 'feature'], { exit: 0 })
    expect(r.status).toBe(0)
    expect(lastCall()).toBe(`run verify:fast -- --base ${f1}`)
    expect(remoteSha('feature')).toBe(f2)
  }, SLOW)

  it('blocks the push and names the escape hatch when verify:fast fails', () => {
    f3 = commit('feature.txt', 'three\n', 'feature three')
    const r = push(['origin', 'feature'], { exit: 1 })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('pre-push: blocked. verify:fast failed for refs/heads/feature.')
    expect(r.output).toContain('YF_SKIP_PRE_PUSH=1')
    expect(remoteSha('feature')).toBe(f2)
  }, SLOW)

  it('blocks the push, with its own message, when npm does not start', () => {
    const before = npmCalls().length
    const r = push(['origin', 'feature'], { exit: 0, version: 1 })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('npm does not start in this shell')
    expect(r.output).not.toContain('verify:fast failed')
    expect(npmCalls().length).toBe(before)
    expect(remoteSha('feature')).toBe(f2)
  }, SLOW)

  it('refuses a branch whose tip is not the checked-out HEAD', () => {
    gitOk(work, ['branch', 'other', f2], env)
    const before = npmCalls().length
    const r = push(['origin', 'other'], { exit: 0 })
    expect(r.status).not.toBe(0)
    expect(r.output).toContain('but HEAD is at')
    expect(npmCalls().length).toBe(before)
  }, SLOW)

  it('refuses a push while a tracked or an untracked file is uncommitted', () => {
    const before = npmCalls().length
    writeFileSync(path.join(work, 'README.md'), 'base, edited\n')
    const tracked = push(['origin', 'feature'], { exit: 0 })
    expect(tracked.status).not.toBe(0)
    expect(tracked.output).toContain('uncommitted or untracked files')
    gitOk(work, ['checkout', '--', 'README.md'], env)

    writeFileSync(path.join(work, 'scratch.txt'), 'scratch\n')
    const untracked = push(['origin', 'feature'], { exit: 0 })
    expect(untracked.status).not.toBe(0)
    rmSync(path.join(work, 'scratch.txt'))
    expect(npmCalls().length).toBe(before)
  }, SLOW)

  it('passes once the tree is clean, tested against the tip the failed push left behind', () => {
    const r = push(['origin', 'feature'], { exit: 0 })
    expect(r.status).toBe(0)
    expect(lastCall()).toBe(`run verify:fast -- --base ${f2}`)
    expect(remoteSha('feature')).toBe(f3)
  }, SLOW)

  it('does not gate a tag push, and says so', () => {
    gitOk(work, ['tag', 'v-hook-test'], env)
    const before = npmCalls().length
    const r = push(['origin', 'v-hook-test'], { exit: 1 })
    expect(r.status).toBe(0)
    expect(r.output).toContain('pre-push: not gating refs/tags/v-hook-test')
    expect(npmCalls().length).toBe(before)
  }, SLOW)

  it('lets a branch deletion through without running the gate', () => {
    const before = npmCalls().length
    const r = push(['origin', ':refs/heads/topic'], { exit: 1 })
    expect(r.status).toBe(0)
    expect(r.output).toContain('pre-push: deleting refs/heads/topic.')
    expect(npmCalls().length).toBe(before)
  }, SLOW)
})

describe('scripts/hooks.mjs: the opt-in switch', () => {
  let root = ''
  let sw = ''
  let plain = ''
  let env: NodeJS.ProcessEnv = {}

  const hooksPath = (cwd: string): string | null => {
    const r = git(cwd, ['config', '--local', '--get', 'core.hooksPath'], env)
    return r.status === 0 ? r.stdout.trim() : null
  }

  const switchCmd = (cwd: string, command: string) =>
    spawnSync(process.execPath, [HOOKS_SCRIPT, command], { cwd, env, encoding: 'utf8' })

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hooks-switch-'))
    fixtureRoots.push(root)
    const emptyGlobal = path.join(root, 'empty.gitconfig')
    writeFileSync(emptyGlobal, '')
    env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: slash(emptyGlobal) }
    delete env.YF_SKIP_PRE_PUSH

    sw = path.join(root, 'switch')
    plain = path.join(root, 'plain')
    gitOk(root, ['init', '-q', '-b', 'main', slash(sw)], env)
    gitOk(root, ['init', '-q', '-b', 'main', slash(plain)], env)
    mkdirSync(path.join(sw, '.githooks'))
    copyFileSync(HOOK_FILE, path.join(sw, '.githooks', 'pre-push'))
  })

  it('install points core.hooksPath at .githooks for this clone', () => {
    const r = switchCmd(sw, 'install')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('core.hooksPath is .githooks')
    expect(r.stdout).toContain('linked worktrees of this repository share the setting')
    expect(hooksPath(sw)).toBe('.githooks')
  })

  it('install refuses when the hook file is missing', () => {
    const r = switchCmd(plain, 'install')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('is missing')
    expect(hooksPath(plain)).toBeNull()
  })

  it('uninstall removes .githooks, and a second run reports that nothing is set', () => {
    expect(switchCmd(sw, 'uninstall').status).toBe(0)
    expect(hooksPath(sw)).toBeNull()
    const again = switchCmd(sw, 'uninstall')
    expect(again.status).toBe(0)
    expect(again.stdout).toContain('is not set')
  })

  it('uninstall leaves a different core.hooksPath alone', () => {
    gitOk(sw, ['config', '--local', 'core.hooksPath', 'custom-hooks'], env)
    const r = switchCmd(sw, 'uninstall')
    expect(r.status).toBe(0)
    expect(hooksPath(sw)).toBe('custom-hooks')
  })
})
