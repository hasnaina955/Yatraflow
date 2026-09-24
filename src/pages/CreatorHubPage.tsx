// ============ Creator hub ============
// Standalone home for creator-account management, extracted from the old
// "Creator mode" + "My publications" cards in Profile. Reached from the gated
// "Creator hub" nav pill (and the Profile gateway card). Requires a creator
// account; non-creators see an enable call-to-action.
//
// SHAPE (2026-09-23): rebuilt as a working dashboard rather than a settings
// page. The page now leads with performance — one ruled KPI strip, then the
// recorded-traffic trend for the selected window — because "how are my
// publications doing" is the question a creator arrives with. The creator
// profile (bio, socials, the disable switch) moved into a disclosure at the
// foot: it is a thing you set once, and it used to hold the entire fold.
//
// The trend and the per-publication rows are ONE derivation over ONE clock
// (`now` is computed once and handed to both builders), so the chart can never
// describe a different window from the numbers beneath it.
import { useCallback, useEffect, useState } from 'react'
import { InlineIcon } from '../components/icons'
import { ChevronDown, ExternalLink, Pencil } from 'lucide-react'
import { PillNav } from '../components/PillNav'
import { TrendChart, type UnlockRead } from '../components/TrendChart'
import type { PublishedItinerary } from '../data/types'
import { useDb, currentUser, updateProfile, unpublishItinerary, tripById } from '../store/store'
import {
  projectEarnings, deriveActualSales, payoutStatus, payoutPeriods, payoutPeriodStatus,
  PAYOUT_MINIMUM_INR, PLATFORM_FEE_SUMMARY, type ActualSales,
} from '../lib/earnings'
import { fetchCreatorSales, fetchCreatorFunnel, type FunnelDailyRow } from '../lib/unlock'
import {
  buildDailySeries, buildPubFunnels, describePreLog, formatPct, FUNNEL_WINDOWS,
  type FunnelSale, type FunnelWindowDays, type PubFunnel,
} from '../lib/pubFunnel'
import { formatInr } from '../lib/engine'
import { Chip, ConfirmDialog, Field, toast } from '../components/ui'

/** Social links are stored raw and later emitted as an `href`, so a non-URL
 *  value becomes a live broken link. The inputs are `type="url"` but sit
 *  outside a form, so the browser never validates them — do it here. Accept an
 *  empty value (clearing is fine) or anything that parses as http/https. */
function isValidSocialUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** "26 Sep" — a run date, not a timestamp. */
function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** "Friday, 26 Sep" — the sentence form, where a weekday tells the reader how
 *  far away the run is without their counting. */
function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
}

/** The one clock the page renders against.
 *
 *  A component must be pure, so this is not `Date.now()` in the render body —
 *  that re-derives "now" on every render and makes the output unstable. It is
 *  read once per mount (or per retry, via `refreshClock`) and held in state, so
 *  the trend, the rows and the note all describe the same instant. Call
 *  `refreshClock()` from a Retry: a retry is a new question, asked later. */
function useStableNow(): [number, () => void] {
  const [now, setNow] = useState(() => Date.now())
  const refresh = useCallback(() => { setNow(Date.now()) }, [])
  return [now, refresh]
}

