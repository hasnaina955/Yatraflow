import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/styles/components/button.css', 'utf8')
const root = postcss.parse(css)
const rules = (selector: string) => {
  const found: { media: string | undefined; declarations: Record<string, string> }[] = []
  root.walkRules(rule => {
    if (rule.selector !== selector) return
    const declarations: Record<string, string> = {}
    rule.walkDecls(decl => { declarations[decl.prop] = decl.value })
    found.push({ media: rule.parent?.type === 'atrule' ? rule.parent.params : undefined, declarations })
  })
  return found
}

describe('shared button recipes', () => {
  it('keeps secondary and quiet controls used by Explore and Trips', () => {
    expect(rules('.btn-outline, .btn-secondary')[0].declarations).toMatchObject({
      background: 'var(--card)', 'border-color': 'var(--line)', 'box-shadow': 'var(--elev-press)',
    })
    expect(rules('.btn-ghost, .btn-quiet')[0].declarations.color).toBe('var(--teal-deep)')
    expect(rules(".btn-quiet[aria-pressed='true'], .btn-quiet[aria-pressed='true']:hover:not(:disabled)")[0].declarations)
      .toMatchObject({ background: 'var(--teal-soft)', 'box-shadow': 'inset 0 0 0 1px var(--teal-deep)' })
    expect(rules(".btn-quiet[aria-pressed='true']:focus-visible,\n.btn-quiet[aria-pressed='true']:hover:not(:disabled):focus-visible")[0].declarations['box-shadow'])
      .toContain('var(--ring)')
  })

  it('keeps size, focus and disabled behavior', () => {
    expect(rules('.btn-sm')[0].declarations['min-height']).toBe('36px')
    expect(rules('.btn-lg')[0].declarations).toMatchObject({ 'min-height': '52px', 'white-space': 'normal' })
    expect(rules('.btn:focus-visible')[0].declarations['box-shadow']).toBe('var(--ring)')
    expect(rules('.btn:disabled')[0].declarations.cursor).toBe('not-allowed')
    expect(rules('.btn').some(rule => rule.media?.includes('pointer: coarse') && rule.declarations['min-height'] === '44px')).toBe(true)
  })

  it('mirrors each shared transform in reduced motion', () => {
    for (const selector of ['.btn:hover:not(:disabled)', '.btn:active:not(:disabled)']) {
      expect(rules(selector).some(rule => rule.media === '(prefers-reduced-motion: reduce)' && rule.declarations.transform === 'none')).toBe(true)
    }
  })
})
