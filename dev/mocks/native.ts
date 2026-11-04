// ============ Development mock: the native platform ============
// LOADED ONLY BY vite.profile-fixture.config.ts, which aliases `lib/native` to
// this file for the fixture build. Production and every test keep the real
// module; nothing under `src/` imports this.
//
// The one fact it synthesizes is the platform. It cannot make a browser into a
// Capacitor shell, so anything it renders proves LAYOUT ONLY: a card drawn here
// is not evidence that the real native runtime behaves the same.
//
// The signatures mirror `src/lib/native.ts` so the fixture compiles against the
// module's real contract instead of a looser fiction.
const PLATFORM = new URLSearchParams(location.search).get('platform') ?? 'web'

export const isNative = PLATFORM === 'native'
export const isAndroid = PLATFORM === 'native'

export type WatchHandle = { stop: () => void }

export async function nativeCopyText(): Promise<boolean> { return false }
export async function nativeCopyImage(): Promise<boolean> { return false }

export async function nativeShareText(): Promise<'shared' | 'unavailable'> { return 'unavailable' }

export async function nativeShareImage(): Promise<'shared' | 'copied' | 'downloaded' | 'dismissed'> {
  return 'dismissed'
}

export function openExternal(): void { /* synthetic: nothing navigates */ }

export async function nativeLocate(): Promise<GeolocationPosition | null> { return null }

export function nativeWatch(
  onFix: (pos: GeolocationPosition | null) => void,
): WatchHandle {
  onFix(null)
  return { stop: () => {} }
}
