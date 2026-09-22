// ============ Offline banner (PWA phases 2 + 3) ============
// Says plainly what the app is showing when the network is gone — the plan as
// it was last synced — and, since phase 3, that trip edits made now are saved
// on this device and will sync. It renders ONLY while actually offline: a
// partial hydrate while online is the store's own toast's job, and two
// competing explanations is how a user learns to ignore both.
import { useEffect, useState } from 'react'
import { resumeSync, useDb } from '../store/store'
import { formatHM, useTimeFormat } from '../lib/timefmt'
import { pendingWriteCount } from '../lib/writeQueue'

export function OfflineBanner() {
  const db = useDb()
  const timeFormat = useTimeFormat()
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [retrying, setRetrying] = useState(false)
  const [pending, setPending] = useState(0)

  // One effect owns both the connection state and the queued-edit count: they
  // change together (going offline is when edits start piling up), and the
  // count is also re-read when the account changes.
  useEffect(() => {
    let alive = true
    const refreshCount = () => {
      void pendingWriteCount(db.sessionUserId ?? undefined).then(count => {
        if (alive) setPending(count)
      })
    }
    const up = () => {
      setOnline(true)
      refreshCount()
    }
    const down = () => {
      setOnline(false)
      refreshCount()
    }
    refreshCount()
    addEventListener('online', up)
    addEventListener('offline', down)
    return () => {
      alive = false
      removeEventListener('online', up)
      removeEventListener('offline', down)
    }
  }, [db.sessionUserId])

  if (online) return null

  // The snapshot's own timestamp, formatted in the user's chosen clock. Absent
  // (nothing was ever cached) the banner says so rather than inventing a time.
  const clock = db.cachedAt ? formatHM(new Date(db.cachedAt).toTimeString().slice(0, 5), timeFormat) : null

  return (
    <div className="offline-banner" role="status">
      <span>
        No connection — showing {clock ? `your saved plan from ${clock}` : 'what loaded last'}.{' '}
        {pending > 0
          ? `${pending} trip edit${pending === 1 ? '' : 's'} saved on this device, syncing when you reconnect.`
          : 'Trip edits you make now are saved on this device and sync when you reconnect.'}
      </span>
      <button
        className="btn btn-outline btn-sm"
        disabled={retrying}
        onClick={() => {
          setRetrying(true)
          // The same full refetch the native shell runs on app-resume: it
          // bypasses hydrate's same-user dedupe, re-subscribes realtime, and
          // (phase 3) pushes every queued edit.
          void resumeSync().finally(() => {
            setRetrying(false)
            void pendingWriteCount(db.sessionUserId ?? undefined).then(setPending)
          })
        }}
      >
        {retrying ? 'Reconnecting…' : 'Retry'}
      </button>
    </div>
  )
}
