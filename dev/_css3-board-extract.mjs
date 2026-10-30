// CSS-3 board extractor (rewrite).
//
// Moves ONLY the rules whose every selector names the board family. A rule that
// shares its selector list with another family stays put: moving it would drag
// `.btn`, `.topnav` or `.lucide` into a board owner and claim styling this batch
// does not own. 20 rules are shared that way and 100 are board-only.
//
// The span finder is brace-depth based and is verified before any write: it must
// reproduce the rule's selector text exactly, or the tool refuses to run.
//
//   node dev/_css3-board-extract.mjs           # plan + span verification
//   node dev/_css3-board-extract.mjs --write    # perform the move
import fs from 'node:fs'
import path from 'node:path'
import { loadCssGraph } from '../scripts/css-source-graph.mjs'

const WRITE = process.argv.includes('--write')
const BOARD = /\.board(?![\w-])|\.board-[\w-]+|\.board--[\w-]+/
const isBoardSel = (s) => BOARD.test(s.replace(/:not\([^)]*\)/g, ''))

const SOURCES = [
  ['src/styles/legacy/01-foundations.css', 'src/styles/components/board-01.css'],
  ['src/styles/legacy/02-select-and-print.css', 'src/styles/components/board-02.css'],
  ['src/styles/legacy/04-mobile-usability.css', 'src/styles/components/board-04.css'],
  ['src/styles/legacy/06-shell-and-consistency.css', 'src/styles/components/board-06.css'],
  ['src/styles/legacy/16-motion-and-cover-v2.css', 'src/styles/components/board-16.css'],
]

const graph = loadCssGraph()
const rules = graph.records.filter((r) => r.kind === 'rule')
const touching = rules.filter((r) => r.selectors.some(isBoardSel))
const boardOnly = touching.filter((r) => r.selectors.every(isBoardSel))
const shared = touching.filter((r) => !r.selectors.every(isBoardSel))

// A rule inside `@media` cannot be lifted out and re-inserted at a file position:
// that would drop its condition. This tool only moves rules with NO conditional
// context. Conditional rules stay where they are and are reported, so the split is
// visible instead of silently wrong.
const unconditional = boardOnly.filter((r) => (r.context ?? []).length === 0)
const conditional = boardOnly.filter((r) => (r.context ?? []).length > 0)

console.log(`rules touching board: ${touching.length}`)
console.log(`  board-only: ${boardOnly.length}`)
console.log(`     unconditional (will move): ${unconditional.length}`)
console.log(`     inside a conditional block (stay): ${conditional.length}`)
console.log(`  shared with other families (stay): ${shared.length}`)
if (conditional.length) {
  console.log('\n  conditional board rules kept in place:')
  const byCtx = new Map()
  for (const r of conditional) {
    const k = `${(r.context ?? []).join('|')}  (${r.file.replace('src/styles/', '')})`
    byCtx.set(k, (byCtx.get(k) ?? 0) + 1)
  }
  for (const [k, n] of byCtx) console.log(`    ${n}x ${k}`)
}

/**
 * Find the exact character span of a rule, given its 1-based selector line.
 * Scans from the start of that line for the first `{`, then matches braces to
 * the closing one. Returns null when the selector text does not match, which is
 * how a wrong span is caught instead of trusted.
 */
function findSpan(text, rule) {
  const lineStarts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1)
  const lineStart = lineStarts[rule.line - 1]
  if (lineStart === undefined) return null
  const open = text.indexOf('{', lineStart)
  if (open === -1) return null
  // The selector must be exactly the rule's own text.
  const declared = text.slice(lineStart, open).replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ', ')
  const expected = rule.selectorNormalized.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ', ')
  if (declared !== expected) return { mismatch: { declared, expected } }
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        // Include the trailing newline so the file keeps its shape.
        return { start: lineStart, end: i + 1 }
      }
    }
  }
  return null
}

let totalPlanned = 0
const plan = []
for (const [file, out] of SOURCES) {
  const mine = unconditional.filter((r) => r.file === file)
  if (!mine.length) continue
  const text = fs.readFileSync(file, 'utf8')
  const spans = []
  for (const r of mine) {
    const span = findSpan(text, r)
    if (!span || span.mismatch) {
      console.error(`SPAN CHECK FAILED ${file}:${r.line}`)
      if (span?.mismatch) {
        console.error('  declared: ' + span.mismatch.declared.slice(0, 120))
        console.error('  expected: ' + span.mismatch.expected.slice(0, 120))
      }
      process.exit(1)
    }
    spans.push({ rule: r, ...span })
  }
  // Spans must not overlap.
  spans.sort((a, b) => a.start - b.start)
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].start < spans[i - 1].end) {
      console.error(`OVERLAPPING SPANS in ${file} at lines ${spans[i - 1].rule.line} and ${spans[i].rule.line}`)
      process.exit(1)
    }
  }
  plan.push({ file, out, text, spans })
  totalPlanned += spans.length
  console.log(`  ${file.replace('src/styles/', '')}: ${spans.length}`)
}
console.log(`planned moves: ${totalPlanned}`)
if (totalPlanned !== unconditional.length) {
  console.error('planned moves do not equal the board-only count')
  process.exit(1)
}

// Every shared rule is reported so the deferral is visible, not silent.
console.log('\nrules that stay because another family shares the selector list:')
for (const r of shared) {
  const others = r.selectors.filter((s) => !isBoardSel(s))
  console.log(`  ${r.file.replace('src/styles/', '')}:${r.line}  +${others.length} other selector(s)`)
}

if (!WRITE) {
  console.log('\nspan check passed. add --write to perform the move.')
  process.exit(0)
}

for (const { file, out, text, spans } of plan) {
  const blocks = spans.map((s) => text.slice(s.start, s.end).trimEnd())
  let next = text
  for (const s of [...spans].reverse()) next = next.slice(0, s.start) + next.slice(s.end)
  fs.writeFileSync(file, next)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(
    out,
    `/* Board — moved from ${file.replace('src/styles/', '')}, imported at that\n` +
    `   position so the family keeps its cascade place. Mechanical move: every\n` +
    `   declaration is unchanged. Rules the board shares with another family stay\n` +
    `   in the legacy file. */\n\n` +
    blocks.join('\n\n') + '\n',
  )
  console.log(`moved ${spans.length} -> ${out.replace('src/styles/', '')}`)
}

let entry = fs.readFileSync('src/styles.css', 'utf8')
for (const [file, out] of SOURCES) {
  // Only a module this tool actually wrote gets an import. A source with no
  // unconditional board rules produces no module, and importing a missing file
  // breaks the graph.
  if (!fs.existsSync(out)) continue
  const marker = `@import './${file.replace('src/styles/', 'styles/')}';`
  if (!entry.includes(marker)) throw new Error('import missing: ' + marker)
  const addition = `@import './${out.replace('src/styles/', 'styles/')}';`
  if (entry.includes(addition)) continue
  entry = entry.replace(marker, `${marker}\n${addition}`)
}
fs.writeFileSync('src/styles.css', entry)
console.log('entry imports updated')