export function CreatorHubPage({ onNavigate }: { onNavigate: (r: string) => void }) {
  const db = useDb()
  const me = currentUser(db)
  const myPubs = me ? db.published.filter(p => p.creatorId === me.id) : []

  const [creatorBio, setCreatorBio] = useState(me?.profile.creatorBio ?? '')
  const [youtube, setYoutube] = useState(me?.profile.socialLinks?.youtube ?? '')
  const [instagram, setInstagram] = useState(me?.profile.socialLinks?.instagram ?? '')
  const [socialErrors, setSocialErrors] = useState<{ youtube?: string; instagram?: string }>({})
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [unpubTarget, setUnpubTarget] = useState<PublishedItinerary | null>(null)
  const [hubTab, setHubTab] = useState<'overview' | 'earnings'>('overview')
  const [earningsView, setEarningsView] = useState<'actual' | 'projection'>('actual')
  const [earningsBasis, setEarningsBasis] = useState<'gross' | 'net'>('gross')
  // Real sales (I-11): entitlements for MY publications, read through the
  // creator RLS policy. A failed read is an ERROR state with retry, not a
  // silent empty ledger — "No sales yet" and "read failed" are different
  // truths (the conflation hid a live grant bug for a whole session).
  const [sales, setSales] = useState<ActualSales | null>(null)
  const [salesError, setSalesError] = useState(false)
  const [salesRetry, setSalesRetry] = useState(0)
  // The RECORDED funnel (I-22/I-15): the dated event log, read per day so the
  // window control costs no round trip. Deliberately separate from the counter
  // tiles above, which are lifetime totals that include traffic from before
  // recording began — the two are not the same number and are labelled so.
  const [daily, setDaily] = useState<FunnelDailyRow[] | null>(null)
  const [funnelError, setFunnelError] = useState(false)
  const [funnelRetry, setFunnelRetry] = useState(0)
  const [funnelDays, setFunnelDays] = useState<FunnelWindowDays>(30)
  useEffect(() => {
    let alive = true
    // The error flag is cleared when the retry STARTS, which is inside the
    // fetch's own turn — a setState in the effect body would cascade a render
    // before the request had even been issued.
    fetchCreatorSales()
      .then(rows => { if (alive) { setSalesError(false); setSales(deriveActualSales(rows, myPubs)) } })
      .catch(() => { if (alive) { setSalesError(true); setSales(null) } })
    return () => { alive = false }
  }, [me?.id, salesRetry]) // eslint-disable-line react-hooks/exhaustive-deps
  // Same shape as the sales read above, and for the same reason: a log with
  // nothing in it and a log that could not be read are different truths, and a
  // funnel that quietly reads zero over real traffic is the exact conflation
  // the sales ledger already had to fix once.
  useEffect(() => {
    let alive = true
    fetchCreatorFunnel()
      .then(rows => { if (alive) { setFunnelError(false); setDaily(rows) } })
      .catch(() => { if (alive) { setFunnelError(true); setDaily(null) } })
    return () => { alive = false }
  }, [me?.id, funnelRetry])

  const loggedIn = Boolean(me)
  useEffect(() => { if (!loggedIn) onNavigate('/auth') })
  if (!me) return null

  return (
    <div className="container hub-page">
      <header className="hub-head">
        <div className="hub-head-id">
          <h1>Creator hub</h1>
          <p className="muted small">{me.email}</p>
        </div>
        {me.profile.isCreator && (
          <a className="btn btn-outline btn-sm" href={`#/creator/${me.id}`}>
            <InlineIcon icon={ExternalLink} size={13} gap={5} />View public page
          </a>
        )}
      </header>

      {!me.profile.isCreator ? (
        <div className="card">
          <h2 className="card-title hub-panel-title">Creator mode</h2>
          <p className="hint-text" style={{ margin: '6px 0 12px' }}>
            Creator mode is a branding badge: your bio and social links appear on the itineraries you publish, and you get a public creator page others can follow.
          </p>
          <button className="btn btn-saffron" onClick={() => { updateProfile({ isCreator: true }); toast('Creator mode enabled — your bio and links now show on published itineraries.') }}>
            Enable creator mode
          </button>
        </div>
      ) : (
        <>
          {/* One view switch for the page, sitting above everything it controls
              so the tabs read as the page's axis rather than a decoration on a
              card. */}
          <PillNav className="filter-pillbar hub-tabs" role="group" aria-label="Creator hub view" activeKey={hubTab}>
            {([['overview', 'Overview'], ['earnings', 'Earnings']] as const).map(([k, label]) => (
              <button key={k} type="button" data-pill-key={k} className={`clickable-chip chip${hubTab === k ? ' on-teal' : ''}`}
                onClick={() => { setHubTab(k) }} aria-pressed={hubTab === k}>{label}</button>
            ))}
          </PillNav>

          {hubTab === 'overview' ? (
            <HubOverview myPubs={myPubs} onUnpublish={setUnpubTarget} onNavigate={onNavigate}
              daily={daily} salesRows={sales?.rows ?? []} funnelError={funnelError}
              onRetry={() => { setFunnelRetry(n => n + 1) }} days={funnelDays} onDays={setFunnelDays}
              unlockRead={salesError ? 'failed' : sales === null ? 'reading' : 'ready'}
              salesError={salesError} onRetrySales={() => { setSalesRetry(n => n + 1) }} />
          ) : (
            <EarningsTab myPubs={myPubs} sales={sales} salesError={salesError}
              onRetry={() => { setSalesRetry(n => n + 1) }} view={earningsView} onView={setEarningsView}
              basis={earningsBasis} onBasis={setEarningsBasis} />
          )}

          {/* The profile is a thing you set once. It used to own the fold and
              push every number below it; it now closes the page instead. */}
          <details className="card hub-profile">
            <summary className="hub-profile-summary">
              <span className="card-title hub-panel-title">Creator profile</span>
              <Chip tone="ok">Enabled</Chip>
              <ChevronDown className="hub-chev" size={16} aria-hidden />
            </summary>
            <p className="hint-text" style={{ margin: '10px 0 12px' }}>
              Publishing to Explore is open to everyone — do it from any trip&apos;s Share tab.
              Creator mode is a branding badge: your bio and social links appear
              on the itineraries you publish.
            </p>
            <Field label="Creator bio"><textarea className="textarea" value={creatorBio} onChange={e => { setCreatorBio(e.target.value) }} placeholder="Tell readers who you are and why they should trust your routes." /></Field>
            <div className="form-row">
              <Field label="YouTube link" error={socialErrors.youtube}><input className="input" type="url" inputMode="url" value={youtube} onChange={e => { setYoutube(e.target.value); if (socialErrors.youtube) setSocialErrors(s => ({ ...s, youtube: undefined })) }} placeholder="https://youtube.com/@…" /></Field>
              <Field label="Instagram link" error={socialErrors.instagram}><input className="input" type="url" inputMode="url" value={instagram} onChange={e => { setInstagram(e.target.value); if (socialErrors.instagram) setSocialErrors(s => ({ ...s, instagram: undefined })) }} placeholder="https://instagram.com/…" /></Field>
            </div>
            <div className="hub-profile-actions">
              <button className="btn btn-primary btn-sm" onClick={() => {
                const yt = youtube.trim()
                const ig = instagram.trim()
                const nextErrors = {
                  youtube: yt && !isValidSocialUrl(yt) ? 'Enter a full link starting with http:// or https://' : undefined,
                  instagram: ig && !isValidSocialUrl(ig) ? 'Enter a full link starting with http:// or https://' : undefined,
                }
                setSocialErrors(nextErrors)
                if (nextErrors.youtube || nextErrors.instagram) return
                updateProfile({
                  creatorBio: creatorBio.trim() || undefined,
                  socialLinks: (yt || ig)
                    ? { youtube: yt || undefined, instagram: ig || undefined }
                    : undefined,
                })
                toast('Creator profile saved')
              }}>Save creator profile</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setConfirmDisable(true) }}>Disable creator mode</button>
            </div>
          </details>
        </>
      )}

      <ConfirmDialog
        open={confirmDisable}
        title="Disable creator mode?"
        body="Your bio and social links stop showing on your published itineraries and the creator badge is removed. Your publications stay live — you can re-enable the badge anytime."
        confirmLabel="Disable"
        danger
        onConfirm={() => {
          updateProfile({ isCreator: false })
          setConfirmDisable(false)
          toast('Creator mode disabled — your publications stay live.')
        }}
        onClose={() => { setConfirmDisable(false) }}
      />
      <ConfirmDialog
        open={!!unpubTarget}
        title={`Unpublish “${unpubTarget?.title ?? ''}”?`}
        body="It is removed from Explore immediately and its public page stops working. The trip itself is not touched — you can publish it again from its Share tab."
        confirmLabel="Unpublish"
        danger
        onConfirm={() => {
          if (!unpubTarget) return
          unpublishItinerary(unpubTarget.tripId)
          setUnpubTarget(null)
          toast('Unpublished — removed from Explore')
        }}
        onClose={() => { setUnpubTarget(null) }}
      />
    </div>
  )
}

