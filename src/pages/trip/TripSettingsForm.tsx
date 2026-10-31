// ============ Trip workspace — trip settings form (Share tab) ============
// Bench-fidelity rebuild: the controls speak the Plan Bench's language (eyebrow
// blocks, big-value heads, mode grid, crew buttons, slider dials with drag
// bubbles) and a live "settings bill" receipt on the right mirrors every choice
// before it is saved. The sticky save bar spans both columns.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, ChevronDown, ChevronUp, MapPin, Pencil, Sparkles, TriangleAlert, Users, X,
} from 'lucide-react'
import type { Trip, TransportMode } from '../../data/types'
import { TRANSPORT_MODES, TRAVEL_STYLES, STAY_STYLES } from '../../data/types'
import { updateTrip, reconcileDays, tripWriteVerdict, membersOf, roleOf, trashTrip, restoreTrashedTrip, useSessionUserId, useUsers } from '../../store/store'
import { FUEL_PRICE_INR_PER_L, DEFAULT_FUEL_ECONOMY_KML, MODE_SPEED, computeTotals, formatInr, isFuelEconomyMode, minutesToHM, parseFuelEconomyKmL, isImplausibleFuelEconomy, parseFuelPricePerL } from '../../lib/engine'
import { settingsPreview } from '../../lib/settingsPreview'
import type { LegEstimate } from '../../lib/engine'
import { healthBandClass, healthBandTone } from '../../lib/healthBand'
import { STAY_RATE_PER_NIGHT } from '../../lib/rates'
import { cap } from '../../lib/labels'
import { InlineIcon, modeIcon } from '../../components/icons'
import { transportPolicy } from '../../lib/transportPolicy'
import { CREW_CHIPS, CREW_MAX, CREW_MIN, clampCrew } from '../../lib/crew'
import { defaultVehicleProfile, parseCapacityL, parseVehicleEconomy } from '../../lib/vehicleProfile'
import { zipDests, splitDests, renameDest, type DestPair } from '../../lib/destPairs'
import { Field, RangeDial, StickyFormBar, toast, undoToast } from '../../components/ui'
import { Select } from '../../components/Select'
import { DateRangeCalendar } from '../../components/DateRangeCalendar'
import { PillNav } from '../../components/PillNav'
import { LocationInput, pickLabel } from '../../components/LocationInput'
import type { StartPin } from '../../lib/startPin'
import { coordsForText, pinMatchesText } from '../../lib/startPin'
import { CoverImagePicker } from '../../components/CoverImagePicker'
import { RemoteEditBanner } from '../../components/RemoteEditBanner'
import { Surface } from '../../components/page/Surface'
import { StateBlock } from '../../components/page/StateBlock'

/** The allowance the "drive after dinner" toggle turns on when a trip has none
 *  (#122's dhaba case: dinner at X, two more hours to Y). */
const DEFAULT_DRIVE_AFTER_DINNER_MIN = 120

/** #410: the two things the form says when the start's text and its pin stop
 *  agreeing — one for the edit that dropped the pin, one for the pair a save
 *  refused to persist. "Unpinned" is not an error: the trip still plans, and
 *  the existing degraders measure it honestly without a position. */
const START_UNPINNED = 'The start pin is off — the text now names a different city. Pick the city to pin it on the map again.'
const START_DROPPED = 'The stored start pin named a different city, so it was not saved. Pick the city to pin it.'

/** Icon per transport mode — the ONE map lives in components/icons (modeIcon);
 *  this file used to keep a private copy that drifted from the bench's. */

/** The form's editable field set. `destinations` lives in the pair array
 *  beside it (#411) — this shape is the scalar fields only. */
export interface SettingsFormState {
  name: string
  startLocation: string
  startDate: string
  endDate: string
  travellers: number
  budget: number
  transportMode: TransportMode
  travelStyle: Trip['travelStyle']
  stayStyle: 'budget' | 'comfort' | 'luxury'
  fuelEconomy: string
  fuelPrice: string
  roundTrip: boolean
  vehicleType: string
  fuelType: string
  capacity: string
  vehicleEconomy: string
  driverCount: number | undefined
  hasVulnerable: boolean | undefined
  driveAfterDinner: boolean
  /** Mixed only: the traveller's answer to the driving question. Undefined is
   *  the open state, and it is a real third value, not a false. */
  drivesPart: boolean | undefined
}

/** Seed the scalar field set from a trip row. One factory, used by mount and
 *  by #414's take-theirs reseed, so a reload can never drift from the open. */
export function formFromTrip(trip: Trip): SettingsFormState {
  return {
    name: trip.name, startLocation: trip.startLocation,
    startDate: trip.startDate, endDate: trip.endDate,
    travellers: trip.travellers, budget: trip.budgetPerPersonInr,
    transportMode: trip.transportMode, travelStyle: trip.travelStyle,
    stayStyle: (trip.stayStyle ?? (trip.travelStyle === 'budget' || trip.travelStyle === 'luxury' ? trip.travelStyle : 'comfort')) as 'budget' | 'comfort' | 'luxury',
    fuelEconomy: trip.fuelEconomyKmL?.toString() ?? '',
    fuelPrice: trip.fuelPricePerL?.toString() ?? '',
    roundTrip: trip.roundTrip ?? true,
    // #189 / 20260915_trip_party_prefs.sql: the persisted profile wins; a
    // motorcycle or rental trip no longer opens the form looking like a car.
    // Unknown / conducted modes fall back to the car default via the shared
    // owner in lib/vehicleProfile (the engine and Create trip agree on it).
    vehicleType: trip.vehicleProfile?.vehicleType
      ?? defaultVehicleProfile(trip.transportMode).vehicleType,
    fuelType: trip.vehicleProfile?.fuelType
      ?? defaultVehicleProfile(trip.transportMode).fuelType,
    capacity: trip.vehicleProfile?.capacity?.toString() ?? '',
    vehicleEconomy: trip.vehicleProfile?.economy?.toString() ?? '',
    // Who is behind the wheel (#142) — the same three inputs Create-trip asks
    // for, so an existing trip can change its party without being recreated.
    // The engine already honours all three (wheelCapHoursForParty + anchors).
    driverCount: trip.driverCount,
    hasVulnerable: trip.hasVulnerable,
    driveAfterDinner: (trip.driveAfterDinnerMin ?? 0) > 0,
    // Tri-state on purpose. A trip saved before this field existed has no
    // answer, and undefined is how that state survives a reopen.
    drivesPart: trip.drivesPart,
  }
}

export type SettingsDryRun =
  | { ok: true; patch: Partial<Trip>; startCoordsDropped: boolean }
  | { ok: false; reason: string; blocked?: number[] }

/**
 * #408: ONE predicate, run by the live Preview AND the Save button, so the
 * preview is never a guess and a refusal is never a surprise. It answers
 * "would this save be accepted, and if not, why" BEFORE any write touches the
 * store — the reason is rendered inline (and under the blocking days, which
 * link to their timeline day) instead of living in a toast that fades.
 *
 * Every check here is a check updateTrip re-runs server-side of the form;
 * running it twice is the point — the UI's copy of the verdict is derived,
 * never stored, so the two cannot drift apart.
 */
