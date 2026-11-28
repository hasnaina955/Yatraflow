// Masteradmin tab for a private invitation. The API also checks admin rights.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { parseTripImport, type ParsedTripImport } from '../../lib/tripImport'
import { supabase } from '../../lib/supabase'
import { creatorClaimToken } from '../../lib/routes'
import { nativeCopyText } from '../../lib/native'
import { claimError, record } from '../../lib/creatorClaim'
import { Surface } from '../page/Surface'
import { StateBlock } from '../page/StateBlock'
import { Chip, ConfirmDialog, Field } from '../ui'

const API = '/api/admin-creator-claims'

interface ImportedFile { name: string; parsed: ParsedTripImport }
interface ClaimRow {
  id: string
  target_name: string
  status: 'unclaimed' | 'claimed' | 'revoked' | 'expired'
  expires_at: string
}

function isClaimRow(value: unknown): value is ClaimRow {
  return record(value) && typeof value.id === 'string' && typeof value.target_name === 'string' &&
    (value.status === 'unclaimed' || value.status === 'claimed' || value.status === 'revoked' || value.status === 'expired') &&
    typeof value.expires_at === 'string'
}

async function authorizedHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Sign in to your admin account.')
  return { authorization: `Bearer ${data.session.access_token}` }
}

function claimLink(value: unknown): string | null {
  if (!record(value) || typeof value.claimUrl !== 'string') return null
  try {
    const url = new URL(value.claimUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !creatorClaimToken(url.pathname)) return null
    return url.href
  } catch { return null }
}

function importWarnings(parsed: ParsedTripImport): string[] {
  const { report } = parsed
  return [
    ...report.repairs,
    ...report.warnings,
    ...report.droppedStops.map(stop => `Day ${stop.day}: ${stop.title}: ${stop.reason}`),
    ...(parsed.publication || parsed.publicationRefused ? ['The publication will not be imported. The creator can publish after claiming the trip.'] : []),
  ]
}

function rowStatus(row: ClaimRow): ClaimRow['status'] {
  if (row.status === 'unclaimed' && Date.parse(row.expires_at) <= Date.now()) return 'expired'
  return row.status
}

