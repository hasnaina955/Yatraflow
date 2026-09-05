// ============ Trip workspace — Suggestions tab ============
// Mechanical extraction from src/pages/TripWorkspace.tsx (M3.4) — no behavior changes.
import React, { useState } from 'react'
import { Lightbulb } from 'lucide-react'
import type { Trip } from '../../data/types'
import { useDb, userById, currentUser, addSuggestion, voteSuggestion, addCommentToSuggestion, acceptSuggestionIntoTimeline, declineSuggestion } from '../../store/store'
import { minutesToHM } from '../../lib/engine'
import { Avatar, Chip, EmptyState, Field, toast } from '../../components/ui'
import { LocationInput } from '../../components/LocationInput'
import { timeAgo } from './shared'

// ================= Suggestions tab =================

export function SuggestionsTab({ trip, editable, me }: {
  trip: Trip
  editable: boolean
  me: NonNullable<ReturnType<typeof currentUser>>
}) {
  const db = useDb()
  const suggestions = db.suggestions.filter(s => s.tripId === trip.id).sort((a, b) => b.createdAt - a.createdAt)
  const memberCount = (trip.members ?? []).length
  const [form, setForm] = useState({ title: '', locationName: '', description: '', visitMinutes: 60, entryFee: 0, transportCost: 200 })
  const [sugCoords, setSugCoords] = useState<{ lat?: number; lng?: number }>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { toast('Give your suggestion a name.', 'err'); return }
    addSuggestionLocal()
  }

  function addSuggestionLocal() {
    addSuggestion(trip.id, {
      dayIndex: 0, proposedBy: me.id, title: form.title.trim(),
      category: 'sightseeing', locationName: form.locationName || 'To be decided',
      lat: sugCoords.lat ?? 10.0889, lng: sugCoords.lng ?? 77.0595, description: form.description,
      visitMinutes: form.visitMinutes, estimatedEntryFeeInr: form.entryFee,
      estimatedTransportInr: form.transportCost,
    })
    setForm(f => ({ ...f, title: '', description: '' }))
    toast('Suggestion shared with the group!')
  }

  return (
    <div className="two-col">
      <div>
        {suggestions.length === 0 && (
          <EmptyState icon={<Lightbulb size={38} aria-hidden />} title="No suggestions yet" body="Group members can propose stops; everyone votes and comments." />
        )}
        {suggestions.map(sg => {
          const ups = sg.votes.filter(v => v.value === 1).length
          const downs = sg.votes.length - ups
          const myVote = sg.votes.find(v => v.userId === me.id)?.value
          const consensusPct = memberCount ? Math.round((ups / memberCount) * 100) : 0
          const author = userById(sg.proposedBy)
          return (
            <div key={sg.id} className="card" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, marginBottom: 14 }}>
              <div className="vote-col">
                <button className={`vote-btn ${myVote === 1 ? 'on' : ''}`} onClick={() => voteSuggestion(trip.id, sg.id, me.id, 1)} aria-label="Upvote">▲</button>
                <span className="vote-count">{ups - downs}</span>
                <button className={`vote-btn ${myVote === -1 ? 'on' : ''}`} onClick={() => voteSuggestion(trip.id, sg.id, me.id, -1)} aria-label="Downvote">▼</button>
              </div>
              <div>
                <div className="row-between">
                  <h3>{sg.title}</h3>
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    {sg.status === 'open' && consensusPct >= 60 && <Chip tone="teal">Best fit</Chip>}
                    <Chip tone={sg.status === 'accepted' ? 'ok' : sg.status === 'declined' ? 'danger' : 'teal'}>{sg.status}</Chip>
                  </span>
                </div>
                <div className="creator-line" style={{ margin: '5px 0' }}>
                  <Avatar user={author} /> {author?.profile.name ?? 'Traveller'} suggested for Day {sg.dayIndex + 1}
                </div>
                {sg.description && <p className="small muted">{sg.description}</p>}
                <div className="stop-meta" style={{ marginTop: 7 }}>
                  <span>📍 {sg.locationName}</span>
                  <span>⏱ {minutesToHM(sg.visitMinutes)}</span>
                  <span>🎫 ₹{sg.estimatedEntryFeeInr}/person</span>
                  <span>🚗 ₹{sg.estimatedTransportInr} transport</span>
                </div>
                <div style={{ marginTop: 9 }}>
                  <div className="small muted" style={{ marginBottom: 3 }}>Consensus: {consensusPct}% of members upvoted</div>
                  <div className="consensus-bar">
                    <div style={{ width: `${consensusPct}%`, background: consensusPct >= 60 ? 'var(--ok)' : consensusPct >= 35 ? 'var(--saffron)' : 'var(--line)' }} />
                  </div>
                </div>

                {editable && sg.status === 'open' && (
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { acceptSuggestionIntoTimeline(trip.id, sg.id); toast('Added to timeline') }}>Add to timeline</button>
                    <button className="btn btn-danger btn-sm" onClick={() => { declineSuggestion(trip.id, sg.id); toast('Suggestion declined') }}>Decline</button>
                  </div>
                )}

                {sg.comments.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {sg.comments.map(c => (
                      <div key={c.id} className="comment">
                        <Avatar user={userById(c.authorId)} />
                        <div className="comment-body">
                          <span className="comment-author">{userById(c.authorId)?.profile.name}</span>
                          <span className="comment-time">{timeAgo(c.createdAt)}</span>
                          <div>{c.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <CommentForm onSubmit={(text) => addCommentToSuggestion(trip.id, sg.id, me.id, text)} />
              </div>
            </div>
          )
        })}
      </div>

      <div>
        <form className="card" onSubmit={submit}>
          <h2>Propose a stop</h2>
          <p className="hint-text" style={{ margin: '6px 0 12px' }}>Others can vote and comment; editors can accept it into the timeline.</p>
          <Field label="Idea"><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Pothamedu viewpoint" /></Field>
          <Field label="Area"><LocationInput value={form.locationName} onChange={v => setForm(f => ({ ...f, locationName: v }))} onPick={p => setSugCoords({ lat: p.latitude, lng: p.longitude })} placeholder="Search, e.g. Munnar" /></Field>
          <div className="form-row">
            <Field label="Visit minutes"><input type="number" className="input" min={15} step={5} value={form.visitMinutes} onChange={e => setForm(f => ({ ...f, visitMinutes: Number(e.target.value) }))} /></Field>
            <Field label="Entry fee ₹/person"><input type="number" className="input" min={0} value={form.entryFee} onChange={e => setForm(f => ({ ...f, entryFee: Number(e.target.value) }))} /></Field>
          </div>
          <Field label="Why it’s worth it"><textarea className="textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></Field>
          <button className="btn btn-primary" style={{ width: '100%' }}>Share suggestion</button>
        </form>
      </div>
    </div>
  )
}

function CommentForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <form style={{ display: 'flex', gap: 7, marginTop: 10 }} onSubmit={e => { e.preventDefault(); if (text.trim()) { onSubmit(text.trim()); setText('') } }}>
      <input className="input" placeholder="Add a comment…" aria-label="Add a comment" value={text} onChange={e => setText(e.target.value)} />
      <button className="btn btn-sm btn-outline">Post</button>
    </form>
  )
}
