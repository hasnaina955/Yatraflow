// CSS-3 B6 checkpoint 1: extract the chip recipe and its colour variants.
// Page-scoped chip rules and the shared touch/focus/transition lists stay.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const TARGET = 'src/styles/components/chip.css'
const ENTRY = 'src/styles.css'
const M02 = 'src/styles/legacy/02-select-and-print.css'

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()

const abs = path.join(ROOT, M02)
const root = postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs })

const WANTED = ['.chip', '.chip-teal', '.chip-outline', '.chip-saffron']
const parts = []

for (const sel of WANTED) {
  let hit = null
  root.walkRules((r) => {
    if (!hit && r.parent.type === 'root' && norm(r.selector) === sel) hit = r
  })
  if (!hit) throw new Error(`no rule ${sel} in ${M02}`)

  let comment = ''
  if (sel === '.chip') {
    const prev = hit.prev()
    if (prev && prev.type === 'comment') {
      comment = prev.toString()
      prev.remove()
    }
  }
  parts.push(`${comment ? comment + '\n' : ''}${hit.toString()}`)
  hit.remove()
}

fs.writeFileSync(abs, root.toString())

const header = `/* Shared chip.
   Owns the chip surface and its colour variants: the pill shape, the padding,
   the type and the fill/ink pairs. A page places a chip and sets the documented
   variables. A page does not restyle the surface from here.

   The chip's focus ring, its transition and its coarse-pointer hit area are
   declared in shared selector lists that span several controls. Those lists
   stay where they are until the shared-control batch moves them. */

`
fs.writeFileSync(path.join(ROOT, TARGET), header + parts.join('\n\n') + '\n')

const entryAbs = path.join(ROOT, ENTRY)
let entry = fs.readFileSync(entryAbs, 'utf8')
if (!entry.includes("'./styles/components/chip.css'")) {
  entry = entry.replace(
    "@import './styles/legacy/03-maplibre.css';",
    "@import './styles/components/chip.css';\n@import './styles/legacy/03-maplibre.css';",
  )
  fs.writeFileSync(entryAbs, entry)
}

console.log(`moved ${parts.length} rule(s) into ${TARGET}`)
for (const p of parts) console.log('  ' + p.split('{')[0].trim().split('\n').pop())