export function settingsDryRun(
  f: SettingsFormState,
  dests: readonly DestPair[],
  startPin: StartPin | null,
  trip: Trip,
): SettingsDryRun {
  const s = new Date(`${f.startDate}T00:00:00`), e = new Date(`${f.endDate}T00:00:00`)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return { ok: false, reason: 'Pick both a start and an end date.' }
  }
  if (e < s) {
    return { ok: false, reason: 'The end date must be on or after the start date.' }
  }
  const fuel = isFuelEconomyMode(f.transportMode)
  // #412: a non-blank out-of-range capacity/economy REFUSES the save with the
  // reason. Clearing the stored value (200 km/L parsing to undefined and the
  // save writing undefined) was worse than the refusal — a refusal is visible.
  if (fuel) {
    if (f.capacity.trim() !== '' && parseCapacityL(f.capacity) === undefined) {
      return {
        ok: false,
        reason: `Tank or battery capacity must be 1-300 ${f.fuelType === 'electric' ? 'kWh' : 'L'} — clear the box to use the vehicle default.`,
      }
    }
    if (f.vehicleEconomy.trim() !== '' && parseVehicleEconomy(f.vehicleEconomy) === undefined) {
      return {
        ok: false,
        reason: 'Economy must be 2-80 km/L (km/kWh for an EV) — clear the box to use the vehicle default.',
      }
    }
  }
  // Reconcile the DRAFT dates against the trip's real days — the same pure
  // check updateTrip makes, but here the refusal can carry the blocking day
  // indexes so each one links straight to its timeline day.
  const datesChanged = f.startDate !== trip.startDate || f.endDate !== trip.endDate
  if (datesChanged) {
    const protectedIdx = new Set([...trip.fixedCommitments, ...(trip.flights ?? [])].map(c => c.dayIndex))
    const rec = reconcileDays(trip.days, f.startDate, f.endDate, protectedIdx)
    if (rec.error) return { ok: false, reason: rec.error, blocked: rec.blocked }
  }
  // Selecting Mixed is a change the traveller has just made, so it needs the
  // answer now. A trip that was ALREADY Mixed and unanswered is a different
  // case: it keeps its planning and its preferences, and an unrelated save
  // must not be blocked by a question the traveller never saw (2026-10-19).
  const newlySelectedMixed = f.transportMode === 'mixed' && trip.transportMode !== 'mixed'
  if (newlySelectedMixed && typeof f.drivesPart !== 'boolean') {
    return { ok: false, reason: 'Answer whether you will drive any part of this trip.' }
  }
  const { destinations, destinationCoords } = splitDests(dests)
  // #410 backstop (now inside the shared predicate, so the preview shows it
  // too): never persist a pair whose text and pin disagree, whatever produced
  // it. The trip saves unpositioned rather than measuring the wrong city.
  const startCoordsToSave = coordsForText(startPin, f.startLocation)
  return {
    ok: true,
    startCoordsDropped: !!startPin && !startCoordsToSave,
    patch: {
      name: f.name, startLocation: f.startLocation,
      startLocationCoords: startCoordsToSave ?? undefined,
      startDate: f.startDate, endDate: f.endDate,
      // #411: the ONE pair array splits into the row's two arrays exactly
      // here — the save mapping is the only writer of either.
      destinations, destinationCoords,
      travellers: clampCrew(f.travellers),
      // The party dials are shown only while the trip has a wheel, but the
      // choice must OUTLIVE the mode (2026-10-19). This block used to clear the
      // pair for any trip without a wheel, so saving a No answer on a Mixed
      // trip, or switching to a passenger mode, erased three drivers and a
      // custom dinner allowance, and turning the wheel back on found them gone.
      //
      // The DRAFT is the truth about what the traveller chose, so the save
      // writes the draft. The answer and the mode only decide what the
      // PLANNER uses, and the transport policy gates that use. A draft the
      // traveller edited before the wheel went away keeps those edits.
      driverCount: f.driverCount,
      hasVulnerable: f.hasVulnerable,
      // #213 Phase 5: only write the 120-minute default when the toggle is
      // being turned ON. A trip stored with a custom allowance (say 60)
      // used to be silently rewritten to 120 by any unrelated save.
      // The draft toggle decides the allowance. Off clears it. On keeps a
      // custom duration that the trip already has.
      driveAfterDinnerMin: !f.driveAfterDinner
        ? undefined
        : (trip.driveAfterDinnerMin ?? DEFAULT_DRIVE_AFTER_DINNER_MIN),
      budgetPerPersonInr: Math.max(0, f.budget),
      transportMode: f.transportMode, travelStyle: f.travelStyle,
      // The Mixed answer is stored whatever the mode, so a later switch back to
      // Mixed still knows what the traveller said.
      drivesPart: typeof f.drivesPart === 'boolean' ? f.drivesPart : undefined,
      stayStyle: f.stayStyle,
      fuelEconomyKmL: fuel ? parseFuelEconomyKmL(f.fuelEconomy) : undefined,
      fuelPricePerL: fuel ? parseFuelPricePerL(f.fuelPrice) : undefined,
      roundTrip: fuel ? f.roundTrip : undefined,
      // #213 Phase 6: the fallbacks come from the CHOSEN vehicle's own
      // profile, not hardcoded car numbers. `Number('45') || 45` used to
      // write a 45 L / 15 km-L car onto a motorcycle (12 / 40) or an EV
      // (50 kWh / 6) whenever the fields were left blank.
      vehicleProfile: fuel ? {
        vehicleType: f.vehicleType as 'car' | 'motorcycle' | 'ev',
        fuelType: f.fuelType as 'petrol' | 'diesel' | 'electric' | 'cng',
        capacity: parseCapacityL(f.capacity) ?? defaultVehicleProfile(f.vehicleType).capacity,
        economy: parseVehicleEconomy(f.vehicleEconomy) ?? defaultVehicleProfile(f.vehicleType).economy,
      } : undefined,
    },
  }
}

/**
 * #413: would this save change anything? The Save bar stays disabled until
 * it would — a no-change click used to rewrite the trip, bump updatedAt,
 * sync, toast success and ping collaborators for nothing.
 *
 * The compare runs over the SAVED field set: the patch a save would write,
 * against the patch the UNTOUCHED draft would write, one field at a time,
 * by VALUE — never the control states. The baseline is the untouched draft,
 * not the row, because a row missing a normalizable field (stayStyle,
 * roundTrip) would make EVERY draft read dirty on open while the save would
 * write back exactly what the form already shows. A toggle that reads "on"
 * can hold a stored 60-minute allowance the save would write back as 120:
 * nothing visible moved, and it is a real change. Arrays compare
 * element-wise (fresh arrays every render would otherwise never compare
 * equal — the polarity trap).
 */
export function settingsBaselinePatch(trip: Trip): Partial<Trip> {
  const pin = trip.startLocationCoords ? { coords: trip.startLocationCoords, label: trip.startLocation } : null
  const run = settingsDryRun(formFromTrip(trip), zipDests(trip.destinations, trip.destinationCoords), pin, trip)
  return run.ok ? run.patch : {}
}

