// Full SHA256 manifest of the files this batch owns.
//
// The reviewer's specific objection: the earlier repair reported a 12-character
// restore hash, which cannot prove a byte-level restore. This records the FULL
// 64-hex digest of every source, test and dev file, plus the scoped root configs,
// so a before/after comparison is exact rather than indicative.
//
// It reads only. It writes nothing to the repository.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.argv[2] ?? process.cwd()
const OUT = process.argv[3]
if (!OUT) { console.error('usage: node manifest.mjs <root> <outfile>'); process.exit(2) }

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.vite', 'build'])

/** The scoped trees plus the root config files this batch can touch. */
const TREES = ['src', 'tests', 'dev', 'changelog.d']
const ROOT_FILES = [
  'package.json', 'vite.config.ts', 'vite.profile-fixture.config.ts',
  'tsconfig.json', 'eslint.config.js', 'eslint-baseline.json',
  'CHANGELOG.md', 'ROADMAP.md',
]

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(join(dir, entry.name), acc)
    } else if (entry.isFile()) {
      acc.push(join(dir, entry.name))
    }
  }
  return acc
}

const files = []
for (const t of TREES) {
  try { walk(join(ROOT, t), files) } catch { /* tree absent */ }
}
for (const f of ROOT_FILES) {
  try { if (statSync(join(ROOT, f)).isFile()) files.push(join(ROOT, f)) } catch { /* absent */ }
}

const rows = files
  .map(abs => {
    const rel = relative(ROOT, abs).split(sep).join('/')
    const hex = createHash('sha256').update(readFileSync(abs)).digest('hex')
    return `${hex}  ${rel}`
  })
  .sort((a, b) => a.slice(66).localeCompare(b.slice(66)))

writeFileSync(OUT, rows.join('\n') + '\n')
console.log(`${rows.length} files hashed -> ${OUT}`)
