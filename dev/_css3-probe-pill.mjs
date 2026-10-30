// Scratch probe: is the PillNav family reachable without a session?
import { launchChrome } from './_css3-compare-lib.mjs'

const ROUTES = ['/', '/explore']
const browser = await launchChrome()
try {
  for (const theme of ['light']) {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      for (const route of ROUTES) {
        await page.goto(`http://127.0.0.1:5178${route}`, { waitUntil: 'networkidle' })
        await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
        await page.waitForTimeout(400)
        const counts = await page.evaluate(() => ({
          pillNav: document.querySelectorAll('.pill-nav').length,
          pillGlider: document.querySelectorAll('.pill-glider').length,
          navLink: document.querySelectorAll('.pill-nav .nav-link').length,
          tabBtn: document.querySelectorAll('.pill-nav .tab-btn').length,
          chip: document.querySelectorAll('.pill-nav .clickable-chip').length,
          pillInkRow: document.querySelectorAll('.pill-ink-row').length,
          yfTabbar: document.querySelectorAll('.yf-tabbar').length,
        }))
        console.log(`${theme}@${width} ${route} ->`, JSON.stringify(counts))
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
}
