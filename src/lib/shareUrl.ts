import { Capacitor } from '@capacitor/core'

const PUBLIC_ORIGIN = 'https://yatraflow-blond.vercel.app'

export function publicShareUrl(pubId: string, origin: string, native = false): string {
  return `${native ? PUBLIC_ORIGIN : origin.replace(/\/+$/, '')}/i/${encodeURIComponent(pubId)}`
}

export function currentPublicShareUrl(pubId: string): string {
  return publicShareUrl(pubId, location.origin, Capacitor.isNativePlatform())
}
