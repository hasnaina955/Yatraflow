// ============ /join/<code>: the private invite card (#1042, #1045) ============
// vercel.json rewrites `/join/:code` to this handler only for a link-preview bot.
// The condition is the user-agent list of the /pub/:slug rewrite, copied exactly.
// A bot reads the head of the page and does not run the app. So it gets the app's
// shell with an invite head. Every other visitor, and every other crawler, gets the
// static app from the catch-all. The app boots as usual, and createRoot replaces the
// body.
//
// Every anonymous request gets one generic card. The card names no trip.
// It shows no title, no day count and no names.
// The og:url names /join with no code. A chat app cannot keep a token this way.
// The response is noindex and no-store. It is never an error page.
//
// The handler makes no trip read. A valid code, a bad code and a malformed code
// all take the same path. The response bytes are the same for each one.
// This also keeps the timing equal: no lookup runs for any code.
import { applyHead } from './_headTemplate.js'
import { DEFAULT_ORIGIN, resolveOrigin } from './_origin.js'
import pageCards from '../scripts/page-cards.json' with { type: 'json' }

const CARD = pageCards.invite
const GENERIC_TITLE = "You're invited to a trip on YatraFlow"
const GENERIC_DESCRIPTION = 'Open the link to see the trip and join.'

// The page used when the built shell cannot be read. It carries the same head, and
// a link into the app, so a person still reaches YatraFlow.
const FALLBACK_SHELL = [
  '<!doctype html>',
  '<html lang="en-IN">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '  </body>',
  '</html>',
].join('\n')
const FALLBACK_BODY = '<main><p>Open <a href="/">YatraFlow</a> to join the trip together.</p></main>'

// The last resort: a complete page with the generic card and noindex.
// It needs no module, no origin and no read.
const STATIC_GENERIC_PAGE = [
  '<!doctype html>',
  '<html lang="en-IN">',
  '<head>',
  '<meta charset="UTF-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '<meta name="robots" content="noindex" />',
  `<meta name="description" content="${GENERIC_DESCRIPTION}" />`,
  `<title>You&#39;re invited to a trip on YatraFlow</title>`,
  '</head>',
  '<body>',
  `<div id="root">${FALLBACK_BODY}</div>`,
  '</body>',
  '</html>',
].join('\n')

/** The one head the invite page carries. It is the same for every code.
 *  The origin sets the og:url, which names /join with no code. */
export function inviteHead({ origin }) {
  return {
    title: GENERIC_TITLE,
    description: GENERIC_DESCRIPTION,
    robots: 'noindex',
    url: `${origin}/join`,
    image: {
      url: `${origin}/og/${CARD.file}`,
      width: 1200,
      height: 630,
      type: 'image/png',
      alt: CARD.headline,
    },
  }
}

/** This deployment's own shell. The host is the one Vercel names for this build.
 *  A preview reads its own app. A local run reads the canonical origin. */
export async function readShell(origin, env = process.env) {
  const base = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : origin
  try {
    const response = await fetch(`${base}/index.html`, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/** The page for one request: the shell with the generic head.
 *  A shell that cannot be read falls back to the same head with a link.
 *  Never an error page. */
export function renderInvitePage(shell, head) {
  if (typeof shell === 'string') {
    try {
      return applyHead(shell, head, null)
    } catch {
      // The shell is not the shape the build writes. The fallback below still serves the card.
    }
  }
  return applyHead(FALLBACK_SHELL, head, FALLBACK_BODY)
}

/** The generic card for a request whose head could not be built.
 *  It takes the production origin, so no lookup can fail a second time.
 *  The static page is the last resort when the shell cannot be written. */
function genericPage() {
  try {
    return applyHead(FALLBACK_SHELL, inviteHead({ origin: DEFAULT_ORIGIN }), FALLBACK_BODY)
  } catch {
    return STATIC_GENERIC_PAGE
  }
}

/** The headers every answer carries. A card is never indexed and never cached. */
function setCardHeaders(res) {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-robots-tag', 'noindex')
  res.setHeader('x-content-type-options', 'nosniff')
}

export default async function handler(req, res) {
  setCardHeaders(res)
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('allow', 'GET, HEAD')
      return res.status(405).end()
    }
    // A HEAD request has no body, so it makes no read.
    if (req.method === 'HEAD') return res.status(200).end()

    const origin = resolveOrigin()
    const shell = await readShell(origin)
    const head = inviteHead({ origin })
    res.status(200)
    return res.send(renderInvitePage(shell, head))
  } catch {
    // A throw of any kind answers the generic card, never an error page (#1042).
    if (res.headersSent) return res.end()
    res.status(200)
    if (req?.method === 'HEAD') return res.end()
    return res.send(genericPage())
  }
}
