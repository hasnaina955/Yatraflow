import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCssGraph, CssGraphError } from '../scripts/css-source-graph.mjs'
import { checkOwnership, loadOwnershipMap, formatFindings, ALLOWED_ON_CONFIG, classTokens, applyAppearanceBaseline } from '../scripts/css-ownership.mjs'

/**
 * These tests exist to prove the ownership check can fail.
 * A check that only ever passes on the real tree proves nothing.
 * Every fixture below is built in a throwaway root, so no test can write
 * into the repository's own stylesheet.
 */

const OWNER = 'src/styles/components/select.css'
const LEGACY = 'src/styles/legacy/10-explore.css'

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yf-css-owner-'))
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, text)
  }
  return root
}

/** A map shaped like the real one, with a select owner and one legacy file. */
function mapFor({ legacy = [LEGACY], baselines = {} } = {}) {
  const root = fixture({
    'docs/css-ownership.json': JSON.stringify({
      entry: 'src/styles.css',
      owners: [
        {
          id: 'select',
          file: OWNER,
          owned: ['select', 'cselect', 'cselect-trigger', 'cselect-pop'],
          configClasses: ['ex-select'],
          variables: ['--select-leading-space'],
        },
      ],
      legacy,
      baselines,
    }),
  })
  return { root, map: loadOwnershipMap(root) }
}

const ENTRY = `@import './styles/components/select.css';\n@import './styles/legacy/10-explore.css';\n`
const OWNER_CSS = `.select { border: 1px solid var(--line); }\n`
const PAGE_CSS = `.ex-page { display: flex; }\n`

function run(files, options) {
  const { root, map } = mapFor(options)
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, text)
  }
  const graph = loadCssGraph('src/styles.css', { root })
  return { findings: checkOwnership(graph, map, root), graph, root }
}

describe('css ownership: the happy path', () => {
  it('accepts a page that only sets placement and a supported variable', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: OWNER_CSS,
      [LEGACY]: `.ex-select { flex: 1 1 0; min-width: 150px; --select-leading-space: 2.25rem; }\n`,
    })
    expect(findings).toEqual([])
  })

  it('accepts a responsive variation inside the owning module', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: `${OWNER_CSS}@media (max-width: 720px) { .select { padding: 10px; } }\n`,
      [LEGACY]: PAGE_CSS,
    })
    expect(findings).toEqual([])
  })

  it('accepts a theme variation inside the owning module', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: `${OWNER_CSS}[data-theme='dark'] .select { border-color: #333; }\n`,
      [LEGACY]: PAGE_CSS,
    })
    expect(findings).toEqual([])
  })
})

describe('css ownership: a cross-owner patch fails with its real location', () => {
  it('rejects an imported page file that redeclares a shared control', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: OWNER_CSS,
      [LEGACY]: `${PAGE_CSS}.select { border-radius: 0; }\n`,
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('owner-scope')
    expect(findings[0].file).toBe(LEGACY)
    expect(findings[0].line).toBe(2)
    expect(formatFindings(findings)).toContain(`${LEGACY}:2`)
  })

  it('rejects a page that reaches into a control internal', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: OWNER_CSS,
      [LEGACY]: `${PAGE_CSS}.ex-page .cselect-pop { padding: 0; }\n`,
    })
    expect(findings.map((f) => f.code)).toContain('owner-scope')
    expect(findings[0].file).toBe(LEGACY)
  })

  it('rejects component appearance on a configuration class', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: OWNER_CSS,
      [LEGACY]: `.ex-select { border: 2px solid red; }\n`,
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('config-appearance')
    expect(findings[0].message).toContain('border')
  })

  it('allows placement but still rejects padding on the same configuration class', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: OWNER_CSS,
      [LEGACY]: `.ex-select { flex: 1; padding: 0; }\n`,
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('config-appearance')
    expect(findings[0].message).toContain('padding')
  })
})

