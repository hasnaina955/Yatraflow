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

/**
 * Create-flow funnel phases (the P1-P8 arc: templates, budget anchor, readiness,
 * drafts, crew invites, the moment-after screen, the shareable bill, input IQ).
 *
 * VITE_CREATE_FUNNEL holds a comma-separated phase list, e.g.
 *   VITE_CREATE_FUNNEL=templates,budget
 *
 * Semantics, chosen so `test` can dark-run a phase before `main` sees it:
 *   - explicit list  -> exactly those phases are on (dev included)
 *   - unset, dev    -> every phase on, so the work is visible locally without config
 *   - unset, prod   -> dark
 */
export function parseFunnelPhases(raw: string | undefined, dev: boolean): { phases: Set<string>; all: boolean } {
  const list = (raw ?? '').split(',').map(part => part.trim()).filter(Boolean)
  if (list.length) return { phases: new Set(list), all: false }
  return { phases: new Set(), all: dev }
}

const _funnel = parseFunnelPhases(
  import.meta.env.VITE_CREATE_FUNNEL as string | undefined,
  !!import.meta.env.DEV,
)

/** Is a create-flow phase switched on in this build? */
export function createFunnelOn(phase: string): boolean {
  return _funnel.all || _funnel.phases.has(phase)
}
