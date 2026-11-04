// Which selectors declare custom properties, and which of them match the root
// element under a theme? This decides what a token module must own.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'
import { classTokens } from '../scripts/css-ownership.mjs'

const graph = loadCssGraph()
const rows = []
for (const r of graph.records) {
  if (r.kind !== 'rule') continue
  const n = (r.declarations ?? []).filter((d) => d.prop.startsWith('--')).length
  if (!n) continue
  const sel = r.selectorNormalized
  rows.push({
    file: r.file.replace('src/styles/', ''),
    line: r.line,
    sel,
    ctx: (r.context ?? []).join(' | '),
    n,
    classes: classTokens(sel).length,
  })
}

const themeOnly = rows.filter((r) => r.classes === 0 && /data-theme|:root|html/.test(r.sel))
const other = rows.filter((r) => !(r.classes === 0 && /data-theme|:root|html/.test(r.sel)))

console.log('=== root/theme-only selectors that declare tokens ===')
for (const r of themeOnly.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))) {
  console.log(`${String(r.n).padStart(4)}  ${r.file}:${r.line}  [${r.sel}]  ${r.ctx}`)
}
console.log(`\nroot/theme-only blocks: ${themeOnly.length}, declarations: ${themeOnly.reduce((s, r) => s + r.n, 0)}`)

console.log('\n=== other selectors declaring custom properties (scoped, left alone) ===')
for (const r of other.sort((a, b) => b.n - a.n).slice(0, 20)) {
  console.log(`${String(r.n).padStart(4)}  ${r.file}:${r.line}  [${r.sel.slice(0, 70)}]`)
}
console.log(`\nscoped blocks: ${other.length}, declarations: ${other.reduce((s, r) => s + r.n, 0)}`)
