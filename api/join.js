// ============ /join/<code>: the invite link card (#1042) ============
// vercel.json rewrites `/join/:code` to this handler only for a link-preview bot.
// The condition is the user-agent list of the /pub/:slug rewrite, copied exactly.
// A bot reads the head of the page and does not run the app. So it gets the app's
// shell with an invite head. Every other visitor, and every other crawler, gets the
// static app from the catch-all. The app boots as usual, and createRoot replaces the
// body.
//
// What it reads: the one read the invite screen makes for a signed-out visitor.
// It is the anonymous RPC get_trip_by_invite_code, narrowed with `select` to the
// columns the card uses. The code is the capability. For an anonymous caller, that
// RPC returns a trip only when it is private or has no paid published guide. So a
// priced trip answers nothing and gets the generic card. The rule is in
// supabase/migrations/20261124c_invite_preview_write_version.sql, and no migration
// is added.
//
// What it shows: the trip's name, and its day count, counted as the invite screen
// counts it (see dayCountOf). Nothing else: no members, budget, destination, dates
// or days. A code no trip has, a malformed code, every failed read, and any throw all
// get the generic card. The response is noindex and no-store, and it is never an error
// page.
import { applyHead } from './_headTemplate.js'
import { dayCountForRange } from './_dayCount.js'
import { looksLikeInviteCode, normalizeInviteCode } from './_inviteCode.js'
import { DEFAULT_ORIGIN, resolveOrigin } from './_origin.js'
import { fitOg, OG_TITLE_MAX } from './_shareCard.js'
import { supabaseAnonHeaders } from './_supabase-headers.js'
import pageCards from '../scripts/page-cards.json' with { type: 'json' }

const CARD = pageCards.invite
const GENERIC_TITLE = "You're invited to plan a trip"
const GENERIC_DESCRIPTION = 'Open the link to join a trip plan on YatraFlow.'
const NAMED_DESCRIPTION = 'Open the link to join this trip plan on YatraFlow.'
const READ_TIMEOUT_MS = 4000
// The columns the card reads. The RPC returns the whole trip row otherwise.
// PostgREST applies `select` to the rows of a set-returning function, and this one
// returns setof trips. The read narrows to these columns, so it cannot widen the
// anonymous view.
const INVITE_COLUMNS = 'name,days,start_date,end_date'

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

// The last resort: a complete page with the generic card's title, description and noindex,
// and a link into the app. It needs no module, no origin and no read.
const STATIC_GENERIC_PAGE = [
  '<!doctype html>',
  '<html lang="en-IN">',
  '<head>',
  '<meta charset="UTF-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '<meta name="robots" content="noindex" />',
  '<meta name="description" content="Open the link to join a trip plan on YatraFlow." />',
  '<title>You&#39;re invited to plan a trip</title>',
  '</head>',
  '<body>',
  `<div id="root">${FALLBACK_BODY}</div>`,
  '</body>',
  '</html>',
].join('\n')

/** The title of a named invite: `Join «name» · N days`. The day part is left out
 *  when the dates give no count. The name is cut to the card's title budget, at a
 *  word boundary, so the whole title stays readable in a chat preview. */
export function namedTitle(name, days) {
  const tail = days > 0 ? ` · ${days} ${days === 1 ? 'day' : 'days'}` : ''
  const open = 'Join «'
  const room = Math.max(1, OG_TITLE_MAX - open.length - '»'.length - tail.length)
  return `${open}${fitOg(name, room)}»${tail}`
}

/** The head one invite page carries. `name` and `days` come only from the anonymous
 *  read, and a missing name gives the generic card. `code` is set only for a code
 *  shaped like an invite, and it names the og:url.
 *
 *  @param {{ name?: string | null, days?: number, code?: string | null, origin: string }} fields
 */
export function inviteHead({ name = null, days = 0, code = null, origin }) {
  const named = typeof name === 'string' && name.trim() !== ''
  return {
    title: named ? namedTitle(name, days) : GENERIC_TITLE,
    description: named ? NAMED_DESCRIPTION : GENERIC_DESCRIPTION,
    robots: 'noindex',
    ...(code ? { url: `${origin}/join/${code}` } : {}),
    image: {
      url: `${origin}/og/${CARD.file}`,
      width: 1200,
      height: 630,
      type: 'image/png',
      alt: CARD.headline,
    },
  }
}

/** The day count a card shows for one invite row. The invite screen counts the trip's
 *  days: App.tsx reads `shownTrip.days.length` (`inviteFacts.days`), and the row's
 *  `days` array is what that trip is built from. So a row with a days array shows
 *  that array's length, even when the dates span another count. A row with no days
 *  array falls back to its start and end dates. The screen would show no count
 *  there (rowToTrip reads a missing days field as an empty list), and the card does
 *  show the dates' count. A count that is not a positive integer is omitted. */
export function dayCountOf(row) {
  const count = Array.isArray(row.days) ? row.days.length : dayCountForRange(row.start_date, row.end_date)
  return Number.isInteger(count) && count > 0 ? count : 0
}

/** The name and day count of the trip behind a code, or null. Null covers every
 *  answer that is not a trip: an empty list (no trip has the code), a row with no
 *  usable name, a non-OK status, a timeout and a network error. Each one gets the
 *  generic card, so none of them can show the wrong trip. */
export async function readInvite(code, env = process.env) {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/get_trip_by_invite_code?select=${INVITE_COLUMNS}`, {
      method: 'POST',
      headers: supabaseAnonHeaders(key, { 'content-type': 'application/json' }),
      body: JSON.stringify({ p_code: code }),
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const rows = await response.json()
    if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== 'object') return null
    const row = rows[0]
    if (typeof row.name !== 'string' || row.name.trim() === '') return null
    return { name: row.name, days: dayCountOf(row) }
  } catch {
    return null
  }
}

/** This deployment's own shell. The host is the one Vercel names for this build, so
 *  a preview reads its own app; a local run reads the canonical origin. */
export async function readShell(origin, env = process.env) {
  const base = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : origin
  try {
    const response = await fetch(`${base}/index.html`, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/** The page for one request: the shell with the invite head. A shell that cannot be
 *  read, or is not the shape the build writes, falls back to the same head with a
 *  link into the app. Never an error page.
 *
 *  @param {string | null} shell the built index.html, or null when it could not be read
 *  @param {ReturnType<typeof inviteHead>} head
 */
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

/** The generic card, for a request whose named head could not be built. It takes the
 *  production origin, so no request-time lookup can fail a second time. The static
 *  page is the last resort, for a shell that cannot be written at all. */
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
    const raw = req.query?.code
    // A malformed code makes no read at all: it has no trip to find.
    const code = typeof raw === 'string' && looksLikeInviteCode(raw) ? normalizeInviteCode(raw) : null
    // The trip read and the shell read run together, so the wait is one timeout at most.
    const [trip, shell] = await Promise.all([code ? readInvite(code) : null, readShell(origin)])
    const head = inviteHead({ name: trip?.name ?? null, days: trip?.days ?? 0, code, origin })
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
