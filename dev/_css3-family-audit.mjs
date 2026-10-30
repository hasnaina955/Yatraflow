// Verify a family move: every rule that named the family before must still exist
// after, with the same context, selector and declarations. Reports anything lost,
// added, or changed. Exits 1 on any difference.
//
//   node dev/_css3-family-audit.mjs <git-base> <family-regex>
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCssGraph } from '../scripts/css-source-graph.mjs'

const base = process.argv[2] ?? 'HEAD~1'
// The family is given as a bare class name ("board"), not a regex literal, so a
// shell cannot mangle the backslashes. A prefix family is written "board*".
const spec = (process.argv[3] ?? 'board').replace(/^\./, '')
const prefixMode = spec.endsWith('*')
const token = prefixMode ? spec.slice(0, -1) : spec
const clsRe = prefixMode
  ? new RegExp('\\.' + token + '(?![\\w-])|\\.' + token + '-[\\w-]+')
  : new RegExp('\\.' + token + '(?![\\w-])')
const FAMILY = clsRe

const pick = (g) => g.records
  .filter((r) => r.kind === 'rule')
  .filter((r) => r.selectors.some((s) => FAMILY.test(s.replace(/:not\([^)]*\)/g, ''))))
  .map((r) => ({
    ctx: (r.context ?? []).join('|'),
    sel: r.selectorNormalized.replace(/\s+/g, ' ').trim(),
    decls: (r.declarations ?? []).map((d) => `${d.prop}:${d.value}${d.important ? '!' : ''}`).sort().join(';'),
  }))

// Rebuild the pre-move stylesheet in a temp file, from git, so the same reader
// parses both sides.
const entryOld = execFileSync('git', ['show', `${base}:src/styles.css`], { encoding: 'utf8', shell: true })
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css3-fam-'))
const imports = [...entryOld.matchAll(/@import\s+'\.\/(styles\/[^']+)';/g)].map((m) => m[1])
let combined = ''
for (const rel of imports) {
  const src = `src/${rel}`
  let text
  try {
    text = execFileSync('git', ['show', `${base}:${src}`], { encoding: 'utf8', shell: true })
  } catch {
    continue // a module that did not exist at the base
  }
  combined += `/* ${src} */\n${text}\n`
}
const tmp = path.join(dir, 'old.css')
fs.writeFileSync(tmp, combined)
const old = pick(loadCssGraph(tmp))
const now = pick(loadCssGraph())

const key = (r) => `${r.ctx}::${r.sel}`
const count = (list) => {
  const m = new Map()
  for (const r of list) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
  return m
}
const oldC = count(old), nowC = count(now)

console.log(`family rules at ${base}: ${old.length}`)
console.log(`family rules now:        ${now.length}`)

let bad = 0
const missing = []
for (const [k, n] of oldC) {
  const have = nowC.get(k) ?? 0
  if (have < n) missing.push(`${n - have}x ${k}`)
}
const added = []
for (const [k, n] of nowC) {
  const had = oldC.get(k) ?? 0
  if (had < n) added.push(`${n - had}x ${k}`)
}
const changed = []
for (const [k] of oldC) {
  if (!nowC.has(k)) continue
  const a = old.filter((r) => key(r) === k).map((r) => r.decls).sort()
  const b = now.filter((r) => key(r) === k).map((r) => r.decls).sort()
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) changed.push({ k, old: a[i], now: b[i] })
  }
}

if (missing.length) { bad += missing.length; console.log('\nMISSING:'); for (const m of missing) console.log('  ' + m) }
if (added.length) { bad += added.length; console.log('\nADDED:'); for (const m of added) console.log('  ' + m) }
if (changed.length) {
  bad += changed.length
  console.log('\nDECLARATIONS CHANGED:')
  for (const c of changed) console.log(`  ${c.k}\n    old: ${c.old}\n    now: ${c.now}`)
}
fs.rmSync(dir, { recursive: true, force: true })
if (bad) { console.error(`\n${bad} difference(s)`); process.exit(1) }
console.log('\nexact: no rule lost, none added, no declaration changed')
