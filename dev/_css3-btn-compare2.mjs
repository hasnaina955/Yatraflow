// CSS-3 button comparison, repaired.
//
// The previous fixture wrote two `class` attributes on the wrapper, so Chrome
// kept the first and discarded the page scope. Every scoped row was so
// measuring an unscoped button, which is how the ghost regression survived a
// green comparison.
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

const [beforePath, afterPath, outDir = 'dev/_css3-report-btn'] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('usage: node dev/_css3-btn-compare2.mjs <before.css> <after.css> [outDir]')
  process.exit(2)
}

const SCOPES = [
  ['plain', ''],
  ['ex-page', 'ex-page'],
  ['trips-page', 'trips-page'],
  ['yf-page', 'yf-page'],
  ['modal', 'modal'],
  ['hero', 'hero'],
  ['nav-right', 'nav-right'],
  ['bench-dock', 'bench-dock'],
  ['gcf', 'gcf'],
  ['yf-header-actions', 'yf-header-actions'],
  ['offline-recovery-actions', 'offline-recovery-actions'],
  ['poi-actions', 'poi-actions'],
]

// Every variant the module owns, including the ones that used to be invisible.
const ALL_VARIANTS = [
  ['base', '<button class="btn" data-key="__KEY__">Go</button>'],
  ['link', '<a class="btn" href="#x" data-key="__KEY__">Go</a>'],
  ['sm', '<button class="btn btn-sm" data-key="__KEY__">Go</button>'],
  ['lg', '<button class="btn btn-lg" data-key="__KEY__">A longer label</button>'],
  ['primary', '<button class="btn btn-primary" data-key="__KEY__">Go</button>'],
  ['saffron', '<button class="btn btn-saffron" data-key="__KEY__">Go</button>'],
  ['outline', '<button class="btn btn-outline" data-key="__KEY__">Go</button>'],
  ['ghost', '<button class="btn btn-ghost" data-key="__KEY__">Go</button>'],
  ['ghost-sm', '<button class="btn btn-ghost btn-sm" data-key="__KEY__">Remove</button>'],
  ['ghost-lg', '<button class="btn btn-ghost btn-lg" data-key="__KEY__">Go</button>'],
  ['ghost-sm-disabled', '<button class="btn btn-ghost btn-sm" disabled data-key="__KEY__">Remove</button>'],
  ['ghost-primary', '<button class="btn btn-primary btn-ghost" data-key="__KEY__">Go</button>'],
  ['ghost-outline', '<button class="btn btn-outline btn-ghost" data-key="__KEY__">Go</button>'],
  ['ghost-saffron', '<button class="btn btn-saffron btn-ghost" data-key="__KEY__">Go</button>'],
  ['ghost-navy', '<button class="btn btn-navy btn-ghost" data-key="__KEY__">Go</button>'],
  ['icon', '<button class="btn" aria-label="Go" data-key="__KEY__"><svg width="14" height="14"><circle cx="7" cy="7" r="6"/></svg></button>'],
  ['disabled', '<button class="btn" disabled data-key="__KEY__">Go</button>'],
  ['loading', '<button class="btn" aria-busy="true" disabled data-key="__KEY__">Go</button>'],
]
const onlyVariants = process.env.CSS3_VARIANTS?.split(',').filter(Boolean)
const excludedVariants = process.env.CSS3_EXCLUDE_VARIANTS?.split(',').filter(Boolean) ?? []
const VARIANTS = ALL_VARIANTS.filter(([name]) => (!onlyVariants || onlyVariants.includes(name)) && !excludedVariants.includes(name))
if (!VARIANTS.length || (onlyVariants && onlyVariants.some(name => !VARIANTS.some(([variant]) => variant === name)))) {
  throw new Error('The variant selection is empty or names an unknown variant.')
}

const PROPS = [
  'display', 'align-items', 'justify-content', 'gap', 'border-top-width', 'border-top-style',
  'border-top-color', 'border-radius', 'font-size', 'font-weight', 'letter-spacing',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'min-height', 'height',
  'width', 'opacity', 'cursor', 'white-space', 'transition-property', 'transition-duration',
  'transition-timing-function', 'transform', 'box-shadow', 'outline-style', 'outline-width',
  'color', 'background-color', 'text-decoration-line', 'position', 'z-index', 'flex-grow',
  'flex-basis', 'flex-shrink', 'margin-left', 'margin-top', 'overflow',
]

const ENVS = [
  { id: 'light-desktop', theme: 'light', width: 1440, reduced: 'no-preference' },
  { id: 'dark-desktop', theme: 'dark', width: 1440, reduced: 'no-preference' },
  { id: 'light-phone', theme: 'light', width: 390, reduced: 'no-preference' },
  { id: 'dark-phone', theme: 'dark', width: 390, reduced: 'no-preference' },
  { id: 'light-reduced', theme: 'light', width: 1440, reduced: 'reduce' },
]

// The scope classes reach the button through an ancestor, as in production:
// `.ex-page .btn`, `.hero .btn`, `.nav-right .btn`.
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
    const page = await browser.newPage({ viewport: { width: env.width, height: 3000 } })
    await page.emulateMedia({ reducedMotion: env.reduced, colorScheme: env.theme })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(120)

    await assertScopes(page, SCOPES, scopeSelector, `${env.id} ${label}`)
    const focusInfo = await assertFocusReachable(page, expected, ['disabled', 'loading', 'ghost-sm-disabled'], `${env.id} ${label} rest`)
    focusTotal += focusInfo.focused
    hiddenTotal += focusInfo.hidden.length

    const rest = await readMeasured(page, PROPS, expected, `${env.id} ${label} rest`)

    // Focused state, read from the same page so the fixture cannot drift.
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
console.log(`focus-checks=${focusTotal}`)
console.log(`differences=${total}`)
for (const d of allDiffs.slice(0, 40)) console.log('  ' + d)
writeReport(outDir, 'report.json', { variants: VARIANTS.map(([name]) => name), elements, envs: ENVS.length, comparedTotal, focusTotal, total, diffs: allDiffs })
process.exit(total ? 1 : 0)
