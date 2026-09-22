// ============ Trip created - the moment after ============
// Peak-end, taken seriously: the last thing the create flow says should be
// specific and true, not confetti. This screen promises only what the engine
// already knows (anticipation.ts), hands the planner the invites they collected,
// and gets out of the way.
//
// Everything shown is either the trip's own numbers, a fact from the weather
// fetch, or the engine's own warnings. Nothing is recomputed behind the user's
// back: the bill figures ride over from the create page verbatim.

import { useEffect, useMemo, useState } from 'react'
import {
  useDb, currentUser, useTrips, tripById, ensureInviteCode, userById,
} from '../store/store'
import { collectWarnings } from '../lib/engine'
import { anticipate, type AnticipationItem } from '../lib/anticipation'
import { fetchDailyWeather, forecastAvailable, isoAddDays } from '../lib/weather'
import { readHandoff, clearHandoff } from '../lib/createHandoff'
import { crewInviteMessage, whatsappInviteUrl, PLANNER_ROLE_LINE } from '../lib/crewInvite'
import { nativeCopyText, nativeShareText } from '../lib/native'
import { haptic, HAPTIC } from '../lib/haptics'
import { toast } from '../components/ui'

type InviteStatus = 'idle' | 'sent' | 'copied' | 'skipped'

export function TripCreatedPage({ tripId, onNavigate }: { tripId: string; onNavigate: (r: string) => void }) {
  const db = useDb()
  const trips = useTrips()
  const me = currentUser(db)
  const trip = useMemo(() => trips.find(t => t.id === tripId) ?? tripById(tripId) ?? null, [trips, tripId])
  const handoff = useMemo(() => readHandoff(tripId), [tripId])

  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<number, InviteStatus>>({})

  // the join link: the same short code the Share tab mints, lazily
  useEffect(() => {
    if (!trip) return
    let alive = true
    void ensureInviteCode(trip.id).then(code => { if (alive && code) setInviteCode(code) })
    return () => { alive = false }
  }, [trip?.id])

  const joinUrl = inviteCode
    ? `${typeof location !== 'undefined' ? location.origin : ''}/#/join/${inviteCode}`
    : ''

  // conflicts: the engine's own collector, read once for this trip
  const conflicts = useMemo(() => {
    if (!trip) return [] as { title: string; detail: string }[]
    try {
      return collectWarnings(trip)
        .filter(w => w.severity === 'high' || w.severity === 'medium')
        .slice(0, 2)
        .map(w => ({ title: w.title, detail: w.detail }))
    } catch {
      return []
    }
  }, [trip])

  // weather: only inside the honest forecast window
  const [rainyDays, setRainyDays] = useState<number[]>([])
  useEffect(() => {
    if (!trip) return
    if (!forecastAvailable(trip.startDate)) return
    const anchor = trip.startLocationCoords
    if (!anchor) return
    let alive = true
    fetchDailyWeather(anchor.lat, anchor.lng, trip.startDate, trip.days.length || 1)
      .then(w => {
        if (!alive) return
        const wet: number[] = []
        trip.days.forEach((_, i) => {
          const day = w[isoAddDays(trip.startDate, i)]
          if (day && day.rainChancePct >= 60) wet.push(i)
        })
        setRainyDays(wet)
      })
      .catch(() => { /* a forecast we could not get says nothing */ })
    return () => { alive = false }
  }, [trip?.id])

  const items: AnticipationItem[] = useMemo(() => {
    if (!trip) return []
    return anticipate({
      tripName: trip.name,
      days: trip.days.length,
      travellers: trip.travellers,
      roadKm: handoff?.bill?.roadKm ?? handoff?.roadKm ?? null,
      rangeKm: handoff?.rangeKm ?? null,
      fuelHalts: [],
      lunch: null,
      rainyDays,
      conflicts,
    })
  }, [trip?.id, handoff, rainyDays, conflicts])

  if (!trip) {
    return (
      <div className="container created-page">
        <p className="muted">That trip is not loaded on this device.</p>
        <button className="btn btn-primary" onClick={() => onNavigate('/trips')}>Go to my trips</button>
      </div>
    )
  }

  const crew = handoff?.crew ?? []
  const bill = handoff?.bill ?? null

  function inviteText(): string {
    return crewInviteMessage({
      tripName: trip!.name,
      joinUrl: joinUrl || (typeof location !== 'undefined' ? location.origin : ''),
      plannerName: handoff?.plannerName || me?.profile.name || '',
    })
  }

  async function sendInvite(index: number) {
    const member = crew[index]
    if (!member?.phone) return
    haptic(HAPTIC.select)
    setStatuses(s => ({ ...s, [index]: 'sent' }))
    const text = inviteText()
    try {
      // the native sheet first, then the WhatsApp deep link (which is what an
      // Indian crew actually uses), then the share sheet as a last resort
      const opened = openWhatsApp(member.phone, text)
      if (!opened) {
        const res = await nativeShareText({ text, title: trip!.name })
        if (res === 'unavailable') toast('Could not open a share sheet - the link is on this page to copy.', 'err')
      }
    } catch {
      toast('Could not open WhatsApp - the invite link is below to copy.', 'err')
    }
  }

  async function copyAll() {
    haptic(HAPTIC.tick)
    const text = inviteText()
    const res = await nativeCopyText(text)
    setStatuses(s => {
      const next = { ...s }
      crew.forEach((_, i) => { next[i] = 'copied' })
      return next
    })
    toast(res ? 'Invite copied - paste it wherever the crew talks' : 'Copy it from the link on this page')
  }

  function finish() {
    haptic(HAPTIC.success)
    clearHandoff()
    onNavigate(`/trip/${trip!.id}`)
  }

  return (
    <div className="container created-page">
      <header className="created-head">
        <p className="eyebrow">Trip created</p>
        <h1>{trip.name} is live.</h1>
        <p className="muted small">Now the engine starts working for you.</p>
      </header>

      {items.length > 0 && (
        <section className="created-card" aria-label="What the engine already knows">
          <h2 className="created-card-title">Watch for these</h2>
          <ul className="created-list">
            {items.map(item => (
              <li key={item.key} className={`created-item kind-${item.kind}`}>
                <span className="created-badge" aria-hidden>{badgeFor(item.kind)}</span>
                <span className="created-item-body">
                  <b>{item.headline}</b>
                  <span className="created-detail">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {crew.length > 0 && (
        <section className="created-card" aria-label="Bring the crew">
          <h2 className="created-card-title">The crew <span className="created-role">{PLANNER_ROLE_LINE}</span></h2>
          <div className="created-crew">
            {crew.map((m, i) => (
              <div className="created-crew-row" key={`${m.phone ?? m.name}-${i}`}>
                <span className="created-crew-name">{m.name || `+91 ${m.phone}`}</span>
                <span className="created-crew-status">{statusLabel(statuses[i], m.phone)}</span>
                {m.phone
                  ? <button type="button" className="btn btn-outline btn-sm" onClick={() => void sendInvite(i)}>Send invite</button>
                  : <span className="created-crew-hint">no number - share the link instead</span>}
              </div>
            ))}
          </div>
          <div className="created-crew-acts">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void copyAll()}>Copy the invite</button>
            {joinUrl && <code className="created-link" title={joinUrl}>{joinUrl}</code>}
          </div>
        </section>
      )}

      {bill && bill.perHead != null && (
        <section className="created-card" aria-label="The rough bill">
          <h2 className="created-card-title">The rough take</h2>
          <p className="created-bill">
            <span className="created-bill-perhead">&#8377;{bill.perHead.toLocaleString('en-IN')}</span>
            <span className="created-bill-unit">per head</span>
            {bill.total != null && <span className="created-bill-total">&#8377;{bill.total.toLocaleString('en-IN')} for the group</span>}
          </p>
          <p className="created-detail">Same numbers the ticket printed - the workspace refines them as the route resolves. Excludes tolls, parking and entry fees.</p>
        </section>
      )}

      <div className="created-next">
        <button type="button" className="btn btn-primary" onClick={finish}>Open my workspace</button>
        {crew.length > 0 && (
          <button type="button" className="btn btn-outline" onClick={() => void copyAll()}>Bring the crew</button>
        )}
        <button type="button" className="btn btn-outline" onClick={() => { clearHandoff(); onNavigate('/trips') }}>Back to my trips</button>
      </div>
    </div>
  )
}

/** Open WhatsApp for a number; returns false when the browser blocked it. */
function openWhatsApp(phone: string, text: string): boolean {
  try {
    const win = window.open(whatsappInviteUrl(phone, text), '_blank', 'noopener')
    return !!win
  } catch {
    return false
  }
}

function badgeFor(kind: AnticipationItem['kind']): string {
  switch (kind) {
    case 'conflict': return '\u26A0'
    case 'weather': return '\u2602'
    case 'meal': return '\u25CF'
    case 'fuel': return '\u26FD'
    default: return '\u25B8'
  }
}

function statusLabel(status: InviteStatus | undefined, phone: string | null): string {
  if (status === 'sent') return 'invite opened'
  if (status === 'copied') return 'copied'
  if (!phone) return ''
  return 'ready'
}
