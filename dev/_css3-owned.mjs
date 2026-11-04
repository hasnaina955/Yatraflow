// CSS-3: where do the CSS-2 owned families still appear? Scratch probe.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'

const graph = loadCssGraph()
const rules = graph.records.filter((r) => r.kind === 'rule')

const families = {
  select: /\.select(?![-\w])/,
  cselect: /\.cselect(?![-\w])/,
  'ex-select': /\.ex-select(?![-\w])/,
  'ex-search': /\.ex-search(?![-\w])/,
  'search-field': /\.search-field(?![-\w])/,
}

for (const [name, re] of Object.entries(families)) {
  const hits = rules.filter((r) => re.test(r.selectorNormalized))
  const files = [...new Set(hits.map((r) => r.file.replace('src/styles/', '')))]
  console.log(`${name.padEnd(14)} ${String(hits.length).padStart(3)} rules in ${files.length} file(s): ${files.join(', ')}`)
  if (files.length > 1) {
    for (const h of hits) {
      if (!h.file.includes('components/')) {
        console.log(`   OUTSIDE OWNER: ${h.file}:${h.line}  ${h.selectorNormalized.slice(0, 70)}`)
      }
    }
  }
}
