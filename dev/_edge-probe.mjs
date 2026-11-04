// Scratch: capture the cover's left edge at high DPI and report, per pixel column,
// where the band starts and whether a seam (a line whose colour fits neither the
// page background nor the band interior) sits on the perimeter.
//
//   node dev/_edge-probe.mjs --width 390 --theme dark --motion no-preference --when rest
import fs from 'node:fs'
import { launchChrome } from './_css3-compare-lib.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
const WIDTH = Number(arg('width', '390'))
const THEME = arg('theme', 'dark')
const MOTION = arg('motion', 'no-preference')
const WHEN = arg('when', 'rest')           // rest | motion
const OUT = arg('out', '')
const TAB = arg('tab', 'overview')

const browser = await launchChrome()
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: 900 },
    deviceScaleFactor: 3,
    reducedMotion: MOTION,
  })
  await page.goto(`http://127.0.0.1:5178/dev/overview-fixture.html?tab=${TAB}&theme=${THEME}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => { document.documentElement.dataset.theme = t }, THEME)
  await page.waitForSelector('.yf-trip-head', { timeout: 15000 })

  if (WHEN === 'rest') {
    await page.waitForTimeout(2600)
  } else {
    // Mid-settle: the artwork is still scaled.
    await page.waitForTimeout(260)
  }

  const box = await page.evaluate(() => {
    const h = document.querySelector('.yf-trip-head').getBoundingClientRect()
    return { x: h.x, y: h.y, w: h.width, h: h.height }
  })
  // A tall, narrow strip over the left perimeter plus the gap and the card below.
  const clip = {
    x: Math.max(0, Math.round(box.x) - 12),
    y: Math.max(0, Math.round(box.y) - 12),
    width: 26,
    height: Math.round(box.h) + 40,
  }
  const file = OUT || `dev/_edge-${WIDTH}-${THEME}-${MOTION}-${WHEN}.png`
  await page.screenshot({ path: file, clip })

  // Read the pixels back through the browser so no extra dependency is needed.
  const analysis = await page.evaluate(async ({ clip, theme }) => {
    // Re-render the same clip into a canvas via drawWindow is not available, so
    // compare computed paint instead: the geometry and paint of the edge layers.
    const head = document.querySelector('.yf-trip-head')
    const media = document.querySelector('.yf-cover-media')
    const veil = document.querySelector('.yf-cover-veil')
    const img = document.querySelector('.yf-cover-img')
    const card = document.querySelector('.yf-surface')
    const cs = (el) => el ? getComputedStyle(el) : null
    const h = head.getBoundingClientRect()
    const m = media.getBoundingClientRect()
    const v = veil?.getBoundingClientRect()
    const c = card?.getBoundingClientRect()
    const round = (n) => Math.round(n * 1000) / 1000
    return {
      theme,
      head: { x: round(h.x), y: round(h.y), w: round(h.width), radius: cs(head).borderRadius, border: cs(head).borderTopWidth, shadow: cs(head).boxShadow.slice(0, 60), overflow: cs(head).overflow, bg: cs(head).backgroundColor },
      media: { x: round(m.x), w: round(m.width), radius: cs(media).borderRadius, overflow: cs(media).overflow, bg: cs(media).backgroundColor },
      veil: v ? { x: round(v.x), w: round(v.width), radius: cs(veil).borderRadius } : null,
      img: { x: round(img.getBoundingClientRect().x), w: round(img.getBoundingClientRect().width), transform: cs(img).transform, radius: cs(img).borderRadius },
      card: c ? { x: round(c.x), w: round(c.width), radius: cs(card).borderRadius, border: cs(card).borderTopWidth, borderColor: cs(card).borderTopColor } : null,
      mediaMinusHead: { dx: round(m.x - h.x), dw: round(m.width - h.width) },
      imgMinusMedia: round(img.getBoundingClientRect().x - m.x),
      dpr: window.devicePixelRatio,
    }
  }, { clip, theme: THEME })

  console.log(JSON.stringify({ file, clip, ...analysis }, null, 1))
} finally {
  await browser.close()
}
