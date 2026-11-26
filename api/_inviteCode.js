// ============ Invite codes for the server (api/join.js) ============
// A copy of the normalise and shape rules in src/lib/inviteCode.ts. This module is
// plain JS outside src, so the handler cannot import the client file.
// tests/join-preview.test.ts runs both over the same inputs and pins the answers.
//
// A code is <HEAD>-<TAIL>: the head is letters and digits, and the tail is eight
// characters from an unambiguous 28-character alphabet (codes made before the tail
// grew have a four-character tail, and they still work).

const TAIL_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY346789'
const TAIL_LENGTH = 8
const LEGACY_TAIL_LENGTH = 4
const INVITE_SEPARATOR = '-'

/** Trimmed, uppercase, one separator between the parts, and none at the ends. */
export function normalizeInviteCode(raw) {
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, INVITE_SEPARATOR)
    .replace(new RegExp(`${INVITE_SEPARATOR}{2,}`, 'g'), INVITE_SEPARATOR)
    .replace(new RegExp(`^${INVITE_SEPARATOR}+|${INVITE_SEPARATOR}+$`, 'g'), '')
}

/** Is this string shaped like an invite code: a head, one separator, and a tail of
 *  the current length or the legacy one? */
export function looksLikeInviteCode(raw) {
  const code = normalizeInviteCode(raw)
  const parts = code.split(INVITE_SEPARATOR)
  if (parts.length !== 2) return false
  const [head, tail] = parts
  const tailShape = new RegExp(`^(?:[${TAIL_ALPHABET}]{${TAIL_LENGTH}}|[${TAIL_ALPHABET}]{${LEGACY_TAIL_LENGTH}})$`)
  return /^[A-Z0-9]{1,10}$/.test(head) && tailShape.test(tail)
}
