// CSS-3 B2: move the button variant block from section 01 into the module.
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()
const SRC = 'src/styles/legacy/01-foundations.css'
const MOD = 'src/styles/components/button.css'

const abs = path.join(ROOT, SRC)
const root = postcss.parse(fs.readFileSync(abs, 'utf8'), { from: abs })

const VARIANT = /^\.btn-(primary|saffron|navy|outline|ghost)(:[\w-]+)?(:not\(:disabled\))?$/
const isVariant = (sel) => {
  const s = sel.replace(/\s+/g, ' ').trim()
  if (VARIANT.test(s)) return true
  return /^\[data-theme='dark'\] \.btn-(primary|saffron|navy|outline|ghost)$/.test(s)
}

const targets = []
root.walkRules((r) => {
  if (r.parent.type !== 'root') return
  if (isVariant(r.selector)) targets.push(r)
})

const moved = targets.map((r) => r.toString())
for (const r of targets) r.remove()

fs.writeFileSync(abs, root.toString())

const modAbs = path.join(ROOT, MOD)
let btn = fs.readFileSync(modAbs, 'utf8')
const header = '/* Button variants: colour, border and ink. These are the control. */\n'
btn = btn.trimEnd() + '\n\n' + header + moved.join('\n') + '\n'
fs.writeFileSync(modAbs, btn)

console.log(`moved ${moved.length} variant rule(s)`)
for (const m of moved) console.log('  ' + m.split('{')[0].trim())
