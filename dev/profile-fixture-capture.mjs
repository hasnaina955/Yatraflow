// Measure and capture the isolated Profile fixture.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE
// 1. No `fullPage` screenshots. A full-page capture stretches a sticky rail to
//    the whole document height, so it cannot show where the rail sticks, and it
//    flattens the focus ring of whatever the page scrolled to. Every shot here is
//    either the viewport as it actually stands, or the element box itself.
// 2. Numbers are the evidence, pixels are the illustration. This file prints
//    computed styles and measured boxes; it makes no visual-acceptance claim.
//
// The page is the isolated fixture (vite.profile-fixture.config.ts), NOT the app:
// real ProfilePage, real cards, synthetic platform/update/install status. The
// synthetic header is labelled as such on screen so a shot cannot be mistaken
// for the real app chrome.
import { chromium } from 'playwright-core'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.PROFILE_FIXTURE_BASE ?? 'http://127.0.0.1:5199'
const ROOT = process.env.PROFILE_OUT ?? join(process.cwd(), '.verify-evidence', 'profile-repair')
const SHOTS = join(ROOT, 'shots')
mkdirSync(SHOTS, { recursive: true })

const DESK = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SMALL = { width: 320, height: 720 }

/** Every state Terra named, plus the negatives that prove the section stays out. */
const CASES = [
  { name: 'desk-light-both', vp: DESK, q: 'theme=light&platform=native&update=newer&install=available&view=full' },
  { name: 'desk-dark-both', vp: DESK, q: 'theme=dark&platform=native&update=newer&install=available&view=full' },
  { name: 'desk-light-none', vp: DESK, q: 'theme=light&platform=web&update=none&install=none&view=full' },
  { name: 'desk-light-update-only', vp: DESK, q: 'theme=light&platform=native&update=newer&install=none&view=full' },
  { name: 'desk-light-install-only', vp: DESK, q: 'theme=light&platform=web&update=none&install=available&view=full' },
  { name: 'desk-light-ios-install', vp: DESK, q: 'theme=light&platform=web&update=none&install=ios&view=full' },
  { name: 'desk-light-unconfigured', vp: DESK, q: 'theme=light&platform=native&update=unconfigured&install=none&view=full' },
  { name: 'phone-light-rest', vp: PHONE, q: 'theme=light&platform=native&update=newer&install=available&view=full' },
  { name: 'phone-dark-rest', vp: PHONE, q: 'theme=dark&platform=native&update=newer&install=available&view=full' },
  { name: 'phone-light-320', vp: SMALL, q: 'theme=light&platform=web&update=none&install=available&view=full' },
]

