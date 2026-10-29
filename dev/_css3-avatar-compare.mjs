// CSS-3 avatar comparison, on the shared harness.
//
// Before this tool is trusted, it is proven to catch a seeded avatar defect.
// See dev/_css3-avatar-seed.mjs: it plants a change in the module, runs this
// tool, and requires a non-zero result.
import fs from 'node:fs'
import {
  launchChrome,
  buildFixture,
  readMeasured,
  assertScopes,
  diffResults,
  writeReport,
} from './_css3-compare-lib.mjs'

const [beforePath, afterPath, outDir = 'dev/_css3-report-avatar'] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('usage: node dev/_css3-avatar-compare.mjs <before.css> <after.css> [outDir]')
  process.exit(2)
}

// Every scope that sizes or stacks an avatar, plus the bare case.
const SCOPES = [
  ['plain', ''],
  ['member-stack', 'member-stack'],
  ['presence-peer', 'presence-peer'],
  ['balance-who', 'balance-who'],
  ['who-voted', 'who-voted'],
  ['creator-hero', 'creator-hero'],
  ['ex-byline', 'ex-byline'],
  ['ex-creator', 'ex-creator'],
  ['yf-member', 'yf-member'],
  ['yf-page-yf-member', 'yf-page yf-member'],
  ['ovw-avatars', 'ovw2 ovw-avatars'],
  ['yf-avatars', 'yf-avatars'],
  ['yf-page-yf-avatars', 'yf-page yf-avatars'],
]

// Each variant is an avatar surface in one of its states.
const VARIANTS = [
  ['base', '<span class="avatar" data-key="__KEY__">AB</span>'],
  ['lg', '<span class="avatar lg" data-key="__KEY__">AB</span>'],
  ['tone-sea', '<span class="avatar tone-sea" data-key="__KEY__">AB</span>'],
  ['tone-marigold', '<span class="avatar tone-marigold" data-key="__KEY__">AB</span>'],
  ['tone-bloom', '<span class="avatar tone-bloom" data-key="__KEY__">AB</span>'],
  ['img', '<img class="avatar" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-key="__KEY__">'],
  ['stack-pair', '<span class="avatar" data-key="__KEY__">AB</span><span class="avatar" data-key="__KEY2__">CD</span>'],
]

const PROPS = [
  'width', 'height', 'min-width', 'min-height', 'border-radius', 'object-fit',
  'background-color', 'background-image', 'color', 'display', 'align-items', 'justify-content',
  'font-weight', 'font-size', 'line-height', 'flex-grow', 'flex-shrink', 'flex-basis',
  'margin-left', 'border-top-width', 'border-top-color', 'border-top-style',
  'box-shadow', 'overflow', 'position', 'opacity',
]

const ENVS = [
  { id: 'light-desktop', theme: 'light', width: 1440, reduced: 'no-preference' },
  { id: 'dark-desktop', theme: 'dark', width: 1440, reduced: 'no-preference' },
  { id: 'light-phone', theme: 'light', width: 390, reduced: 'no-preference' },
  { id: 'dark-phone', theme: 'dark', width: 390, reduced: 'no-preference' },
  { id: 'light-reduced', theme: 'light', width: 1440, reduced: 'reduce' },
]

// Page scopes reach the avatar through an ancestor, as in production.
const scopeSelector = (cls) => cls.split(/\s+/).map((c) => `.${c}`).join('') + ' [data-key]'

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
      wrap: 'ancestor',
    })
    const page = await browser.newPage({ viewport: { width: env.width, height: 2200 } })
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
for (const d of allDiffs.slice(0, 25)) console.log('  ' + d)
writeReport(outDir, 'report.json', { elements, envs: ENVS.length, comparedTotal, total, diffs: allDiffs })
process.exit(total ? 1 : 0)