export function settingsAreDirty(patch: Partial<Trip>, trip: Trip): boolean {
  const base = settingsBaselinePatch(trip)
  return (Object.keys(patch) as (keyof Trip)[])
    .some(k => !sameSavedValue(patch[k], base[k]))
}

/** The saved fields this draft would change, named. The nav rail and the
 *  preview panel both read this, so "2 unsaved changes" and the two marked
 *  sections come from one answer instead of two counts that can drift. */
export function settingsDirtyFields(patch: Partial<Trip>, trip: Trip): (keyof Trip)[] {
  const base = settingsBaselinePatch(trip)
  return (Object.keys(patch) as (keyof Trip)[]).filter(k => !sameSavedValue(patch[k], base[k]))
}

/** Which section owns each saved field. A field with no row here still counts
 *  as a change; it just does not mark a section. */
const SECTION_OF_FIELD: Partial<Record<keyof Trip, string>> = {
  name: 'identity',
  coverImageUrl: 'identity',
  coverEmoji: 'identity',
  startDate: 'dates',
  endDate: 'dates',
  startLocation: 'dates',
  startLocationCoords: 'dates',
  destinations: 'dates',
  destinationCoords: 'dates',
  roundTrip: 'dates',
  travellers: 'group',
  budgetPerPersonInr: 'group',
  stayStyle: 'group',
  transportMode: 'travel',
  travelStyle: 'travel',
  drivesPart: 'travel',
  driverCount: 'travel',
  fuelEconomyKmL: 'travel',
  fuelPricePerL: 'travel',
  vehicleProfile: 'travel',
  hasVulnerable: 'travel',
  driveAfterDinnerMin: 'travel',
}

/** The two letters an avatar stack shows when there is no photo: the first
 *  letter of the first two words, so "Has9 Naina" reads "HN". */
function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

/** The day cards the artboard draws: one per day of the grid this save would
 *  write, each with the stops it already carries. A day past the trip's own
 *  length is new, so it reads "New · empty" before the save instead of
 *  pretending the write already happened. */
function dayGrid(startDate: string, existing: Trip['days'], total: number): {
  key: string; dow: string; dayOfMonth: string; stops: number; isNew: boolean
}[] {
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return []
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return Array.from({ length: total }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    return {
      key: `${i}`,
      dow: DOW[date.getDay()].toUpperCase(),
      dayOfMonth: String(date.getDate()),
      stops: (existing[i]?.stops ?? []).filter(s => s.status !== 'rejected').length,
      isNew: i >= existing.length,
    }
  })
}


/** null and undefined are the same "not set" — the row writes nulls where the
 *  write mapping writes undefined, and calling that a change pins the bar
 *  open for ever. */
function sameSavedValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameSavedValue(v, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as Record<string, unknown>)
    const kb = Object.keys(b as Record<string, unknown>)
    return ka.length === kb.length && ka.every(k =>
      sameSavedValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

/** #408: the days a refused shrink is waiting on, each one a jump to its
 *  timeline day. Without a workspace to jump from, the days still get named. */
function BlockedDayLinks({ blocked, onOpenDay }: { blocked?: number[]; onOpenDay?: (dayIndex: number) => void }) {
  if (!blocked || blocked.length === 0) return null
  return (
    <span className="ts-blocked-days">
      {(onOpenDay
        ? blocked.map(i => (
            <button key={i} type="button" className="link-btn teal btn-sm"
              onClick={() => onOpenDay(i)}>Day {i + 1} →</button>
          ))
        : blocked.map(i => <span key={i} className="muted small">Day {i + 1}</span>)
      )}
    </span>
  )
}

/** #704: the line a refused settings save shows. The edit stays in the cache and the durable queue, and the queue retries it. */
const TRIP_SETTINGS_NOT_SAVED = 'Settings not saved. They stay here, and the app will retry.'

export function TripSettingsForm({ trip, editable, onOpenDay, legCorrections }: {
  trip: Trip
  editable: boolean
  legCorrections?: Record<string, LegEstimate>
  /** #408: jump to a timeline day — the workspace plumbs the same focus
   *  mechanism the Map tab's day links use. Optional: the form renders the
   *  blocking days as plain text when no workspace is wired up. */
  onOpenDay?: (dayIndex: number) => void
}) {
  /** The signed-in member, read once at the top so the owner-only section and
   *  the avatar stack resolve against the same person. */
  const meId = useSessionUserId()
  const users = useUsers()
  /** #704: the last write the server did not keep. Shown beside the Save button; the draft stays. */
  const [writeErr, setWriteErr] = useState<string | null>(null)
  /** #704: true from the Save click until the server answers. Save stays disabled meanwhile. */
  const [savingSettings, setSavingSettings] = useState(false)
  const [f, setFState] = useState(() => formFromTrip(trip))
  /** Any edit to the draft clears a refusal, because the refusal described the draft before the edit (#704). */
  const setF = (next: Parameters<typeof setFState>[0]) => { setWriteErr(null); setFState(next) }
  /** #414: when the trip row moves under the open draft (a crew member saved
   *  while this form was open), the banner offers keep-mine / take-theirs.
   *  `openedAtRef` is the updatedAt the draft was born against; our OWN save
   *  rebases it through `ownSaveRef` so it never fires on ourselves. */
  const openedAtRef = useRef(trip.updatedAt)
  const ownSaveRef = useRef(false)
  const [remoteAt, setRemoteAt] = useState<number | null>(null)
  useEffect(() => {
    if (ownSaveRef.current) { ownSaveRef.current = false; openedAtRef.current = trip.updatedAt; return }
    if (trip.updatedAt > openedAtRef.current) setRemoteAt(trip.updatedAt)
  }, [trip.updatedAt])
  // The day grid follows the date range — show what the picker will do to it.
  const dayDelta = (() => {
    const s = new Date(`${f.startDate}T00:00:00`), e = new Date(`${f.endDate}T00:00:00`)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null
    const target = Math.round((e.getTime() - s.getTime()) / 86400000) + 1
    return target - trip.days.length
  })()
  const [startPin, setStartPinState] = useState<StartPin | null>(
    trip.startLocationCoords ? { coords: trip.startLocationCoords, label: trip.startLocation } : null,
  )
  const setStartPin = (next: Parameters<typeof setStartPinState>[0]) => { setWriteErr(null); setStartPinState(next) }
  /** #410: soft notice under the start field — the pin is off, and why. */
  const [startNotice, setStartNotice] = useState('')
  /** #411: the route tail as ONE array of {name, lat?, lng?} pairs — the
   *  form's single source of truth. The row's parallel arrays exist only at
   *  the boundary (zip on open, split on save), so a rename or a remove can
   *  no longer slide names out from under their pins. */
  const [dests, setDestsState] = useState<DestPair[]>(() => zipDests(trip.destinations, trip.destinationCoords))
  const setDests = (next: Parameters<typeof setDestsState>[0]) => { setWriteErr(null); setDestsState(next) }
  const [destInput, setDestInput] = useState('')
  /** #411: rename-in-place. The chip edits its own name; coords and position
   *  are untouched by construction (renameDest rebuilds nothing). */
  const [renamingDest, setRenamingDest] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  function addDest(name: string, coords: { lat: number; lng: number } | null) {
    const clean = name.trim()
    if (!clean) return
    if (dests.some(d => d.name.toLowerCase() === clean.toLowerCase())) {
      toast('Already on the route.', 'err'); return
    }
    setDests(list => [...list, coords ? { name: clean, lat: coords.lat, lng: coords.lng } : { name: clean }])
    setDestInput('')
  }

  /** Swap with a neighbour — on the PAIRS, so a pin travels with its name. */
  function moveDest(i: number, dir: -1 | 1) {
    setDests(list => {
      const j = i + dir
      if (j < 0 || j >= list.length) return list
      const next = [...list]; const tmp = next[i]; next[i] = next[j]; next[j] = tmp
      return next
    })
  }

  function commitRename(i: number) {
    setDests(list => renameDest(list, i, renameDraft.trim() || list[i]?.name || ''))
    setRenamingDest(null)
    setRenameDraft('')
  }

  /** #414 "take theirs": rebuild the whole draft from the row as it stands. */
  function reseedFrom(t: Trip) {
    setF(formFromTrip(t))
    setDests(zipDests(t.destinations, t.destinationCoords))
    setStartPin(t.startLocationCoords ? { coords: t.startLocationCoords, label: t.startLocation } : null)
    setStartNotice(''); setDestInput(''); setRenamingDest(null); setRenameDraft('')
    openedAtRef.current = t.updatedAt
    setRemoteAt(null)
  }

  // #408: the Preview and the Save button read the SAME dry run — computed
  // once per render, never stored, so the receipt and the write can never
  // disagree about what this form would do.
  const dry = settingsDryRun(f, dests, startPin, trip)
  // #413: the bar is enabled exactly when a click would WRITE — a clean
  // draft is disabled ("No changes"), and a refusal pending is disabled too.
  const canSave = dry.ok && settingsAreDirty(dry.patch, trip)

  // Derived values the bench-style blocks and the live receipt read from.
  // #213 Phase 5: clampCrew, not Math.min(12,…) — the old clamp misrepresented a
  // larger party as 12 and any chip tap then dropped it.
  const travellers = clampCrew(f.travellers)
  const clampedBudget = Math.min(300000, Math.max(0, f.budget))
  const dayCount = dayDelta === null ? trip.days.length : trip.days.length + dayDelta
  const dayDeltaLabel = dayDelta === null
    ? 'Pick both dates to preview the day grid'
    : dayDelta === 0 ? 'Day count unchanged'
    : dayDelta > 0 ? `Adds ${dayDelta} empty day${dayDelta !== 1 ? 's' : ''} at the end`
    : `Drops ${-dayDelta} empty trailing day${dayDelta !== -1 ? 's' : ''} (days with stops are kept)`
  const fuelMode = isFuelEconomyMode(f.transportMode)
  // One shared answer for every surface (2026-10-19). `showsDrivingControls`
  // gates what renders; `driving` gates what the planner keeps, so an
  // unanswered Mixed keeps its stored preferences while hiding the dials.
  const policy = transportPolicy({ transportMode: f.transportMode, drivesPart: f.drivesPart })
  const showsDriving = policy.showsDrivingControls
  const ecoNum = parseFuelEconomyKmL(f.fuelEconomy)
  const priceNum = parseFuelPricePerL(f.fuelPrice)
  const ecoSet = typeof ecoNum === 'number' && Number.isFinite(ecoNum)
  const priceSet = typeof priceNum === 'number' && Number.isFinite(priceNum)
  // ONE default across the app (#213 Phase 5): the bench and Create Trip both
  // use 15 km/L, and this dial used to show 18 — three "defaults" for the same
  // car. The constant lives next to the fuel price in lib/engine.
  const ecoVal = ecoSet ? ecoNum : DEFAULT_FUEL_ECONOMY_KML
  const priceVal = priceSet ? priceNum : FUEL_PRICE_INR_PER_L
  // The engine prices a self-drive trip from fuel only when BOTH are stated
  // (engine.ts `economy && price`); with the price set and no mileage the ₹/L
  // is silently unused. Say so instead of letting the bill read the blended rate.
  const priceIgnored = priceSet && !ecoSet
  // V2 derived values: the stopped-day count for the day grid, and the
  // engine's read over the trip AS DRAFTED (the validated patch and
  // reconciled days drive the preview).
  const daysWithStops = trip.days.filter(d => d.stops.some(s => s.status !== 'rejected')).length
  const preview = useMemo(() => {
    const valid = settingsDryRun(f, dests, startPin, trip)
    if (!valid.ok) return null
    const protectedIdx = new Set([...trip.fixedCommitments, ...(trip.flights ?? [])].map(c => c.dayIndex))
    const rec = reconcileDays(trip.days, f.startDate, f.endDate, protectedIdx)
    if (rec.error) return null
    return settingsPreview(trip, valid.patch, rec.days, legCorrections)
  }, [trip, f, dests, startPin, legCorrections])
  const engineRead = preview?.health
  const topWarning = engineRead?.warnings[0]

  // The nav rail's edit marks and the preview panel's count come from ONE
  // list of changed fields, so the two can never disagree.
  const dirtyFields = dry.ok ? settingsDirtyFields(dry.patch, trip) : []
  const editedSections = new Set(dirtyFields.map(k => SECTION_OF_FIELD[k]).filter(Boolean) as string[])
  const dirtyCount = dirtyFields.length
  const grid = dayGrid(f.startDate, trip.days, dayCount)
  const tripTotals = computeTotals(trip)
  const members = membersOf(trip)
  const role = roleOf(trip, meId)
  const editors = members.filter(m => m.role === 'owner' || m.role === 'editor').length
  const nameOf = (userId: string) => users.find(u => u.id === userId)?.profile.name ?? 'Member'

  // The sticky preview panel. It sits last in the grid, after every section,
  // so the artboard's three columns hold their shape on any section count.
  const saveAside = (
    <aside className="tset-aside" aria-label="What changes when you save">
      {/* #408: the preview shows what WOULD happen — including a save that
          would be refused. A "Preview" that hides the refusal is a guess,
          not a preview; the reason and the blocking days (linked to their
          timeline day) sit at the top, from the same dry run the Save
          button runs. */}
      {!dry.ok && (
        <div className="bench-receipt card ts-receipt-refusal" role="status">
          <span className="bench-stamp" aria-hidden="true">Would be refused</span>
          <div className="bench-receipt-head">
            <span className="bench-receipt-kicker">Save preview</span>
          </div>
          <p className="err-text ts-warn-note set-receipt-reason">{dry.reason}</p>
          <BlockedDayLinks blocked={dry.blocked} onOpenDay={onOpenDay} />
        </div>
      )}
      <div className="tset-savecard">
        <div className="tset-save-head">
          <span className="tset-dot" aria-hidden="true" />
          <span className="disp tset-save-title">{dirtyCount === 0 ? 'No unsaved changes' : `${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}`}</span>
        </div>
        <p className="tset-save-sub">Here is what happens to the plan when you save.</p>
        {/* The three diffs the artboard asks for, each read from the same
            dry run and preview the Save button uses, so a diff can never
            promise something the write refuses. An arrow appears only when a
            save is actually pending: the panel must not draw "4 days → 5
            days" under a title that says nothing will be saved. */}
        <div className="tset-diff">
          <span className="tset-diff-lbl">Days</span>
          <b>{canSave && dayDelta
            ? <><span className="tset-was">{trip.days.length} days</span> → {dayCount} days</>
            : `${dayCount} day${dayCount === 1 ? '' : 's'}`}</b>
          <span>{canSave && dayDelta
            ? dayDeltaLabel
            : dayDelta
              ? `The dates cover ${dayCount} days; the plan holds ${trip.days.length}.`
              : 'The dates and the day grid already agree.'}</span>
        </div>
        <div className="tset-diff">
          <span className="tset-diff-lbl">Budget</span>
          <b>{canSave && clampedBudget !== trip.budgetPerPersonInr
            ? <><span className="tset-was">{formatInr(trip.budgetPerPersonInr)}</span> → {formatInr(clampedBudget)} each</>
            : `${formatInr(clampedBudget)} each`}</b>
          <span>{formatInr(clampedBudget * travellers)} for the group.</span>
        </div>
        {engineRead && (
          <div className={`tset-diff${topWarning ? '' : ' is-good'}`}>
            <span className="tset-diff-lbl">{topWarning ? 'Engine' : 'Good news'}</span>
            <b>{topWarning ? topWarning.title : 'The plan reads clean'}</b>
            <span>{topWarning ? topWarning.detail : 'No warnings against the engine’s assumptions.'}</span>
          </div>
        )}
        {/* #413: a viewer used to get a vanished bar under disabled inputs —
            permissioned read as broken. The bar renders for everyone; a
            viewer gets it disabled with the reason said out loud. */}
        {!editable && (
          <span className="ts-savebar-note hint-text" role="status">
            <InlineIcon icon={TriangleAlert} size={12} gap={3} />Only editors can change trip settings — ask an editor on this trip, or duplicate it to edit your own copy.
          </span>
        )}
        {savingSettings && (
          <div className="set-save-state">
            <StateBlock kind="loading" size="compact" title="Saving your settings." />
          </div>
        )}
        {writeErr && <span className="err-text" role="alert">{writeErr}</span>}
        <div className="tset-save-actions">
          <button className="btn btn-primary tset-save-btn" disabled={!canSave || savingSettings}
            title={canSave ? undefined : dry.ok ? 'No changes' : dry.reason} onClick={() => {
            if (!dry.ok) return
            if (dry.startCoordsDropped) setStartNotice(START_DROPPED)
            setWriteErr(null)
            if (updateTrip(trip.id, dry.patch)) {
              ownSaveRef.current = true
              const verdict = tripWriteVerdict(trip.id)
              if (verdict) {
                setSavingSettings(true)
                void verdict.then(saved => {
                  setSavingSettings(false)
                  if (saved) toast('Trip settings updated')
                  else setWriteErr(TRIP_SETTINGS_NOT_SAVED)
                })
              }
            }
          }}>{savingSettings ? 'Saving…' : 'Save changes'}</button>
          <button type="button" className="tset-discard" disabled={!dirtyCount || savingSettings}
            onClick={() => reseedFrom(trip)}>Discard</button>
        </div>
        <span className="tset-save-foot">Saving applies these settings to everyone on the trip.</span>
      </div>

      {/* the engine's read — recomputed from this form as you type. Band
          word, number and bar derive from one call (lib/healthBand), so
          they cannot drift apart. */}
      {engineRead && (
        <div className="tset-glance" aria-label="The engine's read of these settings">
          <span className="tset-nav-lbl">The plan at a glance</span>
          {preview?.estimated && <p className="muted small">Route changes need fresh road measurements after saving.</p>}
          <div className="tset-glance-grid">
            <div className="tset-stat"><span className="tset-stat-v">{tripTotals.totalDistanceKm > 0 ? `${Math.round(tripTotals.totalDistanceKm)} km` : '–'}</span><span className="tset-stat-k">road measured</span></div>
            <div className="tset-stat"><span className="tset-stat-v">{minutesToHM(tripTotals.totalTravelMinutes)}</span><span className="tset-stat-k">driving</span></div>
            <div className="tset-stat"><span className="tset-stat-v">{tripTotals.stopCount} stops</span><span className="tset-stat-k">on {daysWithStops} of {dayCount} days</span></div>
            <div className="tset-stat"><span className="tset-stat-v">{formatInr(tripTotals.totalCostInr)}</span><span className="tset-stat-k">plan total, estimate</span></div>
          </div>
          <div className="tset-read">
            <span className="tset-diff-lbl">The engine&apos;s read</span>
            <span className={`chip chip-${healthBandTone(engineRead.band)}`}>{engineRead.band}</span>
            <div className="health-big set-read-gap">
              <div className={`health-num-big ${healthBandClass(engineRead.band)} set-read-score`}>{engineRead.score}</div>
              <div className="health-bar set-read-bar"><i className={healthBandClass(engineRead.band)} style={{ width: `${engineRead.score}%` }} /></div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )

  return (
    <div className="ts-form tsx-form">
      {/* #414: a crew member saved while this form sat open. The banner
          offers the same two verbs the stop editor uses — keep my draft, or
          take theirs and rebuild from the row as it stands. Non-blocking,
          role=status: it must not steal focus mid-edit. */}
      {remoteAt !== null && (
        <RemoteEditBanner
          noun="trip settings"
          byName=""
          onKeepMine={() => { openedAtRef.current = trip.updatedAt; setRemoteAt(null) }}
          onTakeTheirs={() => reseedFrom(trip)}
        />
      )}
      <div className="tset-grid">
        {/* The artboard's short nav: one long page, six sections, and the two
            that carry unsaved edits say so. Every item is an in-page anchor,
            so it works with no JavaScript and keeps the URL. */}
        <nav className="tset-nav" aria-label="Settings sections">
          <span className="tset-nav-lbl">Trip settings</span>
          {([['identity', 'Name & cover'], ['dates', 'Dates & days'], ['group', 'Group & budget'],
            ['travel', 'How you travel'], ['people', 'People & sharing'], ['danger', 'Archive or delete']] as const)
            .map(([key, label]) => (
              <a key={key} href={`#tset-${key}`} className={`tset-nav-item${editedSections.has(key) ? ' is-edited' : ''}`}>
                {label}
                {editedSections.has(key) && <i aria-hidden="true">!</i>}
              </a>
            ))}
        </nav>

        <div className="tset-main">

          {/* ---------- Name & cover ---------- */}
          <Surface as="section" className="tsx-card" id="tset-identity" aria-label="Trip name and cover">
            <header className="tsx-head">
              <span className="tsx-ico" aria-hidden="true"><Sparkles size={18} /></span>
              <span className="tsx-head-copy">
                <h3 className="tsx-q">Name &amp; cover</h3>
                <p className="tsx-a">What the group and anyone you share with will see first.</p>
              </span>
            </header>
            <div className="bench-pair">
              <Field label="Trip name">
                <input className="input" disabled={!editable} maxLength={60} value={f.name}
                  onChange={e => setF(x => ({ ...x, name: e.target.value }))} />
              </Field>
              <Field label="Cover image">
                <CoverImagePicker trip={trip} editable={editable} />
              </Field>
            </div>
            <p className="hint-text">Shared links and WhatsApp previews use the cover.</p>
          </Surface>

          {/* ---------- Dates & days ---------- */}
          <Surface as="section" className="tsx-card" id="tset-dates" aria-label="Where does it go, and for how many days">
            <header className="tsx-head">
              <span className="tsx-ico" aria-hidden="true"><CalendarDays size={18} /></span>
              <span className="tsx-head-copy">
                <h3 className="tsx-q">Dates &amp; days</h3>
                <p className="tsx-a">Where it starts and ends, and how many days you have.</p>
              </span>
              <span className="tsx-ans">{dayCount} day{dayCount === 1 ? '' : 's'} · {dests.length} stop{dests.length === 1 ? '' : 's'} en route</span>
            </header>
            {/* #411: the strip renders the pair array — rename edits the chip
                in place, the pin travels with its name by construction. */}
            <div className="tsx-route" role="group" aria-label="The route">
              <span className="tsx-node tsx-node--start"><MapPin size={13} aria-hidden />{f.startLocation || 'Set a start'}</span>
              {dests.map((d, i) => (
                <Fragment key={`${d.name}-${i}`}>
                  <span className="tsx-road" aria-hidden="true" />
                  <span className="tsx-node">
                    <span className="tsx-node-ord" aria-hidden="true">{i + 1}</span>
                    {renamingDest === i ? (
                      <input
                        className="input input--compact"
                        aria-label={`Rename ${d.name}`}
                        autoFocus
                        value={renameDraft}
                        onChange={e => setRenameDraft(e.target.value)}
                        onBlur={() => commitRename(i)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(i)
                          if (e.key === 'Escape') { setRenamingDest(null); setRenameDraft('') }
                        }}
                      />
                    ) : (
                      <>
                        {d.name}
                        {d.lat != null && d.lng != null && <span className="dest-pin" aria-hidden>📍</span>}
                        {editable && (
                          <button type="button" aria-label={`Rename ${d.name}`}
                            onClick={() => { setRenamingDest(i); setRenameDraft(d.name) }}><Pencil size={13} aria-hidden /></button>
                        )}
                      </>
                    )}
                    <span className="tsx-node-tools">
                      <button type="button" aria-label={`Move ${d.name} earlier`} disabled={!editable || i === 0}
                        onClick={() => moveDest(i, -1)} style={{ opacity: i === 0 ? .25 : undefined }}><ChevronUp size={13} aria-hidden /></button>
                      <button type="button" aria-label={`Move ${d.name} later`} disabled={!editable || i === dests.length - 1}
                        onClick={() => moveDest(i, 1)} style={{ opacity: i === dests.length - 1 ? .25 : undefined }}><ChevronDown size={13} aria-hidden /></button>
                      {editable && (
                        <button type="button" aria-label={`Remove ${d.name}`}
                          onClick={() => setDests(list => list.filter((_, j) => j !== i))}><X size={13} aria-hidden /></button>
                      )}
                    </span>
                  </span>
                </Fragment>
              ))}
            </div>
            <div className="bench-pair">
              <Field label="Starting location">
                <LocationInput
                  value={f.startLocation}
                  onChange={v => {
                    setF(x => ({ ...x, startLocation: v }))
                    // #410: the pin belongs to the text it was picked for. An
                    // edit that names a different city DROPS the pin — keeping
                    // the old coordinates here is how a renamed trip silently
                    // keeps measuring the city it no longer names. A pick
                    // restores it instantly, below.
                    if (startPin && !pinMatchesText(startPin, v)) {
                      setStartPin(null)
                      setStartNotice(START_UNPINNED)
                    }
                  }}
                  onPick={p => {
                    setStartPin({ coords: { lat: p.latitude, lng: p.longitude }, label: pickLabel(p) })
                    setStartNotice('')
                  }}
                  placeholder="Search a city…"
                  disabled={!editable}
                />
                {startNotice && <p className="hint-text set-start-notice" role="status">{startNotice}</p>}
              </Field>
              <Field label={`Destinations (${dests.length})`} hint="Search to add — arrows reorder the route">
                <LocationInput
                  value={destInput}
                  onChange={setDestInput}
                  onPick={p => addDest(p.name + (p.admin1 ? `, ${p.admin1}` : ''), { lat: p.latitude, lng: p.longitude })}
                  placeholder={dests.length ? 'Add another destination…' : 'Add your first destination…'}
                  disabled={!editable}
                />
              </Field>
            </div>
            <div className="tsx-when">
              <DateRangeCalendar
                label="Trip dates"
                start={f.startDate} end={f.endDate}
                disabled={!editable}
                error={dry.ok ? undefined : dry.reason}
                hint={dayDeltaLabel}
                onChange={({ startDate, endDate }) => { setF(x => ({ ...x, startDate, endDate })) }}
              />
            </div>
            {/* The artboard's "your days" grid: each day as a real day, with
                the stops it already carries, so a date change shows which days
                gain or lose. `dayPlan` is the reconciled grid, so an added day
                reads "New · empty" before the save — the same shape the save
                will write. */}
            <div className="field">
              <span className="flab">Your days</span>
              <div className="tset-daygrid">
                {grid.map(d => (
                  <div key={d.key} className={`tset-day${d.isNew ? ' is-new' : ''}`}>
                    <span className="tset-day-dow">{d.dow}</span>
                    <b className="tset-day-num">{d.dayOfMonth}</b>
                    <em className="tset-day-stops">
                      {d.isNew ? 'New · empty' : `${d.stops} stop${d.stops === 1 ? '' : 's'}`}
                    </em>
                  </div>
                ))}
              </div>
              <span className="hint-text">{dayDeltaLabel}. Existing stops stay on their dates.</span>
            </div>
            {/* #408: the refusal lives here, inline, where the dates are —
                with the blocking days linked to their timeline day. It is
                derived from the shared dry run, so the receipt above/beside
                and this line can never disagree. */}
            {!dry.ok && (
              <div className="ts-save-refusal" role="alert">
                <p className="err-text ts-warn-note"><InlineIcon icon={TriangleAlert} size={12} gap={3} />{dry.reason}</p>
                <BlockedDayLinks blocked={dry.blocked} onOpenDay={onOpenDay} />
              </div>
            )}
          </Surface>

          {/* ---------- Group & budget ---------- */}
          <Surface as="section" className="tsx-card" id="tset-group" aria-label="Who is going, and how do they split the money">
            <header className="tsx-head">
              <span className="tsx-ico" aria-hidden="true"><Users size={18} /></span>
              <span className="tsx-head-copy">
                <h3 className="tsx-q">Group &amp; budget</h3>
                <p className="tsx-a">Rooms, per-head splits and the Budget tab all read these.</p>
              </span>
              <span className="tsx-ans">{travellers} {travellers === 1 ? 'person' : 'people'} · {formatInr(clampedBudget * travellers)} group</span>
            </header>
            <div className="bench-pair">
              <div className="bench-block">
                <div className="bench-block-head">
                  <span className="bench-eyebrow">Travellers</span>
                  <span className="bench-block-value">{travellers}</span>
                </div>
                <div className="bench-crew" role="group" aria-label="Number of travellers">
                  {CREW_CHIPS.map(n => (
                    <button key={n} type="button" className={`bench-crew-btn${travellers === n ? ' on' : ''}`}
                      aria-pressed={travellers === n} disabled={!editable}
                      onClick={() => setF(x => ({ ...x, travellers: n }))}>
                      {n}
                    </button>
                  ))}
                </div>
                {/* A party bigger than the chips needs a way in — Create Trip has
                    the same field, so the two surfaces accept the same range. */}
                <div className="bench-line set-bench-line-top">
                  <label className="bench-hint" htmlFor="ts-crew-custom">More than 10? </label>
                  <input id="ts-crew-custom" className="input mono set-bench-total-cap" type="number" inputMode="numeric"
                    min={CREW_MIN} max={CREW_MAX} disabled={!editable} value={f.travellers}
                    onChange={e => setF(x => ({ ...x, travellers: clampCrew(Number(e.target.value)) }))} />
                  <span className="bench-hint">up to {CREW_MAX}</span>
                </div>
                <p className="bench-hint">Rooms and per-head splits follow this count.</p>
              </div>
              <div className="bench-block">
                <div className="bench-block-head">
                  <span className="bench-eyebrow">Budget / person</span>
                  <span className="bench-block-value">{formatInr(clampedBudget)}</span>
                </div>
                <RangeDial value={clampedBudget} min={0} max={300000} step={500}
                  fmt={v => formatInr(v)} ariaLabel="Budget per person in rupees"
                  disabled={!editable} onChange={v => setF(x => ({ ...x, budget: v }))} />
                <div className="bench-scale-ends" aria-hidden="true"><span>₹0</span><span>₹3L</span></div>
                <p className="bench-hint">The Budget tab’s pacing tile reads this target.</p>
              </div>
            </div>
            <div className="bench-block">
              <span className="bench-eyebrow">Spending style</span>
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
              <p className="bench-hint">Changes which stays and restaurants the app suggests first. Prices the bed at {formatInr(STAY_RATE_PER_NIGHT[f.stayStyle])} per room per night.</p>
            </div>
          </Surface>

      {/* ---------- Q3 · the machine ---------- */}
      {/* Mixed asks whenever the trip IS Mixed, not only while unanswered
          (2026-10-19). Gating on the open question made Yes a one-way door: the
          buttons vanished on click, and a reloaded answered trip showed none.
          Only the VALIDATION uses `mustAnswerDriving`. */}
      {f.transportMode === 'mixed' && (
        <Surface as="section" className="tsx-card" aria-label="Will you drive any part of this trip?">
          <header className="tsx-head tsx-head--plain">
            <h3 className="tsx-q">Will you drive any part of this trip?</h3>
            <p className="tsx-a">This trip mixes ways of travelling. Your answer sets the driving options. Nothing changes until you pick one.</p>
          </header>
          <div className="transport-answer-pair" role="group" aria-label="Will you drive any part of this trip?" data-sel={f.drivesPart === true ? '0' : f.drivesPart === false ? '1' : 'none'}>
            <button type="button" className={`crew-btn${f.drivesPart === true ? ' on' : ''}`}
              aria-pressed={f.drivesPart === true} disabled={!editable}
              onClick={() => setF(s => ({ ...s, drivesPart: true }))}>Yes, I drive</button>
            <button type="button" className={`crew-btn${f.drivesPart === false ? ' on' : ''}`}
              aria-pressed={f.drivesPart === false} disabled={!editable}
              onClick={() => setF(s => ({ ...s, drivesPart: false }))}>No, passenger only</button>
          </div>
        </Surface>
      )}
      <Surface as="section" className="tsx-card tsx-card--machine" id="tset-travel" aria-label={showsDriving ? 'What moves you, and who is behind the wheel' : 'What moves you'}>
        <header className="tsx-head">
          <span className="tsx-ico" aria-hidden="true">{modeIcon(f.transportMode)}</span>
          <span className="tsx-head-copy">
            <h3 className="tsx-q">How you travel</h3>
            <p className="tsx-a">The mode decides the cost math and which dials exist below.</p>
          </span>
          <span className="tsx-ans">{cap(f.transportMode)}{showsDriving ? ` · ${(f.driverCount ?? 1) === 1 ? '1 driver' : `${f.driverCount} drivers`}` : ''} · {fuelMode ? 'fuel math' : 'fare math'}</span>
        </header>
        {/* Transport mode — bench mode grid */}
        <div className="bench-block bench-mode-block">
          <span className="bench-eyebrow">How you travel</span>
          <div className="bench-mode-grid" role="group" aria-label="Transport mode">
            {TRANSPORT_MODES.map(m => (
              <button key={m} type="button" className={`bench-mode-btn${f.transportMode === m ? ' on' : ''}`}
                aria-pressed={f.transportMode === m} disabled={!editable}
                onClick={() => {
                  // #412: the vehicle fields are READ against the mode's own
                  // default profile. Switching car → motorcycle used to leave
                  // the previous vehicle's capacity/economy sitting in the
                  // boxes, so the dial re-read 45 L / 15 km-L on a bike — and
                  // a save then priced the bike trip with car numbers. The
                  // mode carries its profile defaults in with it. ('ev' is a
                  // vehicle TYPE, not a transport mode — an EV trip is
                  // car-mode with the electric profile picked below.)
                  const vt = m === 'motorcycle' ? 'motorcycle' : 'car'
                  const d = defaultVehicleProfile(vt)
                  const ft = m === 'motorcycle'
                    ? 'petrol'
                    : f.fuelType === 'electric' || f.fuelType === 'cng' ? 'petrol' : f.fuelType
                  setF(x => ({
                    ...x, transportMode: m,
                    vehicleType: vt, fuelType: ft,
                    capacity: String(d.capacity), vehicleEconomy: String(d.economy),
                  }))
                }}>
                {modeIcon(m)}
                <span className="bench-mode-name">{cap(m)}</span>
                <span className="bench-mode-speed" aria-hidden="true">{MODE_SPEED[m] ?? 40}</span>
              </button>
            ))}
          </div>
          <p className="bench-hint">Car and motorcycle switch cost math to fuel: distance ÷ economy × pump price.</p>
        </div>
        {/* Who's driving — party + dinner pace (#142). Gated on the CONTROL
            answer, not the planner's: a Mixed trip nobody has answered shows
            the question instead of dials for a setting nobody has set. */}
        {showsDriving && (
          <div className="bench-block">
            <div className="bench-block-head">
              <span className="bench-eyebrow">Who&apos;s driving</span>
              <span className="bench-block-value">
                {(f.driverCount ?? 1) === 1 ? 'One driver' : `${f.driverCount} drivers`}
              </span>
            </div>
            <div className="tset-choice-row" role="group" aria-label="Drivers sharing the wheel">
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
            <div className="tset-choice-row" role="group" aria-label="Who is aboard">
              <button type="button" className={`bench-crew-btn${!f.hasVulnerable ? ' on' : ''}`}
                aria-pressed={!f.hasVulnerable} disabled={!editable}
                title="Everyone adult — full-length driving days"
                onClick={() => setF(x => ({ ...x, hasVulnerable: undefined }))}>Everyone adult</button>
              <button type="button" className={`bench-crew-btn${f.hasVulnerable ? ' on' : ''}`}
                aria-pressed={!!f.hasVulnerable} disabled={!editable}
                title="Infants or seniors aboard — shorter days, earlier dinner"
                onClick={() => setF(x => ({ ...x, hasVulnerable: true }))}>Infants / seniors</button>
            </div>
            <div className="tset-choice-row" role="group" aria-label="Dinner and driving">
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
        {/* Fuel + vehicle — only for self-drive modes */}
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
                <InlineIcon icon={TriangleAlert} size={12} gap={3} />Unusual for a {f.transportMode} — most do far better. Double-check the mileage.
              </p>
            )}
            {priceIgnored && (
              <p className="hint-text ts-warn-note">
                <InlineIcon icon={TriangleAlert} size={12} gap={3} />Your fuel price is unused until you set a mileage — the bill is pricing the blended {cap(f.transportMode)} rate instead.
              </p>
            )}
            <button type="button" className={`bench-toggle${f.roundTrip ? ' on' : ''}`}
              aria-pressed={f.roundTrip} disabled={!editable}
              aria-label={`Round trip${f.roundTrip ? ' — the return to start is included in transport costs' : ' — off, one-way costs only'}`}
              onClick={() => setF(x => ({ ...x, roundTrip: !x.roundTrip }))}>
              Round trip{f.roundTrip ? ' — return included' : ''}
            </button>
            <div className="vehicle-profile-form">
              <div className="form-row">
                <Field label="Vehicle type">
                  <Select disabled={!editable} value={f.vehicleType} onChange={v => setF(x => ({ ...x, vehicleType: v as never }))}
                    options={[{ value: 'car', label: 'Car' }, { value: 'motorcycle', label: 'Motorcycle' }, { value: 'ev', label: 'Electric (EV)' }]} />
                </Field>
                <Field label="Fuel / energy">
                  <Select disabled={!editable} value={f.fuelType} onChange={v => setF(x => ({ ...x, fuelType: v as never }))}
                    options={[{ value: 'petrol', label: 'Petrol' }, { value: 'diesel', label: 'Diesel' }, { value: 'electric', label: 'Electric' }, { value: 'cng', label: 'CNG' }]} />
                </Field>
              </div>
              <div className="form-row">
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
      </Surface>

          {/* ---------- People & sharing ---------- */}
          <Surface as="section" className="tsx-card" id="tset-people" aria-label="People and sharing">
            <header className="tsx-head">
              <span className="tsx-ico" aria-hidden="true"><Users size={18} /></span>
              <span className="tsx-head-copy">
                <h3 className="tsx-q">People &amp; sharing</h3>
                <p className="tsx-a">Who can see this trip, and who can change it.</p>
              </span>
            </header>
            <div className="tset-people">
              <span className="tset-stack" aria-hidden="true">
                {members.slice(0, 4).map((m, i) => (
                  <span key={m.userId} className={`tset-av tset-av--${i % 4}`}>
                    {initialsOf(nameOf(m.userId))}
                  </span>
                ))}
              </span>
              <span className="tset-people-copy">
                <b>{members.length} member{members.length === 1 ? '' : 's'} · {editors} can edit</b>
                <span>{trip.visibility === 'public' ? 'Public — anyone with the link can read it' : 'Link sharing off'}</span>
              </span>
            </div>
          </Surface>

          {/* ---------- Archive or delete ----------
              Owner only, as the artboard says. Archive has no API yet, so the
              card says so instead of offering a button that would do nothing;
              trash is real and carries its undo. */}
          {role === 'owner' && (
            <Surface as="section" className="tsx-card tsx-card--danger" id="tset-danger" aria-label="Archive or delete">
              <header className="tsx-head">
                <span className="tsx-ico" aria-hidden="true"><TriangleAlert size={18} /></span>
                <span className="tsx-head-copy">
                  <h3 className="tsx-q">Archive or delete</h3>
                  <p className="tsx-a">Only the owner sees this section.</p>
                </span>
              </header>
              <div className="tset-danger-pair">
                <div className="tset-danger-cell">
                  <b>Archive</b>
                  <span>Not built yet — the trip stays where it is.</span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled>Archive</button>
                </div>
                <div className="tset-danger-cell tset-danger-cell--trash">
                  <b>Move to trash</b>
                  <span>Restorable for 30 days, then gone.</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                    trashTrip(trip)
                    undoToast(`Moved “${trip.name}” to trash`, () => {
                      restoreTrashedTrip(trip)
                      toast(`Restored “${trip.name}”`)
                    })
                  }}>Move to trash</button>
                </div>
              </div>
            </Surface>
          )}
        </div>

        {saveAside}
      </div>

      {/* The save bar stays for a keyboard user who scrolled past the panel:
          the same verbs, reachable from anywhere on the page. */}
      <StickyFormBar show>
        {/* #413: a viewer used to get a vanished bar under disabled inputs —
            permissioned read as broken. The bar renders for everyone; a
            viewer gets it disabled with the reason said out loud. */}
        {!editable && (
          <span className="ts-savebar-note hint-text" role="status">
            <InlineIcon icon={TriangleAlert} size={12} gap={3} />Only editors can change trip settings — ask an editor on this trip, or duplicate it to edit your own copy.
          </span>
        )}
        {/* #704: a save in flight is its own answer, so it gets its own block
            with its own role. The failed line keeps its own markup: it is
            pinned verbatim by tests/trip-settings-result.test.ts. */}
        {savingSettings && (
          <div className="set-save-state">
            <StateBlock kind="loading" size="compact" title="Saving your settings." />
          </div>
        )}
        {writeErr && <span className="err-text" role="alert">{writeErr}</span>}
        <button className="btn btn-primary" disabled={!canSave || savingSettings}
          title={canSave ? undefined : dry.ok ? 'No changes' : dry.reason} onClick={() => {
          // #408: the Preview and this button run the SAME dry run. A refusal
          // is already rendered inline (and in the receipt) — clicking Save on
          // a refused form is a no-op, never a toast that fades.
          if (!dry.ok) return
          if (dry.startCoordsDropped) setStartNotice(START_DROPPED)
          setWriteErr(null)
          if (updateTrip(trip.id, dry.patch)) {
            // Our own save moves updatedAt — rebase the remote-edit watch so
            // the banner cannot fire on ourselves (#414).
            ownSaveRef.current = true
            // #704: "Trip settings updated" waits for the server. The cache
            // already holds the edit, so the page reads the saved values meanwhile.
            const verdict = tripWriteVerdict(trip.id)
            if (verdict) {
              setSavingSettings(true)
              void verdict.then(saved => {
                setSavingSettings(false)
                if (saved) toast('Trip settings updated')
                else setWriteErr(TRIP_SETTINGS_NOT_SAVED)
              })
            }
          }
        }}>{savingSettings ? 'Saving…' : 'Save settings'}</button>
      </StickyFormBar>
    </div>
  )
}
