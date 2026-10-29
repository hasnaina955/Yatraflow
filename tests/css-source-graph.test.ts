// CSS-0 acceptance: the shared source graph is the one view every CSS check
// reads. These pins prove the reader keeps what a check depends on — order,
// duplicates, conditional context, source location — and that it fails loudly
// on anything it cannot represent. Each bad case is a committed fixture, so a
// probe fires on known-bad input before it is trusted on real input.
import { describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CssGraphError, loadCssGraph, parseImportParams } from '../scripts/css-source-graph.mjs'
import { check, withSources } from '../scripts/uiAntipatterns.mjs'

const FIXTURES = fileURLToPath(new URL('./fixtures/css-graph/', import.meta.url))
const fixture = (path: string) => join(FIXTURES, path)
const graphOf = (path: string) => loadCssGraph(fixture(path))

const rulesOf = (graph: ReturnType<typeof loadCssGraph>, selector: string) =>
  graph.records.filter((r) => r.kind === 'rule' && r.selectorNormalized === selector)

/** Declaration-keyed identity: what the design-system ratchet actually keys on. */
const identitiesOf = (graph: ReturnType<typeof loadCssGraph>) =>
  graph.records
    .filter((r) => r.kind === 'rule')
    .flatMap((r) => r.declarations.map((d) => `${r.selectorNormalized} :: ${d.prop}: ${d.value}`))
    .sort()

