// ============ dayCount for the server (api/join.js) ============
// A copy of src/lib/dayCount.ts, which is the one day-count computation the app
// uses. This module is plain JS outside src, so the handler cannot import the client
// file. tests/join-preview.test.ts runs both over the same dates and pins the answers.
//
// Contract: LOCAL midnight, and 0 for a missing, unparseable, impossible or inverted
// range. The day count is inclusive: one day for a single date.

export const DAY_MS = 86_400_000

/** `yyyy-mm-dd` as local midnight in ms, or null when the string is missing,
 *  malformed, or a date that does not exist (2026-02-30, month 13). */
export function localMidnightMs(iso) {
  if (typeof iso !== 'string') return null
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const t = new Date(y, mo - 1, d)
  // Round-trip check: `new Date(2026, 12, 1)` silently rolls into 2027.
  if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d) return null
  return t.getTime()
}

/** Inclusive days spanned by [startIso, endIso]: 1 for a single day, 0 for a
 *  missing, invalid or inverted range. Round, not floor, so a DST edge (23 h or
 *  25 h days) still counts whole days. */
export function dayCountForRange(startIso, endIso) {
  const start = localMidnightMs(startIso)
  const end = localMidnightMs(endIso)
  if (start === null || end === null || end < start) return 0
  return Math.round((end - start) / DAY_MS) + 1
}
