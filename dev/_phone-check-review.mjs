// Scratch: re-measure the review's P0/P1 findings after the fixes.
import { launchChrome } from './_css3-compare-lib.mjs'

const browser = await launchChrome()
try {
  for (const width of [320, 360, 390, 411]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 })
    await page.goto('http://localhost:5180/dev/overview-fixture.html?tab=timeline&theme=dark', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('.day-header', { timeout: 20000 })
    await page.waitForTimeout(900)

    const day = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.day-section')]
      return cards.map(card => {
        const h = card.querySelector('.day-title-text')
        const heart = card.querySelector('.tl-save-heart')
        const fold = card.querySelector('.day-collapse')
        const chip = card.querySelector('.day-fixed-badge')
        const stats = card.querySelector('.day-header .small.muted.num')
        const thumb = card.querySelector('.day-thumb')
        const r = el => el ? el.getBoundingClientRect() : null
        const hr = r(h), her = r(heart), fr = r(fold), cr = r(chip)
        return {
          title: h?.textContent.trim(),
          cardH: Math.round(card.getBoundingClientRect().height),
          titleW: hr ? Math.round(hr.width) : 0,
          titleH: hr ? Math.round(hr.height) : 0,
          thumb: thumb ? getComputedStyle(thumb).display : '(gone)',
          heartWrapped: her && hr ? her.top >= hr.bottom - 2 : false,
          foldOverChip: fr && cr ? !(fr.right <= cr.left || fr.left >= cr.right ||
            fr.bottom <= cr.top || fr.top >= cr.bottom) : false,
          statsLines: stats ? Math.round(stats.getBoundingClientRect().height / 17) : 0,
          statsClipped: stats ? stats.scrollHeight > stats.clientHeight + 1 : false,
        }
      })
    })

    await page.evaluate(() => window.scrollTo(0, 999999))
    await page.waitForTimeout(300)
    const fab = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.day-section')]
      const last = cards[cards.length - 1]?.getBoundingClientRect()
      const button = document.querySelector('.tl-add-fab')?.getBoundingClientRect()
      if (!last || !button) return null
      return { lastBottom: Math.round(last.bottom), fabTop: Math.round(button.top), gap: Math.round(button.top - last.bottom) }
    })

    console.log(JSON.stringify({ width, day, fab }, null, 1))
    await page.close()
  }

  const rail = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await rail.goto('http://localhost:5180/dev/overview-fixture.html?tab=budget&theme=dark', { waitUntil: 'domcontentloaded' })
  await rail.waitForSelector('.yf-tabbar .tab-btn.active', { timeout: 20000 })
  await rail.waitForTimeout(900)
  console.log(JSON.stringify({
    rail: await rail.evaluate(() => {
      const bar = document.querySelector('.yf-tabbar')
      const active = bar.querySelector('.tab-btn.active')
      const br = bar.getBoundingClientRect(), ar = active.getBoundingClientRect()
      return {
        scrollLeft: Math.round(bar.scrollLeft),
        startClear: Math.round(ar.left - br.left),
        endClear: Math.round(br.right - ar.right),
        label: active.textContent.trim(),
      }
    }),
  }, null, 1))
} finally {
  await browser.close()
}
