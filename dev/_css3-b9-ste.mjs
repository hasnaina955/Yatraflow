// Fix STE findings in the B9 section, then commit.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const p = 'docs/evidence/css-3-batches.md'
const lines = fs.readFileSync(p, 'utf8').split('\n')

const fixes = {
  819: 'It calls `toast()`, `undoToast()` and renders `ToastZone` from `src/components/ui.tsx`. The live region, the role assignment and the one timer per toast are the product\'s. So are the hover and focus hold and the dismiss path.',
  821: 'A fixture bug had to be fixed before anything rendered. `toast()` calls a module-level hook that `ToastZone` publishes on mount. Firing it in the same effect pass ran before that hook existed, so every call was a silent no-op.',
  832: '| States | 20: five environments by four kinds |',
  845: 'Each state asserts before measuring that the zone exists with `role="status"` and `aria-live="polite"`. It also asserts the expected number of pills and actions rendered, and that no pill is mid-fade.',
}

for (const [n, text] of Object.entries(fixes)) {
  lines[Number(n) - 1] = text
}
fs.writeFileSync(p, lines.join('\n'))

// Report what STE still objects to, if anything.
try {
  execFileSync('node', ['scripts/lint-ste.mjs', '--base', '9ea17e30'], { encoding: 'utf8', stdio: 'pipe' })
  console.log('STE: OK')
} catch (e) {
  const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  console.log(out.split('\n').filter((l) => /STE100:|md:\d+/.test(l)).join('\n'))
}