describe('css ownership: the graph refusals still hold', () => {
  it.each([
    '.ex-select { &:hover { background: red; } }',
    '.ex-select { @media (max-width: 720px) { background: red; } }',
    '.select { @supports (display: grid) { color: red; } }',
    '@media (min-width: 1px) { .ex-select { @supports (display: grid) { background: red; } } }',
  ])('rejects unsupported nesting through the graph and checker: %s', (css) => {
    expect(() => run({
      'src/styles.css': ENTRY,
      [OWNER]: OWNER_CSS,
      [LEGACY]: css,
    })).toThrow(/nested/i)
  })

  it('reports the imported file and line for unsupported nesting', () => {
    expect(() => run({
      'src/styles.css': ENTRY,
      [OWNER]: OWNER_CSS,
      [LEGACY]: '.ex-select {\n  &:hover { background: red; }\n}',
    })).toThrow(`Nested CSS is not supported: ${LEGACY}:2`)
  })

  it('still rejects the flat form as component appearance', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: OWNER_CSS,
      [LEGACY]: '.ex-select:hover { background: red; }',
    })
    expect(findings.map(f => f.code)).toContain('config-appearance')
  })

  it('accepts top-level media, supports, container and keyframes', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: `${OWNER_CSS}@media (min-width: 1px) { @supports (display: grid) { @container (min-width: 1px) { .select { padding: 1px; } } } } @keyframes fade { from { opacity: 0; } to { opacity: 1; } }`,
      [LEGACY]: PAGE_CSS,
    })
    expect(findings).toEqual([])
  })

  it('fails on a missing import', () => {
    const root = fixture({ 'src/styles.css': `@import './styles/components/select.css';\n` })
    expect(() => loadCssGraph('src/styles.css', { root })).toThrow(CssGraphError)
  })

  it('fails on a cycle', () => {
    const root = fixture({
      'src/styles.css': `@import './a.css';\n`,
      'a.css': `@import './b.css';\n.a { color: red; }\n`,
      'b.css': `@import './a.css';\n.b { color: red; }\n`,
    })
    expect(() => loadCssGraph('src/styles.css', { root })).toThrow(CssGraphError)
  })

  it('fails on a remote import', () => {
    const root = fixture({ 'src/styles.css': `@import url('https://example.com/x.css');\n` })
    expect(() => loadCssGraph('src/styles.css', { root })).toThrow(CssGraphError)
  })
})

describe('css ownership: budgets and context', () => {
  it('rejects an unregistered stylesheet', () => {
    const { findings } = run({
      'src/styles.css': `${ENTRY}@import './styles/pages/new-page.css';\n`,
      [OWNER]: OWNER_CSS,
      [LEGACY]: PAGE_CSS,
      'src/styles/pages/new-page.css': `.new-page { display: block; }\n`,
    })
    expect(findings.map((f) => f.code)).toContain('unregistered-file')
  })

  it('rejects a new file that starts defining tokens', () => {
    const { findings } = run(
      {
        'src/styles.css': `${ENTRY}@import './styles/pages/new-page.css';\n`,
        [OWNER]: OWNER_CSS,
        [LEGACY]: PAGE_CSS,
        'src/styles/pages/new-page.css': `:root { --local-gap: 8px; }\n`,
      },
      { legacy: [LEGACY, 'src/styles/pages/new-page.css'] },
    )
    expect(findings.map((f) => f.code)).toContain('token-context')
  })

  it('accepts a page that assigns a supported component variable', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: OWNER_CSS,
      [LEGACY]: `.ex-select { --select-leading-space: 2.25rem; }\n`,
    })
    expect(findings).toEqual([])
  })

  it('rejects an !important increase', () => {
    const { findings } = run(
      {
        'src/styles.css': ENTRY,
        [OWNER]: OWNER_CSS,
        [LEGACY]: `.ex-page { display: flex !important; }\n`,
      },
      { baselines: { importantByFile: { [LEGACY]: 0 } } },
    )
    expect(findings.map((f) => f.code)).toContain('important-growth')
  })

  it('rejects a dropped reduced-motion block', () => {
    const { findings } = run(
      {
        'src/styles.css': ENTRY,
        [OWNER]: OWNER_CSS,
        [LEGACY]: PAGE_CSS,
      },
      { baselines: { reducedMotionRules: 4 } },
    )
    expect(findings.map((f) => f.code)).toContain('reduced-motion')
  })

  it('rejects a relative asset that no longer resolves', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: `.select { background-image: url('./missing.svg'); }\n`,
      [LEGACY]: PAGE_CSS,
    })
    expect(findings.map((f) => f.code)).toContain('asset-target')
  })

  it('accepts a relative asset that resolves beside the module', () => {
    const { findings } = run({
      'src/styles.css': ENTRY,
      [OWNER]: `.select { background-image: url('./chevron.svg'); }\n`,
      [LEGACY]: PAGE_CSS,
      'src/styles/components/chevron.svg': '<svg/>',
    })
    expect(findings).toEqual([])
  })
})

