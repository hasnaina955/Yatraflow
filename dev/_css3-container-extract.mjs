// CSS-3 B5 checkpoint 1: extract the shared container recipe.
// Page-scoped container variants stay where they are.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const TARGET = 'src/styles/layouts/container.css'
const ENTRY = 'src/styles.css'
const M01 = 'src/styles/legacy/01-foundations.css'
const M04 = 'src/styles/legacy/04-mobile-usability.css'

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

// ---- 01: the shared recipe --------------------------------------------
{
  const { abs, root } = parse(M01)
  const rule = find(root, (r) => norm(r.selector) === '.container' && r.parent.type === 'root')
  if (!rule) throw new Error(`no .container in ${M01}`)
  let comment = ''
  const prev = rule.prev()
  if (prev && prev.type === 'comment') {
    comment = prev.toString()
    prev.remove()
  }
  moved.push({ from: M01, selector: '.container', text: `${comment ? comment + '\n' : ''}${wrap(rule, contextOf(rule))}` })
  rule.remove()
  fs.writeFileSync(abs, root.toString())
}

// ---- 04: the shared responsive padding -------------------------------
{
  const { abs, root } = parse(M04)
  const rule = find(
    root,
    (r) =>
      norm(r.selector) === '.container' &&
      r.parent.type === 'atrule' &&
      /max-width:\s*640px/.test(r.parent.params ?? ''),
  )
  if (!rule) throw new Error(`no phone .container in ${M04}`)
  moved.push({ from: M04, selector: '.container (640px)', text: wrap(rule, contextOf(rule)) })
  rule.remove()
  root.walkAtRules((at) => {
    if (!at.nodes || at.nodes.length === 0) at.remove()
  })
  fs.writeFileSync(abs, root.toString())
}

const header = `/* Shared page container.
   Owns the width cap, the centring and the horizontal padding of a page
   container, and the narrow-width padding step. It owns nothing about what a
   page puts inside it.

   A page selects a width through --container-max. A page that needs its own
   layout keeps that layout in its own module. */

`
const body = moved.map((m) => `/* from ${m.from} */\n${m.text}`).join('\n\n')
fs.mkdirSync(path.join(ROOT, 'src/styles/layouts'), { recursive: true })
fs.writeFileSync(path.join(ROOT, TARGET), header + body + '\n')

const entryAbs = path.join(ROOT, ENTRY)
let entry = fs.readFileSync(entryAbs, 'utf8')
if (!entry.includes("'./styles/layouts/container.css'")) {
  entry = entry.replace(
    "@import './styles/legacy/05-share-and-trip-ticket.css';",
    "@import './styles/layouts/container.css';\n@import './styles/legacy/05-share-and-trip-ticket.css';",
  )
  fs.writeFileSync(entryAbs, entry)
}

console.log(`moved ${moved.length} rule(s) into ${TARGET}`)
for (const m of moved) console.log(`  ${m.from}  ${m.selector}`)
