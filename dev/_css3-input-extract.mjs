// CSS-3 B3 checkpoint 1: extract input, textarea and field composition.
// Behaviour-preserving: same declarations, same order, same specificity.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const TARGET = 'src/styles/components/input.css'
const ENTRY = 'src/styles.css'
const M01 = 'src/styles/legacy/01-foundations.css'
const M04 = 'src/styles/legacy/04-mobile-usability.css'

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
const list = (s) => norm(s).split(',').map((x) => x.trim()).filter(Boolean)

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

// ---- 01: the control appearance, its states, and field composition -----
{
  const { abs, root } = parse(M01)
  const wanted = [
    '.field',
    '.input, .textarea',
    '.input:focus, .textarea:focus',
    '.input:disabled, .textarea:disabled',
    '.textarea',
    ".input[aria-invalid='true'], .textarea[aria-invalid='true']",
  ]
  for (const sel of wanted) {
    const rule = find(root, (r) => norm(r.selector) === sel && r.parent.type === 'root')
    if (!rule) throw new Error(`no rule ${sel} in ${M01}`)
    let comment = ''
    if (sel === '.field') {
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

// ---- 04: split the two controls out of the shared focus list ----------
{
  const { abs, root } = parse(M04)
  const rule = find(
    root,
    (r) => list(r.selector).includes('.input:focus-visible') && list(r.selector).length > 10,
  )
  if (!rule) throw new Error(`no focus list in ${M04}`)
  for (const keep of ['.input:focus-visible', '.textarea:focus-visible']) {
    const clone = rule.clone()
    clone.selector = keep
    moved.push({ from: M04, selector: keep, text: wrap(clone, contextOf(rule)) })
  }
  const remaining = list(rule.selector).filter((s) => s !== '.input:focus-visible' && s !== '.textarea:focus-visible')
  if (!remaining.length) throw new Error('splitting the focus list would empty it')
  rule.selector = remaining.join(', ')
  fs.writeFileSync(abs, root.toString())
}

// ---- 04: the phone sizing rule, with its media context ----------------
{
  const { abs, root } = parse(M04)
  const rule = find(
    root,
    (r) =>
      norm(r.selector) === '.input, .textarea' &&
      r.parent.type === 'atrule' &&
      /max-width:\s*720px/.test(r.parent.params ?? ''),
  )
  if (!rule) throw new Error(`no phone input rule in ${M04}`)
  moved.push({ from: M04, selector: '.input, .textarea (phone)', text: wrap(rule, contextOf(rule)) })
  rule.remove()
  root.walkAtRules((at) => {
    if (!at.nodes || at.nodes.length === 0) at.remove()
  })
  fs.writeFileSync(abs, root.toString())
}

const header = `/* Shared input, textarea and field composition.
   Owns the control's appearance, its interaction states, its focus ring and
   its local motion. It also owns how a label, a control and a hint stack in a
   field. A page places a field and sets the documented variables. A page does
   not restyle the control from here.

   The search field and the select keep their own modules. This file must not
   grow a second recipe for either of them. */

`
const body = moved.map((m) => `/* from ${m.from} */\n${m.text}`).join('\n\n')
fs.writeFileSync(path.join(ROOT, TARGET), header + body + '\n')

const entryAbs = path.join(ROOT, ENTRY)
let entry = fs.readFileSync(entryAbs, 'utf8')
if (!entry.includes("'./styles/components/input.css'")) {
  entry = entry.replace(
    "@import './styles/legacy/05-share-and-trip-ticket.css';",
    "@import './styles/components/input.css';\n@import './styles/legacy/05-share-and-trip-ticket.css';",
  )
  fs.writeFileSync(entryAbs, entry)
}

console.log(`moved ${moved.length} rule(s) into ${TARGET}`)
for (const m of moved) console.log(`  ${m.from}  ${m.selector.slice(0, 56)}`)
