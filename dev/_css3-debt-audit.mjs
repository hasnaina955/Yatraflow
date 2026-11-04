// CSS-3 debt audit: are the newly covered appearance keys pre-existing
// declarations, or violations introduced by the batch?
//
// Compares the current baseline against the frozen pre-B3 commit and reads the
// same declaration out of that commit, so "unchanged" is proven, not assumed.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import postcss from 'postcss'

const FROZEN = 'e2048a1e'
const norm = (s) => String(s).replace(/\s+/g, ' ').trim()

const gitShow = (path) => execFileSync('git', ['show', `${FROZEN}:${path}`], { encoding: 'utf8', maxBuffer: 1 << 26 })

const currentMap = JSON.parse(fs.readFileSync('docs/css-ownership.json', 'utf8'))
const frozenMap = JSON.parse(gitShow('docs/css-ownership.json'))

const current = new Set(currentMap.baselines.configAppearanceKeys ?? [])
const frozen = new Set(frozenMap.baselines.configAppearanceKeys ?? [])

const added = [...current].filter((k) => !frozen.has(k)).sort()
const removed = [...frozen].filter((k) => !current.has(k)).sort()

/** selector+prop -> value, for one file's text. */
function declarationsIn(text) {
  const out = new Map()
  const root = postcss.parse(text)
  root.walkRules((rule) => {
    const sel = norm(rule.selector)
    for (const node of rule.nodes ?? []) {
      if (node.type !== 'decl') continue
      out.set(`${sel}::${node.prop}`, norm(node.value))
    }
  })
  return out
}

// Cache per file.
const frozenCache = new Map()
const currentCache = new Map()
function frozenDecls(file) {
  if (!frozenCache.has(file)) {
    try {
      frozenCache.set(file, declarationsIn(gitShow(file)))
    } catch {
      frozenCache.set(file, new Map())
    }
  }
  return frozenCache.get(file)
}
function currentDecls(file) {
  if (!currentCache.has(file)) {
    try {
      currentCache.set(file, declarationsIn(fs.readFileSync(file, 'utf8')))
    } catch {
      currentCache.set(file, new Map())
    }
  }
  return currentCache.get(file)
}

const unchanged = []
const changed = []
const missing = []
const renamed = []

for (const key of added) {
  const [file, selector, prop] = key.split('::')
  const now = currentDecls(file).get(`${selector}::${prop}`)
  const before = frozenDecls(file).get(`${selector}::${prop}`)
  if (before !== undefined) {
    if (before === now) unchanged.push({ key, value: now })
    else changed.push({ key, before, now })
    continue
  }

  // A batch may narrow a shared selector list, so the same declaration can sit
  // under a shorter selector. Match it by value across the same file and
  // property before calling it introduced.
  const sameValue = [...frozenDecls(file)].filter(
    ([k, v]) => k.endsWith(`::${prop}`) && v === now,
  )
  if (sameValue.length) {
    renamed.push({ key, value: now, from: sameValue.map(([k]) => k) })
    continue
  }
  missing.push({ key, now })
}

console.log(`frozen ${FROZEN}: ${frozen.size} keys`)
console.log(`current: ${current.size} keys`)
console.log(`added: ${added.length}   removed: ${removed.length}\n`)

console.log(`unchanged pre-existing (newly covered debt): ${unchanged.length}`)
console.log(`same declaration, narrower selector: ${renamed.length}`)
console.log(`changed by the batch (needs a decision): ${changed.length}`)
console.log(`absent at the frozen commit (introduced): ${missing.length}\n`)

if (changed.length) {
  console.log('--- changed ---')
  for (const c of changed) console.log(`  ${c.key}\n    ${c.before}  ->  ${c.now}`)
}
if (missing.length) {
  console.log('--- absent before ---')
  for (const m of missing) console.log(`  ${m.key}  = ${m.now}`)
}
if (removed.length) {
  console.log('\n--- removed (debt paid) ---')
  for (const r of removed) console.log(`  ${r}`)
}

console.log('\n--- added keys ---')
for (const u of unchanged) console.log(`  ${u.key}  = ${u.value}`)

const ok = changed.length === 0 && missing.length === 0
console.log(`\nVERDICT: ${ok ? 'all added keys are unchanged pre-existing declarations' : 'REVIEW REQUIRED'}`)
process.exit(ok ? 0 : 1)
