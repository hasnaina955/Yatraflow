// Regression test: the Profile rail must attach when the store answers LATE.
//
// Two defects this pins, both from the review and both reproduced in a browser:
//   1. DEADLOCK — `Section` returned null for a hidden section, so the install
//      and update cards never mounted and could never report that they draw.
//   2. FALSE OVERWRITE — both cards wrote one shared boolean, so whichever
//      effect ran last decided for both.
//   3. FROZEN SPY — the observer attached on the first render. If the user
//      hydrates afterwards, it had no sections to watch and never re-attached.
//
// It also measures the phone rail: `flex-direction` must be `row` and the strip
// must actually scroll, which is the failure the screenshots showed as a vertical
// card (a later same-specificity base rule beat the phone rule).
//
// Runs against the isolated fixture (vite.profile-fixture.config.ts). It asserts
// LAYOUT and MARKING, never native behaviour and never visual acceptance.
import { chromium } from 'playwright-core'

const BASE = process.env.PROFILE_FIXTURE_BASE ?? 'http://127.0.0.1:5199'
const URL = q => `${BASE}/dev/profile-fixture.html?${q}`

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
}

const browser = await chromium.launch()

// ---------- 1. Late hydration: null first, then the user ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(URL('theme=light&platform=native&update=newer&install=available&view=full&late=1'), { waitUntil: 'networkidle' })

  // Before the store answers there are no sections at all.
  await page.waitForTimeout(150)
  const before = await page.evaluate(() => ({
    sections: document.querySelectorAll('.prof-main > .prof-section').length,
    nav: document.querySelectorAll('.prof-nav-item').length,
    hasTip: typeof window.__hydrateFixture === 'function',
  }))
  check('late-hydration/fixture starts signed out', before.sections === 0 && before.nav === 0 && before.hasTip, JSON.stringify(before))

  // The user arrives AFTER the first paint: the exact case the effect missed.
  await page.evaluate(() => window.__hydrateFixture())
  await page.waitForFunction(() => document.querySelectorAll('.prof-main > .prof-section').length > 0, { timeout: 8000 })
  await page.waitForTimeout(600)

  const after = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.prof-nav-item')]
    return {
      sections: document.querySelectorAll('.prof-main > .prof-section').length,
      nav: items.length,
      active: items.find(a => a.getAttribute('aria-current') === 'true')?.getAttribute('href') ?? null,
      firstHref: items[0]?.getAttribute('href') ?? null,
    }
  })

  check('late-hydration/no user renders no sections', before.sections === 0 && before.nav === 0, JSON.stringify(before))
  check('late-hydration/sections appear after hydration', after.sections > 0, JSON.stringify(after))
  check('late-hydration/rail marks a real section after hydration', after.active !== null && after.active === after.firstHref, JSON.stringify(after))

  // The observer attached late must still follow a reader's scroll.
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto' })
  await page.mouse.move(700, 500)
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(50) }
  await page.waitForTimeout(800)
  const scrolled = await page.evaluate(() => ({
    scrollY: Math.round(scrollY),
    active: document.querySelector('.prof-nav-item[aria-current="true"]')?.getAttribute('href') ?? null,
  }))
  check('late-hydration/mark follows a scroll after a late attach', scrolled.scrollY > 0 && scrolled.active !== after.firstHref, JSON.stringify(scrolled))

  await page.close()
}

// ---------- 2. Independent card verdicts ----------
{
  const cases = [
    // The update card is native-only, so "neither draws" is the web build with
    // no captured install prompt. On native the card always draws, which is why
    // that pairing is not a valid empty case.
    { q: 'platform=web&update=none&install=none&view=full', expect: 'hidden', why: 'neither card draws' },
    { q: 'platform=native&update=newer&install=none&view=full', expect: 'shown', why: 'update card alone' },
    { q: 'platform=web&update=none&install=available&view=full', expect: 'shown', why: 'install card alone' },
    { q: 'platform=web&update=none&install=ios&view=full', expect: 'shown', why: 'iOS install hint alone' },
    { q: 'platform=native&update=newer&install=available&view=full', expect: 'shown', why: 'both cards' },
  ]
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(URL(`theme=light&${c.q}`), { waitUntil: 'networkidle' })
    await page.waitForSelector('.prof-grid')
    await page.waitForTimeout(700)
    const m = await page.evaluate(() => {
      const s = document.querySelector('#prof-install')
      return {
        hidden: s?.hasAttribute('hidden') ?? null,
        titles: [...document.querySelectorAll('#prof-install .prof-panel-title')].map(t => t.textContent.trim()),
        anchor: Boolean(document.querySelector('.prof-nav-item[href="#prof-install"]')),
        focusables: s ? [...s.querySelectorAll('a,button,input,[tabindex]')].filter(el => el.getBoundingClientRect().width > 0).length : 0,
      }
    })
    const ok = c.expect === 'hidden'
      ? m.hidden === true && m.titles.length === 0 && m.anchor === false && m.focusables === 0
      : m.hidden === false && m.titles.length > 0 && m.anchor === true
    check(`install-section/${c.why}`, ok, JSON.stringify(m))
    await page.close()
  }
}

// ---------- 3. Phone rail ----------
{
  for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 720 }]) {
    const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true })
    await page.goto(URL('theme=light&platform=native&update=newer&install=available&view=full'), { waitUntil: 'networkidle' })
    await page.waitForSelector('.prof-nav')
    await page.waitForTimeout(700)

    const m = await page.evaluate(() => {
      const nav = document.querySelector('.prof-nav')
      const cs = getComputedStyle(nav)
      const items = [...document.querySelectorAll('.prof-nav-item')]
      const header = document.querySelector('.topnav')
      return {
        direction: cs.flexDirection,
        position: cs.position,
        top: cs.top,
        scrollW: nav.scrollWidth,
        clientW: nav.clientWidth,
        overflowX: cs.overflowX,
        itemHeights: items.map(a => Math.round(a.getBoundingClientRect().height)),
        headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
        docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      }
    })

    const row = m.direction === 'row'
    const scrollable = m.scrollW > m.clientW + 1
    const coarse = m.itemHeights.every(h => h >= 44)
    check(`phone-${vp.width}/rail is a row`, row, `direction=${m.direction}`)
    check(`phone-${vp.width}/rail scrolls sideways`, scrollable && m.overflowX === 'auto', JSON.stringify(m))
    check(`phone-${vp.width}/no page overflow`, !m.docOverflow, `docOverflow=${m.docOverflow}`)
    check(`phone-${vp.width}/targets >= 44px`, coarse, JSON.stringify(m.itemHeights))

    // Sticky must clear the header once the page moves.
    await page.evaluate(() => document.documentElement.style.scrollBehavior = 'auto')
    await page.mouse.move(vp.width / 2, vp.height / 2)
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(50) }
    await page.waitForTimeout(400)
    const stuck = await page.evaluate(() => {
      const nav = document.querySelector('.prof-nav').getBoundingClientRect()
      const header = document.querySelector('.topnav').getBoundingClientRect()
      return { navTop: Math.round(nav.top), headerBottom: Math.round(header.bottom) }
    })
    check(`phone-${vp.width}/sticky rail clears the header`, stuck.navTop >= stuck.headerBottom - 1, JSON.stringify(stuck))

    await page.close()
  }
}

await browser.close()

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`)
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
