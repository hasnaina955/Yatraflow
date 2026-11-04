// ============ Trip Settings: all ten Pace choices reachable ============
// The brief's requirement is that every one of the ten named styles is reachable
// on a phone without a sideways drag, each keeping its own pressed state and the
// same setter. This measures it rather than trusting the grid declaration: a
// wrapped grid that still overflows, or a row whose label clips, would pass a
// source read and fail a person.
//
// It also proves the ten labels are DISTINCT (a duplicate key would collapse a
// choice invisibly) and that selecting one marks exactly one.
import { chromium } from 'playwright-core'

const BASE = process.env.PROFILE_FIXTURE_BASE ?? 'http://127.0.0.1:5199'
const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail })

const browser = await chromium.launch()

for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 720 }]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`${BASE}/dev/trip-settings-fixture.html?theme=light`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.tset-pace-rows', { timeout: 15000 })
  await page.waitForTimeout(600)

  const m = await page.evaluate(() => {
    const group = document.querySelector('.tset-pace-rows')
    const rows = [...group.querySelectorAll('.tset-pace-row')]
    const gb = group.getBoundingClientRect()
    const labels = rows.map(r => r.textContent.trim())
    return {
      count: rows.length,
      labels,
      distinct: new Set(labels).size,
      // Every row must sit inside the group's own box: no row spills sideways.
      outside: rows.filter(r => {
        const b = r.getBoundingClientRect()
        return b.right > gb.right + 1 || b.left < gb.left - 1
      }).map(r => r.textContent.trim()),
      // A wrapped label must not be cut off.
      clipped: rows.filter(r => r.scrollWidth > r.clientWidth + 1).map(r => r.textContent.trim()),
      docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      heights: rows.map(r => Math.round(r.getBoundingClientRect().height)),
      keys: rows.map(r => r.dataset.pillKey),
    }
  })

  check(`pace-${vp.width}/ten choices are drawn`, m.count === 10, `count=${m.count}`)
  check(`pace-${vp.width}/labels are distinct`, m.distinct === 10, JSON.stringify(m.labels))
  check(`pace-${vp.width}/every choice is inside the group`, m.outside.length === 0, JSON.stringify(m.outside))
  check(`pace-${vp.width}/no label is clipped`, m.clipped.length === 0, JSON.stringify(m.clipped))
  check(`pace-${vp.width}/no sideways page overflow`, !m.docOverflow, `docOverflow=${m.docOverflow}`)
  check(`pace-${vp.width}/each row is a 44px target`, m.heights.every(h => h >= 44), JSON.stringify(m.heights))

  // The last choice must be the only one marked once it is selected.
  const lastKey = m.keys[m.keys.length - 1]
  await page.click(`.tset-pace-row[data-pill-key="${lastKey}"]`)
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.tset-pace-row')]
    const pressed = groups.filter(g => g.getAttribute('aria-pressed') === 'true').map(g => g.dataset.pillKey)
    const on = groups.filter(g => g.classList.contains('on')).map(g => g.dataset.pillKey)
    return { pressed, on, count: pressed.length }
  })
  check(`pace-${vp.width}/selecting the last marks exactly one`, after.count === 1 && after.pressed[0] === lastKey, JSON.stringify(after))
  check(`pace-${vp.width}/the mark is not colour alone`, after.on.length === 1 && after.on[0] === lastKey, JSON.stringify(after))

  check(`pace-${vp.width}/no page errors`, errors.length === 0, errors.join('; '))
  await page.close()
}

await browser.close()
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`)
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
