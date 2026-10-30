// CSS-3 B10 family scale probe. Scratch tool, not part of the gate.
// For a family (exact class or prefix*), report every distinct class, its rule
// count, the files that declare it, and the source files that render it.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'
import fs from 'node:fs'
import path from 'node:path'

const graph = loadCssGraph()
const rules = graph.records.filter((r) => r.kind === 'rule')
const fileOrder = new Map()
for (const [i, f] of graph.files.entries()) {
  const name = typeof f === 'string' ? f : f.file
  fileOrder.set(name, i)
}

function stripNot(sel) {
  let prev
  let s = sel
  do {
    prev = s
    s = s.replace(/:not\(([^()]*)\)/g, '')
  } while (s !== prev)
  return s
}

const src = []
;(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?|html)$/.test(ent.name)) src.push({ f: p, t: fs.readFileSync(p, 'utf8') })
  }
})('src')

const specs = process.argv.slice(2)
if (!specs.length) {
  console.error('usage: node dev/_css3-b10-scale.mjs <class|prefix*>...')
  process.exit(2)
}

for (const spec of specs) {
  const prefixMode = spec.endsWith('*')
  const base = prefixMode ? spec.slice(0, -1) : spec
  const matches = (tok) => (prefixMode ? tok === base || tok.startsWith(base + '-') : tok === base)

  const tally = new Map()
  for (const r of rules) {
    for (const sel of r.selectors) {
      const toks = new Set((stripNot(sel).match(/\.(-?[_a-zA-Z][\w-]*)/g) ?? []).map((t) => t.slice(1)))
      for (const t of toks) {
        if (!matches(t)) continue
        if (!tally.has(t)) tally.set(t, { rules: 0, decls: 0, files: new Map() })
        const e = tally.get(t)
        e.rules++
        e.decls += r.declarations.length
        e.files.set(r.file, (e.files.get(r.file) ?? 0) + 1)
      }
    }
  }

  const rows = [...tally.entries()].sort((a, b) => b[1].rules - a[1].rules || a[0].localeCompare(b[0]))
  const totalRules = rows.reduce((n, [, v]) => n + v.rules, 0)
  const totalDecls = rows.reduce((n, [, v]) => n + v.decls, 0)
  const allFiles = new Set()
  for (const [, v] of rows) for (const f of v.files.keys()) allFiles.add(f)

  console.log(`\n${'='.repeat(96)}`)
  console.log(`FAMILY .${spec}  —  ${rows.length} distinct classes, ${totalRules} rule matches, ${totalDecls} declarations, ${allFiles.size} files`)
  console.log('='.repeat(96))
  console.log(
    'class'.padEnd(26) + 'rules'.padStart(6) + 'decls'.padStart(7) + '  consumers / files'
  )
  for (const [tok, v] of rows) {
    const consumers = src.filter(({ t }) => new RegExp('(?<![\\w-])' + tok.replace(/[-]/g, '\\-') + '(?![\\w-])').test(t))
    const files = [...v.files.entries()]
      .sort((a, b) => (fileOrder.get(a[0]) ?? 0) - (fileOrder.get(b[0]) ?? 0))
      .map(([f, n]) => `${f.replace('src/styles/', '')}:${n}`)
    console.log(
      ('.' + tok).padEnd(26) +
        String(v.rules).padStart(6) +
        String(v.decls).padStart(7) +
        '  ' +
        String(consumers.length).padStart(3) +
        '  [' + files.join(', ') + ']'
    )
  }
}