describe('css ownership: the real repository is clean', () => {
  it('passes on the committed stylesheet', () => {
    const root = process.cwd()
    const graph = loadCssGraph('src/styles.css', { root })
    const map = loadOwnershipMap(root)
    const findings = applyAppearanceBaseline(checkOwnership(graph, map, root), map.baselines)
    expect(formatFindings(findings)).toBe('')
  })

  it('registers every owner module the sheet has', () => {
    const map = loadOwnershipMap(process.cwd())
    // Every owner file must be a real stylesheet in the graph, and every graph
    // file is either an owner or a legacy module. An exact pinned list needed an
    // edit on every batch; this invariant catches the same mistakes.
    const graph = loadCssGraph('src/styles.css', { root: process.cwd() })
    const paths = new Set(graph.files.map((f) => f.path))
    for (const owner of map.owners) {
      const files = [owner.file, ...(owner.files ?? [])]
      for (const file of files) {
        expect(paths.has(file), `${owner.id} names ${file}, which is not in the graph`).toBe(true)
      }
    }
    for (const file of paths) {
      if (file === graph.entry) continue
      expect(
        map.ownerFiles.has(file) || map.legacyFiles.has(file),
        `${file} is neither an owner nor a legacy module`,
      ).toBe(true)
    }
    expect(map.owners.length).toBeGreaterThanOrEqual(10)
    expect(map.owners.map((o) => o.id)).toContain('dialog')
  })

  it('leaves no root token definitions in the legacy modules', () => {
    const map = loadOwnershipMap(process.cwd())
    expect(map.baselines.customPropertyFiles).toEqual({})
  })

  /**
   * The Board's shared rules stay in lead files, and nine of its classes carry a
   * rule there beside another family. Those classes are registered as
   * configuration points anyway, so a NEW appearance patch on one of them fails.
   *
   * Without this, the nine were outside enforcement and an override could grow
   * silently. The historical declarations are exempt by exact key, not by class.
   */
  it('refuses a new appearance patch on every shared Board class', () => {
    const map = loadOwnershipMap(process.cwd())
    const shared = [
      'board', 'board-col', 'board-col-zone', 'board-fit', 'board-info',
      'board-pulse', 'board-pulse-link', 'board-row', 'board-stop-kicker',
    ]
    const root = fixture({
      'src/styles.css': `@import './styles/components/select.css';\n@import './styles/legacy/10-explore.css';\n`,
      [OWNER]: OWNER_CSS,
      // One appearance declaration per class, in a legacy file.
      [LEGACY]: shared.map((c) => `.${c} { color: rgb(1, 2, 3); }`).join('\n') + '\n',
    })
    const graph = loadCssGraph('src/styles.css', { root })
    const kept = applyAppearanceBaseline(checkOwnership(graph, map, root), map.baselines)
    const appearance = kept.filter((f) => f.code === 'config-appearance')
    const named = new Set(appearance.map((f) => classTokens(f.selector).find((t) => shared.includes(t))))
    expect([...named].sort()).toEqual([...shared].sort())
    for (const f of appearance) expect(f.prop).toBe('color')

    // The same file may still place them: enforcement must not overreach.
    const layoutRoot = fixture({
      'src/styles.css': `@import './styles/components/select.css';\n@import './styles/legacy/10-explore.css';\n`,
      [OWNER]: OWNER_CSS,
      [LEGACY]: shared.map((c) => `.${c} { margin-top: 4px; }`).join('\n') + '\n',
    })
    const layoutGraph = loadCssGraph('src/styles.css', { root: layoutRoot })
    const layoutFindings = applyAppearanceBaseline(
      checkOwnership(layoutGraph, map, layoutRoot), map.baselines,
    ).filter((f) => f.code === 'config-appearance' || f.code === 'config-variable')
    expect(layoutFindings).toEqual([])
  })
})

