// Fix the STE findings in the appended B8 section.
import fs from 'node:fs'

const p = 'docs/evidence/css-3-batches.md'
const lines = fs.readFileSync(p, 'utf8').split('\n')

const fixes = {
  741: 'Nine rules are the surface. They are `.modal-overlay` and `.modal` with their `min-width: 640px` steps. They are also the `max-width: 720px` sheet step, and `.modal-full` with its head rule and two motion rules.',
  745: 'The fixture renders `Modal` from `src/components/ui.tsx`. The focus trap, the Escape handler, the scroll lock, the focus restoration and the motion under test are the ones the product ships. Lookalike markup would have proven nothing about any of them.',
  760: '**The Tab check never pressed Tab.** It sampled `document.activeElement` eight times, so it always saw the same control. It proved nothing about the trap. It now presses Tab and fails if the walk does not reach every focusable control. The sequence is `Close → confirm → cancel → Close` and wraps, in all six environments.',
  773: 'Each state asserts before measuring. The overlay, the dialog, `role="dialog"`, `aria-modal="true"` and at least two focusable controls must exist. The long-body case must render at least twenty paragraphs. A state that measured nothing fails rather than report zero.',
  788: 'Two comments in the moved rules claimed the repetition was needed, because the later block re-declared the base max-height. With a variable the base reads, that is no longer true. Both were rewritten to describe what the code does.',
}

for (const [n, text] of Object.entries(fixes)) {
  lines[Number(n) - 1] = text
}
fs.writeFileSync(p, lines.join('\n'))
console.log('fixed 5 lines')
