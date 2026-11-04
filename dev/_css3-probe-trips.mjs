// Scratch probe: what does /trips render signed out, and can a trip be opened?
import { launchChrome } from './_css3-compare-lib.mjs'

const browser = await launchChrome()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto('http://127.0.0.1:5178/trips', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  console.log('url:', page.url())
  console.log('buttons:', await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent?.trim().slice(0, 40)).filter(Boolean).slice(0, 30)))
  console.log('links:', await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).slice(0, 30)))
  console.log('localStorage keys:', await page.evaluate(() => Object.keys(localStorage)))
  console.log('body text:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400))
  console.log('counts:', await page.evaluate(() => ({
    tripsPage: document.querySelectorAll('.trips-page').length,
    mtCard: document.querySelectorAll('.mt-card').length,
    itinCard: document.querySelectorAll('.itin-card').length,
    board: document.querySelectorAll('.board').length,
    hero: document.querySelectorAll('.hero').length,
    exploreGrid: document.querySelectorAll('.explore-grid').length,
  })))
} finally {
  await browser.close()
}
