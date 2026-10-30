import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
const out = process.argv[2]
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const results = []
try {
  for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' })
    await page.goto('http://localhost:5178/explore', { waitUntil: 'networkidle' })
    await page.evaluate(t => { document.documentElement.dataset.theme = t }, theme)
    const search = page.getByRole('searchbox', { name: 'Search by route, place or creator' })
    await search.scrollIntoViewIfNeeded()
    await search.fill('route')
    await page.getByRole('button', { name: 'Clear search' }).click()
    if (await search.inputValue() !== '') throw new Error('Search clear failed')
    await search.focus()
    const ring = await search.evaluate(el => { const s = getComputedStyle(el); return { shadow: s.boxShadow, outline: s.outlineStyle, transition: s.transitionDuration } })
    if (ring.shadow === 'none' && ring.outline === 'none') throw new Error('Missing focus')
    await page.screenshot({ path: `${out}/${theme}-${width}-focus.png`, animations: 'disabled' })
    await page.addStyleTag({ content: '.ex-search-input:focus-visible { box-shadow: none !important; outline: none !important }' })
    await page.screenshot({ path: `${out}/${theme}-${width}-hidden-focus.png`, animations: 'disabled' })
    if (width <= 640) await page.locator('.ex-filters-toggle').click()
    const select = page.getByRole('combobox', { name: 'Max budget' })
    await select.focus()
    await page.keyboard.press('ArrowDown')
    const option = page.getByRole('option').last()
    await option.scrollIntoViewIfNeeded()
    const hit = await option.evaluate(el => { const r = el.getBoundingClientRect(); const p = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return p === el || el.contains(p) })
    if (!hit) throw new Error('Popup is covered or clipped')
    await page.screenshot({ path: `${out}/${theme}-${width}-open.png`, animations: 'disabled' })
    await page.keyboard.press('Escape')
    if (!await select.evaluate(el => document.activeElement === el)) throw new Error('Focus lost on Escape')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    if (await page.getByRole('listbox').count()) throw new Error('Selection did not close')
    results.push({ theme, width, ring, hit, selected: await select.innerText(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) })
    await page.close()
  }
  await writeFile(`${out}/results.json`, JSON.stringify({ utc: new Date().toISOString(), results }, null, 2))
  if (results.some(x => x.overflow)) throw new Error('Page overflow')
  console.log('Four real Explore cases passed')
} finally { await browser.close() }