describe('css ownership: helpers', () => {
  it('extracts class tokens without prefix collisions', () => {
    expect(classTokens('.ex-select, .ex-selects')).toEqual(['ex-select', 'ex-selects'])
    expect(classTokens('.ex-select--sort')).toEqual(['ex-select--sort'])
  })

  it('treats padding as component interior, not page placement', () => {
    expect(ALLOWED_ON_CONFIG.has('padding')).toBe(false)
    expect(ALLOWED_ON_CONFIG.has('margin')).toBe(true)
    expect(ALLOWED_ON_CONFIG.has('flex')).toBe(true)
  })
})

describe('css ownership: a page cannot restyle the button', () => {
  const BUTTON = 'src/styles/components/button.css'
  const PAGE = 'src/styles/legacy/12-pages.css'
  const ENTRY_BTN = `@import './styles/components/button.css';\n@import './styles/legacy/12-pages.css';\n`
  const RECIPE = `.btn { display: inline-flex; padding: 9px 17px; border-radius: 999px; }\n`

  function buttonRun(pageCss, keys = [], variableDebt = []) {
    const root = fixture({
      'docs/css-ownership.json': JSON.stringify({
        entry: 'src/styles.css',
        owners: [
          { id: 'button', file: BUTTON, owned: [], configClasses: ['btn', 'btn-sm'], variables: ['--btn-radius'] },
        ],
        legacy: [PAGE],
        baselines: { configAppearanceKeys: keys, configVariableDebt: variableDebt },
      }),
      'src/styles.css': ENTRY_BTN,
      [BUTTON]: RECIPE,
      [PAGE]: pageCss,
    })
    const graph = loadCssGraph('src/styles.css', { root })
    const map = loadOwnershipMap(root)
    return applyAppearanceBaseline(checkOwnership(graph, map, root), map.baselines)
  }

  it('rejects a page-level appearance repair', () => {
    const findings = buttonRun(`.hero .btn { border-radius: 0; background: red; }\n`)
    expect(findings.map((f) => f.code)).toEqual(['config-appearance', 'config-appearance'])
    expect(findings[0].file).toBe(PAGE)
    expect(findings.map((f) => f.prop).sort()).toEqual(['background', 'border-radius'])
  })

  it('accepts placement and a documented variable', () => {
    const findings = buttonRun(`.hero .btn { flex: 1 1 auto; margin-top: 8px; --btn-radius: 12px; }\n`)
    expect(findings).toEqual([])
  })

  it('rejects an arbitrary custom property that the owner does not document', () => {
    // A custom property must not be a free pass around the ownership rule.
    const findings = buttonRun(`.hero .btn { --btn-anything: 1px; }\n`)
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('config-variable')
    expect(findings[0].prop).toBe('--btn-anything')
    expect(findings[0].message).toContain('does not document')
  })

  it('rejects a variable exception that matches nothing', () => {
    const stale = {
      file: PAGE,
      selector: '.hero .btn',
      variable: '--btn-retired',
      reason: 'was needed once',
    }
    const findings = buttonRun(`.hero .btn { flex: 1; }\n`, [], [stale])
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('config-variable-stale')
  })

  it('rejects a variable exception that does not name its target', () => {
    const findings = buttonRun(`.hero .btn { flex: 1; }\n`, [], [{ file: PAGE }])
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('config-variable-malformed')
  })

  it('still fails an unlisted variable when another one is excepted', () => {
    const excepted = {
      file: PAGE,
      selector: '.hero .btn',
      variable: '--btn-anything',
      reason: 'documented exception for this fixture',
    }
    const findings = buttonRun(`.hero .btn { --btn-anything: 1px; --btn-other: 2px; }\n`, [], [excepted])
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('config-variable')
    expect(findings[0].prop).toBe('--btn-other')
  })

  it('accepts a registered historical repair and rejects one more', () => {
    const key = `${PAGE}::.hero .btn::border-radius`
    const one = buttonRun(`.hero .btn { border-radius: 0; }\n`, [key])
    expect(one).toEqual([])
    const two = buttonRun(`.hero .btn { border-radius: 0; background: red; }\n`, [key])
    expect(two).toHaveLength(1)
    expect(two[0].prop).toBe('background')
  })

  it('rejects a registered key that matches nothing', () => {
    // A key for a declaration that no longer exists must be deleted, or the
    // recorded debt figure drifts away from the real one. This is how an owner
    // module's own declarations were inflating the count.
    const stale = `${PAGE}::.hero .btn::border-radius`
    const findings = buttonRun(`.hero .btn { flex: 1; }\n`, [stale])
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('config-baseline-stale')
    expect(findings[0].key).toBe(stale)
  })
})

