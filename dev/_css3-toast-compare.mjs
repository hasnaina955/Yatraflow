// CSS-3 B9: toast comparison, on the real ToastZone and the real toast() API.
//
// Toast-specific risks, both proven detectable before the result is trusted:
//   - the semantic fill: .ok and .err must not render as the same neutral pill,
//     which is the exact defect the dark-theme rule once caused
//   - the accessible ink: the toast text must keep contrast on its own fill
import fs from 'node:fs'
import { launchChrome, normaliseValue, writeReport } from './_css3-compare-lib.mjs'

const [beforePath, afterPath, outDir = 'dev/_css3-report-toast'] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('usage: node dev/_css3-toast-compare.mjs <before.css> <after.css> [outDir]')
  process.exit(2)
}

const BASE = 'http://localhost:5178/dev/css3-toast-fixture.html'

const PROPS = [
  'position', 'bottom', 'left', 'right', 'z-index', 'display', 'flex-direction',
  'align-items', 'justify-content', 'gap', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'border-radius', 'background-color', 'color',
  'font-size', 'font-weight', 'box-shadow', 'max-width', 'width', 'pointer-events',
  'opacity', 'transform', 'animation-name', 'animation-duration',
]

const ENVS = [
  { id: 'light-desktop', theme: 'light', width: 1440, reduced: 'no-preference' },
  { id: 'dark-desktop', theme: 'dark', width: 1440, reduced: 'no-preference' },
  { id: 'light-phone', theme: 'light', width: 390, reduced: 'no-preference' },
  { id: 'dark-phone', theme: 'dark', width: 390, reduced: 'no-preference' },
  { id: 'light-reduced', theme: 'light', width: 1440, reduced: 'reduce' },
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

/** Freeze motion so a slide-in is not sampled mid-flight. */
async function freezeMotion(page) {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  })
  await page.waitForTimeout(60)
}

async function readToasts(page) {
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
      zone: pick(document.querySelector('.toast-zone')),
      toasts: [...document.querySelectorAll('.toast')].map(pick),
      actions: [...document.querySelectorAll('.toast-action')].map(pick),
    }
  }, PROPS)
}

/**
 * Coverage assertions. A comparison that quietly measured nothing still reports
 * zero, so every state this tool claims is asserted to exist first.
 */
async function assertCoverage(page, label, { expectCount, expectAction }) {
  const found = await page.evaluate(() => {
    const zone = document.querySelector('.toast-zone')
    const toasts = [...document.querySelectorAll('.toast')]
    return {
      zone: !!zone,
      zoneRole: zone?.getAttribute('role') ?? null,
      zoneLive: zone?.getAttribute('aria-live') ?? null,
      count: toasts.length,
      kinds: toasts.map((t) => [...t.classList].filter((c) => c !== 'toast').join('+') || 'neutral'),
      alertRoles: toasts.filter((t) => t.getAttribute('role') === 'alert').length,
      actions: document.querySelectorAll('.toast-action').length,
    }
  })
  if (!found.zone) throw new Error(`${label}: no .toast-zone rendered`)
  if (found.zoneRole !== 'status') throw new Error(`${label}: the zone lost role="status"`)
  if (found.zoneLive !== 'polite') throw new Error(`${label}: the zone lost aria-live="polite"`)
  if (expectCount !== undefined && found.count !== expectCount) {
    throw new Error(`${label}: expected ${expectCount} toast(s), found ${found.count}`)
  }
  if (expectAction !== undefined && found.actions !== expectAction) {
    throw new Error(`${label}: expected ${expectAction} toast action(s), found ${found.actions}`)
  }
  if (expectCount > 0) {
    const faded = await page.evaluate(() =>
      [...document.querySelectorAll('.toast')].every((t) => {
        const s = getComputedStyle(t)
        return Number(s.opacity) > 0.9
      }),
    )
    if (!faded) throw new Error(`${label}: a toast is not fully visible, so its surface was not measured`)
  }
  return found
}