/** "1 unlock" / "3 unlocks". The counts sit inside sentences, and a plan with a
 *  single unlock used to read "1 unlocks" — the kind of small wrongness that
 *  costs a careful reader's trust in the bigger numbers beside it. */
function unit(n: number, noun: string): string {
  return n === 1 ? noun : `${noun}s`
}

/** One publication's recorded funnel, for the selected window.
 *
 *  Says NOTHING RECORDED rather than printing three zeroes, because "no traffic
 *  yet" and "traffic that converted at 0%" are different claims and only one of
 *  them is a measurement.
 *
 *  The lifetime line is the honesty: a window's numbers sit beside that
 *  publication's own all-time totals, because the counters predate the event
 *  log. "38 forks" alone cannot tell a creator whether that is most of their
 *  forks or a slice of them. */
function FunnelLine({ f, unread, unlockRead = 'ready', windowLabel }: { f: PubFunnel | undefined; unread: boolean; unlockRead?: UnlockRead; windowLabel: string }) {
  if (!f) return null
  // The all-time line reads the counters from the hydrated cache, so it is true
  // even when the log could not be read. The windowed steps are NOT, so a failed
  // read withholds them and says why — "no traffic" and "traffic I could not
  // read" are different claims and only one of them is a measurement.
  const lifetime = (
    <span className="pf-lifetime muted num">
      All time {f.lifetimeViews} {unit(f.lifetimeViews, 'visit')} · {f.lifetimeForks} {unit(f.lifetimeForks, 'fork')} · {f.lifetimeUnlocks} {unit(f.lifetimeUnlocks, 'unlock')}
    </span>
  )
  // The counters-vs-log sentence. Computed once here (one derivation, shared
  // with the public page through describePreLog) so the two surfaces cannot
  // disagree about why the numbers differ.
  const preLog = describePreLog(f)
  if (unread) {
    return (
      <>
        <span className="muted">Traffic could not be read just now.</span>
        {lifetime}
      </>
    )
  }
  if (f.unreported) {
    return (
      <>
        <span className="muted">No recorded traffic yet — nothing to measure for this plan.</span>
        {lifetime}
      </>
    )
  }
  return (
    <>
      {/* The accepted hierarchy: the funnel is the row's largest element, each
          stage in the hue the chart above uses for that same stage, so a stage
          means one thing everywhere on the page. */}
      <span className="hub-lead-steps">
        {/* The window, stated ONCE per row rather than implied: the figures
            below are windowed, and "12 / 4 / 1" alone left the reader holding
            the selected window in their head. */}
        <span className="hub-lead-window">in {windowLabel}</span>
        <span className="hub-lead-step hub-lead-visits"><b className="hub-lead-n">{f.views}</b> {unit(f.views, 'visit')}</span>
        <span className="hub-lead-step hub-lead-forks"><b className="hub-lead-n">{f.forks}</b> {unit(f.forks, 'fork')} <span className="hub-lead-rate">{formatPct(f.forkRatePct)} of visits</span></span>
        {/* Unlocks come from the sales ledger, so an unread ledger leaves this
            stage UNKNOWN. Printing 0 here would say "nobody bought" — the same
            conflation the branches above avoid for the log as a whole. */}
        {unlockRead === 'ready'
          ? <span className="hub-lead-step hub-lead-unlocks"><b className="hub-lead-n">{f.unlocks}</b> {unit(f.unlocks, 'unlock')} <span className="hub-lead-rate">{formatPct(f.unlockRatePct)} of forks</span></span>
          : <span className="hub-lead-step muted">{unlockRead === 'reading' ? 'unlocks still being read' : 'unlocks could not be read'}</span>}
        {f.forksExceedViews && (
          <span className="muted">· more forks than visits — Explore&apos;s card forks a plan without opening it</span>
        )}
      </span>
      {/* The drop-off, as two separated marks on an empty track: the track is
          the traffic you had, the marks are what survived each step, and the
          gap between them keeps them from reading as one stripe. (The earlier
          version overlaid all three at the same origin, which looked like a
          three-colour bar and said nothing the figures hadn't.) */}
      <span className="hub-lead-bar" aria-hidden="true">
        <i style={{ inlineSize: `${Math.min(100, Math.max(0, f.forkRatePct))}%` }} />
        {unlockRead === 'ready' && (
          <i className="is-unlock" style={{ insetInlineStart: `calc(${Math.min(100, Math.max(0, f.forkRatePct))}% + 3px)`, inlineSize: `${Math.min(100, Math.max(0, f.unlockRatePct))}%` }} />
        )}
      </span>
      {preLog && <span className="pf-prelog muted">{preLog}</span>}
      {lifetime}
    </>
  )
}

