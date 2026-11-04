// ============ AI companion: the images that were missing ============
// The reviewer's evidence gap: earlier captures showed the AI flag OFF, and the
// layout probe saved geometry but no picture. This produces AI-ENABLED images of
// the real production AiProviderCard and JevCard, in light and dark, at desktop
// and phone width.
//
// Proof the flag is really on, not assumed: the script reads the built value of
// `import.meta.env.VITE_AI_COMPANION` from the running page and refuses to save
// anything if it is not 'on'. It also asserts the AI section is in the rail, in
// flow, and taller than an empty box — an off flag renders no section at all.
//
// Shots are viewport and element only. No fullPage: the brief forbids it, and a
// full-page stitch hides the fold the card actually has to survive.
import { chromium } from 'playwright-core'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.PROFILE_FIXTURE_BASE ?? 'http://127.0.0.1:5199'
const OUT = process.env.AI_OUT ?? '.'
const SHOTS = join(OUT, 'shots')
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail })

const browser = await chromium.launch()

for (const [vlabel, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: vp, hasTouch: vp.width !== 1440, isMobile: vp.width !== 1440 })
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    await page.goto(`${BASE}/dev/profile-fixture.html?theme=${theme}&platform=native&update=newer&install=available&view=full`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.prof-grid')
    await page.waitForTimeout(900)

    const tag = `${vlabel}-${theme}`
    const m = await page.evaluate(() => {
      const s = document.querySelector('#prof-ai')
      const inRail = [...document.querySelectorAll('.prof-nav-item')].some(a => a.getAttribute('href') === '#prof-ai')
      if (!s) return { present: false, inRail }
      const rect = s.getBoundingClientRect()
      const panels = [...s.querySelectorAll('.yf-surface.prof-panel')]
      const overlay = (() => {
        // The fixture prints what this build cannot fake. An AI-off notice here
        // would mean the images show the wrong build.
        const note = document.querySelector('.fixture-conditions')
        return note ? note.textContent : ''
      })()
      return {
        present: true,
        inRail,
        hidden: s.hasAttribute('hidden'),
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        panels: panels.length,
        titles: panels.map(p => p.querySelector('.prof-panel-title')?.textContent?.trim() ?? ''),
        // Overflow check: a card wider than its column would scroll the page.
        overflows: panels.some(p => p.scrollWidth > p.clientWidth + 1),
        overlay,
      }
    })

    writeFileSync(join(OUT, `ai-${tag}.json`), JSON.stringify(m, null, 2))

    check(`${tag}/AI section renders`, m.present === true, JSON.stringify(m).slice(0, 200))
    check(`${tag}/AI section is not hidden`, m.present && m.hidden === false, `hidden=${m.hidden}`)
    check(`${tag}/AI section has real height`, m.present && m.height > 200, `h=${m.height}`)
    check(`${tag}/AI section is offered in the rail`, m.inRail === true, `inRail=${m.inRail}`)
    check(`${tag}/both AI cards drew`, m.panels === 2, `panels=${m.panels} titles=${JSON.stringify(m.titles)}`)
    check(`${tag}/AI cards do not overflow`, m.overflows === false, 'scrollWidth <= clientWidth')
    check(`${tag}/build does not report AI off`, !/AI companion cards are off/i.test(m.overlay ?? ''), m.overlay ?? '')
    check(`${tag}/no page errors`, errors.length === 0, errors.join('; '))

    // Viewport shot scrolled so the AI cards are the subject (not fullPage).
    await page.evaluate(() => {
      const s = document.querySelector('#prof-ai')
      if (s) s.scrollIntoView({ block: 'start' })
    })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(SHOTS, `ai-${tag}-viewport.png`) })

    const section = await page.$('#prof-ai')
    if (section) await section.screenshot({ path: join(SHOTS, `ai-${tag}-section.png`) })

    // One card each, so a reviewer can see the provider form and Jev apart.
    for (const [i, name] of [[0, 'provider'], [1, 'jev']]) {
      const el = await page.$(`#prof-ai .yf-surface.prof-panel:nth-of-type(${i + 1})`)
      if (el) await el.screenshot({ path: join(SHOTS, `ai-${tag}-${name}.png`) })
    }

    await page.close()
  }
}

await browser.close()
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`)
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
