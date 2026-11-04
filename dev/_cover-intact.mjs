// Scratch: confirm the surfaces the repair must leave intact.
// Compact title, tab glider ink, interrupted switch, phone/desktop, dark mode.
import { launchChrome } from './_css3-compare-lib.mjs'

const BASE = 'http://127.0.0.1:5178/dev/overview-fixture.html'
const browser = await launchChrome()
const rows = []
try {
  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 950 } })
      try {
        await page.goto(`${BASE}?tab=overview&theme=${theme}`, { waitUntil: 'networkidle' })
        await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
        await page.waitForTimeout(1600)
        const rest = await page.evaluate(() => {
          const head = document.querySelector('.yf-trip-head')
          const media = document.querySelector('.yf-cover-media')
          const art = document.querySelector('.yf-cover-media > .yf-cover-img')
          const glider = document.querySelector('.yf-tabbar .pill-glider')
          const ink = document.querySelector('.yf-tabbar .pill-ink')
          const active = document.querySelector('.yf-tabbar > .tab-btn.active')
          const h = head?.getBoundingClientRect()
          const m = media?.getBoundingClientRect()
          const g = glider?.getBoundingClientRect()
          const a = active?.getBoundingClientRect()
          return {
            drift: h && m ? Math.round((m.width - h.width) * 100) / 100 : null,
            artTf: art ? getComputedStyle(art).transform : null,
            gliderBox: g ? `${Math.round(g.left)},${Math.round(g.width)}` : null,
            activeBox: a ? `${Math.round(a.left)},${Math.round(a.width)}` : null,
            inkPresent: Boolean(ink),
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            title: document.querySelector('.yf-trip-title')?.textContent?.trim().slice(0, 20) ?? null,
          }
        })
        // Interrupted switch: two tab changes inside one animation.
        await page.evaluate(() => {
          const tabs = [...document.querySelectorAll('.yf-tabbar > .tab-btn')]
          tabs.find((t) => /Board/i.test(t.textContent ?? ''))?.click()
          setTimeout(() => tabs.find((t) => /Map/i.test(t.textContent ?? ''))?.click(), 40)
        })
        await page.waitForTimeout(1400)
        const after = await page.evaluate(() => {
          const glider = document.querySelector('.yf-tabbar .pill-glider')
          const active = document.querySelector('.yf-tabbar > .tab-btn.active')
          const g = glider?.getBoundingClientRect()
          const a = active?.getBoundingClientRect()
          return {
            settledKey: active?.textContent?.trim() ?? null,
            delta: g && a ? Math.round((Math.abs(g.left - a.left) + Math.abs(g.width - a.width)) * 100) / 100 : null,
            boardVisible: Boolean(document.querySelector('.board-col')),
          }
        })
        rows.push({ width, theme, rest, after })
      } finally {
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
}
console.log(JSON.stringify(rows, null, 1))
