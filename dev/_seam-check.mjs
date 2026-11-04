// Scratch: contrast-aware seam test for the cover's rounded perimeter.
//
// A normal antialiased edge lies BETWEEN the page colour and the interior colour,
// so it can never be brighter than both. That is the test: flag an edge pixel only
// when it exceeds max(page, interior) by more than a tolerance. This is what the
// earlier interior-only comparison got wrong: in the light theme the page is
// near-white (L243), so a clean edge scored as a large "rim".
//
//   node dev/_seam-check.mjs [--width 390] [--theme dark] [--motion no-preference]
import sharp from 'sharp'
import { launchChrome } from './_css3-compare-lib.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
const WIDTH = Number(arg('width', '390'))
const THEME = arg('theme', 'dark')
const MOTION = arg('motion', 'no-preference')
const WHEN = arg('when', 'rest')
const TOLERANCE = Number(arg('tol', '6'))

const browser = await launchChrome()
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 3, reducedMotion: MOTION })
  await page.goto(`http://127.0.0.1:5178/dev/overview-fixture.html?tab=overview&theme=${THEME}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => { document.documentElement.dataset.theme = t }, THEME)
  await page.waitForSelector('.yf-cover-img', { timeout: 15000 })
  await page.waitForTimeout(WHEN === 'rest' ? 2600 : 260)

  const box = await page.evaluate(() => {
    const h = document.querySelector('.yf-trip-head').getBoundingClientRect()
    return { x: h.x, y: h.y, h: h.height }
  })
  const clip = { x: Math.max(0, Math.round(box.x) - 6), y: Math.max(0, Math.round(box.y) - 6), width: 24, height: 90 }
  const buf = await page.screenshot({ clip })
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]] }
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

  let worst = 0
  let at = null
  let flagged = 0
  for (let y = 4; y < Math.min(86, info.height); y++) {
    // Page colour: the first pixel of the strip.
    const pageL = lum(px(0, y))
    let first = -1
    for (let x = 0; x < info.width; x++) if (Math.abs(lum(px(x, y)) - pageL) > 12) { first = x; break }
    if (first < 0) continue
    const edgeL = lum(px(first, y))
    const interiorL = lum(px(Math.min(info.width - 1, first + 30), y))
    const ceiling = Math.max(pageL, interiorL)
    const over = edgeL - ceiling
    if (over > TOLERANCE) flagged++
    if (over > worst) { worst = over; at = { y, x: first, edge: +edgeL.toFixed(1), page: +pageL.toFixed(1), interior: +interiorL.toFixed(1) } }
  }
  console.log(JSON.stringify({
    width: WIDTH, theme: THEME, motion: MOTION, when: WHEN,
    seamPixels: flagged, worstOverCeiling: +worst.toFixed(1), at,
    verdict: flagged ? 'SEAM' : 'clean',
  }, null, 1))
} finally {
  await browser.close()
}
