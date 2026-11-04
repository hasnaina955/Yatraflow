// Scratch: print the exact ownership-debt keys the nine Board configClasses
// produce, split by finding code, so each can be registered precisely.
import { execFileSync } from 'node:child_process'

let out = ''
try {
  out = execFileSync('node', ['scripts/css-ownership.mjs', '--json'], { encoding: 'utf8', shell: true })
} catch (e) {
  out = e.stdout ?? ''
}
const report = JSON.parse(String(out).replace(/^\uFEFF/, ''))
const findings = report.findings

const appearance = new Map()
const variable = new Map()
for (const f of findings) {
  if (f.code === 'config-appearance') appearance.set(f.key, f)
  else if (f.code === 'config-variable') variable.set(f.key, f)
}

console.log(`appearance keys: ${appearance.size}`)
for (const [k, f] of [...appearance].sort()) console.log(`  ${f.file}  ${f.selector}  ::${f.prop}`)
console.log(`\nvariable keys: ${variable.size}`)
for (const [k, f] of [...variable].sort()) console.log(`  ${f.file}  ${f.selector}  ${f.prop}`)

// Emit a JSON patch fragment for review.
const patch = {
  configAppearanceKeys: [...appearance.keys()].sort(),
  configVariableDebt: [...variable.values()].map((f) => ({
    file: f.file,
    selector: f.selector,
    variable: f.prop,
    reason: 'Existing shared stagger or shell rule that names this Board class beside other families. Recorded as historical debt so the class stays enforced: a new appearance declaration on it still fails.',
  })),
}
console.log('\n--- patch ---')
console.log(JSON.stringify(patch, null, 1))
