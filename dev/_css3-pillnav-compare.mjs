// CSS-3 pill nav comparison and behaviour proof.
//
// Two jobs, kept apart on purpose:
//   1. STYLE: compare two built stylesheets on the real PillNav and
//      SegmentedTabs fixture, reading the glider, the ink window, the ink
//      copies, every tab, link and chip.
//   2. BEHAVIOUR: drive the same fixture and assert the glider lands on the
//      active item, that the ink window tracks it, that focus is reachable, that
//      the overflowing rail publishes its scroll state, and that an interrupted
//      switch and a rapid reversal still settle on the right box.
//
// Behaviour runs before any comparison is trusted, because a stylesheet move
// that breaks the glider would otherwise report "0 differences" on boxes that
// are all wrong in the same way.
//
// Usage:
//   node dev/_css3-pillnav-compare.mjs <before.css> <after.css> [--seed "<css>"]
//   node dev/_css3-pillnav-compare.mjs <before.css> <before.css>      # self-check
import fs from 'node:fs'
import { launchChrome } from './_css3-compare-lib.mjs'

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const seedIndex = process.argv.indexOf('--seed')
const seedCss = seedIndex > -1 ? process.argv[seedIndex + 1] : null
const only = process.argv.indexOf('--behaviour') > -1
const reportDir = 'dev/_css3-report-pillnav-fixture'

if (files.length < 2) {
  console.error('usage: node dev/_css3-pillnav-compare.mjs <before.css> <after.css> [--seed "<css>"] [--behaviour]')
  process.exit(2)
}
const [beforePath, afterPath] = files
const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8') + (seedCss ?? '')

const FIXTURE = 'http://127.0.0.1:5178/dev/css3-pillnav-fixture.html'
const THEMES = ['light', 'dark']
const WIDTHS = [390, 768, 1440]
const REDUCED = ['no-preference', 'reduce']

const PROPS = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-top-width',
  'border-bottom-color', 'border-left-color', 'border-right-color', 'border-radius',
  'border-top-left-radius', 'border-bottom-right-radius', 'box-shadow', 'opacity', 'transform',
  'font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height', 'text-transform',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'gap',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'overflow-x', 'overflow-y',
  'transition-property', 'transition-duration', 'transition-timing-function',
  'animation-name', 'animation-duration', 'pointer-events', 'cursor', 'visibility', 'box-sizing',
]

const FREEZE = '*, *::before, *::after { animation: none !important; transition: none !important; }'

const ROW_SELECTOR = '.pill-nav, .pill-ink, .pill-ink-row, .pill-glider'

async function swapStylesheet(page, css) {
  const removed = await page.evaluate(() => {
    const styles = [...document.querySelectorAll('style[data-vite-dev-id]')]
    for (const s of styles) s.remove()
    return styles.length
  })
  if (!removed) throw new Error('the dev server injected no stylesheet, so nothing was swapped')
  await page.addStyleTag({ content: css })
  await page.evaluate(() => document.fonts.ready)
}

/** Enumerate the whole pill-nav subtree in document order. */
async function snapshot(page, label) {
  const rows = await page.evaluate(({ props, roots }) => {
    const out = []
    const seen = new Set()
    for (const root of document.querySelectorAll(roots)) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (seen.has(el)) continue
        seen.add(el)
        const cs = getComputedStyle(el)
        const row = {
          key: `${el.className || el.tagName}|${out.length}`,
          tag: el.tagName.toLowerCase(),
          cls: el.getAttribute('class') ?? '',
        }
        for (const p of props) row[p] = cs.getPropertyValue(p)
        out.push(row)
      }
    }
    return out
  }, { props: PROPS, roots: ROW_SELECTOR })
  if (rows.length < 20) throw new Error(`${label}: only ${rows.length} element(s) read. The fixture did not render the family.`)
  return rows
}

