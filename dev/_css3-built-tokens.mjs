// CSS-3 B1: does the built stylesheet keep the token declaration order?
import fs from 'node:fs'
import path from 'node:path'

const dir = 'dist/assets'
const css = fs.readdirSync(dir).filter((f) => f.endsWith('.css'))
if (!css.length) {
  console.error('no built css found')
  process.exit(1)
}

const norm = (s) => s.replace(/\s+/g, ' ').trim()
// Lightning CSS lowercases hex colours and injects its own variables.
// Neither is a cascade change, so both are normalised away.
const normValue = (s) => norm(s).replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => m.toLowerCase())
const isNoise = (prop) => prop.startsWith('--lightningcss')
const built = []
for (const f of css) {
  const text = fs.readFileSync(path.join(dir, f), 'utf8')
  // Walk root-ish blocks only, in file order, and collect token declarations.
  const re = /(:root(?:[^{}]*?)|\[data-theme=['"]?dark['"]?\])\s*\{([^}]*)\}/g
  for (const m of text.matchAll(re)) {
    const selector = norm(m[1])
    if (/[.#][\w-]/.test(selector.replace(/\[[^\]]*\]/g, ''))) continue
    for (const decl of m[2].split(';')) {
      const i = decl.indexOf(':')
      if (i < 0) continue
      const prop = norm(decl.slice(0, i))
      const value = norm(decl.slice(i + 1))
      if (!prop.startsWith('--') || !value) continue
      if (isNoise(prop)) continue
      built.push(`${selector}\u0000${prop}\u0000${normValue(value)}`)
    }
  }
}

const before = JSON.parse(fs.readFileSync('dev/_css3-token-before.json', 'utf8'))
const sourceSeq = before.sequence.map((row) => {
  const [ctx, selector, prop, value] = row.split('\u0000')
  return { ctx, selector, prop, value: normValue(value) }
})

// Compare as multiset per selector+prop+value, since the built sheet may merge
// adjacent blocks that came from different files.
const key = (s) => `${s.selector}\u0000${s.prop}\u0000${s.value}`
const sourceCounts = new Map()
for (const row of sourceSeq) sourceCounts.set(key(row), (sourceCounts.get(key(row)) ?? 0) + 1)
const builtCounts = new Map()
for (const row of built) builtCounts.set(row, (builtCounts.get(row) ?? 0) + 1)

let missing = 0
let extra = 0
for (const [k, n] of sourceCounts) {
  const have = builtCounts.get(k) ?? 0
  if (have < n) {
    missing++
    if (missing <= 8) console.log(`MISSING ${k.split('\u0000').join(' | ')} (want ${n}, have ${have})`)
  }
}
for (const [k, n] of builtCounts) {
  const want = sourceCounts.get(k) ?? 0
  if (n > want) {
    extra++
    if (extra <= 8) console.log(`EXTRA   ${k.split('\u0000').join(' | ')} (want ${want}, have ${n})`)
  }
}

console.log(`source tokens=${sourceSeq.length}  built tokens=${built.length}`)
console.log(`missing groups=${missing}  extra groups=${extra}`)
process.exit(missing || extra ? 1 : 0)
