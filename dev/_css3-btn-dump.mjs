// CSS-3 B2: dump every .btn rule with its declarations and cascade order.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'

const graph = loadCssGraph()
const BTN = /\.btn(?![-\w])/
const rows = graph.records.filter((r) => r.kind === 'rule' && BTN.test(r.selectorNormalized))

console.log(`rules naming .btn: ${rows.length}\n`)
for (const r of rows) {
  const ctx = (r.context ?? []).length ? `  [${r.context.join(' | ')}]` : ''
  console.log(`${r.file.replace('src/styles/', '')}:${r.line}${ctx}`)
  console.log(`  ${r.selectorNormalized}`)
  const decls = (r.declarations ?? []).map((d) => `${d.prop}: ${d.value}${d.important ? ' !important' : ''}`)
  console.log(`  { ${decls.join('; ')} }`)
  console.log('')
}
