// ============ The AI companion card, laid out for real ============
// The brief needs the AI state to be ACTUALLY rendered, not described. This
// opens the AI section and measures it: present, in flow, with a real control,
// and no overflow at any of the three widths. It asserts layout only — the
// answers themselves are the model's business, not a fixture's.
import { chromium } from 'playwright-core'

const BASE = process.env.PROFILE_FIXTURE_BASE ?? 'http://127.0.0.1:5199'
const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail })

const browser = await chromium.launch()

for (const [label, vp] of [['desk', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }], ['small', { width: 320, height: 720 }]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: vp.width !== 1440, isMobile: vp.width !== 1440 })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`${BASE}/dev/profile-fixture.html?theme=light&platform=native&update=newer&install=available&view=full`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.prof-grid')
  await page.waitForTimeout(800)

  const m = await page.evaluate(() => {
    const section = document.querySelector('#prof-ai')
    const inRail = [...document.querySelectorAll('.prof-nav-item')].some(a => a.getAttribute('href') === '#prof-ai')
    if (!section) return { present: false, inRail }
    const b = section.getBoundingClientRect()
    const s = getComputedStyle(section)
    return {
      present: true,
      inRail,
      hidden: section.hasAttribute('hidden'),
      display: s.display,
      w: Math.round(b.width),
      h: Math.round(b.height),
      // A card that draws must offer at least one real control.
      controls: [...section.querySelectorAll('button, input, a, select, textarea')]
        .filter(el => el.getBoundingClientRect().width > 0)
        .map(el => `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || el.type || '').trim().slice(0, 40)}`),
      title: section.querySelector('.prof-panel-title')?.textContent?.trim() ?? null,
      docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    }
  })

  check(`ai-${label}/section is drawn`, m.present && m.hidden === false && m.display !== 'none', JSON.stringify({ present: m.present, hidden: m.hidden, display: m.display }))
  check(`ai-${label}/the rail links to it`, m.inRail === true, `inRail=${m.inRail}`)
  check(`ai-${label}/it has a real control`, (m.controls?.length ?? 0) > 0, JSON.stringify(m.controls))
  check(`ai-${label}/no sideways overflow`, !m.docOverflow, `docOverflow=${m.docOverflow}`)
  check(`ai-${label}/no page errors`, errors.length === 0, errors.join('; '))

  await page.close()
}

await browser.close()
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`)
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
