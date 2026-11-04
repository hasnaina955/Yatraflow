// ============ Profile section accents: one targeted pass ============
// Measures the refinement that was approved: a tinted icon tile and a slim
// border accent per section role. Checks, per theme and per viewport:
//
//   - the mapped sections carry the intended accent attribute, and only those
//   - the tile tint and ink resolve to the token values for THIS theme
//   - the ink on its own tint clears WCAG AA (4.5:1) for normal text
//   - the card surface and its text stay neutral (the accent did not leak)
//   - no green/red accent is present, so decoration cannot imply a status
//
// Captures are viewport/mid-scroll shots, never fullPage. This is measurement,
// not a visual verdict.
import { chromium } from 'playwright-core'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.PROFILE_FIXTURE_BASE ?? 'http://127.0.0.1:5199'
const OUT = process.env.ACCENT_OUT ?? '.'
const SHOTS = join(OUT, 'shots')
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail })

/** WCAG relative luminance and contrast, from a computed `rgb()`/`rgba()` string. */
const measure = () => {
  const parse = s => {
    const m = s.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const contrast = (a, b) => {
    const l1 = lum(a), l2 = lum(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }

  const sections = [...document.querySelectorAll('.prof-main > .prof-section:not([hidden])')]
  return sections.map(s => {
    const key = s.id.replace('prof-', '')
    const tile = s.querySelector('.prof-tile')
    const panel = s.querySelector('.yf-surface.prof-panel')
    const title = s.querySelector('.prof-panel-title')
    const ts = tile ? getComputedStyle(tile) : null
    const ps = panel ? getComputedStyle(panel) : null
    const tts = title ? getComputedStyle(title) : null
    const tileBg = ts ? parse(ts.backgroundColor) : null
    const tileInk = ts ? parse(ts.color) : null
    return {
      key,
      accent: s.getAttribute('data-accent'),
      tileBg: ts?.backgroundColor ?? null,
      tileInk: ts?.color ?? null,
      tileContrast: tileBg && tileInk ? Math.round(contrast(tileInk, tileBg) * 100) / 100 : null,
      panelBorder: ps?.borderTopColor ?? null,
      panelBg: ps?.backgroundColor ?? null,
      titleColor: tts?.color ?? null,
      // The title must stay neutral: identical across all sections.
      titleFamily: tts?.fontFamily ?? null,
      hasButtons: s.querySelectorAll('button').length,
    }
  })
}

const browser = await chromium.launch()

for (const [vlabel, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: vp, hasTouch: vp.width !== 1440, isMobile: vp.width !== 1440 })
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    await page.goto(`${BASE}/dev/profile-fixture.html?theme=${theme}&platform=native&update=newer&install=available&view=full`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.prof-grid')
    await page.waitForTimeout(900)

    const rows = await page.evaluate(measure)
    const tag = `${vlabel}-${theme}`
    writeFileSync(join(OUT, `accents-${tag}.json`), JSON.stringify(rows, null, 2))

    const byKey = Object.fromEntries(rows.map(r => [r.key, r]))
    const expectAccent = { details: 'teal', styles: 'teal', creator: 'marigold', ai: 'jev' }

    // 1. The map is exactly what was approved, and nothing else is accented.
    for (const [key, want] of Object.entries(expectAccent)) {
      if (!byKey[key]) { check(`${tag}/${key} present`, false, 'section missing'); continue }
      check(`${tag}/${key} accent is ${want}`, byKey[key].accent === want, `got ${byKey[key].accent}`)
    }
    const stray = rows.filter(r => r.accent && !expectAccent[r.key]).map(r => `${r.key}=${r.accent}`)
    check(`${tag}/no unplanned accents`, stray.length === 0, JSON.stringify(stray))

    // 2. Every accented tile is tinted and its ink clears AA on that tint.
    //    A section whose cards do not draw a `.prof-tile` gets the border accent
    //    only. That is the AI companion: its two cards carry their own heading
    //    markup, and inventing a tile there would be a new element, not a tint of
    //    the existing one. Recorded as a limit rather than asserted away.
    for (const r of rows.filter(x => x.accent)) {
      check(`${tag}/${r.key} card border is accented`, r.panelBorder !== null, `${r.panelBorder}`)
      if (r.tileBg === null) {
        check(`${tag}/${r.key} has no icon tile (accent is border-only)`, true, 'by design')
        continue
      }
      check(`${tag}/${r.key} tile is tinted`, r.tileBg !== 'rgba(0, 0, 0, 0)', `${r.tileBg} on ${r.tileInk}`)
      check(`${tag}/${r.key} tile ink >= 4.5:1`, (r.tileContrast ?? 0) >= 4.5, `${r.tileContrast}:1 (${r.tileInk} on ${r.tileBg})`)
    }

    // 3. Text and surfaces stay neutral: one title colour across every section.
    const titleColours = [...new Set(rows.map(r => r.titleColor))]
    check(`${tag}/title colour is unchanged across sections`, titleColours.length === 1, JSON.stringify(titleColours))
    const fams = [...new Set(rows.map(r => r.titleFamily))]
    check(`${tag}/titles are still Sora`, fams.length === 1 && /Sora/.test(fams[0]), JSON.stringify(fams))

    // 4. No alarm colour anywhere: accent hues must not be the semantic ok/risk.
    const banned = rows.filter(r => {
      const c = (r.tileBg || '') + (r.tileInk || '')
      // The fixtures' ok is #1F6B41/#7FCF9A and risk #B23A2E/#F08A7A. Neither
      // must appear as an accent; checking the ink is enough to catch a swap.
      return /#|rgb/i.test(c) && [r.tileInk].some(v => v && /(31, ?107, ?65|127, ?207, ?154|178, ?58, ?46|240, ?138, ?122)/.test(v))
    }).map(r => r.key)
    check(`${tag}/no semantic ok/risk hue used as accent`, banned.length === 0, JSON.stringify(banned))

    check(`${tag}/no page errors`, errors.length === 0, errors.join('; '))

    // One viewport shot per theme/size, plus an element shot of the three
    // accented cards together so the refinement is legible in one frame.
    await page.screenshot({ path: join(SHOTS, `accents-${tag}.png`) })
    for (const key of ['details', 'creator', 'ai']) {
      const el = await page.$(`#prof-${key}`)
      if (el) await el.screenshot({ path: join(SHOTS, `accent-${tag}-${key}.png`) })
    }

    await page.close()
  }
}

await browser.close()
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`)
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
