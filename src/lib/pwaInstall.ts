// ============ Install affordance (PWA) ============
// Chromium fires `beforeinstallprompt` once the app qualifies (manifest +
// service worker + HTTPS); we hold the event and surface exactly one honest
// affordance. iOS Safari never fires it — installation there is Share → Add to
// Home Screen — so the UI shows that hint instead. Inside the Capacitor shell
// none of this applies: the app is already installed.
//
// The event is captured at module load (it can fire before any component
// mounts), which is why this is a module-level listener and not a hook.
import { isNative } from './native'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<(available: boolean) => void>()

function emit(): void {
  for (const listener of listeners) listener(deferred !== null)
}

/** True when the app is already running as an installed app (or in the shell). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const displayMode = window.matchMedia?.('(display-mode: standalone)')?.matches === true
  // iOS reports neither the media query on older versions nor the event — it
  // exposes its own flag once added to the Home Screen.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return displayMode || iosStandalone
}

/** Whether a captured install prompt is waiting to be used. */
export function installAvailable(): boolean {
  return deferred !== null
}

/** Subscribe to availability changes; called immediately with the current value. */
export function onInstallAvailability(listener: (available: boolean) => void): () => void {
  listeners.add(listener)
  listener(installAvailable())
  return () => {
    listeners.delete(listener)
  }
}

/** Show the browser's install prompt. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  deferred = null
  emit()
  try {
    await event.prompt()
    const choice = await event.userChoice
    return choice?.outcome === 'accepted'
  } catch {
    return false
  }
}

/** True on iOS Safari, where installation is a manual Share-sheet action. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

if (!isNative && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    // Suppress Chromium's own mini-infobar: the app surfaces its own chip.
    event.preventDefault()
    deferred = event as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}