/** Whitespace- and import-insensitive cascade text, for equivalence proofs. */
const semanticText = (text: string) =>
  text
    .replace(/@import[^;]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const failureOf = (path: string): CssGraphError => {
  try {
    graphOf(path)
  } catch (error) {
    return error as CssGraphError
  }
  throw new Error(`${path} was expected to fail, and did not`)
}

describe('the application entry resolves its modules', () => {
  it('reads the entry and every owned and legacy module into one cascade', () => {
    const graph = loadCssGraph('src/styles.css')
    expect(graph.files[0].path).toBe('src/styles.css')
    expect(graph.files.length).toBeGreaterThan(10)
    for (const file of graph.files.slice(1)) {
      expect(file.path, `${file.path} is not a stylesheet module`).toMatch(/^src\/styles\/(?:legacy\/\d\d-[a-z0-9-]+|components\/[a-z0-9-]+|tokens)\.css$/)
    }
    expect(graph.files.map(file => file.path)).toContain('src/styles/components/select.css')
    expect(graph.files.map(file => file.path)).toContain('src/styles/components/search-field.css')
    expect(graph.text.split('\n').length).toBeGreaterThan(12000)
    expect(graph.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('still reproduces a single-file graph byte for byte', () => {
    const file = fixture('relocate/inline.css')
    const graph = loadCssGraph(file)
    expect(graph.files.map((f) => f.path)).toHaveLength(1)
    expect(graph.rawText).toBe(readFileSync(file, 'utf8'))
  })

  it('resolves a root-relative asset through the public directory', () => {
    const graph = loadCssGraph('src/styles.css')
    const rootRelative = graph.assets.filter((a) => a.kind === 'root')
    expect(rootRelative.length).toBeGreaterThan(0)
    for (const asset of rootRelative) {
      expect(asset.exists, `${asset.url} should resolve to a real public file`).toBe(true)
      expect(asset.resolved).toMatch(/^public\//)
    }
  })
})

describe('import order and duplicates survive flattening', () => {
  const graph = graphOf('ordered/entry.css')

  it('keeps every file of the graph', () => {
    expect(graph.files.map((f) => f.path)).toEqual([
      'tests/fixtures/css-graph/ordered/a.css',
      'tests/fixtures/css-graph/ordered/entry.css',
      'tests/fixtures/css-graph/ordered/nested/conditions.css',
    ])
  })

  it('reads the duplicate import twice, in source order', () => {
    const first = graph.text.indexOf('.a {')
    const conditions = graph.text.indexOf('.cond {')
    const second = graph.text.indexOf('.a {', first + 1)
    const entryOnly = graph.text.indexOf('.entry-only {')
    expect(first).toBeGreaterThan(-1)
    expect(conditions).toBeGreaterThan(first)
    expect(second).toBeGreaterThan(conditions)
    expect(entryOnly).toBeGreaterThan(second)
    expect(graph.text.split('.a {').length - 1, 'the duplicate import must not be deduplicated').toBe(2)
  })

  it('names the real source file and line for a rule that moved', () => {
    const moved = rulesOf(graph, '.a')
    expect(moved).toHaveLength(2)
    for (const rule of moved) {
      expect(rule.file).toBe('tests/fixtures/css-graph/ordered/a.css')
      expect(rule.line).toBe(1)
    }
    const flattenedLine = graph.text.split('\n').findIndex((l) => l.startsWith('.a {')) + 1
    expect(graph.sourceAt(flattenedLine)).toEqual({ file: 'tests/fixtures/css-graph/ordered/a.css', line: 1 })
  })
})

describe('conditional context stays visible', () => {
  const graph = graphOf('ordered/entry.css')

  it('carries media and nested supports/container context per rule', () => {
    expect(rulesOf(graph, '.cond')[0].context).toEqual(['@media (min-width: 720px)'])
    expect(rulesOf(graph, '.deep')[0].context).toEqual([
      '@supports (display: grid)',
      '@container (min-width: 30rem)',
    ])
  })

  it('records keyframes and their frames', () => {
    const keyframes = graph.records.find((r) => r.kind === 'keyframes')
    expect(keyframes?.params).toBe('fixture-pulse')
    expect(rulesOf(graph, '50%')[0].context).toEqual(['@keyframes fixture-pulse'])
  })

  it('keeps the condition an @import declared', () => {
    const conditional = graphOf('conditional/entry.css')
    expect(rulesOf(conditional, '.wide')[0].context).toEqual(['@media (min-width: 720px)'])
    expect(rulesOf(conditional, '.grid')[0].context).toEqual(['@supports (display: grid)'])
    expect(rulesOf(conditional, '.compat')[0].context).toEqual(['@layer compat'])
  })
})

describe('a violation inside an imported module still fails the ui gate', () => {
  it('fires on the known-bad import, and stays silent on a clean sheet', () => {
    const bad = graphOf('ordered/entry.css')
    const findings = check({
      'src/styles.css': bad.text,
      'index.html': '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    })
    // The imported file carries `transition: all`; the nested file carries a
    // raw z-index above the documented ladder.
    const transition = findings.find((f) => f.rule === 'U1')
    const stacking = findings.find((f) => f.rule === 'U2')
    expect(transition, 'U1 must see a violation inside an imported file').toBeTruthy()
    expect(stacking, 'U2 must see a violation inside a nested condition').toBeTruthy()

    const located = bad.sourceAt(transition!.line)
    // The finding is the declaration, which sits on line 2 of a.css.
    expect(located).toEqual({ file: 'tests/fixtures/css-graph/ordered/a.css', line: 2 })
    // The CLI path must name the module, not the flattened entry line.
    const sourced = withSources(check({ 'src/styles.css': bad.text }), bad)
    expect(sourced.find((f) => f.rule === 'U1')!.source).toBe('tests/fixtures/css-graph/ordered/a.css:2')
    expect(bad.sourceAt(stacking!.line)?.file).toBe('tests/fixtures/css-graph/ordered/nested/conditions.css')

    const clean = graphOf('relocate/inline.css')
    expect(
      check({
        'src/styles.css': clean.text,
        'index.html': '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      }),
    ).toEqual([])
  })
})

describe('the graph refuses what it cannot represent', () => {
  it('fails a missing import with the offending path', () => {
    const error = failureOf('bad/missing/entry.css')
    expect(error).toBeInstanceOf(CssGraphError)
    expect(error.code).toBe('MISSING_IMPORT')
    expect(error.message).toContain('tests/fixtures/css-graph/bad/missing/nope.css')
  })

  it('fails an import cycle with the full trace', () => {
    const error = failureOf('bad/cycle/a.css')
    expect(error.code).toBe('IMPORT_CYCLE')
    expect(error.message).toContain('cycle/a.css ->')
    expect(error.message).toContain('cycle/b.css -> tests/fixtures/css-graph/bad/cycle/a.css')
  })

  it('never fetches a remote import', () => {
    const error = failureOf('bad/remote.css')
    expect(error.code).toBe('REMOTE_IMPORT')
    expect(error.message).toContain('https://example.com/reset.css')
  })

  it('rejects an import that arrives after other rules', () => {
    const error = failureOf('bad/late.css')
    expect(error.code).toBe('UNSUPPORTED_IMPORT')
    expect(error.message).toContain('must come before other rules')
  })

  it('rejects an import form it cannot resolve, instead of dropping it', () => {
    expect(failureOf('bad/unsupported.css').code).toBe('UNSUPPORTED_IMPORT')
  })

  it('rejects @charset in an imported file', () => {
    const error = failureOf('bad/charset-entry.css')
    expect(error.code).toBe('UNSUPPORTED_FORM')
    expect(error.message).toContain('bad/charset/child.css')
  })
})

describe('relocation is not a semantic change', () => {
  it('keeps the cascade and every declaration-keyed identity', () => {
    const inline = graphOf('relocate/inline.css')
    const imported = graphOf('relocate/entry.css')
    expect(semanticText(imported.text)).toBe(semanticText(inline.text))
    expect(identitiesOf(imported)).toEqual(identitiesOf(inline))
    // The only difference is where the rule lives.
    expect(rulesOf(imported, '.shell')[0].file).toBe('tests/fixtures/css-graph/relocate/shell.css')
    expect(rulesOf(inline, '.shell')[0].file).toBe('tests/fixtures/css-graph/relocate/inline.css')
  })
})

describe('asset references resolve to the same target after a move', () => {
  it('resolves both the entry-relative and the moved-relative url', () => {
    const graph = graphOf('assets/entry.css')
    expect(graph.assets).toHaveLength(2)
    for (const asset of graph.assets) {
      expect(asset.kind).toBe('relative')
      expect(asset.resolved).toBe('tests/fixtures/css-graph/assets/img/dot.svg')
      expect(asset.exists).toBe(true)
    }
    expect(new Set(graph.assets.map((a) => a.file)).size).toBe(2)
  })
})

describe('the fingerprint covers every file in the graph', () => {
  it('changes when an imported module changes, and not otherwise', () => {
    const work = mkdtempSync(join(tmpdir(), 'yf-css-graph-'))
    cpSync(fixture('ordered'), work, { recursive: true })
    const entry = join(work, 'entry.css')

    const before = loadCssGraph(entry, { root: work })
    const again = loadCssGraph(entry, { root: work })
    expect(again.fingerprint).toBe(before.fingerprint)

    const modulePath = join(work, 'a.css')
    writeFileSync(modulePath, readFileSync(modulePath, 'utf8') + '\n.added { color: #123456; }\n')
    const after = loadCssGraph(entry, { root: work })
    expect(after.fingerprint).not.toBe(before.fingerprint)
    expect(after.files.map((f) => f.path)).toContain('a.css')
  })
})

describe('parseImportParams', () => {
  it('reads a quoted target with layer, supports and media', () => {
    expect(parseImportParams("'./x.css' layer(base) supports(display: grid) screen and (min-width: 40rem)")).toEqual({
      target: './x.css',
      layer: 'base',
      supports: 'display: grid',
      media: 'screen and (min-width: 40rem)',
    })
  })

  it('reads a url() target', () => {
    expect(parseImportParams('url(./y.css)')).toMatchObject({ target: './y.css', layer: null, supports: null, media: null })
  })
})
