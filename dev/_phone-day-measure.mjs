// Scratch: why a day title ellipsises at 390px.
import { launchChrome } from './_css3-compare-lib.mjs'

const browser = await launchChrome()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await page.goto('http://localhost:5180/dev/overview-fixture.html?tab=timeline&theme=dark', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('.day-title-text', { timeout: 20000 })
  await page.waitForTimeout(1000)

  const out = await page.evaluate(() =>
    [...document.querySelectorAll('.day-section')].map(section => {
      const header = section.querySelector('.day-header')
      const row = header?.querySelector('.day-title-row')
      const h3 = row?.querySelector('.day-title-text')
      const boxes = {}
      if (row) {
        for (const child of row.children) {
          const cs = getComputedStyle(child)
          const r = child.getBoundingClientRect()
          boxes[child.className || child.tagName.toLowerCase()] = {
            w: Math.round(r.width),
            h: Math.round(r.height),
            display: cs.display,
          }
        }
      }
      const hr = header?.getBoundingClientRect()
      const rr = row?.getBoundingClientRect()
      return {
        title: h3?.textContent,
        titleW: h3 ? Math.round(h3.getBoundingClientRect().width) : 0,
        titleScrollW: h3?.scrollWidth,
        titleWhiteSpace: h3 ? getComputedStyle(h3).whiteSpace : '',
        headerW: hr ? Math.round(hr.width) : 0,
        headerPadEnd: header ? getComputedStyle(header).paddingInlineEnd : '',
        rowW: rr ? Math.round(rr.width) : 0,
        boxes,
      }
    }))
  console.log(JSON.stringify(out, null, 2))
} finally {
  await browser.close()
}
