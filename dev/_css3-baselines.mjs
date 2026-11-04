// CSS-3: baselines for the ownership map. Scratch probe.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'

const graph = loadCssGraph()
const rules = graph.records.filter((r) => r.kind === 'rule')

const customPropFiles = new Map()
const importantFiles = new Map()
let reducedMotion = 0

for (const r of rules) {
  const f = r.file
  const decls = r.declarations ?? []
  const custom = decls.filter((d) => d.prop.startsWith('--'))
  if (custom.length) customPropFiles.set(f, (customPropFiles.get(f) ?? 0) + custom.length)
  const imp = decls.filter((d) => d.important).length
  if (imp) importantFiles.set(f, (importantFiles.get(f) ?? 0) + imp)
  for (const ctx of r.context ?? []) {
    if (/prefers-reduced-motion/.test(ctx)) reducedMotion++
  }
}

console.log('--- files defining custom properties (count) ---')
for (const [f, n] of [...customPropFiles].sort()) console.log(`${String(n).padStart(4)}  ${f}`)
console.log('\n--- files using !important (count) ---')
for (const [f, n] of [...importantFiles].sort()) console.log(`${String(n).padStart(4)}  ${f}`)
console.log('\n--- rules inside prefers-reduced-motion ---')
console.log(reducedMotion)
console.log('\n--- all graph files ---')
for (const f of graph.files) console.log(f.path)
