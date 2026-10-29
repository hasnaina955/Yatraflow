// CSS-3 B8: dialog comparison, on the real shared Modal.
//
// The fixture mounts src/components/ui.tsx `Modal`, so the focus trap, Escape
// handler, scroll lock, focus restoration and motion under test are the ones
// the product ships.
//
// Coverage is checked as well as the result:
//   - the comparison measures the states it names, and asserts each one
//   - two seed defects prove the instrument detects a stacking fault and a
//     clipping fault before any zero is trusted
// Seeds are injected as a stylesheet override in the live page. No source edit
// and no rebuild per seed.
import fs from 'node:fs'
import path from 'node:path'
import { launchChrome, normaliseValue, writeReport } from './_css3-compare-lib.mjs'

const [beforePath, afterPath, outDir = 'dev/_css3-report-dialog'] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('usage: node dev/_css3-dialog-compare.mjs <before.css> <after.css> [outDir]')
  process.exit(2)
}

const BASE = 'http://localhost:5178/dev/css3-dialog-fixture.html'

const PROPS = [
  'position', 'inset', 'z-index', 'display', 'align-items', 'justify-content',
  'width', 'max-width', 'height', 'max-height', 'min-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-radius', 'background-color', 'overflow-y', 'overflow-x',
  'box-shadow', 'opacity', 'transform', 'transition-property', 'transition-duration',
]

const ENVS = [
  { id: 'light-desktop', theme: 'light', width: 1440, reduced: 'no-preference' },
  { id: 'dark-desktop', theme: 'dark', width: 1440, reduced: 'no-preference' },
  { id: 'light-phone', theme: 'light', width: 390, reduced: 'no-preference' },
  { id: 'dark-phone', theme: 'dark', width: 390, reduced: 'no-preference' },
  { id: 'light-reduced', theme: 'light', width: 1440, reduced: 'reduce' },
  { id: 'phone-reduced', theme: 'light', width: 390, reduced: 'reduce' },
]

/** Replace the Vite stylesheet in the live page with a frozen build. */
async function useStylesheet(page, css) {
  const removed = await page.evaluate(() => {
    const styles = [...document.querySelectorAll('style[data-vite-dev-id]')]
    for (const style of styles) style.remove()
    return styles.length
  })
  if (!removed) throw new Error('Could not replace the Vite stylesheet')
  await page.addStyleTag({ content: css })
}

/** Read the surface and overlay. */
async function readSurfaces(page) {
  return page.evaluate((props) => {
    const pick = (el) => {
      if (!el) return null
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const row = { rect: [r.x, r.y, r.width, r.height] }
      for (const p of props) row[p] = s.getPropertyValue(p)
      return row
    }
    return {
      overlay: pick(document.querySelector('.modal-overlay')),
      dialog: pick(document.querySelector('.modal')),
      head: pick(document.querySelector('.modal-head')),
    }
  }, PROPS)
}

/**
 * Coverage assertions.
 *
 * A comparison that quietly measured nothing would still report zero, so every
 * state this tool claims to cover is asserted to exist first.
 */
async function assertCoverage(page, label, { expectLongBody }) {
  const found = await page.evaluate(() => ({
    overlay: !!document.querySelector('.modal-overlay'),
    dialog: !!document.querySelector('.modal'),
    role: document.querySelector('.modal')?.getAttribute('role'),
    ariaModal: document.querySelector('.modal')?.getAttribute('aria-modal'),
    focusables: document.querySelectorAll('.modal button, .modal [href], .modal input, .modal select, .modal textarea').length,
    bodyParas: document.querySelectorAll('#body-content p').length,
  }))
  if (!found.overlay) throw new Error(`${label}: no .modal-overlay rendered`)
  if (!found.dialog) throw new Error(`${label}: no .modal rendered`)
  if (found.role !== 'dialog') throw new Error(`${label}: the dialog lost role="dialog"`)
  if (found.ariaModal !== 'true') throw new Error(`${label}: the dialog lost aria-modal="true"`)
  if (found.focusables < 2) throw new Error(`${label}: expected at least 2 focusable controls, found ${found.focusables}`)
  if (expectLongBody && found.bodyParas < 20) {
    throw new Error(`${label}: the long-body case rendered ${found.bodyParas} paragraphs, so it cannot test clipping`)
  }
  return found
}

