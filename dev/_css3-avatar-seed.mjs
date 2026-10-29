// Prove the avatar comparison detects a real avatar defect before it is trusted.
//
// It plants a defect in the avatar module, rebuilds, runs the comparison, and
// requires a non-zero result. Then it restores the file and requires zero. A
// tool that reports zero both times is measuring nothing.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const MODULE = path.join(ROOT, 'src/styles/components/avatar.css')
const BASELINE = 'dev/_css3-frozen-b1.css'

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

// npm is a .cmd shim on Windows, so it needs the shell to resolve.
const build = () => {
  execFileSync('npm', ['run', 'build'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  const assets = fs.readdirSync(path.join(ROOT, 'dist/assets')).filter((f) => f.startsWith('index') && f.endsWith('.css'))
  const target = path.join(ROOT, 'dev/_css3-avatar-seeded.css')
  fs.copyFileSync(path.join(ROOT, 'dist/assets', assets[0]), target)
  return target
}

const compare = (after) => {
  try {
    run('node', ['dev/_css3-avatar-compare.mjs', BASELINE, after, 'dev/_css3-report-avatar-seed'])
    return 0
  } catch (e) {
    // The tool exits 1 on a difference, which is the result we want here.
    return e.status ?? 1
  }
}

const original = fs.readFileSync(MODULE, 'utf8')
let ok = true

try {
  // Seed a defect a real migration could cause: the tone surface stops
  // overriding the base fill, so tone avatars fall back to teal-soft.
  const seeded = original.replace(
    '.avatar.tone-sea { background: var(--pw-sea-700, #0B5F67); color: var(--pw-on-sea, #FFFFFF); }',
    '.avatar.tone-sea { background: var(--teal-soft); color: var(--pw-on-sea, #FFFFFF); }',
  )
  if (seeded === original) throw new Error('seed did not apply: the tone-sea rule text changed')
  fs.writeFileSync(MODULE, seeded)

  const seededCss = build()
  const seededExit = compare(seededCss)
  console.log(`seeded defect  -> exit ${seededExit} ${seededExit === 1 ? '(detected)' : '(MISSED)'}`)
  if (seededExit !== 1) ok = false

  // A second seed on a different property, so the tool is not keyed to colour.
  fs.writeFileSync(MODULE, original.replace('.avatar.lg { width: 44px; height: 44px;', '.avatar.lg { width: 40px; height: 40px;'))
  const seededCss2 = build()
  const seededExit2 = compare(seededCss2)
  console.log(`seeded size    -> exit ${seededExit2} ${seededExit2 === 1 ? '(detected)' : '(MISSED)'}`)
  if (seededExit2 !== 1) ok = false
} finally {
  fs.writeFileSync(MODULE, original)
}

const cleanCss = build()
const cleanExit = compare(cleanCss)
console.log(`restored       -> exit ${cleanExit} ${cleanExit === 0 ? '(clean)' : '(FALSE POSITIVE)'}`)
if (cleanExit !== 0) ok = false

console.log(ok ? '\nSEED PROOF PASSED: the tool detects an avatar defect and clears the restore' : '\nSEED PROOF FAILED')
process.exit(ok ? 0 : 1)
