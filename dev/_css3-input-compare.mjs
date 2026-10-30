// Compare input combinations used by the Timeline and flight editor.
import fs from 'node:fs'
import {
  launchChrome, buildFixture, readMeasured, assertScopes, assertFocusReachable,
  validateRows, diffResults, writeReport,
} from './_css3-compare-lib.mjs'

const [beforePath, afterPath, outDir] = process.argv.slice(2)
if (!beforePath || !afterPath || !outDir) {
  console.error('usage: node dev/_css3-input-compare.mjs <before.css> <after.css> <outDir>')
  process.exit(2)
}

const SCOPES = [['plain', ''], ['timeline', 'tps-dep'], ['flight', 'hp-field']]
const VARIANTS = [
  ['base', '<input class="input" data-key="__KEY__" value="Place">'],
  ['compact', '<input class="input input--compact" data-key="__KEY__" value="Place">'],
  ['departure', '<input type="time" class="input input--compact" data-key="__KEY__" value="09:30">'],
  ['airline', '<input class="input input--compact flight-w-airline" data-key="__KEY__" value="IndiGo">'],
  ['flight', '<input class="input input--compact flight-w-flight" data-key="__KEY__" value="6E 2144">'],
  ['fare', '<input type="number" class="input input--compact flight-w-fare" data-key="__KEY__" value="1000">'],
  ['ref', '<input class="input input--compact flight-w-ref" data-key="__KEY__" value="PNR">'],
  ['disabled', '<input class="input input--compact flight-w-airline" data-key="__KEY__" disabled>'],
  ['invalid', '<input class="input input--compact flight-w-ref" data-key="__KEY__" aria-invalid="true">'],
]
const PROPS = ['width', 'height', 'min-height', 'padding-top', 'padding-right', 'padding-bottom',
  'padding-left', 'font-size', 'border-top-width', 'border-top-color', 'border-radius', 'color',
  'background-color', 'opacity', 'cursor', 'box-shadow', 'outline-style']
const ENVS = [
  { id: 'light-desktop', theme: 'light', width: 1440 },
  { id: 'dark-desktop', theme: 'dark', width: 1440 },
  { id: 'light-phone', theme: 'light', width: 390 },
  { id: 'dark-phone', theme: 'dark', width: 390 },
]

const browser = await launchChrome()
const sheets = [['before', fs.readFileSync(beforePath, 'utf8')], ['after', fs.readFileSync(afterPath, 'utf8')]]
const diffs = []
let compared = 0
let focusChecks = 0
for (const env of ENVS) {
  const results = {}
  for (const [label, css] of sheets) {
    const { html, expected } = buildFixture({ css, theme: env.theme, scopes: SCOPES, variants: VARIANTS, wrap: 'ancestor' })
    const page = await browser.newPage({ viewport: { width: env.width, height: 3000 } })
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: env.theme })
    await page.setContent(html.replace('</style>', '.row { width: min(600px, 100%); }</style>'), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await assertScopes(page, SCOPES, cls => `.${cls} [data-key]`, `${env.id} ${label}`)
    const focusInfo = await assertFocusReachable(page, expected, ['disabled'], `${env.id} ${label}`)
    focusChecks += focusInfo.focused
    const rest = await readMeasured(page, PROPS, expected, `${env.id} ${label} rest`)
    const focusRows = await page.evaluate((props) => {
      const rows = []
      for (const el of document.querySelectorAll('[data-key]:not(:disabled)')) {
        el.focus()
        const style = getComputedStyle(el)
        const row = { key: el.getAttribute('data-key') }
        for (const prop of props) row[prop] = style.getPropertyValue(prop)
        rows.push(row)
        el.blur()
      }
      return rows
    }, PROPS)
    const focus = validateRows(focusRows, expected.filter(key => !key.endsWith('|disabled')), `${env.id} ${label} focus`)
    results[label] = { rest, focus }
    await page.close()
  }
  for (const phase of ['rest', 'focus']) {
    const result = diffResults(results.before[phase], results.after[phase], PROPS, `${env.id} ${phase}`)
    compared += result.compared
    diffs.push(...result.diffs)
  }
}
await browser.close()
console.log(`elements=${SCOPES.length * VARIANTS.length} envs=${ENVS.length} property-comparisons=${compared} focus-checks=${focusChecks} differences=${diffs.length}`)
for (const diff of diffs.slice(0, 40)) console.log(`  ${diff}`)
writeReport(outDir, 'report.json', { elements: SCOPES.length * VARIANTS.length, envs: ENVS.length, compared, focusChecks, total: diffs.length, diffs })
process.exit(diffs.length ? 1 : 0)