describe('css ownership: the bypasses that hid a regression', () => {
  const BUTTON = 'src/styles/components/button.css'
  const PAGE = 'src/styles/legacy/12-pages.css'
  const TOKENS = 'src/styles/tokens.css'
  const ENTRY = [
    "@import './styles/tokens.css';",
    "@import './styles/components/button.css';",
    "@import './styles/legacy/12-pages.css';",
    '',
  ].join('\n')

  function run(files) {
    const root = fixture({
      'docs/css-ownership.json': JSON.stringify({
        entry: 'src/styles.css',
        owners: [
          { id: 'tokens', file: TOKENS, owned: [], configClasses: [], variables: [] },
          {
            id: 'button',
            file: BUTTON,
            owned: [],
            configClasses: ['btn', 'btn-ghost', 'btn-outline', 'btn-lg'],
            variables: ['--btn-radius'],
          },
        ],
        legacy: [PAGE],
        baselines: {},
      }),
      ...files,
    })
    const graph = loadCssGraph('src/styles.css', { root })
    const map = loadOwnershipMap(root)
    return applyAppearanceBaseline(checkOwnership(graph, map, root), map.baselines)
  }

  it('rejects a repair on a variant that used to be unregistered', () => {
    // Before the fix, only btn, btn-sm, btn-primary and btn-saffron were
    // registered, so a page could restyle the other variants and pass.
    for (const variant of ['btn-ghost', 'btn-outline', 'btn-lg']) {
      const findings = run({
        'src/styles.css': ENTRY,
        [TOKENS]: ':root { --line: #ccc; }\n',
        [BUTTON]: '.btn { padding: 9px 17px; }\n',
        [PAGE]: `.hero .${variant} { padding: 20px; }\n`,
      })
      expect(findings.map((f) => f.code), variant).toContain('config-appearance')
      expect(findings[0].file, variant).toBe(PAGE)
    }
  })

  it('rejects a root token defined inside a component owner', () => {
    // The token rule used to skip every owner module, so a component could
    // define :root tokens and pass.
    const findings = run({
      'src/styles.css': ENTRY,
      [TOKENS]: ':root { --line: #ccc; }\n',
      [BUTTON]: '.btn { padding: 9px 17px; }\n:root { --rogue: red; }\n',
      [PAGE]: '.hero { display: flex; }\n',
    })
    const token = findings.filter((f) => f.code === 'token-context')
    expect(token).toHaveLength(1)
    expect(token[0].file).toBe(BUTTON)
  })
})
