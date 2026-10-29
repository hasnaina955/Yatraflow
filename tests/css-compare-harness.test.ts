import { describe, it, expect } from 'vitest'
import {
  buildFixture,
  validateRows,
  validateScopes,
  normaliseValue,
  diffResults,
  SECOND_KEY_SUFFIX,
} from '../dev/_css3-compare-lib.mjs'

/**
 * These tests exist to prove the harness can fail.
 *
 * The ghost-button regression survived a green comparison because the fixture
 * dropped its page scope and two rows collapsed into one. Neither failure was
 * possible to see, because neither validator existed. Each case below calls the
 * validator directly with the bad input and expects it to throw.
 */

const SCOPES = [
  ['plain', ''],
  ['ex-page', 'ex-page'],
]
const VARIANTS = [['base', '<button class="btn" data-key="__KEY__">Go</button>']]

describe('validateRows: duplicate keys', () => {
  it('throws when two elements share one key', () => {
    const rows = [
      { key: 'a', p: '1' },
      { key: 'a', p: '2' },
    ]
    expect(() => validateRows(rows, ['a'], 'env rest')).toThrow(/duplicate result key "a"/)
  })

  it('throws when an expected element produced no row', () => {
    expect(() => validateRows([{ key: 'a' }], ['a', 'b'], 'env rest')).toThrow(/1 expected element\(s\) produced no result: b/)
  })

  it('throws when an unexpected key appears', () => {
    expect(() => validateRows([{ key: 'a' }, { key: 'z' }], ['a'], 'env rest')).toThrow(/1 unexpected key\(s\): z/)
  })

  it('accepts a complete, unique set', () => {
    const map = validateRows([{ key: 'a' }, { key: 'b' }], ['a', 'b'], 'env rest')
    expect(map.size).toBe(2)
  })
})

describe('validateScopes: a dropped page class', () => {
  it('throws when a scope matched nothing', () => {
    const hits = [
      { name: 'ex-page', selector: '.ex-page [data-key]', count: 0 },
      { name: 'plain', selector: '.plain [data-key]', count: 4 },
    ]
    expect(() => validateScopes(hits, 'env before')).toThrow(/scope "ex-page" produced no element/)
  })

  it('names the selector that failed, not just the scope', () => {
    expect(() => validateScopes([{ name: 'hero', selector: '.hero [data-key]', count: 0 }], 'env')).toThrow(
      /\.hero \[data-key\]/,
    )
  })

  it('accepts a scope that matched', () => {
    expect(validateScopes([{ name: 'hero', selector: '.hero [data-key]', count: 6 }], 'env')).toBe(1)
  })
})

describe('buildFixture: keys and class attributes', () => {
  it('gives every scope and variant a unique key', () => {
    const { expected } = buildFixture({ css: '', theme: 'light', scopes: SCOPES, variants: VARIANTS, wrap: 'ancestor' })
    expect(new Set(expected).size).toBe(expected.length)
    expect(expected).toEqual(['plain|base', 'ex-page|base'])
  })

  it('gives a two-element variant two distinct keys', () => {
    const pair = [
      [
        'pair',
        '<div class="card" data-key="__KEY__">One</div><div class="card" data-key="__KEY2__">Two</div>',
      ],
    ]
    const { expected, html } = buildFixture({ css: '', theme: 'light', scopes: [['plain', '']], variants: pair, wrap: 'ancestor' })
    expect(expected).toEqual(['plain|pair', `plain|pair${SECOND_KEY_SUFFIX}`])
    expect(html).toContain('data-key="plain|pair"')
    expect(html).toContain(`data-key="plain|pair${SECOND_KEY_SUFFIX}"`)
  })

  it('writes one class attribute, not two', () => {
    // The old fixture emitted class="row" class="ex-page", and Chrome kept the
    // first, so every scoped row measured an unscoped element.
    const { html } = buildFixture({ css: '', theme: 'light', scopes: SCOPES, variants: VARIANTS, wrap: 'ancestor' })
    const duplicates = [...html.matchAll(/<div([^>]*)>/g)].filter((m) => (m[1].match(/class=/g) ?? []).length > 1)
    expect(duplicates).toHaveLength(0)
  })
})

describe('normaliseValue: equivalent forms', () => {
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

describe('diffResults: counted from collected rows', () => {
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
