// ============ The save contract, proved through the real handler ============
// The Profile page's own click handler runs: the blank-name validation and its
// focus move, the disabled in-flight button, the refusal message beside the
// button with the typed values kept, and the success path.
//
// The transport is mocked at the NETWORK layer (`page.route`), so no request can
// leave this machine and no account can be written. Everything above the
// transport is production code: it is the same handler, the same state and the
// same markup the app ships. That is the difference between this and a lookalike.
import { chromium } from 'playwright-core'

const BASE = process.env.PROFILE_FIXTURE_BASE ?? 'http://127.0.0.1:5199'
const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail })

const browser = await chromium.launch()

/** Every case starts from the same page with any Supabase REST call trapped. */
async function open(handler) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const seen = []
  const escaped = []

  // FAIL CLOSED, installed FIRST so it is the outermost guard. Supabase is the
  // only origin this page would ever reach outside localhost; every request to
  // it is aborted unless one of the specific routes below claims it first.
  // Playwright runs the most recently registered matching route, so the
  // specific handlers registered after this one still win — and anything that
  // matches NEITHER is aborted here instead of reaching a hosted project.
  await page.route('**://*.supabase.co/**', async route => {
    escaped.push({ method: route.request().method(), url: route.request().url() })
    await route.abort('blockedbyclient')
  })
  await page.route('**/rest/v1/**', async route => {
    const req = route.request()
    seen.push({ method: req.method(), url: req.url().split('?')[0], body: req.postData() })
    await handler(route, req)
  })
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.goto(`${BASE}/dev/profile-fixture.html?theme=light&platform=native&update=newer&install=available&view=full`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.prof-save-row')
  await page.waitForTimeout(500)
  return { page, seen, escaped }
}

const nameInput = () => 'input[autocomplete="name"]'

/** Every request that tried to leave for the hosted backend. Must stay empty. */
const totals = { escaped: [] }

// ---------- Blank name: refuse locally, move focus, write nothing ----------
{
  const { page, seen, escaped } = await open(r => r.fulfill({ status: 204, body: '' }))
  await page.fill(nameInput(), '   ')
  await page.click('.prof-save-row button')
  await page.waitForTimeout(400)

  const m = await page.evaluate(() => {
    const btn = document.querySelector('.prof-save-row button')
    const alert = document.querySelector('.prof-save-row ~ .err-text, .err-text')
    const input = document.querySelector('input[autocomplete="name"]')
    return {
      alertText: alert?.textContent ?? null,
      alertRole: alert?.getAttribute('role') ?? null,
      focusedName: document.activeElement === input,
      focusedTag: document.activeElement?.tagName ?? null,
      buttonDisabled: btn?.disabled ?? null,
    }
  })
  check('save/blank name is refused locally', m.alertText !== null && /display name/i.test(m.alertText), JSON.stringify(m))
  check('save/blank name focuses the field', m.focusedName === true, `active=${m.focusedTag}`)
  check('save/blank name writes nothing', seen.length === 0, `requests=${seen.length}`)
  totals.escaped.push(...escaped)
  await page.close()
}

// ---------- Refusal: error beside the button, typed input kept ----------
{
  const { page, seen, escaped } = await open(r => r.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }),
  }))
  await page.fill(nameInput(), 'Refused Name')
  await page.click('.prof-save-row button')
  await page.waitForTimeout(1200)

  const m = await page.evaluate(() => {
    const alert = document.querySelector('.err-text')
    const input = document.querySelector('input[autocomplete="name"]')
    const btn = document.querySelector('.prof-save-row button')
    return {
      alertText: alert?.textContent ?? null,
      alertRole: alert?.getAttribute('role') ?? null,
      inputValue: input?.value ?? null,
      buttonDisabled: btn?.disabled ?? null,
      buttonLabel: btn?.textContent?.trim() ?? null,
    }
  })
  check('save/refusal shows a message beside the button', m.alertText !== null && m.alertRole === 'alert', JSON.stringify(m))
  check('save/refusal keeps the typed name', m.inputValue === 'Refused Name', JSON.stringify(m))
  check('save/refusal re-enables the button', m.buttonDisabled === false, JSON.stringify(m))
  check('save/refusal sent exactly one write', seen.length === 1 && seen[0].method === 'PATCH', JSON.stringify(seen))
  totals.escaped.push(...escaped)
  await page.close()
}

// ---------- In flight: disabled while the write is outstanding ----------
{
  let release
  const gate = new Promise(r => { release = r })
  const { page, escaped } = await open(async r => {
    await gate
    await r.fulfill({ status: 204, body: '' })
  })
  await page.fill(nameInput(), 'Slow Save')
  await page.click('.prof-save-row button')
  await page.waitForTimeout(500)

  const during = await page.evaluate(() => {
    const btn = document.querySelector('.prof-save-row button')
    return { disabled: btn?.disabled ?? null, label: btn?.textContent?.trim() ?? null }
  })
  release()
  await page.waitForTimeout(900)
  const after = await page.evaluate(() => {
    const btn = document.querySelector('.prof-save-row button')
    return { disabled: btn?.disabled ?? null, label: btn?.textContent?.trim() ?? null, err: document.querySelector('.err-text')?.textContent ?? null }
  })
  check('save/in flight the button is disabled', during.disabled === true, JSON.stringify(during))
  check('save/after success the button is usable again', after.disabled === false && after.err === null, JSON.stringify(after))
  totals.escaped.push(...escaped)
  await page.close()
}

// ---------- Success: the write carries the trimmed fields ----------
{
  let payload = null
  const { page, seen, escaped } = await open(async r => {
    payload = r.request().postData()
    await r.fulfill({ status: 204, body: '' })
  })
  await page.fill(nameInput(), '  Saved Name  ')
  await page.click('.prof-save-row button')
  await page.waitForTimeout(1200)

  const m = await page.evaluate(() => {
    const btn = document.querySelector('.prof-save-row button')
    return { disabled: btn?.disabled ?? null, err: document.querySelector('.err-text')?.textContent ?? null }
  })
  const body = payload ? JSON.parse(payload) : null
  check('save/success sends the trimmed name', body?.name === 'Saved Name', `payload=${payload}`)
  check('save/success leaves no error', m.err === null && m.disabled === false, JSON.stringify(m))
  check('save/success is a single write', seen.length === 1, JSON.stringify(seen))
  totals.escaped.push(...escaped)
  await page.close()
}

await browser.close()

// A leaked request is a failed probe, not a warning: a hosted write may already
// have landed by the time it is printed.
const leaked = totals.escaped
check('save/no request reached the hosted backend', leaked.length === 0, JSON.stringify(leaked))

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`)
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
