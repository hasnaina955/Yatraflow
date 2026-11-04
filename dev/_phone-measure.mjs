// Scratch: report whether the phone rules reach the real workspace DOM.
import { launchChrome } from './_css3-compare-lib.mjs'

const browser = await launchChrome()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await page.goto('http://localhost:5180/dev/overview-fixture.html?tab=timeline&theme=dark', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('.day-header', { timeout: 20000 })
  await page.waitForTimeout(1000)

  const out = await page.evaluate(() => {
    const bar = document.querySelector('.yf-tabbar')
    const btn = bar?.querySelector('.tab-btn')
    const root = document.querySelector('.tl-tab-root')
    const ancestors = []
    let el = bar
    while (el && ancestors.length < 8) {
      ancestors.push(el.tagName.toLowerCase() + '.' + [...el.classList].join('.'))
      el = el.parentElement
    }
    const sheetHit = [...document.styleSheets].some(s => {
      try { return [...s.cssRules].some(r => r.cssText?.includes('Phone optimisations')) } catch { return false }
    })
    return {
      tabbarClass: bar?.className ?? '(none)',
      tabbarScrollW: bar?.scrollWidth,
      tabbarClientW: bar?.clientWidth,
      btnFontSize: btn ? getComputedStyle(btn).fontSize : '(none)',
      btnPadding: btn ? getComputedStyle(btn).padding : '(none)',
      ancestors,
      hasTlTabRoot: Boolean(root),
      rootPaddingBottom: root ? getComputedStyle(root).paddingBottom : '(none)',
      pillCount: document.querySelectorAll('.day-warn-pill').length,
      sheetHit,
      tabs: bar ? [...bar.querySelectorAll('.tab-btn')].map(b => ({
        text: b.textContent.trim(),
        w: Math.round(b.getBoundingClientRect().width),
        fs: getComputedStyle(b).fontSize,
        pad: getComputedStyle(b).padding,
        minW: getComputedStyle(b).minWidth,
      })) : [],
      barGap: bar ? getComputedStyle(bar).gap : '(none)',
      barPad: bar ? getComputedStyle(bar).padding : '(none)',
    }
  })
  console.log(JSON.stringify(out, null, 2))
} finally {
  await browser.close()
}
