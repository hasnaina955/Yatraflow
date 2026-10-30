import { chromium } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const out = process.argv[2]
if (!out) throw new Error('Pass an evidence directory')
await mkdir(out, { recursive: true })
const browser = process.argv[3] === '--analyze' ? null : await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const cases = []
const properties = ['display', 'width', 'height', 'minHeight', 'padding', 'border', 'borderRadius', 'backgroundColor', 'backgroundImage', 'color', 'fontSize', 'fontWeight', 'outlineStyle', 'outlineWidth', 'boxShadow', 'opacity', 'transitionDuration']
if (process.argv[3] === '--analyze') {
  await analyzeVariants()
} else if (process.argv[3] === '--variants') {
  await runVariants()
} else {
try {
  for (const pageName of ['trips', 'explore']) for (const theme of ['light', 'dark']) for (const width of [390, 640, 641, 720, 721, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto(`http://localhost:5178/dev/css2-fixture.html?page=${pageName}&theme=${theme}`)
    await page.locator('.ex-search-input').waitFor()
    if (pageName === 'explore' && width <= 640) await page.locator('.ex-filters-toggle').click()
    const search = page.locator('.ex-search-input')
    await search.fill('route')
    const clear = page.getByRole('button', { name: 'Clear search' })
    if (!await clear.isVisible()) throw new Error('Clear control missing')
    await clear.click()
    if (await search.inputValue() !== '') throw new Error('Clear failed')
    await search.focus()
    const focus = await search.evaluate(el => ({ shadow: getComputedStyle(el).boxShadow, outline: getComputedStyle(el).outlineStyle }))
    if (focus.shadow === 'none' && focus.outline === 'none') throw new Error('Search focus invisible')
    const trigger = page.getByRole('combobox', { name: pageName === 'trips' ? 'When' : 'Duration' })
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('listbox')
    await menu.waitFor()
    const last = menu.getByRole('option').last()
    await last.scrollIntoViewIfNeeded()
    const hit = await last.evaluate(el => { const r = el.getBoundingClientRect(); const p = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return p === el || el.contains(p) })
    if (!hit) throw new Error('Dropdown is clipped or covered')
    await page.keyboard.press('Escape')
    if (await menu.count() || !await trigger.evaluate(el => document.activeElement === el)) throw new Error('Escape or focus failed')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    if (await menu.count()) throw new Error('Selection did not close')
    const measured = await page.evaluate(props => {
      const read = (selector) => { const el = document.querySelector(selector); const s = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, s[p]])) }
      return { search: read('.ex-search-input'), select: read('.ex-select .cselect-trigger'), disabled: read('[aria-label="Disabled"]'), invalid: read('[aria-label="Invalid"]'), overflow: document.documentElement.scrollWidth > innerWidth }
    }, properties)
    if (measured.overflow) throw new Error('Page overflow')
    if (width === 390 || width === 1440) await page.screenshot({ path: `${out}/${pageName}-${theme}-${width}.png` })
    cases.push({ pageName, theme, width, focus, hit, measured })
    await context.close()
  }
  // A hidden ring and a clipped menu must fail the same checks used above.
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
  await page.goto('http://localhost:5178/dev/css2-fixture.html?page=trips')
  const search = page.locator('.ex-search-input')
  await search.focus()
  await page.addStyleTag({ content: '.ex-search-input:focus-visible { box-shadow: none !important; outline: none !important } .ex-filterbar { overflow: hidden !important }' })
  const badFocus = await search.evaluate(el => getComputedStyle(el).boxShadow === 'none' && getComputedStyle(el).outlineStyle === 'none')
  await page.getByRole('combobox', { name: 'When' }).click()
  const badHit = await page.getByRole('option').last().evaluate(el => { const r = el.getBoundingClientRect(); const p = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return p === el || el.contains(p) })
  if (!badFocus || badHit) throw new Error('Bad fixture did not fail')
  await writeFile(`${out}/results.json`, JSON.stringify({ utc: new Date().toISOString(), source: execFileSync('node', ['scripts/css-source-graph.mjs', '--json'], { encoding: 'utf8' }), cases, oracle: { badFocus, badHit } }, null, 2))
  console.log(`${cases.length} cases passed; hidden focus and clipped popup rejected`)
} finally { await browser.close() }
}

