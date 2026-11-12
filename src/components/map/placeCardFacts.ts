// Pure facts for the place card: photo keys, attribution, data age and coverage.
// Each helper returns null for an unknown fact, so the card shows nothing then.
import type { DiscoveryCoverage, PlaceFacts, PlacePhotoRef } from '../../lib/providers/hits'
import { formatHM, type TimeFormat } from '../../lib/timefmt'
import { SLOT_SEARCH_PROVENANCE } from '../../pages/trip/map/slotFiling'

export { SLOT_SEARCH_PROVENANCE }

/** The next photo index for a key. Null for any key that is not navigation, or for one photo. */
export function photoStep(index: number, count: number, key: string): number | null {
  if (count < 2) return null
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/** The credit line. The link is kept only when it is https, so a bad value is plain text. */
export function attributionOf(ref: Pick<PlacePhotoRef, 'attribution'>): { text: string; href: string | null } {
  const uri = ref.attribution.authorUri
  return { text: ref.attribution.text, href: uri != null && /^https:\/\//i.test(uri) ? uri : null }
}

/** How old the row's data is, from its own fetch time. Unknown or future times say nothing. */
export function ageText(fetchedAt: number | null | undefined, now: number): string | null {
  if (fetchedAt == null || !Number.isFinite(fetchedAt) || fetchedAt > now) return null
  const min = Math.floor((now - fetchedAt) / 60_000)
  if (min < 1) return 'Checked just now'
  if (min < 60) return `Checked ${min} min ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `Checked ${hours} h ago`
  const days = Math.floor(hours / 24)
  return `Checked ${days} day${days === 1 ? '' : 's'} ago`
}

/** What the search covered. Reach that was not measured says nothing. */
export function coverageText(coverage: DiscoveryCoverage | null | undefined): string | null {
  if (!coverage) return null
  if (coverage.complete) return 'Whole road searched'
  const { coveredKm, totalKm } = coverage
  if (coveredKm == null || totalKm == null || !Number.isFinite(coveredKm) || !Number.isFinite(totalKm)) return null
  return `Searched ${Math.round(coveredKm)} of ${Math.round(totalKm)} km of the road`
}

/** The reader's name of a place source. Null when the source is not supplied. */
export function sourceNameOf(source: string | null | undefined): string | null {
  switch (source) {
    case 'google': return 'Google Places'
    case 'osm': return 'OpenStreetMap'
    case 'wikipedia': return 'Wikipedia'
    case 'mappls': return 'Mappls'
    case 'open-meteo': return 'Open-Meteo'
    default: return null
  }
}

/** The deck's provenance line: the sources of the shown places, then the data
 *  age and the road coverage. Each part shows only when it is known. A deck
 *  with no known source gives null, so no line is drawn. */
export function deckSourceLine(args: {
  sources: ReadonlyArray<string | null | undefined>
  fetchedAt: number | null | undefined
  coverage: DiscoveryCoverage | null | undefined
  now: number
}): string | null {
  const names: string[] = []
  for (const source of args.sources) {
    const name = sourceNameOf(source)
    if (name != null && !names.includes(name)) names.push(name)
  }
  if (names.length === 0) return null
  const parts = [names.join(' and '), ageText(args.fetchedAt, args.now), coverageText(args.coverage)]
  return parts.filter((part): part is string => part != null).join(' · ')
}

/** A review count as the boards draw it: 480, 1.2k, 12k. Unknown gives null. */
export function compactCount(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null
  const whole = Math.round(count)
  if (whole < 1000) return String(whole)
  const thousands = whole / 1000
  return `${thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`
}

/** The kind word of the detail kicker, from the hit category. */
export function kindWordOf(category: string | null | undefined): string {
  const word = (category ?? '').trim().toLowerCase()
  if (word === '') return 'Place'
  if (word === 'sightseeing') return 'Sight'
  if (word === 'hotel') return 'Stay'
  return word.charAt(0).toUpperCase() + word.slice(1).replace(/-/g, ' ')
}

/**
 * The fact chips of one pick card, in board order: why it fits, when it closes,
 * the food type. A chip shows only when the hit or the engine carries the fact;
 * a hit with no data gives no chip. The slot-search provenance is bookkeeping,
 * so it never shows. A repeated fact shows once.
 */
export function pickFactChips(args: {
  reason: string | null | undefined
  hit: { closeTime?: string | null; facts?: PlaceFacts | null }
  format: TimeFormat
}): string[] {
  const chips: string[] = []
  const add = (text: string | null | undefined) => {
    const clean = text?.trim() ?? ''
    if (clean === '' || clean === SLOT_SEARCH_PROVENANCE || chips.includes(clean)) return
    chips.push(clean)
  }
  add(args.reason)
  add(args.hit.facts?.why)
  const close = /^(\d{1,2}):(\d{2})$/.exec(args.hit.closeTime?.trim() ?? '')
  if (close != null && Number(close[1]) < 24 && Number(close[2]) < 60) add(`open till ${formatHM(`${close[1]}:${close[2]}`, args.format)}`)
  add(args.hit.facts?.diet)
  return chips
}