/** Hit-test the centre of the dialog against an overlapping control. */
async function hitTestStacking(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('.modal')
    const behind = document.querySelector('#behind')
    if (!dialog || !behind) return { ok: false, reason: 'missing element' }
    const r = behind.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const dialogReaches = top === dialog || dialog.contains(top)
    const overlayReaches = top?.closest('.modal-overlay') !== null && top !== null
    const r2 = dialog.getBoundingClientRect()
    const inDialog = document.elementFromPoint(r2.left + r2.width / 2, r2.top + 20)
    return {
      ok: dialogReaches || overlayReaches,
      onTopIsDialog: dialogReaches,
      onTopIsOverlay: overlayReaches,
      topTag: top?.tagName ?? null,
      dialogReachable: inDialog === dialog || dialog.contains(inDialog),
    }
  })
}

/** Detect clipping: the sheet must scroll, and its content must not be cut. */
async function detectClipping(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('.modal')
    if (!dialog) return { ok: false, reason: 'missing dialog' }
    const s = getComputedStyle(dialog)
    const scrolls = s.overflowY === 'auto' || s.overflowY === 'scroll'
    const overflowing = dialog.scrollHeight > dialog.clientHeight + 1
    // The last control must be reachable by scrolling, not clipped away.
    dialog.scrollTop = dialog.scrollHeight
    const last = document.querySelector('#cancel')
    const dr = dialog.getBoundingClientRect()
    const lr = last?.getBoundingClientRect()
    const lastVisible = !!lr && lr.bottom <= dr.bottom + 1 && lr.top >= dr.top - 1
    const lastHit = lr
      ? (() => {
          const t = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2)
          return t === last || last.contains(t)
        })()
      : false
    dialog.scrollTop = 0
    return { ok: scrolls && overflowing && lastVisible && lastHit, scrolls, overflowing, lastVisible, lastHit }
  })
}

/**
 * Keyboard contract: entry, Tab wrap, Escape close, focus restoration.
 */
async function checkKeyboard(page, label) {
  const opener = page.locator('#opener')
  const dialog = page.locator('.modal')
  const log = page.locator('#log')

  // Entry: the opener has focus, then the dialog takes focus on its own.
  await opener.focus()
  await opener.press('Enter')
  await dialog.waitFor({ state: 'visible' })
  await page.waitForTimeout(120)
  const entered = await page.evaluate(() => {
    const active = document.activeElement
    const inside = document.querySelector('.modal')?.contains(active) ?? false
    return { inside, tag: active?.tagName ?? null, id: active?.id ?? null }
  })
  if (!entered.inside) throw new Error(`${label}: focus did not enter the dialog on open (active: ${entered.tag})`)

  // Tab navigation must stay inside, including the wrap at the last control.
  // Every step presses Tab for real. An earlier version only sampled the active
  // element, so it never exercised the trap at all.
  const trapped = await page.evaluate(() => ({
    focusables: document.querySelectorAll('.modal button, .modal [href], .modal input, .modal select, .modal textarea').length,
  }))
  const seen = []
  let escapedAt = -1
  for (let i = 0; i < 8; i++) {
    const where = await page.evaluate(() => {
      const active = document.activeElement
      const inside = document.querySelector('.modal')?.contains(active) ?? false
      return { inside, id: active?.id || active?.getAttribute('aria-label') || active?.tagName || '?' }
    })
    seen.push(where.id)
    if (!where.inside) {
      escapedAt = i
      break
    }
    await page.keyboard.press('Tab')
    await page.waitForTimeout(20)
  }
  if (escapedAt >= 0) throw new Error(`${label}: Tab escaped the dialog at step ${escapedAt}`)
  const distinct = new Set(seen)
  if (trapped.focusables >= 3 && distinct.size < 3) {
    throw new Error(
      `${label}: Tab only ever reached ${distinct.size} of ${trapped.focusables} focusable controls (${[...distinct].join(', ')}), so the trap was not exercised`,
    )
  }

  await page.keyboard.press('Shift+Tab')
  const shiftInside = await page.evaluate(() => document.querySelector('.modal')?.contains(document.activeElement) ?? false)
  if (!shiftInside) throw new Error(`${label}: Shift+Tab escaped the dialog`)

  // Escape closes it.
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  const closed = await log.textContent()
  if (!closed?.includes('closed')) throw new Error(`${label}: Escape did not call onClose`)

  // Focus returns to the opener.
  const restored = await page.evaluate(() => document.activeElement?.id ?? null)
  if (restored !== 'opener') throw new Error(`${label}: focus was not restored to the opener (got ${restored})`)

  return { entered, trapped: seen, distinctFocusables: distinct.size, focusables: trapped.focusables, restored }
}

