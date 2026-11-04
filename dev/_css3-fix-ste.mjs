// Fix the STE findings in the appended repair section.
import fs from 'node:fs'

const p = 'docs/evidence/css-3-batches.md'
const lines = fs.readFileSync(p, 'utf8').split('\n')

const fixes = {
  549: 'Three appearance regressions were present. The comparison tools could not detect any of them. Passing unit tests did not close any of them.',
  566: 'One shared harness now serves every tool. It assigns unique keys and fails on a duplicate or a missing key. It asserts that each scope selector matches an element. It checks that focus reaches every focusable element. Normalisation removes animated sub-pixel shadow drift and treats `none` as a zero shadow.',
  572: '**Root tokens were allowed inside any owner.** The token rule skipped every owner module, so `:root { --rogue: red }` inside `button.css` passed. Only the registered token owner may define root tokens now.',
  585: 'The button run also performed 990 focus checks. It reported 9 hidden elements, all `.bench-dock` at desktop width, where that dock is `display: none` by design.',
  587: 'Commands:',
  608: 'Motion is frozen before capture. Without that, the hero breathing glow lands at a different phase in each build. It then reads as a one-step colour change. The first two runs reported 17,174 and 14,082 differing pixels, with a maximum delta of 2 and 1.',
}

for (const [n, text] of Object.entries(fixes)) {
  lines[Number(n) - 1] = text
}
fs.writeFileSync(p, lines.join('\n'))
console.log('fixed 6 lines')
