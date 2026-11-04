// CSS-3 B2 checkpoint 1: extract the .btn recipe and its states.
// Behaviour-preserving: same declarations, same order, same specificity.
// Rules are matched by selector content, not line number, so a rewrite of one
// rule cannot shift the target of the next.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const TARGET = 'src/styles/components/button.css'
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

// ---- 01: five rules that target the button alone ----------------------
{
  const { abs, root } = parse(M01)
  const wanted = ['.btn', '.btn:active', '.btn:disabled', 'a.btn', '.btn:focus-visible']
  for (const sel of wanted) {
    const rule = find(root, (r) => norm(r.selector) === sel && r.parent.type === 'root')
    if (!rule) throw new Error(`no rule ${sel} in ${M01}`)
    let comment = ''
    if (sel === '.btn') {
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

// ---- 04: split .btn out of three shared lists -------------------------
function splitOut(rel, predicate, keepSelector, label) {
  const { abs, root } = parse(rel)
  const rule = find(root, predicate)
  if (!rule) throw new Error(`no rule for ${label} in ${rel}`)

  const clone = rule.clone()
  clone.selector = keepSelector
  moved.push({ from: rel, selector: keepSelector, text: wrap(clone, contextOf(rule)) })

  const remaining = list(rule.selector).filter((s) => s !== keepSelector)
  if (!remaining.length) throw new Error(`splitting ${label} would empty the rule`)
  rule.selector = remaining.join(', ')
  fs.writeFileSync(abs, root.toString())
}

splitOut(M04, (r) => list(r.selector).includes('.btn:focus-visible') && list(r.selector).length > 10, '.btn:focus-visible', 'focus-visible list')
splitOut(M04, (r) => norm(r.selector) === '.btn, .tab-btn, .board-fit, .board-pulse-link', '.btn', 'transition list')
splitOut(M04, (r) => norm(r.selector) === '.btn:active, .tab-btn:active', '.btn:active', 'active list')

// ---- 04: the phone min-height rule, with its media context ------------
{
  const { abs, root } = parse(M04)
  const rule = find(
    root,
    (r) => norm(r.selector) === '.btn' && r.parent.type === 'atrule' && /max-width:\s*720px/.test(r.parent.params ?? ''),
  )
  if (!rule) throw new Error(`no phone .btn rule in ${M04}`)
  moved.push({ from: M04, selector: '.btn (phone)', text: wrap(rule, contextOf(rule)) })
  rule.remove()
  root.walkAtRules((at) => {
    if (!at.nodes || at.nodes.length === 0) at.remove()
  })
  fs.writeFileSync(abs, root.toString())
}

const header = `/* Shared button recipe.
   Owns button appearance, its supported scale, its interaction states, its
   focus ring and its local motion. A page places a button and sets the
   documented variables. A page does not restyle the control from here. */

`
const body = moved.map((m) => `/* from ${m.from} */\n${m.text}`).join('\n\n')
fs.writeFileSync(path.join(ROOT, TARGET), header + body + '\n')

const entryAbs = path.join(ROOT, ENTRY)
let entry = fs.readFileSync(entryAbs, 'utf8')
if (!entry.includes("'./styles/components/button.css'")) {
  entry = entry.replace(
    "@import './styles/legacy/05-share-and-trip-ticket.css';",
    "@import './styles/components/button.css';\n@import './styles/legacy/05-share-and-trip-ticket.css';",
  )
  fs.writeFileSync(entryAbs, entry)
}

console.log(`moved ${moved.length} rule(s) into ${TARGET}`)
for (const m of moved) console.log(`  ${m.from}  ${m.selector.slice(0, 58)}`)
