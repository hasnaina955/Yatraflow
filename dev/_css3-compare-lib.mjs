// CSS-3 shared comparison harness.
//
// Every tool that compares two builds uses this, so the same three failures
// cannot hide in one tool after being fixed in another:
//   - a duplicate result key (two elements collapse into one row)
//   - a scope that never matched (the fixture dropped the class it meant)
//   - a focusable element that focus never reached
//
// A comparison that cannot prove it measured what it meant to measure is not a
// result, so every check here throws rather than warning.
//
// Validation is split from page access on purpose. `validateRows` and
// `validateScopes` are pure, so the failure modes have direct tests that do not
// need a browser.
import fs from 'node:fs'

export async function launchChrome() {
  const { chromium } = await import('playwright-core')
  const attempts = [
    { channel: 'chrome' },
    ...(process.env.CHROME_PATH ? [{ executablePath: process.env.CHROME_PATH }] : []),
    { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
  ]
  let last
  for (const opts of attempts) {
    try {
      return await chromium.launch({ headless: true, ...opts })
    } catch (e) {
      last = e
    }
  }
  throw new Error(`no Chrome found (${last?.message ?? 'unknown'})`)
}

/** Suffix for a second measured element inside one variant. */
export const SECOND_KEY_SUFFIX = '--2'

/**
 * Build one page from scopes and variants.
 *
 * `wrap` decides how a scope class reaches the markup. Some components take the
 * page class on an ancestor and some take it on the element itself, so the
 * caller states which, and the builder asserts the result.
 *
 * A variant may hold more than one measured element: `__KEY__` is the first and
 * `__KEY2__` the second. Both keys are unique per scope and variant, which is
 * what lets an adjacent pair be compared without the rows collapsing.
 */
export function buildFixture({ css, theme, scopes, variants, wrap, extraClass = '' }) {
  const blocks = []
  const expected = []
  for (const [scopeName, scopeClass] of scopes) {
    for (const [variantName, variantHtml] of variants) {
      const key = `${scopeName}|${variantName}`
      expected.push(key)
      if (variantHtml.includes('__KEY2__')) expected.push(key + SECOND_KEY_SUFFIX)
      const marked = variantHtml.split('__KEY2__').join(key + SECOND_KEY_SUFFIX).split('__KEY__').join(key)
      const classes = [scopeClass, extraClass].filter(Boolean).join(' ')
      blocks.push(
        wrap === 'element'
          ? `<div class="row" data-scope="${scopeName}">${marked.split('__SCOPE__').join(classes)}</div>`
          : `<div class="${classes || 'row'}" data-scope="${scopeName}">${marked.split('__SCOPE__').join(classes)}</div>`,
      )
    }
  }
  const html = `<!doctype html><html data-theme="${theme}"><head><style>${css}</style></head><body style="margin:0;padding:16px">${blocks.join('\n')}</body></html>`
  return { html, expected }
}

/**
 * Turn collected rows into a keyed map, or throw.
 *
 * A duplicate key means two elements collapsed into one row, so the comparison
 * silently covered fewer elements than it claims. A missing key means the
 * fixture never produced the element it named.
 */
export function validateRows(rows, expected, label) {
  const seen = new Map()
  for (const row of rows) {
    if (seen.has(row.key)) {
      throw new Error(`${label}: duplicate result key "${row.key}". Two elements collapsed into one row.`)
    }
    seen.set(row.key, row)
  }
  const missing = expected.filter((k) => !seen.has(k))
  if (missing.length) {
    throw new Error(
      `${label}: ${missing.length} expected element(s) produced no result: ${missing.slice(0, 5).join(', ')}`,
    )
  }
  const unexpected = [...seen.keys()].filter((k) => !expected.includes(k))
  if (unexpected.length) {
    throw new Error(`${label}: ${unexpected.length} unexpected key(s): ${unexpected.slice(0, 5).join(', ')}`)
  }
  return seen
}

/** Read computed properties for every measured element. Throws on a bad count. */
export async function readMeasured(page, props, expected, label) {
  const rows = await page.evaluate((propertyNames) => {
    const out = []
    for (const el of document.querySelectorAll('[data-key]')) {
      const cs = getComputedStyle(el)
      const row = { key: el.getAttribute('data-key') }
      for (const p of propertyNames) row[p] = cs.getPropertyValue(p)
      out.push(row)
    }
    return out
  }, props)
  return validateRows(rows, expected, label)
}

/**
 * Throw when a scope produced no element.
 *
 * `hits` is one entry per scoped selector: its name, the selector, and how many
 * elements matched. Zero means the fixture dropped the class it meant, and the
 * comparison below it would measure the wrong thing.
 */
export function validateScopes(hits, label) {
  const dead = hits.filter((h) => h.count === 0)
  if (dead.length) {
    const first = dead[0]
    throw new Error(
      `${label}: scope "${first.name}" produced no element matching ${first.selector}. The fixture dropped the class.`,
    )
  }
  return hits.length
}

/** Assert each scope's selector actually matches the element it was meant for. */
export async function assertScopes(page, scopes, selectorFor, label) {
  const hits = []
  for (const [name, scopeClass] of scopes) {
    if (!scopeClass) continue
    const selector = selectorFor(scopeClass)
    const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, selector)
    hits.push({ name, selector, count })
  }
  return validateScopes(hits, label)
}

