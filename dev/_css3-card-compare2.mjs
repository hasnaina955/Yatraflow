// CSS-3 card comparison, repaired.
//
// Two defects in the previous version:
//   - the stacked pair reused key "K2" across every scope, so those rows
//     collapsed and the second card was never compared
//   - keys were not asserted, so a collapsed row still looked like a result
import fs from 'node:fs'
import {
  launchChrome,
  buildFixture,
  readMeasured,
  assertScopes,
  assertAdjacentPairs,
  diffResults,
  writeReport,
} from './_css3-compare-lib.mjs'

const [beforePath, afterPath, outDir = 'dev/_css3-report-card'] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('usage: node dev/_css3-card-compare2.mjs <before.css> <after.css> [outDir]')
  process.exit(2)
}

const SCOPES = [
  ['plain', ''],
  ['bento', 'bento'],
  ['bezel', 'bezel'],
  ['explore-grid', 'explore-grid'],
  ['two-col', 'two-col'],
  ['feature-strip', 'feature-strip'],
]

// Every key is generated from the scope and the variant, so the stacked pair
// gets two distinct keys and neither collapses into the other. The adjacent
// pair renders inside one wrapper so `.card + .card` actually matches the
// second card; two cards in separate wrappers are not siblings.
const VARIANTS = [
  ['card', '<div class="card" data-key="__KEY__">Body</div>'],
  ['route-snap', '<div class="card route-snap" data-key="__KEY__">Route</div>'],
  [
    'adjacent-pair',
    '<div class="card" data-key="__KEY__">One</div><div class="card" data-key="__KEY2__">Two</div>',
  ],
  ['nested', '<div class="card" data-key="__KEY__"><h3>Title</h3><hr class="divider"><p>Text</p></div>'],
  ['overflow', '<div class="card" data-key="__KEY__" style="max-width:180px"><p style="white-space:nowrap">A very long line that would overflow the card box</p></div>'],
]

const PROPS = [
  'background-color', 'background-image', 'border-top-width', 'border-top-color', 'border-top-style',
  'border-radius', 'box-shadow', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-bottom', 'overflow-x', 'overflow-y', 'position', 'color',
  'width', 'height', 'display', 'font-size',
]

const ENVS = [
  { id: 'light-desktop', theme: 'light', width: 1440, reduced: 'no-preference' },
  { id: 'dark-desktop', theme: 'dark', width: 1440, reduced: 'no-preference' },
  { id: 'light-phone', theme: 'light', width: 390, reduced: 'no-preference' },
  { id: 'dark-phone', theme: 'dark', width: 390, reduced: 'no-preference' },
]

const scopeSelector = (cls) => `.${cls} [data-key]`

const browser = await launchChrome()
const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8')

let total = 0
let comparedTotal = 0
let pairsTotal = 0
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
    const page = await browser.newPage({ viewport: { width: env.width, height: 2400 } })
    await page.emulateMedia({ reducedMotion: env.reduced, colorScheme: env.theme })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(120)

    await assertScopes(page, SCOPES, scopeSelector, `${env.id} ${label}`)
    pairsTotal += await assertAdjacentPairs(page, expected, `${env.id} ${label}`)
    results[label] = await readMeasured(page, PROPS, expected, `${env.id} ${label}`)
    await page.close()
  }

  const { total: t, diffs, compared } = diffResults(results.before, results.after, PROPS, env.id)
  total += t
  comparedTotal += compared
  allDiffs.push(...diffs)
}

await browser.close()

const elements = SCOPES.length * VARIANTS.length
console.log(`elements=${elements} envs=${ENVS.length}`)
console.log(`property-comparisons=${comparedTotal}`)
console.log(`adjacent-pairs-asserted=${pairsTotal}`)
console.log(`differences=${total}`)
for (const d of allDiffs.slice(0, 25)) console.log('  ' + d)
writeReport(outDir, 'report.json', { elements, envs: ENVS.length, comparedTotal, total, diffs: allDiffs })
process.exit(total ? 1 : 0)
