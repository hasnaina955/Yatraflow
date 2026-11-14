// The place detail's "If you add it" panel. One pure module turns the existing
// add preview (editing/addPreview, the engine the Keep step reads) into the
// lines the panel draws. It makes no second formula: every number is a field of
// the preview. A fact the preview cannot prove has no line.
import type { Trip } from '../../../data/types'
import type { PlaceHit } from '../../../lib/geocode'
import type { FixChangeSet } from '../../../lib/mapLensContracts'
import { previewAdd, type AddPreview, type PreviewUnknownReason, type PreviewWarning, type ReadyAddPreview } from './editing/addPreview'
import { fixesForWarning, warningRefs } from './fixLens'
import { pickStopFor, roadInsertIndex } from './pickPreview'
import { NAMED_WARNING, warningNamedStop, warningSubjectStop } from './warningSubject'
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
  'day-missing': 'Preview · Day unavailable',
  'position-unknown': 'Road order · Not measured · New times unavailable',
  'coordinates-unknown': 'Place position · Unknown · New road unavailable',
  'visit-unknown': 'Visit length · Unknown · New times unavailable',
  'not-active': 'Preview · Stop outside plan',
}

/** The most moved stops the panel lists. The rest become one count line. */
const MAX_MOVED = 2

const SLOT_PREFIX = /^(breakfast|lunch|dinner|check[ -]?in)\s*[·:]\s*(.*)$/i

/** A warning title's day prefix. Inside one day's preview the prefix is noise. */
const DAY_PREFIX = /^Day\s+\d+\s*:\s*/i

/** The title a risk line opens with. The day prefix leaves, and a trailing
 *  colon goes, because the body follows after its own separator. */
export function warningTitleText(title: string): string {
  const label = title.replace(DAY_PREFIX, '').replace(/[\s:·]+$/, '').trim()
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** One sentence from a warning: the title, then the body. No day prefix, and
 *  no two facts run together without a separator. */
export function warningSentence(title: string, detail: string): string {
  const head = warningTitleText(title)
  const body = detail.trim()
  if (head === '') return body
  if (body === '') return head
  return `${head} · ${body}`
}

/** The stop a warning is about: its named title, its detail, then the linked
 *  fixed commitment. A warning that names no stop keeps a null subject. */
function warningSubject(preview: ReadyAddPreview, warning: PreviewWarning): string | null {
  const days = preview.proposedTrip.days
  const day = Array.isArray(days) ? days.find(entry => entry.index === preview.dayIndex) : undefined
  return warningSubjectStop(warning, day)
}

/** True when a warning names a stop, so a Clears line may be tied to that
 *  stop. A day-wide warning keeps its Clears line. */
function namedStopOf(warning: PreviewWarning): string | null {
  return warningNamedStop(warning.title)
}

/** A day's fixed commitments, whose clocks the add cannot move. */
function fixedStopIds(preview: ReadyAddPreview): Set<string> {
  return new Set((preview.proposedTrip.fixedCommitments ?? [])
    .filter(entry => entry.dayIndex === preview.dayIndex && entry.stopId != null)
    .map(entry => String(entry.stopId)))
}

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

/** The slot word of a stop title: "Dinner · Around the stay" reads "Dinner". */
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
  if (stay != null) parts.push({ text: `${labelStopName(stay.title)} · ${clock(stay.from)} unchanged` })
  if (meal != null) {
    const name = slotWord(meal.title)
    if (parts.length > 0) parts.push({ text: ' · ' })
    parts.push({ text: `${name} · Time held` })
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
  const orderChanged = preview.orderChanged === true
  const place = preview.insertion.afterTitle != null
    ? `After ${slotWord(preview.insertion.afterTitle)}`
    : 'First in day'
  // A re-ordered day says so first: a later stop that reads earlier is only
  // honest when the order moved, and the reader must see that before the clocks.
  lines.push({
    key: 'lands',
    tone: 'ok',
    parts: [{
      text: orderChanged
        ? `Order changed · Before ${preview.insertion.beforeTitle != null ? labelStopName(preview.insertion.beforeTitle) : 'Day end'}`
        : `Stop ${preview.insertion.order} · ${place}`,
    }],
  })

  const moved = preview.clocks.filter(entry => entry.deltaMin != null && entry.deltaMin !== 0)
  const fixedIds = fixedStopIds(preview)
  for (const entry of moved.slice(0, MAX_MOVED)) {
    // A fixed booking keeps its own clock. The preview's arrival moves, not
    // the commitment, so a retime line would say the booking moved.
    if (fixedIds.has(String(entry.stopId))) continue
    // A later stop never reads earlier while the order holds. That would be a
    // contradiction, not a plan change, so it earns no arrow line.
    if ((entry.deltaMin ?? 0) < 0 && !orderChanged) continue
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
    lines.push({ key: 'moved-more', tone: 'clock', parts: [{ text: `Later stops moved: ${more}` }] })
  }

  for (const warning of preview.warnings.added) {
    const named = warning.title.match(NAMED_WARNING)?.[1] ?? null
    const detail = named == null ? warning.detail : warning.detail.replace(`You reach ${named} ~`, 'You reach it ~')
    // One sentence, with its own separator: the title never runs into the body,
    // and the day prefix stays out of a preview that is already one day.
    const sentence = warningSentence(warning.title, detail)
    lines.push({
      key: `risk-${warning.code}-${warning.title}`,
      tone: 'risk',
      parts: textParts(sentence, clock),
    })
  }
  for (const warning of preview.warnings.cleared) {
    // A worse or new warning on the same stop means the stop is not clear.
    // Only a stop with no warning after the change earns the Clears line.
    const named = namedStopOf(warning)
    if (named == null) {
      lines.push({ key: `clears-${warning.code}-${warning.title}`, tone: 'ok', parts: [{ text: `Clears: ${warning.title}` }] })
      continue
    }
    const subject = warningSubject(preview, warning)
    if (subject != null && preview.warnings.added.some(added => warningSubject(preview, added) === subject)) continue
    lines.push({ key: `clears-${warning.code}-${warning.title}`, tone: 'ok', parts: [{ text: `Clears: ${warning.title}` }] })
  }

  const end = preview.dayEnd
  // The same rule as a stop row: the day cannot end earlier while the order
  // holds. That reading is a contradiction, not a plan change.
  if (end.deltaMin != null && end.deltaMin > 0) {
    lines.push({
      key: 'end',
      tone: 'clock',
      parts: [{ text: 'Day end ' }, { text: clock(end.from), struck: true }, { text: ' → ' }, { text: clock(end.to), bold: true }],
    })
  } else if (end.deltaMin === 0) {
    // Name the last stop when it also stays. The reader then knows exactly
    // which part of the evening is safe, not only that some later part is.
    const last = [...preview.clocks].reverse().find(entry => entry.deltaMin === 0)
    const calm = last == null
      ? 'Day end · Unchanged'
      : `${slotWord(last.title)} · Day end unchanged`
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
    .match(NAMED_WARNING)?.[1] ?? null
  return { set, stopTitle: stop == null ? named : labelStopName(stop.title) }
}