/** Overview: the KPI strip, the recorded-traffic trend, and the publication
 *  manager rows — the trend and the rows built from one derivation over one
 *  clock, so the picture and the table describe the same window. */
export function HubOverview({ myPubs, onUnpublish, onNavigate, daily, salesRows, funnelError, onRetry, days, onDays, unlockRead, salesError, onRetrySales }: {
  myPubs: PublishedItinerary[]
  onUnpublish: (p: PublishedItinerary) => void
  onNavigate: (r: string) => void
  /** null while the funnel read is in flight; [] when it succeeded empty. */
  daily: FunnelDailyRow[] | null
  /** The sales ledger's own rows — the unlock stage's only source. */
  salesRows: readonly FunnelSale[]
  funnelError: boolean
  onRetry: () => void
  days: FunnelWindowDays
  onDays: (d: FunnelWindowDays) => void
  /** Whether the sales ledger — and therefore every unlock figure — has been
   *  read. Passed down rather than inferred, because "no sales" and "no answer
   *  yet" look identical in the row array. */
  unlockRead: UnlockRead
  /** The ledger read failed. Its own flag and its own retry: Overview used to
   *  offer recovery only for the funnel read, leaving the money-bearing column
   *  the one thing on the page you could not ask again. */
  salesError: boolean
  onRetrySales: () => void
}) {
  const totalViews = myPubs.reduce((s, p) => s + p.views, 0)
  const totalForks = myPubs.reduce((s, p) => s + p.copies, 0)
  // ONE clock for the whole window, held in state rather than re-derived on
  // every render (a component must be pure). The trend and the rows are both
  // cut from it, so switching the window cannot leave the chart a day ahead of
  // the table, and no surface has to re-derive "now" for itself. A Retry
  // re-reads the clock: asking again is a new question, asked later.
  const [now, refreshClock] = useStableNow()
  const handleRetryFunnel = useCallback(() => { refreshClock(); onRetry() }, [refreshClock, onRetry])
  // ONE derivation, read by the trend above, the rows below and the note beside
  // them, so none of the three can disagree about a rate or a window.
  const funnels = buildPubFunnels({
    daily: daily ?? [],
    sales: salesRows,
    pubs: myPubs.map(p => ({
      id: p.id, title: p.title, priceInr: p.premiumPriceInr ?? null,
      lifetimeViews: p.views, lifetimeForks: p.copies,
    })),
    days,
    now,
  })
  const series = buildDailySeries({ daily: daily ?? [], sales: salesRows, days, now })
  const funnelOf = new Map(funnels.map(f => [f.pubId, f]))
  // When the log's own history starts, page-wide. The tiles above are all-time
  // and most of their number PREDATES the first recorded event, which is
  // exactly the pair a reader would otherwise compare and conclude wrongly from.
  const recordingSince = daily && daily.length > 0
    ? daily.reduce((min, r) => (r.day < min ? r.day : min), daily[0].day)
    : null
  const staleCount = myPubs.filter(p => {
    const t = tripById(p.tripId)
    return !!t && t.updatedAt > (p.refreshedAt ?? p.publishedAt)
  }).length
  const windowLabel = FUNNEL_WINDOWS.find(w => w.days === days)?.label ?? `${days} days`
  // The counters-vs-log fact, said ONCE for the account instead of once per row.
  // Every publication's counters predate the same log, so repeating the sentence
  // under each row made the page's longest text its most-skipped, and left the
  // strip's all-time figures looking like they disagreed with the chart above
  // them. Stated here, it is a frame the reader applies to everything below.
  const framingNote = daily === null
    ? null
    : recordingSince
      ? 'The four figures above are all-time counters. The chart and the rows below count only recorded events, and most of a counter predates the log.'
      : 'The four figures above are all-time counters. Nothing has been recorded yet, so the trend starts with the first visit.'

  return (
    <>
      <div className="hub-strip">
        <div className="hub-cell"><span className="stat-label">Views (all time)</span><span className="stat-value hub-cell-value">{totalViews.toLocaleString('en-IN')}</span></div>
        <div className="hub-cell"><span className="stat-label">Forks (all time)</span><span className="stat-value hub-cell-value">{totalForks.toLocaleString('en-IN')}</span></div>
        <div className="hub-cell"><span className="stat-label">Live</span><span className="stat-value hub-cell-value">{myPubs.length}</span></div>
        <div className="hub-cell"><span className="stat-label">Behind</span><span className="stat-value hub-cell-value">{staleCount > 0 ? <span className="metric-warn">{staleCount}</span> : 0}</span></div>
      </div>

      {framingNote && <div className="hub-note hub-framing">{framingNote}</div>}

      {salesError && (
        <div className="hub-note" role="alert">
          <b>Couldn&apos;t read your sales ledger.</b> Every unlock figure on this tab is unknown until it loads —
          nothing has been lost, it just could not be read. The Earnings tab shows the ledger itself.
          <button className="btn btn-outline btn-sm hub-note-action" onClick={onRetrySales}>Retry</button>
        </div>
      )}

      {/* Two columns on a wide screen, one below: the trend and the publication
          list answer two halves of the same question, and stacking them as
          full-width banners made the page a scroll of equal-weight bands. */}
      {/* One instrument panel, two columns, a hairline between them (live mode,
          variant 3). The page used to be a strip, then two cards, then the
          profile card — a tall stack with a maintenance surface at the foot and
          a gap under whichever column was shorter. A single surface has no
          inter-card gap to collapse, and the divider does the grouping two
          borders were doing badly. The pairing starts at 1024 rather than 1280
          because a 1140px window is a perfectly ordinary laptop. */}
      <div className="card hub-instrument">
        <div className="hub-instrument-cols">
          <section className="hub-instrument-col" aria-labelledby="hub-trend-h">
            <div className="hub-panel-head">
              <h2 className="hub-panel-title" id="hub-trend-h">Recorded traffic</h2>
              <PillNav className="filter-pillbar hub-pills-quiet" role="group" aria-label="Funnel window" activeKey={String(days)}>
                {FUNNEL_WINDOWS.map(w => (
                  <button key={w.days} type="button" data-pill-key={String(w.days)}
                    className={`clickable-chip chip${days === w.days ? ' on-teal' : ''}`}
                    onClick={() => { onDays(w.days) }} aria-pressed={days === w.days}>{w.label}</button>
                ))}
              </PillNav>
            </div>
            {/* The state sentence lives here once, and the box below stays silent
                instead of apologising twice. The failure branch still OPENS this
                chain, ahead of the load branch: a read that failed must never be
                described as one still loading. `role="status"` announces a change
                without needing text in the empty box. */}
            <div className="hub-panel-note" role="status">
              <span className="small muted">
                {funnelError
                  ? 'Recorded traffic could not be read just now — the trend is unchanged on the server.'
                  : daily === null
                  ? 'Reading recorded traffic…'
                  : recordingSince
                    ? `Chart shows recorded days only; the log begins ${new Date(`${recordingSince}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`
                    : 'Nothing recorded yet — the trend starts with the first visit.'}
              </span>
              {funnelError && <button className="btn btn-outline btn-sm" onClick={handleRetryFunnel}>Retry</button>}
            </div>
            {/* A failed or in-flight read must not draw as "nothing recorded": the
                chart's own empty state is a measurement, so it is only shown once
                the log was actually read. Reserved box, no second sentence. */}
            {daily === null
              ? <div className="hub-trend-void" aria-hidden="true" />
              : <TrendChart points={series} label={windowLabel} unlockRead={unlockRead} />}
          </section>

          <section className="hub-instrument-col" aria-labelledby="hub-pubs-h">
            <div className="hub-lead-head">
              <h2 id="hub-pubs-h">Publications</h2>
              <span>
                {myPubs.length} live{staleCount > 0 ? ` · ${staleCount} behind` : ''}
              </span>
            </div>
            {myPubs.length === 0 ? (
              <p className="hint-text" style={{ margin: '6px 0 0' }}>
                Nothing published yet — list a trip on Explore from its Share tab.
              </p>
            ) : (
              <div>
                {myPubs.map(p => {
                  const trip = tripById(p.tripId)
                  const stale = !!trip && trip.updatedAt > (p.refreshedAt ?? p.publishedAt)
                  return (
                    <div key={p.id} className="hub-lead-row">
                      <span className="hub-lead-title">
                        <a href={`#/pub/${p.id}`}>{p.title}</a>
                        {stale && <Chip tone="saffron">Page behind itinerary</Chip>}
                        {/* Where it goes and how long — not what it costs. The
                            price belongs with the money surfaces; this row is
                            about whether the page converts. */}
                        <span className="hub-lead-where">
                          {[
                            p.routeSummary.slice(0, 3).join(' · '),
                            p.durationDays ? `${p.durationDays} days` : '',
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <FunnelLine f={funnelOf.get(p.id)} unread={funnelError} unlockRead={unlockRead} windowLabel={windowLabel} />
                      <span className="pub-row-actions">
                        {stale ? (
                          <button className="btn btn-saffron btn-sm" aria-label={`Update page for ${p.title}`}
                            onClick={() => { onNavigate(`/trip/${p.tripId}/share`) }}>
                            <InlineIcon icon={Pencil} size={13} gap={3} />Update page
                          </button>
                        ) : (
                          <button className="btn btn-outline btn-sm" aria-label={`Edit ${p.title}`} onClick={() => { onNavigate(`/trip/${p.tripId}/share`) }}>
                            <InlineIcon icon={Pencil} size={13} gap={3} />Edit
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" aria-label={`Unpublish ${p.title}`} onClick={() => { onUnpublish(p) }}>Unpublish</button>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>


    </>
  )
}

/** Earnings tab: the Gumroad-shaped payout ledger. The "Actual" view shows
 *  REAL sales once the payments rail is live (empty honestly until then);
 *  the Projection view stays clearly-labeled not-money. */
export function EarningsTab({ myPubs, sales, salesError, onRetry, view, onView, basis, onBasis }: {
  myPubs: PublishedItinerary[]
  sales: ActualSales | null   // null while the fetch is in flight
  salesError: boolean         // the read itself failed — distinct from an empty ledger
  onRetry: () => void
  view: 'actual' | 'projection'
  onView: (v: 'actual' | 'projection') => void
  /** Which figure the headline tiles read: what buyers paid, or what is kept
   *  after the platform fee. The ledger shows both columns either way, so the
   *  toggle changes emphasis rather than hiding a number. */
  basis: 'gross' | 'net'
  onBasis: (b: 'gross' | 'net') => void
}) {
  const projection = projectEarnings(myPubs)
  const actual = sales
  /** Whether the ledger has been READ. The figures below still derive from
   *  `actual ?? 0` — that stays the safe arithmetic — but a figure that was
   *  never read must not be RENDERED as a measured zero. "₹0 lifetime, 0
   *  sales" beside reassuring prose is the page contradicting itself at the
   *  exact moment a money-anxious creator is most attentive, so the render is
   *  gated on this instead. */
  const ledgerRead: 'ready' | 'reading' | 'failed' = salesError ? 'failed' : actual === null ? 'reading' : 'ready'
  const unreadLabel = ledgerRead === 'reading' ? 'Reading…' : 'Not read'
  const lifetimeInr = basis === 'net' ? (actual?.netInr ?? 0) : (actual?.grossInr ?? 0)
  // The schedule is about real money, so it reads the actual ledger and is
  // rendered in the Actual view only — a projection has no payout date. The
  // clock is held in state, not re-derived per render: a component must be
  // pure, and a payout date that moves under the reader is its own kind of lie.
  const [now, refreshClock] = useStableNow()
  const handleRetry = useCallback(() => { refreshClock(); onRetry() }, [refreshClock, onRetry])
  const payout = payoutStatus(actual?.netInr ?? 0, now)
  // Same rows, same fees, grouped by the run each sale would land in — so this
  // table adds up to the ledger above it rather than re-deriving the ladder.
  const payoutRuns = payoutPeriods(actual?.rows ?? [], now)
  return (
    <>
      <div className="hub-strip">
        <div className="hub-cell">
          <span className="stat-label">Lifetime {basis === 'net' ? 'net' : 'gross'}</span>
          {ledgerRead === 'ready'
            ? <span className="stat-value hub-cell-value">{formatInr(lifetimeInr)}</span>
            : <span className="stat-value hub-cell-value hub-cell-unread">{unreadLabel}</span>}
        </div>
        <div className="hub-cell">
          <span className="stat-label">Sales</span>
          {ledgerRead === 'ready'
            ? <span className="stat-value hub-cell-value">{actual?.rows.length ?? 0}</span>
            : <span className="stat-value hub-cell-value hub-cell-unread">{unreadLabel}</span>}
        </div>
        {/* A date only once there is something to send: a run date over a ₹0
            balance reads as money on its way. The dash states its own reason
            underneath, because a bare "—" next to a zero explains nothing — and
            while the ledger is unread, the conclusion is suppressed entirely
            rather than guessed at zero. */}
        <div className="hub-cell">
          <span className="stat-label">Next payout</span>
          {ledgerRead !== 'ready' ? (
            <>
              <span className="stat-value hub-cell-value hub-cell-unread">{unreadLabel}</span>
              <span className="hub-cell-hint muted">balance unknown</span>
            </>
          ) : (
            <>
              <span className="stat-value hub-cell-value">{payout.clearsInr > 0 ? shortDate(payout.dueAt) : '—'}</span>
              {payout.clearsInr === 0 && (
                <span className="hub-cell-hint muted">
                  {payout.belowMinimum ? `under ${formatInr(payout.minimumInr)} — rolls over` : 'nothing to pay out yet'}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="hub-controls">
        <PillNav className="filter-pillbar" role="group" aria-label="Earnings view" activeKey={view}>
          {([['actual', 'Actual'], ['projection', 'Projection']] as const).map(([k, label]) => (
            <button key={k} type="button" data-pill-key={k} className={`clickable-chip chip${view === k ? ' on-teal' : ''}`}
              onClick={() => { onView(k) }} aria-pressed={view === k}>{label}</button>
          ))}
        </PillNav>
        <span className="hub-controls-div" aria-hidden />
        <span className="small muted">Show amounts as</span>
        <PillNav className="filter-pillbar" role="group" aria-label="Show amounts as" activeKey={basis}>
          {([['gross', 'Gross'], ['net', 'Net']] as const).map(([k, label]) => (
            <button key={k} type="button" data-pill-key={k} className={`clickable-chip chip${basis === k ? ' on-teal' : ''}`}
              onClick={() => { onBasis(k) }} aria-pressed={basis === k}>{label}</button>
          ))}
        </PillNav>
      </div>

      {view === 'actual' && (
        <section className="card">
          <h3 className="card-title hub-panel-title">Payouts</h3>
          {/* The schedule is a statement about real money, so it waits for the
              ledger. Until then it says the balance is unknown — the old text
              cheerfully described a ₹0 balance the page had never read. */}
          {ledgerRead === 'ready' ? (
            <p className="hint-text" style={{ margin: '6px 0 6px' }}>
              {payout.clearsInr > 0 ? (
                <>The next run is <b>{longDate(payout.dueAt)}</b> — it would clear <b>{formatInr(payout.clearsInr)}</b>, your net balance after the platform fee.</>
              ) : payout.belowMinimum ? (
                <>Runs happen weekly on Fridays. Your balance is under the <b>{formatInr(payout.minimumInr)}</b> minimum, so it stays on the books until it clears it — nothing is lost.</>
              ) : (
                <>Runs happen weekly on Fridays. There is nothing to pay out yet — your balance is <b>{formatInr(0)}</b> until a priced itinerary sells.</>
              )}
            </p>
          ) : (
            <p className="hint-text" style={{ margin: '6px 0 6px' }}>
              {ledgerRead === 'reading'
                ? 'Reading your sales ledger… the next run is not stated until it answers.'
                : 'Your sales ledger could not be read, so the balance and the next run are unknown — nothing here is a zero.'}
            </p>
          )}
          <p className="hint-text" style={{ margin: 0 }}>
            Runs are not automated yet: this balance is what a payout would disburse and nothing transfers
            on its own. Platform fee — {PLATFORM_FEE_SUMMARY}.
          </p>
        </section>
      )}

      {view === 'actual' ? (
        actual === null ? (
          <div className="container loading-block"><div className="spinner" />Loading sales…</div>
        ) : salesError ? (
          <>
            <div className="hub-note" role="alert">
              <b>Couldn't load your sales.</b> The ledger read failed just now — your recorded sales are safe
              and will appear once the connection works. Check your connection and try again.
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={handleRetry}>Retry</button>
          </>
        ) : actual.rows.length === 0 ? (
          <>
            <table className="compare-table pub-ledger" tabIndex={0} aria-label="Sales ledger">
              <thead><tr><th>Date</th><th>Itinerary</th><th className="num">Paid</th><th className="num">Fee</th><th className="num">Net</th></tr></thead>
              <tbody>
                <tr><td colSpan={5} className="empty-ledger">No sales yet</td></tr>
              </tbody>
            </table>
            <div className="hub-note">
              <b>No unlocks sold yet.</b> When someone buys the full plan on one of your priced itineraries, the
              sale lands here with the amount they actually paid. The Projection tab shows what the same traffic
              would be worth if every fork had bought.
            </div>
          </>
        ) : (
          <>
            <table className="compare-table pub-ledger" tabIndex={0} aria-label="Sales ledger">
              <thead><tr><th>Date</th><th>Itinerary</th><th className="num">Paid</th><th className="num">Fee</th><th className="num">Net</th></tr></thead>
              <tbody>
                {actual.rows.map(r => (
                  <tr key={`${r.pubId}-${r.grantedAt}`}>
                    <td>{new Date(r.grantedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td>{r.title}</td>
                    <td className="num">{formatInr(r.amountPaidInr)}</td>
                    <td className="num">{formatInr(r.feeInr)}</td>
                    <td className="num">{formatInr(r.netInr)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}><b>Total</b></td>
                  <td className="num"><b>{formatInr(actual.grossInr)}</b></td>
                  <td className="num"><b>{formatInr(actual.feeInr)}</b></td>
                  <td className="num"><b>{formatInr(actual.netInr)}</b></td>
                </tr>
              </tbody>
            </table>
            <p className="hint-text" style={{ marginTop: 8 }}>
              Fee is the platform's cut — {PLATFORM_FEE_SUMMARY}, charged across your sales in the order they
              happened, so a row's fee depends on where it fell on your lifetime gross and not on the order this
              table is read in. Amounts are what buyers actually paid at purchase time, not your publication's
              current price.
            </p>

            {payoutRuns.length > 0 && (
              <>
                <h4 className="hub-subhead">Payout runs</h4>
                <table className="compare-table pub-ledger" tabIndex={0} aria-label="Payout runs">
                  <thead><tr><th>Run</th><th className="num">Sales</th><th className="num">Gross</th><th className="num">Fee</th><th className="num">Net</th><th>Status</th></tr></thead>
                  <tbody>
                    {payoutRuns.map(p => (
                      <tr key={p.dueAt}>
                        <td>{new Date(p.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td className="num">{p.salesCount}</td>
                        <td className="num">{formatInr(p.grossInr)}</td>
                        <td className="num">{formatInr(p.feeInr)}</td>
                        <td className="num">{formatInr(p.netInr)}</td>
                        <td>{payoutPeriodStatus(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="hint-text" style={{ marginTop: 8 }}>
                  Each run covers the sales made since the previous one, and a sale lands on the Friday after it
                  was bought. Nothing here has been disbursed — payouts are not automated yet, so a past run is
                  money owed rather than money sent, and a balance under {formatInr(PAYOUT_MINIMUM_INR)} rolls
                  into the next run instead of clearing.
                </p>
              </>
            )}
          </>
        )
      ) : projection.rows.length === 0 ? (
        <div className="hub-note">
          <b>Nothing to project yet.</b> Projections need a priced publication — set a premium price on one from its
          Share tab, and its earning potential (clearly marked as not-money) shows up here.
        </div>
      ) : (
        <>
          <table className="compare-table pub-ledger" tabIndex={0} aria-label="Projection ledger">
            <thead><tr><th>Itinerary</th><th className="num">Price</th><th className="num">Forks</th><th className="num">If all unlocked</th><th className="num">Fee</th><th className="num">Net</th></tr></thead>
            <tbody>
              {projection.rows.map(r => (
                <tr key={r.pubId}>
                  <td>{r.title}</td>
                  <td className="num">{formatInr(r.priceInr)}</td>
                  <td className="num">{r.forks}</td>
                  <td className="num">{formatInr(r.grossInr)}</td>
                  <td className="num">{formatInr(r.netInr)}</td>
                </tr>
              ))}
              <tr>
                <td><b>Potential to date</b></td>
                <td />
                <td className="num"><b>{projection.rows.reduce((s, r) => s + r.forks, 0)}</b></td>
                <td className="num"><b>{formatInr(projection.potentialInr)}</b></td>
                <td className="num"><b>{formatInr(projection.feeInr)}</b></td>
                <td className="num"><b>{formatInr(projection.netInr)}</b></td>
              </tr>
            </tbody>
          </table>
          <p className="hint-text" style={{ marginTop: 8 }}>
            A projection, not money: price × forks so far, assuming every fork had bought the unlock. The
            potential total is exact for the fee ladder ({PLATFORM_FEE_SUMMARY}); the per-row fee shares are
            illustrative, because which sale earns the lower rate depends on what actually sells first.
          </p>
          {projection.unpricedCount > 0 && (
            <div className="hub-note">
              <b>{projection.unpricedCount} free publication{projection.unpricedCount === 1 ? '' : 's'} not shown.</b>{' '}
              Fully free itineraries don’t project — set a premium price on their Share tab to see them here.
            </div>
          )}
        </>
      )}
    </>
  )
}
