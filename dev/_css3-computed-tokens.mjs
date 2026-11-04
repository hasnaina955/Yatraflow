// CSS-3 B1 evidence gap: compare COMPUTED token values between two builds.
// This is what the declaration signature could not prove: precedence against
// every declaration outside the moved blocks, and the resolved var() chains.
import fs from 'node:fs'

const [b0Path, b1Path] = process.argv.slice(2)
if (!b0Path || !b1Path) {
  console.error('usage: node dev/_css3-computed-tokens.mjs <b0.css> <b1.css>')
  process.exit(2)
}

const { chromium } = await import('playwright-core')

async function launch() {
  const attempts = [
    { channel: 'chrome' },
    ...(process.env.CHROME_PATH ? [{ executablePath: process.env.CHROME_PATH }] : []),
    { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
  ]
  let last
  for (const opts of attempts) {
    try {
      return await chromium.launch({ headless: true, ...opts })
    } catch (e) {
      last = e
    }
  }
  throw new Error(`no Chrome found (${last?.message ?? 'unknown'})`)
}

const STATES = [
  { id: 'light', theme: 'light', width: 1440, reduced: 'no-preference' },
  { id: 'dark', theme: 'dark', width: 1440, reduced: 'no-preference' },
  { id: 'light-phone', theme: 'light', width: 390, reduced: 'no-preference' },
  { id: 'dark-phone', theme: 'dark', width: 390, reduced: 'no-preference' },
  { id: 'reduced', theme: 'light', width: 1440, reduced: 'reduce' },
  { id: 'reduced-dark', theme: 'dark', width: 1440, reduced: 'reduce' },
]

async function readAll(browser, cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8')
  const out = {}
  for (const state of STATES) {
    const page = await browser.newPage({ viewport: { width: state.width, height: 900 } })
    await page.emulateMedia({ reducedMotion: state.reduced, colorScheme: state.theme })
    await page.setContent(
      `<!doctype html><html data-theme="${state.theme}"><head><style>${css}</style></head><body><p>x</p></body></html>`,
      { waitUntil: 'load' },
    )
    const values = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement)
      const result = {}
      // Enumerate every declared custom property, resolved.
      for (let i = 0; i < cs.length; i++) {
        const prop = cs[i]
        if (prop.startsWith('--')) result[prop] = cs.getPropertyValue(prop).trim()
      }
      return result
    })
    out[state.id] = values
    await page.close()
  }
  return out
}

const browser = await launch()
const b0 = await readAll(browser, b0Path)
const b1 = await readAll(browser, b1Path)
await browser.close()

let totalDiffs = 0
const report = {}
for (const state of STATES) {
  const a = b0[state.id] ?? {}
  const b = b1[state.id] ?? {}
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  const diffs = []
  for (const n of names) {
    if (a[n] !== b[n]) diffs.push({ prop: n, b0: a[n] ?? '(absent)', b1: b[n] ?? '(absent)' })
  }
  report[state.id] = { count: names.length, diffs }
  totalDiffs += diffs.length
  console.log(`${state.id.padEnd(14)} tokens=${String(names.length).padStart(4)}  diffs=${diffs.length}`)
  for (const d of diffs.slice(0, 12)) console.log(`    ${d.prop}: ${d.b0}  ->  ${d.b1}`)
}

fs.writeFileSync('dev/_css3-computed-tokens.json', JSON.stringify(report, null, 1))
console.log(`\nTOTAL DIFFERENCES: ${totalDiffs}`)
process.exit(totalDiffs ? 1 : 0)
