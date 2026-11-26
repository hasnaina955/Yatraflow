// The owner's pending join requests for a priced trip (D4). Approve and Decline
// call decide_trip_join. Loading, empty and failed stay apart: a list that did
// not load is never shown as "No one is waiting to join".
import { useEffect, useState } from 'react'
import { decideTripJoin, listPendingJoinRequests, type PendingJoinRequest } from '../../lib/joinRequests'
import { Chip } from '../../components/ui'
import { timeAgo } from './shared'

const ROLE_NAME = { editor: 'Editor', viewer: 'Viewer' } as const

type ListState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ok'; requests: PendingJoinRequest[] }

export function JoinRequests({ tripId }: { tripId: string }) {
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [failedDecision, setFailedDecision] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void listPendingJoinRequests(tripId).then(r => {
      if (alive) setList(r.kind === 'ok' ? { kind: 'ok', requests: r.requests } : { kind: 'failed' })
    })
    return () => { alive = false }
  }, [tripId, reload])

  const decide = (id: string, approve: boolean) => {
    setBusy(id)
    setFailedDecision(null)
    void decideTripJoin(id, approve).then(r => {
      setBusy(null)
      if (r.kind === 'ok') {
        setList({ kind: 'loading' })
        setReload(n => n + 1)
      }
      else setFailedDecision(id)
    })
  }

  return (
    <section className="share-join-requests" aria-labelledby="share-join-title">
      <h3 id="share-join-title" className="shr-card-title">Join requests</h3>
      {list.kind === 'loading' && <p className="share-join-state" role="status">Loading requests…</p>}
      {list.kind === 'failed' && (
        <div className="share-join-state" role="alert">
          <p>Couldn’t load join requests.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setList({ kind: 'loading' }); setReload(n => n + 1) }}>Try again</button>
        </div>
      )}
      {list.kind === 'ok' && list.requests.length === 0 && (
        <p className="share-join-state">No one is waiting to join.</p>
      )}
      {list.kind === 'ok' && list.requests.length > 0 && (
        <ul className="share-join-list">
          {list.requests.map(r => (
            <li key={r.id} className="feed-item shr-member-row share-join-row">
              <div className="shr-member-details">
                <b>{r.name}</b>
                <div className="small muted">{timeAgo(Date.parse(r.createdAt))}</div>
              </div>
              <Chip tone="info">{ROLE_NAME[r.role]}</Chip>
              <span className="share-join-actions">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => { decide(r.id, true) }}>Approve</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={busy === r.id} onClick={() => { decide(r.id, false) }}>Decline</button>
              </span>
              {failedDecision === r.id && <span className="share-join-error" role="alert">Couldn’t save that decision. Try again.</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