export function AdminCreatorHandoffPanel() {
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [homeCity, setHomeCity] = useState('')
  const [creatorBio, setCreatorBio] = useState('')
  const [instagramUrl, setInstagramUrl] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [outreachNote, setOutreachNote] = useState('')
  const [files, setFiles] = useState<ImportedFile[]>([])
  const [parsing, setParsing] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [list, setList] = useState<{ kind: 'loading' | 'failed' } | { kind: 'ready'; rows: ClaimRow[] }>({ kind: 'loading' })
  const [listRetry, setListRetry] = useState(0)
  const [revoke, setRevoke] = useState<ClaimRow | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const warnings = files.some(file => importWarnings(file.parsed).length > 0)
  const dropped = files.some(file => file.parsed.report.droppedStops.length > 0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const headers = await authorizedHeaders()
        const response = await fetch(API, { headers, signal: controller.signal, cache: 'no-store' })
        const body: unknown = await response.json()
        if (!response.ok || !Array.isArray(body) || !body.every(isClaimRow)) throw new Error('List unavailable')
        if (!controller.signal.aborted) setList({ kind: 'ready', rows: body })
      } catch {
        if (!controller.signal.aborted) setList({ kind: 'failed' })
      }
    }
    void load()
    return () => controller.abort()
  }, [listRetry])

  function refreshList() {
    setList({ kind: 'loading' })
    setListRetry(n => n + 1)
  }

  async function handleFiles(selection: FileList | null) {
    if (!selection?.length) return
    setError(null)
    setParsing(true)
    setReviewed(false)
    const chosen = Array.from(selection)
    try {
      const next = await Promise.all(chosen.map(async file => ({ name: file.name, parsed: parseTripImport(await file.text()) })))
      setFiles(prev => [...prev, ...next])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not read the trip files.')
    } finally {
      setParsing(false)
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current || generatedUrl || parsing || !files.length || dropped || (warnings && !reviewed)) return
    inFlight.current = true
    setError(null)
    setCopied(false)
    setBusy(true)
    try {
      const headers = await authorizedHeaders()
      const socialLinks = {
        ...(instagramUrl.trim() ? { instagram: instagramUrl.trim() } : {}),
        ...(youtubeUrl.trim() ? { youtube: youtubeUrl.trim() } : {}),
      }
      const response = await fetch(API, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), avatarUrl: avatarUrl.trim() || null, homeCity: homeCity.trim() || null,
          creatorBio: creatorBio.trim() || null, outreachNote: outreachNote.trim() || null,
          socialLinks: Object.keys(socialLinks).length ? socialLinks : null,
          trips: files.map(file => file.parsed.trip),
        }),
      })
      const body: unknown = await response.json()
      if (!response.ok) throw new Error(claimError(body, 'We could not create the invitation.'))
      const url = claimLink(body)
      if (!url) throw new Error('We could not confirm the invitation. Check the list before you try again.')
      setGeneratedUrl(url)
      refreshList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not confirm the invitation. Check the list before you try again.')
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  async function revokeClaim(id: string) {
    setRevoking(true)
    setListError(null)
    try {
      const headers = await authorizedHeaders()
      const response = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers })
      const body: unknown = await response.json()
      if (!response.ok || !record(body) || body.revoked !== true) throw new Error(claimError(body, 'We could not revoke the invitation.'))
      refreshList()
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'We could not revoke the invitation.')
    } finally {
      setRevoking(false)
    }
  }

  return <div className="claim-stack">
    <Surface className="adm-section claim-stack">
      <h2 className="adm-card-title">Create a creator invitation</h2>
      <p className="muted">Add trip files and profile details. The trips stay private until the creator claims them. The invitation expires after 30 days.</p>
      <form className="claim-stack" onSubmit={handleCreate}>
        <div className="claim-form-grid">
          <Field label="Creator name"><input className="input" required disabled={busy} value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Home city (optional)"><input className="input" disabled={busy} value={homeCity} onChange={e => setHomeCity(e.target.value)} /></Field>
          <Field label="Avatar URL (optional)"><input className="input" type="url" disabled={busy} value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} /></Field>
          <Field label="Instagram URL (optional)"><input className="input" type="url" disabled={busy} value={instagramUrl} onChange={e => setInstagramUrl(e.target.value)} /></Field>
          <Field label="YouTube URL (optional)"><input className="input" type="url" disabled={busy} value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} /></Field>
        </div>
        <Field label="Creator bio (optional)"><textarea className="textarea" rows={3} disabled={busy} value={creatorBio} onChange={e => setCreatorBio(e.target.value)} /></Field>
        <Field label="Private admin note (optional)"><input className="input" disabled={busy} value={outreachNote} onChange={e => setOutreachNote(e.target.value)} /></Field>
        <Field label="Trip files (JSON)"><input className="input" type="file" accept=".json,application/json" multiple disabled={parsing || busy}
          onChange={e => { void handleFiles(e.target.files); e.target.value = '' }} /></Field>
        {parsing && <p role="status">Reading trip files…</p>}
        {files.map((file, index) => <Surface className="claim-card claim-stack" key={index}>
          <div className="row-between"><strong>{file.name}</strong><button type="button" className="btn btn-outline btn-sm" disabled={busy || parsing}
            onClick={() => { setFiles(prev => prev.filter((_, i) => i !== index)); setReviewed(false) }}>Remove</button></div>
          <p>{file.parsed.trip.name} · {file.parsed.summary}</p>
          {importWarnings(file.parsed).length > 0 && <ul>{importWarnings(file.parsed).map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
        </Surface>)}
        {dropped && <p className="err-text" role="alert">Some stops have no usable location. Correct the files and add them again before you create the invitation.</p>}
        {warnings && !dropped && <label className="claim-review"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /> I reviewed the import changes.</label>}
        {error && <p className="err-text" role="alert">{error}</p>}
        <div><button className="btn btn-primary" type="submit" disabled={busy || parsing || Boolean(generatedUrl) || !name.trim() || !files.length || dropped || (warnings && !reviewed)}>
          {busy ? 'Creating invitation…' : 'Generate claim link'}
        </button></div>
      </form>
      {generatedUrl && <Surface className="claim-card claim-stack">
        <strong>Copy this private link now. It will not appear again.</strong>
        <Field label="Claim link"><input className="input" value={generatedUrl} readOnly /></Field>
        <div className="claim-actions">
          <button type="button" className="btn btn-primary" onClick={async () => {
            const ok = await nativeCopyText(generatedUrl)
            setCopied(ok)
            if (!ok) setError('Copy the link from the field above.')
          }}>Copy link</button>
          <button type="button" className="btn btn-outline" onClick={() => {
            setGeneratedUrl(null); setCopied(false); setError(null)
            setName(''); setHomeCity(''); setAvatarUrl(''); setCreatorBio(''); setInstagramUrl(''); setYoutubeUrl(''); setOutreachNote(''); setFiles([]); setReviewed(false)
          }}>Done</button>
        </div>
        {copied && <span role="status">Link copied.</span>}
      </Surface>}
    </Surface>
    <Surface className="adm-section claim-stack">
      <div className="row-between"><h2 className="adm-card-title">Recent creator invitations</h2><button type="button" className="btn btn-outline btn-sm" disabled={list.kind === 'loading'} onClick={refreshList}>Refresh</button></div>
      {listError && <p className="err-text" role="alert">{listError}</p>}
      {list.kind === 'loading' && <StateBlock kind="loading" size="compact" title="Loading invitations" />}
      {list.kind === 'failed' && <StateBlock kind="failed" size="compact" title="We could not load invitations" actions={<button className="btn btn-outline" onClick={refreshList}>Try again</button>} />}
      {list.kind === 'ready' && (list.rows.length ? list.rows.map(row => <div key={row.id} className="claim-card claim-list-row">
        <div><strong>{row.target_name}</strong><p className="muted">Expires {new Date(row.expires_at).toLocaleDateString()}</p></div>
        <Chip tone={rowStatus(row) === 'claimed' ? 'ok' : undefined}>{rowStatus(row)}</Chip>
        {row.status === 'unclaimed' && <button className="btn btn-outline btn-sm" disabled={revoking} onClick={() => setRevoke(row)}>Revoke</button>}
      </div>) : <StateBlock kind="empty" size="compact" title="No invitations yet" />)}
    </Surface>
    <ConfirmDialog open={revoke !== null} title="Revoke this invitation?" body="This deletes the unclaimed trips and disables the link. You cannot undo this." danger
      confirmLabel="Revoke invitation" onClose={() => setRevoke(null)} onConfirm={() => { if (revoke) void revokeClaim(revoke.id) }} />
  </div>
}
