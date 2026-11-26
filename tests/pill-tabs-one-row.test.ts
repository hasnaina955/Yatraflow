import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('pill tab rails', () => {
  it('does not allow the Group input rail to wrap', () => {
    expect(css('src/styles/pages/group-input.css')).not.toMatch(/\.gin-pillbar\s*\{[^}]*flex-wrap:\s*wrap\b/)
  })
  it('keeps shared rail items on one line', () => {
    const shared = css('src/styles/components/pill-nav.css')
    expect(shared).toMatch(/\.pill-nav\s*>\s*\[data-pill-key\]\s*\{[^}]*white-space:\s*nowrap/)
  })
})
