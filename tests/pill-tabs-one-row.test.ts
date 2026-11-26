import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import inventory from './pill-tab-inventory.json'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const cssFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)
  return entry.isDirectory() ? cssFiles(path) : path.endsWith('.css') ? [path] : []
})

describe('pill tab rails', () => {
  it('does not reintroduce wrapping in an inventoried rail', () => {
    const failures: string[] = []
    for (const file of cssFiles('src/styles')) {
      postcss.parse(read(file), { from: file }).walkRules(rule => {
        if (!rule.selectors.some(part => {
          const classes = part.match(/\.[\w-]+/g) ?? []
          return inventory.some(({ selector }) => classes.includes(selector))
        })) return
        rule.walkDecls(decl => {
          if ((decl.prop === 'flex-wrap' && decl.value === 'wrap') ||
              (decl.prop === 'white-space' && decl.value === 'normal')) failures.push(`${file}: ${rule.selector} ${decl.prop}: ${decl.value}`)
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
