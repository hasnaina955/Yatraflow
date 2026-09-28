// ============ Trip workspace — trip settings form (Settings tab) ============
// V2 rework (the map-pass method applied to Settings): the form asks four
// questions instead of stacking twelve bench blocks. A navy hero band shows
// the trip at a glance (cover, name, road, four live figures); three numbered
// question cards follow — the road & days, the party & money, the machine —
// each closing with a settled-facts row of its own answers. The live bill
// keeps its receipt language and gains a neighbour beneath it: the engine's
// read (health score, band, the day-grid fact, the top warning), recomputed
// from the draft on every keystroke.
//
// Everything control-shaped is unchanged from the bench-fidelity rebuild:
// the same crew chips, dials, mode grid, popups, the same parity guarantees
// (#213) and the same persistence semantics. What changed is the shape of the
// page around them.
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import {
  Bike, Bus, Car, CarTaxiFront, ChevronDown, ChevronUp,
  KeyRound, MapPin, Plane, Shuffle, Sparkles, TrainFront, TriangleAlert, X,
} from 'lucide-react'
import type { Trip, LatLngPoint, TransportMode } from '../../data/types'
import { TRANSPORT_MODES, TRAVEL_STYLES, STAY_STYLES } from '../../data/types'
import { updateTrip, reconcileDays } from '../../store/store'
import { FUEL_PRICE_INR_PER_L, DEFAULT_FUEL_ECONOMY_KML, MODE_SPEED, computeHealth, formatInr, isFuelEconomyMode, parseFuelEconomyKmL, isImplausibleFuelEconomy, parseFuelPricePerL } from '../../lib/engine'
import { cap } from '../../lib/labels'
import { isSelfDrivenMode } from '../../lib/ridePlan'
import { CREW_CHIPS, CREW_MAX, CREW_MIN, clampCrew } from '../../lib/crew'
import { defaultVehicleProfile } from '../../lib/vehicleProfile'
import { STAY_RATE_PER_NIGHT } from '../../lib/rates'
import { Field, RangeDial, StickyFormBar, toast } from '../../components/ui'
import { Select } from '../../components/Select'
import { DateRangeCalendar } from '../../components/DateRangeCalendar'
import { PillNav } from '../../components/PillNav'
import { LocationInput } from '../../components/LocationInput'
import { CoverImagePicker } from '../../components/CoverImagePicker'

/** The allowance the "drive after dinner" toggle turns on when a trip has none
 *  (#122's dhaba case: dinner at X, two more hours to Y). */
const DEFAULT_DRIVE_AFTER_DINNER_MIN = 120

/** Icon per transport mode — mirrors the bench's mode tiles. */
const MODE_ICON: Record<TransportMode, ReactNode> = {
  car: <Car size={15} />, rental: <KeyRound size={15} />, motorcycle: <Bike size={15} />, train: <TrainFront size={15} />,
  bus: <Bus size={15} />, flight: <Plane size={15} />, taxi: <CarTaxiFront size={15} />,
  mixed: <Shuffle size={15} />,
}

/** Health band → the chip tone the Overview tab already uses for it. */
const HEALTH_TONE = { Comfortable: 'ok', Manageable: 'teal', Tight: 'saffron', Unrealistic: 'danger' } as const

