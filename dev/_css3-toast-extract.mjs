// CSS-3 B9 extraction: toast zone, pill, semantic variants and action button.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const TARGET = 'src/styles/components/toast.css'
const ENTRY = 'src/styles.css'
const M02 = 'src/styles/legacy/02-select-and-print.css'

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
const abs = path.join(ROOT, M02)
const root = postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs })

// Source order matters: the zone precedes the pill, and the dark overrides come
// after .ok/.err so they keep winning exactly as before.
const WANTED = [
  '.toast-zone',
  '.toast',
  '.toast.ok',
  '.toast.err',
  "[data-theme='dark'] .toast",
  "[data-theme='dark'] .toast.ok",
  "[data-theme='dark'] .toast.err",
  '.toast-action',
  '.toast-action:hover',
]

const parts = []
for (const sel of WANTED) {
  let hit = null
  root.walkRules((r) => {
    if (!hit && r.parent.type === 'root' && norm(r.selector) === sel) hit = r
  })
  if (!hit) throw new Error(`no rule ${sel} in ${M02}`)

  // Take the comment that explains a rule, so the contrast note travels with
  // the dark overrides it describes.
  let lead = ''
  const prev = hit.prev()
  if (prev && prev.type === 'comment' && sel === "[data-theme='dark'] .toast") {
    lead = prev.toString()
    prev.remove()
  }
  parts.push({ sel, text: `${lead ? lead + '\n' : ''}${hit.toString()}` })
  hit.remove()
}

fs.writeFileSync(abs, root.toString())

const header = `/* Shared toast.
   Owns the fixed toast zone, the pill, its two semantic variants and the action
   button inside it.

   Behaviour is not CSS. The live region, the role assignment, the one timer per
   toast, the hover and focus hold and the dismiss path live in
   src/components/ui.tsx \`ToastZone\`. Nothing here changes them.

   The three dark overrides sit after .ok and .err on purpose: the neutral dark
   rule has the same specificity as the semantic ones, so it must not win. The
   note explaining that travelled with them. */

`
fs.writeFileSync(path.join(ROOT, TARGET), header + parts.map((p) => p.text).join('\n\n') + '\n')

const entryAbs = path.join(ROOT, ENTRY)
let entry = fs.readFileSync(entryAbs, 'utf8')
if (!entry.includes("'./styles/components/toast.css'")) {
  entry = entry.replace(
    "@import './styles/components/dialog.css';",
    "@import './styles/components/dialog.css';\n@import './styles/components/toast.css';",
  )
  fs.writeFileSync(entryAbs, entry)
}

console.log(`moved ${parts.length} rule(s) into ${TARGET}`)
for (const p of parts) console.log('  ' + p.sel)
