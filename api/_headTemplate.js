// ============ The one head writer for static HTML the app serves (#1042) ============
// Two writers produce HTML from the built app shell: the build-time prerender of
// the static copy pages (scripts/prerender-static-pages.mjs) and the invite card
// (api/join.js). Both start from dist/index.html, so the hashed script and
// stylesheet tags survive, and both REPLACE the head tags this module owns rather
// than appending to them: a page with two canonicals or two descriptions is a
// duplicate-tag defect, and the old prerender plugin shipped exactly that.
//
// Every value is escaped, and the body is spliced by index, never by a
// String.replace replacement. A `$&` or `$$` in copy is literal text.
import { escapeHtml } from './_escape.js'
import { ogImageTags, twitterImageTags } from './_shareCard.js'

export const SITE_NAME = 'YatraFlow'

// The tags this writer owns in a template head. theme-color, the manifest, the
// icons and the Apple tags stay as the shell wrote them.
const MANAGED = [
  /<title>[\s\S]*?<\/title>\s*/g,
  /<meta\b[^>]*\b(?:name|property)="(?:description|robots|og:[^"]*|twitter:[^"]*)"[^>]*>\s*/g,
  /<link\b[^>]*\brel="canonical"[^>]*>\s*/g,
]

function metaName(key, value) {
  return `<meta name="${key}" content="${escapeHtml(value)}" />`
}

function metaProperty(key, value) {
  return `<meta property="${key}" content="${escapeHtml(value)}" />`
}

/** JSON that is safe inside a `<script>` element: no `<`, `>` or `&` can end or
 *  open markup. The escapes are valid JSON string escapes. */
export function jsonForScript(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/**
 * The head tags for one page.
 *
 * @param head {{
 *   title: string, description: string, canonical?: string, url?: string,
 *   robots?: string, image: {url, width?, height?, type?, alt?},
 *   jsonLd?: object, jsonLdAttr?: string, type?: string
 * }}
 *   `canonical` is written only when set. A noindex page has none. `url` is the
 *   og:url and is written only when set. `jsonLdAttr` is a bare attribute such as
 *   `data-faq-schema`, so the client can find and replace the same block.
 */
export function headTags(head) {
  const lines = [
    `<title>${escapeHtml(head.title)}</title>`,
    metaName('description', head.description),
  ]
  if (head.robots) lines.push(metaName('robots', head.robots))
  if (head.canonical) lines.push(`<link rel="canonical" href="${escapeHtml(head.canonical)}" />`)
  lines.push(metaProperty('og:type', head.type ?? 'website'))
  lines.push(metaProperty('og:site_name', SITE_NAME))
  lines.push(metaProperty('og:title', head.title))
  lines.push(metaProperty('og:description', head.description))
  if (head.url) lines.push(metaProperty('og:url', head.url))
  lines.push(...ogImageTags(head.image).split('\n'))
  lines.push(metaName('twitter:card', 'summary_large_image'))
  lines.push(metaName('twitter:title', head.title))
  lines.push(metaName('twitter:description', head.description))
  lines.push(...twitterImageTags(head.image).split('\n'))
  if (head.jsonLd) {
    const attr = head.jsonLdAttr ? ` ${head.jsonLdAttr}` : ''
    lines.push(`<script type="application/ld+json"${attr}>${jsonForScript(head.jsonLd)}</script>`)
  }
  return lines.join('\n    ')
}

/** The body of `<div id="root">`, replaced. The shell's own noscript fallback is
 *  part of that body, so the static copy replaces it. */
function spliceRoot(html, body) {
  const open = html.indexOf('<div id="root">')
  const bodyEnd = html.indexOf('</body>')
  if (open < 0 || bodyEnd < 0 || bodyEnd < open) throw new Error('the shell has no <div id="root"> inside <body>')
  const close = html.lastIndexOf('</div>', bodyEnd)
  if (close < open) throw new Error('the shell has no closing </div> for #root')
  return html.slice(0, open) + `<div id="root">${body}` + html.slice(close)
}

/**
 * A complete page from the built shell.
 *
 * @param {string} shell the built index.html
 * @param {Parameters<typeof headTags>[0]} head the page's head fields
 * @param {string | null} [body] the rendered page; null keeps the shell's #root
 *
 * Removes every managed tag from the shell's head, inserts the head for this
 * page just before </head>, and, when `body` is given, replaces the #root
 * content. Throws when the shell is not the shape the build writes, so a broken
 * template fails the build instead of shipping a page without its app.
 */
export function applyHead(shell, head, body = null) {
  let html = shell
  for (const pattern of MANAGED) html = html.replace(pattern, () => '')
  const close = html.indexOf('</head>')
  if (close < 0 || html.indexOf('</head>', close + 1) >= 0) throw new Error('the shell needs exactly one </head>')
  // Insert at the line that holds </head>, so the indent of the new tags is ours.
  const before = html.slice(0, close).replace(/[ \t]*$/, '')
  html = `${before}\n    ${headTags(head)}\n  ` + html.slice(close)
  if (body !== null) html = spliceRoot(html, body)
  return html
}

/** Counts of the tags a crawler reads once. A page that fails this is not written. */
export function singleHeadTags(html) {
  const count = pattern => (html.match(pattern) ?? []).length
  return {
    title: count(/<title>/g),
    description: count(/<meta name="description"/g),
    canonical: count(/<link rel="canonical"/g),
    ogUrl: count(/<meta property="og:url"/g),
  }
}
