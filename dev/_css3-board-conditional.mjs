// Scratch: move the conditional (inside @media) board rules from
// 04-mobile-usability.css into board-04.css, keeping the media wrapper, and
// leaving every non-board rule where it is.
import fs from 'node:fs'

const SRC = 'src/styles/legacy/04-mobile-usability.css'
const OUT = 'src/styles/components/board-04.css'
const BOARD_START = /^\s*(?:\/\*.*\*\/\s*)?(\.board(?![\w-])|\.board-[\w-]+)/
// A line belongs to the move when it is inside the phone block and its selector
// names the board family. Continuation lines of a board rule are captured by the
// brace-depth walk.
let text = fs.readFileSync(SRC, 'utf8')
const lines = text.split('\n')

// Find the phone block that actually contains the board rules: the media query
// whose body names `.board-head`.
let mediaStart = -1
for (let i = 0; i < lines.length; i++) {
  if (!/@media \(max-width: 720px\)/.test(lines[i])) continue
  // Scan its body for `.board-head`.
  let d = 0
  let end = i
  for (let j = i; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '{') d++
      else if (ch === '}') d--
    }
    if (d === 0) { end = j; break }
  }
  const body = lines.slice(i, end + 1).join('\n')
  if (/\.board-head\s*\{/.test(body)) { mediaStart = i; break }
}
if (mediaStart < 0) throw new Error('phone media block with board rules not found')
let depth = 0
let mediaEnd = mediaStart
for (let i = mediaStart; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') depth++
    else if (ch === '}') depth--
  }
  if (depth === 0) { mediaEnd = i; break }
}

const moved = []
const kept = []
for (let i = 0; i < lines.length; i++) {
  if (i <= mediaStart || i >= mediaEnd) { kept.push(lines[i]); continue }
  if (!BOARD_START.test(lines[i])) { kept.push(lines[i]); continue }
  // Capture the whole rule by brace depth, starting at this line.
  let d = 0
  let j = i
  for (; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '{') d++
      else if (ch === '}') d--
    }
    if (d === 0 && lines[j].includes('}')) break
  }
  moved.push(lines.slice(i, j + 1).join('\n'))
  i = j
}

console.log('moved rules:', moved.length)
fs.writeFileSync(SRC, kept.join('\n'))

// The reduced-motion rule at the top of the file is a second conditional board
// rule. Move it the same way, keeping its wrapper.
let after = fs.readFileSync(SRC, 'utf8')
const rmRule = '@media (prefers-reduced-motion: reduce) {\n  .board-stop { transition: none; }\n}\n'
const rmIndex = after.indexOf(rmRule)
if (rmIndex < 0) throw new Error('reduced-motion board-stop rule not found')
after = after.slice(0, rmIndex) + after.slice(rmIndex + rmRule.length)
fs.writeFileSync(SRC, after)
console.log('moved the reduced-motion board-stop rule')

const out = fs.readFileSync(OUT, 'utf8')
fs.writeFileSync(
  OUT,
  out.trimEnd() +
  '\n\n/* The phone stacking rules, kept inside their media query. They were inside\n' +
  '   the `@media (max-width: 720px)` block in 04-mobile-usability.css, and that\n' +
  '   wrapper is what makes them a phone rule rather than a global one. */\n' +
  '@media (max-width: 720px) {\n' + moved.map((m) => m.replace(/^/gm, '')).join('\n') + '\n}\n\n' +
  '@media (prefers-reduced-motion: reduce) {\n  .board-stop { transition: none; }\n}\n',
)
console.log('appended to', OUT)
