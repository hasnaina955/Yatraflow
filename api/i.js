// Preview route for a shared itinerary — GET /i/<pubId>.
//
// The app routes on the hash, so a link to `/#/pub/<id>` never reaches a
// server. Every shared itinerary serves the same `/` document, and a preview
// fetcher (WhatsApp, Slack, Facebook, X) cannot tell one itinerary from
// another — it renders a bare URL, in the one channel this product is built
// around. `vercel.json` rewrites `/i/<id>` here.
//
// This reads the publication and returns the app shell with that itinerary's
// Open Graph tags injected. Humans still land in the app (the injected script
// sets the hash before the SPA boots, so there is no redirect flash); crawlers
// read the card and stop.
//
// It degrades rather than fails, in two steps:
//   1. no Supabase env  -> the shell's own default tags (still a real card)
//   2. no shell         -> a minimal document with the tags and a redirect
// A preview is never worse than the bare URL it replaces.
//
// Plain JS on purpose: `tsconfig.json` includes only `src`, and the project has
// no `@types/node` — a `.ts` file here would sit outside the type checker while
// looking like it was inside it.
//
// Env (Vercel, server-side — NOT the `VITE_`-prefixed pair, which is inlined at
// build time and never reaches a function):
//   SUPABASE_URL, SUPABASE_ANON_KEY

const DEFAULT_ORIGIN = 'https://yatraflow-blond.vercel.app'
const SHELL_TTL_MS = 5 * 60 * 1000
const DEFAULT_TITLE = 'YatraFlow — Plan real trips, together'
const DEFAULT_DESC =
  'Plan realistic India trips together. See the time, distance and cost impact of every stop.'

// The shell is identical for every request, so it is fetched once per warm
// instance rather than once per preview.
let shell = { origin: '', at: 0, html: '' }

/** Publication ids are slugs (`pub_1cp2i9jq872`). Constraining the shape here
 *  means no caller-supplied string ever reaches a query or an inline script
 *  unvalidated, whatever it contains. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

/** A JS string literal that is also safe inside a `<script>` element:
 *  `JSON.stringify` escapes quotes and backslashes, and the angle brackets are
 *  escaped so a `</script>` in the input cannot close the tag. */
