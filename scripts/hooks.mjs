#!/usr/bin/env node
// Switches the opt-in pre-push gate on or off for this clone.
//
//   npm run hooks:install     sets core.hooksPath to .githooks
//   npm run hooks:uninstall   removes that setting, when it is .githooks
//
// The setting is written to the repository config. Linked worktrees of one
// repository share that config, so one install covers all of them. Nothing runs
// this at `npm install`. Someone must run it on purpose.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const KEY = 'core.hooksPath'
const HOOKS_DIR = '.githooks'
const HOOK = 'pre-push'

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' })
}

// The value git reads for this clone, or null when none is set.
function currentValue() {
  const r = git(['config', '--local', '--get', KEY])
  return r.status === 0 ? r.stdout.trim() : null
}

function install() {
  if (!existsSync(path.join(HOOKS_DIR, HOOK))) {
    console.error(
      `hooks: ${HOOKS_DIR}/${HOOK} is missing from this checkout. Pull the branch that has it, then run this again.`,
    )
    return 1
  }
  const previous = currentValue()
  const r = git(['config', '--local', KEY, HOOKS_DIR])
  if (r.status !== 0) {
    console.error(`hooks: git config failed: ${r.stderr.trim()}`)
    return 1
  }
  if (previous !== null && previous !== HOOKS_DIR) {
    console.log(`hooks: replaced ${KEY} "${previous}".`)
  }
  console.log(`hooks: ${KEY} is ${HOOKS_DIR}. Each push now runs the fast gate.`)
  console.log('hooks: linked worktrees of this repository share the setting. Skip one push with YF_SKIP_PRE_PUSH=1.')
  return 0
}

function uninstall() {
  const previous = currentValue()
  if (previous === null) {
    console.log(`hooks: ${KEY} is not set. Nothing to remove.`)
    return 0
  }
  if (previous !== HOOKS_DIR) {
    console.log(`hooks: ${KEY} is "${previous}", not ${HOOKS_DIR}. Left as it is.`)
    return 0
  }
  const r = git(['config', '--local', '--unset', KEY])
  if (r.status !== 0) {
    console.error(`hooks: git config failed: ${r.stderr.trim()}`)
    return 1
  }
  console.log(`hooks: ${KEY} removed. Pushes from this clone run no hook.`)
  return 0
}

switch (process.argv[2]) {
  case 'install':
    process.exitCode = install()
    break
  case 'uninstall':
    process.exitCode = uninstall()
    break
  default:
    console.error('Usage: node scripts/hooks.mjs install | uninstall')
    process.exitCode = 2
}
