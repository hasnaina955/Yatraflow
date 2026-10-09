// ============ My trips ============
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Calendar, ChevronRight, Clock, Compass, LayoutGrid, MapPin, Plus, Rocket, Rows3, ShoppingBag, Trash2, Users, Wallet } from 'lucide-react'
import { InlineIcon, MetaIcon } from '../components/icons'
import { useTrips, useTrashedTrips, useUsers, useSessionUserId, useSliceReads, useTrashLoaded, useTrashFailed, tripsForUser, trashTrip, restoreTrashedTrip, restoreTrashedTripById, permanentlyDeleteTrip, fetchTrashedTrips, rereadTrips, addDemoTrips, canEdit, roleOf } from '../store/store'
import { computeTotals, formatInrShort } from '../lib/engine'
import { nextTripStep, nextStepRoute, hasSavedCoverPhoto, plannedDayRatio, statusBucket, isStatusBucket, STATUS_FILTERS, departureLabel, type StatusBucket } from '../lib/tripNextStep'
import { cap } from '../lib/labels'
import { featuredTripPresentation, selectFeaturedTrip } from '../lib/featuredTrip'
import { editorialRouteCover, MY_TRIPS_BANNER } from '../lib/editorialAssets'
import { EditorialPhoto } from '../components/EditorialPhoto'
import { localMidnightMs } from '../lib/dayCount'
import { Avatar, Chip, EmptyState, toast, undoToast, ConfirmDialog } from '../components/ui'
import { Select } from '../components/Select'
import { PillNav } from '../components/PillNav'
import { loadDraft, draftIsWorthKeeping, draftAgeLabel } from '../lib/createDraft'
import { readinessFromDraft } from '../lib/createReadiness'
import { createFunnelOn } from '../lib/featureFlags'
import { loadPref, savePref } from '../lib/uiPrefs'
import { CoverThumb } from '../components/CoverThumb'
import { SavedShelf } from '../components/SavedShelf'
import { useDestinationCover } from '../hooks/useDestinationCover'
import { useToday } from '../hooks/useToday'
import { pickTripQueryCandidates, sizedCoverUrl } from '../lib/tripThumb'
import { ImportTripButton } from '../components/ImportTripButton'
import { sliceState, emptyCopyFor, readState } from '../lib/readState'
import type { Trip, User } from '../data/types'
import { TRAVEL_STYLES } from '../data/types'
import { appLink } from '../lib/appLink'

type SortKey = 'recent' | 'name' | 'budget-asc' | 'budget-desc' | 'length-desc'
type WhenKey = 'all' | 'upcoming' | 'past' | 'draft'

/** localStorage key for the MR3 status tabs. See `lib/tripNextStep`. */
const STATUS_PREF = 'trips_status_filter'
/** localStorage key for the MR4 grid/list toggle. */
const VIEW_PREF = 'trips_view'

type ViewMode = 'grid' | 'list'

/** True for a stored view name. Junk degrades to the grid, today's default. */
function isViewMode(raw: string | null | undefined): raw is ViewMode {
  return raw === 'grid' || raw === 'list'
}

/** The mockup's card carries a status pill on its cover. The pill's label and
 *  tint both read `STATUS_FILTERS`, the same list the status tabs render, so a
 *  pill can never say a status the tabs would not. The bucket model is this
 *  app's own (`dates`/`planning`/`booking`/`ready`) — only the pill's shape and
 *  place are ported. */
const BUCKET_LABEL = new Map<string, string>(STATUS_FILTERS.map(f => [f.id, f.label]))
const BUCKET_TONE: Record<Exclude<StatusBucket, 'all'>, string> = {
  dates: 'chip-saffron',
  planning: 'chip-teal',
  booking: 'chip-info',
  ready: 'chip-ok',
}

/** Date-bucket helper: "upcoming" starts today or later, "past" ended before
 *  today, "draft" has no meaningful date set. Uses endDate (not startDate) so
 *  a trip in progress counts as upcoming. */
function whenBucket(t: Trip, today: Date): WhenKey {
  const end = new Date(`${t.endDate}T23:59:59`)
  const start = new Date(`${t.startDate}T00:00:00`)
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return 'draft'
  // a valid start ≤ end means the plan is dated — past or upcoming by end date
  return end.getTime() < today.getTime() ? 'past' : 'upcoming'
}

