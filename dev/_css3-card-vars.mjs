// CSS-3 B4 checkpoint 2: consolidate the card surface differences through
// documented variables, and split the two shared selector lists so the
// non-card components keep their declarations.
import fs from 'node:fs'
import path from 'node:path'

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
const edits = []

// ---- 1. the base recipe reads three documented variables ------------------
{
  const file = 'src/styles/components/card.css'
  const from = `.card {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow);
  padding: var(--space-8);
}`
  const to = `.card {
  background: var(--card-surface, var(--card));
  border: 1px solid var(--card-border-color, var(--line));
  border-radius: var(--card-radius, var(--radius));
  box-shadow: var(--card-shadow, var(--shadow));
  padding: var(--space-8);
}`
  edits.push([file, from, to])
}

// ---- 2. .bento: split .card from .stat-tile -------------------------------
{
  const file = 'src/styles/legacy/01-foundations.css'
  const from = `.bento .card, .bento .stat-tile { border-radius: var(--radius-lg); box-shadow: var(--shadow-soft); }`
  const to = `.bento .card { --card-radius: var(--radius-lg); --card-shadow: var(--shadow-soft); }
.bento .stat-tile { border-radius: var(--radius-lg); box-shadow: var(--shadow-soft); }`
  edits.push([file, from, to])
}

// ---- 3. .bezel: split .card from .created-card ---------------------------
{
  const file = 'src/styles/legacy/02-select-and-print.css'
  const from = `.bezel > .card, .bezel > .created-card { flex: 1; border-color: transparent; border-radius: calc(2rem - 7px); box-shadow: inset 0 1px 0 var(--yf-glass-sheen); }`
  const to = `.bezel > .card { flex: 1; --card-border-color: transparent; --card-radius: calc(2rem - 7px); --card-shadow: inset 0 1px 0 var(--yf-glass-sheen); }
.bezel > .created-card { flex: 1; border-color: transparent; border-radius: calc(2rem - 7px); box-shadow: inset 0 1px 0 var(--yf-glass-sheen); }`
  edits.push([file, from, to])
}

let ok = 0
for (const [file, from, to] of edits) {
  const abs = path.resolve(file)
  const s = fs.readFileSync(abs, 'utf8')
  if (!s.includes(from)) {
    console.log(`MISS  ${file}`)
    console.log('  expected: ' + norm(from).slice(0, 110))
    continue
  }
  fs.writeFileSync(abs, s.replace(from, to))
  ok++
  console.log(`ok    ${file}`)
}
console.log(`applied ${ok}/${edits.length}`)
