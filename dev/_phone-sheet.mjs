// Scratch: compose the before/after comparison sheet from the crops.
import fs from 'node:fs'
import { launchChrome } from './_css3-compare-lib.mjs'

const b64 = p => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`

const rows = [
  { title: 'Trip section rail', note: 'more of Group input shows before the cut', before: '_c-tabs-before.png', after: '_c-tabs-after.png' },
  { title: 'Day card header', note: 'long names show in full, fold control on the card edge', before: '_c-card2-before.png', after: '_c-card2-after.png' },
  { title: 'End of the day list', note: 'last card clears the floating Add button', before: '_c-bottom-before.png', after: '_c-bottom-after.png' },
]

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px 30px 34px; background: #0b0d11; color: #e8edf5;
         font-family: "Segoe UI", system-ui, sans-serif; width: 980px; }
  h1 { margin: 0 0 4px; font-size: 21px; letter-spacing: .2px; }
  .sub { margin: 0 0 22px; font-size: 12.5px; color: #8f9bb3; }
  .row { margin-bottom: 22px; }
  .row h2 { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #e8edf5; }
  .row h2 span { color: #8f9bb3; font-weight: 400; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  figure { margin: 0; background: #131722; border: 1px solid #222838; border-radius: 10px;
           padding: 10px; }
  figcaption { font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
               color: #8f9bb3; margin-bottom: 7px; }
  img { display: block; width: 100%; border-radius: 6px; }
</style></head><body>
  <h1>YatraFlow on a phone, 390px</h1>
  <p class="sub">Real TripWorkspace fixture, dark theme, 390x844. Before = phone.css removed from the same bundle.</p>
  ${rows.map(r => `
    <section class="row">
      <h2>${r.title} <span>- ${r.note}</span></h2>
      <div class="pair">
        <figure><figcaption>Before</figcaption><img src="${b64('dev/' + r.before)}"></figure>
        <figure><figcaption>After</figcaption><img src="${b64('dev/' + r.after)}"></figure>
      </div>
    </section>`).join('')}
</body></html>`

const browser = await launchChrome()
try {
  const page = await browser.newPage({ viewport: { width: 980, height: 800 }, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'dev/_phone-before-after.png', fullPage: true })
  console.log('dev/_phone-before-after.png')
} finally {
  await browser.close()
}
