// Scratch: prove the running dev server serves the branch, and grab what it shows.
import { launchChrome } from './_css3-compare-lib.mjs'

const BASE = process.env.BASE ?? 'http://localhost:5178'
const browser = await launchChrome()
try {
  const cssPage = await browser.newPage()
  await cssPage.goto(`${BASE}/src/styles/pages/phone.css`, { waitUntil: 'domcontentloaded' })
  const css = await cssPage.evaluate(() => document.body.innerText)
  console.log(JSON.stringify({
    base: BASE,
    cssServed: css.length,
    hasFullWidthRule: css.includes('A stop card takes the full phone width'),
    hasRibbonRule: css.includes('.tl-ribbon-days::-webkit-scrollbar'),
  }, null, 1))
  await cssPage.close()

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/dev/overview-fixture.html?tab=timeline&theme=dark`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.day-header', { timeout: 20000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'dev/_live-390-folded.png' })
  await page.locator('.day-collapse').first().click()
  await page.waitForTimeout(900)
  await page.evaluate(() => window.scrollTo(0, 620))
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'dev/_live-390-open.png' })
  console.log('dev/_live-390-folded.png dev/_live-390-open.png')
} finally {
  await browser.close()
}
