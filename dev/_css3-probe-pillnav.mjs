// Scratch probe: does the pill nav fixture render, and which family elements appear?
import { launchChrome } from './_css3-compare-lib.mjs'

const browser = await launchChrome()
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto('http://127.0.0.1:5178/dev/css3-pillnav-fixture.html', { waitUntil: 'networkidle' })
    await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    const counts = await page.evaluate(() => {
      const q = (s) => document.querySelectorAll(s).length
      const g = document.querySelector('.pill-glider')
      const gs = g ? getComputedStyle(g) : null
      return {
        pillNav: q('.pill-nav'),
        glider: q('.pill-glider'),
        tabBtn: q('.pill-nav .tab-btn'),
        tabActive: q('.pill-nav .tab-btn.active'),
        tabCount: q('.pill-nav .tab-count'),
        navLink: q('.pill-nav .nav-link'),
        chip: q('.pill-nav .clickable-chip'),
        ink: q('.pill-ink'),
        inkRow: q('.pill-ink-row'),
        inkCopies: q('.pill-ink-row .tab-btn'),
        gliderBox: gs ? { left: gs.left, top: gs.top, width: gs.width, height: gs.height, opacity: gs.opacity } : null,
        inkBox: (() => { const i = document.querySelector('.pill-ink'); if (!i) return null; const s = getComputedStyle(i); return { left: s.left, top: s.top, width: s.width, height: s.height } })(),
        overflow: (() => { const n = document.querySelector('[data-fixture-row="navlink"]'); return n ? { scrollWidth: n.scrollWidth, clientWidth: n.clientWidth, state: n.dataset.overflow ?? null } : null })(),
      }
    })
    console.log(theme, JSON.stringify(counts, null, 1))
    if (errors.length) console.log(theme, 'ERRORS:', errors.slice(0, 4))
    await page.close()
  }
} finally {
  await browser.close()
}
