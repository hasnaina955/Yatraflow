// ============ Feature flags ============
// Runtime gates for features that are built but not yet launched. Flags are
// read once at module load — they are build-time switches, not user settings.

/**
 * AI travel companion — LOCKED until the 1.0 cut (M8: offline-first, i18n and
 * the 1.0 release), which is where it gets unmounted for the premium perk. The
 * drawer, its answers and the FAB stay fully implemented;
 * they are simply not mounted until the flag turns on, so the feature can
 * ship as a paid perk without a re-build from git history. Preview locally
 * with VITE_AI_COMPANION=on in .env.local.
 */
export const AI_COMPANION_ENABLED = ((import.meta.env.VITE_AI_COMPANION as string | undefined) ?? '').trim() === 'on'
