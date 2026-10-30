// CSS-3 board comparison.
//
// The Board renders only inside the trip workspace, so this drives the real
// `TripWorkspace` through `dev/overview-fixture.html?tab=board`. The fixture
// mounts the product component with synthetic trip data; nothing about the
// Board markup is re-implemented here.
//
// It reads every element under the board roots, then swaps the stylesheet on the
// same DOM and reads again, so a difference is the stylesheet and not a re-render.
//
// Usage:
//   node dev/_css3-board-compare.mjs <before.css> <after.css> [--seed "<css>"]
//   node dev/_css3-board-compare.mjs <before.css> <before.css>      # self-check
import fs from 'node:fs'
import { launchChrome } from './_css3-compare-lib.mjs'

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const seedIndex = process.argv.indexOf('--seed')
const seedCss = seedIndex > -1 ? process.argv[seedIndex + 1] : null
const reportDir = 'dev/_css3-report-board'

if (files.length < 2) {
  console.error('usage: node dev/_css3-board-compare.mjs <before.css> <after.css> [--seed "<css>"]')
  process.exit(2)
}
const [beforePath, afterPath] = files
const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8') + (seedCss ?? '')

const FIXTURE = (tab, theme) =>
  `http://127.0.0.1:5178/dev/overview-fixture.html?tab=${tab}&theme=${theme}`
const THEMES = ['light', 'dark']
const WIDTHS = [390, 768, 1440]
const REDUCED = ['no-preference', 'reduce']

// The board family is 29 classes. These roots cover the surface plus the two
// page wrappers the family is scoped by, so an ancestor rule is measured too.
const ROOTS = ['.board', '.board-tab']

const PROPS = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-top-width',
  'border-bottom-color', 'border-bottom-width', 'border-left-color', 'border-left-width',
  'border-right-color', 'border-right-width', 'border-radius', 'border-top-left-radius',
  'box-shadow', 'opacity', 'transform', 'filter',
  'font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height', 'text-transform',
  'text-align', 'white-space', 'text-overflow',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-self', 'justify-content', 'gap', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-auto-flow',
  'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'aspect-ratio',
  'overflow-x', 'overflow-y', 'visibility', 'box-sizing', 'order', 'cursor', 'pointer-events',
  'transition-property', 'transition-duration', 'animation-name', 'animation-duration',
]

const FREEZE = '*, *::before, *::after { animation: none !important; transition: none !important; }'

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

async function openBoard(browser, theme, width, reducedMotion) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(FIXTURE('board', theme), { waitUntil: 'networkidle' })
  await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(900)
  const ready = await page.evaluate(() => document.querySelectorAll('.board-col').length)
  if (!ready) {
    await page.close()
    throw new Error(`${theme}@${width}: the Board did not render, so there is nothing to measure`)
  }
  if (errors.length) {
    await page.close()
    throw new Error(`${theme}@${width}: the fixture threw: ${errors[0].slice(0, 200)}`)
  }
  return page
}

async function snapshot(page, label) {
  const rows = await page.evaluate(({ props, roots }) => {
    const out = []
    const seen = new Set()
    for (const rootSel of roots) {
      for (const root of document.querySelectorAll(rootSel)) {
        for (const el of [root, ...root.querySelectorAll('*')]) {
          if (seen.has(el)) continue
          seen.add(el)
          const cs = getComputedStyle(el)
          const row = {
            key: `${rootSel}:${out.length}`,
            tag: el.tagName.toLowerCase(),
            cls: el.getAttribute('class') ?? '',
          }
          for (const p of props) row[p] = cs.getPropertyValue(p)
          out.push(row)
        }
      }
    }
    return out
  }, { props: PROPS, roots: ROOTS })
  if (rows.length < 40) {
    throw new Error(`${label}: only ${rows.length} element(s) read under ${ROOTS.join(', ')}. The Board did not render.`)
  }
  return rows
}

function diff(before, after, label) {
  const out = []
  const byKey = new Map(after.map((r) => [r.key, r]))
  let compared = 0
  for (const a of before) {
    const b = byKey.get(a.key)
    if (!b) { out.push(`${label} ${a.key} (${a.tag}.${a.cls}) :: missing after`); continue }
    if (a.tag !== b.tag) { out.push(`${label} ${a.key} :: tag ${a.tag} -> ${b.tag}`); continue }
    for (const p of PROPS) {
      compared++
      const av = String(a[p] ?? '').trim()
      const bv = String(b[p] ?? '').trim()
      if (av !== bv) out.push(`${label} ${a.key} (${a.tag}.${a.cls}) :: ${p}: ${av} -> ${bv}`)
    }
  }
  return { diffs: out, compared }
}

