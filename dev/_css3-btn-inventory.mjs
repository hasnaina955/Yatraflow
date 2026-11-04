// CSS-3 B2 inventory: every rule that touches .btn*, with its conditions.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'
import fs from 'node:fs'
import path from 'node:path'

const graph = loadCssGraph()
const BTN = /\.btn(?![-\w])/

const rows = []
for (const r of graph.records) {
  if (r.kind !== 'rule') continue
  if (!BTN.test(r.selectorNormalized)) continue
  rows.push({
    file: r.file.replace('src/styles/', ''),
    line: r.line,
    sel: r.selectorNormalized,
    ctx: (r.context ?? []).join(' | '),
    decls: (r.declarations ?? []).map((d) => d.prop),
    important: (r.declarations ?? []).filter((d) => d.important).length,
    order: r.order,
  })
}

console.log(`rules naming .btn: ${rows.length}`)

const byFile = new Map()
for (const r of rows) {
  const e = byFile.get(r.file) ?? { n: 0, ctx: 0, imp: 0, variants: new Set() }
  e.n++
  if (r.ctx) e.ctx++
  e.imp += r.important
  for (const m of r.sel.matchAll(/\.btn(-[\w-]+)?/g)) e.variants.add(m[0])
  byFile.set(r.file, e)
}
console.log('\n=== per file ===')
for (const [f, e] of [...byFile].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${String(e.n).padStart(3)} rules  ${String(e.ctx).padStart(3)} conditional  ${String(e.imp).padStart(2)} !imp  ${f}`)
}

const variants = new Map()
for (const r of rows) {
  for (const m of r.sel.matchAll(/\.btn(-[\w-]+)?/g)) {
    const v = m[1] ? m[1].slice(1) : '(base)'
    variants.set(v, (variants.get(v) ?? 0) + 1)
  }
}
console.log('\n=== variants ===')
for (const [v, n] of [...variants].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(3)}  .btn${v === '(base)' ? '' : '-' + v}`)

console.log('\n=== conditional / state contexts ===')
const ctxs = new Map()
for (const r of rows) {
  const key = r.ctx || '(none)'
  ctxs.set(key, (ctxs.get(key) ?? 0) + 1)
}
for (const [c, n] of [...ctxs].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(3)}  ${c}`)

// Which page prefixes combine with .btn — the cross-owner surface.
const pageCombos = new Map()
for (const r of rows) {
  const first = (r.sel.match(/\.([a-zA-Z][\w-]*)/) ?? [])[1]
  if (!first || first.startsWith('btn')) continue
  pageCombos.set(first, (pageCombos.get(first) ?? 0) + 1)
}
console.log('\n=== page/other prefixes combined with .btn ===')
for (const [p, n] of [...pageCombos].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${String(n).padStart(3)}  .${p} ... .btn`)

fs.writeFileSync('dev/_css3-btn-inventory.json', JSON.stringify(rows, null, 1))
console.log(`\nwrote dev/_css3-btn-inventory.json (${rows.length} rules)`)
