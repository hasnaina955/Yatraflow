const DEFAULT_ORIGIN = 'https://yatraflow-blond.vercel.app'
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
// PostgREST caps one response at 1000 rows unless a range header is sent, so
// the ceiling is stated here rather than inherited silently. Past this count
// the catalogue needs paging; below it the sitemap is complete.
const MAX_URLS = 1000

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character])
}

/**
 * Epoch-milliseconds → W3C date (`YYYY-MM-DD`).
 * An absent or unparseable timestamp yields `''` and the caller omits the tag:
 * a missing `<lastmod>` is honest, a guessed one is not.
 */
function toLastmod(value) {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function renderSitemap(rows, origin) {
  // The shell is the only non-publication URL a crawler can address: the app
  // routes on the hash, so `/#/explore` and friends are `/` to a crawler and
  // cannot be listed separately.
  const entries = [`  <url>\n    <loc>${escapeXml(`${origin}/`)}</loc>\n  </url>`]
  for (const row of rows) {
    const id = row?.id
    if (typeof id !== 'string' || !ID_RE.test(id)) continue
    const lastmod = toLastmod(row.refreshed_at ?? row.published_at)
    entries.push(
      '  <url>\n' +
      `    <loc>${escapeXml(`${origin}/i/${id}`)}</loc>\n` +
      (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
      '  </url>',
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/xml; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD')
    return res.status(405).end()
  }

  const origin = (process.env.PUBLIC_ORIGIN ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    DEFAULT_ORIGIN).replace(/\/+$/, '')

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  let rows = null
  if (url && key) {
    try {
      const response = await fetch(
        `${url.replace(/\/+$/, '')}/rest/v1/published_itineraries` +
        '?select=id,refreshed_at,published_at' +
        `&order=published_at.desc&limit=${MAX_URLS}`,
        {
          headers: { apikey: key, authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(4000),
        },
      )
      if (response.ok) {
        const body = await response.json()
        if (Array.isArray(body)) rows = body
      }
    } catch {
      rows = null
    }
  }

  // An unreachable catalogue answers 503 rather than a valid-looking document
  // listing only the shell: the latter tells a crawler every publication has
  // gone. A 503 is retried; a wrong sitemap is believed.
  if (rows === null) return res.status(503).end()

  // The catalogue only changes when someone publishes, so an hour at the edge
  // costs nothing and keeps crawls off the database.
  res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.status(200)
  return req.method === 'HEAD' ? res.end() : res.send(renderSitemap(rows, origin))
}
