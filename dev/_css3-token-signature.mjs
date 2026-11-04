// CSS-3 B1: declaration-based signature of the token cascade.
// Independent of file paths and line numbers, so a move can be proven equal.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { loadCssGraph } from '../scripts/css-source-graph.mjs'
import { isRootSelector } from '../scripts/css-ownership.mjs'

const out = process.argv[2]
const graph = loadCssGraph()

const blocks = []
for (const rule of graph.records) {
  if (rule.kind !== 'rule') continue
  if (!isRootSelector(rule.selectorNormalized)) continue
  const decls = (rule.declarations ?? []).filter((d) => d.prop.startsWith('--'))
  if (!decls.length) continue
  blocks.push({
    selector: rule.selectorNormalized,
    context: (rule.context ?? []).join(' | '),
    decls: decls.map((d) => [d.prop, d.value, d.important ? '!' : '']),
  })
}

// Flatten to the exact cascade sequence the browser resolves for tokens.
const flat = []
for (const b of blocks) {
  for (const [prop, value, imp] of b.decls) {
    flat.push(`${b.context}\u0000${b.selector}\u0000${prop}\u0000${value}\u0000${imp}`)
  }
}

const signature = createHash('sha256').update(flat.join('\n'), 'utf8').digest('hex')
const payload = { signature, blocks: blocks.length, declarations: flat.length, sequence: flat }

if (out) fs.writeFileSync(out, JSON.stringify(payload, null, 1))
console.log(`blocks=${blocks.length} declarations=${flat.length} signature=${signature}`)
