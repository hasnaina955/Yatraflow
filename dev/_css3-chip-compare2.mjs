// CSS-3 chip comparison, on the shared harness.
//
// The first version reused data-key="K" for every variant, so rows collapsed
// and the reported count did not match what was measured. It now assigns unique
// keys, asserts each scope matched, and checks focus reaches every focusable
// chip.
import fs from 'node:fs'
import {
  launchChrome,
  buildFixture,
  readMeasured,
  assertScopes,
  assertFocusReachable,
  diffResults,
  writeReport,
} from './_css3-compare-lib.mjs'

const [beforePath, afterPath, outDir = 'dev/_css3-report-chip'] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('usage: node dev/_css3-chip-compare2.mjs <before.css> <after.css> [outDir]')
  process.exit(2)
}

const SCOPES = [
  ['plain', ''],
  ['quick-budget', 'quick-budget'],
  ['bench-receipt-actions', 'bench-receipt-actions'],
  ['itin-cover', 'itin-cover'],
  ['chip-row', 'chip-row'],
  ['map-ideas-sheet-tabs', 'map-ideas-sheet-tabs'],
  ['ct-save-err', 'ct-save-err'],
]

const VARIANTS = [
  ['chip', '<span class="chip" data-key="__KEY__">Label</span>'],
  ['teal', '<span class="chip chip-teal" data-key="__KEY__">Label</span>'],
  ['outline', '<span class="chip chip-outline" data-key="__KEY__">Label</span>'],
  ['saffron', '<span class="chip chip-saffron" data-key="__KEY__">Label</span>'],
  ['on', '<button class="chip on" data-key="__KEY__">On</button>'],
  ['disabled', '<button class="chip" data-key="__KEY__" disabled>Off</button>'],
  ['focusable', '<button class="chip" data-key="__KEY__">Focus</button>'],
]

const PROPS = [
  'display', 'align-items', 'gap', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-radius', 'font-size', 'font-weight', 'background-color', 'color',
  'border-top-width', 'border-top-color', 'border-top-style', 'height', 'min-height',
  'opacity', 'cursor', 'outline-style', 'box-shadow', 'transition-property',
  'backdrop-filter', 'white-space', 'line-height', 'position',
]

const ENVS = [
  { id: 'light-desktop', theme: 'light', width: 1440, reduced: 'no-preference' },
  { id: 'dark-desktop', theme: 'dark', width: 1440, reduced: 'no-preference' },
  { id: 'light-phone', theme: 'light', width: 390, reduced: 'no-preference' },
  { id: 'dark-phone', theme: 'dark', width: 390, reduced: 'no-preference' },
  { id: 'light-reduced', theme: 'light', width: 1440, reduced: 'reduce' },
]

const scopeSelector = (cls) => `.${cls} [data-key]`

const browser = await launchChrome()
const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8')

let total = 0
let comparedTotal = 0
let focusTotal = 0
let hiddenTotal = 0
const allDiffs = []

for (const env of ENVS) {
  const results = {}
  for (const [label, css] of [['before', beforeCss], ['after', afterCss]]) {
    const { html, expected } = buildFixture({
      css,
      theme: env.theme,
      scopes: SCOPES,
      variants: VARIANTS,
      wrap: 'ancestor',
    })
    const page = await browser.newPage({ viewport: { width: env.width, height: 2200 } })
    await page.emulateMedia({ reducedMotion: env.reduced, colorScheme: env.theme })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(120)

    await assertScopes(page, SCOPES, scopeSelector, `${env.id} ${label}`)
    // A span chip is a display-only pill and takes no focus. Only the button
    // variants are expected to be focusable, so they are the ones asserted.
    const focusInfo = await assertFocusReachable(
      page,
      expected,
      ['disabled', 'chip', 'teal', 'outline', 'saffron'],
      `${env.id} ${label} rest`,
    )
    focusTotal += focusInfo.focused
    hiddenTotal += focusInfo.hidden.length

    const rest = await readMeasured(page, PROPS, expected, `${env.id} ${label} rest`)

    const focusRows = await page.evaluate((propertyNames) => {
      const out = []
      for (const el of document.querySelectorAll('[data-key]')) {
        if (el.disabled || el.readOnly) continue
        el.focus()
        const cs = getComputedStyle(el)
        const row = { key: el.getAttribute('data-key') }
        for (const p of propertyNames) row[p] = cs.getPropertyValue(p)
        out.push(row)
        el.blur()
      }
      return out
    }, PROPS)
    const focus = new Map()
    for (const row of focusRows) {
      if (focus.has(row.key)) throw new Error(`${env.id} ${label} focus: duplicate key "${row.key}"`)
      focus.set(row.key, row)
    }

    await page.close()
    results[label] = { rest, focus }
  }

  for (const phase of ['rest', 'focus']) {
    const { total: t, diffs, compared } = diffResults(results.before[phase], results.after[phase], PROPS, `${env.id} ${phase}`)
    total += t
    comparedTotal += compared
    allDiffs.push(...diffs)
  }
}

await browser.close()

const elements = SCOPES.length * VARIANTS.length
console.log(`elements=${elements} envs=${ENVS.length} phases=2`)
console.log(`property-comparisons=${comparedTotal}`)
console.log(`focus-checks=${focusTotal} hidden=${hiddenTotal}`)
console.log(`differences=${total}`)
for (const d of allDiffs.slice(0, 25)) console.log('  ' + d)
writeReport(outDir, 'report.json', { elements, envs: ENVS.length, comparedTotal, focusTotal, hiddenTotal, total, diffs: allDiffs })
process.exit(total ? 1 : 0)