export function TripSettingsForm({ trip, editable }: { trip: Trip; editable: boolean }) {
  const [f, setF] = useState({
    name: trip.name, startLocation: trip.startLocation,
    destinations: [...trip.destinations],
    startDate: trip.startDate, endDate: trip.endDate,
    travellers: trip.travellers, budget: trip.budgetPerPersonInr,
    transportMode: trip.transportMode, travelStyle: trip.travelStyle,
    stayStyle: (trip.stayStyle ?? (trip.travelStyle === 'budget' || trip.travelStyle === 'luxury' ? trip.travelStyle : 'comfort')) as 'budget' | 'comfort' | 'luxury',
    fuelEconomy: trip.fuelEconomyKmL?.toString() ?? '',
    fuelPrice: trip.fuelPricePerL?.toString() ?? '',
    roundTrip: trip.roundTrip ?? true,
    // #189 / 20260915_trip_party_prefs.sql: the persisted profile wins; a
    // motorcycle or rental trip no longer opens the form looking like a car.
    vehicleType: trip.vehicleProfile?.vehicleType
      ?? defaultVehicleProfile(trip.transportMode).vehicleType,
    fuelType: trip.vehicleProfile?.fuelType
      ?? defaultVehicleProfile(trip.transportMode).fuelType,
    capacity: trip.vehicleProfile?.capacity?.toString() ?? '',
    vehicleEconomy: trip.vehicleProfile?.economy?.toString() ?? '',
    driverCount: trip.driverCount,
    hasVulnerable: trip.hasVulnerable,
    driveAfterDinner: (trip.driveAfterDinnerMin ?? 0) > 0,
  })
  const [dateErr, setDateErr] = useState<string | null>(null)
  const [startCoords, setStartCoords] = useState<LatLngPoint | null>(trip.startLocationCoords ?? null)
  const [destCoords, setDestCoords] = useState<(LatLngPoint | null)[]>(trip.destinationCoords ?? [])
  const [destInput, setDestInput] = useState('')
  const [identityOpen, setIdentityOpen] = useState(false)

  function addDest(name: string, coords: LatLngPoint | null) {
    const clean = name.trim()
    if (!clean) return
    if (f.destinations.some(d => d.toLowerCase() === clean.toLowerCase())) {
      toast('Already on the route.', 'err'); return
    }
    setF(x => ({ ...x, destinations: [...x.destinations, clean] }))
    setDestCoords(list => [...list, coords])
    setDestInput('')
  }

  function moveDest(i: number, dir: -1 | 1) {
    setF(x => {
      const list = [...x.destinations]
      const j = i + dir
      if (j < 0 || j >= list.length) return x
      ;[list[i], list[j]] = [list[j], list[i]]
      const dc = [...destCoords]; [dc[i], dc[j]] = [dc[j], dc[i]]; setDestCoords(dc)
      return { ...x, destinations: list }
    })
  }

  // ---- derived values the cards, the bill and the engine's read use ----
  const travellers = clampCrew(f.travellers)
  const clampedBudget = Math.min(300000, Math.max(0, f.budget))
  const fuelMode = isFuelEconomyMode(f.transportMode)
  const selfDriven = isSelfDrivenMode(f.transportMode)
  const ecoNum = parseFuelEconomyKmL(f.fuelEconomy)
  const priceNum = parseFuelPricePerL(f.fuelPrice)
  const ecoSet = typeof ecoNum === 'number' && Number.isFinite(ecoNum)
  const priceSet = typeof priceNum === 'number' && Number.isFinite(priceNum)
  const ecoVal = ecoSet ? ecoNum : DEFAULT_FUEL_ECONOMY_KML
  const priceVal = priceSet ? priceNum : FUEL_PRICE_INR_PER_L
  const priceIgnored = priceSet && !ecoSet
  const road = [f.startLocation, ...f.destinations].filter(Boolean).join(' → ')

  // The day grid follows the date range — show what the picker will do to it.
  const dayDelta = useMemo(() => {
    const s = new Date(`${f.startDate}T00:00:00`), e = new Date(`${f.endDate}T00:00:00`)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null
    const target = Math.round((e.getTime() - s.getTime()) / 86400000) + 1
    return target - trip.days.length
  }, [f.startDate, f.endDate, trip.days.length])
  const dayCount = dayDelta === null ? trip.days.length : trip.days.length + dayDelta
  const daysWithStops = trip.days.filter(d => d.stops.some(s => s.status !== 'rejected')).length
  const dayDeltaLabel = dayDelta === null
    ? 'Pick both dates to preview the day grid'
    : dayDelta === 0 ? 'Day count unchanged'
    : dayDelta > 0 ? `Adds ${dayDelta} empty day${dayDelta !== 1 ? 's' : ''} at the end`
    : `Drops ${-dayDelta} empty trailing day${dayDelta !== -1 ? 's' : ''} (days with stops are kept)`

  // The early clamp: the SAME rule the save runs (store's reconcileDays on the
  // draft dates), surfaced while the dates are chosen instead of as a toast
  // after a refused click. The message stays the store's own words.
  const clampError = useMemo(() => {
    if (dayDelta === null || dayDelta >= 0) return null
    const protectedIdx = new Set(trip.fixedCommitments.map(c => c.dayIndex))
    const rec = reconcileDays(trip.days, f.startDate, f.endDate, protectedIdx)
    return rec.error ?? null
  }, [dayDelta, trip.days, trip.fixedCommitments, f.startDate, f.endDate])

  // The engine's read under the bill: health over the trip AS DRAFTED (the
  // draft party/mode/dates ride on a shallow trip copy; days follow only after
  // save — the meter says what the grid will become, which is the honest read).
  const engineRead = useMemo(() => {
    const drafted: Trip = {
      ...trip,
      travellers,
      budgetPerPersonInr: clampedBudget,
      transportMode: f.transportMode,
      travelStyle: f.travelStyle,
      startDate: f.startDate, endDate: f.endDate,
    }
    return computeHealth(drafted)
  }, [trip, travellers, clampedBudget, f.transportMode, f.travelStyle, f.startDate, f.endDate])
  const topWarning = engineRead.warnings[0]

  return (
    <div className="ts-form tsx-form">
      {/* ---------- the hero: the trip at a glance ---------- */}
      <section className="tsx-hero" aria-label="This trip at a glance">
        <div className="tsx-hero-top">
          <span className="tsx-hero-cover" aria-hidden="true" />
          <div className="tsx-hero-id">
            <h2 className="tsx-hero-name">{f.name || 'Untitled trip'}</h2>
            <p className="tsx-hero-sub">
              <b>{road}</b>
              {' '}&middot; {f.startDate && f.endDate ? `${f.startDate} → ${f.endDate}` : 'dates not set'} &middot; {travellers} travelling
            </p>
          </div>
          {editable && (
            <button type="button" className="tsx-hero-edit" aria-expanded={identityOpen} onClick={() => setIdentityOpen(o => !o)}>
              <Sparkles size={13} aria-hidden />Rename &amp; cover
            </button>
          )}
        </div>
        <div className="tsx-hero-stats">
          <div className="tsx-stat"><span className="tsx-stat-k">Group budget</span><span className="tsx-stat-v">{formatInr(clampedBudget * travellers)}<small>{formatInr(clampedBudget)} / head</small></span></div>
          <div className="tsx-stat"><span className="tsx-stat-k">Days</span><span className="tsx-stat-v">{dayCount}<small>{daysWithStops} with stops</small></span></div>
          <div className="tsx-stat"><span className="tsx-stat-k">Machine</span><span className="tsx-stat-v">{cap(f.transportMode)}<small>{MODE_SPEED[f.transportMode] ?? 40} km/h avg</small></span></div>
          <div className="tsx-stat"><span className="tsx-stat-k">Wheel</span><span className="tsx-stat-v">{(f.driverCount ?? 1) === 1 ? '1 driver' : `${f.driverCount} drivers`}<small>{f.hasVulnerable ? 'infants / seniors' : 'everyone adult'}</small></span></div>
        </div>
      </section>

      {editable && identityOpen && (
        <section className="tsx-card tsx-card--identity" aria-label="Trip name and cover">
          <h3 className="tsx-q" style={{ fontSize: 15 }}>Rename &amp; cover</h3>
          <div className="bench-pair">
            <Field label="Trip name">
              <input className="input" disabled={!editable} value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} />
            </Field>
            <Field label="Cover image">
              <CoverImagePicker trip={trip} editable={editable} />
            </Field>
          </div>
          <p className="hint-text">Pick a popular photo of your destination, paste your own image URL, or leave it to the emoji. The cover is what a shared itinerary previews with.</p>
        </section>
      )}

      <div className="tsx-band">
        <div className="tsx-band-main">

          {/* ---------- Q1 · the road & the days ---------- */}
          <section className="tsx-card" aria-label="Where does it go, and for how many days">
            <header className="tsx-head">
              <span className="tsx-no" aria-hidden="true">01</span>
              <h3 className="tsx-q">Where does it go, and for how many days?</h3>
              <span className="tsx-ans">{dayCount} day{dayCount === 1 ? '' : 's'} · {f.destinations.length} stop{f.destinations.length === 1 ? '' : 's'} en route</span>
              <p className="tsx-a">The road is the trip&apos;s spine — every other tab measures along it. Arrows reorder, × removes, search adds. The day grid follows the dates.</p>
            </header>
            <div className="tsx-route" role="group" aria-label="The route">
              <span className="tsx-node tsx-node--start"><MapPin size={13} aria-hidden />{f.startLocation || 'Set a start'}</span>
              {f.destinations.map((d, i) => (
                <Fragment key={`${d}-${i}`}>
                  <span className="tsx-road" aria-hidden="true" />
                  <span className="tsx-node">
                    <span className="tsx-node-ord" aria-hidden="true">{i + 1}</span>{d}
                    {editable && (
                      <span className="tsx-node-tools">
                        <button type="button" aria-label={`Move ${d} earlier`} disabled={i === 0} onClick={() => moveDest(i, -1)}><ChevronUp size={12} aria-hidden /></button>
                        <button type="button" aria-label={`Move ${d} later`} disabled={i === f.destinations.length - 1} onClick={() => moveDest(i, 1)}><ChevronDown size={12} aria-hidden /></button>
                        <button type="button" aria-label={`Remove ${d}`} onClick={() => {
                          setF(x => ({ ...x, destinations: x.destinations.filter((_, j) => j !== i) }))
                          setDestCoords(list => list.filter((_, j) => j !== i))
                        }}><X size={12} aria-hidden /></button>
                      </span>
                    )}
                  </span>
                </Fragment>
              ))}
              <span className="tsx-road" aria-hidden="true" />
            </div>
            <div className="bench-pair">
              <Field label="Starting location" hint="The city the road starts from">
                <LocationInput
                  value={f.startLocation}
                  onChange={v => setF(x => ({ ...x, startLocation: v }))}
                  onPick={p => setStartCoords({ lat: p.latitude, lng: p.longitude })}
                  placeholder="Search a city…"
                  disabled={!editable}
                />
              </Field>
              {editable && (
                <Field label="Add a destination" hint="Search to add - it joins the road in order">
                  <LocationInput
                    value={destInput}
                    onChange={setDestInput}
                    onPick={p => addDest(p.name + (p.admin1 ? `, ${p.admin1}` : ''), { lat: p.latitude, lng: p.longitude })}
                    placeholder={f.destinations.length ? 'Add another destination…' : 'Add your first destination…'}
                  />
                </Field>
              )}
            </div>
            <div className="tsx-when">
              <DateRangeCalendar
                label="Trip dates"
                start={f.startDate} end={f.endDate}
                disabled={!editable}
                error={dateErr ?? undefined}
                hint={dayDeltaLabel}
                onChange={({ startDate, endDate }) => { setF(x => ({ ...x, startDate, endDate })); setDateErr(null) }}
              />
              <div>
                <span className="label" style={{ display: 'block', marginBottom: 6 }}>Day grid</span>
                <div className="tsx-dm-track" role="img" aria-label={`${daysWithStops} of ${dayCount} days carry stops`}>
                  <i className="tsx-dm-fill" style={{ width: `${dayCount ? Math.round((daysWithStops / dayCount) * 100) : 0}%` }} />
                </div>
                <p className="tsx-dm-note"><b>{daysWithStops} of {dayCount}</b> days carry stops{dayDelta && dayDelta > 0 ? ` · ${dayDelta} empty at the tail` : ''}</p>
              </div>
            </div>
            {clampError && (
              <div className="tsx-clamp" role="alert">
                <span className="tsx-clamp-ico"><TriangleAlert size={15} aria-hidden /></span>
                <div className="tsx-clamp-body">
                  <p className="tsx-clamp-t">Shortening would cut a day that carries stops</p>
                  <p className="tsx-clamp-d">{clampError} Move or delete those stops first, or keep the trip at {trip.days.length} days.</p>
                </div>
              </div>
            )}
            <footer className="tsx-settled">
              <span className="tsx-fact"><span className="tsx-fact-k">Road</span><b>{road}</b></span>
              <span className="tsx-fact"><span className="tsx-fact-k">Days</span><b>{dayCount}</b></span>
              <span className="tsx-fact"><span className="tsx-fact-k">Days with stops</span><b>{daysWithStops} of {dayCount}</b></span>
            </footer>
          </section>

          {/* ---------- Q2 · the party & the money ---------- */}
          <section className="tsx-card" aria-label="Who is going, and how do they split the money">
            <header className="tsx-head">
              <span className="tsx-no" aria-hidden="true">02</span>
              <h3 className="tsx-q">Who is going, and how do they split the money?</h3>
              <span className="tsx-ans">{travellers} {travellers === 1 ? 'person' : 'people'} · {formatInr(clampedBudget * travellers)} group</span>
              <p className="tsx-a">Rooms and per-head splits follow the headcount. Budget preference prices the bed; it never touches the road.</p>
            </header>
            <div className="bench-pair">
              <div className="bench-block">
                <div className="bench-block-head"><span className="bench-eyebrow">Travellers</span><span className="bench-block-value">{travellers}</span></div>
                <div className="bench-crew" role="group" aria-label="Number of travellers">
                  {CREW_CHIPS.map(n => (
                    <button key={n} type="button" className={`bench-crew-btn${travellers === n ? ' on' : ''}`}
                      aria-pressed={travellers === n} disabled={!editable}
                      onClick={() => setF(x => ({ ...x, travellers: n }))}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="bench-line" style={{ marginTop: 8 }}>
                  <label className="bench-hint" htmlFor="ts-crew-custom">More than 10? </label>
                  <input id="ts-crew-custom" className="input mono" type="number" inputMode="numeric"
                    min={CREW_MIN} max={CREW_MAX} disabled={!editable} value={f.travellers}
                    style={{ maxWidth: 96 }}
                    onChange={e => setF(x => ({ ...x, travellers: clampCrew(Number(e.target.value)) }))} />
                  <span className="bench-hint">up to {CREW_MAX}</span>
                </div>
              </div>
              <div className="bench-block">
                <div className="bench-block-head"><span className="bench-eyebrow">Budget / person</span><span className="bench-block-value">{formatInr(clampedBudget)}</span></div>
                <RangeDial value={clampedBudget} min={0} max={300000} step={500}
                  fmt={v => formatInr(v)} ariaLabel="Budget per person in rupees"
                  disabled={!editable} onChange={v => setF(x => ({ ...x, budget: v }))} />
                <div className="bench-scale-ends" aria-hidden="true"><span>₹0</span><span>₹3L</span></div>
              </div>
            </div>
            <div className="bench-block">
              <span className="bench-eyebrow">Budget preference</span>
              <PillNav className="tabbar" role="group" aria-label="Budget preference" activeKey={f.stayStyle}>
                {STAY_STYLES.map(s => (
                  <button key={s} type="button" data-pill-key={s} disabled={!editable}
                    aria-pressed={f.stayStyle === s}
                    className={`tab-btn${f.stayStyle === s ? ' active' : ''}`}
                    onClick={() => setF(x => ({ ...x, stayStyle: s }))}>
                    {cap(s)}
                  </button>
                ))}
              </PillNav>
              <p className="bench-hint">Prices the bed: ₹1,200 / ₹3,200 / ₹8,000 per room per night (2 guests per room). Shows up honestly on the Budget tab when you have hotel stops.</p>
            </div>
            <footer className="tsx-settled">
              <span className="tsx-fact"><span className="tsx-fact-k">Party</span><b>{travellers} travelling</b></span>
              <span className="tsx-fact"><span className="tsx-fact-k">Per head</span><b>{formatInr(clampedBudget)}</b></span>
              <span className="tsx-fact"><span className="tsx-fact-k">Group</span><b>{formatInr(clampedBudget * travellers)}</b></span>
              <span className="tsx-fact"><span className="tsx-fact-k">Bed</span><b>{formatInr(STAY_RATE_PER_NIGHT[f.stayStyle])} / night</b></span>
            </footer>
          </section>
        </div>

        {/* ---------- the bill + the engine's read ---------- */}
        <aside className="tsx-aside" aria-label="Live preview of these settings">
          <div className="bench-receipt card">
            <span className="bench-barcode" aria-hidden="true" />
            <span className="bench-stamp" aria-hidden="true">Preview</span>
            <div className="bench-receipt-head">
              <span className="bench-receipt-kicker">Trip settings bill</span>
              <span className="bench-receipt-date">{f.startDate && f.endDate ? `${f.startDate} → ${f.endDate}` : 'Dates not set'}</span>
            </div>
            <div className="ts-receipt-name">{f.name || 'Untitled trip'}</div>
            <div className="bench-meta-row">
              {MODE_ICON[f.transportMode]}
              <span>{cap(f.transportMode)} · {travellers} travelling · {cap(f.travelStyle)}</span>
            </div>
            <div className="bench-total" aria-live="polite">
              <div className="bench-total-label">Group budget</div>
              <div className="bench-total-main">{formatInr(clampedBudget * travellers)}</div>
              <span className="bench-total-sub">{formatInr(clampedBudget)} / head · split {travellers} way{travellers === 1 ? '' : 's'} · {dayCount} day{dayCount === 1 ? '' : 's'}</span>
            </div>
            <div className="bench-receipt-lines">
              <div className="bench-line">
                <div className="bench-line-head"><span>Day grid</span><b>{dayCount} days</b></div>
                <span className="bench-line-formula">{dayDeltaLabel} on save</span>
              </div>
              <div className="bench-line">
                <div className="bench-line-head"><span>Cost math</span><b>{fuelMode ? 'Fuel' : 'Default rates'}</b></div>
                <span className="bench-line-formula">
                  {fuelMode
                    ? (ecoSet && priceSet
                      ? `${ecoNum} km/L × ₹${priceNum}/L${f.roundTrip ? ' · round trip billed twice' : ' · one way'}`
                      : `Defaults (≈${ecoVal} km/L · ₹${FUEL_PRICE_INR_PER_L}/L) until you set mileage and price`)
                    : `Per-km fare for ${cap(f.transportMode)}`}
                </span>
              </div>
            </div>
            <div className="bench-receipt-rules" />
            <p className="bench-fineprint">
              Saving applies these settings to everyone on the trip · budgets, pacing and cost math recompute from mode, economy and dates
            </p>
          </div>

          {/* the engine's read — the space under the bill */}
          <div className="tsx-read" aria-label="The engine's read of these settings">
            <div className="tsx-read-head">
              <span className="tsx-read-kicker">The engine&apos;s read</span>
              <span className={`chip chip-${HEALTH_TONE[engineRead.band]}`}>{engineRead.band}</span>
            </div>
            <div className="health-big">
              <div className={`health-num-big ${healthToneClass(engineRead.band)}`}>{engineRead.score}</div>
              <div className="health-bar"><i className={healthToneClass(engineRead.band)} style={{ width: `${engineRead.score}%` }} /></div>
            </div>
            <ul className="health-reasons">
              {topWarning
                ? <li><b>{topWarning.title}.</b> {topWarning.detail}</li>
                : <li>No warnings — the plan reads clean against the engine&apos;s assumptions.</li>}
              {engineRead.warnings.length > 1 && <li className="muted">+{engineRead.warnings.length - 1} more on the Overview tab.</li>}
            </ul>
            <div className="tsx-read-facts">
              <span className="tsx-fact"><span className="tsx-fact-k">Days with stops</span><b>{daysWithStops} of {dayCount}</b></span>
              <span className="tsx-fact"><span className="tsx-fact-k">Avg speed</span><b>{MODE_SPEED[f.transportMode] ?? 40} km/h</b></span>
              <span className={`tsx-fact${clampError ? ' tsx-fact--warn' : ''}`}>
                <span className="tsx-fact-k">Day grid on save</span>
                <b>{dayDelta === null ? '—' : dayDelta === 0 ? 'unchanged' : dayDelta > 0 ? `+${dayDelta} empty` : `${dayDelta} cut`}</b>
              </span>
            </div>
            <p className="tsx-read-note">Recomputed from this form as you type. The day grid itself follows the save.</p>
          </div>
        </aside>
      </div>

      {/* ---------- Q3 · the machine ---------- */}
      <section className="tsx-card tsx-card--machine" aria-label="What moves you, and who is behind the wheel">
        <header className="tsx-head">
          <span className="tsx-no" aria-hidden="true">03</span>
          <h3 className="tsx-q">What moves you, and who is behind the wheel?</h3>
          <span className="tsx-ans">{cap(f.transportMode)} · {(f.driverCount ?? 1) === 1 ? '1 driver' : `${f.driverCount} drivers`} · {fuelMode ? 'fuel math' : 'fare math'}</span>
          <p className="tsx-a">The mode decides the cost math (fuel for car, rental and motorcycle; fares otherwise) and which dials exist below. Travel style tunes stop frequency and suggestions — it never touches pricing.</p>
        </header>
        <div className="bench-block bench-mode-block">
          <span className="bench-eyebrow">How you travel</span>
          <div className="bench-mode-grid" role="group" aria-label="Transport mode">
            {TRANSPORT_MODES.map(m => (
              <button key={m} type="button" className={`bench-mode-btn${f.transportMode === m ? ' on' : ''}`}
                aria-pressed={f.transportMode === m} disabled={!editable}
                onClick={() => setF(x => ({ ...x, transportMode: m }))}>
                {MODE_ICON[m]}
                <span className="bench-mode-name">{cap(m)}</span>
                <span className="bench-mode-speed" aria-hidden="true">{MODE_SPEED[m] ?? 40}</span>
              </button>
            ))}
          </div>
          <p className="bench-hint">Car and motorcycle switch cost math to fuel: distance ÷ economy × pump price.</p>
        </div>
        {selfDriven && (
          <div className="bench-block">
            <div className="bench-block-head">
              <span className="bench-eyebrow">Who&apos;s driving</span>
              <span className="bench-block-value">{(f.driverCount ?? 1) === 1 ? 'One driver' : `${f.driverCount} drivers`}</span>
            </div>
            <div className="bench-line" role="group" aria-label="Drivers sharing the wheel">
              {[1, 2, 3].map(n => (
                <button key={n} type="button" className={`bench-crew-btn${(f.driverCount ?? 1) === n ? ' on' : ''}`}
                  aria-pressed={(f.driverCount ?? 1) === n} disabled={!editable}
                  title={n === 1 ? 'One driver — the honest solo cap' : `${n} drivers rotate — the day earns real hours`}
                  onClick={() => setF(x => ({ ...x, driverCount: n === 1 ? undefined : n }))}>
                  {n}
                </button>
              ))}
              <span className="bench-hint">Rotating drivers buy hours; one driver keeps the solo cap.</span>
            </div>
            <div className="bench-line" role="group" aria-label="Who is aboard">
              <button type="button" className={`bench-crew-btn${!f.hasVulnerable ? ' on' : ''}`}
                aria-pressed={!f.hasVulnerable} disabled={!editable}
                title="Everyone adult — full-length driving days"
                onClick={() => setF(x => ({ ...x, hasVulnerable: undefined }))}>Everyone adult</button>
              <button type="button" className={`bench-crew-btn${f.hasVulnerable ? ' on' : ''}`}
                aria-pressed={!!f.hasVulnerable} disabled={!editable}
                title="Infants or seniors aboard — shorter days, earlier dinner"
                onClick={() => setF(x => ({ ...x, hasVulnerable: true }))}>Infants / seniors</button>
            </div>
            <div className="bench-line" role="group" aria-label="Dinner and driving">
              <button type="button" className={`bench-crew-btn${f.driveAfterDinner ? ' on' : ''}`}
                aria-pressed={f.driveAfterDinner} disabled={!editable}
                title="Halt for dinner, then keep going within the allowance and the night end"
                onClick={() => setF(x => ({ ...x, driveAfterDinner: !f.driveAfterDinner }))}>Drive after dinner</button>
            </div>
            <p className="bench-hint">The split verdict and the travel clock re-derive from these — meals, halts and the honest daily cap all move.</p>
          </div>
        )}
        <div className="bench-block">
          <span className="bench-eyebrow">Travel style</span>
          <PillNav className="tabbar" role="group" aria-label="Travel style" activeKey={f.travelStyle}>
            {TRAVEL_STYLES.map(s => (
              <button key={s} type="button" data-pill-key={s} disabled={!editable}
                aria-pressed={f.travelStyle === s}
                className={`tab-btn${f.travelStyle === s ? ' active' : ''}`}
                onClick={() => setF(x => ({ ...x, travelStyle: s }))}>
                {cap(s)}
              </button>
            ))}
          </PillNav>
          <p className="bench-hint">Tunes stop frequency and the kind of places suggested — relaxed stops sooner, packed pushes further. It never touches pricing.</p>
        </div>
        {fuelMode && (
          <>
            <div className="bench-block bench-fuel-pair">
              <div className="bench-fuel-col">
                <span className="bench-eyebrow">Your mileage</span>
                <span className="bench-fuel-value">{ecoSet ? `${ecoNum} km/L` : 'Not set'}</span>
                <RangeDial value={ecoVal} min={2} max={80} step={0.5}
                  fmt={v => `${v} km/L`} ariaLabel="Fuel economy in kilometres per litre"
                  disabled={!editable} onChange={v => setF(x => ({ ...x, fuelEconomy: String(v) }))} />
              </div>
              <div className="bench-fuel-col">
                <span className="bench-eyebrow">Fuel price</span>
                <span className="bench-fuel-value">{priceSet ? `₹${priceNum}/L` : `₹${FUEL_PRICE_INR_PER_L}/L default`}</span>
                <RangeDial value={priceVal} min={50} max={250} step={0.5}
                  fmt={v => `₹${v}/L`} ariaLabel="Fuel price in rupees per litre"
                  disabled={!editable} onChange={v => setF(x => ({ ...x, fuelPrice: String(v) }))} />
              </div>
            </div>
            {isImplausibleFuelEconomy(f.transportMode, ecoSet ? ecoNum : undefined) && (
              <p className="hint-text ts-warn-note">
                <TriangleAlert size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />Unusual for a {f.transportMode} — most do far better. Double-check the mileage.
              </p>
            )}
            {priceIgnored && (
              <p className="hint-text ts-warn-note">
                <TriangleAlert size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />Your fuel price is unused until you set a mileage — the bill is pricing the blended {cap(f.transportMode)} rate instead.
              </p>
            )}
            <button type="button" className={`bench-toggle${f.roundTrip ? ' on' : ''}`}
              aria-pressed={f.roundTrip} disabled={!editable}
              aria-label={`Round trip${f.roundTrip ? ' — the return to start is included in transport costs' : ' — off, one-way costs only'}`}
              onClick={() => setF(x => ({ ...x, roundTrip: !x.roundTrip }))}>
              Round trip{f.roundTrip ? ' — return included' : ''}
            </button>
            <div className="vehicle-profile-form">
              <div className="bench-pair">
                <Field label="Vehicle type">
                  <Select disabled={!editable} value={f.vehicleType} onChange={v => setF(x => ({ ...x, vehicleType: v as never }))}
                    options={[{ value: 'car', label: 'Car' }, { value: 'motorcycle', label: 'Motorcycle' }, { value: 'ev', label: 'Electric (EV)' }]} />
                </Field>
                <Field label="Fuel / energy">
                  <Select disabled={!editable} value={f.fuelType} onChange={v => setF(x => ({ ...x, fuelType: v as never }))}
                    options={[{ value: 'petrol', label: 'Petrol' }, { value: 'diesel', label: 'Diesel' }, { value: 'electric', label: 'Electric' }, { value: 'cng', label: 'CNG' }]} />
                </Field>
              </div>
              <div className="bench-pair">
                <Field label={f.fuelType === 'electric' ? 'Battery (kWh)' : 'Tank capacity (L)'} hint={f.fuelType === 'electric' ? 'e.g. 50' : 'e.g. 45'}>
                  <input type="number" min={1} max={300} step={0.5} className="input" disabled={!editable} value={f.capacity}
                    onChange={e => setF(x => ({ ...x, capacity: e.target.value }))} placeholder={f.fuelType === 'electric' ? '50' : '45'} />
                </Field>
                <Field label={f.fuelType === 'electric' ? 'Efficiency (km / kWh)' : 'Economy (km / L)'} hint={f.fuelType === 'electric' ? 'e.g. 6' : 'e.g. 15'}>
                  <input type="number" min={1} max={200} step={0.1} className="input" disabled={!editable} value={f.vehicleEconomy}
                    onChange={e => setF(x => ({ ...x, vehicleEconomy: e.target.value }))} placeholder={f.fuelType === 'electric' ? '6' : '15'} />
                </Field>
              </div>
            </div>
          </>
        )}
        <footer className="tsx-settled">
          <span className="tsx-fact"><span className="tsx-fact-k">Mode</span><b>{cap(f.transportMode)}</b></span>
          <span className="tsx-fact"><span className="tsx-fact-k">Avg speed</span><b>{MODE_SPEED[f.transportMode] ?? 40} km/h</b></span>
          <span className="tsx-fact"><span className="tsx-fact-k">Cost math</span><b>{fuelMode ? 'Fuel' : 'Fares'}</b></span>
          <span className="tsx-fact"><span className="tsx-fact-k">Return</span><b>{fuelMode ? (f.roundTrip ? 'included' : 'one way') : '—'}</b></span>
        </footer>
      </section>

      {/* ---------- the save bar ---------- */}
      <StickyFormBar show={editable}>
        <span className="tsx-rail-copy">
          <b>Save settings</b>
          <span className="tsx-rail-s"> applies to everyone on the trip — budgets, pacing and cost math recompute from mode, economy and dates</span>
        </span>
        <button className="btn btn-primary" onClick={() => {
          // Dates drive the day grid — validate the pair here for an inline
          // message (updateTrip re-checks and toasts on reconcile failures).
          const s = new Date(`${f.startDate}T00:00:00`), e = new Date(`${f.endDate}T00:00:00`)
          if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) { setDateErr('Pick both a start and an end date.'); return }
          if (e < s) { setDateErr('The end date must be on or after the start date.'); return }
          const saved = updateTrip(trip.id, {
            name: f.name, startLocation: f.startLocation,
            startLocationCoords: startCoords ?? undefined,
            startDate: f.startDate, endDate: f.endDate,
            destinations: f.destinations.map(s => s.trim()).filter(Boolean),
            destinationCoords: destCoords,
            travellers: clampCrew(f.travellers),
            driverCount: selfDriven ? f.driverCount : undefined,
            hasVulnerable: selfDriven ? f.hasVulnerable : undefined,
            driveAfterDinnerMin: !selfDriven
              ? undefined
              : f.driveAfterDinner
                ? (trip.driveAfterDinnerMin ?? DEFAULT_DRIVE_AFTER_DINNER_MIN)
                : undefined,
            budgetPerPersonInr: Math.max(0, f.budget),
            transportMode: f.transportMode, travelStyle: f.travelStyle,
            stayStyle: f.stayStyle,
            fuelEconomyKmL: isFuelEconomyMode(f.transportMode) ? parseFuelEconomyKmL(f.fuelEconomy) : undefined,
            fuelPricePerL: isFuelEconomyMode(f.transportMode) ? parseFuelPricePerL(f.fuelPrice) : undefined,
            roundTrip: isFuelEconomyMode(f.transportMode) ? f.roundTrip : undefined,
            vehicleProfile: isFuelEconomyMode(f.transportMode) ? {
              vehicleType: f.vehicleType as 'car' | 'motorcycle' | 'ev',
              fuelType: f.fuelType as 'petrol' | 'diesel' | 'electric' | 'cng',
              capacity: Number(f.capacity) || defaultVehicleProfile(f.vehicleType).capacity,
              economy: Number(f.vehicleEconomy) || defaultVehicleProfile(f.vehicleType).economy,
            } : undefined,
          })
          if (saved) {
            setDateErr(null)
            toast('Trip settings updated')
          }
        }}>Save settings</button>
      </StickyFormBar>
    </div>
  )
}

/** Health band → the health-bar/num colour class the Overview already uses. */
function healthToneClass(band: 'Comfortable' | 'Manageable' | 'Tight' | 'Unrealistic'): 'ok' | 'mid' | 'bad' {
  return band === 'Comfortable' ? 'ok' : band === 'Unrealistic' ? 'bad' : 'mid'
}
