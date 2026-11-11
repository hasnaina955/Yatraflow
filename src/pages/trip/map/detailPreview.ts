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

/** The slot word of a stop title: "Dinner · around the stay" reads "Dinner". */
export function slotWord(title: string): string {
  const match = SLOT_PREFIX.exec(title.trim())
  const word = match != null ? match[1].toLowerCase().replace(/[ -]/g, ' ') : title.trim()
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Text with its HH:MM clocks split out, so each clock can be formatted and bold. */
function textParts(text: string, clock: (hm: string) => string): PreviewPart[] {
  const parts: PreviewPart[] = []
  const clockPattern = /\b\d{1,2}:\d{2}\b/g
  let at = 0
  for (const match of text.matchAll(clockPattern)) {
    const index = match.index
    if (index == null) continue
    if (index > at) parts.push({ text: text.slice(at, index) })
    parts.push({ text: clock(match[0]), bold: true })
    at = index + match[0].length
  }
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts
}

/** The calm phone note: a stop that stays, and a meal slot already held. */
function fitLine(preview: ReadyAddPreview, clock: (hm: string) => string): PreviewLine | null {
  const days = preview.proposedTrip.days
  if (!Array.isArray(days)) return null
  const day = days.find(entry => entry.index === preview.dayIndex)
  if (!day) return null
  const movedIds = new Set(preview.clocks
    .filter(entry => entry.deltaMin != null && entry.deltaMin !== 0)
    .map(entry => entry.stopId))
  // A stop before the insertion keeps its clock too; the preview lists it
  // separately because it is never a change.
  const allClocks = [...preview.keptClocks, ...preview.clocks]
  const stay = allClocks.find(entry => entry.deltaMin === 0 && !movedIds.has(entry.stopId)
    && day.stops.some(stop => stop.id === entry.stopId && (stop.category === 'hotel' || /^check[ -]?in\b/i.test(stop.title))))
  const meal = day.stops.find(stop => stop.id !== preview.stopId && !movedIds.has(stop.id)
    && (/^(lunch|dinner)\b/i.test(stop.title) || stop.slotKey === 'lunch' || stop.slotKey === 'dinner'))
  const parts: PreviewPart[] = []
  if (stay != null) parts.push({ text: `${labelStopName(stay.title)} stays at ${clock(stay.from)}` })
  if (meal != null) {
    const name = slotWord(meal.title).toLowerCase()
    if (parts.length > 0) parts.push({ text: '; ' })
    parts.push({ text: `${name} time was already held for you` })
  }
  if (parts.length === 0) return null
  return { key: 'fit', tone: 'ok', parts }
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
    lines.push({ key: 'moved-more', tone: 'clock', parts: [{ text: `${more} more ${more === 1 ? 'stop moves' : 'stops move'} later` }] })
  }

  for (const warning of preview.warnings.added) {
    const named = warning.title.match(/^(?:Conflicts with|Thin buffer before)\s+(.+)$/)?.[1] ?? null
    const detail = named == null ? warning.detail : warning.detail.replace(`You reach ${named} ~`, 'You reach it ~')
    lines.push({
      key: `risk-${warning.code}-${warning.title}`,
      tone: 'risk',
      parts: [{ text: named == null ? warning.title : `${named}:` }, ...textParts(` ${detail}`, clock)],
    })
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
  } else if (end.deltaMin === 0) {
    // Name the last stop when it also stays. The reader then knows exactly
    // which part of the evening is safe, not only that some later part is.
    const last = [...preview.clocks].reverse().find(entry => entry.deltaMin === 0)
    const calm = last == null
      ? 'The day’s end does not move'
      : `${slotWord(last.title)} and the day’s end do not move`
    lines.push({ key: 'still', tone: 'ok', parts: [{ text: calm }] })
  }

  // A calm fact wins the phone line even when later stops move. A risk still
  // comes first: the reader must see the problem before the reassurance.
  const fit = preview.warnings.added.length === 0 ? fitLine(preview, clock) : null
  const summary = fit
    ?? lines.find(line => line.tone === 'risk')
    ?? lines.find(line => line.key === 'still')
    ?? lines.find(line => line.key.startsWith('moved-'))
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
  // A warning that names its stop in the title (a fixed commitment) has no
  // stopId. Its own words still name the real stop, so the action stays specific.
  const named = ready.warnings.added.find(warning => warning.code === target.code)?.title
    .match(/^(?:Conflicts with|Thin buffer before)\s+(.+)$/)?.[1] ?? null
  return { set, stopTitle: stop == null ? named : labelStopName(stop.title) }
}
