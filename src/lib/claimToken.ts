import { claimTokenFromHash } from './routes'

const key = 'yf.claimToken'
type ClaimStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function readClaimToken(hash: string, storage: () => ClaimStorage, clearHash: () => void): string | null {
  const token = claimTokenFromHash(hash)
  if (token) {
    try { storage().setItem(key, token) } catch { /* Keep the token for this visit. */ }
    clearHash()
    return token
  }
  try { return claimTokenFromHash(`#${storage().getItem(key) ?? ''}`) } catch { return null }
}

export function clearClaimToken(storage: () => ClaimStorage): void {
  try { storage().removeItem(key) } catch { /* Storage may be unavailable. */ }
}
