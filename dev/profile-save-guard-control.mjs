// Negative control for the fail-closed route in profile-save-contract.mjs.
//
// A guard nobody has seen fire is a guess. This registers the SAME route stack in
// the SAME order as the save probe, then asks the page for two URLs:
//
//   1. https://<project>.supabase.co/storage/v1/object  -> matches only the
//      catch-all guard, so it must be ABORTED.
//   2. https://<project>.supabase.co/rest/v1/profiles   -> matches the specific
//      handler registered later, so it must be FULFILLED by the probe, not the
//      guard.
//
// If (1) is not aborted, the guard is decorative and the save probe's zero-escape
// result proves nothing. If (2) is aborted, route ordering is the opposite of what
// the probe assumes and its writes were never actually intercepted.
import { chromium } from 'playwright-core'

const BASE = process.env.PROFILE_FIXTURE_BASE ?? 'http://127.0.0.1:5199'
const results = []
const check = (n, p, d) => results.push({ name: n, pass: p, detail: d })

const browser = await chromium.launch()
const page = await browser.newPage()

const aborted = []
const handled = []

await page.route('**://*.supabase.co/**', async route => {
  aborted.push(route.request().url())
  await route.abort('blockedbyclient')
})
await page.route('**/rest/v1/**', async route => {
  handled.push(route.request().url())
  await route.fulfill({ status: 204, body: '' })
})

await page.goto(`${BASE}/dev/profile-fixture.html?theme=light&platform=native&update=newer&install=available&view=full`, { waitUntil: 'networkidle' })

const outcome = await page.evaluate(async () => {
  const host = 'https://hqlqbfpzjmailxydjojw.supabase.co'
  const tryOne = async url => {
    try {
      const r = await fetch(url, { method: 'GET' })
      return { url, ok: true, status: r.status }
    } catch (e) {
      return { url, ok: false, error: String(e) }
    }
  }
  return [
    await tryOne(`${host}/storage/v1/object/public/x.png`),
    await tryOne(`${host}/rest/v1/profiles?select=id`),
  ]
})

const [blocked, allowed] = outcome
check('guard aborts a supabase URL no specific route claims', blocked.ok === false, JSON.stringify(blocked))
check('specific rest route wins over the guard', allowed.ok === true && allowed.status === 204, JSON.stringify(allowed))
check('exactly one request reached the guard', aborted.length === 1, JSON.stringify(aborted))
check('exactly one request reached the rest handler', handled.length === 1, JSON.stringify(handled))

await browser.close()
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`)
const failed = results.filter(r => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