/**
 * Assert an adjacent pair really is adjacent.
 *
 * The card family owns `.card + .card`, so a fixture that renders two cards in
 * separate wrappers never exercises that selector. This checks the second
 * element of each pair matches it, which is the only way to know the sibling
 * rule was measured at all.
 */
export async function assertAdjacentPairs(page, expected, label) {
  const pairKeys = expected.filter((k) => k.endsWith(SECOND_KEY_SUFFIX))
  if (!pairKeys.length) return 0
  const missed = await page.evaluate(({ keys, suffix }) => {
    const out = []
    for (const key of keys) {
      const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`)
      if (!el) {
        out.push(key)
        continue
      }
      if (!el.matches('.card + .card')) out.push(key)
    }
    return out
  }, { keys: pairKeys, suffix: SECOND_KEY_SUFFIX })
  if (missed.length) {
    throw new Error(
      `${label}: ${missed.length} paired element(s) do not match the sibling selector: ${missed.slice(0, 3).join(', ')}`,
    )
  }
  return pairKeys.length
}

/**
 * Assert focus lands on every element that must take focus.
 *
 * An element the layout hides is not a failure: `.bench-dock` is `display: none`
 * above 720px by design, so its buttons are genuinely not rendered at desktop
 * width. Those are reported as `hidden` and excluded from the count, so the
 * exclusion is visible rather than silent.
 */
export async function assertFocusReachable(page, expected, skipKey, label) {
  const result = await page.evaluate(({ keys, skip }) => {
    const reached = []
    const hidden = []
    const refused = []
    for (const key of keys) {
      if (skip.some((s) => key.endsWith(`|${s}`))) continue
      const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`)
      if (!el) continue
      if (el.disabled || el.readOnly) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') {
        hidden.push(key)
        continue
      }
      el.focus()
      if (document.activeElement === el) reached.push(key)
      else refused.push(key)
      el.blur()
    }
    return { reached, hidden, refused }
  }, { keys: expected, skip: skipKey })

  if (result.refused.length) {
    throw new Error(
      `${label}: ${result.refused.length} rendered element(s) refused focus: ${result.refused.slice(0, 5).join(', ')}`,
    )
  }
  return { focused: result.reached.length, hidden: result.hidden }
}

/**
 * Normalise a computed value so equivalent forms compare equal.
 *
 * Two sources of noise are removed, both of which masked real changes before:
 *   - an animated box-shadow samples at a sub-pixel offset per frame
 *   - `none` and a zero shadow are the same painted result, and reduced motion
 *     renders one as the other
 * A real difference still survives, because it changes the colour or the offset
 * beyond a sub-pixel.
 */
export function normaliseValue(prop, value) {
  const v = String(value ?? '').trim()
  if (prop === 'box-shadow' || prop === 'text-shadow') {
    if (v === 'none') return 'none'
    const rounded = v.replace(/(-?\d+(?:\.\d+)?)px/g, (_, n) => {
      const r = Math.round(parseFloat(n) * 10) / 10
      return `${r}px`
    })
    const zero = /^rgba?\([^)]*\) 0px 0px 0px 0px$/.test(rounded)
    return zero ? 'none' : rounded
  }
  return v
}

/** Diff two keyed result maps. Returns { total, diffs, compared }. */
export function diffResults(before, after, props, label) {
  const diffs = []
  let compared = 0
  for (const key of before.keys()) {
    if (!after.has(key)) {
      diffs.push(`${label} ${key} :: missing after`)
      continue
    }
    const a = before.get(key)
    const b = after.get(key)
    for (const p of props) {
      compared++
      const av = normaliseValue(p, a[p])
      const bv = normaliseValue(p, b[p])
      if (av !== bv) diffs.push(`${label} ${key} :: ${p}: ${av} -> ${bv}`)
    }
  }
  return { total: diffs.length, diffs, compared }
}

export function writeReport(dir, name, payload) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(`${dir}/${name}`, JSON.stringify(payload, null, 1))
}