function diff(before, after, label) {
  const out = []
  const byKey = new Map(after.map((r) => [r.key, r]))
  let compared = 0
  for (const a of before) {
    const b = byKey.get(a.key)
    if (!b) { out.push(`${label} ${a.key} (${a.tag}.${a.cls}) :: missing after`); continue }
    for (const p of PROPS) {
      compared++
      const av = String(a[p] ?? '').trim()
      const bv = String(b[p] ?? '').trim()
      if (av !== bv) out.push(`${label} ${a.key} (${a.tag}.${a.cls}) :: ${p}: ${av} -> ${bv}`)
    }
  }
  return { diffs: out, compared }
}

// ---------------------------------------------------------------- behaviour

const BEHAVIOUR_PROPS = ['left', 'top', 'width', 'height', 'opacity']

async function gliderOf(page, navIndex = 0) {
  return page.evaluate(({ index, props }) => {
    const nav = document.querySelectorAll('.pill-nav')[index]
    if (!nav) return null
    const glider = nav.querySelector('.pill-glider')
    const ink = nav.querySelector('.pill-ink')
    const active = nav.querySelector('[data-pill-key].active')
    if (!glider) return null
    const gs = getComputedStyle(glider)
    const is = ink ? getComputedStyle(ink) : null
    const box = (s) => Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)]))
    return {
      glider: box(gs),
      ink: is ? box(is) : null,
      activeKey: active?.getAttribute('data-pill-key') ?? null,
      overflowState: nav.dataset.overflow ?? null,
      scrollable: nav.scrollWidth > nav.clientWidth,
    }
  }, { index: navIndex, props: BEHAVIOUR_PROPS })
}

/** Does the glider cover the active item's own box? Returns the delta in px. */
async function gliderTracksActive(page, navIndex = 0) {
  return page.evaluate((index) => {
    const nav = document.querySelectorAll('.pill-nav')[index]
    if (!nav) throw new Error(`no pill-nav at index ${index}`)
    const glider = nav.querySelector('.pill-glider')
    const active = nav.querySelector('[data-pill-key].active')
    if (!glider || !active) throw new Error('glider or active item missing')
    const g = glider.getBoundingClientRect()
    const a = active.getBoundingClientRect()
    return {
      dx: Math.abs(g.left - a.left),
      dy: Math.abs(g.top - a.top),
      dw: Math.abs(g.width - a.width),
      dh: Math.abs(g.height - a.height),
      key: active.getAttribute('data-pill-key'),
    }
  }, navIndex)
}

