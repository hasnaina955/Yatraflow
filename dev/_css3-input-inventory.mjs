// CSS-3 B3: inventory the input and field surface.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'
import fs from 'node:fs'
import path from 'node:path'

const graph = loadCssGraph()
const RULES = graph.records.filter((r) => r.kind === 'rule')

const norm = (s) => s.replace(/\s+/g, ' ').trim()
const groups = {
  input: /\.input(?![-\w])/,
  field: /\.field(?![-\w])/,
  textarea: /\.textarea(?![-\w])/,
  label: /\.field-label|\.label(?![-\w])/,
  hint: /\.field-hint|\.hint(?![-\w])/,
  error: /\.field-error|\.error(?![-\w])/,
}

for (const [name, re] of Object.entries(groups)) {
  const hits = RULES.filter((r) => re.test(r.selectorNormalized))
  const files = new Map()
  for (const h of hits) files.set(h.file, (files.get(h.file) ?? 0) + 1)
  console.log(`\n=== .${name}: ${hits.length} rules in ${files.size} files ===`)
  for (const [f, n] of [...files].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${f.replace('src/styles/', '')}`)
  }
}

// Consumers: which source files use the class tokens.
const src = []
;(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) src.push({ f: p, t: fs.readFileSync(p, 'utf8') })
  }
})('src')

const tokens = ['input', 'field', 'textarea', 'field-label', 'field-hint', 'field-error', 'input-wrap', 'field-row']
console.log('\n=== consumer files per token ===')
for (const tok of tokens) {
  const hits = src.filter(({ t }) => new RegExp(`(^|[^\\w-])${tok}([^\\w-]|$)`).test(t))
  console.log(`${String(hits.length).padStart(3)}  .${tok}`)
  if (hits.length && hits.length <= 30) {
    for (const h of hits.slice(0, 12)) console.log('       ' + h.f.replace(/\\/g, '/').replace(/^src\//, ''))
  }
}
