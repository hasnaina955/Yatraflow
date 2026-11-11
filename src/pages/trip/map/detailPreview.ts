// The place detail's "If you add it" panel. One pure module turns the existing
// add preview (editing/addPreview, the engine the Keep step reads) into the
// lines the panel draws. It makes no second formula: every number is a field of
// the preview. A fact the preview cannot prove has no line.
import type { Trip } from '../../../data/types'
import type { PlaceHit } from '../../../lib/geocode'
import type { FixChangeSet } from '../../../lib/mapLensContracts'
import { previewAdd, type AddPreview, type PreviewUnknownReason, type ReadyAddPreview } from './editing/addPreview'
import { fixesForWarning, warningRefs } from './fixLens'
import { pickStopFor, roadInsertIndex } from './pickPreview'
import type { LegCorrections } from '../../../lib/impact'

/** One piece of a line. A clock that moved shows the old one struck through. */
export interface PreviewPart {
  text: string
  bold?: boolean
  struck?: boolean
}

/** One line of the panel. The tone picks the icon: a check, a clock or a risk mark. */
export interface PreviewLine {
  key: string
  tone: 'ok' | 'clock' | 'risk'
  parts: PreviewPart[]
}

export interface DetailPreviewView {
  kind: 'ready' | 'unknown'
  /** The stop number the add would take. Null when the preview cannot place it. */
  order: number | null
  lines: PreviewLine[]
  /** The single line the phone shows: the worst fact, else the calm one. */
  summary: PreviewLine | null
}

const UNKNOWN_REASON: Record<PreviewUnknownReason, string> = {
  'day-missing': 'The day is not on this trip, so there is nothing to preview.',
  'position-unknown': 'The road order for this place is not known, so the new times are not known.',
  'coordinates-unknown': 'This place has no usable position, so the new road is not known.',
  'visit-unknown': 'The visit length is not known, so the new times are not known.',
  'not-active': 'This stop would not be on the plan, so there is nothing to preview.',
}

/** The most moved stops the panel lists. The rest become one count line. */
const MAX_MOVED = 2

const SLOT_PREFIX = /^(breakfast|lunch|dinner|check[ -]?in)\s*[·:]\s*(.*)$/i

/** A stop name as a sentence part. "Lunch · Nalla Ruchi Kitchen" reads "lunch". */
export function spokenStopName(title: string): string {
  const match = SLOT_PREFIX.exec(title.trim())
  if (match == null) return title.trim()
  return match[1].toLowerCase().replace(/[ -]/g, ' ')
}

/** A stop name as a label. "Check in · Spice Village" reads "Spice Village". */
export function labelStopName(title: string): string {
  const match = SLOT_PREFIX.exec(title.trim())
  return match != null && match[2].trim() !== '' ? match[2].trim() : title.trim()
}

/**
 * The panel lines for one preview. `clock` renders an "HH:MM" clock in the
 * reader's 12 h or 24 h format.
 */