async function behaviourPass(browser, theme, width, reducedMotion) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion })
  const findings = []
  const facts = {}
  try {
    await page.goto(FIXTURE, { waitUntil: 'networkidle' })
    await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(350)
    const label = `${theme}@${width}${reducedMotion === 'reduce' ? ' rm' : ''}`

    // 1. The glider covers the active item, and the ink window is the same box.
    const rested = await gliderTracksActive(page)
    facts.restedKey = rested.key
    facts.restedDelta = [rested.dx, rested.dy, rested.dw, rested.dh]
    if (Math.max(rested.dx, rested.dy, rested.dw, rested.dh) > 0.6) {
      findings.push(`${label}: the glider misses the active item by ${JSON.stringify(facts.restedDelta)}`)
    }
    const boxes = await gliderOf(page)
    facts.glider = boxes.glider
    facts.ink = boxes.ink
    if (boxes.ink) {
      for (const p of BEHAVIOUR_PROPS) {
        if (boxes.glider[p] !== boxes.ink[p]) {
          findings.push(`${label}: the ink window does not match the glider on ${p}: ${boxes.glider[p]} vs ${boxes.ink[p]}`)
        }
      }
      if (boxes.glider.opacity !== '1') findings.push(`${label}: the glider is not painted (opacity ${boxes.glider.opacity})`)
    }

    // 2. A switch moves the glider to the new item and it settles there.
    await page.evaluate(() => (window).__setTab('board'))
    await page.waitForTimeout(reducedMotion === 'reduce' ? 120 : 700)
    const moved = await gliderTracksActive(page)
    facts.movedKey = moved.key
    facts.movedDelta = [moved.dx, moved.dy, moved.dw, moved.dh]
    if (moved.key !== 'board') findings.push(`${label}: the switch did not land on board, it landed on ${moved.key}`)
    if (Math.max(moved.dx, moved.dy, moved.dw, moved.dh) > 0.6) {
      findings.push(`${label}: after a switch the glider misses by ${JSON.stringify(facts.movedDelta)}`)
    }

    // 3. An interrupted switch: change the key again mid-transition.
    await page.evaluate(() => (window).__setTab('map'))
    await page.waitForTimeout(40)
    await page.evaluate(() => (window).__setTab('group'))
    await page.waitForTimeout(reducedMotion === 'reduce' ? 140 : 800)
    const interrupted = await gliderTracksActive(page)
    facts.interruptedKey = interrupted.key
    facts.interruptedDelta = [interrupted.dx, interrupted.dy, interrupted.dw, interrupted.dh]
    if (interrupted.key !== 'group') findings.push(`${label}: an interrupted switch landed on ${interrupted.key}`)
    if (Math.max(interrupted.dx, interrupted.dy, interrupted.dw, interrupted.dh) > 0.6) {
      findings.push(`${label}: after an interrupted switch the glider misses by ${JSON.stringify(facts.interruptedDelta)}`)
    }

    // 4. Rapid reversal: forward, then straight back.
    await page.evaluate(() => (window).__setTab('timeline'))
    await page.waitForTimeout(30)
    await page.evaluate(() => (window).__setTab('overview'))
    await page.waitForTimeout(30)
    await page.evaluate(() => (window).__setTab('timeline'))
    await page.waitForTimeout(reducedMotion === 'reduce' ? 140 : 800)
    const reversed = await gliderTracksActive(page)
    facts.reversedKey = reversed.key
    facts.reversedDelta = [reversed.dx, reversed.dy, reversed.dw, reversed.dh]
    if (reversed.key !== 'timeline') findings.push(`${label}: a rapid reversal landed on ${reversed.key}`)
    if (Math.max(reversed.dx, reversed.dy, reversed.dw, reversed.dh) > 0.6) {
      findings.push(`${label}: after a rapid reversal the glider misses by ${JSON.stringify(facts.reversedDelta)}`)
    }

    // 5. Keyboard: the roving tab stop and arrows reach every tab.
    //
    // The real item is `:scope > [data-pill-key]`. A plain `.tab-btn` also
    // matches the decorative ink COPIES inside `.pill-ink-row`, which are spans
    // with no key, no handler and no tab stop. An earlier version of this check
    // picked one of those and reported "0 stops" and "no focus ring" on a
    // healthy stylesheet.
    const firstTab = page.locator('.pill-nav > [data-pill-key].tab-btn').first()
    await firstTab.focus()
    let reached = 0
    for (let i = 0; i < 7; i++) {
      const ok = await page.evaluate(() => {
        const el = document.activeElement
        return el instanceof HTMLElement &&
          el.hasAttribute('data-pill-key') &&
          el.classList.contains('tab-btn') &&
          !el.closest('.pill-ink-row')
      })
      if (ok) reached++
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(60)
    }
    facts.keyboardReached = reached
    if (reached < 2) findings.push(`${label}: arrow keys did not move focus between tabs (${reached} stops)`)

    // 6. Focus ring on the real active item is real, not the cleared fill.
    const ring = await page.evaluate(() => {
      const active = document.querySelector('.pill-nav > .tab-btn.active[data-pill-key]')
      if (!active) return null
      active.focus()
      const s = getComputedStyle(active)
      return {
        boxShadow: s.boxShadow,
        outline: `${s.outlineStyle} ${s.outlineWidth}`,
        focusVisible: active.matches(':focus-visible'),
      }
    })
    facts.ring = ring
    if (ring && ring.boxShadow === 'none' && /none/.test(ring.outline)) {
      findings.push(`${label}: the active tab has no visible focus indicator`)
    }

    // 7. The overflowing rail publishes its scroll state, then changes it.
    if (width <= 768) {
      const before = await gliderOf(page)
      facts.overflowBefore = before.overflowState
      facts.scrollable = before.scrollable
      if (before.scrollable) {
        await page.evaluate(() => { const n = document.querySelectorAll('.pill-nav')[0]; n.scrollLeft = n.scrollWidth })
        await page.waitForTimeout(200)
        const after = await gliderOf(page)
        facts.overflowAfter = after.overflowState
        if (before.overflowState === after.overflowState) {
          findings.push(`${label}: the rail scroll did not update data-overflow (${before.overflowState})`)
        }
      }
    }

    // 8. Reduced motion: the glider may not animate.
    if (reducedMotion === 'reduce') {
      const t = await page.evaluate(() => {
        const g = document.querySelector('.pill-glider')
        const i = document.querySelector('.pill-ink')
        return {
          glider: g ? getComputedStyle(g).transitionDuration : null,
          ink: i ? getComputedStyle(i).transitionDuration : null,
        }
      })
      facts.reducedTransition = t
      // The reduced-motion rules collapse the transition to a near-zero value
      // (`1e-05s`), which is the deliberate "keep the event, hide the motion"
      // form. Anything under a millisecond is reduced; anything longer is not.
      const isReduced = (v) => !v || v.split(',').every((part) => parseFloat(part) < 0.001)
      if (t.glider && !isReduced(t.glider)) findings.push(`${label}: the glider still transitions under reduced motion (${t.glider})`)
      if (t.ink && !isReduced(t.ink)) findings.push(`${label}: the ink window still transitions under reduced motion (${t.ink})`)
    }
  } finally {
    await page.close()
  }
  return { findings, facts }
}

