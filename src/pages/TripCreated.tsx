// ============ Trip created - the moment after ============
// Peak-end, taken seriously: the last thing the create flow says should be
// specific and true, not confetti. This screen promises only what the engine
// already knows (anticipation.ts), hands the planner the invites they collected,
// and gets out of the way.
//
// Everything shown is either the trip's own numbers, a fact from the weather
// fetch, or the engine's own warnings. Nothing is recomputed behind the user's
// back: the bill figures ride over from the create page verbatim.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useDb, currentUser, useTrips, tripById, ensureInviteCode, userById,
} from '../store/store'
import { collectWarnings } from '../lib/engine'
import { anticipate, type AnticipationItem } from '../lib/anticipation'
import { estimateLunchStop } from '../lib/routeIq'
import { fetchDailyWeather, forecastAvailable, isoAddDays } from '../lib/weather'
import { readHandoff, clearHandoff, billTotal } from '../lib/createHandoff'
import { shareBillImage } from '../lib/billCapture'
import { crewInviteMessage, whatsappInviteUrl, PLANNER_ROLE_LINE } from '../lib/crewInvite'
import { nativeCopyText, nativeShareText } from '../lib/native'
import { haptic, HAPTIC } from '../lib/haptics'
import { toast } from '../components/ui'

type InviteStatus = 'idle' | 'sent' | 'copied' | 'skipped'

/** The receipt capture inlines fonts and can stall on a cross-origin stylesheet
 *  (html-to-image retries such a fetch indefinitely - SecurityError on
 *  cssRules). A stuck button is worse than a plainer share, so the capture gets
 *  a deadline and the text fallback takes over. */
const SHARE_TIMEOUT_MS = 8000

