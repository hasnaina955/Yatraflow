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
})
