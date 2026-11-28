// The claim link is private and read-only until its recipient confirms.
import { useEffect, useRef, useState } from 'react'
import { Calendar, Lock, MapPin, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { currentUser, getSnapshot, resumeSync, useDb } from '../store/store'
import { appLink } from '../lib/appLink'
import { browseClaimAvatar, claimAccountReady } from '../lib/creatorClaimView'
import { claimError, readClaimPreview, readClaimTransfer, type ClaimPreview, type ClaimTransfer } from '../lib/creatorClaim'
import { PageHeader } from '../components/page/PageHeader'
import { StateBlock } from '../components/page/StateBlock'
import { Surface } from '../components/page/Surface'
import { Chip, ConfirmDialog } from '../components/ui'

function plural(n: number, one: string, many: string) { return `${n} ${n === 1 ? one : many}` }

type PreviewRead = { kind: 'loading' | 'failed' } | { kind: 'ready'; preview: ClaimPreview }
const terminalCopy = {
  invalid: 'We could not find this invitation.',
  claimed: 'Someone has already claimed this profile. If that was you, open My trips.',
  expired: 'This invitation has expired. Ask the YatraFlow team for a new link.',
  revoked: 'This invitation is no longer active.',
}

function ClaimBody({ token }: { token: string }) {
  const db = useDb()
  const me = currentUser(db)
  const [read, setRead] = useState<PreviewRead>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transfer, setTransfer] = useState<ClaimTransfer | null>(null)
  const [refreshed, setRefreshed] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/creator-claim', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview', token }),
          signal: controller.signal, cache: 'no-store', referrerPolicy: 'no-referrer',
        })
        const data: unknown = await response.json()
        const preview = readClaimPreview(data)
        if (!preview || (!response.ok && (response.status !== 404 || preview.status !== 'invalid'))) {
          throw new Error('Preview unavailable')
        }
        if (!controller.signal.aborted) setRead({ kind: 'ready', preview })
      } catch {
        if (!controller.signal.aborted) setRead({ kind: 'failed' })
      }
    }
    void load()
    return () => controller.abort()
  }, [token, retry])

  async function refreshAccount(result: ClaimTransfer) {
    setRefreshed(false)
    try {
      await resumeSync()
      const snapshot = getSnapshot()
      if (!claimAccountReady(snapshot, result)) return
      setRefreshed(true)
    } catch {
      // The transfer already succeeded. Keep its receipt and offer a read retry.
    }
  }

  async function redeem() {
    setConfirmOpen(false)
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      const session = data.session
      if (sessionError || !session || session.user.id !== me?.id) {
        setError('Your sign-in changed. Sign in to the account that will own these trips.')
        return
      }
      const response = await fetch('/api/creator-claim', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'redeem', token }), referrerPolicy: 'no-referrer',
      })
      const body: unknown = await response.json()
      if (!response.ok) {
        setError(claimError(body, 'We could not complete the claim. Check My trips before you try again.'))
        return
      }
      const result = readClaimTransfer(body)
      if (!result || result.claimerId !== session.user.id) {
        setError('We could not confirm the claim. Check My trips before you try again.')
        return
      }
      setTransfer(result)
      await refreshAccount(result)
    } catch {
      setError('We could not confirm the claim. Check My trips before you try again.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const claimPath = `/claim/${token}` as const
  const authPath = (mode: 'signup' | 'signin') => `/auth?mode=${mode}&next=${encodeURIComponent(claimPath)}` as const

  if (transfer) {
    // A receipt belongs to the account that sent the request, not the next
    // account to open the browser. Links only appear after a verified refresh.
    if (db.sessionUserId !== transfer.claimerId) {
      return <StateBlock kind="empty" title="Claim complete" titleLevel="h1" body="Sign in to the account that claimed these trips." actions={<a className="btn btn-primary" {...appLink(authPath('signin'))}>Sign in</a>} />
    }
    const ready = refreshed && claimAccountReady(db, transfer)
    return <StateBlock kind="kept" title="Your creator profile is ready" titleLevel="h1"
      icon={<CheckCircle2 aria-hidden="true" />}
      body={ready ? `${plural(transfer.movedTripIds.length, 'trip is', 'trips are')} in your account. You can edit them and publish when you want.` :
        busy ? 'The transfer is complete. We are loading your trips.' : 'The transfer is complete, but we could not load your account. Try again to load your trips.'}
      actions={ready ? <>
        <a className="btn btn-primary" {...appLink(`/trip/${transfer.movedTripIds[0]}/overview`)}>Open your trip</a>
        <a className="btn btn-outline" {...appLink('/creator-hub')}>Creator Hub</a>
      </> : <button type="button" className="btn btn-primary" disabled={busy}
        onClick={async () => { setBusy(true); await refreshAccount(transfer); setBusy(false) }}>Load my trips</button>} />
  }
  if (read.kind === 'loading') return <StateBlock kind="loading" titleLevel="h1" title="Loading your private invitation" />
  if (read.kind === 'failed') return <StateBlock kind="failed" titleLevel="h1" title="We could not load the invitation"
    body="Check your connection and try again." actions={<button className="btn btn-primary" onClick={() => {
      setRead({ kind: 'loading' }); setRetry(n => n + 1)
    }}>Try again</button>} />
  if (read.kind !== 'ready') return null
  const preview = read.preview
  if (preview.status !== 'unclaimed') return <StateBlock kind="empty" titleLevel="h1" title="Invitation unavailable"
    body={terminalCopy[preview.status]} actions={<a className="btn btn-outline" {...appLink('/trips')}>My trips</a>} />

  const avatar = browseClaimAvatar(preview.creator.avatar_url)
  return <>
    <PageHeader kicker="Private creator invitation" headline={{ lead: preview.creator.name }}
      lede="We prepared these trips for you. Review them here, then take ownership when you are ready."
      meta={<div className="claim-facts"><Chip tone="teal"><Lock size={14} aria-hidden="true" /> Only for people with this link</Chip>
        {preview.expires_at && Number.isFinite(Date.parse(preview.expires_at)) &&
          <span className="muted">Valid until {new Date(preview.expires_at).toLocaleDateString()}</span>}</div>} />
    <Surface className="claim-card claim-identity">
      {avatar ? <img className="avatar lg" src={avatar} alt="" width={44} height={44} referrerPolicy="no-referrer" /> : null}
      <div>
        <h2>{preview.creator.name}</h2>
        {preview.creator.home_city && <p className="muted">{preview.creator.home_city}</p>}
        {preview.creator.creator_bio && <p>{preview.creator.creator_bio}</p>}
      </div>
    </Surface>
    <section className="claim-stack" aria-label="Trips in your invitation">
      <h2>Trips prepared for you ({preview.trips.length})</h2>
      {preview.trips.map(trip => <Surface as="article" key={trip.id} className="claim-card claim-stack">
        <div className="row-between"><h3>{trip.name}</h3><Chip>Preview only</Chip></div>
        <div className="claim-facts muted">
          {trip.destinations.length > 0 && <span><MapPin size={16} aria-hidden="true" />{trip.destinations.join(' · ')}</span>}
          <span><Calendar size={16} aria-hidden="true" />{plural(trip.days.length, 'day', 'days')}</span>
        </div>
        <div className="claim-days">{trip.days.map((day, index) => <div className="claim-day" key={index}>
          <h4>Day {index + 1}{day.title ? `: ${day.title}` : ''}</h4>
          <ul>{day.stops.map((stop, stopIndex) => <li key={stopIndex}>{stop.arrivalTime ? `${stop.arrivalTime} · ` : ''}{stop.title}</li>)}</ul>
        </div>)}</div>
      </Surface>)}
    </section>
    <Surface as="section" className="claim-card claim-stack claim-take-ownership">
      <h2>Claim your creator profile</h2>
      <p>Claiming transfers these private trips to your account and turns on Creator Hub. You decide when to publish.</p>
      {error && <p className="err-text" role="alert">{error}</p>}
      {!db.ready ? <p role="status" className="muted">Checking your account…</p> :
        db.sessionUserId && (!me || db.sliceReads['self profile'] === 'failed') ? <>
          <p role="alert">We could not load your account. Try again before you claim the trips.</p>
          <button className="btn btn-outline" type="button" disabled={busy} onClick={async () => {
            setBusy(true)
            try { await resumeSync() } catch { /* The account read still needs a retry. */ }
            finally { setBusy(false) }
          }}>Try again</button>
        </> : me ? <>
        <p>Signed in as <strong>{me.email}</strong></p>
        <button type="button" className="btn btn-primary" disabled={busy || !preview.trips.length} onClick={() => setConfirmOpen(true)}>
          {busy ? 'Claiming…' : 'Claim and take ownership'}
        </button>
        <ConfirmDialog open={confirmOpen} title="Claim these trips?"
          body={`The trips move to ${me.email}. You cannot undo this.`} confirmLabel="Claim trips"
          onConfirm={() => void redeem()} onClose={() => setConfirmOpen(false)} />
      </> : <div className="claim-actions">
        <a className="btn btn-primary" {...appLink(authPath('signup'))}>Claim profile</a>
        <a className="btn btn-outline" {...appLink(authPath('signin'))}>Sign in</a>
      </div>}
    </Surface>
  </>
}

export function ClaimProfilePage({ token }: { token: string | null }) {
  return <div className="container yf-page page-enter claim-page">
    {token ? <ClaimBody token={token} /> : <StateBlock kind="empty" titleLevel="h1" title="Invitation unavailable" body="We could not find this invitation." />}
  </div>
}
