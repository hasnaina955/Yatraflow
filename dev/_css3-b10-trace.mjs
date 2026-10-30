// CSS-3 B10 cascade trace. Scratch tool, not part of the gate.
// For each family class, list every rule in the graph that targets it, with the
// full conditional context and the ancestor scope that constrains it.
import { loadCssGraph } from '../scripts/css-source-graph.mjs'

const graph = loadCssGraph()
const rules = graph.records.filter((r) => r.kind === 'rule')

const families = process.argv.slice(2)
if (!families.length) {
  console.error('usage: node dev/_css3-b10-trace.mjs <class> [class...]')
  process.exit(2)
}

// Split a complex selector on top-level combinators, keeping the combinator.
function segments(sel) {
  const out = []
  let depth = 0
  let buf = ''
  let pendingComb = ''
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (depth === 0 && /[\s>+~]/.test(c)) {
      if (buf.trim()) {
        out.push({ comb: pendingComb, text: buf.trim() })
        buf = ''
        pendingComb = ''
      }
      if (c !== ' ' && c !== '\n' && c !== '\t') pendingComb = c
      continue
    }
    buf += c
  }
  if (buf.trim()) out.push({ comb: pendingComb, text: buf.trim() })
  return out
}

// Does this compound selector target the family class as a real class, not
// inside :not() and not as a prefix of a longer class name?
function targetsFamily(compound, fam) {
  const re = new RegExp('\\.' + fam.replace(/[-]/g, '\\-') + '(?![\\w-])', 'g')
  let found = false
  let m
  while ((m = re.exec(compound))) {
    // ignore matches that sit inside a :not(...) group
    const before = compound.slice(0, m.index)
    const opens = (before.match(/:not\(/g) ?? []).length
    const closes = (before.match(/\)/g) ?? []).length
    if (opens > closes) continue
    found = true
  }
  return found
}

for (const fam of families) {
  const hits = []
  for (const r of rules) {
    for (const sel of r.selectors) {
      const segs = segments(sel)
      let idx = -1
      for (let i = 0; i < segs.length; i++) {
        if (targetsFamily(segs[i].text, fam)) {
          idx = i
          break
        }
      }
      if (idx === -1) continue
      const ancestors = segs.slice(0, idx)
      const target = segs[idx]
      const rest = segs.slice(idx + 1)
      hits.push({
        file: r.file.replace('src/styles/', ''),
        line: r.line,
        context: r.context.map((c) => c.text ?? c).join(' | '),
        sel,
        ancestors: ancestors.map((s) => (s.comb ? s.comb : '') + s.text).join(' '),
        target: target.text,
        targetComb: target.comb,
        rest: rest.map((s) => (s.comb ? s.comb : '') + s.text).join(' '),
        decls: r.declarations,
      })
    }
  }

  // Which selectors from the same rule? Keep them together for reading.
  console.log(`\n${'='.repeat(100)}`)
  console.log(`FAMILY .${fam}  —  ${hits.length} selector matches in ${new Set(hits.map((h) => h.file)).size} files`)
  console.log('='.repeat(100))

  const global = hits.filter((h) => !h.ancestors)
  const scoped = hits.filter((h) => h.ancestors)
  console.log(`\n-- NO ancestor scope (${global.length}) --`)
  for (const h of global) {
    const ctx = h.context ? `   @${h.context}` : ''
    console.log(`\n${h.file}:${h.line}${ctx}`)
    console.log(`  sel: ${h.sel}`)
    if (h.rest) console.log(`  then: ${h.rest}`)
    console.log(
      '  decl: ' +
        h.decls
          .map((d) => `${d.prop}: ${d.value}${d.important ? ' !important' : ''}`)
          .join('; ')
    )
  }
  console.log(`\n-- WITH ancestor scope (${scoped.length}) --`)
  const byAnc = new Map()
  for (const h of scoped) {
    const k = h.ancestors
    if (!byAnc.has(k)) byAnc.set(k, [])
    byAnc.get(k).push(h)
  }
  for (const [anc, list] of [...byAnc.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`\n  scope: ${anc}   (${list.length})`)
    for (const h of list) {
      const ctx = h.context ? `   @${h.context}` : ''
      console.log(`    ${h.file}:${h.line}${ctx}`)
      console.log(`      sel: ${h.sel}`)
      if (h.rest) console.log(`      then: ${h.rest}`)
      console.log(
        '      decl: ' +
          h.decls
            .map((d) => `${d.prop}: ${d.value}${d.important ? ' !important' : ''}`)
            .join('; ')
      )
    }
  }
}
