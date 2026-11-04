// Scratch: capture the phone layout from the real workspace fixture, with and
// without the phone.css sheet, so a before/after pair can be shown.
//
//   node dev/_phone-shot.mjs <before|after> <out.png> [--scroll <px>]
import { launchChrome } from './_css3-compare-lib.mjs'

const MODE = process.argv[2] ?? 'after'
const OUT = process.argv[3] ?? `dev/_phone-${MODE}.png`
const SCROLL = Number(process.argv[4] ?? '0')
const CLIP = process.argv[5] ?? ''
const WIDTH = Number(process.env.W ?? '390')

const browser = await launchChrome()
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: 844 },
    deviceScaleFactor: 2,
  })
  await page.goto('http://localhost:5180/dev/overview-fixture.html?tab=timeline&theme=dark', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('.day-header', { timeout: 20000 })
  await page.waitForTimeout(1200)

  if (MODE === 'debug') {
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('style')].map(s => s.getAttribute('data-vite-dev-id') ?? '(none)'))
    console.log(ids.join('\n'))
    process.exit(0)
  }

  if (MODE === 'before') {
    const dropped = await page.evaluate(() => {
      const tag = [...document.querySelectorAll('style[data-vite-dev-id]')]
        .find(t => (t.getAttribute('data-vite-dev-id') ?? '').endsWith('src/styles.css'))
      if (!tag) return 0
      const txt = tag.textContent
      const marker = txt.indexOf('Phone optimisations - issue #809')
      if (marker === -1) return 0
      const start = txt.lastIndexOf('/*', marker)
      tag.textContent = txt.slice(0, start)
      return 1
    })
    if (dropped === 0) throw new Error('phone.css block not found in the styles.css tag')
    await page.waitForTimeout(300)
  }

  const measured = await page.evaluate(() => {
    const flex = document.querySelector('.day-header .tl-stop-flex')
    return { titleFloor: flex ? getComputedStyle(flex).minWidth : '(no day header)' }
  })
  console.log(`title floor: ${measured.titleFloor}`)

  if (SCROLL) {
    await page.evaluate(y => window.scrollTo(0, y), SCROLL)
    await page.waitForTimeout(400)
  }

  let clip
  if (CLIP === 'tabs') {
    const box = await page.locator('.yf-tabbar').first().boundingBox()
    clip = { x: 0, y: Math.max(0, box.y - 10), width: WIDTH, height: Math.round(box.height) + 20 }
  } else if (CLIP === 'card' || CLIP === 'card2') {
    const box = await page.locator('.day-section').nth(CLIP === 'card2' ? 1 : 0).boundingBox()
    clip = { x: 8, y: Math.max(0, box.y - 6), width: WIDTH - 16, height: Math.min(Math.round(box.height) + 12, 640) }
  } else if (CLIP === 'bottom') {
    clip = { x: 0, y: 844 - 360, width: WIDTH, height: 360 }
  }
  await page.screenshot({ path: OUT, ...(clip ? { clip } : {}) })
  console.log(OUT)
} finally {
  await browser.close()
}
