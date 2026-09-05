// ============ Trip workspace — Share tab ============
// Mechanical extraction from src/pages/TripWorkspace.tsx (M3.4) — no behavior changes.
// Includes SnapshotCard — ShareTab is its only consumer.
import React, { useRef, useState } from 'react'
import { Download, Link2, Upload } from 'lucide-react'
import type { Trip } from '../../data/types'
import { useDb, userById, setMemberRole, removeMember, restoreMember, publishItinerary, unpublishItinerary, duplicateTrip } from '../../store/store'
import { encodeTripSnapshot, snapshotUrl, downloadTripJson } from '../../lib/snapshot'
import { Avatar, Chip, ConfirmDialog, CopyButton, toast, undoToast } from '../../components/ui'
import { TripSettingsForm } from './TripSettingsForm'
import { timeAgo } from './shared'

// ================= Snapshot (export / import / URL share) =================

function SnapshotCard({ trip, me, onNavigate }: {
  trip: Trip
  me: { id: string }
  onNavigate: (r: string) => void
}) {
  const [link, setLink] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function makeLink() {
    const payload = await encodeTripSnapshot(trip)
    const url = snapshotUrl(trip, payload)
    setLink(url)
    navigator.clipboard?.writeText(url).catch(() => {})
    toast('Snapshot link copied — anyone can open it, no account needed')
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const imported = JSON.parse(await file.text()) as Trip
      if (!imported || !Array.isArray(imported.days)) throw new Error('bad shape')
      duplicateTrip(imported, me!.id)
      toast(`Imported “${imported.name}” into your trips`)
      onNavigate('/trips')
    } catch {
      toast('That file is not a valid YatraFlow trip export', 'err')
    }
    e.target.value = ''
  }

  return (
    <div className="card">
      <span className="share-intent share-intent--info">3 · Keep a record</span>
      <h3>Export & snapshot sharing</h3>
      <p className="hint-text" style={{ margin: '6px 0 12px' }}>
        Take the whole plan anywhere — no server stores it. Snapshot links embed the trip in the URL itself.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => downloadTripJson(trip)}><Download size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />Download JSON</button>
                  <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />Import JSON</button>
                  <button className="btn btn-teal btn-sm" onClick={makeLink}><Link2 size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />Create snapshot link</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
      </div>
      {link && (
        <div className="share-link-box" style={{ marginTop: 10 }}>
          <code style={{ wordBreak: 'break-all' }}>{link}</code>
          <CopyButton text={link} label="Copy" />
        </div>
      )}
    </div>
  )
}

// ================= Share tab =================

