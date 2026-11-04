// CSS-3 B3 checkpoint 2: convert input page overrides to variable assignments.
import fs from 'node:fs'

const EDITS = [
  [
    'src/styles/legacy/02-select-and-print.css',
    "[data-theme='dark'] .auth-card .input { background: rgba(255, 255, 255, .06); }",
    "[data-theme='dark'] .auth-card .input { --input-background: rgba(255, 255, 255, .06); }",
  ],
  [
    'src/styles/legacy/05-share-and-trip-ticket.css',
    '.unit-input .input { width: 64px; height: 40px; padding-right: 48px; font-size: 13px; font-weight: 600; }',
    '.unit-input .input { width: 64px; height: 40px; --input-padding: 10px 48px 10px 13px; --input-font-size: 13px; --input-font-weight: 600; }',
  ],
  [
    'src/styles/legacy/05-share-and-trip-ticket.css',
    '.unit-input .input { font-size: 16px; }',
    '.unit-input .input { --input-font-size: 16px; }',
  ],
  [
    'src/styles/legacy/08-map-review.css',
    '.day-slot-search .input { flex: 1; min-width: 0; font-size: 13px; padding: 5px 8px; }',
    '.day-slot-search .input { flex: 1; min-width: 0; --input-font-size: 13px; --input-padding: 5px 8px; }',
  ],
  [
    'src/styles/legacy/13-phone-polish-and-guided-create.css',
    '.gcf :is(.input, .loc-input, .namebox-in) { min-height: 44px; border-radius: 12px; background: var(--card); font-size: 15px; color: var(--text); }',
    '.gcf :is(.input, .loc-input, .namebox-in) { min-height: 44px; --input-radius: 12px; --input-background: var(--card); --input-font-size: 15px; --input-color: var(--text); }',
  ],
  [
    'src/styles/legacy/13-phone-polish-and-guided-create.css',
    '.gcf-fuel-grid .input { padding: 8px; border: 0; background: transparent; appearance: textfield; }',
    '.gcf-fuel-grid .input { --input-padding: 8px; border: 0; --input-background: transparent; --input-appearance: textfield; }',
  ],
  [
    'src/styles/legacy/13-phone-polish-and-guided-create.css',
    '.gcf :is(.input, .loc-input, .namebox-input) { font-size: 16px; }',
    '.gcf :is(.input, .loc-input, .namebox-input) { --input-font-size: 16px; }',
  ],
]

let ok = 0
for (const [file, from, to] of EDITS) {
  const s = fs.readFileSync(file, 'utf8')
  if (!s.includes(from)) {
    console.log(`MISS  ${file}  ${from.slice(0, 70)}`)
    continue
  }
  fs.writeFileSync(file, s.replace(from, to))
  ok++
  console.log(`ok    ${file}`)
}
console.log(`converted ${ok}/${EDITS.length}`)
