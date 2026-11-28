import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import inventory from './pill-tab-inventory.json'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const filesWithExtension = (dir: string, extension: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)
  return entry.isDirectory() ? filesWithExtension(path, extension) : path.endsWith(extension) ? [path] : []
})

describe('pill tab rails', () => {
  it('does not reintroduce wrapping in a shared or inventoried rail', () => {
    const railClasses = new Set(inventory.map(({ selector }) => selector))
    const unmanagedTablists: string[] = []
    for (const file of filesWithExtension('src', '.tsx')) {
      const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true)
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source)
          const shared = tag === 'PillNav' || tag === 'SegmentedTabs'
          for (const prop of node.attributes.properties) {
            if (!ts.isJsxAttribute(prop) || !prop.initializer || !ts.isStringLiteral(prop.initializer)) continue
            const name = prop.name.getText(source)
            if (shared && name === 'className') {
              for (const className of prop.initializer.text.split(/\s+/).filter(Boolean)) railClasses.add(`.${className}`)
            }
            if (!shared && name === 'role' && prop.initializer.text === 'tablist') unmanagedTablists.push(file)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(unmanagedTablists, 'Route tablists through a shared pill rail').toEqual([])

    const failures: string[] = []
    for (const file of filesWithExtension('src/styles', '.css')) {
      postcss.parse(read(file), { from: file }).walkRules(rule => {
        if (!rule.selectors.some(part => {
          const classes = part.match(/\.[\w-]+/g) ?? []
          return classes.some(name => railClasses.has(name)) || /\[data-pill-key(?:\]|[~|^$*]?=)/.test(part)
        })) return
        rule.walkDecls(decl => {
          const value = decl.value.toLowerCase()
          const wrapsRail = ['flex-wrap', 'flex-flow'].includes(decl.prop) && /(?:^|\s)wrap(?:-reverse)?(?:\s|$)/.test(value)
          const wrapsText = ['white-space', 'text-wrap', 'text-wrap-mode'].includes(decl.prop) &&
            /(?:^|\s)(?:normal|wrap|pre-wrap|pre-line|break-spaces|balance|pretty|stable)(?:\s|$)/.test(value)
          if (wrapsRail || wrapsText) failures.push(`${file}: ${rule.selector} ${decl.prop}: ${decl.value}`)
        })
      })
    }
    expect(failures).toEqual([])
  })
  it('keeps shared rail items on one line', () => {
    const shared = read('src/styles/components/pill-nav.css')
    expect(shared).toMatch(/\.pill-nav\s*\{[^}]*flex-wrap:\s*nowrap/)
    expect(shared).toMatch(/\.pill-nav\s*\{[^}]*scroll-snap-type:\s*x proximity/)
    expect(shared).toMatch(/\.pill-nav\s*>\s*\[data-pill-key\]\s*\{[^}]*flex:\s*none[^}]*white-space:\s*nowrap[^}]*scroll-snap-align:/)
  })
  it('keeps the standalone Map lens rail on one line', () => {
    const map = read('src/styles/components/map-v2-rail.css')
    expect(map).toMatch(/\.mv2-workspace \.mv2-lenses\s*\{[^}]*flex-wrap:\s*nowrap/)
    expect(map).toMatch(/\.mv2-lenses\s*>\s*button\s*\{[^}]*white-space:\s*nowrap/)
  })
  it('docks the trip tab rail under the app bar on a phone (#1051)', () => {
    const workspace = read('src/pages/TripWorkspace.tsx')
    // Row 27a: the dock reads the shared phone rule, not its own copy.
    expect(workspace).toContain('const phoneWidth = usePhoneWidth()')
    expect(workspace).not.toContain('PHONE_DOCK_QUERY')
    expect(read('src/lib/phoneChrome.ts')).toContain("export const PHONE_QUERY = '(max-width: 720px)'")
    expect(read('src/components/ui.tsx')).toContain('return useMedia(PHONE_QUERY,')
    expect(workspace).toContain('const tabsDocked = phoneWidth && !headerFolded')
    expect(workspace).toContain('{!tabsDocked && tabRail}')
    expect(workspace).toContain('{tabsDocked && <div className="yf-page yf-tabdock">{tabRail}</div>}')

    const root = postcss.parse(read('src/styles/legacy/17-overview-tiles-and-cover.css'))
    const dockRules: Record<string, Record<string, string>> = {}
    root.walkRules(rule => {
      if (!rule.selector.includes('yf-tabdock') && !rule.selector.includes("data-tabs='docked'")) return
      const parent = rule.parent
      expect(parent?.type === 'atrule' && (parent as postcss.AtRule).params).toBe('(max-width: 720px)')
      const decls: Record<string, string> = {}
      rule.walkDecls(decl => { decls[decl.prop] = decl.value })
      dockRules[rule.selector] = decls
    })
    const dock = dockRules['.yf-page.yf-tabdock']
    expect(dock?.position).toBe('sticky')
    expect(dock?.top).toBe('calc(var(--nav-top) + var(--nav-h) + 2px)')
    expect(dock?.background).toBe('var(--bg)')
    expect(dockRules['.yf-page.yf-tabdock > .yf-tabbar']?.['max-width']).toBe('100%')
    expect(dockRules[".yf-page[data-tabs='docked'] .yf-trip-head > .yf-cover-content"]?.['padding-bottom']).toBe('var(--space-7)')

    // The sticky bars inside a tab, and the jump targets, clear the dock.
    const root2 = dockRules["html:has(.yf-page[data-tabs='docked'])"]
    expect(root2?.['--yf-dock-bottom']).toBe('calc(var(--nav-top) + var(--nav-h) + 2px + var(--space-3) + 52px + var(--space-4))')
    expect(root2?.['scroll-padding-top']).toContain('var(--yf-dock-bottom)')
    const below = dockRules[".yf-page[data-tabs='docked'] ~ .tab-panel .tset-nav,\n  .yf-page[data-tabs='docked'] ~ .tab-panel .tl-root-review .tl-ribbon"]
    expect(below?.top).toBe('calc(var(--yf-dock-bottom) + var(--space-4))')
    expect(dockRules[".yf-page[data-tabs='docked'] ~ .tab-panel .tset-main > .tsx-card"]?.['scroll-margin-top']).toContain('var(--yf-dock-bottom)')
    // The Timeline stack measure must still count a bar that sticks below the dock.
    expect(read('src/pages/trip/TimelineTab.tsx')).toContain('top > 200) continue')
  })
})