export function ShareTab({ trip, me, editable, onNavigate }: {
  trip: Trip
  me: { id: string; email: string }
  editable: boolean
  onNavigate: (route: string) => void
}) {
  const db = useDb()
  const inviteLink = `${location.origin}${location.pathname}#/invite/${trip.id}`
  const pub = db.published.find(p => p.tripId === trip.id)
  const pubLink = pub ? `${location.origin}${location.pathname}#/pub/${pub.id}` : ''
  const isOwner = (trip.members ?? []).some(m => m.userId === me.id && m.role === 'owner')
  const [pendingRemove, setPendingRemove] = useState<NonNullable<Trip['members']>[number] | null>(null)

  function confirmRemoveMember() {
    if (!pendingRemove) return
    removeMember(trip.id, pendingRemove.userId)
    undoToast(`${userById(pendingRemove.userId)?.profile.name ?? 'Member'} removed`, () => {
      restoreMember(trip.id, pendingRemove)
      toast('Member restored')
    })
  }

  return (
    <div className="two-col">
      <div>
        <div className="card">
          <span className="share-intent share-intent--teal">1 · Plan together</span>
          <h3>Invite collaborators</h3>
          <p className="hint-text" style={{ margin: '6px 0 12px' }}>Anyone with this link joins as an editor after logging in.</p>
          <div className="share-link-box"><code>{inviteLink}</code><CopyButton text={inviteLink} /></div>
          <hr className="divider" />
          <h3>Members & roles</h3>
          <div style={{ marginTop: 10 }}>
            {(trip.members ?? []).map(m => {
              const u = userById(m.userId)
              return (
                <div key={m.userId} className="feed-item" style={{ alignItems: 'center' }}>
                  <Avatar user={u} size="lg" />
                  <div style={{ flex: 1 }}>
                    <b>{u?.profile.name ?? 'Traveller'}</b> <span className="muted small">{u?.email}</span>
                    <div className="small muted">Joined {timeAgo(m.joinedAt)}</div>
                  </div>
                  {isOwner && m.role !== 'owner' ? (
                    <select className="role-select" value={m.role} onChange={e => setMemberRole(trip.id, m.userId, e.target.value as never)}
                      aria-label={`Role for ${u?.profile.name}`}>
                      {['editor', 'commenter', 'viewer'].map(r => <option key={r}>{r}</option>)}
                    </select>
                  ) : (
                    <Chip tone={m.role === 'owner' ? 'teal' : 'info'}>{m.role}</Chip>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <span className="share-intent share-intent--saffron">2 · Share publicly</span>
          <h3>Publish as public itinerary</h3>
          <p className="hint-text" style={{ margin: '6px 0 12px' }}>
            List this trip on Explore so anyone can discover and fork it. Day 1 is the free preview; later days sit behind a premium placeholder (no real payments in this MVP).
          </p>
          {!pub ? (
            <button className="btn btn-saffron" disabled={!isOwner}
              onClick={() => {
                publishItinerary({
                  tripId: trip.id, creatorId: me.id, title: trip.name,
                  coverImageUrl: trip.coverImageUrl,
                  tagline: `${trip.days.length}-day ${trip.travelStyle} trip through ${trip.destinations.join(', ')}.`,
                  routeSummary: [trip.startLocation, ...trip.destinations],
                  durationDays: trip.days.length,
                  estimatedBudgetPerPersonInr: trip.budgetPerPersonInr,
                  travelStyle: trip.travelStyle,
                  travelTips: ['Start ghat-section drives early.', 'Carry cash in hill towns.'],
                  warningsAndAssumptions: ['All costs are estimates based on typical prices — verify locally before booking.'],
                  freeDayIndexes: [0], premiumPriceInr: 199,
                  subscriberCta: 'Full checklist + stay contacts.',
                })
                toast('Published to Explore 🎉')
              }}>Publish to Explore</button>
          ) : (
            <div>
              <div className="row-between">
                <span className="small muted">Live on Explore · {pub.views} views · {pub.copies} forks</span>
                <button className="btn btn-outline btn-sm" onClick={() => onNavigate(`/pub/${pub.id}`)}>View public page</button>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-outline btn-sm"
                  onClick={() => {
                    publishItinerary({
                      tripId: trip.id, creatorId: me.id, title: trip.name,
                      coverImageUrl: trip.coverImageUrl,
                      tagline: `${trip.days.length}-day ${trip.travelStyle} trip through ${trip.destinations.join(', ')}.`,
                      routeSummary: [trip.startLocation, ...trip.destinations],
                      durationDays: trip.days.length,
                      estimatedBudgetPerPersonInr: trip.budgetPerPersonInr,
                      travelStyle: trip.travelStyle,
                      travelTips: ['Start ghat-section drives early.', 'Carry cash in hill towns.'],
                      warningsAndAssumptions: ['All costs are estimates based on typical prices — verify locally before booking.'],
                      freeDayIndexes: [0], premiumPriceInr: 199,
                      subscriberCta: 'Full checklist + stay contacts.',
                    })
                    toast('Publication updated ✨')
                  }}>Update</button>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { unpublishItinerary(trip.id); toast('Unpublished — removed from Explore') }}>Unpublish</button>
              </div>
            </div>
          )}
          {!isOwner && <p className="hint-text" style={{ marginTop: 8 }}>Only the trip owner can publish.</p>}
          {pubLink && <div className="share-link-box" style={{ marginTop: 10 }}><code>{pubLink}</code><CopyButton text={pubLink} label="Copy" /></div>}
        </div>

        <SnapshotCard trip={trip} me={me} onNavigate={onNavigate} />
      </div>

      <div>
        <div className="card">
          <h3>Trip settings</h3>
          <hr className="divider" />
          <TripSettingsForm trip={trip} editable={editable} />
        </div>
        {isOwner && (trip.members ?? []).length > 1 && (
          <div className="card">
            <h3>Danger zone</h3>
            <p className="hint-text" style={{ margin: '6px 0' }}>Removing someone revokes their access immediately.</p>
            {(trip.members ?? []).filter(m => m.role !== 'owner').map(m => (
              <div key={m.userId} className="row-between" style={{ padding: '5px 0' }}>
                <span className="small">{userById(m.userId)?.profile.name}</span>
                <button className="btn btn-danger btn-sm" onClick={() => setPendingRemove(m)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingRemove}
        title={`Remove ${userById(pendingRemove?.userId)?.profile.name ?? 'this member'}?`}
        body="They lose access to this trip immediately. You can undo this from the toast for a few seconds."
        confirmLabel="Remove member"
        danger
        onConfirm={confirmRemoveMember}
        onClose={() => setPendingRemove(null)}
      />
    </div>
  )
}
