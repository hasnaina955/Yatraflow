/**
 * Single source of truth for the user-visible brand.
 *
 * Every screen string, export filename, calendar identity, notification title
 * and support mailbox reads from this object. To rename the product, edit the
 * values here — then flip the static platform fields that cannot read code:
 *   - package.json  "name"
 *   - capacitor.config.ts  appId / appName
 *   - android/  applicationId + namespace + MainActivity package + keystore
 *     alias/file + CI APK naming (android/app/build.gradle, yatraflow-apk.yml)
 *   - the support mailbox at its provider (BRAND.supportEmail)
 *   - Vercel project + domain, Supabase auth Site URL / redirect allowlist
 *   - docs (README, ROADMAP, USER_GUIDE, DEPLOYMENT, ...) — CHANGELOG and
 *     docs/history stay as historical record, with a one-line "formerly"
 *     note added at rename time.
 *
 * Internal identifiers are deliberately left as vestigial prefixes — they are
 * invisible to users and renaming them is pure regression risk: the --yf-*
 * design tokens, yf-* class names, yatraflow_* storage keys, [yatraflow]
 * console tags, the realtime channel name and the demo emails in seed data.
 */
export const BRAND = {
  /** Product name shown in UI copy, footers, notifications and exports. */
  name: 'YatraFlow',
  /** Tagline used on the Landing footer and document meta. */
  tagline: 'Plan real trips, together',
  /** Address embedded in every feedback mailto. */
  supportEmail: 'support@yatraflow.app',
  /** Prefix on feedback mailto subjects, e.g. "YatraFlow feedback (v0.48.0)". */
  feedbackPrefix: 'YatraFlow feedback',
  /** Shown as the browser-notification title. */
  notificationTitle: 'YatraFlow',
  /** Native share-sheet clipboard label (Capacitor). */
  clipboardLabel: 'YatraFlow link',
  /** Filename suffix for exported files: *_yatraflow.ics, *_yatraflow.json. */
  exportSuffix: 'yatraflow',
  /** PNG cost-estimate export base name. */
  pngExportName: 'yatraflow-trip.png',
  /** ICS calendar identity. KEEP STABLE across a rename: changing the UID
   *  domain makes already-imported calendar events duplicate. */
  icsProdid: '-//YatraFlow//Trip Planner//EN',
  icsUidDomain: 'yatraflow',
  /** Live Plan Bench URL referenced in shared cost-estimate images. */
  benchUrl: 'https://yatraflow-blond.vercel.app/',
} as const

/** "a YatraFlow traveller" attribution on Explore + public itineraries. */
export const travellerAttribution = `a ${BRAND.name} traveller`
