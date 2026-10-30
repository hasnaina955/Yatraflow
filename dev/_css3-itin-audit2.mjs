// Scratch: list the original itin-card rules from git, parsed by the same reader.
// The old files are written to a temporary path OUTSIDE the stylesheet graph, and
// parsed with the shared reader, so both sides use one parser.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCssGraph } from '../scripts/css-source-graph.mjs'

const base = process.argv[2] ?? 'HEAD'
const FAMILY = /\.itin-card(?![\w-])/
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'css3-itin-'))

const files = [
  'src/styles/legacy/02-select-and-print.css',
  'src/styles/legacy/04-mobile-usability.css',
  'src/styles/legacy/05-share-and-trip-ticket.css',
  'src/styles/legacy/11-shared-page.css',
]

const parts = []
for (const f of files) {
  parts.push(`/* ${f} */\n` + execFileSync('git', ['show', `${base}:${f}`], { encoding: 'utf8', shell: true }))
}
const tmpFile = path.join(tmp, 'old.css')
fs.writeFileSync(tmpFile, parts.join('\n'))
const graph = loadCssGraph(tmpFile)

const pick = (g) => g.records
  .filter((r) => r.kind === 'rule')
  .filter((r) => r.selectors.some((s) => FAMILY.test(s.replace(/:not\([^)]*\)/g, ''))))
  .map((r) => ({
    ctx: (r.context ?? []).join('|'),
    sel: r.selectorNormalized.replace(/\s+/g, ' ').trim(),
    decls: (r.declarations ?? []).map((d) => `${d.prop}:${d.value}`).sort().join(';'),
  }))

const old = pick(graph)
const now = pick(loadCssGraph())

const key = (r) => `${r.ctx}::${r.sel}`
const count = (list) => {
  const m = new Map()
  for (const r of list) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
  return m
}
const oldC = count(old)
const nowC = count(now)

console.log(`old rules: ${old.length}   now rules: ${now.length}`)
console.log('\nMISSING (in old, not now):')
for (const [k, n] of oldC) {
  const have = nowC.get(k) ?? 0
  if (have < n) console.log(`  ${n - have}x ${k}`)
}
console.log('\nADDED (in now, not old):')
for (const [k, n] of nowC) {
  const had = oldC.get(k) ?? 0
  if (had < n) console.log(`  ${n - had}x ${k}`)
}

// Declaration-level check for selectors present in both.
console.log('\nDECLARATION CHANGES:')
for (const [k, n] of oldC) {
  if (!nowC.has(k)) continue
  const oldSet = old.filter((r) => key(r) === k).map((r) => r.decls).sort()
  const nowSet = now.filter((r) => key(r) === k).map((r) => r.decls).sort()
  for (let i = 0; i < Math.min(oldSet.length, nowSet.length); i++) {
    if (oldSet[i] !== nowSet[i]) {
      console.log(`  ${k}\n    old: ${oldSet[i]}\n    now: ${nowSet[i]}`)
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true })
