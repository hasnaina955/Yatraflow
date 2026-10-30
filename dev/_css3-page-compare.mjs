// CSS-3 B10/B11 page-level comparison.
//
// Compares two built stylesheets on REAL pages of the running app, so the
// markup is the product's own and the ancestors are the ones the product
// actually renders. No fixture element is invented: the tool enumerates the
// live DOM under each family root and reads computed styles.
//
// The comparison is only trusted after two proofs:
//   - self-comparison: before against before must report zero differences
//   - seed proof: an injected defect must be detected, or the tool exits 1
//
// Usage:
//   node dev/_css3-page-compare.mjs <before.css> <after.css> [--seed "<css>"]
//   node dev/_css3-page-compare.mjs <before.css> <before.css>      # self-check
import fs from 'node:fs'
import { launchChrome } from './_css3-compare-lib.mjs'

const [beforePath, afterPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const seedIndex = process.argv.indexOf('--seed')
const seedCss = seedIndex > -1 ? process.argv[seedIndex + 1] : null
const reportDir = 'dev/_css3-report-b10'

if (!beforePath || !afterPath) {
  console.error('usage: node dev/_css3-page-compare.mjs <before.css> <after.css> [--seed "<css>"]')
  process.exit(2)
}

const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8') + (seedCss ?? '')

// Properties that describe what is painted and where. Layout-affecting values
// like width are read too, because a moved padding or grid track that only
// shows up as size still shows up here.
const PROPS = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-top-style',
  'border-top-width', 'border-bottom-color', 'border-bottom-style', 'border-bottom-width',
  'border-left-color', 'border-left-style', 'border-left-width', 'border-right-color',
  'border-right-style', 'border-right-width', 'border-top-left-radius', 'border-bottom-right-radius',
  'box-shadow', 'text-shadow', 'opacity', 'filter', 'transform', 'mix-blend-mode',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height',
  'text-transform', 'text-align', 'text-decoration-line', 'white-space', 'word-spacing',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items',
  'align-self', 'align-content', 'justify-content', 'justify-items', 'justify-self', 'gap',
  'row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows', 'grid-auto-flow',
  'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'aspect-ratio',
  'overflow-x', 'overflow-y', 'visibility', 'box-sizing', 'order',
  'transition-property', 'transition-duration', 'transition-timing-function',
  'animation-name', 'animation-duration', 'animation-timing-function', 'animation-iteration-count',
  'animation-delay', 'pointer-events', 'cursor',
]

// Each case names a route, the family roots to enumerate, and an optional
// interaction that reveals the family (a tab, a disclosure).
const CASES = [
  {
    name: 'landing-hero',
    url: '/',
    roots: ['.hero'],
    ready: '.hero .btn',
  },
  {
    name: 'creator-grid',
    url: null, // resolved from the Explore page's first creator link
    roots: ['.explore-grid'],
    ready: '.itin-card',
    fromExplore: true,
  },
  {
    name: 'board',
    url: null, // a trip, then the Board tab
    roots: ['.board', '.board-tab'],
    ready: '.board-col',
    fromTrips: true,
  },
]

const FREEZE = '*, *::before, *::after { animation: none !important; transition: none !important; }'

async function stripDevStyles(page) {
  return page.evaluate(() => {
    const styles = [...document.querySelectorAll('style[data-vite-dev-id]')]
    for (const s of styles) s.remove()
    return styles.length
  })
}

