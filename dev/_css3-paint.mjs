// CSS-3 painted comparison: screenshot representative controls before and after.
//
// Computed values cannot prove clipping, stacking, focus visibility or the
// final appearance. This captures the same controls with fonts loaded, at an
// identical viewport, theme, content and state, and writes a side-by-side diff
// plus the raw images.
import fs from 'node:fs'
import path from 'node:path'

const [beforePath, afterPath, outDir] = process.argv.slice(2)
if (!beforePath || !afterPath || !outDir) {
  console.error('usage: node dev/_css3-paint.mjs <before.css> <after.css> <outDir>')
  process.exit(2)
}
fs.mkdirSync(outDir, { recursive: true })

const { chromium } = await import('playwright-core')

async function launch() {
  const attempts = [
    { channel: 'chrome' },
    ...(process.env.CHROME_PATH ? [{ executablePath: process.env.CHROME_PATH }] : []),
    { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
  ]
  let last
  for (const opts of attempts) {
    try {
      return await chromium.launch({ headless: true, ...opts })
    } catch (e) {
      last = e
    }
  }
  throw new Error(`no Chrome found (${last?.message ?? 'unknown'})`)
}

// A few cases, each covering a distinct risk.
const CASES = [
  {
    id: 'button-focus-visible',
    risk: 'focus ring visibility on a filled control',
    html: `<div class="wrap"><button class="btn btn-primary" id="t">Save trip</button></div>`,
    focus: '#t',
    theme: 'light',
    width: 640,
  },
  {
    id: 'button-phone-sm',
    risk: 'scale and tap target at 390px',
    html: `<div class="wrap"><button class="btn btn-sm">Small</button><button class="btn">Default</button><button class="btn btn-lg">Large label that wraps</button></div>`,
    theme: 'light',
    width: 390,
  },
  {
    id: 'input-invalid-focus',
    risk: 'invalid border plus focus ring stacking',
    html: `<div class="wrap"><div class="field"><label class="label">Budget</label><input class="input" id="t" aria-invalid="true" value="0"><span class="hint-text">Must be above zero.</span></div></div>`,
    focus: '#t',
    theme: 'light',
    width: 640,
  },
  {
    id: 'field-dark-disabled',
    risk: 'disabled opacity and contrast in dark',
    html: `<div class="wrap"><div class="field"><label class="label">Guests</label><input class="input" value="4" disabled><span class="hint-text">Locked by the plan.</span></div></div>`,
    theme: 'dark',
    width: 640,
  },
  {
    id: 'input-clipping-phone',
    risk: 'text clipping and overflow inside a narrow field',
    html: `<div class="wrap"><div class="field"><label class="label">Very long label that should wrap rather than clip its field</label><input class="input" value="A very long value that may clip"><span class="hint-text">Long hint copy that may wrap to two lines.</span></div></div>`,
    theme: 'light',
    width: 320,
  },
  {
    id: 'card-shadow-border',
    risk: 'shadow and hairline border on the static card',
    html: `<div class="wrap"><div class="card"><h3>Day 1</h3><p>Two stops, 120 km.</p></div></div>`,
    theme: 'light',
    width: 640,
  },
  {
    id: 'card-route-snap-dark',
    risk: 'route-snap gradient and transparent border in dark',
    html: `<div class="wrap"><div class="card route-snap"><h3>Goa to Gokarna</h3><p>310 km, 6 h.</p></div></div>`,
    theme: 'dark',
    width: 640,
  },
  {
    id: 'card-nested-overflow-phone',
    risk: 'nested content and overflow at 390px',
    html: `<div class="wrap"><div class="card"><h3>A long card title that may wrap</h3><hr class="divider"><p style="white-space:nowrap">A line long enough to test whether the card clips it.</p></div></div>`,
    theme: 'light',
    width: 390,
  },
  {
    id: 'ghost-in-page-scope',
    risk: 'page-scoped ghost, outline and large keep their page padding and radius',
    html: `<div class="ex-page"><div class="wrap"><button class="btn btn-ghost">Ghost</button><button class="btn btn-outline">Outline</button><button class="btn btn-lg">Large label</button></div></div>`,
    theme: 'light',
    width: 640,
  },
  {
    id: 'hero-primary-dark-ink',
    risk: 'hero primary keeps white ink in dark mode',
    html: `<div class="hero"><div class="wrap"><button class="btn btn-primary" id="t">Start</button><button class="btn btn-saffron">Browse</button></div></div>`,
    focus: '#t',
    theme: 'dark',
    width: 640,
  },
  {
    id: 'avatar-tones-and-stack',
    risk: 'circular clip, tone fill and ink, and the overlapped member stack',
    html: `<div class="wrap"><div class="member-stack"><span class="avatar tone-sea">AB</span><span class="avatar tone-marigold">CD</span><span class="avatar tone-bloom">EF</span><span class="avatar lg">GH</span></div></div>`,
    theme: 'dark',
    width: 640,
  },
]

const page = (css, c) =>
  `<!doctype html><html data-theme="${c.theme}"><head><style>${css}</style></head>
   <body style="margin:0;padding:16px;background:var(--bg);color:var(--text);font-family:var(--font-body)">
   ${c.html}</body></html>`

const browser = await launch()
const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8')

const report = []
for (const c of CASES) {
  const shots = {}
  for (const [label, css] of [['before', beforeCss], ['after', afterCss]]) {
    const p = await browser.newPage({ viewport: { width: c.width, height: 420 }, deviceScaleFactor: 2 })
    await p.setContent(page(css, c), { waitUntil: 'load' })
    // Fonts must be loaded or the capture compares fallback metrics.
    await p.evaluate(() => document.fonts.ready)
    // Freeze motion before the capture. A breathing glow otherwise lands at a
    // different phase in each build and reads as a one-step colour difference.
    await p.addStyleTag({
      content:
        '*, *::before, *::after { animation: none !important; transition: none !important; }',
    })
    await p.waitForTimeout(250)
    if (c.focus) await p.focus(c.focus)
    await p.waitForTimeout(200)
    const file = path.join(outDir, `${c.id}-${label}.png`)
    await p.screenshot({ path: file })
    shots[label] = file
    await p.close()
  }

  // Pixel compare the two captures in Node. A browser cannot fetch file:// URLs,
  // so the comparison runs here rather than inside the page.
  const sharp = (await import('sharp')).default
  const [rawA, rawB] = await Promise.all([
    sharp(shots.before).raw().toBuffer({ resolveWithObject: true }),
    sharp(shots.after).raw().toBuffer({ resolveWithObject: true }),
  ])
  let result
  if (rawA.info.width !== rawB.info.width || rawA.info.height !== rawB.info.height) {
    result = { same: false, reason: `size ${rawA.info.width}x${rawA.info.height} vs ${rawB.info.width}x${rawB.info.height}` }
  } else {
    const ch = rawA.info.channels
    let diff = 0
    let maxDelta = 0
    for (let i = 0; i < rawA.data.length; i += ch) {
      let delta = 0
      for (let c = 0; c < ch; c++) delta = Math.max(delta, Math.abs(rawA.data[i + c] - rawB.data[i + c]))
      if (delta > 0) diff++
      if (delta > maxDelta) maxDelta = delta
    }
    result = { same: diff === 0, diff, maxDelta, pixels: rawA.data.length / ch }
  }

  report.push({ id: c.id, risk: c.risk, ...result, before: shots.before, after: shots.after })
  const verdict = result.same ? 'IDENTICAL' : `${result.diff} px differ (max delta ${result.maxDelta})`
  console.log(`${c.id.padEnd(24)} ${verdict}   ${c.risk}`)
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1))
const differing = report.filter((r) => !r.same).length
console.log(`\ncases=${report.length} differing=${differing}`)
process.exit(differing ? 1 : 0)
