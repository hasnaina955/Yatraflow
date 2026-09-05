// ============ Trip workspace — Decisions tab ============
// Mechanical extraction from src/pages/TripWorkspace.tsx (M3.4) — no behavior changes.
import React, { useState } from 'react'
import { Scale } from 'lucide-react'
import type { Trip } from '../../data/types'
import { useDb, userById, addDecision, voteOnDecision, resolveDecision, activityFor } from '../../store/store'
import { formatInr } from '../../lib/engine'
import { Avatar, Chip, EmptyState, Field, toast } from '../../components/ui'
import { timeAgo } from './shared'

// ================= Decisions tab =================

export function DecisionsTab({ trip, me, editable }: { trip: Trip; me: { id: string }; editable: boolean }) {
  const db = useDb()
  const decisions = db.decisions.filter(d => d.tripId === trip.id).sort((a, b) => b.createdAt - a.createdAt)
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState('')
  const [filter, setFilter] = useState<'all' | 'open' | 'mine' | 'resolved'>('all')

  // §6.8 hierarchy: open / needs-me / resolved counts + "next to unblock" focus
  const openDecisions = decisions.filter(d => d.status === 'open')
  const needsMe = openDecisions.filter(d => !d.votesByUserId[me.id])
  const resolvedCount = decisions.length - openDecisions.length
  const unblock = needsMe[0]
  const shown = filter === 'open' ? openDecisions
    : filter === 'mine' ? needsMe
    : filter === 'resolved' ? decisions.filter(d => d.status === 'resolved')
    : decisions

  function create(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) { toast('Write the question first.', 'err'); return }
    const list = opts.split('\n').map(o => o.trim()).filter(Boolean)
    if (list.length < 2) { toast('Give at least two options (one per line).', 'err'); return }
    addDecision(trip.id, {
      question: q.trim(),
      options: list.map(l => ({ id: `opt_${Math.random().toString(36).slice(2, 8)}`, label: l })),
    })
    setQ(''); setOpts('')
    toast('Decision posted for the group')
  }

  return (
    <div className="two-col">
      <div>
        <div className="dec-strip">
          <div className="stat-tile">
            <div className="stat-label">Open decisions</div>
            <div className="stat-value">{openDecisions.length}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Need your vote</div>
            <div className="stat-value">{needsMe.length}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Resolved</div>
            <div className="stat-value">{resolvedCount}</div>
          </div>
        </div>
        <div className="filter-pillbar" style={{ marginBottom: 14 }} role="group" aria-label="Filter decisions">
          {([['all', 'All'], ['open', 'Open'], ['mine', 'Needs me'], ['resolved', 'Resolved']] as const).map(([k, label]) => (
            <button key={k} type="button" className={`clickable-chip chip${filter === k ? ' on-teal' : ''}`}
              onClick={() => setFilter(k)} aria-pressed={filter === k}>{label}</button>
          ))}
        </div>
        {decisions.length === 0 && (
          <EmptyState icon={<Scale size={38} aria-hidden />} title="No decisions tracked"
            body='Raise questions like "houseboat menu — veg or mixed?" so nothing gets lost in a chaotic group chat.' />
        )}
        {decisions.length > 0 && shown.length === 0 && (
          <p className="muted small" style={{ margin: '4px 0 14px' }}>Nothing under this filter right now.</p>
        )}
        {shown.map(d => {
          const tally = d.options.map(o => Object.values(d.votesByUserId).filter(v => v === o.id).length)
          return (
            <div key={d.id} className={`card${d.id === unblock?.id ? ' decision-unblock' : ''}`} style={{ marginBottom: 14 }}>
              {d.id === unblock?.id && <div className="unblock-label">⚡ Next to unblock</div>}
              <div className="row-between">
                <h3>{d.question}</h3>
                <Chip tone={d.status === 'open' ? 'saffron' : 'ok'}>{d.status}</Chip>
              </div>
              {d.context && <p className="small muted" style={{ margin: '5px 0 10px' }}>{d.context}</p>}
              <div style={{ margin: '8px 0' }}>
                {d.options.map((o, i) => {
                  const votes = tally[i]
                  const mine = d.votesByUserId[me.id] === o.id
                  return (
                    <div key={o.id} className="decision-option-row">
                      <button className={`vote-btn ${mine ? 'on' : ''}`} disabled={d.status === 'resolved'}
                        onClick={() => voteOnDecision(d.id, o.id)} aria-label={`Vote for ${o.label}`}>▲</button>
                      <span style={{ flex: 1 }}>{o.label}{o.costImpactInr ? <span className="muted small"> · {o.costImpactInr > 0 ? '+' : ''}{formatInr(o.costImpactInr)}</span> : null}</span>
                      {votes > 0 && <span className="chip chip-info">{votes} vote{votes !== 1 ? 's' : ''}</span>}
                      {d.status === 'resolved' && d.resolvedOptionId === o.id && <Chip tone="ok">Chosen</Chip>}
                    </div>
                  )
                })}
              </div>
              {editable && d.status === 'open' && (
                <div className="resolve-btns">
                  {d.options.map(o => (
                    <button key={o.id} className="btn btn-outline btn-sm" onClick={() => { resolveDecision(d.id, o.id); toast('Decision resolved') }}>
                      Resolve: {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div className="card">
          <h3>Activity feed</h3>
          <hr className="divider" />
          {activityFor(trip.id).slice(0, 20).map(a => (
            <div key={a.id} className="feed-item">
              <Avatar user={userById(a.actorId)} />
              <span><b>{userById(a.actorId)?.profile.name}</b> {a.verb}{a.target ? ` · ${a.target}` : ''}</span>
              <span className="feed-time">{timeAgo(a.at)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <form className="card" onSubmit={create}>
          <h3>Raise a decision</h3>
          <p className="hint-text" style={{ margin: '6px 0 12px' }}>Turn endless group-chat debates into one clear vote.</p>
          <Field label="Question"><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Beach shack lunch or café?" /></Field>
          <Field label="Options (one per line)" hint="At least two"><textarea className="textarea" value={opts} onChange={e => setOpts(e.target.value)} placeholder={'Option A\nOption B'} /></Field>
          <button className="btn btn-primary" style={{ width: '100%' }}>Post decision</button>
        </form>
      </div>
    </div>
  )
}