function jsStr(s) {
  return JSON.stringify(String(s)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

/** Drop the shell's own og/twitter/canonical tags so the injected set is the
 *  only one present — a duplicate `og:title` is resolved by the consumer, not
 *  by us, and the two would disagree. */
function stripTags(html) {
  return html
    .replace(/<meta[^>]+(?:property|name)=["'](?:og:|twitter:)[^"']*["'][^>]*>\s*/gi, '')
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>\s*/gi, '')
}

async function loadShell(origin) {
  const now = Date.now()
  if (shell.origin === origin && shell.html && now - shell.at < SHELL_TTL_MS) return shell.html
  const res = await fetch(`${origin}/`, { headers: { 'user-agent': 'yatraflow-og-preview' } })
  if (!res.ok) throw new Error(`shell ${res.status}`)
  const html = await res.text()
  if (!/<\/head>/i.test(html)) throw new Error('shell has no head')
  shell = { origin, at: now, html }
  return html
}

async function loadPublication(id) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  const query =
    `${url}/rest/v1/published_itineraries?id=eq.${encodeURIComponent(id)}` +
    '&select=id,title,tagline,route_summary,cover_image_url,duration_days,' +
    'estimated_budget_per_person_inr,premium_price_inr'
  const res = await fetch(query, { headers: { apikey: key, authorization: `Bearer ${key}` } })
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

function tagsFor(pub, id, origin) {
  const url = `${origin}/i/${id}`
  if (!pub) return { title: DEFAULT_TITLE, desc: DEFAULT_DESC, image: '', url }

  const title = pub.title ? `${pub.title} — YatraFlow` : DEFAULT_TITLE

  // Prefer the author's own words; fall back to the facts we can state without
  // inventing anything. No fabricated highlights, no "5 days of adventure".
  const facts = []
  if (pub.duration_days) facts.push(`${pub.duration_days} days`)
  if (pub.estimated_budget_per_person_inr) {
    facts.push(`₹${Number(pub.estimated_budget_per_person_inr).toLocaleString('en-IN')}/person`)
  }
  if (pub.route_summary) facts.push(pub.route_summary)
  const desc = pub.tagline || facts.join(' · ') || DEFAULT_DESC

  // Only an absolute https URL. A relative path would 404 against the
  // crawler's own origin, and a broken og:image renders worse than none.
  const image =
    typeof pub.cover_image_url === 'string' && /^https:\/\/\S+$/.test(pub.cover_image_url)
      ? pub.cover_image_url
      : ''

  return { title, desc, image, url }
}

function headTags(tags, id) {
  return [
    '<meta property="og:type" content="article" />',
    '<meta property="og:site_name" content="YatraFlow" />',
    `<meta property="og:title" content="${esc(tags.title)}" />`,
    `<meta property="og:description" content="${esc(tags.desc)}" />`,
    `<meta property="og:url" content="${esc(tags.url)}" />`,
    tags.image ? `<meta property="og:image" content="${esc(tags.image)}" />` : '',
    `<meta name="twitter:card" content="${tags.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(tags.title)}" />`,
    `<meta name="twitter:description" content="${esc(tags.desc)}" />`,
    tags.image ? `<meta name="twitter:image" content="${esc(tags.image)}" />` : '',
    `<link rel="canonical" href="${esc(tags.url)}" />`,
    // Runs before the deferred module script, so the SPA boots already on the
    // itinerary. A hash-only change does not reload the document, so there is
    // no flash and no extra history entry.
    `<script>if(!location.hash)location.replace('/#/pub/'+${jsStr(id)})</script>`,
  ]
    .filter(Boolean)
    .join('\n    ')
}

/** The deployed shell references its bundle relatively — `./assets/…`, so the
 *  Capacitor build works from `file://`. Served at `/i/<id>` those resolve
 *  against `/i/` and 404, and the app never boots. This route only exists on
 *  the web, so the document it returns gets absolute paths. */
function absoluteAssets(html) {
  return html.replace(/(src|href)="\.\/assets\//g, '$1="/assets/')
}

function render(shellHtml, tags, id) {
  const withHead = stripTags(absoluteAssets(shellHtml)).replace(
    '</head>',
    `  ${headTags(tags, id)}\n  </head>`,
  )
  return /<title>/i.test(withHead)
    ? withHead.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(tags.title)}</title>`)
    : withHead.replace('</head>', `  <title>${esc(tags.title)}</title>\n  </head>`)
}

function minimal(tags, id) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(tags.title)}</title>
    ${headTags(tags, id).replace(/<script>[\s\S]*?<\/script>/, '')}
    <meta http-equiv="refresh" content="0;url=/#/pub/${encodeURIComponent(id)}" />
  </head>
  <body>
    <p>Opening <a href="/#/pub/${encodeURIComponent(id)}">this itinerary</a>…</p>
  </body>
</html>`
}

export default async function handler(req, res) {
  const raw = req.query && req.query.id ? String(req.query.id) : ''
  const id = ID_RE.test(raw) ? raw : ''

  const host = req.headers['x-forwarded-host'] || req.headers.host || ''
  const origin = host ? `https://${host}` : DEFAULT_ORIGIN

  res.setHeader('content-type', 'text/html; charset=utf-8')
  // Preview fetchers cache aggressively and re-fetch rarely, so a short edge
  // TTL with a long stale window keeps a title edit from going stale for days.
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400')

  if (!id) {
    res.setHeader('location', '/')
    return res.status(302).end()
  }

  let pub = null
  try {
    pub = await loadPublication(id)
  } catch {
    pub = null
  }
  const tags = tagsFor(pub, id, origin)

  try {
    res.status(200).send(render(await loadShell(origin), tags, id))
  } catch {
    res.status(200).send(minimal(tags, id))
  }
}
