// CSS-3 B4 checkpoint 1: extract the card recipe, its sibling rhythm and the
// route-snap variant. Page placement stays where it is.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const TARGET = 'src/styles/components/card.css'
const ENTRY = 'src/styles.css'
const M01 = 'src/styles/legacy/01-foundations.css'

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()

const parse = (rel) => {
  const abs = path.join(ROOT, rel)
  return { abs, root: postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs }) }
}

const contextOf = (rule) => {
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

const find = (root, predicate) => {
  let hit = null
  root.walkRules((rule) => {
    if (!hit && predicate(rule)) hit = rule
  })
  return hit
}

const moved = []

// The recipe, its sibling rhythm and the route-snap variant all live in 01.
// Order matters: `.card + .card` follows `.card`, and `.card.route-snap` comes
// before both, so the sequence is preserved exactly.
{
  const { abs, root } = parse(M01)
  const wanted = [
    { sel: '.card.route-snap', comment: false },
    { sel: '.card', comment: true },
    { sel: '.card + .card', comment: false },
  ]
  for (const { sel, comment: takeComment } of wanted) {
    const rule = find(root, (r) => norm(r.selector) === sel && r.parent.type === 'root')
    if (!rule) throw new Error(`no rule ${sel} in ${M01}`)
    let comment = ''
    if (takeComment) {
      const prev = rule.prev()
      if (prev && prev.type === 'comment') {
        comment = prev.toString()
        prev.remove()
      }
    }
    moved.push({ from: M01, selector: sel, text: `${comment ? comment + '\n' : ''}${wrap(rule, contextOf(rule))}` })
    rule.remove()
  }
  fs.writeFileSync(abs, root.toString())
}

// Order in the module must match the source order in section 01.
const ORDER = ['.card.route-snap', '.card', '.card + .card']
moved.sort((a, b) => ORDER.indexOf(a.selector) - ORDER.indexOf(b.selector))

const header = `/* Shared card.
   Owns the static card surface: fill, border, radius, shadow, padding and the
   sibling rhythm between stacked cards. It also owns the route-snap variant.
   A page places a card and sets the documented variables. A page does not
   restyle the surface from here.

   A card is a static container. The interactive cards in this product are
   .itin-card and .trip-card-hit, which are separate families with their own
   hover and focus behaviour. Do not fold them into this file. */

`
const body = moved.map((m) => `/* from ${m.from} */\n${m.text}`).join('\n\n')
fs.writeFileSync(path.join(ROOT, TARGET), header + body + '\n')

const entryAbs = path.join(ROOT, ENTRY)
let entry = fs.readFileSync(entryAbs, 'utf8')
if (!entry.includes("'./styles/components/card.css'")) {
  entry = entry.replace(
    "@import './styles/legacy/02-select-and-print.css';",
    "@import './styles/components/card.css';\n@import './styles/legacy/02-select-and-print.css';",
  )
  fs.writeFileSync(entryAbs, entry)
}

console.log(`moved ${moved.length} rule(s) into ${TARGET}`)
for (const m of moved) console.log(`  ${m.selector}`)
