// Scratch: compare the itin-card rule set before and after the move, by
// selector + context + declaration list. Prints anything missing or changed.
import { execFileSync } from 'node:child_process'
import { loadCssGraph } from '../scripts/css-source-graph.mjs'

const base = process.argv[2] ?? 'HEAD'
const FAMILY = 'itin-card'

function rulesFromGraph() {
  const graph = loadCssGraph()
  return graph.records
    .filter((r) => r.kind === 'rule')
    .filter((r) => r.selectors.some((s) => /\.itin-card(?![\w-])/.test(s.replace(/:not\([^)]*\)/g, ''))))
    .map((r) => ({
      context: (r.context ?? []).join('|'),
      selectors: r.selectorNormalized,
      decls: (r.declarations ?? []).map((d) => `${d.prop}:${d.value}${d.important ? '!' : ''}`).join(';'),
    }))
}

const now = rulesFromGraph()

// Read the old files straight from git and parse them with the same reader by
// writing a temporary single-file graph is not possible, so compare by text.
const oldText = execFileSync('git', ['show', `${base}:src/styles/legacy/02-select-and-print.css`], { encoding: 'utf8', shell: true }) +
  execFileSync('git', ['show', `${base}:src/styles/legacy/04-mobile-usability.css`], { encoding: 'utf8', shell: true }) +
  execFileSync('git', ['show', `${base}:src/styles/legacy/05-share-and-trip-ticket.css`], { encoding: 'utf8', shell: true }) +
  execFileSync('git', ['show', `${base}:src/styles/legacy/11-shared-page.css`], { encoding: 'utf8', shell: true })

// Count how many rules the old text had, by counting selector lines that name
// the family at the start of a rule (a line ending in { or part of a list).
const oldRuleStarts = (oldText.match(/^[^\n{}/]*\.itin-card[^\n{}/]*\{/gm) ?? []).length
console.log('old rule starts:', oldRuleStarts)
console.log('now rules:', now.length)

const norm = (s) => s.replace(/\s+/g, ' ').trim()
const nowBySel = new Map()
for (const r of now) {
  const k = `${r.context}::${norm(r.selectors)}`
  if (!nowBySel.has(k)) nowBySel.set(k, [])
  nowBySel.get(k).push(r)
}
for (const [k, list] of nowBySel) {
  if (list.length > 1) console.log(`DUPLICATE remapped: ${k} x${list.length}`)
}
console.log('\nnow selectors:')
for (const [k, list] of [...nowBySel.entries()].sort()) console.log(`  ${list.length}x [${k}]`)
