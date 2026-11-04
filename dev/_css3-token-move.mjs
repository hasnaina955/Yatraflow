// CSS-3 B1 codemod: move every root token block into one owning module.
// Preserves relative order, media context, specificity and attached comments.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import { loadCssGraph } from '../scripts/css-source-graph.mjs'
import { isRootSelector } from '../scripts/css-ownership.mjs'

const ROOT = process.cwd()
const TARGET = 'src/styles/tokens.css'
const ENTRY = 'src/styles.css'

const graph = loadCssGraph()
// Entry imports run in numeric order, so filename order is cascade order.
const files = [...new Set(
  graph.records
    .filter((r) => r.kind === 'rule' && isRootSelector(r.selectorNormalized))
    .map((r) => r.file),
)].filter((f) => f.startsWith('src/styles/legacy/')).sort()

const moved = []

for (const rel of files) {
  const abs = path.join(ROOT, rel)
  const css = fs.readFileSync(abs, 'utf8')
  const root = postcss.parse(css, { from: abs })

  const targets = []
  root.walkRules((rule) => {
    if (!isRootSelector(rule.selector.replace(/\s+/g, ' ').trim())) return
    const decls = rule.nodes?.filter((n) => n.type === 'decl' && n.prop.startsWith('--')) ?? []
    if (!decls.length) return
    targets.push(rule)
  })
  if (!targets.length) continue

  for (const rule of targets) {
    // A comment directly above the block describes the block. Move it with it.
    let comment = ''
    const prev = rule.prev()
    if (prev && prev.type === 'comment') {
      comment = prev.toString()
      prev.remove()
    }

    // Rebuild the at-rule context so `@media` and `@supports` survive the move.
    const chain = []
    let parent = rule.parent
    while (parent && parent.type !== 'root') {
      if (parent.type === 'atrule') chain.unshift(`@${parent.name}${parent.params ? ' ' + parent.params : ''}`)
      parent = parent.parent
    }
    let snippet = rule.toString()
    for (let i = chain.length - 1; i >= 0; i--) snippet = `${chain[i]} {\n${snippet}\n}`

    moved.push({
      from: rel,
      comment,
      text: `${comment ? comment + '\n' : ''}${snippet}`,
      selector: rule.selector,
      declarations: (rule.nodes ?? []).filter((n) => n.type === 'decl' && n.prop.startsWith('--')).length,
    })

    rule.remove()
  }

  // Drop an at-rule that the move emptied.
  root.walkAtRules((at) => {
    if (!at.nodes || at.nodes.length === 0) at.remove()
  })

  fs.writeFileSync(abs, root.toString())
}

const header = `/* YatraFlow token definitions.
   One owner for every primitive, semantic mapping, theme block and
   compatibility alias. Order is the cascade: a later block wins.
   Moved from the legacy modules in CSS-3 batch B1. Do not add page or
   component rules here. */

`
const body = moved.map((m) => `/* from ${m.from} */\n${m.text}`).join('\n\n')
fs.writeFileSync(path.join(ROOT, TARGET), header + body + '\n')

// Import the token module first: it holds only root blocks, so its position
// among them is what the cascade depends on.
const entryAbs = path.join(ROOT, ENTRY)
let entry = fs.readFileSync(entryAbs, 'utf8')
if (!entry.includes("'./styles/tokens.css'")) {
  entry = entry.replace(
    "@import './styles/legacy/01-foundations.css';",
    "@import './styles/tokens.css';\n@import './styles/legacy/01-foundations.css';",
  )
  fs.writeFileSync(entryAbs, entry)
}

console.log(`moved ${moved.length} block(s), ${moved.reduce((n, m) => n + m.declarations, 0)} declaration(s)`)
for (const m of moved) console.log(`  ${m.from}  ${m.selector}  ${m.declarations}`)
