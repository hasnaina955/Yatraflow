// ============ Offline banner (PWA phase 2) ============
// Says plainly what the app is showing when the network is gone: the plan as it
// was last synced, read-only, with a retry. It renders ONLY while actually
// offline — a partial hydrate while online is the store's own toast's job, and
// two competing explanations is how a user learns to ignore both.
import { useEffect, useState } from 'react'
import { resumeSync, useDb } from '../store/store'
import { formatHM, useTimeFormat } from '../lib/timefmt'

export function OfflineBanner() {
  const db = useDb()
  const timeFormat = useTimeFormat()
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    addEventListener('online', up)
    addEventListener('offline', down)
    return () => {
      removeEventListener('online', up)
      removeEventListener('offline', down)
    }
  }, [])

  if (online) return null

  // The snapshot's own timestamp, formatted in the user's chosen clock. Absent
  // (nothing was ever cached, or the hydrate failed while online) the banner
  // says so rather than inventing a time.
  const clock = db.cachedAt ? formatHM(new Date(db.cachedAt).toTimeString().slice(0, 5), timeFormat) : null

  return (
    <div className="offline-banner" role="status">
      <span>
        No connection — showing {clock ? `your saved plan from ${clock}` : 'what loaded last'}. Changes need the network.
      </span>
      <button
        className="btn btn-outline btn-sm"
        disabled={retrying}
        onClick={() => {
          setRetrying(true)
          // The same full refetch the native shell runs on app-resume: it
          // bypasses hydrate's same-user dedupe and re-subscribes realtime.
          void resumeSync().finally(() => setRetrying(false))
        }}
      >
        {retrying ? 'Reconnecting…' : 'Retry'}
      </button>
    </div>
  )
}
