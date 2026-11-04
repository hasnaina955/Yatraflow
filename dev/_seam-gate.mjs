// Scratch: a principled seam gate for a rounded layer edge.
//
// At the perimeter, a pixel is a blend of the page behind and the layers inside,
// so it can never be BRIGHTER than the brightest layer actually present. That is
// the invariant: flag an edge pixel only when it exceeds
// max(page, band fill, artwork interior). Using the interior alone wrongly flags
// the band's own backdrop; using the page alone wrongly flags a clean edge in the
// light theme, where the page is near-white.
//
// `--sibling-veil` reproduces the pre-fix structure (veil as a rounded sibling of
// the media) so the gate can be shown to catch the original artifact.
import sharp from 'sharp'
import { launchChrome } from './_css3-compare-lib.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
const WIDTH = Number(arg('width', '390'))
const THEME = arg('theme', 'dark')
const MOTION = arg('motion', 'no-preference')
const WHEN = arg('when', 'rest')
const SIBLING = process.argv.includes('--sibling-veil')
const TOL = Number(arg('tol', '8'))

const browser = await launchChrome()
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 3, reducedMotion: MOTION })
  await page.goto(`http://127.0.0.1:5178/dev/overview-fixture.html?tab=overview&theme=${THEME}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => { document.documentElement.dataset.theme = t }, THEME)
  await page.waitForSelector('.yf-cover-img', { timeout: 15000 })
  if (SIBLING) {
    // Put the veil back as a rounded sibling, which is the reported defect.
    await page.evaluate(() => {
      const media = document.querySelector('.yf-cover-media')
      const head = document.querySelector('.yf-trip-head')
      const veil = document.querySelector('.yf-cover-veil')
      if (media && head && veil) {
        head.insertBefore(veil, media.nextSibling)
        veil.style.borderRadius = 'inherit'
        veil.style.zIndex = '1'
      }
    })
  }
  await page.waitForTimeout(WHEN === 'rest' ? 2600 : 260)

  const box = await page.evaluate(() => {
    const h = document.querySelector('.yf-trip-head').getBoundingClientRect()
    const band = getComputedStyle(document.querySelector('.yf-trip-head')).backgroundColor
    return { x: h.x, y: h.y, band }
  })
  const clip = { x: Math.max(0, Math.round(box.x) - 6), y: Math.max(0, Math.round(box.y) - 6), width: 24, height: 90 }
  const buf = await page.screenshot({ clip })
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]] }
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const m = box.band.match(/(\d+),\s*(\d+),\s*(\d+)/)
  const bandLum = m ? lum([+m[1], +m[2], +m[3]]) : 0

  let worst = 0
  let flagged = 0
  let at = null
  for (let y = 4; y < Math.min(86, info.height); y++) {
    const pageL = lum(px(0, y))
    let first = -1
    for (let x = 0; x < info.width; x++) if (Math.abs(lum(px(x, y)) - pageL) > 12) { first = x; break }
    if (first < 0) continue
    const edgeL = lum(px(first, y))
    const interiorL = lum(px(Math.min(info.width - 1, first + 30), y))
    const ceiling = Math.max(pageL, bandLum, interiorL)
    const over = edgeL - ceiling
    if (over > TOL) flagged++
    if (over > worst) { worst = over; at = { y, x: first, edge: +edgeL.toFixed(1), page: +pageL.toFixed(1), band: +bandLum.toFixed(1), interior: +interiorL.toFixed(1) } }
  }
  console.log(JSON.stringify({
    width: WIDTH, theme: THEME, motion: MOTION, when: WHEN, siblingVeil: SIBLING,
    bandLum: +bandLum.toFixed(1), seamPixels: flagged, worstOverCeiling: +worst.toFixed(1), at,
    verdict: flagged ? 'SEAM' : 'clean',
  }, null, 1))
} finally {
  await browser.close()
}