/** Reopen while the previous close is still in flight. */
async function checkReopen(page, label) {
  const opener = page.locator('#opener')
  await opener.focus()
  await opener.press('Enter')
  await page.locator('.modal').waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  // Reopen on the very next frame, before any exit transition can settle.
  await page.evaluate(() => {
    const el = document.querySelector('#opener')
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.waitForTimeout(60)
  const state = await page.evaluate(() => ({
    dialogs: document.querySelectorAll('.modal').length,
    overlays: document.querySelectorAll('.modal-overlay').length,
    bodyOverflow: getComputedStyle(document.body).overflow,
    focusedInside: document.querySelector('.modal')?.contains(document.activeElement) ?? false,
  }))
  if (state.dialogs !== 1) throw new Error(`${label}: reopening left ${state.dialogs} dialogs in the DOM`)
  if (state.overlays !== 1) throw new Error(`${label}: reopening left ${state.overlays} overlays in the DOM`)
  if (state.bodyOverflow !== 'hidden') throw new Error(`${label}: scroll lock was lost on reopen (${state.bodyOverflow})`)
  if (!state.focusedInside) throw new Error(`${label}: focus was not inside the dialog after reopen`)
  return state
}

const browser = await launchChrome()
const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8')

// ---------------------------------------------------------------- seed proofs
// Run first, on isolated pages, so a zero from the real comparison means
// something. Each seed is a stylesheet override, never a source edit.
const seeds = []

{
  // Stacking defect: drop the overlay's z-index and pointer surface so the
  // control underneath wins the hit test.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(`${BASE}?variant=dialog&theme=light`, { waitUntil: 'load' })
  await page.locator('.modal').waitFor({ state: 'visible' })
  await page.waitForTimeout(200)
  const healthy = await hitTestStacking(page)
  await page.addStyleTag({ content: '.modal-overlay { z-index: 0 !important; pointer-events: none !important; }' })
  const seeded = await hitTestStacking(page)
  seeds.push({ name: 'stacking', healthy: healthy.ok, seeded: seeded.ok, detail: seeded })
  await context.close()
}

{
  // Clipping defect: stop the sheet scrolling and cap its height, so long
  // content is cut off at phone width.
  const context = await browser.newContext({ viewport: { width: 390, height: 700 } })
  const page = await context.newPage()
  await page.goto(`${BASE}?variant=dialog&theme=light&body=long`, { waitUntil: 'load' })
  await page.locator('.modal').waitFor({ state: 'visible' })
  await page.waitForTimeout(200)
  await assertCoverage(page, 'seed:clipping', { expectLongBody: true })
  const healthy = await detectClipping(page)
  await page.addStyleTag({ content: '.modal { overflow-y: hidden !important; max-height: 320px !important; }' })
  const seeded = await detectClipping(page)
  seeds.push({ name: 'clipping', healthy: healthy.ok, seeded: seeded.ok, detail: seeded })
  await context.close()
}

const stackingDetected = seeds[0].healthy === true && seeds[0].seeded === false
const clippingDetected = seeds[1].healthy === true && seeds[1].seeded === false
console.log(`seed stacking: healthy=${seeds[0].healthy} seeded=${seeds[0].seeded} -> ${stackingDetected ? 'detected' : 'MISSED'}`)
console.log(`seed clipping: healthy=${seeds[1].healthy} seeded=${seeds[1].seeded} -> ${clippingDetected ? 'detected' : 'MISSED'}`)
if (!stackingDetected || !clippingDetected) {
  await browser.close()
  console.log('\nSEED PROOF FAILED: the instrument cannot detect a dialog defect')
  process.exit(1)
}

// ------------------------------------------------------------ the comparison
let differences = 0
let compared = 0
const diffs = []
const coverage = []

for (const env of ENVS) {
  for (const variant of ['dialog', 'full']) {
    for (const body of ['short', 'long']) {
      // Long body at desktop adds nothing the phone case does not already cover.
      if (body === 'long' && env.width === 1440) continue
      const label = `${env.id} ${variant} ${body}`
      const measured = {}
      for (const [source, css] of [['before', beforeCss], ['after', afterCss]]) {
        const context = await browser.newContext({
          viewport: { width: env.width, height: env.width === 390 ? 700 : 900 },
          reducedMotion: env.reduced,
        })
        const page = await context.newPage()
        await page.goto(`${BASE}?variant=${variant}&theme=${env.theme}&body=${body}`, { waitUntil: 'load' })
        await page.locator('.modal').waitFor({ state: 'visible' })
        await useStylesheet(page, css)
        await page.waitForTimeout(200)

        const found = await assertCoverage(page, `${label} ${source}`, { expectLongBody: body === 'long' })
        // Freeze motion before measuring. The sheet animates in, and an unfrozen
        // sample reads opacity, transform and the rect mid-entrance as if they
        // were style. Freezing is the difference between measuring the surface
        // and measuring a frame of its entrance.
        await page.addStyleTag({
          content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
        })
        await page.waitForTimeout(60)
        const surfaces = await readSurfaces(page)
        const hit = await hitTestStacking(page)
        if (!hit.ok) throw new Error(`${label} ${source}: the dialog is not on top in its own build`)
        measured[source] = { surfaces, found }
        await context.close()
      }

      for (const part of ['overlay', 'dialog', 'head']) {
        const a = measured.before.surfaces[part]
        const b = measured.after.surfaces[part]
        if (!a || !b) {
          diffs.push(`${label} ${part}: missing in one build`)
          differences++
          continue
        }
        for (const p of [...PROPS, 'rect']) {
          compared++
          const av = p === 'rect' ? a.rect.join(',') : normaliseValue(p, a[p])
          const bv = p === 'rect' ? b.rect.join(',') : normaliseValue(p, b[p])
          if (av !== bv) diffs.push(`${label} ${part} :: ${p}: ${av} -> ${bv}`)
        }
      }
      coverage.push({ label, ...measured.after.found })
    }
  }
}

// Behaviour checks run once per environment on the after build.
const behaviour = []
for (const env of ENVS) {
  const context = await browser.newContext({
    viewport: { width: env.width, height: env.width === 390 ? 700 : 900 },
    reducedMotion: env.reduced,
  })
  const page = await context.newPage()
  await page.goto(`${BASE}?variant=dialog&theme=${env.theme}&trigger=button`, { waitUntil: 'load' })
  await page.locator('.modal').waitFor({ state: 'visible' })
  await useStylesheet(page, afterCss)
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.locator('.modal').waitFor({ state: 'detached' })

  const keyboard = await checkKeyboard(page, env.id)
  behaviour.push({ env: env.id, keyboard })

  const reopenContext = await browser.newContext({
    viewport: { width: env.width, height: env.width === 390 ? 700 : 900 },
    reducedMotion: env.reduced,
  })
  const reopenPage = await reopenContext.newPage()
  await reopenPage.goto(`${BASE}?variant=dialog&theme=${env.theme}&trigger=button`, { waitUntil: 'load' })
  await reopenPage.locator('.modal').waitFor({ state: 'visible' })
  await useStylesheet(reopenPage, afterCss)
  await reopenPage.waitForTimeout(200)
  const reopen = await checkReopen(reopenPage, env.id)
  behaviour.push({ env: env.id, reopen })
  await reopenContext.close()
  await context.close()
}

await browser.close()

differences += diffs.length
console.log(`\nenvironments=${ENVS.length} states=${coverage.length} property-comparisons=${compared}`)
console.log(`differences=${differences}`)
console.log(`behaviour-checks=${behaviour.length} (keyboard entry, Tab wrap, Escape, focus restore, reopen)`)
for (const d of diffs.slice(0, 30)) console.log('  ' + d)
writeReport(outDir, 'report.json', { seeds, coverage, behaviour, compared, differences, diffs })
if (differences) {
  console.log('\nCOMPARISON FAILED')
  process.exit(1)
}
console.log('\ncomparison passed with detection proven')
