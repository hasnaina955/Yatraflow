const DEFAULT_ORIGIN = 'https://yatraflow-blond.vercel.app'
const DEFAULT_TITLE = 'YatraFlow — Plan real trips, together'
const DEFAULT_DESCRIPTION = 'Plan realistic India trips together. See the time, distance and cost impact of every stop.'
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function renderPublication(publication, id) {
  const origin = (process.env.PUBLIC_ORIGIN ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    DEFAULT_ORIGIN).replace(/\/+$/, '')
  const title = publication?.title ? `${publication.title} — YatraFlow` : DEFAULT_TITLE
  const facts = []
  if (publication?.duration_days) facts.push(`${publication.duration_days} days`)
  const budget = Number(publication?.estimated_budget_per_person_inr)
  if (Number.isFinite(budget) && budget > 0) facts.push(`₹${budget.toLocaleString('en-IN')}/person`)
  const route = publication?.route_summary
  if (Array.isArray(route)) facts.push(route.join(' → '))
  else if (typeof route === 'string' && route) facts.push(route)
  const description = publication?.tagline || facts.join(' · ') || DEFAULT_DESCRIPTION
  const image = typeof publication?.cover_image_url === 'string' && /^https:\/\/\S+$/.test(publication.cover_image_url)
    ? publication.cover_image_url : ''
  const target = `/#/pub/${id}`
  const canonical = `${origin}/i/${id}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="YatraFlow" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}
<link rel="canonical" href="${escapeHtml(canonical)}" />
<script>location.replace(${JSON.stringify(target)})</script>
</head>
<body><p>Opening <a href="${escapeHtml(target)}">this itinerary</a>…</p></body>
</html>`
}

export default async function handler(req, res) {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD')
    return res.status(405).end()
  }
  const id = req.query?.id
  if (typeof id !== 'string' || !ID_RE.test(id)) return res.status(400).end()

  let publication = null
  let status = 503
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (url && key) {
    try {
      const response = await fetch(
        `${url.replace(/\/+$/, '')}/rest/v1/published_itineraries?id=eq.${encodeURIComponent(id)}` +
        '&select=id,title,tagline,route_summary,cover_image_url,duration_days,estimated_budget_per_person_inr&limit=1',
        {
          headers: { apikey: key, authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(4000),
        },
      )
      if (response.ok) {
        const rows = await response.json()
        if (Array.isArray(rows)) {
          publication = rows[0] ?? null
          status = publication ? 200 : 404
        }
      }
    } catch {
      status = 503
    }
  }
  res.status(status)
  return req.method === 'HEAD' ? res.end() : res.send(renderPublication(publication, id))
}