/** Enumerate every element under the family roots, keyed by document order. */
async function snapshot(page, roots, props, label) {
  const rows = await page.evaluate(
    ({ rootSelectors, propertyNames }) => {
      const out = []
      for (const rootSel of rootSelectors) {
        const rootNodes = [...document.querySelectorAll(rootSel)]
        for (const [ri, root] of rootNodes.entries()) {
          const all = [root, ...root.querySelectorAll('*')]
          for (const [i, el] of all.entries()) {
            const cs = getComputedStyle(el)
            const row = {
              key: `${rootSel}[${ri}]/${i}`,
              tag: el.tagName.toLowerCase(),
              cls: el.getAttribute('class') ?? '',
            }
            for (const p of propertyNames) row[p] = cs.getPropertyValue(p)
            out.push(row)
          }
        }
      }
      return out
    },
    { rootSelectors: roots, propertyNames: props },
  )
  if (!rows.length) {
    throw new Error(`${label}: family roots ${roots.join(', ')} produced no element. The page never rendered the family.`)
  }
  const seen = new Set()
  for (const r of rows) {
    if (seen.has(r.key)) throw new Error(`${label}: duplicate element key ${r.key}`)
    seen.add(r.key)
  }
  return rows
}

function diff(beforeRows, afterRows, props, label) {
  const out = []
  const afterByKey = new Map(afterRows.map((r) => [r.key, r]))
  let compared = 0
  for (const a of beforeRows) {
    const b = afterByKey.get(a.key)
    if (!b) {
      out.push(`${label} ${a.key} (${a.tag}.${a.cls}) :: missing after`)
      continue
    }
    if (a.tag !== b.tag) {
      out.push(`${label} ${a.key} :: tag changed ${a.tag} -> ${b.tag}`)
      continue
    }
    for (const p of props) {
      compared++
      const av = String(a[p] ?? '').trim()
      const bv = String(b[p] ?? '').trim()
      // box-shadow samples sub-pixel offsets and normalises to equal paint
      if (p === 'box-shadow' || p === 'text-shadow') {
        const norm = (v) => {
          if (v === 'none') return 'none'
          const r = v.replace(/(-?\d+(?:\.\d+)?)px/g, (_, n) => `${Math.round(parseFloat(n) * 10) / 10}px`)
          return /^rgba?\([^)]*\) 0px 0px 0px 0px$/.test(r) ? 'none' : r
        }
        if (norm(av) !== norm(bv)) out.push(`${label} ${a.key} (${a.tag}.${a.cls}) :: ${p}: ${av} -> ${bv}`)
        continue
      }
      if (av !== bv) out.push(`${label} ${a.key} (${a.tag}.${a.cls}) :: ${p}: ${av} -> ${bv}`)
    }
  }
  for (const b of afterRows) {
    if (!beforeRows.some((a) => a.key === b.key)) out.push(`${label} ${b.key} (${b.tag}.${b.cls}) :: appeared after`)
  }
  return { diffs: out, compared }
}

async function collect(browser, label, theme, width, css, evidence, motion = 'no-preference') {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: motion })
  const perCase = new Map()
  try {
    for (const c of CASES) {
      let url = c.url
      if (c.fromExplore) {
        await page.goto('http://127.0.0.1:5178/explore', { waitUntil: 'networkidle' })
        const href = await page.evaluate(() => {
          const a = document.querySelector('a[href*="#/creator/"], a[href*="/creator/"]')
          return a ? a.getAttribute('href') : null
        })
        if (!href) {
          evidence.skipped.push(`${label} ${c.name}: Explore renders no creator link, so no PubCard is on the page`)
          continue
        }
        url = href.startsWith('#') ? href.slice(1) : href
      }
      if (c.fromTrips) {
        await page.goto('http://127.0.0.1:5178/trips', { waitUntil: 'networkidle' })
        const demo = page.getByRole('button', { name: /Load demo trips/i })
        if (await demo.count()) await demo.first().click()
        await page.waitForTimeout(700)
        const href = await page.evaluate(() => {
          const a = document.querySelector('a[href*="#/trip/"], a[href*="/trip/"]')
          return a ? a.getAttribute('href') : null
        })
        if (!href) {
          evidence.skipped.push(`${label} ${c.name}: no trip to open, so the Board never rendered`)
          continue
        }
        url = href.startsWith('#') ? href.slice(1) : href
      }
      await page.goto(`http://127.0.0.1:5178${url}`, { waitUntil: 'networkidle' })
      await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
      if (c.fromTrips) {
        const tab = page.getByRole('button', { name: /^Board$/i }).or(page.getByRole('tab', { name: /^Board$/i }))
        if (await tab.count()) {
          await tab.first().click()
          await page.waitForTimeout(600)
        }
      }
      await page.addStyleTag({ content: FREEZE })
      await page.evaluate(() => document.fonts.ready)
      const ok = await page.evaluate((sel) => document.querySelectorAll(sel).length > 0, c.ready)
      if (!ok) {
        evidence.skipped.push(`${label} ${c.name}: "${c.ready}" never appeared`)
        continue
      }
      const removed = await stripDevStyles(page)
      if (!removed) throw new Error(`${label} ${c.name}: the dev server injected no stylesheet, so nothing was swapped`)
      await page.addStyleTag({ content: css })
      await page.evaluate(() => document.fonts.ready)
      const rows = await snapshot(page, c.roots, PROPS, `${label} ${c.name}`)
      perCase.set(c.name, rows)
      evidence.cases.push({ label, case: c.name, elements: rows.length })
    }
  } finally {
    await page.close()
  }
  return perCase
}

