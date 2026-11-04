// Scratch: record real per-frame motion samples for the trip Overview entrance.
//
// Records, once per animation frame, the painted geometry and the computed
// animation state of the cover band, its media, the page root and the tab panel.
// A single screenshot cannot show which element is still moving or for how long;
// this can.
//
//   node dev/_motion-sample.mjs [--tab overview] [--motion no-preference|reduce]
//                               [--width 1440] [--theme light|dark] [--json <path>]
import fs from 'node:fs'
import { launchChrome } from './_css3-compare-lib.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const TAB = arg('tab', 'overview')
const MOTION = arg('motion', 'no-preference')
const WIDTH = Number(arg('width', '1440'))
const THEME = arg('theme', 'light')
const OUT = arg('json', '')

const URL = `http://127.0.0.1:5178/dev/overview-fixture.html?tab=${TAB}&theme=${THEME}`

// Runs inside the page, before any app script.
function sampler() {
  const targets = {
    page: '.yf-page',
    workspace: '.yf-workspace',
    head: '.yf-trip-head',
    media: '.yf-trip-head > .yf-cover-media',
    content: '.yf-trip-head > .yf-cover-content',
    panel: '.tab-panel',
    tabbar: '.yf-tabbar',
  }
  const read = () => {
    const out = {}
    for (const [key, sel] of Object.entries(targets)) {
      const el = document.querySelector(sel)
      if (!el) { out[key] = null; continue }
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      out[key] = {
        // Painted box: a transform that is not clipped shows up here.
        x: Math.round(r.x * 100) / 100,
        y: Math.round(r.y * 100) / 100,
        w: Math.round(r.width * 100) / 100,
        h: Math.round(r.height * 100) / 100,
        transform: cs.transform,
        opacity: cs.opacity,
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
        animationDelay: cs.animationDelay,
        animationFillMode: cs.animationFillMode,
        transitionProperty: cs.transitionProperty,
        transitionDuration: cs.transitionDuration,
      }
    }
    return out
  }
  const frames = []
  const start = performance.now()
  let raf = 0
  const tick = () => {
    frames.push({ t: Math.round((performance.now() - start) * 10) / 10, ...read() })
    if (performance.now() - start < 4200) raf = requestAnimationFrame(tick)
    else window.__motionSamples = frames
  }
  const begin = () => {
    cancelAnimationFrame(raf)
    frames.length = 0
    raf = requestAnimationFrame(tick)
  }
  window.__motionBegin = begin
  // Start as soon as the first element appears, so mount time is captured.
  const wait = () => {
    if (document.querySelector('.yf-trip-head') && document.querySelector('.tab-panel')) begin()
    else setTimeout(wait, 16)
  }
  if (document.readyState === 'complete') wait()
  else window.addEventListener('load', wait)
}

const browser = await launchChrome()
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 1000 }, reducedMotion: MOTION })
  await page.addInitScript(sampler)
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate((t) => { document.documentElement.dataset.theme = t }, THEME)
  // Wait for the sampler to finish its window.
  await page.waitForFunction(() => Array.isArray(window.__motionSamples) && window.__motionSamples.length > 10, null, { timeout: 15000 })
  const frames = await page.evaluate(() => window.__motionSamples)

  // Summarise: how long does each target keep changing, and how far does the
  // cover's painted box drift from the band's own box?
  const sig = (f, key) => (f[key] ? `${f[key].transform}|${f[key].opacity}|${f[key].w}x${f[key].h}|${f[key].x},${f[key].y}` : 'null')
  const summary = {}
  for (const key of ['page', 'head', 'media', 'content', 'panel', 'tabbar']) {
    let lastChange = 0
    for (let i = 1; i < frames.length; i++) {
      if (sig(frames[i], key) !== sig(frames[i - 1], key)) lastChange = frames[i].t
    }
    const first = frames.find((f) => f[key])
    summary[key] = {
      present: Boolean(first),
      lastChangeMs: Math.round(lastChange),
      animation: first ? `${first[key].animationName} ${first[key].animationDuration} delay ${first[key].animationDelay} fill ${first[key].animationFillMode}` : null,
      transition: first ? `${first[key].transitionProperty} ${first[key].transitionDuration}` : null,
    }
  }

  // Cover paint vs band box, per frame where both exist.
  const drift = []
  for (const f of frames) {
    if (!f.head || !f.media) continue
    drift.push({
      t: f.t,
      dx: Math.round((f.media.x - f.head.x) * 100) / 100,
      dw: Math.round((f.media.w - f.head.w) * 100) / 100,
      dh: Math.round((f.media.h - f.head.h) * 100) / 100,
    })
  }
  const maxDrift = drift.reduce((m, d) => Math.max(m, Math.abs(d.dx), Math.abs(d.dw), Math.abs(d.dh)), 0)
  const lastDrift = drift.filter((d) => Math.abs(d.dx) > 0.5 || Math.abs(d.dw) > 0.5).pop()

  const report = {
    url: URL, tab: TAB, motion: MOTION, width: WIDTH, theme: THEME,
    frames: frames.length,
    summary,
    coverDrift: { maxPx: Math.round(maxDrift * 100) / 100, lastOffsetFrameMs: lastDrift ? lastDrift.t : 0 },
    firstFrames: frames.slice(0, 3).map((f) => ({ t: f.t, media: f.media?.transform, page: f.page?.opacity, panel: f.panel?.opacity })),
  }
  console.log(JSON.stringify(report, null, 1))
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ report, frames }, null, 1))
} finally {
  await browser.close()
}
