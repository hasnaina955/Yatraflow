import type { ClaimTransfer } from './creatorClaim'

/** External avatar images are optional. An insecure or malformed URL is omitted. */
export function browseClaimAvatar(url?: string | null): string | null {
  try {
    const parsed = new URL(url ?? '')
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null
  } catch {
    return null
  }
}

interface ClaimAccountRead {
  sessionUserId: string | null
  sliceReads: Record<string, 'ok' | 'failed'>
  users: readonly { id: string; kind: string; profile: { isCreator: boolean } }[]
  trips: readonly { id: string; members?: readonly { userId: string; role: string }[] }[]
}

/** Report readiness only after the verified account and its trips were read. */
export function claimAccountReady(db: ClaimAccountRead, result: ClaimTransfer): boolean {
  const user = db.users.find(user => user.id === result.claimerId)
  return db.sessionUserId === result.claimerId && db.sliceReads['self profile'] === 'ok' &&
    db.sliceReads.trips === 'ok' && user?.kind === 'private' && user.profile.isCreator &&
    result.movedTripIds.length > 0 && result.movedTripIds.every(id => db.trips.some(trip => trip.id === id &&
      trip.members?.some(member => member.userId === result.claimerId && member.role === 'owner')))
}