export function TripCreatedPage({ tripId, onNavigate }: { tripId: string; onNavigate: (r: string) => void }) {
  const db = useDb()
  const trips = useTrips()
  const me = currentUser(db)
  const trip = useMemo(() => trips.find(t => t.id === tripId) ?? tripById(tripId) ?? null, [trips, tripId])
  const handoff = useMemo(() => readHandoff(tripId), [tripId])

  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<number, InviteStatus>>({})
  /** P7 - the receipt node the shared image is captured from. It is rendered
   *  off-screen: the artifact is the dark till-roll the product prints
   *  elsewhere, which is not what this page should look like. */
  const receiptRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)

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
    // the meal line's source: the trip's own coordinates and mode, measured the
    // same way routeIq does - the destination the clock lands on at lunchtime.
    const points = [
      ...(trip.startLocationCoords ? [{ name: trip.startLocation, lat: trip.startLocationCoords.lat, lng: trip.startLocationCoords.lng }] : []),
      ...(trip.destinations ?? []).map((d, i) => ({ name: d, lat: trip.destinationCoords?.[i]?.lat, lng: trip.destinationCoords?.[i]?.lng })),
    ]
    return anticipate({
      tripName: trip.name,
      days: trip.days.length,
      travellers: trip.travellers,
      roadKm: handoff?.bill?.roadKm ?? handoff?.roadKm ?? null,
      rangeKm: handoff?.rangeKm ?? null,
      fuelHalts: [],
      lunch: estimateLunchStop(points, trip.transportMode),
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

  /** P7 - share the rough take as the product's own receipt image. Every exit
   *  is accounted for: a dismissed sheet is not an error, and anything else
   *  falls back to the numbers as text rather than a dead button. */
  async function shareTake() {
    haptic(HAPTIC.select)
    setSharing(true)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        shareBillImage(receiptRef.current),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('capture timed out')), SHARE_TIMEOUT_MS)
        }),
      ])
      toast(result === 'shared' ? 'Rough take shared' : result === 'copied' ? 'Receipt image copied' : 'Receipt image downloaded')
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      // image share unavailable or too slow - the numbers as text still travel
      const copied = await nativeCopyText(takeText())
      toast(copied ? 'Copied the rough take as text instead' : 'Could not share - the numbers are on this page')
    } finally {
      if (timer) clearTimeout(timer)
      setSharing(false)
    }
  }

  /** The text fallback - the same facts, readable anywhere. */
  function takeText(): string {
    const b = handoff?.bill
    const total = billTotal(b ?? null, trip!.travellers)
    const lines = [`${trip!.name} - ${trip!.days.length} days`]
    if (trip!.destinations.length) lines.push(trip!.destinations.join(' \u00b7 '))
    if (b?.perHead != null) lines.push(`\u20b9${b.perHead.toLocaleString('en-IN')} per head${total != null ? ` \u00b7 \u20b9${total.toLocaleString('en-IN')} for the group` : ''}`)
    lines.push('Rough take from YatraFlow - every number shows its math.')
    return lines.join('\n')
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
          <h2 className="created-card-title">Watch for these - the engine already knows</h2>
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
          {joinUrl && (
            <p className="created-detail">They get: {crewInviteMessage({ tripName: trip.name, joinUrl, plannerName: handoff?.plannerName || me?.profile.name || '' })}</p>
          )}
        </section>
      )}

      {bill && bill.perHead != null && (
        <section className="created-card" aria-label="The rough bill">
          <h2 className="created-card-title">The rough take</h2>
          <p className="created-bill">
            <span className="created-bill-perhead">&#8377;{bill.perHead.toLocaleString('en-IN')}</span>
            <span className="created-bill-unit">per head</span>
            {billTotal(bill, trip.travellers) != null && (
              <span className="created-bill-total">&#8377;{billTotal(bill, trip.travellers)!.toLocaleString('en-IN')} for the group</span>
            )}
          </p>
          <div className="created-bill-rows">
            <div className="created-bill-row">
              <span>Road{bill.roadKm != null ? ` \u00b7 ${Math.round(bill.roadKm)} km` : ''}</span>
              <b>{bill.transportCost != null ? `\u20b9${bill.transportCost.toLocaleString('en-IN')}` : '-'}</b>
            </div>
            {bill.transportFormula && <p className="created-bill-formula">{bill.transportFormula}</p>}
            <div className="created-bill-row"><span>Stays</span><b>&#8377;{bill.stayCost.toLocaleString('en-IN')}</b></div>
            {bill.stayFormula && <p className="created-bill-formula">{bill.stayFormula}</p>}
            <div className="created-bill-row"><span>Food</span><b>&#8377;{bill.mealCost.toLocaleString('en-IN')}</b></div>
            {bill.mealFormula && <p className="created-bill-formula">{bill.mealFormula}</p>}
          </div>
          <p className="created-detail">Same rows the ticket printed - the workspace refines them as the route resolves. Excludes tolls, parking and entry fees.</p>
          <div className="created-bill-acts">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void shareTake()} disabled={sharing}>
              {sharing ? 'Preparing\u2026' : 'Share the rough take'}
            </button>
          </div>
        </section>
      )}

      {/* The artifact itself - off-screen, dark till-roll, captured on demand. */}
      {bill && (
        <div className="created-receipt-holder" aria-hidden="true">
          <div className="bench-receipt card" ref={receiptRef}>
            <span className="bench-barcode" />
            <span className="bench-stamp">Rough take</span>
            <div className="bench-receipt-head">
              <span className="bench-receipt-kicker">YatraFlow</span>
              <span className="bench-receipt-date">{trip.name}</span>
            </div>
            <div className="bench-meta-row"><span>{trip.days.length} days \u00b7 {trip.travellers} travellers</span></div>
            <div className="bench-total">
              <div className="bench-total-label">Per head</div>
              <div className="bench-total-main bench-total-perhead">
                <span>&#8377;{bill.perHead != null ? bill.perHead.toLocaleString('en-IN') : '-'}</span>
                <span className="bench-perhead-unit">/ head</span>
              </div>
              <span className="bench-total-sub">
                {billTotal(bill, trip.travellers) != null ? `\u20b9${billTotal(bill, trip.travellers)!.toLocaleString('en-IN')} total` : ''}
                {bill.roadKm != null ? ` \u00b7 ${Math.round(bill.roadKm)} km` : ''} \u00b7 {trip.days.length} days
              </span>
            </div>
            <div className="bench-receipt-lines">
              <div className="bench-line">
                <div className="bench-line-head"><span>Fuel</span><b>{bill.transportCost != null ? `\u20b9${bill.transportCost.toLocaleString('en-IN')}` : '-'}</b></div>
                <span className="bench-line-formula">{bill.transportFormula}</span>
              </div>
              <div className="bench-line">
                <div className="bench-line-head"><span>Stays</span><b>&#8377;{bill.stayCost.toLocaleString('en-IN')}</b></div>
                <span className="bench-line-formula">{bill.stayFormula}</span>
              </div>
              <div className="bench-line">
                <div className="bench-line-head"><span>Food</span><b>&#8377;{bill.mealCost.toLocaleString('en-IN')}</b></div>
                <span className="bench-line-formula">{bill.mealFormula}</span>
              </div>
            </div>
            <p className="bench-line-formula">every number shows its math \u00b7 YatraFlow</p>
          </div>
        </div>
      )}

      <div className="created-next">
        <button type="button" className="ns ns-primary" onClick={finish}>
          <span className="ns-ic" aria-hidden>→</span>
          <span className="ns-body"><b>Open the workspace</b><span>The map, slots and engine are already working on this plan.</span></span>
        </button>
        {crew.length > 0 && (
          <button type="button" className="ns" onClick={() => void copyAll()}>
            <span className="ns-ic" aria-hidden>✉</span>
            <span className="ns-body"><b>Bring the crew</b><span>Copy the invite, or send it from each row above.</span></span>
          </button>
        )}
        {conflicts.length > 0 && (
          <button type="button" className="ns" onClick={finish}>
            <span className="ns-ic" aria-hidden>⚑</span>
            <span className="ns-body"><b>Watch {conflicts[0].title.split(' ').slice(0, 4).join(' ')}</b><span>Open the plan on that day before it gets tight.</span></span>
          </button>
        )}
        <button type="button" className="ns ns-quiet" onClick={() => { clearHandoff(); onNavigate('/trips') }}>
          <span className="ns-body"><b>Back to my trips</b></span>
        </button>
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
