// W4-B: the Drive scope band on the map. Pure counts and one card.
// It reads no store and invents no value. An unknown count leaves its part out.
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

/** One line of known counts. A null count leaves its part out. */
export function scopeBandCountsText(counts: ScopeBandCounts | null): string | null {
  if (counts == null) return null
  const parts: string[] = []
  if (counts.inside != null) parts.push(`${counts.inside} inside`)
  if (counts.justPast != null) parts.push(`${counts.justPast} just past it`)
  if (counts.worthDetour != null) parts.push(`${counts.worthDetour} worth the detour`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** A phone lens button hides its word, so its label names the lens and count.
 *  An unknown count says it is unknown. */
export function phoneLensAriaLabel(name: string, count: number | null): string {
  return count == null ? `${name}, count unknown` : `${name}, ${count}`
}

/** Where the phone scope band sits. Peek hides it. Half and full put it in the
 *  sheet above the Drive cards, so it cannot cover the top row. A desktop band
 *  stays on the map. */
export function scopeBandPlacement(snap: string, phone: boolean): 'hidden' | 'in-sheet' | 'map' {
  if (!phone) return 'map'
  if (snap === 'peek') return 'hidden'
  if (snap === 'half' || snap === 'full') return 'in-sheet'
  return 'map'
}

export function MapScopeBand({ minutes, onMinutes, counts, snap = '', phone = false }: {
  minutes: ScopeMinutes
  onMinutes: (next: ScopeMinutes) => void
  counts: ScopeBandCounts | null
  snap?: string
  phone?: boolean
}) {
  const line = scopeBandCountsText(counts)
  const placement = scopeBandPlacement(snap, phone)
  return (
    <section className="mv2-lens-scope-band" data-placement={placement} hidden={placement === 'hidden'} aria-label="Drive scope">
      <p className="mv2-lens-scope-head">Look within <b>{minutes}</b> min there and back · or drag the band</p>
      <div className="mv2-lens-scope-chips" role="group" aria-label="Extra driving in minutes">
        {MINUTE_SCOPE_STEPS.map(step => (
          <button key={step} type="button" className="mv2-lens-scope-chip"
            aria-pressed={step === minutes} onClick={() => onMinutes(step)}>{step}</button>
        ))}
      </div>
      {line != null && <p className="mv2-lens-scope-counts" role="status">{line}</p>}
    </section>
  )
}