const measure = () => {
  const r = el => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  const cs = (el, ...props) => {
    if (!el) return null
    const s = getComputedStyle(el)
    return Object.fromEntries(props.map(p => [p, s[p]]))
  }

  const nav = document.querySelector('.prof-nav')
  const navItems = [...document.querySelectorAll('.prof-nav-item')]
  const section = document.querySelector('#prof-install')
  const title = document.querySelector('.prof-panel-title')
  const header = document.querySelector('.topnav')
  const scrollable = nav ? nav.scrollWidth > nav.clientWidth + 1 : null

  return {
    viewport: { w: innerWidth, h: innerHeight },
    docScrollW: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,

    headerBox: r(header),
    navBox: r(nav),
    // The phone failure was a vertical card. `direction` is the fact.
    navDirection: nav ? getComputedStyle(nav).flexDirection : null,
    navPosition: cs(nav, 'position', 'top', 'zIndex', 'overflowX', 'overscrollBehaviorInline'),
    navScroll: nav ? { scrollW: nav.scrollWidth, clientW: nav.clientWidth, scrollable } : null,
    navItems: navItems.map(a => ({
      label: a.textContent.trim(),
      h: Math.round(a.getBoundingClientRect().height),
      w: Math.round(a.getBoundingClientRect().width),
      current: a.getAttribute('aria-current'),
    })),
    // Last item must be reachable by sideways drag, not clipped out of existence.
    navReach: nav ? { lastItemRight: Math.round(navItems.at(-1)?.getBoundingClientRect().right ?? 0), navRight: Math.round(nav.getBoundingClientRect().right) } : null,

    installSection: section
      ? { present: true, hiddenAttr: section.hasAttribute('hidden'), box: r(section), display: getComputedStyle(section).display, navAnchor: Boolean(document.querySelector('.prof-nav-item[href="#prof-install"]')) }
      : { present: false, navAnchor: Boolean(document.querySelector('.prof-nav-item[href="#prof-install"]')) },
    installCards: [...document.querySelectorAll('#prof-install .prof-panel-title')].map(t => t.textContent.trim()),
    // A hidden section must not be a tab stop.
    installFocusables: section
      ? [...section.querySelectorAll('a,button,input,[tabindex]')].filter(el => el.getBoundingClientRect().width > 0).length
      : 0,

    // Typography: the approved decision, read off the live element.
    panelTitle: cs(title, 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'),
    sectionCount: document.querySelectorAll('.prof-main > .prof-section:not([hidden])').length,
    sectionsPresent: [...document.querySelectorAll('.prof-main > .prof-section')].map(s => `${s.id}${s.hasAttribute('hidden') ? '(hidden)' : ''}`),
    // The rail marks the section actually being read.
    activeItem: navItems.find(a => a.getAttribute('aria-current') === 'true')?.textContent.trim() ?? null,
  }
}

const browser = await chromium.launch()
const report = {}
const failures = []

for (const c of CASES) {
  const page = await browser.newPage({ viewport: c.vp, deviceScaleFactor: 1, hasTouch: c.vp !== DESK, isMobile: c.vp !== DESK })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(`${BASE}/dev/profile-fixture.html?${c.q}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.prof-grid')
  await page.waitForTimeout(900)

  const m = await page.evaluate(measure)
  report[c.name] = { ...m, errors }

  // Viewport shot: what a person sees at rest, sticky chrome included.
  await page.screenshot({ path: join(SHOTS, `${c.name}.png`) })

  // Element shot of the rail: the sticky strip at its real box.
  const navEl = await page.$('.prof-nav')
  if (navEl) await navEl.screenshot({ path: join(SHOTS, `${c.name}-rail.png`) })

  // Element shot of the install section when it is actually drawn.
  const instEl = await page.$('#prof-install:not([hidden])')
  if (instEl) await instEl.screenshot({ path: join(SHOTS, `${c.name}-install.png`) })

  await page.close()
}

// ---------- Phone: the strip must behave when scrolled and when focused ----------
{
  const page = await browser.newPage({ viewport: PHONE, hasTouch: true, isMobile: true })
  await page.goto(`${BASE}/dev/profile-fixture.html?theme=light&platform=native&update=newer&install=available&view=full`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  const before = await page.evaluate(measure)
  await page.evaluate(() => window.scrollBy(0, 900))
  await page.waitForTimeout(500)
  const scrolled = await page.evaluate(() => {
    const nav = document.querySelector('.prof-nav')
    const b = nav.getBoundingClientRect()
    const headerB = document.querySelector('.topnav').getBoundingClientRect()
    return {
      navTop: Math.round(b.top), navBottom: Math.round(b.bottom),
      headerBottom: Math.round(headerB.bottom),
      // The rail must sit below the header, never under it.
      clearsHeader: b.top >= headerB.bottom - 1,
      position: getComputedStyle(nav).position,
    }
  })
  await page.screenshot({ path: join(SHOTS, 'phone-light-scrolled.png') })

  // Reach the last rail row by a sideways drag on the strip itself.
  await page.evaluate(() => {
    const nav = document.querySelector('.prof-nav')
    nav.scrollLeft = nav.scrollWidth
  })
  await page.waitForTimeout(300)
  const reached = await page.evaluate(() => {
    const nav = document.querySelector('.prof-nav')
    const items = [...document.querySelectorAll('.prof-nav-item')]
    const last = items.at(-1).getBoundingClientRect()
    const nb = nav.getBoundingClientRect()
    return {
      scrollLeft: Math.round(nav.scrollLeft),
      maxScroll: Math.round(nav.scrollWidth - nav.clientWidth),
      lastVisible: last.right <= nb.right + 1 && last.left >= nb.left - 1,
      lastLabel: items.at(-1).textContent.trim(),
    }
  })
  await page.screenshot({ path: join(SHOTS, 'phone-light-rail-end.png') })

  // Keyboard: tab into the rail and confirm the focus ring is not clipped.
  await page.evaluate(() => document.querySelector('.prof-nav-item')?.focus())
  await page.waitForTimeout(200)
  const focused = await page.evaluate(() => {
    const a = document.querySelector('.prof-nav-item')
    const s = getComputedStyle(a)
    const nav = document.querySelector('.prof-nav')
    const ab = a.getBoundingClientRect()
    const nb = nav.getBoundingClientRect()
    return {
      outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle,
      insideStrip: ab.top >= nb.top - 2 && ab.bottom <= nb.bottom + 2,
      focusVisible: a.matches(':focus-visible'),
    }
  })
  await page.screenshot({ path: join(SHOTS, 'phone-light-rail-focus.png') })

  report['phone-behaviour'] = { before: { navDirection: before.navDirection, navBox: before.navBox }, scrolled, reached, focused }
  await page.close()
}

// ---------- Hydration: a late user must still attach the observer ----------
{
  const page = await browser.newPage({ viewport: DESK })
  await page.goto(`${BASE}/dev/profile-fixture.html?theme=light&platform=native&update=newer&install=available&view=full`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  // Anchor jump, then read the mark.
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('.prof-nav-item')].find(el => el.textContent.trim().startsWith('Install'))
    a?.click()
  })
  await page.waitForTimeout(1200)
  const afterAnchor = await page.evaluate(() => ({
    active: document.querySelector('.prof-nav-item[aria-current="true"]')?.textContent.trim() ?? null,
    installTop: Math.round(document.querySelector('#prof-install').getBoundingClientRect().top),
    navBottom: Math.round(document.querySelector('.prof-nav').getBoundingClientRect().bottom),
  }))

  // Manual scroll to the last section, then read the mark again. A real wheel
  // gesture, not `scrollTo`, because a programmatic jump is exactly what the
  // rail's own click already does — a reader taking over is a different event.
  // The jump left the page at its foot, so this wheels up and back down: that
  // exercises the mark in both directions instead of a no-op at the clamp.
  await page.mouse.move(700, 500)
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(40) }
  await page.waitForTimeout(300)
  const afterUp = await page.evaluate(() => ({
    scrollY: Math.round(scrollY),
    active: document.querySelector('.prof-nav-item[aria-current="true"]')?.getAttribute('href') ?? null,
  }))
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(40) }
  await page.waitForTimeout(1200)
  const afterScroll = await page.evaluate(() => ({
    active: document.querySelector('.prof-nav-item[aria-current="true"]')?.textContent.trim() ?? null,
    activeHref: document.querySelector('.prof-nav-item[aria-current="true"]')?.getAttribute('href') ?? null,
    lastSection: [...document.querySelectorAll('.prof-main > .prof-section:not([hidden])')].at(-1)?.id ?? null,
  }))
  report['scroll-spy'] = { afterAnchor, afterUp, afterScroll }
  await page.close()
}

// ---------- Pace: the ten choices at desktop and phone ----------
{
  for (const [name, vp] of [['desk', DESK], ['phone', PHONE], ['small', SMALL]]) {
    const page = await browser.newPage({ viewport: vp, hasTouch: vp !== DESK, isMobile: vp !== DESK })
    await page.goto(`${BASE}/dev/trip-settings-fixture.html?theme=light`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.tset-pace-rows', { timeout: 15000 })
    await page.waitForTimeout(600)

    const group = await page.$('.tset-pace-rows')
    // Element shot of the wrapped group: the whole set in one box, which is the
    // only way a wrapped layout can be seen as wrapped.
    if (group) await group.screenshot({ path: join(SHOTS, `pace-${name}.png`) })
    await page.screenshot({ path: join(SHOTS, `trip-settings-${name}.png`) })

    const m = await page.evaluate(() => {
      const g = document.querySelector('.tset-pace-rows')
      const rows = [...g.querySelectorAll('.tset-pace-row')]
      const gb = g.getBoundingClientRect()
      return {
        count: rows.length,
        rowsInside: rows.every(r => {
          const b = r.getBoundingClientRect()
          return b.right <= gb.right + 1 && b.left >= gb.left - 1
        }),
        wrapped: new Set(rows.map(r => Math.round(r.getBoundingClientRect().top))).size,
        docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      }
    })
    report[`pace-${name}`] = m
    await page.close()
  }
}

await browser.close()

const out = JSON.stringify(report, null, 2)
writeFileSync(join(ROOT, 'measure.json'), out)

// ---------- Assertions: numbers only, no visual verdict ----------
const assert = (cond, msg) => { if (!cond) failures.push(msg) }

for (const [name, m] of Object.entries(report)) {
  if (name === 'phone-behaviour' || name === 'scroll-spy') continue
  if (name.startsWith('pace-')) {
    const vpW = name === 'pace-desk' ? DESK.width : name === 'pace-phone' ? PHONE.width : SMALL.width
    assert(m.count === 10, `${name}: ${m.count} Pace choices drawn`)
    assert(m.rowsInside, `${name}: a Pace row spills outside the group at ${vpW}px`)
    assert(!m.docOverflow, `${name}: page overflows sideways at ${vpW}px`)
    continue
  }
  assert(m.errors.length === 0, `${name}: page errors ${m.errors.join('; ')}`)
  assert(!m.horizontalOverflow, `${name}: document scrollWidth ${m.docScrollW} > viewport ${m.viewport.w}`)
  assert(m.panelTitle?.fontFamily?.includes('Sora'), `${name}: panel title family is ${m.panelTitle?.fontFamily}`)
  assert(m.panelTitle?.fontWeight === '700', `${name}: panel title weight is ${m.panelTitle?.fontWeight}`)
  assert(m.panelTitle?.fontSize === '18px', `${name}: panel title size is ${m.panelTitle?.fontSize}`)
  assert(m.panelTitle?.lineHeight === '22.5px', `${name}: panel title line-height is ${m.panelTitle?.lineHeight}`)

  const phone = m.viewport.w <= 860
  if (phone) {
    assert(m.navDirection === 'row', `${name}: rail flex-direction is ${m.navDirection}, expected row on a phone`)
    assert(m.navPosition?.position === 'sticky', `${name}: rail position is ${m.navPosition?.position}`)
    assert(m.navScroll?.scrollable, `${name}: rail is not sideways scrollable`)
    assert(m.navReach && m.navReach.lastItemRight > m.navReach.navRight, `${name}: last rail row never exceeds the strip, so nothing proves reachability`)
  }

  if (name.includes('both') || name.includes('update-only') || name.includes('unconfigured')) {
    assert(m.installSection.present, `${name}: install section missing`)
    assert(!m.installSection.hiddenAttr, `${name}: install section is hidden but a card should draw`)
    assert(m.installCards.length > 0, `${name}: install section drawn with no card`)
    assert(m.installSection.navAnchor, `${name}: rail has no anchor to the drawn section`)
  }
  if (name.includes('install-only')) {
    assert(m.installCards.includes('Install YatraFlow'), `${name}: install card did not mount`)
    assert(m.installSection.navAnchor, `${name}: rail has no anchor for the install card`)
  }
  if (name === 'desk-light-none') {
    assert(m.installSection.hiddenAttr, `${name}: install section not hidden when neither card draws`)
    assert(!m.installSection.navAnchor, `${name}: rail offers an anchor to an empty section`)
    assert(m.installFocusables === 0, `${name}: hidden section exposes ${m.installFocusables} focusable nodes`)
    assert(m.installCards.length === 0, `${name}: hidden section drew cards`)
  }
}

const ph = report['phone-behaviour']
assert(ph?.scrolled.clearsHeader, 'phone: rail overlaps the sticky header after scrolling')
assert(ph?.reached.lastVisible, `phone: last rail row ("${ph?.reached.lastLabel}") not reachable by sideways scroll`)
assert(ph?.focused.insideStrip, 'phone: focused rail row is clipped by the strip box')

const spy = report['scroll-spy']
assert(spy?.afterAnchor.active?.startsWith('Install'), `spy: after clicking the Install anchor the mark is "${spy?.afterAnchor.active}"`)
assert(spy?.afterScroll.activeHref === `#${spy?.afterScroll.lastSection}`, `spy: after scrolling to the end the mark is "${spy?.afterScroll.active}" (${spy?.afterScroll.activeHref}) but the last section is ${spy?.afterScroll.lastSection}`)

console.log(out)
console.log(`\n=== ${failures.length === 0 ? 'ALL ASSERTIONS PASS' : `${failures.length} FAILURES`} ===`)
for (const f of failures) console.log(`FAIL ${f}`)
process.exit(failures.length === 0 ? 0 : 1)