export function detailPreviewView(preview: AddPreview, clock: (hm: string) => string): DetailPreviewView {
  if (preview.kind === 'unknown') {
    const line: PreviewLine = { key: 'unknown', tone: 'clock', parts: [{ text: UNKNOWN_REASON[preview.reason] }] }
    return { kind: 'unknown', order: null, lines: [line], summary: line }
  }
  const lines: PreviewLine[] = []
  const place = preview.insertion.afterTitle != null
    ? `in road order after ${spokenStopName(preview.insertion.afterTitle)}`
    : 'first on the day'
  lines.push({ key: 'lands', tone: 'ok', parts: [{ text: `Lands as stop ${preview.insertion.order}, ${place}` }] })

  const moved = preview.clocks.filter(entry => entry.deltaMin != null && entry.deltaMin !== 0)
  for (const entry of moved.slice(0, MAX_MOVED)) {
    lines.push({
      key: `moved-${entry.stopId}`,
      tone: 'clock',
      parts: [
        { text: `${labelStopName(entry.title)} ` },
        { text: clock(entry.from), struck: true },
        { text: ' → ' },
        { text: clock(entry.to), bold: true },
      ],
    })
  }
  if (moved.length > MAX_MOVED) {
    const more = moved.length - MAX_MOVED
    lines.push({ key: 'moved-more', tone: 'clock', parts: [{ text: `${more} more stop${more === 1 ? '' : 's'} move later` }] })
  }

  for (const warning of preview.warnings.added) {
    lines.push({ key: `risk-${warning.code}-${warning.title}`, tone: 'risk', parts: [{ text: warning.title }] })
  }
  for (const warning of preview.warnings.cleared) {
    lines.push({ key: `clears-${warning.code}-${warning.title}`, tone: 'ok', parts: [{ text: `Clears: ${warning.title}` }] })
  }

  const end = preview.dayEnd
  if (end.deltaMin != null && end.deltaMin !== 0) {
    lines.push({
      key: 'end',
      tone: 'clock',
      parts: [{ text: "The day's end " }, { text: clock(end.from), struck: true }, { text: ' → ' }, { text: clock(end.to), bold: true }],
    })
  } else if (end.deltaMin === 0 && moved.length === 0) {
    lines.push({ key: 'still', tone: 'ok', parts: [{ text: 'Later stops and the day’s end do not move' }] })
  }

  const summary = lines.find(line => line.tone === 'risk')
    ?? lines.find(line => line.key.startsWith('moved-'))
    ?? lines.find(line => line.key === 'still')
    ?? lines[0]
  return { kind: 'ready', order: preview.insertion.order, lines, summary }
}

/**
 * The passive preview for a pick that is not yet on the plan. It uses the same
 * stop and the same road position the Keep step uses, so the panel and the
 * add agree. Null when the day is not known.
 */
export function detailAddPreview(input: {
  trip: Trip
  dayIndex: number | null
  hit: PlaceHit
  routeKmOf: (lat: number, lng: number) => number | null | undefined
  legCorrections?: LegCorrections
}): AddPreview | null {
  const { trip, dayIndex, hit, routeKmOf, legCorrections } = input
  if (dayIndex == null) return null
  const day = trip.days.find(entry => entry.index === dayIndex)
  if (!day) return null
  const stop = pickStopFor(hit, `preview:${String(hit.id)}`)
  const insertAt = roadInsertIndex(day.stops, routeKmOf(hit.latitude, hit.longitude) ?? hit.cumKm, s => routeKmOf(s.lat, s.lng))
  return previewAdd({ trip, dayIndex, stop, insertAt, ...(legCorrections ? { legCorrections } : {}) })
}

/** A fix the engine offers for a warning the add would bring. */
export interface AddFixOffer {
  set: FixChangeSet
  /** The name of the stop the warning is about. Null when it names the day. */
  stopTitle: string | null
}

/**
 * The first verified fix for the first warning the add would bring, or null.
 * The Fix engine runs on the proposed plan, so a fix is offered only when the
 * engine proves it clears the problem and adds no severe one.
 */
export function addFixOffer(preview: AddPreview, trip: Trip): AddFixOffer | null {
  if (preview.kind !== 'ready' || preview.warnings.added.length === 0) return null
  const ready: ReadyAddPreview = preview
  const before = new Set(warningRefs(trip, ready.dayIndex).map(ref => `${ref.code}|${ref.stopId ?? ''}`))
  const fresh = warningRefs(ready.proposedTrip, ready.dayIndex)
    .filter(ref => !before.has(`${ref.code}|${ref.stopId ?? ''}`))
  const target = fresh.find(ref => ref.severe) ?? fresh[0]
  if (!target) return null
  const set = fixesForWarning(ready.proposedTrip, ready.dayIndex, { code: target.code, stopId: target.stopId }, 1)[0]
  if (!set) return null
  const day = ready.proposedTrip.days.find(entry => entry.index === ready.dayIndex)
  const stop = target.stopId == null ? null : day?.stops.find(entry => entry.id === target.stopId) ?? null
  return { set, stopTitle: stop == null ? null : labelStopName(stop.title) }
}
