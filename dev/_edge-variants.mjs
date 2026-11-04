// Scratch: measure the 1px rim along the cover's rounded corner under candidate
// fixes. The rim is read as luminance of the first painted pixel of the arc
// against the artwork interior, at 3x DPR.
import sharp from 'sharp'
import { launchChrome } from './_css3-compare-lib.mjs'

const WIDTH = 390
const THEME = 'dark'

const VARIANTS = [
  ['baseline', ''],
  ['veil-hidden', '.yf-page .yf-trip-head > .yf-cover-veil { display: none !important; }'],
  ['img-hidden', '.yf-page .yf-cover-media > .yf-cover-img { visibility: hidden !important; }'],
  ['media-hidden', '.yf-page .yf-trip-head > .yf-cover-media { display: none !important; }'],
  ['veil-inset-neg', '.yf-page .yf-trip-head > .yf-cover-veil { inset: -2px !important; }'],
]

const browser = await launchChrome()
const results = []
try {
  for (const [name, css] of VARIANTS) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 3, reducedMotion: 'no-preference' })
    try {
      await page.goto(`http://127.0.0.1:5178/dev/overview-fixture.html?tab=overview&theme=${THEME}`, { waitUntil: 'domcontentloaded' })
      await page.evaluate((t) => { document.documentElement.dataset.theme = t }, THEME)
      await page.waitForSelector('.yf-cover-img', { timeout: 15000 })
      if (css) await page.addStyleTag({ content: css })
      await page.waitForTimeout(2600) // settle: transform none
      const box = await page.evaluate(() => {
        const h = document.querySelector('.yf-trip-head').getBoundingClientRect()
        return { x: h.x, y: h.y, h: h.height }
      })
      const clip = { x: Math.max(0, Math.round(box.x) - 6), y: Math.max(0, Math.round(box.y) - 6), width: 24, height: 90 }
      const buf = await page.screenshot({ clip })
      const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]] }
      const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

      // Walk rows through the corner; for each row take the first painted pixel
      // and the interior pixel 10 CSS px (30 device px) further in.
      let worstRim = 0
      let worstAt = null
      for (let y = 6; y < 80; y++) {
        let firstNonBg = -1
        for (let x = 0; x < info.width; x++) {
          const p = px(x, y)
          if (lum(p) > 30) { firstNonBg = x; break }
        }
        if (firstNonBg < 0) continue
        const interior = px(Math.min(info.width - 1, firstNonBg + 30), y)
        const rim = lum(px(firstNonBg, y))
        const delta = rim - lum(interior)
        if (delta > worstRim) { worstRim = delta; worstAt = { y, x: firstNonBg, rim: +rim.toFixed(1), interior: +lum(interior).toFixed(1) } }
      }
      results.push({ variant: name, worstRimDelta: +worstRim.toFixed(1), at: worstAt })
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
}
console.log(JSON.stringify(results, null, 1))
