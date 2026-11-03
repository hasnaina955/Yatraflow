// ============ APK update feed configuration ============
// Both values are build variables, in the same shape as lib/featureFlags. An
// unset value means "no feed", so the feature stays inert.
//
// The endpoint is served by `api/android-manifest.js`, and `vercel.json` routes
// it ahead of the SPA catch-all. The document is derived from the newest
// release that carries an APK asset, so a release cut publishes it. Neither
// variable gets a value until the coordinator approves them; see
// docs/APK-UPDATE-FEED.md for the contract and the activation steps.

import type { UpdateChannel } from './apkUpdates'

/** The production Android application id, matching capacitor.config.ts. */
export const PRODUCTION_APP_ID = 'app.yatraflow.mobile'

/**
 * The audit application id. The audit build applies an external, debug-only
 * Gradle override that appends `.t3audit`; the id never appears in the app
 * source otherwise, which is why it is spelled out here as a known value.
 */
export const AUDIT_APP_ID = 'app.yatraflow.mobile.t3audit'

/**
 * The channel an installed app id belongs to, or null when it is not ours.
 * Only these two exact ids are recognised. An unknown id gets no check, so a
 * wrong channel can never be guessed.
 */
export function channelForAppId(appId: string): UpdateChannel | null {
  if (appId === PRODUCTION_APP_ID) return 'production'
  if (appId === AUDIT_APP_ID) return 'audit'
  return null
}

/** The manifest URL, or '' when unconfigured. */
export function apkUpdateFeedUrl(raw?: string): string {
  const value = raw ?? (import.meta.env.VITE_APK_UPDATE_FEED_URL as string | undefined)
  return (value ?? '').trim()
}

/**
 * The exact approved hosts for the manifest and the download, lower-cased.
 * Empty when unconfigured, and an empty list approves nothing.
 */
export function apkUpdateHosts(raw?: string): string[] {
  const value = raw ?? (import.meta.env.VITE_APK_UPDATE_HOSTS as string | undefined)
  return (value ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
}