// ---------------------------------------------------------------- runner

const evidence = {
  utc: new Date().toISOString(), before: beforePath, after: afterPath,
  seeded: Boolean(seedCss), behaviour: [], cases: [], diffs: [],
}
const browser = await launchChrome()
try {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const rm of REDUCED) {
        const { findings, facts } = await behaviourPass(browser, theme, width, rm)
        const label = `${theme}@${width}${rm === 'reduce' ? ' rm' : ''}`
        evidence.behaviour.push({ label, findings, facts })
        evidence.diffs.push(...findings)
      }
    }
  }

  if (!only) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        for (const rm of REDUCED) {
          const label = `${theme}@${width}${rm === 'reduce' ? ' rm' : ''}`
          const read = async (css) => {
            const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: rm })
            try {
              await page.goto(FIXTURE, { waitUntil: 'networkidle' })
              await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
              await page.addStyleTag({ content: FREEZE })
              await page.evaluate(() => document.fonts.ready)
              await swapStylesheet(page, css)
              await page.waitForTimeout(120)
              return await snapshot(page, label)
            } finally {
              await page.close()
            }
          }
          const before = await read(beforeCss)
          const after = await read(afterCss)
          if (before.length !== after.length) {
            evidence.diffs.push(`${label} :: element count ${before.length} -> ${after.length}`)
          }
          const { diffs, compared } = diff(before, after, label)
          evidence.diffs.push(...diffs)
          evidence.cases.push({ label, elements: before.length, compared })
        }
      }
    }
  }
} finally {
  await browser.close()
}

const totalCompared = evidence.cases.reduce((n, c) => n + (c.compared ?? 0), 0)
const totalElements = evidence.cases.reduce((n, c) => n + (c.elements ?? 0), 0)
const behaviourChecks = evidence.behaviour.length
evidence.totals = { behaviourChecks, totalElements, totalCompared, diffs: evidence.diffs.length }

fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(`${reportDir}/${seedCss ? 'seeded' : 'result'}.json`, JSON.stringify(evidence, null, 1))

const head = `pill nav: ${behaviourChecks} behaviour pass(es), ${totalElements} element reads, ${totalCompared} compared values, ${evidence.diffs.length} problem(s)`
if (evidence.diffs.length) {
  console.error(`\n${head}`)
  for (const d of evidence.diffs.slice(0, 40)) console.error(`  ${d}`)
  if (evidence.diffs.length > 40) console.error(`  ... ${evidence.diffs.length - 40} more`)
  process.exit(1)
}
console.log(`\n${head}`)
