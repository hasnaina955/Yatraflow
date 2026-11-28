// Every unfurler receives the same branded card. This function does not read
// the claim or its token, so it cannot show or change private data.
import { resolveOrigin } from './_origin.js'
import { escapeHtml } from './_escape.js'
import { claimHeaders } from './_creatorClaim.js'

export default function handler(req, res) {
  claimHeaders(res)
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('vary', 'User-Agent')
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD')
    return res.status(405).end()
  }
  if (req.method === 'HEAD') return res.status(200).end()
  const title = 'Your YatraFlow Creator Profile is Ready'
  const description = 'Private creator invite. Preview your trips and claim your creator profile.'
  const image = escapeHtml(`${resolveOrigin()}/og/creator-claim-invite.png`)
  return res.status(200).send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="YatraFlow creator invite">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
</head><body><h1>${title}</h1><p>${description}</p></body></html>`)
}
