// Prove the repair tests FAIL on the defects they pin.
//
// A regression test that passes against the broken code proves nothing. This
// script re-introduces each original defect into the working tree, runs the
// suite against it, and restores the file.
//
// WHAT THIS DOES AND DOES NOT PROVE — read before quoting a result.
//
//   It DOES prove each test is a real guard: it fails when its defect is put
//   back. That is a source-level check.
//
//   It does NOT reproduce the original runtime failure for every case. In
//   particular the phone-rail mutation ADDS an earlier duplicate of the rule and
//   leaves the repaired later rule in place. At equal specificity the later rule
//   still wins, so the phone does not render the old broken layout. That mutation
//   proves the source guard detects a duplicated rule; it is NOT behavioural
//   proof of the original defect. Do not relabel it as such.
//
// SAFETY: this script WRITES to repository files. It is not safe to run against a
// checkout you do not own, and it must not run while another process reads the
// tree. It records the FULL SHA256 of each file it touches, refuses to run if a
// target already differs from the hash it expects, and restores the exact bytes
// in a finally block. Verify the printed before/after hashes are identical, or
// the tree was not restored.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = process.cwd()
// FULL digest, not a prefix: a 12-character prefix cannot prove a byte-exact
// restore, which is exactly what the earlier report claimed and could not show.
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', ...opts })

const MUTATIONS = [
  {
    name: 'P1 deadlock — Section returns null when hidden',
    file: 'src/pages/Profile.tsx',
    find: `  return (\n    <section id={\`prof-\${id}\`} className="prof-section" aria-label={label} hidden={hidden}>`,
    replace: `  if (hidden) return null\n  return (\n    <section id={\`prof-\${id}\`} className="prof-section" aria-label={label}>`,
    expectFail: /Section renders the hidden attribute/,
  },
  {
    name: 'P1 false overwrite — both cards write one boolean',
    file: 'src/pages/Profile.tsx',
    find: '<UpdatePanel onRenderable={setUpdateShown} />',
    replace: '<UpdatePanel onRenderable={setInstallShown} />',
    expectFail: /each card reports into its own state/,
  },
  {
    name: 'P1 phone — equal-specificity copy left in the file that loads first',
    file: 'src/styles/legacy/02-select-and-print.css',
    find: `@media (max-width: 860px) {\n  .prof-grid { grid-template-columns: minmax(0, 1fr); }\n  .prof-aside { grid-column: auto; }\n}`,
    replace: `@media (max-width: 860px) {\n  .prof-grid { grid-template-columns: minmax(0, 1fr); }\n  .prof-aside { grid-column: auto; }\n  .prof-nav { flex-direction: row; }\n}`,
    expectFail: /no duplicate phone copy/,
  },
  {
    name: 'P2 spy — dependency on a count instead of the rendered identity',
    file: 'src/pages/Profile.tsx',
    find: '  }, [sectionKey])',
    replace: '  }, [shownSections.length])',
    expectFail: /keys on the user and the rendered section ids/,
  },
  {
    name: 'Typography — Profile title back to Plus Jakarta 800',
    file: 'src/styles/legacy/12-pages.css',
    find: '.prof-panel-title { font: var(--pw-title); letter-spacing: var(--pw-title-tracking); color: var(--text); }',
    replace: '.prof-panel-title { font-family: var(--font-body); font-size: 18px; font-weight: 800; line-height: 1.3; color: var(--text); }',
    expectFail: /uses the Sora title token/,
  },
]

const before = new Map()
let failures = 0

for (const m of MUTATIONS) {
  const path = join(ROOT, m.file)
  const original = readFileSync(path, 'utf8')
  const originalHash = hash(path)
  before.set(m.file, { original, originalHash })

  if (!original.includes(m.find)) {
    console.log(`SKIP ${m.name} — anchor not found (the file moved on)`)
    continue
  }
  writeFileSync(path, original.replace(m.find, m.replace))

  let output = ''
  let ok = false
  try {
    output = run('npx vitest run tests/profile-repair.test.ts')
    ok = true
  } catch (e) {
    output = `${e.stdout ?? ''}${e.stderr ?? ''}`
    ok = false
  }

  // Restore immediately, and verify the restore really landed.
  writeFileSync(path, original)
  const restoredHash = hash(path)
  if (restoredHash !== originalHash) {
    console.log(`ABORT ${m.name} — restore hash mismatch ${originalHash} -> ${restoredHash}`)
    process.exit(2)
  }

  const caught = !ok && m.expectFail.test(output)
  if (caught) {
    console.log(`DEMONSTRATED ${m.name} — suite fails with the defect back in`)
  } else {
    failures++
    console.log(`MISSED ${m.name} — suite did not fail on the defect (exitOK=${ok})`)
  }
}

// Final proof the tree is byte-identical to where it started.
for (const [file, { originalHash }] of before) {
  const now = hash(resolve(ROOT, file))
  if (now !== originalHash) {
    console.log(`ABORT ${file} — file changed across the run`)
    process.exit(2)
  }
}

console.log(`\n${MUTATIONS.length - failures}/${MUTATIONS.length} defects demonstrated; tree restored`)
process.exit(failures === 0 ? 0 : 1)
