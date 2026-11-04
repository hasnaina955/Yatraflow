// Scratch: test whether bleeding the artwork past the clip removes the remaining
// dark-theme seam (the bright band fill showing at the media's antialiased edge).
import sharp from 'sharp'
import { launchChrome } from './_css3-compare-lib.mjs'

const VARIANTS = [
  ['current', ''],
  ['img-bleed-1', '.yf-page .yf-cover-media > .yf-cover-img { inset: -1px !important; width: calc(100% + 2px) !important; height: calc(100% + 2px) !important; }'],
  ['img-bleed-2', '.yf-page .yf-cover-media > .yf-cover-img { inset: -2px !important; width: calc(100% + 4px) !important; height: calc(100% + 4px) !important; }'],
  ['media-bg-none', '.yf-page .yf-trip-head > .yf-cover-media { background: transparent !important; }'],
  ['media-bg-none+bleed1', '.yf-page .yf-trip-head > .yf-cover-media { background: transparent !important; } .yf-page .yf-cover-media > .yf-cover-img { inset: -1px !important; width: calc(100% + 2px) !important; height: calc(100% + 2px) !important; }'],
]

const browser = await launchChrome()
const out = []
try {
  for (const [name, css] of VARIANTS) {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3, reducedMotion: 'no-preference' })
    try {
      await page.goto('http://127.0.0.1:5178/dev/overview-fixture.html?tab=overview&theme=dark', { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
      await page.waitForSelector('.yf-cover-img', { timeout: 15000 })
      if (css) await page.addStyleTag({ content: css })
      await page.waitForTimeout(2600)
      const box = await page.evaluate(() => {
        const h = document.querySelector('.yf-trip-head').getBoundingClientRect()
        return { x: h.x, y: h.y }
      })
      const clip = { x: Math.max(0, Math.round(box.x) - 6), y: Math.max(0, Math.round(box.y) - 6), width: 24, height: 90 }
      const buf = await page.screenshot({ clip })
      const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]] }
      const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
      let worst = 0
      let flagged = 0
      for (let y = 4; y < Math.min(86, info.height); y++) {
        const pageL = lum(px(0, y))
        let first = -1
        for (let x = 0; x < info.width; x++) if (Math.abs(lum(px(x, y)) - pageL) > 12) { first = x; break }
        if (first < 0) continue
        const edgeL = lum(px(first, y))
        const interiorL = lum(px(Math.min(info.width - 1, first + 30), y))
        const over = edgeL - Math.max(pageL, interiorL)
        if (over > 6) flagged++
        if (over > worst) worst = over
      }
      out.push({ variant: name, seamPixels: flagged, worst: +worst.toFixed(1), verdict: flagged ? 'SEAM' : 'clean' })
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
}
console.log(JSON.stringify(out, null, 1))
