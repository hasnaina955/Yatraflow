// Scratch: measure an expanded stop card at 390px.
import { launchChrome } from './_css3-compare-lib.mjs'

const browser = await launchChrome()
try {
  const W = Number(process.env.W ?? '390')
  const page = await browser.newPage({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2 })
  await page.goto('http://localhost:5180/dev/overview-fixture.html?tab=timeline&theme=light', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('.day-header', { timeout: 20000 })
  await page.waitForTimeout(800)
  await page.locator('.day-collapse').first().click()
  await page.waitForTimeout(900)

  const out = await page.evaluate(() => {
    const card = document.querySelector('.tl-row .stop-card')
    if (!card) return { error: 'no stop card' }
    const cs = getComputedStyle(card)
    const main = card.querySelector('.stop-main')
    const body = card.querySelector('.stop-body')
    const top = card.querySelector('.stop-toprow')
    const tile = card.querySelector('.stop-tile')
    const foot = card.querySelector('.stop-foot, .stop-actions, .stop-tools')
    const r = el => el ? el.getBoundingClientRect() : null
    const cr = card.getBoundingClientRect()
    const row = card.closest('.tl-row')
    const rowRect = row?.getBoundingClientRect()
    const rcs = row ? getComputedStyle(row) : null
    const chain = []
    let el = row?.parentElement
    while (el && chain.length < 6) {
      const s = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      chain.push({
        cls: el.className || el.tagName.toLowerCase(),
        w: Math.round(b.width),
        left: Math.round(b.left),
        pad: `${s.paddingLeft}/${s.paddingRight}`,
      })
      el = el.parentElement
    }
    return {
      card: { w: Math.round(cr.width), h: Math.round(cr.height), left: Math.round(cr.left) },
      row: rowRect ? {
        w: Math.round(rowRect.width), left: Math.round(rowRect.left), right: Math.round(rowRect.right),
        cols: rcs.gridTemplateColumns, gap: rcs.gap, justify: rcs.justifyItems,
      } : null,
      cardStyle: { margin: getComputedStyle(card).margin, width: getComputedStyle(card).width, justifySelf: getComputedStyle(card).justifySelf },
      chain,
      widths: {
        main: main ? Math.round(r(main).width) : 0,
        body: body ? Math.round(r(body).width) : 0,
        toprow: top ? Math.round(r(top).width) : 0,
      },
      style: {
        display: cs.display,
        minHeight: cs.minHeight,
        height: cs.height,
        padding: cs.padding,
        gap: cs.gap,
        alignItems: cs.alignItems,
        gridTemplateColumns: cs.gridTemplateColumns,
      },
      main: main ? { h: Math.round(r(main).height), display: getComputedStyle(main).display, cols: getComputedStyle(main).gridTemplateColumns, gap: getComputedStyle(main).gap } : null,
      body: body ? { h: Math.round(r(body).height), display: getComputedStyle(body).display, gap: getComputedStyle(body).gap } : null,
      top: top ? { h: Math.round(r(top).height), display: getComputedStyle(top).display, wrap: getComputedStyle(top).flexWrap } : null,
      tile: tile ? { w: Math.round(r(tile).width), h: Math.round(r(tile).height) } : null,
      foot: foot ? { h: Math.round(r(foot).height), cls: foot.className } : null,
      children: [...card.children].map(c => ({ cls: c.className, h: Math.round(r(c).height) })),
      bodyChildren: body ? [...body.children].map(c => ({ cls: c.className, h: Math.round(r(c).height) })) : [],
    }
  })
  console.log(JSON.stringify(out, null, 1))
  await page.locator('.tl-row').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `dev/_stop-card-${W}.png` })
  const end = page.locator('.tl-end').last()
  if (await end.count()) {
    await end.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `dev/_stop-end-${W}.png` })
  }
} finally {
  await browser.close()
}
