// Scratch: why the active tab is not revealed.
import { launchChrome } from './_css3-compare-lib.mjs'

const browser = await launchChrome()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await page.goto('http://localhost:5180/dev/overview-fixture.html?tab=budget&theme=dark', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('.yf-tabbar .tab-btn.active', { timeout: 20000 })
  await page.waitForTimeout(1500)
  const dump = async (p) => p.evaluate(() => {
    const bar = document.querySelector('.yf-tabbar')
    const active = bar.querySelector('.tab-btn.active')
    const box = bar.getBoundingClientRect()
    const item = active.getBoundingClientRect()
    return {
      keys: [...bar.querySelectorAll('[data-pill-key]')].map(b => b.dataset.pillKey),
      activeKey: active.dataset.pillKey,
      overflow: bar.dataset.overflow,
      scrollLeft: bar.scrollLeft,
      scrollWidth: bar.scrollWidth,
      clientWidth: bar.clientWidth,
      itemLeft: item.left - box.left + bar.scrollLeft,
      itemRight: item.right - box.left + bar.scrollLeft,
      wrapClass: bar.className,
      parentClass: bar.parentElement.className,
      overflowX: getComputedStyle(bar).overflowX,
      tabs: [...bar.querySelectorAll('.tab-btn')].map(b => ({
        key: b.dataset.pillKey,
        left: Math.round(b.getBoundingClientRect().left - box.left),
        w: Math.round(b.getBoundingClientRect().width),
        active: b.classList.contains('active'),
      })),
    }
  })
  console.log(JSON.stringify(await dump(page), null, 1))
  const other = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await other.goto('http://localhost:5180/dev/overview-fixture.html?tab=timeline&theme=dark', { waitUntil: 'domcontentloaded' })
  await other.waitForSelector('.yf-tabbar .tab-btn.active', { timeout: 20000 })
  await other.waitForTimeout(1500)
  console.log(JSON.stringify({ timelineTab: await dump(other) }, null, 1))
} finally {
  await browser.close()
}