/**
 * The semantic fill check: success and error must not share one fill. This is
 * the defect the dark-theme override once caused by winning on order.
 */
async function semanticFills(page) {
  return page.evaluate(() => {
    const get = (kind) => {
      const el = document.querySelector(`.toast.${kind}`)
      if (!el) return null
      const s = getComputedStyle(el)
      return { bg: s.backgroundColor, ink: s.color }
    }
    return { ok: get('ok'), err: get('err') }
  })
}

/** Contrast of the toast ink against its own painted fill. */
function contrastOnFill(fill, ink) {
  const parse = (v) => {
    const m = String(v).match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return parts.slice(0, 3)
  }
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((c) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const f = parse(fill)
  const i = parse(ink)
  if (!f || !i) return null
  const l1 = lum(f)
  const l2 = lum(i)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

const browser = await launchChrome()
const beforeCss = fs.readFileSync(beforePath, 'utf8')
const afterCss = fs.readFileSync(afterPath, 'utf8')

// ---------------------------------------------------------------- seed proofs
const seeds = []

{
  // Semantic-fill seed: make the neutral dark rule beat .ok and .err, which is
  // the exact defect the source comment records.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`${BASE}?theme=dark&kind=many`, { waitUntil: 'load' })
  await page.locator('.toast').first().waitFor({ state: 'visible' })
  await freezeMotion(page)
  const healthy = await semanticFills(page)
  await page.addStyleTag({
    content: "[data-theme='dark'] .toast.ok, [data-theme='dark'] .toast.err { background: var(--gray-900) !important; }",
  })
  const seeded = await semanticFills(page)
  const healthyDistinct = !!healthy.ok && !!healthy.err && healthy.ok.bg !== healthy.err.bg
  const seededSame = !!seeded.ok && !!seeded.err && seeded.ok.bg === seeded.err.bg
  seeds.push({ name: 'semantic-fill', healthy: healthyDistinct, seeded: seededSame })
  await page.close()
}

{
  // Ink-contrast seed: paint the ink onto the fill so it disappears.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}?theme=light&kind=ok`, { waitUntil: 'load' })
  await page.locator('.toast').first().waitFor({ state: 'visible' })
  await freezeMotion(page)
  const healthy = await page.evaluate(() => {
    const t = document.querySelector('.toast.ok')
    const s = getComputedStyle(t)
    return { bg: s.backgroundColor, ink: s.color }
  })
  const healthyRatio = contrastOnFill(healthy.bg, healthy.ink)
  await page.addStyleTag({ content: '.toast.ok { color: var(--teal-deep) !important; }' })
  const seeded = await page.evaluate(() => {
    const t = document.querySelector('.toast.ok')
    const s = getComputedStyle(t)
    return { bg: s.backgroundColor, ink: s.color }
  })
  const seededRatio = contrastOnFill(seeded.bg, seeded.ink)
  const detected = healthyRatio !== null && seededRatio !== null && healthyRatio >= 4.5 && seededRatio < 3
  seeds.push({ name: 'ink-contrast', healthy: healthyRatio, seeded: seededRatio, detected })
  await page.close()
}

const semanticDetected = seeds[0].healthy === true && seeds[0].seeded === true
const inkDetected = seeds[1].detected === true
console.log(`seed semantic-fill: healthy=${seeds[0].healthy} seeded-same=${seeds[0].seeded} -> ${semanticDetected ? 'detected' : 'MISSED'}`)
console.log(`seed ink-contrast: healthy=${seeds[1].healthy} seeded=${seeds[1].seeded} -> ${inkDetected ? 'detected' : 'MISSED'}`)
if (!semanticDetected || !inkDetected) {
  await browser.close()
  console.log('\nSEED PROOF FAILED: the instrument cannot detect a toast defect')
  process.exit(1)
}

// ------------------------------------------------------------ the comparison
const STATES = [
  { kind: 'ok', count: 1, action: 0 },
  { kind: 'err', count: 1, action: 0 },
  { kind: 'undo', count: 1, action: 1 },
  { kind: 'many', count: 3, action: 1 },
]

let differences = 0
let compared = 0
const diffs = []
const coverage = []
const contrasts = []

for (const env of ENVS) {
  for (const state of STATES) {
    const label = `${env.id} ${state.kind}`
    const measured = {}
    for (const [source, css] of [['before', beforeCss], ['after', afterCss]]) {
      const page = await browser.newPage({ viewport: { width: env.width, height: 900 } })
      await page.emulateMedia({ colorScheme: env.theme, reducedMotion: env.reduced })
      await page.goto(`${BASE}?theme=${env.theme}&kind=${state.kind}`, { waitUntil: 'load' })
      await page.locator('.toast').first().waitFor({ state: 'visible' })
      await useStylesheet(page, css)
      await freezeMotion(page)
      const found = await assertCoverage(page, `${label} ${source}`, {
        expectCount: state.count,
        expectAction: state.action,
      })
      measured[source] = { surfaces: await readToasts(page), found }
      await page.close()
    }

    for (const part of ['zone', 'toasts', 'actions']) {
      const a = measured.before.surfaces[part]
      const b = measured.after.surfaces[part]
      const an = Array.isArray(a) ? a.length : a ? 1 : 0
      const bn = Array.isArray(b) ? b.length : b ? 1 : 0
      if (an !== bn) {
        diffs.push(`${label} ${part}: count ${an} -> ${bn}`)
        differences++
        continue
      }
      const listA = Array.isArray(a) ? a : [a]
      const listB = Array.isArray(b) ? b : [b]
      for (let i = 0; i < listA.length; i++) {
        if (!listA[i] || !listB[i]) continue
        for (const p of [...PROPS, 'rect']) {
          compared++
          const av = p === 'rect' ? listA[i].rect.join(',') : normaliseValue(p, listA[i][p])
          const bv = p === 'rect' ? listB[i].rect.join(',') : normaliseValue(p, listB[i][p])
          if (av !== bv) diffs.push(`${label} ${part}[${i}] :: ${p}: ${av} -> ${bv}`)
        }
      }
    }
    coverage.push({ label, ...measured.after.found })
  }
}

// Semantic fill and ink contrast are asserted in the after build, per theme.
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${BASE}?theme=${theme}&kind=many`, { waitUntil: 'load' })
  await page.locator('.toast').first().waitFor({ state: 'visible' })
  await useStylesheet(page, afterCss)
  await freezeMotion(page)
  const fills = await semanticFills(page)
  if (fills.ok.bg === fills.err.bg) {
    throw new Error(`${theme}: .ok and .err share one fill (${fills.ok.bg})`)
  }
  const okRatio = contrastOnFill(fills.ok.bg, fills.ok.ink)
  const errRatio = contrastOnFill(fills.err.bg, fills.err.ink)
  contrasts.push({ theme, ok: okRatio, err: errRatio })
  if (okRatio !== null && okRatio < 4.5) throw new Error(`${theme}: .ok ink contrast ${okRatio.toFixed(2)} is below 4.5`)
  if (errRatio !== null && errRatio < 4.5) throw new Error(`${theme}: .err ink contrast ${errRatio.toFixed(2)} is below 4.5`)
  await page.close()
}

await browser.close()

differences += diffs.length
console.log(`\nenvironments=${ENVS.length} states=${coverage.length} property-comparisons=${compared}`)
console.log(`differences=${differences}`)
console.log(`contrast rows=${contrasts.length} (ok and err ink on their own fill, both themes)`)
for (const c of contrasts) console.log(`  ${c.theme}: ok=${c.ok?.toFixed(2)} err=${c.err?.toFixed(2)}`)
for (const d of diffs.slice(0, 30)) console.log('  ' + d)
writeReport(outDir, 'report.json', { seeds, coverage, contrasts, compared, differences, diffs })
if (differences) {
  console.log('\nCOMPARISON FAILED')
  process.exit(1)
}
console.log('\ncomparison passed with detection proven')
