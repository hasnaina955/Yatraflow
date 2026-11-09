// #898: the minute scope control. A radio group of four steps. Arrow keys move
// and select (the native radio pattern), Home and End jump, and only the chosen
// step is in the tab order. Every step is a 44px target. The counts line is a
// polite live region, so a screen reader hears the numbers change.
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { MINUTE_SCOPE_STEPS, scopeValueMinutesText, type ScopeCounts, type ScopeMinutes } from './minuteScope'

export type ScopeCountsState =
  | { kind: 'ready'; counts: ScopeCounts; note?: string }
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: string }

/** The counts sentence. Zero is said as zero. Unknown rows are named, never folded in. */
export function scopeCountsText(state: ScopeCountsState): string {
  if (state.kind === 'loading') return 'Counting places…'
  if (state.kind === 'unavailable') return state.reason
  const { inside, justPast, unknown } = state.counts
  const parts = [`${inside} inside`, `${justPast} just past`]
  if (unknown > 0) parts.push(`${unknown} with unknown driving`)
  if (state.note) parts.push(state.note)
  return parts.join(' · ')
}

export function MinuteScopeControl({ value, onChange, disabled, state }: {
  value: ScopeMinutes
  onChange: (next: ScopeMinutes) => void
  disabled?: boolean
  state: ScopeCountsState
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (to: number) => {
    const i = (to + MINUTE_SCOPE_STEPS.length) % MINUTE_SCOPE_STEPS.length
    onChange(MINUTE_SCOPE_STEPS[i])
    refs.current[i]?.focus()
  }
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i + 1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i - 1) }
    else if (e.key === 'Home') { e.preventDefault(); move(0) }
    else if (e.key === 'End') { e.preventDefault(); move(MINUTE_SCOPE_STEPS.length - 1) }
  }
  return (
    <div className="map-scope" data-testid="map-scope">
      <span className="map-scope-label" id="map-scope-label">Extra driving</span>
      <div className="map-scope-steps" role="radiogroup" aria-labelledby="map-scope-label" aria-describedby="map-scope-counts">
        {MINUTE_SCOPE_STEPS.map((minutes, i) => (
          <button
            key={minutes}
            ref={el => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={minutes === value}
            aria-label={scopeValueMinutesText(minutes)}
            tabIndex={minutes === value ? 0 : -1}
            disabled={disabled}
            className="map-scope-step"
            onClick={() => onChange(minutes)}
            onKeyDown={e => onKeyDown(e, i)}
          >
            {minutes} min
          </button>
        ))}
      </div>
      <p className="map-scope-counts" id="map-scope-counts" role="status" aria-live="polite">{scopeCountsText(state)}</p>
    </div>
  )
}
