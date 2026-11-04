// Scratch: before/after of the phone stop card, with only the stop-card
// section of phone.css removed for the "before" shot.
import fs from 'node:fs'
import { launchChrome } from './_css3-compare-lib.mjs'

const browser = await launchChrome()
const shots = {}
try {
  for (const mode of ['before', 'after']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    await page.goto('http://localhost:5180/dev/overview-fixture.html?tab=timeline&theme=light', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('.day-header', { timeout: 20000 })
    await page.waitForTimeout(800)
    await page.locator('.day-collapse').first().click()
    await page.waitForTimeout(900)

    if (mode === 'before') {
      const cut = await page.evaluate(() => {
        const tag = [...document.querySelectorAll('style[data-vite-dev-id]')]
          .find(t => (t.getAttribute('data-vite-dev-id') ?? '').endsWith('src/styles.css'))
        if (!tag) return 0
        const txt = tag.textContent
        const marker = txt.indexOf('A stop card takes the full phone width')
        if (marker === -1) return 0
        const start = txt.lastIndexOf('/*', marker)
        tag.textContent = txt.slice(0, start)
        return 1
      })
      if (cut === 0) throw new Error('stop-card block not found')
      await page.waitForTimeout(300)
    }

    const row = page.locator('.tl-row').first()
    await row.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const file = `dev/_stop-${mode}.png`
    await row.screenshot({ path: file })
    const box = await row.boundingBox()
    shots[mode] = { file, w: Math.round(box.width), h: Math.round(box.height) }
    await page.close()
  }
} finally {
  await browser.close()
}

const b64 = p => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; padding:26px 28px; background:#0b0d11; color:#e8edf5; width:880px;
         font-family:"Segoe UI",system-ui,sans-serif; }
  h1 { margin:0 0 3px; font-size:20px; }
  p { margin:0 0 18px; font-size:12.5px; color:#8f9bb3; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
  figure { margin:0; background:#131722; border:1px solid #222838; border-radius:10px; padding:12px; }
  figcaption { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#8f9bb3; margin-bottom:8px; }
  img { display:block; width:100%; border-radius:6px; background:#f3f1ec; }
  .m { font-size:11.5px; color:#8f9bb3; margin-top:8px; }
</style></head><body>
  <h1>A stop card on a phone, 390px</h1>
  <p>Only the stop-card block of phone.css is removed for "Before". Everything else in the branch stays.</p>
  <div class="pair">
    <figure><figcaption>Before</figcaption><img src="${b64(shots.before.file)}">
      <div class="m">${shots.before.w} x ${shots.before.h}px</div></figure>
    <figure><figcaption>After</figcaption><img src="${b64(shots.after.file)}">
      <div class="m">${shots.after.w} x ${shots.after.h}px</div></figure>
  </div>
</body></html>`

const page = await (await launchChrome()).newPage({ viewport: { width: 880, height: 900 }, deviceScaleFactor: 2 })
await page.setContent(html, { waitUntil: 'load' })
await page.waitForTimeout(300)
await page.screenshot({ path: 'dev/_stop-before-after.png', fullPage: true })
console.log('dev/_stop-before-after.png', JSON.stringify(shots))
await page.context().browser().close()
