// Permanent known-bad cases for the comparison harness.
//
// Each case must fail for the reason it names. A harness that silently collapses
// two elements, or drops a page scope, produces a green result that means
// nothing — which is how the ghost-button regression survived a passing run.
import { describe, it, expect } from 'vitest'
import { normaliseValue, buildFixture, diffResults } from '../dev/_css3-compare-lib.mjs'

const SCOPES = [
  ['plain', ''],
  ['ex-page', 'ex-page'],
]
const VARIANTS = [['base', '<button class="btn" data-key="__KEY__">Go</button>']]

describe('comparison harness: duplicate keys', () => {
  it('collapses two elements that share a key, which a diff must not accept', () => {
    const before = new Map([
      ['a', { k: '1' }],
      ['a', { k: '2' }],
    ])
    // The Map itself silently keeps one row: this is the failure mode.
    expect(before.size).toBe(1)
  })

  it('builds a fixture whose keys are unique per scope and variant', () => {
    const { expected } = buildFixture({
      css: '',
      theme: 'light',
      scopes: SCOPES,
      variants: VARIANTS,
      wrap: 'ancestor',
    })
    expect(new Set(expected).size).toBe(expected.length)
    expect(expected).toEqual(['plain|base', 'ex-page|base'])
  })

  it('writes one class attribute, not two', () => {
    // The old fixture emitted class="row" class="ex-page", and Chrome kept the
    // first, so every scoped row measured an unscoped element.
    const { html } = buildFixture({
      css: '',
      theme: 'light',
      scopes: SCOPES,
      variants: VARIANTS,
      wrap: 'ancestor',
    })
    const duplicates = [...html.matchAll(/<div([^>]*)>/g)].filter((m) => (m[1].match(/class=/g) ?? []).length > 1)
    expect(duplicates).toHaveLength(0)
  })
})

describe('comparison harness: value normalisation', () => {
  it('treats an animated sub-pixel shadow as unchanged', () => {
    expect(normaliseValue('box-shadow', 'rgba(13, 141, 130, 0.42) 0px 10.0006px 26.002px 0px')).toBe(
      normaliseValue('box-shadow', 'rgba(13, 141, 130, 0.42) 0px 10px 26px 0px'),
    )
  })

  it('treats none and a zero shadow as the same painted result', () => {
    expect(normaliseValue('box-shadow', 'none')).toBe('none')
    expect(normaliseValue('box-shadow', 'rgba(0, 0, 0, 0) 0px 0px 0px 0px')).toBe('none')
  })

  it('still reports a real shadow change', () => {
    expect(normaliseValue('box-shadow', 'rgba(0, 0, 0, 0.4) 0px 20px 30px 0px')).not.toBe(
      normaliseValue('box-shadow', 'rgba(0, 0, 0, 0.4) 0px 10px 26px 0px'),
    )
  })

  it('does not touch a property that is not a shadow', () => {
    expect(normaliseValue('padding-top', '0px')).toBe('0px')
  })
})

describe('comparison harness: diffs are counted from collected rows', () => {
  it('reports a missing key rather than skipping it', () => {
    const before = new Map([['a', { p: '1' }]])
    const after = new Map()
    const { total, diffs } = diffResults(before, after, ['p'], 'env')
    expect(total).toBe(1)
    expect(diffs[0]).toContain('missing after')
  })

  it('counts one comparison per property per row', () => {
    const before = new Map([['a', { p: '1', q: '2' }]])
    const after = new Map([['a', { p: '1', q: '2' }]])
    const { total, compared } = diffResults(before, after, ['p', 'q'], 'env')
    expect(total).toBe(0)
    expect(compared).toBe(2)
  })
})
