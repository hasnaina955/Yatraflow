// CSS-3 B8 checkpoint 1: extract the dialog surface.
// The page-scoped .gcf variant stays where it is.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const TARGET = 'src/styles/components/dialog.css'
const ENTRY = 'src/styles.css'
const M02 = 'src/styles/legacy/02-select-and-print.css'
const M04 = 'src/styles/legacy/04-mobile-usability.css'
const M07 = 'src/styles/legacy/07-workspace-and-unlock.css'

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
const parts = []
const moved = []

function load(rel) {
  const abs = path.join(ROOT, rel)
  return { abs, root: postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs }) }
}

function contextOf(rule) {
  const chain = []
  let parent = rule.parent
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule') chain.unshift(`@${parent.name}${parent.params ? ' ' + parent.params : ''}`)
    parent = parent.parent
  }
  return chain
}

const wrap = (rule, chain) => {
  let text = rule.toString()
  for (let i = chain.length - 1; i >= 0; i--) text = `${chain[i]} {\n${text}\n}`
  return text
}

function takeWhole(rel, predicate, label, { comment = false } = {}) {
  const { abs, root } = load(rel)
  let hit = null
  root.walkRules((r) => {
    if (!hit && predicate(r)) hit = r
  })
  if (!hit) throw new Error(`no rule for ${label} in ${rel}`)
  let lead = ''
  if (comment) {
    const prev = hit.prev()
    if (prev && prev.type === 'comment') {
      lead = prev.toString()
      prev.remove()
    }
  }
  parts.push({ from: rel, text: `${lead ? lead + '\n' : ''}${wrap(hit, contextOf(hit))}` })
  moved.push(`${rel.replace('src/styles/', '')}  ${label}`)
  hit.remove()
  root.walkAtRules((at) => {
    if (!at.nodes || at.nodes.length === 0) at.remove()
  })
  fs.writeFileSync(abs, root.toString())
}

// The overlay and the sheet, plus their two responsive steps.
takeWhole(M02, (r) => norm(r.selector) === '.modal-overlay' && r.parent.type === 'root', '.modal-overlay', {
  comment: true,
})
takeWhole(
  M02,
  (r) => norm(r.selector) === '.modal-overlay' && r.parent.type === 'atrule' && /min-width:\s*640px/.test(r.parent.params ?? ''),
  '.modal-overlay (min-width 640px)',
)
takeWhole(M02, (r) => norm(r.selector) === '.modal' && r.parent.type === 'root', '.modal', { comment: true })
takeWhole(
  M02,
  (r) => norm(r.selector) === '.modal' && r.parent.type === 'atrule' && /min-width:\s*640px/.test(r.parent.params ?? ''),
  '.modal (min-width 640px)',
)
takeWhole(
  M04,
  (r) => norm(r.selector) === '.modal' && r.parent.type === 'atrule' && /max-width:\s*720px/.test(r.parent.params ?? ''),
  '.modal (max-width 720px)',
)

// The `full` variant is the same dialog with the sheet padding handed to content.
for (const [pred, label] of [
  [(r) => norm(r.selector) === '.modal-full' && r.parent.type === 'root', '.modal-full'],
  [(r) => norm(r.selector) === '.modal-full .modal-head' && r.parent.type === 'root', '.modal-full .modal-head'],
  [
    (r) =>
      norm(r.selector) === '.modal-full' &&
      r.parent.type === 'atrule' &&
      /prefers-reduced-motion:\s*no-preference/.test(r.parent.params ?? ''),
    '.modal-full entrance',
  ],
  [
    (r) =>
      norm(r.selector) === '.modal-full' &&
      r.parent.type === 'atrule' &&
      /prefers-reduced-motion:\s*reduce/.test(r.parent.params ?? ''),
    '.modal-full reduced',
  ],
]) {
  takeWhole(M07, pred, label)
}

const header = `/* Shared dialog.
   Owns the fixed overlay, the sheet surface, its two responsive steps and the
   \`full\` variant's entrance. It owns the surface only.

   The behaviour is not CSS. Portal placement, the focus trap, the Escape
   handler, the scroll lock and the focus restoration live in
   src/components/ui.tsx \`Modal\`. Nothing here changes them.

   A page places a dialog. \`.gcf .modal\` and \`.gcf .modal-overlay\` stay in their
   page module because they are that page's own sizing. */

`
fs.writeFileSync(path.join(ROOT, TARGET), header + parts.map((p) => p.text).join('\n\n') + '\n')

const entryAbs = path.join(ROOT, ENTRY)
let entry = fs.readFileSync(entryAbs, 'utf8')
if (!entry.includes("'./styles/components/dialog.css'")) {
  entry = entry.replace(
    "@import './styles/components/chip.css';",
    "@import './styles/components/chip.css';\n@import './styles/components/dialog.css';",
  )
  fs.writeFileSync(entryAbs, entry)
}

console.log(`moved ${parts.length} rule(s) into ${TARGET}`)
for (const m of moved) console.log('  ' + m)