async function runVariants() {
  const revision = 'fc775db83dda55e77db58b7b3208bbe0a400cea5'
  const entry = execFileSync('git', ['show', `${revision}:src/styles.css`], { encoding: 'utf8' })
  const paths = [...entry.matchAll(/@import\s+['"]\.\/([^'"]+)['"]/g)].map(match => `src/${match[1]}`)
  if (paths.length !== 17) throw new Error('CSS-1 import inventory changed')
  const baseline = paths.map(path => execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })).join('\n')
  const records = []
  const read = async locator => locator.evaluate((el, props) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return { style: Object.fromEntries(props.map(p => [p, s[p]])), size: [r.width, r.height] }
  }, properties)
  const sample = async locator => locator.evaluate(el => {
    const animations = el.getAnimations().filter(a => a.effect?.target === el)
    const motions = animations.map(a => ({ name: a.transitionProperty ?? a.animationName, duration: Number(a.effect.getTiming().duration) }))
    for (const a of animations) a.pause()
    const frames = [0, .5, 1].map(fraction => {
      for (const a of animations) a.currentTime = Number(a.effect.getTiming().duration) * fraction
      const s = getComputedStyle(el)
      return { opacity: s.opacity, transform: s.transform, borderColor: s.borderColor, boxShadow: s.boxShadow }
    })
    return { motions, frames }
  })
  try {
    for (const source of ['baseline', 'current']) for (const theme of ['light', 'dark']) for (const width of [390, 1440]) for (const reduced of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: width === 390, isMobile: width === 390, deviceScaleFactor: 1 })
      const page = await context.newPage()
      await page.goto(`http://localhost:5178/dev/css2-fixture.html?page=trips&theme=${theme}`)
      await page.getByRole('combobox', { name: 'Birth year' }).waitFor()
      if (source === 'baseline') {
        const removed = await page.evaluate(() => {
          const styles = [...document.querySelectorAll('style[data-vite-dev-id]')]
          for (const style of styles) style.remove()
          return styles.length
        })
        if (!removed) throw new Error('Could not replace Vite stylesheet')
        await page.addStyleTag({ content: baseline })
      }
      await page.waitForTimeout(350)
      const native = page.getByRole('combobox', { name: 'Birth year' })
      const compact = page.getByRole('combobox', { name: 'Compact select' })
      const search = page.getByRole('searchbox', { name: 'Search your trips' })
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
      if (coarse !== (width === 390)) throw new Error('Pointer emulation mismatch')
      const sizes = { native: await read(native), compact: await read(compact), search: await read(search) }
      await native.selectOption('1989')
      if (await native.inputValue() !== '1989') throw new Error('Native selection failed')
      await compact.scrollIntoViewIfNeeded()
      await compact.focus()
      await page.keyboard.press('ArrowDown')
      const popup = page.getByRole('listbox')
      await popup.waitFor()
      const motionOpen = await sample(popup)
      await page.keyboard.press('Escape')
      if (await popup.count() || !await compact.evaluate(el => document.activeElement === el)) throw new Error('Compact Escape failed')
      await page.mouse.move(1, 1)
      await compact.blur()
      await page.waitForTimeout(200)
      await compact.focus()
      await page.waitForTimeout(35)
      const compactFocus = await sample(compact)
      await compact.blur()
      await page.waitForTimeout(200)
      await compact.hover()
      await page.waitForTimeout(35)
      const compactHover = await sample(compact)
      await page.mouse.move(1, 1)
      await search.scrollIntoViewIfNeeded()
      await search.focus()
      await page.waitForTimeout(35)
      const motionFocus = await sample(search)
      await search.blur()
      await page.waitForTimeout(200)
      await search.hover()
      await page.waitForTimeout(35)
      const motionHover = await sample(search)
      const rings = []
      if (!reduced) for (const [name, locator] of [['search', search], ['native', native], ['compact', compact]]) {
        await page.mouse.move(1, 1)
        await locator.scrollIntoViewIfNeeded()
        await locator.focus()
        await page.waitForTimeout(220)
        const rect = await locator.evaluate(el => { const r = el.getBoundingClientRect(); el.dataset.css2Ring = 'target'; return { x: r.x, y: r.y, width: r.width, height: r.height } })
        const stem = `${source}-${theme}-${width}-${name}`
        await page.screenshot({ path: `${out}/${stem}-ring.png`, animations: 'disabled' })
        const mask = await page.addStyleTag({ content: '[data-css2-ring="target"]:focus-visible { box-shadow: none !important; outline: none !important }' })
        await page.screenshot({ path: `${out}/${stem}-plain.png`, animations: 'disabled' })
        await mask.evaluate(el => el.remove())
        await locator.evaluate(el => delete el.dataset.css2Ring)
        rings.push({ name, rect, stem })
      }
      records.push({ source, theme, width, reduced, coarse, sizes, motionFocus, motionHover, compactFocus, compactHover, motionOpen, rings })
      await context.close()
    }
    await writeFile(`${out}/variants.json`, JSON.stringify({ utc: new Date().toISOString(), baselineRevision: revision, source: execFileSync('node', ['scripts/css-source-graph.mjs', '--json'], { encoding: 'utf8' }), records }, null, 2))
    console.log(`${records.length} variant cases captured`)
  } finally { await browser.close() }
}

