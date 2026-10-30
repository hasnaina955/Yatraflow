// CSS-3 container comparison, repaired.
//
// Two defects in the previous version:
//   - every case reused data-key="K", so fourteen cases collapsed into one row
//     per environment and the reported comparison count was fiction
//   - page classes sat on a wrapper, while production puts them on the
//     .container element itself, so `.container.ex-page` never matched
import fs from 'node:fs'
import {
  launchChrome,
  buildFixture,
  readMeasured,
  assertScopes,
  diffResults,
  writeReport,
} from './_css3-compare-lib.mjs'

const [beforePath, afterPath, outDir = 'dev/_css3-report-container'] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('usage: node dev/_css3-container-compare2.mjs <before.css> <after.css> [outDir]')
  process.exit(2)
}

// Production puts the page class on the .container element: `.container.ex-page`,
// `.container.form-page`, `.container.yf-workspace`. The scope class so
// joins the element's own class list, not an ancestor.
const SCOPES = [
  ['plain', ''],
  ['topnav-inner', 'topnav-inner'],
  ['form-page', 'form-page'],
  ['dmca-page', 'dmca-page'],
  ['gcf', 'form-page gcf'],
  ['trip-starter', 'trip-starter'],
  ['yf-workspace', 'yf-workspace'],
  ['ex-page', 'ex-page'],
  ['trips-page', 'trips-page'],
  ['yf-page', 'yf-page'],
  ['form-page-yf-workspace', 'form-page yf-workspace'],
  ['ex-page-yf-page', 'ex-page yf-page'],
]

const VARIANTS = [
  ['container', '<div class="container __SCOPE__" data-key="__KEY__">x</div>'],
  ['wide', '<div class="container __SCOPE__" data-wide="true" data-key="__KEY__">x</div>'],
]

const PROPS = [
  'width', 'max-width', 'min-width', 'margin-left', 'margin-right',
  'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'transition-property', 'transition-duration', 'transition-timing-function',
  'box-sizing', 'display',
]

const ENVS = [
  { id: 'light-1440', theme: 'light', width: 1440, reduced: 'no-preference' },
  { id: 'light-980', theme: 'light', width: 980, reduced: 'no-preference' },
  { id: 'light-640', theme: 'light', width: 640, reduced: 'no-preference' },
  { id: 'light-390', theme: 'light', width: 390, reduced: 'no-preference' },
  { id: 'dark-390', theme: 'dark', width: 390, reduced: 'no-preference' },
  { id: 'light-reduced', theme: 'light', width: 1440, reduced: 'reduce' },
]

// The class relationship the fixture must reproduce, asserted per scope.
const scopeSelector = (cls) => cls.split(/\s+/).map((c) => `.container.${c}`).join('')

const browser = await launchChrome()
const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8')

let total = 0
let comparedTotal = 0
const allDiffs = []

for (const env of ENVS) {
  const results = {}
  for (const [label, css] of [['before', beforeCss], ['after', afterCss]]) {
    const { html, expected } = buildFixture({
      css,
      theme: env.theme,
      scopes: SCOPES,
      variants: VARIANTS,
      wrap: 'element',
    })
    const page = await browser.newPage({ viewport: { width: env.width, height: 1600 } })
    await page.emulateMedia({ reducedMotion: env.reduced, colorScheme: env.theme })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(120)

    await assertScopes(page, SCOPES, scopeSelector, `${env.id} ${label}`)
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
console.log(`differences=${total}`)
for (const d of allDiffs.slice(0, 30)) console.log('  ' + d)
writeReport(outDir, 'report.json', { elements, envs: ENVS.length, comparedTotal, total, diffs: allDiffs })
process.exit(total ? 1 : 0)
