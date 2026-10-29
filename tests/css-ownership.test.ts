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

  it('registers the token, input, button and both CSS-2 component owners', () => {
    const map = loadOwnershipMap(process.cwd())
    expect(map.owners.map((o) => o.id)).toEqual(['tokens', 'input', 'button', 'select', 'search-field'])
    expect(map.ownerFiles.has('src/styles/tokens.css')).toBe(true)
    expect(map.ownerFiles.has('src/styles/components/input.css')).toBe(true)
    expect(map.ownerFiles.has('src/styles/components/button.css')).toBe(true)
    expect(map.ownerFiles.has('src/styles/components/select.css')).toBe(true)
  })

  it('leaves no root token definitions in the legacy modules', () => {
    const map = loadOwnershipMap(process.cwd())
    expect(map.baselines.customPropertyFiles).toEqual({})
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

  function buttonRun(pageCss, keys = []) {
    const root = fixture({
      'docs/css-ownership.json': JSON.stringify({
        entry: 'src/styles.css',
        owners: [
          { id: 'button', file: BUTTON, owned: [], configClasses: ['btn', 'btn-sm'], variables: ['--btn-radius'] },
        ],
        legacy: [PAGE],
        baselines: { configAppearanceKeys: keys },
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

  it('accepts a registered historical repair and rejects one more', () => {
    const key = `${PAGE}::.hero .btn::border-radius`
    const one = buttonRun(`.hero .btn { border-radius: 0; }\n`, [key])
    expect(one).toEqual([])
    const two = buttonRun(`.hero .btn { border-radius: 0; background: red; }\n`, [key])
    expect(two).toHaveLength(1)
    expect(two[0].prop).toBe('background')
  })
})
