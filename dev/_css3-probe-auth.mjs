// Scratch probe: can a signed-in route be reached in THIS environment?
// Records what the auth page reports, whether a sign-up attempt can succeed, and
// where /trips lands. Read-only: it never writes project files.
import { launchChrome } from './_css3-compare-lib.mjs'

const browser = await launchChrome()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e)))
try {
  await page.goto('http://127.0.0.1:5178/auth', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  console.log('AUTH url:', page.url())
  console.log('AUTH configured banner:', await page.evaluate(() => {
    const t = document.body.innerText
    const m = t.match(/[^\n]*(Supabase|not configured|missing|placeholder)[^\n]*/i)
    return m ? m[0].trim().slice(0, 200) : null
  }))
  console.log('AUTH fields:', await page.evaluate(() => ({
    email: document.querySelectorAll('input[type="email"]').length,
    password: document.querySelectorAll('input[type="password"]').length,
    submit: [...document.querySelectorAll('button[type="submit"]')].map((b) => b.textContent?.trim()),
  })))

  // Try a sign-up with synthetic credentials and record what the app says.
  const email = `css3-probe-${Date.now()}@example.invalid`
  const filled = await page.evaluate(({ email }) => {
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const e = document.querySelector('input[type="email"]')
    const p = document.querySelector('input[type="password"]')
    if (!e || !p) return false
    set(e, email); set(p, 'probe-password-123456')
    return true
  }, { email })
  if (filled) {
    const btn = page.locator('button[type="submit"]').first()
    if (await btn.count()) await btn.click()
    await page.waitForTimeout(4000)
    console.log('SIGNUP url after submit:', page.url())
    console.log('SIGNUP message:', await page.evaluate(() => {
      const t = document.body.innerText
      const m = t.match(/[^\n]*(failed|error|invalid|unable|placeholder|configured)[^\n]*/i)
      return m ? m[0].trim().slice(0, 240) : null
    }))
  } else {
    console.log('SIGNUP: no email/password inputs found')
  }

  await page.goto('http://127.0.0.1:5178/trips', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  console.log('TRIPS landed on:', page.url())
  console.log('TRIPS has list:', await page.evaluate(() => ({
    tripsPage: document.querySelectorAll('.trips-page').length,
    mtCard: document.querySelectorAll('.mt-card').length,
    hero: document.querySelectorAll('.hero').length,
    board: document.querySelectorAll('.board').length,
  })))

  console.log('\nCONSOLE ERRORS (first 4):')
  for (const e of [...new Set(consoleErrors)].slice(0, 4)) console.log('  ' + e.slice(0, 240))
} finally {
  await browser.close()
}
