// W4-B: the Drive scope band on the map. Pure counts and one card.
// It reads no store and invents no value. An unknown count leaves its part out.
import { Select } from '../../../components/Select'
import { MINUTE_SCOPE_STEPS, type ScopeMinutes } from './minuteScope'
import type { ScopeBand } from './driveLens'

/** Counts of known scope bands. A null count means that part stays out. */
export interface ScopeBandCounts {
  inside: number | null
  justPast: number | null
  worthDetour: number | null
}

/** Bucket scope bands. Unknown and over-budget bands are not counted. */
export function bandCounts(bands: readonly ScopeBand[]): ScopeBandCounts {
  let inside = 0
  let justPast = 0
  let worthDetour = 0
  for (const band of bands) {
    if (band === 'inside') inside += 1
    else if (band === 'just-past') justPast += 1
    else if (band === 'outside') worthDetour += 1
  }
  return { inside, justPast, worthDetour }
}

/** One known count as a numeral and its label. A null count leaves its part out. */
export function scopeBandCountParts(counts: ScopeBandCounts | null): { value: number; label: string }[] | null {
  if (counts == null) return null
  const parts: { value: number; label: string }[] = []
  if (counts.inside != null) parts.push({ value: counts.inside, label: 'Inside' })
  if (counts.justPast != null) parts.push({ value: counts.justPast, label: 'Just past it' })
  if (counts.worthDetour != null) parts.push({ value: counts.worthDetour, label: 'Worth the detour' })
  return parts.length > 0 ? parts : null
}

/** One line of known counts. No separators; the numerals are bold in the markup. */
export function scopeBandCountsText(counts: ScopeBandCounts | null): string | null {
  const parts = scopeBandCountParts(counts)
  return parts == null ? null : parts.map(part => `${part.value} ${part.label}`).join(' ')
}

/** A phone lens button hides its word, so its label names the lens and count.
 *  An unknown count says it is unknown. */
export function phoneLensAriaLabel(name: string, count: number | null): string {
  return count == null ? `${name}, count unknown` : `${name}, ${count}`
}

/** The counts line as one spoken sentence. The parts join with ", " so a
 *  screen reader pauses between them. The visual line keeps no separator. */
export function scopeBandCountsSpoken(counts: ScopeBandCounts | null): string | null {
  const parts = scopeBandCountParts(counts)
  return parts == null ? null : parts.map(part => `${part.value} ${part.label}`).join(', ')
}

/** The visible count. With a known budget it says what fits; with an unknown
 *  planned spend it states the scope only and makes no budget claim. */
export function scopeCountText(counts: ScopeBandCounts | null, minutes: ScopeMinutes, budgetKnown: boolean): string {
  if (counts?.inside == null) return 'Count unavailable'
  return budgetKnown ? `Fits: ${counts.inside}` : `Within ${minutes} min: ${counts.inside}`
}

export function MapScopeBand({ minutes, onMinutes, counts, disabled = false, status = null, budgetKnown = true }: {
  minutes: ScopeMinutes
  onMinutes: (next: ScopeMinutes) => void
  counts: ScopeBandCounts | null
  disabled?: boolean
  status?: string | null
  /** False when the day's planned detour spend is not measured. */
  budgetKnown?: boolean
  snap?: string
  phone?: boolean
}) {
  const countLabel = counts?.inside == null ? 'Count unavailable' : budgetKnown ? `${counts.inside} picks fit scope and budget` : `${counts.inside} picks within ${minutes} min. Budget not measured.`
  return <section className="mv2-lens-scope-band" data-placement="deck" aria-label="Drive scope">
    <Select aria-label="Extra driving there and back" value={String(minutes)} disabled={disabled}
      options={MINUTE_SCOPE_STEPS.map(step => ({ value: String(step), label: `Within ${step} min` }))}
      onChange={value => {
        const next = MINUTE_SCOPE_STEPS.find(step => String(step) === value)
        if (next != null) onMinutes(next)
      }} />
    <span className="mv2-lens-scope-count" role="status" aria-label={status ?? countLabel} title={countLabel}>{status ?? scopeCountText(counts, minutes, budgetKnown)}</span>
  </section>
}
