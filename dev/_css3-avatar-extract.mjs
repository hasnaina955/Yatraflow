// CSS-3 B7 checkpoint 1: extract the avatar recipe, its size variant and its
// tone variants. Page-scoped sizing and stacking stay where they are.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const TARGET = 'src/styles/components/avatar.css'
const ENTRY = 'src/styles.css'
const M02 = 'src/styles/legacy/02-select-and-print.css'
const M17 = 'src/styles/legacy/17-overview-tiles-and-cover.css'

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()

const parts = []
const moved = []

function take(rel, wanted, { comment = false } = {}) {
  const abs = path.join(ROOT, rel)
  const root = postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs })
  for (const sel of wanted) {
    let hit = null
    root.walkRules((r) => {
      if (!hit && r.parent.type === 'root' && norm(r.selector) === sel) hit = r
    })
    if (!hit) throw new Error(`no rule ${sel} in ${rel}`)
    let lead = ''
    if (comment && sel === '.avatar') {
      const prev = hit.prev()
      if (prev && prev.type === 'comment') {
        lead = prev.toString()
        prev.remove()
      }
    }
    parts.push({ from: rel, text: `${lead ? lead + '\n' : ''}${hit.toString()}`, sel })
    moved.push(`${rel.replace('src/styles/', '')}  ${sel}`)
    hit.remove()
  }
  fs.writeFileSync(abs, root.toString())
}

// The recipe and its size variant, in source order.
take(M02, ['.avatar', '.avatar.lg'], { comment: true })

// The tone variants are part of the surface, not a page scope.
take(M17, ['.avatar.tone-sea', '.avatar.tone-marigold', '.avatar.tone-bloom'])

const header = `/* Shared avatar.
   Owns the circular surface, its two sizes and its tone variants. A page places
   an avatar, sizes it for its own row and stacks it with its neighbours. A page
   does not restyle the surface from here.

   The tone classes are surface variants, so they live here. Page-scoped sizing
   such as \`.who-voted .avatar\` and stacking such as \`.member-stack .avatar\`
   stay in their page modules. */

`
fs.writeFileSync(path.join(ROOT, TARGET), header + parts.map((p) => p.text).join('\n\n') + '\n')

const entryAbs = path.join(ROOT, ENTRY)
let entry = fs.readFileSync(entryAbs, 'utf8')
if (!entry.includes("'./styles/components/avatar.css'")) {
  entry = entry.replace(
    "@import './styles/components/chip.css';",
    "@import './styles/components/chip.css';\n@import './styles/components/avatar.css';",
  )
  fs.writeFileSync(entryAbs, entry)
}

console.log(`moved ${parts.length} rule(s) into ${TARGET}`)
for (const m of moved) console.log('  ' + m)