/** Behaviour that a stylesheet move must not change. */
async function behaviourPass(browser, theme, width, reducedMotion) {
  const page = await openBoard(browser, theme, width, reducedMotion)
  const findings = []
  const facts = {}
  const label = `${theme}@${width}${reducedMotion === 'reduce' ? ' rm' : ''}`
  try {
    facts.counts = await page.evaluate(() => {
      const q = (s) => document.querySelectorAll(s).length
      return {
        columns: q('.board-col'),
        stops: q('.board-stop'),
        rows: q('.board-row'),
        zones: q('.board-col-zone'),
        kickers: q('.board-stop-kicker'),
        metas: q('.board-stop-meta'),
        fit: q('.board-fit'),
        pulse: q('.board-pulse'),
      }
    })
    if (!facts.counts.columns || !facts.counts.stops) {
      findings.push(`${label}: the Board rendered ${facts.counts.columns} columns and ${facts.counts.stops} stops`)
    }

    // The Board must be visible and laid out, not a zero-size canvas.
    const box = await page.evaluate(() => {
      const b = document.querySelector('.board')
      if (!b) return null
      const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      return { w: r.width, h: r.height, display: cs.display, overflow: cs.overflow, radius: cs.borderRadius }
    })
    facts.board = box
    if (!box || box.w < 200 || box.h < 200) findings.push(`${label}: the board box is ${box ? `${box.w}x${box.h}` : 'missing'}`)

    // Every stop is reachable by keyboard, and the fit control works.
    const focus = await page.evaluate(() => {
      const f = document.querySelector('.board-fit')
      if (!f) return null
      f.focus()
      return { focused: document.activeElement === f, visible: getComputedStyle(f).visibility }
    })
    facts.fitFocus = focus
    if (focus && !focus.focused) findings.push(`${label}: the fit control refuses focus`)

    // The board columns scroll independently; the family owns that box.
    facts.scroll = await page.evaluate(() => {
      const c = document.querySelector('.board-col-stops')
      if (!c) return null
      const cs = getComputedStyle(c)
      return { overflowY: cs.overflowY, scrollable: c.scrollHeight > c.clientHeight }
    })

    // A stop keeps its kind accent: it paints a gradient, not a flat fill, so
    // reading only background-color reports a false failure. The tint differs per
    // kind, which is the thing worth asserting.
    facts.stopPaint = await page.evaluate(() => {
      const stops = [...document.querySelectorAll('.board-stop')]
      if (!stops.length) return null
      const read = (s) => {
        const cs = getComputedStyle(s)
        return { bg: cs.backgroundColor, img: cs.backgroundImage, radius: cs.borderRadius, border: cs.borderTopColor }
      }
      const tints = new Set(stops.map((s) => read(s).img))
      return { first: read(stops[0]), distinctTints: tints.size, count: stops.length }
    })
    if (facts.stopPaint) {
      const painted = facts.stopPaint.first.img !== 'none' || facts.stopPaint.first.bg !== 'rgba(0, 0, 0, 0)'
      if (!painted) findings.push(`${label}: a board stop paints no fill and no gradient`)
      if (facts.stopPaint.distinctTints < 2) {
        findings.push(`${label}: every board stop shares one tint (${facts.stopPaint.distinctTints}), so the kind accent is not reaching the card`)
      }
    }

    if (reducedMotion === 'reduce') {
      const t = await page.evaluate(() => {
        const els = [...document.querySelectorAll('.board, .board-col, .board-stop')]
        return els.slice(0, 3).map((e) => getComputedStyle(e).transitionDuration)
      })
      facts.reducedTransition = t
      const isReduced = (v) => !v || v.split(',').every((p) => parseFloat(p) < 0.001)
      if (t.some((v) => !isReduced(v))) findings.push(`${label}: a board surface still transitions under reduced motion (${t.join(' | ')})`)
    }
  } finally {
    await page.close()
  }
  return { label, findings, facts }
}

const evidence = { utc: new Date().toISOString(), before: beforePath, after: afterPath, seeded: Boolean(seedCss), behaviour: [], cases: [], diffs: [] }
const browser = await launchChrome()
try {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const rm of REDUCED) {
        const { label, findings, facts } = await behaviourPass(browser, theme, width, rm)
        evidence.behaviour.push({ label, findings, facts })
        evidence.diffs.push(...findings)
      }
    }
  }

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const rm of REDUCED) {
        const label = `${theme}@${width}${rm === 'reduce' ? ' rm' : ''}`
        const read = async (css) => {
          const page = await openBoard(browser, theme, width, rm)
          try {
            await page.addStyleTag({ content: FREEZE })
            await swapStylesheet(page, css)
            await page.waitForTimeout(150)
            return await snapshot(page, label)
          } finally {
            await page.close()
          }
        }
        const before = await read(beforeCss)
        const after = await read(afterCss)
        if (before.length !== after.length) evidence.diffs.push(`${label} :: element count ${before.length} -> ${after.length}`)
        const { diffs, compared } = diff(before, after, label)
        evidence.diffs.push(...diffs)
        evidence.cases.push({ label, elements: before.length, compared })
      }
    }
  }
} finally {
  await browser.close()
}

const totalCompared = evidence.cases.reduce((n, c) => n + (c.compared ?? 0), 0)
const totalElements = evidence.cases.reduce((n, c) => n + (c.elements ?? 0), 0)
evidence.totals = { behaviourChecks: evidence.behaviour.length, totalElements, totalCompared, diffs: evidence.diffs.length }

fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(`${reportDir}/${seedCss ? 'seeded' : 'result'}.json`, JSON.stringify(evidence, null, 1))

const head = `board: ${evidence.behaviour.length} behaviour pass(es), ${totalElements} element reads, ${totalCompared} compared values, ${evidence.diffs.length} problem(s)`
if (evidence.diffs.length) {
  console.error(`\n${head}`)
  for (const d of evidence.diffs.slice(0, 40)) console.error(`  ${d}`)
  if (evidence.diffs.length > 40) console.error(`  ... ${evidence.diffs.length - 40} more`)
  process.exit(1)
}
console.log(`\n${head}`)
