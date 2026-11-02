#!/usr/bin/env node
// Browser evidence for the PW-13 Budget tab. The dev workspace fixture renders
// the real BudgetTab with the real engine over synthetic data, so this script
// can measure the artboard's structure and responsive state without a session.
// `budget=tagged` gives the fixture's two expenses a payer and one settled
// record; it changes no product data.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, '.verify-evidence', 'budget-fixture')
const URL = 'http://localhost:5178/dev/overview-fixture.html?tab=budget&budget=tagged'

const CASES = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', reducedMotion: 'no-preference' },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', reducedMotion: 'no-preference' },
  { name: 'tablet-light', width: 900, height: 1000, theme: 'light', reducedMotion: 'no-preference' },
  { name: 'phone-light', width: 390, height: 900, theme: 'light', reducedMotion: 'no-preference' },
  { name: 'phone-dark', width: 390, height: 900, theme: 'dark', reducedMotion: 'no-preference' },
  { name: 'desktop-reduced', width: 1440, height: 1000, theme: 'light', reducedMotion: 'reduce' },
]

async function launchChrome() {
  const attempts = [
    { channel: 'chrome' },
    { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  ]
  let lastError
  for (const options of attempts) {
    try {
      return await chromium.launch({ headless: true, ...options })
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`no Chrome or Edge found: ${lastError?.message ?? 'unknown error'}`)
}

async function inspect(page) {
  return page.evaluate(() => {
    const style = (selector, props) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const computed = getComputedStyle(element)
      return Object.fromEntries(props.map(prop => [prop, computed.getPropertyValue(prop)]))
    }
    const rectOf = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      return { x: +box.x.toFixed(1), y: +box.y.toFixed(1), width: +box.width.toFixed(1), height: +box.height.toFixed(1) }
    }
    const plot = document.querySelector('.bud-plot-svg')?.getBoundingClientRect()
    const hits = document.querySelector('.bud-hits')?.getBoundingClientRect()
    const plotArea = plot ? {
      left: plot.left + (plot.width * 44) / 600,
      right: plot.right - (plot.width * 10) / 600,
      top: plot.top + (plot.height * 26) / 300,
      bottom: plot.bottom - (plot.height * 46) / 300,
    } : null
    const alignment = hits && plotArea ? {
      left: +(hits.left - plotArea.left).toFixed(2),
      right: +(hits.right - plotArea.right).toFixed(2),
      top: +(hits.top - plotArea.top).toFixed(2),
      bottom: +(hits.bottom - plotArea.bottom).toFixed(2),
    } : null
    const firstHit = document.querySelector('.bud-hit')
    firstHit?.focus()
    const focusStyle = firstHit ? getComputedStyle(firstHit) : null
    return {
      viewport: [innerWidth, innerHeight],
      scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
      theme: document.documentElement.dataset.theme,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      glanceCards: document.querySelectorAll('.bud-glance-main, .bud-glance-tile').length,
      panels: document.querySelectorAll('.bud-panel').length,
      panel: rectOf('.bud-panel'),
      chart: {
        svg: !!plot,
        hits: document.querySelectorAll('.bud-hit').length,
        alignment,
        bars: document.querySelectorAll('.bud-stack .bud-seg').length,
        targetLine: !!document.querySelector('.bud-target-line'),
        firstTotal: document.querySelector('.bud-bar-total')?.textContent?.trim() ?? null,
        aria: document.querySelector('.bud-plot-svg')?.getAttribute('aria-label')?.slice(0, 90) ?? null,
        tableRows: document.querySelectorAll('.bud-data-table tbody tr').length,
      },
      category: {
        headers: [...document.querySelectorAll('.bud-cat-table thead th')].map(node => node.textContent.trim()),
        rows: document.querySelectorAll('.bud-cat-table tbody tr').length,
        shareBar: !!document.querySelector('.bud-share-bar'),
        insight: document.querySelector('.bud-insight')?.textContent?.trim() ?? null,
        lastHeaderRight: (() => {
          const node = document.querySelector('.bud-cat-table thead th:last-child')
          return node ? +node.getBoundingClientRect().right.toFixed(1) : null
        })(),
        tableRight: (() => {
          const node = document.querySelector('.bud-cat-table')
          return node ? +node.getBoundingClientRect().right.toFixed(1) : null
        })(),
      },
      balances: {
        rows: document.querySelectorAll('.bud-bal-row').length,
        bars: document.querySelectorAll('.bud-bal-bar').length,
        transfers: document.querySelectorAll('.bud-transfer-row').length,
        values: [...document.querySelectorAll('.bud-bal-amount b')].map(node => node.textContent.trim()),
        settle: document.querySelectorAll('.settled-row').length,
        labels: [...document.querySelectorAll('.bud-bal-track')].map(node => node.getAttribute('aria-label')),
      },
      optional: {
        rows: document.querySelectorAll('.bud-optional-row').length,
        note: document.querySelector('.bud-optional-card .bud-card-note')?.textContent?.trim() ?? null,
        marks: document.querySelectorAll('.bud-optional-check').length,
        result: document.querySelector('.bud-optional-result')?.textContent?.trim() ?? null,
      },
      ledger: {
        rows: document.querySelectorAll('.bud-lines-table tbody tr').length,
        headers: [...document.querySelectorAll('.bud-lines-table thead th')].map(node => node.textContent.trim()),
        filters: document.querySelectorAll('.bud-filter').length,
        statuses: [...document.querySelectorAll('.bud-lines-table tbody .bud-pill')].map(node => node.textContent.trim()),
        inlineAmount: style('.bud-line-amount-inline', ['display']),
        inlineAmountText: document.querySelector('.bud-line-amount-inline')?.textContent?.trim() ?? null,
      },
      tipDisplay: getComputedStyle(document.querySelector('.bud-tip') ?? document.body).display,
      styles: {
        panel: style('.bud-panel', ['background-color', 'border-radius', 'box-shadow', 'padding']),
        cardTitle: style('.bud-card-title', ['font-family', 'font-size', 'font-weight']),
        figure: style('.bud-glance-num', ['font-family', 'font-size', 'font-weight', 'font-variant-numeric']),
        stack: style('.bud-stack', ['animation-name', 'animation-duration', 'animation-delay']),
        share: style('.bud-share-bar', ['animation-name', 'animation-duration']),
        trackFill: style('.bud-track-fill', ['fill']),
        hitFocus: focusStyle ? { shadow: focusStyle.boxShadow, outline: focusStyle.outlineStyle } : null,
        hitFocusVisible: firstHit?.matches(':focus-visible') ?? null,
      },
    }
  })
}

