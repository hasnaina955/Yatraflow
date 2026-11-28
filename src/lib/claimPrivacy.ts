/** Private claim links can appear in a path or inside the auth return query.
 * Remove the whole address when it carries a claim token, including encoded
 * copies. A deeply encoded value whose contents cannot be checked also gets
 * a fixed safe label. Never send the token to a feedback or analytics service. */
export function redactClaimUrl(url: string): string {
  let decoded = url
  for (let i = 0; i < 8; i++) {
    if (/\/claim\//i.test(decoded)) return '/claim'
    const next = decoded.replace(/%([\da-f]{2})/gi, (_, byte: string) => String.fromCharCode(parseInt(byte, 16)))
    if (next === decoded) return url
    decoded = next
  }
  return /%[\da-f]{2}|\/claim\//i.test(decoded) ? '/' : url
}
