// Scratch: for each board class, how many rules are board-only and how many are
// shared with another family. A class with shared rules cannot be declared owned
// without flagging the shared rule in its legacy file.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'

const BOARD = /\.board(?![\w-])|\.board-[\w-]+/
const isBoardSel = (s) => BOARD.test(s.replace(/:not\([^)]*\)/g, ''))
const graph = loadCssGraph()
const rules = graph.records.filter((r) => r.kind === 'rule')

const tally = new Map()
for (const r of rules) {
  const onlyBoard = r.selectors.every(isBoardSel)
  const toks = new Set()
  for (const s of r.selectors) {
    for (const m of s.replace(/:not\([^)]*\)/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) toks.add(m[1])
  }
  for (const t of toks) {
    if (!isBoardSel('.' + t)) continue
    if (!tally.has(t)) tally.set(t, { own: 0, shared: 0, files: new Set() })
    const e = tally.get(t)
    if (onlyBoard) e.own++
    else { e.shared++; e.files.add(r.file.replace('src/styles/', '')) }
  }
}

const rows = [...tally.entries()].sort((a, b) => (a[1].shared - b[1].shared) || a[0].localeCompare(b[0]))
console.log('class'.padEnd(24) + 'board-only'.padStart(11) + 'shared'.padStart(8) + '  shared in')
for (const [t, e] of rows) {
  console.log(t.padEnd(24) + String(e.own).padStart(11) + String(e.shared).padStart(8) + '  ' + [...e.files].join(', '))
}
const clean = rows.filter(([, e]) => e.shared === 0).map(([t]) => t)
const mixed = rows.filter(([, e]) => e.shared > 0).map(([t]) => t)
console.log('\nno shared rules (safe to own): ' + clean.length)
console.log(clean.join(' '))
console.log('\nhas shared rules (cannot own as-is): ' + mixed.length)
console.log(mixed.join(' '))