const browser = await launchChrome()
mkdirSync(OUT, { recursive: true })
const records = []
const failures = []

try {
  for (const testCase of CASES) {
    const context = await browser.newContext({
      viewport: { width: testCase.width, height: testCase.height },
      reducedMotion: testCase.reducedMotion,
    })
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', error => pageErrors.push(String(error).split('\n')[0]))
    await page.goto(`${URL}&theme=${testCase.theme}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.bud-page', { timeout: 20_000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      document.getAnimations().forEach(animation => {
        try { animation.finish() } catch {}
      })
    })
    const metrics = await inspect(page)
    const name = testCase.name

    if (metrics.glanceCards !== 4) failures.push({ case: name, reason: `expected 4 glance cards, saw ${metrics.glanceCards}` })
    if (metrics.panels !== 5) failures.push({ case: name, reason: `expected 5 panels, saw ${metrics.panels}` })
    if (!metrics.chart.svg || metrics.chart.hits < 1) failures.push({ case: name, reason: 'the day chart did not render', chart: metrics.chart })
    if (metrics.chart.bars < 1) failures.push({ case: name, reason: 'the chart drew no stacked segments', chart: metrics.chart })
    if (!metrics.chart.targetLine) failures.push({ case: name, reason: 'the chart drew no target line' })
    if (metrics.chart.tableRows < 1) failures.push({ case: name, reason: 'the chart table has no rows' })
    if (metrics.chart.alignment && Object.values(metrics.chart.alignment).some(value => Math.abs(value) > 1)) {
      failures.push({ case: name, reason: 'the day hit layer does not sit on the plot area', alignment: metrics.chart.alignment })
    }
    if (metrics.category.rows < 1) failures.push({ case: name, reason: 'the category table has no rows' })
    if (metrics.category.headers.slice(1).join('|') !== 'Category|Share|Group|Per traveller') {
      failures.push({ case: name, reason: 'the category headers do not name their populations', headers: metrics.category.headers })
    }
    if (metrics.balances.rows !== 3) failures.push({ case: name, reason: `expected 3 balance rows, saw ${metrics.balances.rows}`, balances: metrics.balances })
    if (metrics.balances.bars < 1) failures.push({ case: name, reason: 'no diverging balance bar rendered' })
    if (metrics.balances.transfers < 1) failures.push({ case: name, reason: 'no settlement transfer rendered' })
    if (metrics.balances.settle < 2) failures.push({ case: name, reason: 'the settle strip and the settled history did not render' })
    if (metrics.optional.marks < 1) failures.push({ case: name, reason: 'the optional list did not render' })
    if (!metrics.optional.note?.startsWith('Read-only')) failures.push({ case: name, reason: 'the optional list does not say it is read-only' })
    if (metrics.ledger.rows !== 3) failures.push({ case: name, reason: `expected 3 ledger rows, saw ${metrics.ledger.rows}`, ledger: metrics.ledger })
    if (metrics.ledger.filters !== 3) failures.push({ case: name, reason: `expected 3 ledger filters, saw ${metrics.ledger.filters}` })
    if (metrics.scroll[0] > metrics.scroll[1] + 1) failures.push({ case: name, reason: `horizontal overflow ${metrics.scroll.join('/')}` })
    if (testCase.width < 720) {
      // The phone must show the per-traveller column without a sideways scroll,
      // and the ledger's amount must be visible in the What cell.
      if (metrics.category.lastHeaderRight != null && metrics.category.lastHeaderRight > metrics.scroll[1] + 1) {
        failures.push({ case: name, reason: 'the per-traveller column is not visible on the phone', category: metrics.category })
      }
      if (metrics.ledger.inlineAmount?.display === 'none') {
        failures.push({ case: name, reason: 'the phone ledger hides its amount', ledger: metrics.ledger })
      }
    }
    if (testCase.width < 720 && metrics.tipDisplay !== 'none') failures.push({ case: name, reason: 'the phone chart still relies on the hover tip' })
    if (testCase.width >= 720 && metrics.tipDisplay === 'none') failures.push({ case: name, reason: 'the desktop chart lost its tooltip' })
    if (testCase.reducedMotion === 'reduce' && metrics.styles.stack['animation-name'] !== 'none') {
      failures.push({ case: name, reason: 'the bars still animate under reduced motion', stack: metrics.styles.stack })
    }
    if (testCase.reducedMotion !== 'reduce' && metrics.styles.stack['animation-name'] !== 'bud-bars-in') {
      failures.push({ case: name, reason: 'the bars are not on the chart entrance', stack: metrics.styles.stack })
    }
    if (metrics.styles.hitFocusVisible && metrics.styles.hitFocus?.shadow === 'none') {
      failures.push({ case: name, reason: 'the focused day has no ring', focus: metrics.styles.hitFocus })
    }
    if (testCase.theme === 'dark' && !metrics.styles.panel?.['background-color']?.includes('22, 35, 58')) {
      failures.push({ case: name, reason: 'the dark card is not on the night surface', panel: metrics.styles.panel })
    }
    if (testCase.theme === 'light' && !metrics.styles.panel?.['background-color']?.includes('254, 253, 251')) {
      failures.push({ case: name, reason: 'the light card is not on the Linen surface', panel: metrics.styles.panel })
    }
    if (!metrics.styles.figure?.['font-family']?.includes('Sora')) failures.push({ case: name, reason: 'the glance figure is not in the display face' })
    if (metrics.styles.figure?.['font-variant-numeric'] !== 'tabular-nums') failures.push({ case: name, reason: 'the glance figure is not tabular' })
    if (consoleErrors.length || pageErrors.length) failures.push({ case: name, reason: 'console or page errors', consoleErrors, pageErrors })

    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true })
    if (name === 'desktop-light') {
      // A deliberate focus capture: the day read-out and its ring.
      await page.locator('.bud-hit').first().focus()
      await page.waitForTimeout(150)
      await page.screenshot({ path: join(OUT, `${name}-focus.png`) })
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
      // The table view is the phone and keyboard path to every chart value.
      await page.getByText('Table view of cost per day').click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(OUT, `${name}-table.png`) })
    }
    records.push({ ...testCase, metrics, consoleErrors, pageErrors })
    await context.close()
  }
} finally {
  await browser.close()
}

writeFileSync(join(OUT, 'records.json'), JSON.stringify({ records, failures }, null, 2))
if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2))
  process.exitCode = 1
} else {
  console.log(`budget fixture evidence: ${records.length} records, structure and responsive checks hold`)
}
