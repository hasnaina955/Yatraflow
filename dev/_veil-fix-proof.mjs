// Scratch: prove the fix before changing source. Move the veil inside the media
// in the live DOM, then re-measure the corner rim with the same method.
import sharp from 'sharp'
import { launchChrome } from './_css3-compare-lib.mjs'

const WIDTH = 390
const THEME = 'dark'

async function rimFor(browser, { theme, width, reduce, move }) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 3, reducedMotion: reduce ? 'reduce' : 'no-preference' })
  try {
    await page.goto(`http://127.0.0.1:5178/dev/overview-fixture.html?tab=overview&theme=${theme}`, { waitUntil: 'domcontentloaded' })
    await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
    await page.waitForSelector('.yf-cover-img', { timeout: 15000 })
    if (move) {
      // Put the veil under the media's rounded clip, and drop its own radius so the
      // media does the clipping (exactly like the image).
      await page.evaluate(() => {
        const media = document.querySelector('.yf-cover-media')
        const veil = document.querySelector('.yf-cover-veil')
        if (media && veil) {
          media.appendChild(veil)
          veil.style.borderRadius = '0'
        }
      })
    }
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
    let at = null
    for (let y = 6; y < 80; y++) {
      let first = -1
      for (let x = 0; x < info.width; x++) if (lum(px(x, y)) > 30) { first = x; break }
      if (first < 0) continue
      const interior = px(Math.min(info.width - 1, first + 30), y)
      const delta = lum(px(first, y)) - lum(interior)
      if (delta > worst) { worst = delta; at = { y, x: first } }
    }
    return { rim: +worst.toFixed(1), at }
  } finally {
    await page.close()
  }
}

const browser = await launchChrome()
const out = []
try {
  for (const theme of ['dark', 'light']) {
    for (const width of [390, 1440]) {
      for (const reduce of [false, true]) {
        const before = await rimFor(browser, { theme, width, reduce, move: false })
        const after = await rimFor(browser, { theme, width, reduce, move: true })
        out.push({ theme, width, reduced: reduce, before: before.rim, after: after.rim })
      }
    }
  }
} finally {
  await browser.close()
}
console.log(JSON.stringify(out, null, 1))