export function TripsListPage({ onNavigate }: { onNavigate: (r: string) => void }) {
  // Slice subscriptions: this page only re-renders when trips, profiles or the
  // session actually change — not on every unrelated store commit.
  const allTrips = useTrips()
  const users = useUsers()
  const meId = useSessionUserId()
  const [pendingDelete, setPendingDelete] = useState<Trip | null>(null)
  // #89: "Delete forever" from the trash was the app's only unprotected
  // irreversible action — one click nuked the trip, votes, decisions, activity
  // and publication with no confirm and no undo. Now it opens a dedicated
  // confirm whose copy says plainly that this one cannot be undone.
  const [pendingPurge, setPendingPurge] = useState<Trip | null>(null)
  const [view, setView] = useState<'trips' | 'trash'>('trips')
  const trashed = useTrashedTrips()
  // #383/#387: per-slice read verdicts, so a failed read never renders the
  // genuine-empty copy. My Trips rides the hydrate's `trips` slice; the bin
  // rides its own on-demand fetch bits (it is never hydrated).
  const sliceReads = useSliceReads()
  const tripsRead = sliceState(sliceReads, 'trips')
  const retryTrips = () => { void rereadTrips() }
  const trashLoaded = useTrashLoaded()
  const trashFailed = useTrashFailed()
  const trashRead = readState({ settled: trashLoaded || trashFailed, failed: trashFailed, read: trashLoaded && !trashFailed })
  const retryTrash = () => { void fetchTrashedTrips() }

  // The Trash view is populated on demand from the owner-scoped RPC (the
  // restrictive RLS policy hides trashed trips from normal hydration).
  useEffect(() => {
    if (view === 'trash') void fetchTrashedTrips()
  }, [view])

  // #387: the bin fetched once on entry and never again — a trash or restore
  // while resident went stale, and concurrent-device trashes never appeared.
  // Re-issue the RPC on window/tab focus while resident. The fetch itself
  // gates on configured + signed-in, so this never spams an anon RPC.
  useEffect(() => {
    if (view !== 'trash') return
    const refetch = () => { void fetchTrashedTrips() }
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchTrashedTrips() }
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refetch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [view])

  // ---- Search / filter / sort (local view state — no URL sync needed on a
  // private page, unlike Explore's shareable links) ----
  const [q, setQ] = useState('')
  const [style, setStyle] = useState<'all' | Trip['travelStyle']>('all')
  const [when, setWhen] = useState<WhenKey>('all')
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  // MR3. The chosen filter survives a reload through the generic string prefs
  // in lib/uiPrefs. A stored value that names no real filter reads as 'all'.
  const [status, setStatus] = useState<StatusBucket>(() => {
    const saved = loadPref(STATUS_PREF, 'all')
    return isStatusBucket(saved) ? saved : 'all'
  })
  function pickStatus(v: StatusBucket) {
    setStatus(v)
    savePref(STATUS_PREF, v)
  }

  // MR4. Grid or list, remembered through the same generic string prefs the
  // status tab uses, so the two view choices never fight over storage. Named
  // `layout` because `view` is already the trips/trash switch above.
  const [layout, setLayout] = useState<ViewMode>(() => {
    const saved = loadPref(VIEW_PREF, 'grid')
    return isViewMode(saved) ? saved : 'grid'
  })
  function pickLayout(v: ViewMode) {
    setLayout(v)
    savePref(VIEW_PREF, v)
  }

  // MR6/#648 reads one clock for the whole page, so every card agrees on
  // "today" — and the page moves to the next day at local midnight, or when it
  // comes back into focus, instead of freezing on its mount date.
  const today = useToday()

  const { trips, statusCounts } = useMemo(() => {
    const mine = tripsForUser(meId)
    const needle = q.trim().toLowerCase()
    const filtered = mine.filter(t => {
      if (style !== 'all' && t.travelStyle !== style) return false
      if (when !== 'all' && whenBucket(t, today) !== when) return false
      if (!needle) return true
      const hay = [
        t.name, t.startLocation, ...t.destinations,
        ...(t.days ?? []).flatMap(d => d.stops.map(s => s.title)),
      ].join(' ').toLowerCase()
      return hay.includes(needle)
    })
    // Counts come from everything EXCEPT the status filter, so a tab says what
    // clicking it would show. Counting the already-filtered list instead makes
    // every tab but the active one read 0.
    const counts = new Map<StatusBucket, number>(STATUS_FILTERS.map(f => [f.id, 0]))
    for (const t of filtered) counts.set(statusBucket(t), (counts.get(statusBucket(t)) ?? 0) + 1)
    counts.set('all', filtered.length)
    const shown = filtered.filter(t => status === 'all' || statusBucket(t) === status)
    const budgetOf = (t: Trip) => computeTotals(t).costPerPersonInr
    shown.sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name)
        case 'budget-asc': return budgetOf(a) - budgetOf(b)
        case 'budget-desc': return budgetOf(b) - budgetOf(a)
        case 'length-desc': return b.days.length - a.days.length
        default: return b.updatedAt - a.updatedAt
      }
    })
    return { trips: shown, statusCounts: counts }
  }, [allTrips, meId, q, style, when, sortKey, status, today])

  // style chips carry counts of the *unfiltered-by-style* set so they stay
  // stable while toggling (same behavior as Explore's style chips).
  const styleCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tripsForUser(meId)) m.set(t.travelStyle, (m.get(t.travelStyle) ?? 0) + 1)
    return m
  }, [allTrips, meId])

  const hasFilters = q !== '' || style !== 'all' || when !== 'all' || sortKey !== 'recent' || status !== 'all'

  // Featured trip (Variant A hierarchy): pick the closest upcoming departure
  // from the user's trips, or fall back to the most recently updated trip.
  const featuredTrip = useMemo(() => {
    return selectFeaturedTrip(tripsForUser(meId), today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrips, meId, today])

  // The collection excludes the featured trip when no filters are active,
  // matching Explore's pattern so the lead trip is not duplicated in the shelf.
  const displayTrips = useMemo(() => {
    if (hasFilters || !featuredTrip) return trips
    return trips.filter(t => t.id !== featuredTrip.id)
  }, [trips, hasFilters, featuredTrip])

  // #385: ONE reset for both "Clear filters" buttons. The toolbar ghost reset
  // all four fields while the empty-state action reset three and left
  // `sortKey`, so a sort-only empty was unfixable by its own button. The
  // toolbar's set is the superset — adopt it once, call it twice.
  function clearFilters() {
    setQ('')
    setStyle('all')
    setWhen('all')
    setSortKey('recent')
    pickStatus('all')
  }

  // P4 - the unfinished trip shows up where people look for their trips. It is
  // not a trip yet, so it is not a row among them: one card, above the grid.
  const draft = useMemo(() => {
    if (!createFunnelOn('drafts')) return null
    const d = loadDraft()
    return draftIsWorthKeeping(d) ? d : null
  }, [])
  const draftReady = useMemo(() => (draft ? readinessFromDraft(draft.form, draft.dests.length) : null), [draft])

  function confirmDelete() {
    if (!pendingDelete) return
    const doomed = pendingDelete
    trashTrip(doomed)
    undoToast(`Moved “${doomed.name}” to trash`, () => {
      restoreTrashedTrip(doomed)
      toast(`Restored “${doomed.name}”`)
    })
  }

  return (
    <div className="container trips-page page-enter">
      <EditorialPhoto src={MY_TRIPS_BANNER} className="trips-page-banner">
        <header className="trips-page-title">
          <h1>My trips</h1>
          <p>Everything you’re planning or collaborating on.</p>
        </header>
      </EditorialPhoto>
      <div className="trips-controls trips-toolbar">
        <input className="input trips-search" placeholder="Search all your trips, places or stops…"
          aria-label="Search your trips" value={q} onChange={e => setQ(e.target.value)} />
        <Select value={style} onChange={v => setStyle(v as 'all' | Trip['travelStyle'])} aria-label="Travel style"
          options={[
            { value: 'all', label: 'All styles' },
            ...TRAVEL_STYLES.filter(s => styleCounts.get(s)).map(s => ({ value: s, label: `${cap(s)} (${styleCounts.get(s)})` })),
          ]} />
        <Select value={when} onChange={v => setWhen(v as WhenKey)} aria-label="When"
          options={[
            { value: 'all', label: 'Any time' },
            { value: 'upcoming', label: 'Upcoming & live' },
            { value: 'past', label: 'Past trips' },
            { value: 'draft', label: 'Drafts' },
          ]} />
        <Select value={sortKey} onChange={v => setSortKey(v as SortKey)} aria-label="Sort by"
          options={[
            { value: 'recent', label: 'Recently edited' },
            { value: 'name', label: 'Name A–Z' },
            { value: 'length-desc', label: 'Longest first' },
            { value: 'budget-asc', label: 'Budget: low → high' },
            { value: 'budget-desc', label: 'Budget: high → low' },
          ]} />
        <button className="btn btn-primary trips-create" onClick={() => onNavigate('/new')}>
          <InlineIcon icon={Plus} size={15} gap={4} />Plan a new trip
        </button>
        <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ visibility: hasFilters ? 'visible' : 'hidden' }} aria-hidden={!hasFilters} tabIndex={hasFilters ? 0 : -1}>Clear filters</button>
      </div>
      <div className="trips-head-actions trips-secondary-actions" aria-label="More trip actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('/purchases')}>
          <InlineIcon icon={ShoppingBag} size={14} gap={4} />My purchases
        </button>
        <button className={`btn btn-ghost btn-sm${view === 'trash' ? ' on-teal' : ''}`} aria-pressed={view === 'trash'}
          onClick={() => setView(v => v === 'trash' ? 'trips' : 'trash')}><InlineIcon icon={Trash2} size={14} gap={4} />Trash</button>
        <ImportTripButton ownerId={meId} onNavigate={onNavigate} />
        <button className="btn btn-ghost btn-sm" onClick={addDemoTrips} aria-label="Load demo trips"
          title="Adds 3 sample trips — Kerala, Goa & Rajasthan — to your account" disabled={tripsRead === 'failed'}>
          <InlineIcon icon={Rocket} size={14} gap={4} />Load demo trips
        </button>
      </div>

      {view === 'trash' && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="row-between">
            <h3 style={{ margin: 0 }}>Trash {trashed.length > 0 && <span className="small muted">({trashed.length})</span>}</h3>
            <span className="small muted">Deleted trips stay for 30 days, then they’re gone for good.</span>
          </div>
          <hr className="divider" />
          {trashRead !== 'ready' ? (
            // #387: a failed bin fetch used to render the genuine-empty copy.
            // The failed branch is checked first, and its Retry re-issues the
            // RPC rather than re-rendering the same empty bin.
            trashRead === 'reading' ? (
              <div className="loading-block"><div className="spinner" />{emptyCopyFor(trashRead, 'trash', retryTrash).title}</div>
            ) : (
              <EmptyState icon={<Trash2 size={38} aria-hidden />} title={emptyCopyFor(trashRead, 'trash', retryTrash).title}
                body={emptyCopyFor(trashRead, 'trash', retryTrash).body}
                action={<button className="btn btn-primary" onClick={retryTrash}>Try again</button>} />
            )
          ) : trashed.length === 0 ? (
            <EmptyState icon={<Trash2 size={38} aria-hidden />} title="Trash is empty"
              body="Trips you delete will show up here so you can restore them within 30 days." />
          ) : (
            trashed.map(t => (
              <div key={t.id} className="row-between trash-row">
                <div>
                  <b>{t.name}</b>
                  <div className="small muted">{t.startLocation} → {t.destinations[t.destinations.length - 1] ?? t.startLocation} · {t.days.length} days</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-outline" onClick={() => { void restoreTrashedTripById(t.id).then(ok => { if (ok) toast(`Restored “${t.name}”`) }) }}>Restore</button>
                  <button className="btn btn-danger" onClick={() => setPendingPurge(t)}>Delete forever</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {view !== 'trash' && draft && (
        <div className="draft-card" role="status">
          <span className="draft-card-thumb" aria-hidden>&#128221;</span>
          <div className="draft-card-body">
            <b>{String((draft.form as Record<string, unknown>).name || 'Untitled trip')}</b>
            <span className="draft-card-meta">
              {draftReady ? `${draftReady.pct}% ready` : 'saved'}
              {draft.dests.length > 0 ? ` - ${draft.dests.length} stop${draft.dests.length === 1 ? '' : 's'}` : ''}
              {' - saved '}{draftAgeLabel(draft.savedAt)}
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('/new')}>Finish planning</button>
        </div>
      )}

      {view !== 'trash' && (tripsRead !== 'ready' ? (
        // #383: a failed trips read used to render the genuine-empty copy with
        // no error branch. The failed branch precedes loading precedes empty,
        // and its Retry re-issues the hydrate rather than re-rendering.
        tripsRead === 'reading' ? (
          <div className="loading-block"><div className="spinner" />{emptyCopyFor(tripsRead, 'trips', retryTrips).title}</div>
        ) : (
          <EmptyState
            icon={<Compass size={38} aria-hidden />}
            title={emptyCopyFor(tripsRead, 'trips', retryTrips).title}
            body={emptyCopyFor(tripsRead, 'trips', retryTrips).body}
            action={<button className="btn btn-primary" onClick={retryTrips}>Try again</button>}
          />
        )
      ) : trips.length === 0 && !hasFilters ? (
        <EmptyState
          icon={<Compass size={38} aria-hidden />}
          title="No trips yet"
          body="Start from scratch with dates and budget, or copy a public itinerary from Explore."
          action={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={() => onNavigate('/new')}>Plan your first trip</button>
              <button className="btn btn-outline" onClick={addDemoTrips}><InlineIcon icon={Rocket} size={15} gap={5} />Load demo trips</button>
              <button className="btn btn-outline" onClick={() => onNavigate('/explore')}>Explore itineraries</button>
            </div>
          }
        />
      ) : (
        <>
          {/* Variant A: Featured trip hero when viewing all trips without active search */}
          {!hasFilters && featuredTrip && (
            <FeaturedTripLead
              trip={featuredTrip}
              users={users}
              meId={meId}
              today={today}
              onNavigate={onNavigate}
            />
          )}

          <p className="sr-only" role="status">{trips.length} {trips.length === 1 ? 'trip matches' : 'trips match'}</p>

          {/* MR3 — five filters, counted from the unfiltered-by-status set.
              MR4 — the Grid/List control shares THIS row, right-aligned, the way
              the mockup's viewbar pairs its status tabs with its view segment.
              It used to close the wrapping toolbar above, which parked it alone
              on a line of its own at every width, away from the tabs it belongs
              to and from the grid it arranges. */}
          <div className="trips-viewbar">
            <div className="explore-chips trips-status-tabs" role="group" aria-label="Trip status">
              {STATUS_FILTERS.map(f => (
                <button key={f.id} className={`chip clickable-chip ${status === f.id ? 'on-teal' : ''}`}
                  aria-pressed={status === f.id} onClick={() => pickStatus(f.id)}>
                  {f.label} <span className="chip-count">{statusCounts.get(f.id) ?? 0}</span>
                </button>
              ))}
            </div>
            {/* PillNav, not a plain pair of buttons: its glider slides between
                the two segments (MOTION-TOKENS' toggle-glider pattern), so the
                switch reads as one movement instead of two backgrounds
                swapping. Labelled, so the current choice is readable without
                pressing it first. */}
            <PillNav activeKey={layout} className="view-toggle trips-seg" role="group" aria-label="Card layout">
              <button className={`view-toggle-btn${layout === 'grid' ? ' on-teal' : ''}`} data-pill-key="grid"
                aria-pressed={layout === 'grid'} onClick={() => pickLayout('grid')}>
                <LayoutGrid size={15} aria-hidden />Grid</button>
              <button className={`view-toggle-btn${layout === 'list' ? ' on-teal' : ''}`} data-pill-key="list"
                aria-pressed={layout === 'list'} onClick={() => pickLayout('list')}>
                <Rows3 size={15} aria-hidden />List</button>
            </PillNav>
          </div>

          {!hasFilters && featuredTrip && displayTrips.length > 0 && (
            <div className="row-between" style={{ margin: '14px 0 10px', alignItems: 'baseline' }}>
              <h3 className="trip-other-heading">Your other trips</h3>
              <span className="trip-other-count">{displayTrips.length} trip{displayTrips.length === 1 ? '' : 's'}</span>
            </div>
          )}

          {trips.length === 0 ? (
            <EmptyState
              icon={<Compass size={38} aria-hidden />}
              title="No trips match those filters"
              body="Try a different search or clear the filters to see all your trips."
              action={<button className="btn btn-outline" onClick={clearFilters}>Clear filters</button>}
            />
          ) : (
            /* MR4's other half: the grid is keyed by the layout, so switching
               remounts the cards and replays their `.trip-enter` cascade.
               Without the key React reuses the same nodes and the whole grid
               re-lays out between two frames — 369px-wide cards becoming
               1140px-wide ones with nothing in between — which is the snap this
               key exists to remove. The remount is cheap: the covers resolve
               from the thumb cache. */
            <div key={layout} className={`explore-grid${layout === 'list' ? ' as-list' : ''}`}>
              {displayTrips.map((t, i) => {
              const totals = computeTotals(t)
              const others = (t.members ?? []).filter(m => m.userId !== meId)
              const departure = departureLabel(t, today)
              // MR1/MR2: the card's own two answers — what to do next, and how
              // much of the plan exists. Both read one module, so a card that
              // is 100% planned yet still owes a booking says so on the same
              // row instead of looking finished.
              const step = nextTripStep(t)
              const plan = plannedDayRatio(t)
              const bucket = statusBucket(t)
              return (
                <div key={t.id} className="card itin-card trip-enter" style={{ animationDelay: `calc(var(--stagger-step) * ${Math.min(i, 8)})` }}>
                  {/* The cover hangs off the CARD, not off the body's link. A list
                      row runs the cover the card's full height, and a child cannot
                      leave its parent's grid area - inside the link it could only
                      ever be as tall as the body. Its cost is a second route to the
                      same trip, so it stays out of the tab order and out of the
                      accessibility tree; the body link below carries the name. */}
                  <a className="trip-card-cover" aria-hidden="true" tabIndex={-1} {...appLink(`/trip/${t.id}`)}>
                    {/* Card style ported from the mockup's `.tcard`: the cover is
                        its own clipped box, so the hover zooms the photo without
                        moving the card, and the status pill overlays it exactly
                        where the mockup puts one. */}
                    <div className="trip-card-media">
                      <CoverThumb
                        variant="short"
                        trip={t}
                        explicitUrl={t.coverImageUrl}
                        emoji={t.coverEmoji}
                      />
                      <span className={`chip trip-card-status ${BUCKET_TONE[bucket]}`}>
                        {BUCKET_LABEL.get(bucket)}
                      </span>
                    </div>
                  </a>
                  <a className="trip-card-hit" {...appLink(`/trip/${t.id}`)}>
                    <div className="itin-body">
                      <div className="trip-card-head">
                        <h2 className="card-title">{t.name}</h2>
                        <p className="trip-card-route">
                          {t.startLocation} → {t.destinations[t.destinations.length - 1] ?? t.startLocation}
                        </p>
                      </div>
                      {/* The mockup's body order: the meta row first, then the
                          tags, then the departure line, then the progress
                          meter. The day count left the route line for the meta
                          row, where the mockup keeps it. */}
                      <ul className="trip-card-meta num">
                        <li><MetaIcon icon={ Calendar } tone="time" />{t.days.length} day{t.days.length === 1 ? '' : 's'}</li>
                        <li><MetaIcon icon={ Wallet } tone="money" />~{formatInrShort(totals.costPerPersonInr)}/person</li>
                        <li><MetaIcon icon={ Clock } tone="time" />{Math.round(totals.totalTravelMinutes / 60)}h travel</li>
                      </ul>
                      <div className="trip-card-tags">
                        <Chip tone="teal">{cap(t.travelStyle)}</Chip>
                        {(t.members ?? []).length > 1 && <Chip tone="info">{(t.members ?? []).length} planners</Chip>}
                      </div>
                      {/* MR6 — only on upcoming trips; the derivation returns null
                          for a past or undated one, so nothing prints. */}
                      {departure && <p className="trip-card-departs num">{departure}</p>}
                      {/* MR2 — the same meter the day header draws, so the two
                          read as one measure in two places. The label names the
                          measure: activities, not route points (#647). */}
                      <div className="trip-plan">
                        <div className="trip-plan-bar" role="progressbar"
                          aria-valuenow={plan.pct} aria-valuemin={0} aria-valuemax={100}
                          aria-label={plan.total === 0 ? 'No days added yet' : `Planning progress: ${plan.planned} of ${plan.total} days with activities`}>
                          <span className="trip-plan-fill" style={{ width: `${plan.pct}%` }} />
                        </div>
                        <span className="trip-plan-text num">
                          {plan.total === 0 ? 'No days added yet' : `${plan.planned} of ${plan.total} days with activities`}
                        </span>
                      </div>
                    </div>
                  </a>
                  {/* The mockup's card foot: one band under a hairline, the crew
                      on the left and the card's action on the right. #645 still
                      holds — the task row is its own link, a SIBLING of the card
                      link, because a link must not hold a second link. The card
                      opens the trip; this row opens the day and the stop its own
                      label names. A finished trip has nothing left to open, so it
                      stays a plain row with no chevron. */}
                  <div className="trip-card-foot">
                    <div className="member-stack">
                      {others.slice(0, 3).map(m => <Avatar key={m.userId} user={userOf(users, m.userId)} />)}
                      {others.length > 3 && <span className="small muted num">+{others.length - 3}</span>}
                      {!others.length && <span className="small muted">Just you so far</span>}
                    </div>
                    {step.kind === 'done' ? (
                      <div className="trip-next trip-task-row is-done">
                        <span className="trip-next-label">{step.label}</span>
                      </div>
                    ) : (
                      <a className="trip-next trip-task-row" {...appLink(nextStepRoute(t, step))}>
                        <span className="trip-next-label">{step.label}</span>
                        <ChevronRight className="trip-next-chevron" size={15} aria-hidden />
                      </a>
                    )}
                    <div className="trip-card-actions">
                      {canEdit(roleOf(t, meId)) && !hasSavedCoverPhoto(t) && (
                        <a className="btn btn-outline btn-sm" {...appLink(nextStepRoute(t, { kind: 'add-cover', label: 'Add a cover photo' }))}>
                          Add cover photo
                        </a>
                      )}
                      <button className="icon-btn" aria-label={`Delete ${t.name}`} onClick={() => setPendingDelete(t)}><Trash2 size={14} aria-hidden /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          )}
          {/* Every trip the viewer is on, not the filtered list: a saved item
              belongs to the shelf whatever the toolbar is showing. */}
          <SavedShelf trips={tripsForUser(meId)} />
        </>
      ))}

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete “${pendingDelete?.name ?? ''}”?`}
        body="This removes the trip from your workspace. You’ll get a short window to undo from the toast. If it was published, its public page stops selling and stays readable for you and everyone who already unlocked it."
        confirmLabel="Delete trip"
        danger
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={!!pendingPurge}
        title={`Delete “${pendingPurge?.name ?? ''}” forever?`}
        body="This is permanent: the trip, its votes, decisions and history are destroyed and cannot be recovered or undone. A trip that was ever published is never destroyed here — its publication and its buyers’ records stay with it, and the public page keeps working for everyone who unlocked it."
        confirmLabel="Delete forever"
        danger
        onConfirm={() => {
          const doomed = pendingPurge
          if (!doomed) return
          void permanentlyDeleteTrip(doomed.id).then(ok => { if (ok) toast(`“${doomed.name}” is gone for good`) })
        }}
        onClose={() => setPendingPurge(null)}
      />
    </div>
  )
}

function userOf(users: User[], id: string): User | undefined {
  return users.find(u => u.id === id)
}

function FeaturedTripLead({
  trip,
  users,
  meId,
  today,
  onNavigate,
}: {
  trip: Trip
  users: User[]
  meId: string | null
  today: Date
  onNavigate: (r: string) => void
}) {
  const step = nextTripStep(trip)
  const plan = plannedDayRatio(trip)
  const totals = computeTotals(trip)
  const presentation = featuredTripPresentation(trip, today)
  const others = (trip.members ?? []).filter(m => m.userId !== meId)

  // Candidate images for cover: explicit cover URL -> Wikipedia lead image -> fallback hero
  const candidates = useMemo(() => pickTripQueryCandidates(trip), [trip])
  const autoThumb = useDestinationCover(candidates)
  const coverUrl = sizedCoverUrl(trip.coverImageUrl ?? '') || editorialRouteCover(trip.destinations) || autoThumb || undefined

  // Format date range nicely
  const dateRangeStr = useMemo(() => {
    const startMs = localMidnightMs(trip.startDate)
    const endMs = localMidnightMs(trip.endDate)
    if (startMs === null || endMs === null || endMs < startMs) return 'Dates not set'
    const start = new Date(startMs)
    const end = new Date(endMs)
    const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
    return `${start.toLocaleDateString('en-IN', opt)} – ${end.toLocaleDateString('en-IN', { ...opt, year: 'numeric' })}`
  }, [trip.startDate, trip.endDate])

  // Destination route string
  const routeStr = trip.destinations.length > 0
    ? `${trip.startLocation} → ${trip.destinations.join(' → ')}`
    : trip.startLocation

  // Primary action button target. One builder, shared with the card's task row
  // (#645), so the featured button and a list row cannot disagree about where a
  // step lives.
  const targetRoute = nextStepRoute(trip, step)

  return (
    <section className="trip-featured" aria-labelledby="featured-trip-heading">
      <div className="trip-featured-head">
        <h2 id="featured-trip-heading">{presentation.heading}</h2>
        <span className="trip-featured-subheading">{presentation.subheading}</span>
      </div>
      <article className="trip-featured-card">
        <EditorialPhoto src={coverUrl} className="trip-featured-photo">
          <div className="trip-featured-photo-top">
            <span className="trip-featured-photo-badge">{presentation.badge}</span>
            <span className="trip-featured-photo-date">{dateRangeStr}</span>
          </div>
        </EditorialPhoto>

        <div className="trip-featured-body">
          <div>
            <h3 className="trip-featured-title">{trip.name}</h3>
            <span className="trip-featured-kicker">
              {trip.destinations[0] ?? trip.startLocation} · {presentation.status}
            </span>
            <p className="trip-featured-route">{routeStr}</p>

            <div className="trip-featured-meta">
              <span><MetaIcon icon={Calendar} tone="time" />{dateRangeStr} · {trip.days.length} days</span>
              <span><Users size={12} aria-hidden />{(trip.members ?? []).length} traveller{(trip.members ?? []).length === 1 ? '' : 's'}</span>
              <span><MetaIcon icon={MapPin} tone="place" />{trip.destinations.length + 1} places</span>
              <span><MetaIcon icon={Wallet} tone="money" />~{formatInrShort(totals.costPerPersonInr)}/person</span>
            </div>

            <div className="trip-featured-progress">
              <div className="trip-featured-progress-head">
                <span>Days with activities</span>
                <strong>{plan.total === 0 ? 'No days planned' : `${plan.planned}/${plan.total} days`}</strong>
              </div>
              <div
                className="trip-featured-progress-track"
                role="progressbar"
                aria-label={`${plan.planned} of ${plan.total} days have activities`}
                aria-valuenow={plan.pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="trip-featured-progress-fill" style={{ width: `${plan.pct}%` }} />
              </div>
              <p className="trip-featured-progress-note">
                {plan.pct === 100 ? 'All days have planned stops.' : `${100 - plan.pct}% remaining to schedule.`} This is activity coverage, not readiness to travel.
              </p>
            </div>

            <div className="trip-featured-task">
              <div className="trip-featured-task-icon">
                {step.kind === 'add-dates' ? <Clock size={16} aria-hidden /> : <MapPin size={16} aria-hidden />}
              </div>
              <div>
                <span className="trip-featured-task-meta">
                  Next step{step.dayIndex !== undefined ? ` · Day ${step.dayIndex + 1}` : ''}
                </span>
                <strong className="trip-featured-task-title">{step.label}</strong>
                <p className="trip-featured-task-desc">
                  {step.kind === 'done'
                    ? 'All scheduled stops are confirmed. Check the full plan before you travel.'
                    : step.kind === 'book-stop'
                    ? 'Reserve this stop or slot before you leave.'
                    : step.kind === 'confirm-stop'
                    ? 'Check suggestions and confirm this stop.'
                    : step.kind === 'add-dates'
                    ? 'Choose travel dates to unlock itinerary day planning.'
                    : step.kind === 'add-cover'
                    ? 'Choose and save a cover photo in trip settings.'
                    : 'Add planned activities and sights for this day.'}
                </p>
              </div>
            </div>
          </div>

          <div className="trip-featured-footer">
            <div className="trip-featured-crew">
              <div className="trip-featured-crew-stack" aria-hidden="true">
                {others.slice(0, 3).map(m => (
                  <Avatar key={m.userId} user={userOf(users, m.userId)} />
                ))}
              </div>
              <span>
                {others.length > 0 ? `${others.length + 1} travel group members` : 'Just you planning'}
              </span>
            </div>

            <div className="trip-featured-btn-group">
              {canEdit(roleOf(trip, meId)) && !hasSavedCoverPhoto(trip) && (
                <a className="btn btn-outline btn-sm" {...appLink(nextStepRoute(trip, { kind: 'add-cover', label: 'Add a cover photo' }))}>
                  Add cover photo
                </a>
              )}
              <button
                className="btn btn-primary"
                onClick={() => onNavigate(targetRoute)}
              >
                {step.label} <ArrowRight size={14} aria-hidden />
              </button>
              <button
                className="trip-featured-overview-btn"
                onClick={() => onNavigate(`/trip/${trip.id}`)}
              >
                Trip overview <ChevronRight size={14} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  )
}