async function analyzeVariants() {
  const { records } = JSON.parse(await readFile(`${out}/variants.json`, 'utf8'))
  const failures = []
  const rings = []
  const pixel = async (file, x, y) => [...await sharp(file).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer()]
  const luminance = rgb => {
    const values = rgb.map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 })
    return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]
  }
  const contrast = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
  if (contrast([255, 255, 255], [255, 255, 255]) !== 1) throw new Error('Contrast oracle failed')
  for (const item of records.filter(r => r.source === 'current')) {
    const base = records.find(r => r.source === 'baseline' && r.theme === item.theme && r.width === item.width && r.reduced === item.reduced)
    if (!base) throw new Error('Missing baseline case')
    for (const field of ['sizes', 'motionFocus', 'motionHover', 'compactFocus', 'compactHover', 'motionOpen']) {
      if (JSON.stringify(base[field]) !== JSON.stringify(item[field])) failures.push(`${item.theme}/${item.width}/${item.reduced}: ${field}`)
    }
    if (item.coarse) for (const name of ['native', 'compact', 'search']) {
      if (item.sizes[name].size.some(value => value < 44)) failures.push(`${item.theme}/${item.width}: ${name} target under 44px`)
    }
  }
  for (const item of records) for (const ring of item.rings) {
    const x = Math.floor(ring.rect.x + ring.rect.width / 2)
    const y = Math.floor(ring.rect.y - 2)
    const painted = await pixel(`${out}/${ring.stem}-ring.png`, x, y)
    const adjacent = await pixel(`${out}/${ring.stem}-plain.png`, x, y)
    const ratio = contrast(painted, adjacent)
    rings.push({ stem: ring.stem, x, y, painted, adjacent, ratio })
    if (ratio < 3) failures.push(`${ring.stem}: sampled ring contrast ${ratio}`)
  }
  await writeFile(`${out}/analysis.json`, JSON.stringify({ pairs: records.length / 2, contrastOracle: 1, rings, failures }, null, 2))
  if (failures.length) throw new Error(failures.join('\n'))
  console.log(`${records.length / 2} baseline pairs match; ${rings.length} ring samples pass 3:1`)
}
