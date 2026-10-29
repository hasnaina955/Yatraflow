// Regenerate the config-appearance baseline keys from the current tree.
import fs from 'node:fs'
import { loadCssGraph } from '../scripts/css-source-graph.mjs'
import { ALLOWED_ON_CONFIG, classTokens } from '../scripts/css-ownership.mjs'

const graph = loadCssGraph()
const mapPath = 'docs/css-ownership.json'
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'))

const configClasses = new Set()
const ownerFiles = new Set()
for (const owner of map.owners) {
  ownerFiles.add(owner.file)
  for (const extra of owner.files ?? []) ownerFiles.add(extra)
  for (const c of owner.configClasses ?? []) configClasses.add(c)
}

const keys = new Set()
for (const r of graph.records) {
  if (r.kind !== 'rule') continue
  // The rule never reports on an owner module, so a key for one is dead.
  if (ownerFiles.has(r.file)) continue
  const toks = classTokens(r.selectorNormalized)
  if (!toks.some((t) => configClasses.has(t))) continue
  for (const d of r.declarations ?? []) {
    if (d.prop.startsWith('--') || ALLOWED_ON_CONFIG.has(d.prop)) continue
    // A documented variable is not appearance debt.
    const owner = map.owners.find((o) => (o.configClasses ?? []).some((c) => toks.includes(c)))
    if (owner && (owner.variables ?? []).includes(d.prop)) continue
    keys.add(`${r.file}::${r.selectorNormalized}::${d.prop}`)
  }
}

map.baselines.configAppearanceKeys = [...keys].sort()
delete map.baselines.configAppearanceByFile
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n')
console.log(`configAppearanceKeys: ${keys.size}`)
