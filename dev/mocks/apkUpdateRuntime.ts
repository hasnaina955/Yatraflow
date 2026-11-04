// ============ Development mock: the APK update runtime ============
// LOADED ONLY BY vite.profile-fixture.config.ts. It replaces the whole module,
// because the real one boots a Capacitor plugin and a network feed. It answers
// the same `UpdateRuntimeStatus` shape the Profile card reads, from the URL.
//
// LAYOUT ONLY. This is not a native runtime test: it says "given this status,
// does the card draw and how tall is it", not "does the update check work".
import type { UpdateRuntimeStatus } from '../src/lib/apkUpdateRuntime'

const params = new URLSearchParams(location.search)
const UPDATE = params.get('update') ?? 'none'

const installed = { versionName: '0.83.0', versionCode: 8300, appId: 'in.yatraflow.app' }

const statuses: Record<string, UpdateRuntimeStatus> = {
  none: { booting: false, unavailable: null, installed: null, state: { phase: 'idle' } },
  current: {
    booting: false, unavailable: null, installed,
    state: { phase: 'current', checkedAt: 1, manual: true },
  },
  newer: {
    booting: false, unavailable: null, installed,
    state: {
      phase: 'newer', checkedAt: 1, manual: true,
      manifest: {
        versionName: '0.84.0', versionCode: 8400,
        apkUrl: 'https://www.yatraflow.in/android/latest.apk',
        sha256: '0'.repeat(64), publishedAt: '2026-11-01',
        minSupportedVersionCode: 8000, notes: null,
      },
    },
  },
  unconfigured: {
    booting: false, unavailable: 'unconfigured', installed: null,
    state: { phase: 'idle' },
  },
}

const status: UpdateRuntimeStatus = statuses[UPDATE] ?? statuses.none

export const APK_UPDATE_LATER_KEY = 'yatraflow_apk_update_later'
export const APK_UPDATE_FETCH_TIMEOUT_MS = 10_000

export function apkUpdateStatus(): UpdateRuntimeStatus { return status }
export function subscribeApkUpdate(): () => void { return () => {} }
export function apkUpdateEnabled(): boolean { return true }
export async function bootApkUpdates(): Promise<void> { /* synthetic: no feed read */ }
export async function apkUpdateCheck(): Promise<UpdateRuntimeStatus['state']> { return status.state }
export function apkUpdateLater(): boolean { return false }
