// ============ Development mock: PWA install availability ============
// LOADED ONLY BY vite.profile-fixture.config.ts. The real module waits for
// Chromium's `beforeinstallprompt`, which a synthetic page never receives, so
// `InstallCard` could not be reached in either state. This answers the same
// functions from the URL.
//
// It deliberately does NOT re-export the real module: the fixture's resolver maps
// the real specifier to this file, so importing it here would loop.
const params = new URLSearchParams(location.search)
const INSTALL = params.get('install') ?? 'none'

/** `installed` = already standalone; `ios` = the Share-sheet hint path. */
export function isStandalone(): boolean { return INSTALL === 'installed' }

export function isIosSafari(): boolean { return INSTALL === 'ios' }

/** `available` = Chromium's captured prompt is waiting. */
export function installAvailable(): boolean { return INSTALL === 'available' }

export function onInstallAvailability(listener: (available: boolean) => void): () => void {
  listener(installAvailable())
  return () => {}
}

/** Never resolves true: a synthetic page has no real prompt to show. */
export async function promptInstall(): Promise<boolean> { return false }