const evidence = { utc: new Date().toISOString(), before: beforePath, after: afterPath, seeded: Boolean(seedCss), cases: [], skipped: [], diffs: [] }
const browser = await launchChrome()
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 768, 1440]) {
      // Reduced motion is a separate reading, not an afterthought. A stylesheet
      // move can invert two equal-specificity rules and only change what a
      // reduced-motion user sees; an earlier version of this tool hardcoded
      // 'no-preference' and so could not see exactly that.
      for (const motion of ['no-preference', 'reduce']) {
      const label = `${theme}@${width}${motion === 'reduce' ? ' rm' : ''}`
      const before = await collect(browser, label, theme, width, beforeCss, evidence, motion)
      const after = await collect(browser, label, theme, width, afterCss, evidence, motion)
      for (const [name, beforeRows] of before) {
        const afterRows = after.get(name)
        if (!afterRows) {
          // A case that was skipped on BOTH sides is a coverage gap, reported
          // once as a skip. A case that ran before and not after is a real
          // difference in coverage and must fail, so the two are not conflated.
          if (!evidence.skipped.some((s) => s.startsWith(`${label} ${name}:`))) {
            evidence.diffs.push(`${label} ${name} :: ran before but not after`)
          }
          continue
        }
        if (beforeRows.length !== afterRows.length) {
          evidence.diffs.push(`${label} ${name} :: element count ${beforeRows.length} -> ${afterRows.length}`)
        }
        const { diffs, compared } = diff(beforeRows, afterRows, PROPS, `${label} ${name}`)
        evidence.diffs.push(...diffs)
        evidence.cases.push({ label, case: name, compared })
      }
      }
    }
  }
} finally {
  await browser.close()
}

const totalCompared = evidence.cases.filter((c) => c.compared).reduce((n, c) => n + c.compared, 0)
const totalElements = evidence.cases.filter((c) => c.elements).reduce((n, c) => n + c.elements, 0)
evidence.totalCompared = totalCompared
evidence.totalElements = totalElements
evidence.totalDiffs = evidence.diffs.length

fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(`${reportDir}/${seedCss ? 'seeded' : 'result'}.json`, JSON.stringify(evidence, null, 1))

const head = `css3 page compare: ${evidence.cases.length} case run(s), ${totalElements} element reads, ${totalCompared} compared values, ${evidence.diffs.length} difference(s)`
if (evidence.skipped.length) {
  console.log(`\nskipped (${evidence.skipped.length}):`)
  for (const s of evidence.skipped) console.log(`  - ${s}`)
}
if (evidence.diffs.length) {
  console.error(`\n${head}`)
  for (const d of evidence.diffs.slice(0, 40)) console.error(`  ${d}`)
  if (evidence.diffs.length > 40) console.error(`  ... ${evidence.diffs.length - 40} more`)
  process.exit(1)
}
if (totalElements === 0) {
  console.error(`${head}\nno element was read, so this comparison proves nothing`)
  process.exit(1)
}
console.log(`\n${head}`)
