// Sampling probe for the Profile entrance and touch targets. Numbers only.
import { chromium } from 'playwright-core'

const BASE = process.env.PROFILE_FIXTURE_BASE ?? 'http://localhost:5199'

const browser = await chromium.launch()

// Entrance: which elements animate, with what delay, and does reduced motion stop it.
for (const reduced of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await page.goto(`${BASE}/dev/profile-fixture.html?theme=light&view=full`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.prof-grid')
  const anims = await page.evaluate(() => document.getAnimations().map(a => ({
    name: a.animationName,
    delay: a.effect?.getTiming?.().delay,
    dur: a.effect?.getTiming?.().duration,
    target: (a.effect?.target?.className || '').toString().slice(0, 40),
  })).filter(a => a.name && a.name !== 'none'))
  console.log(JSON.stringify({ reduced, count: anims.length, sample: anims.slice(0, 12) }))
  await page.close()
}

// Coarse pointer: every interactive control at least 44px.
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
await page.goto(`${BASE}/dev/profile-fixture.html?theme=light&view=full`, { waitUntil: 'networkidle' })
await page.waitForSelector('.prof-grid')
const targets = await page.evaluate(() => {
  const els = [...document.querySelectorAll('a,button,input,[role="switch"]')]
  const under = []
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.height < 44) under.push(`${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ')[0]} h=${Math.round(r.height)}`)
  }
  return { total: els.length, under }
})
console.log(JSON.stringify({ coarse: targets }, null, 2))
await browser.close()
