// ============ Home join card: a pasted link or a typed code ============
//
// The "Got an invite?" card on Home takes one value. A friend can send the full
// link (https://yatraflow.app/join/GOA-K7QFH3WT, #/join/GOA-K7QFH3WT, or an
// older /invite/<trip id> link) or read the bare code out over a call. This
// file decides which one the value is and where it leads. It never looks a code
// up and never joins anyone: the answer is a route, and the existing invite
// gate (App.tsx InviteGate) owns the lookup, the dead-link state and the join.
//
// The code rules are not repeated here. `normalizeInviteCode`,
// `looksLikeInviteCode` and `inviteRoute` in ./inviteCode own them.
// Pure module: no supabase/react imports, node-testable.
import { inviteRoute, looksLikeInviteCode, normalizeInviteCode } from './inviteCode'

/** Why a value could not be read. Each reason has its own words. */
export type InviteEntryError = 'empty' | 'link-without-code' | 'not-a-code'

export type InviteEntryVerdict =
  | { kind: 'join'; code: string; route: string }
  | { kind: 'trip-link'; tripId: string; route: string }
  | { kind: 'error'; reason: InviteEntryError; message: string }

export const INVITE_ENTRY_COPY: Record<InviteEntryError, string> = {
  empty: 'Enter an invite link or a join code',
  'link-without-code': 'This link has no join code. Ask for a new invite link',
  'not-a-code': 'This is not a join code. Check it, or paste the whole link',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** `/join/<code>` or `/invite/<trip id>` as a path, a `#/` route or a bare
 *  `join/<code>`. The segment ends at the next slash, query or fragment. */
const JOIN_SEGMENT = /(?:^|[/#])join\/([^/?#\s]*)/i
const INVITE_SEGMENT = /(?:^|[/#])invite\/([^/?#\s]*)/i

function error(reason: InviteEntryError): InviteEntryVerdict {
  return { kind: 'error', reason, message: INVITE_ENTRY_COPY[reason] }
}

function decoded(segment: string): string {
  try { return decodeURIComponent(segment) } catch { return segment }
}

/** Does the value read as a link or a route rather than a bare code? */
function looksLikeLink(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.includes('/') || value.startsWith('#')
}

/**
 * Read the value the Home join card holds.
 *
 *  - A link with `/join/<code>` leads to that code's invite route.
 *  - A link with `/invite/<trip id>` leads to the older trip-id route. That
 *    route opens the trip for a member and never joins anyone.
 *  - A bare code leads to its invite route. Lowercase and stray spaces are fine.
 *  - Anything else is an error with its own reason. Nothing here is a
 *    "not found": a code that has the right shape but no trip is the invite
 *    gate's answer, and it tells a dead link from a failed read.
 */
export function readInviteEntry(raw: string): InviteEntryVerdict {
  const value = raw.trim()
  if (!value) return error('empty')

  if (looksLikeLink(value)) {
    const join = JOIN_SEGMENT.exec(value)
    if (join) {
      const code = normalizeInviteCode(decoded(join[1]))
      return looksLikeInviteCode(code)
        ? { kind: 'join', code, route: inviteRoute(code) }
        : error(join[1] ? 'not-a-code' : 'link-without-code')
    }
    const invite = INVITE_SEGMENT.exec(value)
    if (invite) {
      const tripId = decoded(invite[1])
      return UUID.test(tripId)
        ? { kind: 'trip-link', tripId, route: `/invite/${tripId}` }
        : error(invite[1] ? 'not-a-code' : 'link-without-code')
    }
    return error('link-without-code')
  }

  const code = normalizeInviteCode(value)
  return looksLikeInviteCode(code)
    ? { kind: 'join', code, route: inviteRoute(code) }
    : error('not-a-code')
}
