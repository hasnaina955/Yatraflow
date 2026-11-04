// CSS-3 inventory probe. Scratch tool, not part of the gate.
// Reads the shared source graph and reports ownership families.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'
import fs from 'node:fs'
import path from 'node:path'

const graph = loadCssGraph()
const records = graph.records

const ruleRecs = records.filter((r) => r.kind === 'rule')
const atRecs = records.filter((r) => r.kind === 'atrule')

const impCount = (r) => (r.declarations ?? []).filter((d) => d.important).length

// ---- per file summary -------------------------------------------------
const byFile = new Map()
for (const r of ruleRecs) {
  const f = r.file ?? '?'
  const e = byFile.get(f) ?? { rules: 0, decls: 0, important: 0, media: 0, ids: 0 }
  e.rules++
  e.decls += (r.declarations ?? []).length
  e.important += impCount(r)
  if ((r.context ?? []).length) e.media++
  if ((r.selector ?? '').includes('#')) e.ids++
  byFile.set(f, e)
}

// ---- cross-file duplicate selectors (override risk) -------------------
const selFiles = new Map()
for (const r of ruleRecs) {
  const key = r.selectorNormalized
  if (!key) continue
  const set = selFiles.get(key) ?? new Set()
  set.add(r.file)
  selFiles.set(key, set)
}
const crossFile = [...selFiles.entries()]
  .filter(([, set]) => set.size > 1)
  .map(([sel, set]) => ({ sel, files: [...set].sort(), n: set.size }))
  .sort((a, b) => b.n - a.n || (a.sel < b.sel ? -1 : 1))

// ---- family clustering by leading class token -------------------------
function leadToken(sel) {
  // first class in the selector, ignoring element and attribute prefixes
  const m = sel.match(/\.([a-zA-Z][\w-]*)/)
  return m ? m[1] : null
}
const famMap = new Map()
for (const r of ruleRecs) {
  const tok = leadToken(r.selectorNormalized)
  if (!tok) continue
  // group by the first two hyphen segments: btn-primary -> btn
  const fam = tok.split('-')[0]
  const e = famMap.get(fam) ?? { token: fam, rules: 0, files: new Set(), classes: new Set(), important: 0 }
  e.rules++
  e.files.add(r.file)
  e.classes.add(tok)
  if (r.important) e.important++
  famMap.set(fam, e)
}

// ---- consumer reach in source ----------------------------------------
const srcFiles = []
;(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) srcFiles.push(p)
  }
})('src')

const srcText = srcFiles.map((f) => ({ f, t: fs.readFileSync(f, 'utf8') }))

function consumersOf(token) {
  // match the class token as a whole word inside string literals or className
  const re = new RegExp(`(^|[^\\w-])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`)
  const hits = []
  for (const { f, t } of srcText) {
    if (re.test(t)) hits.push(f.replace(/\\/g, '/').replace(/^src\//, ''))
  }
  return hits
}

const families = [...famMap.values()]
  .map((e) => {
    const cons = consumersOf(e.token)
    return {
      token: e.token,
      rules: e.rules,
      files: e.files.size,
      fileList: [...e.files].map((f) => f.replace('src/styles/', '')),
      classes: e.classes.size,
      important: e.important,
      consumers: cons.length,
      consumerList: cons.slice(0, 6),
    }
  })
  .sort((a, b) => b.consumers - a.consumers || b.rules - a.rules)

const out = {
  fingerprint: graph.fingerprint,
  files: graph.files.length,
  records: records.length,
  rules: ruleRecs.length,
  atrules: atRecs.length,
  assets: graph.assets.length,
  perFile: [...byFile.entries()].map(([f, e]) => ({ file: f.replace('src/styles/', ''), ...e })),
  crossFileCount: crossFile.length,
  crossFileTop: crossFile.slice(0, 60),
  familyCount: families.length,
  families: families.slice(0, 60),
}

const target = process.argv[2] ?? 'dev/_css3-inventory.json'
fs.writeFileSync(target, JSON.stringify(out, null, 2))
console.log(`fingerprint ${out.fingerprint.slice(0, 12)}  files ${out.files}  records ${out.records}`)
console.log(`rules ${out.rules}  atrules ${out.atrules}  assets ${out.assets}`)
console.log(`cross-file duplicated selectors ${out.crossFileCount}`)
console.log(`families ${out.familyCount}`)
console.log('\n-- per file (rules / important / in-@media) --')
for (const f of out.perFile) {
  console.log(`${String(f.rules).padStart(5)} ${String(f.important).padStart(3)} ${String(f.media).padStart(5)}  ${f.file}`)
}
console.log('\n-- top families by consumer reach --')
for (const f of families.slice(0, 30)) {
  console.log(`${String(f.consumers).padStart(3)} cons ${String(f.rules).padStart(5)} rules ${String(f.files).padStart(2)} files  .${f.token}`)
}
