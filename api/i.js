const DEFAULT_ORIGIN = 'https://yatraflow-blond.vercel.app'
const DEFAULT_TITLE = 'YatraFlow — Plan real trips, together'
const DEFAULT_DESCRIPTION = 'Plan realistic India trips together. See the time, distance and cost impact of every stop.'
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const COVER_WIDTH = 1200
const WIKIMEDIA_PATH_RE = /^https:\/\/[^/]*wikimedia\.org\/wikipedia\/([^/]+)\/(.+)$/

/** The same Wikimedia file at a sane width.
 *
 *  A stored cover is frequently the RAW upload — the one live publication that
 *  has one carries `.../Chandratal_1.JPG?…thumbnail_unscaled`, 1.3 MB — because
 *  it was written before the picker started sizing, or by the destination-photo
 *  fallback. The client sizes these on the display path through the same
 *  redirect (src/lib/tripThumb.ts `sizedCoverUrl`); this function cannot import
 *  that (it sits behind the bundler, and this file stays dependency-free), so
 *  the rule is repeated here. Measured on that cover: 1,335,523 bytes → 147,351.
 *  Non-Wikimedia URLs come back untouched, and an already-sized redirect does
 *  not match the path shape, so this is idempotent. */
function sizedCover(url) {
  const [path] = url.split('?')
  const match = WIKIMEDIA_PATH_RE.exec(path)
  if (!match) return url
  const rest = match[2].startsWith('thumb/') ? match[2].slice('thumb/'.length) : match[2]
  const file = /^[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/.exec(rest)?.[1]
  if (!file) return url
  const host = match[1] === 'commons' ? 'commons.wikimedia.org' : `${match[1]}.wikipedia.org`
  return `https://${host}/wiki/Special:Redirect/file/${file}?width=${COVER_WIDTH}`
}

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
  const cover = typeof publication?.cover_image_url === 'string' && /^https:\/\/\S+$/.test(publication.cover_image_url)
    ? sizedCover(publication.cover_image_url) : ''
  // A publication with no cover still needs a picture: without one the link
  // previews as a bare URL rather than a card. The fallback is the app's own
  // asset, and only in that case are its dimensions known and worth declaring.
  const image = cover || `${origin}/og-default.png`
  const imageTags = [
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    ...(cover ? [] : [
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
    ]),
  ].join('\n')
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
${imageTags}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
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
