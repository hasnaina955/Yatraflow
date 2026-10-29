// CSS-3 B6: compare computed chip styles between two builds.
import fs from 'node:fs'

const [beforePath, afterPath] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('usage: node dev/_css3-chip-compare.mjs <before.css> <after.css>')
  process.exit(2)
}

const { chromium } = await import('playwright-core')

async function launch() {
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
  ['chip', '<span class="chip" data-key="K">Label</span>'],
  ['teal', '<span class="chip chip-teal" data-key="K">Label</span>'],
  ['outline', '<span class="chip chip-outline" data-key="K">Label</span>'],
  ['saffron', '<span class="chip chip-saffron" data-key="K">Label</span>'],
  ['on', '<button class="chip on" data-key="K">On</button>'],
  ['disabled', '<button class="chip" data-key="K" disabled>Off</button>'],
  ['focus', '<button class="chip" id="F" data-key="K">Focus</button>'],
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

function buildPage(css, theme) {
  const blocks = []
  for (const [scopeName, scopeClass] of SCOPES) {
    for (const [variantName, variantHtml] of VARIANTS) {
      const key = `${scopeName}|${variantName}`
      const marked = variantHtml.split('data-key="K"').join(`data-key="${key}"`)
      blocks.push(`<div class="${scopeClass}">${marked}</div>`)
    }
  }
  return `<!doctype html><html data-theme="${theme}"><head><style>${css}</style></head><body style="margin:0;padding:16px">${blocks.join('\n')}</body></html>`
}

async function readAll(page) {
  return page.evaluate((props) => {
    const out = {}
    for (const el of document.querySelectorAll('[data-key]')) {
      const cs = getComputedStyle(el)
      const row = {}
      for (const p of props) row[p] = cs.getPropertyValue(p)
      out[el.getAttribute('data-key')] = row
    }
    return out
  }, PROPS)
}

async function measure(browser, css, env) {
  const page = await browser.newPage({ viewport: { width: env.width, height: 2000 } })
  await page.emulateMedia({ reducedMotion: env.reduced, colorScheme: env.theme })
  await page.setContent(buildPage(css, env.theme), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(150)
  const rest = await readAll(page)
  const focus = await page.evaluate((props) => {
    const out = {}
    for (const el of document.querySelectorAll('[data-key]')) {
      if (el.disabled) continue
      el.focus()
      const cs = getComputedStyle(el)
      const row = {}
      for (const p of props) row[p] = cs.getPropertyValue(p)
      out[el.getAttribute('data-key')] = row
      el.blur()
    }
    return out
  }, PROPS)
  await page.close()
  return { rest, focus }
}

const browser = await launch()
const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8')

let total = 0
const diffs = []
for (const env of ENVS) {
  const a = await measure(browser, beforeCss, env)
  const b = await measure(browser, afterCss, env)
  for (const phase of ['rest', 'focus']) {
    for (const key of Object.keys(a[phase] ?? {})) {
      if (!b[phase]?.[key]) {
        diffs.push(`${env.id} ${phase} ${key} :: missing after`)
        total++
        continue
      }
      for (const p of PROPS) {
        if (a[phase][key][p] !== b[phase][key][p]) {
          total++
          if (diffs.length < 25) diffs.push(`${env.id} ${phase} ${key} :: ${p}: ${a[phase][key][p]} -> ${b[phase][key][p]}`)
        }
      }
    }
  }
}

await browser.close()
console.log(`elements=${SCOPES.length * VARIANTS.length} envs=${ENVS.length} phases=2 comparisons=${SCOPES.length * VARIANTS.length * ENVS.length * 2}`)
console.log(`property-differences=${total}`)
for (const d of diffs) console.log('  ' + d)
process.exit(total ? 1 : 0)
