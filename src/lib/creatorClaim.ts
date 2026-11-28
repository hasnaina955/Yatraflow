// Public claim preview and transfer result: only reviewed fields enter the UI.
export type ClaimStatus = 'unclaimed' | 'claimed' | 'revoked' | 'expired' | 'invalid'
export interface ClaimCreator {
  name: string
  avatar_url?: string | null
  home_city?: string | null
  creator_bio?: string | null
}
export interface ClaimTrip {
  id: string
  name: string
  destinations: string[]
  days: { index?: number; title?: string | null; stops: { title: string; arrivalTime?: string | null }[] }[]
}
export type ClaimPreview =
  | { status: 'unclaimed'; creator: ClaimCreator; trips: ClaimTrip[]; expires_at?: string }
  | { status: Exclude<ClaimStatus, 'unclaimed'> }

export interface ClaimTransfer {
  claimerId: string
  movedTripIds: string[]
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string')
}

function optionalText(value: unknown): value is string | null | undefined {
  return value == null || typeof value === 'string'
}

function claimTrip(value: unknown): value is ClaimTrip {
  if (!record(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' ||
      !strings(value.destinations) || !Array.isArray(value.days)) return false
  return value.days.every(day => record(day) && (day.index === undefined || Number.isInteger(day.index)) &&
    optionalText(day.title) && Array.isArray(day.stops) &&
    day.stops.every((stop: unknown) => record(stop) && typeof stop.title === 'string' && optionalText(stop.arrivalTime)))
}

/** A failed or malformed response is different from an invalid invitation. */
export function readClaimPreview(value: unknown): ClaimPreview | null {
  if (!record(value)) return null
  if (value.found === false && value.status === 'invalid') return { status: 'invalid' }
  if (value.found !== true) return null
  if (value.status === 'claimed' || value.status === 'revoked' || value.status === 'expired') {
    return { status: value.status }
  }
  if (value.status !== 'unclaimed' || !record(value.creator) || !Array.isArray(value.trips) ||
      typeof value.creator.name !== 'string' || !value.creator.name ||
      !value.trips.every(claimTrip) || !optionalText(value.creator.avatar_url) ||
      !optionalText(value.creator.home_city) || !optionalText(value.creator.creator_bio)) return null
  return {
    status: 'unclaimed',
    creator: {
      name: value.creator.name,
      avatar_url: value.creator.avatar_url,
      home_city: value.creator.home_city,
      creator_bio: value.creator.creator_bio,
    },
    trips: value.trips,
    expires_at: typeof value.expires_at === 'string' ? value.expires_at : undefined,
  }
}

export function readClaimTransfer(value: unknown): ClaimTransfer | null {
  if (!record(value) || value.ok !== true || typeof value.claimerId !== 'string' ||
      !strings(value.movedTripIds) || !value.movedTripIds.length) return null
  return { claimerId: value.claimerId, movedTripIds: value.movedTripIds }
}

export function claimError(value: unknown, fallback: string): string {
  return record(value) && typeof value.error === 'string' ? value.error : fallback
}
