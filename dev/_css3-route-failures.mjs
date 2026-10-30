// Drive the real workspace with synthetic road and terrain failures.
import assert from 'node:assert/strict'
import { launchChrome, writeReport } from './_css3-compare-lib.mjs'

const [baseUrl, outDir] = process.argv.slice(2)
if (!baseUrl || !outDir) {
  console.error('usage: node dev/_css3-route-failures.mjs <fixture-origin> <outDir>')
  process.exit(2)
}

const browser = await launchChrome()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(String(error)))
try {
  await page.goto(`${baseUrl}/dev/overview-fixture.html?road=recover&elev=recover`, { waitUntil: 'domcontentloaded' })
  const heightNote = page.locator('.ovw-road-note.is-failed')
  const roadNote = page.locator('.ovw-road-note').filter({ hasText: 'Road not measured.' })
  await heightNote.waitFor({ state: 'visible', timeout: 15000 })
  await roadNote.waitFor({ state: 'visible', timeout: 15000 })
  const initial = await page.locator('.ovw2-route').innerText()
  assert.match(initial, /Heights could not load\./)
  assert.match(initial, /Road not measured\./)
  assert.doesNotMatch(initial, /The road is still measured\./)
  assert.ok(initial.indexOf('Heights could not load.') < initial.indexOf('Road not measured.'))
  assert.equal(await page.locator('[role="alert"]').count(), 1)
  assert.equal(await heightNote.getByRole('button', { name: 'Try again' }).count(), 1)
  assert.equal(await roadNote.getByRole('button', { name: 'Try again' }).count(), 1)

  await heightNote.getByRole('button', { name: 'Try again' }).click()
  await heightNote.waitFor({ state: 'hidden', timeout: 15000 })
  await page.locator('.ovw-elev').first().waitFor({ state: 'visible', timeout: 15000 })
  assert.equal(await roadNote.isVisible(), true)
  await roadNote.getByRole('button', { name: 'Try again' }).click()
  await roadNote.waitFor({ state: 'hidden', timeout: 15000 })
  await page.locator('.ovw-rsum').getByText('driving', { exact: false }).waitFor({ state: 'visible', timeout: 15000 })
  assert.deepEqual(errors, [])
  writeReport(outDir, 'report.json', { initial, alerts: 1, heightRetry: 'recovered', roadRetry: 'recovered', pageErrors: errors })
  console.log('simultaneous failures: one alert; both retries recovered; page errors: 0')
} finally {
  await browser.close()
}
