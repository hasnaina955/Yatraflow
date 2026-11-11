// W14 rail: capture the live fixture for board/live comparison pairs.
// This is a local proof tool. It starts no server; the caller starts Vite.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.W14_BASE ?? 'http://127.0.0.1:5198'
const OUT = process.env.W14_OUT ?? 'E:/yatraflow-wt/scratch-832/w14-shots/rail/final'
mkdirSync(OUT, { recursive: true })

const DESK = { width: 1480, height: 900 }
const PHONE = { width: 390, height: 844 }
const CASES = [
  { name: 'drive-rail', vp: DESK, q: 'board=w14', lens: 'Drive', crop: '.mv2-itinerary' },
  { name: 'drive-strip', vp: DESK, q: 'board=w14', lens: 'Drive', crop: '.mv2-ribbon' },
  { name: 'fix-rail', vp: DESK, q: 'board=w14&theme=dark', lens: 'Fix', crop: '.mv2-itinerary' },
  { name: 'fix-strip', vp: DESK, q: 'board=w14&theme=dark', lens: 'Fix', crop: '.mv2-ribbon' },
  { name: 'stay-rail', vp: DESK, q: 'board=w14', lens: 'Stay', crop: '.mv2-itinerary' },
  { name: 'stay-strip', vp: DESK, q: 'board=w14', lens: 'Stay', crop: '.mv2-ribbon' },
  { name: 'phone-strip', vp: PHONE, q: 'board=w14', lens: 'Drive', crop: '.mv2-ribbon-sheet, .mv2-ribbon' },
  { name: 'phone-dark-strip', vp: PHONE, q: 'board=w14&theme=dark', lens: 'Drive', crop: '.mv2-ribbon-sheet, .mv2-ribbon' },
]

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const report = []
try {
  for (const item of CASES) {
    const page = await browser.newPage({ viewport: item.vp, deviceScaleFactor: 2 })
    await page.addInitScript(() => localStorage.setItem('yatraflow_time_format', '24h'))
    await page.goto(`${BASE}/dev/map-workspace-fixture.html?${item.q}`, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector('.mv2-workspace', { timeout: 30000 })
    await page.getByRole('button', { name: new RegExp(item.lens, 'i') }).first().click()
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(1200)
    const target = page.locator(item.crop).first()
    const box = await target.boundingBox()
    if (box == null) {
      report.push({ name: item.name, status: 'missing' })
      await page.close()
      continue
    }
    const clip = {
      x: Math.max(0, Math.floor(box.x)),
      y: Math.max(0, Math.floor(box.y)),
      width: Math.min(Math.ceil(box.width), item.vp.width - Math.max(0, Math.floor(box.x))),
      height: Math.min(Math.ceil(box.height), item.vp.height - Math.max(0, Math.floor(box.y))),
    }
    const file = join(OUT, `${item.name}-live.png`)
    await page.screenshot({ path: file, clip })
    report.push({ name: item.name, status: 'captured', clip, file })
    await page.close()
  }
} finally {
  await browser.close()
}
writeFileSync(join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2))
console.log(report.map(row => `${row.name}: ${row.status}`).join('\n'))
