// CSS-3 B2: move the button size scale and trail helpers into the module.
// These compete with the base recipe at equal specificity, so they must stay
// after it in the cascade.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const SRC = 'src/styles/legacy/01-foundations.css'
const MOD = 'src/styles/components/button.css'

const abs = path.join(ROOT, SRC)
const root = postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs })

const WANTED = [
  '.btn-danger',
  '.btn-danger:hover:not(:disabled)',
  '.btn-sm',
  '.btn-lg',
  '.btn-trail',
  '.btn-trail-icon',
  '.btn-trail:hover .btn-trail-icon',
]

const norm = (s) => s.replace(/\s+/g, ' ').trim()
const parts = []

for (const sel of WANTED) {
  const rule = (() => {
    let hit = null
    root.walkRules((r) => {
      if (!hit && r.parent.type === 'root' && norm(r.selector) === sel) hit = r
    })
    return hit
  })()
  if (!rule) throw new Error(`no rule ${sel} in ${SRC}`)

  // Carry the comment that sits directly above the rule.
  let comment = ''
  const prev = rule.prev()
  if (prev && prev.type === 'comment') {
    comment = prev.toString()
    prev.remove()
  }
  parts.push(`${comment ? comment + '\n' : ''}${rule.toString()}`)
  rule.remove()
}

fs.writeFileSync(abs, root.toString())

const modAbs = path.join(ROOT, MOD)
let mod = fs.readFileSync(modAbs, 'utf8')

// Insert after the base recipe block, before the phone rule, so the scale keeps
// its original "declared after .btn" relationship.
const marker = '/* Phone: the control keeps a 44px touch target. */'
if (!mod.includes(marker)) throw new Error('phone marker not found in the module')
mod = mod.replace(marker, `/* ---------- Button size scale ---------- */\n${parts.join('\n')}\n\n${marker}`)
fs.writeFileSync(modAbs, mod)

console.log(`moved ${parts.length} scale rule(s)`)
for (const p of parts) console.log('  ' + p.split('{')[0].trim().split('\n').pop())
