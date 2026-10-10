// ============ Explore — filter bar ============
// Travel-style chips with counts, the Saved toggle, three selects and Clear.
// The page owns the state and the URL. This bar only shows it and reports taps.
// The bar is a stacking host, so the select menus open above the cards.
import { Heart, X } from 'lucide-react'
import { Select } from '../Select'

export interface StyleOption { value: string; label: string; count: number }

const DURATION_OPTIONS = [
  { value: 'all', label: 'Any length' },
  { value: 'short', label: '≤3 days' },
  { value: 'medium', label: '4–6 days' },
  { value: 'long', label: '7+ days' },
]
const BUDGET_OPTIONS = [
  { value: '', label: 'Any budget' },
  { value: '10000', label: 'Under ₹10k' },
  { value: '20000', label: 'Under ₹20k' },
  { value: '35000', label: 'Under ₹35k' },
  { value: '60000', label: 'Under ₹60k' },
]
const SORT_OPTIONS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest first' },
  { value: 'budget-asc', label: 'Budget: low → high' },
  { value: 'budget-desc', label: 'Budget: high → low' },
  { value: 'duration', label: 'Longest first' },
]

export function ExploreFilterBar({
  styles, style, onAllStyles, onToggleStyle,
  savedOnly, savedCount, onToggleSaved,
  duration, onDuration, maxBudget, onBudget, sortKey, onSort,
  filtersActive, onClear,
}: {
  styles: StyleOption[]
  style: string
  onAllStyles: () => void
  onToggleStyle: (style: string) => void
  savedOnly: boolean
  savedCount: number
  onToggleSaved: () => void
  duration: string
  onDuration: (value: string) => void
  maxBudget: string
  onBudget: (value: string) => void
  sortKey: string
  onSort: (value: string) => void
  filtersActive: boolean
  onClear: () => void
}) {
  return (
    <div className="ex-filterbar explore-filterbar">
      <div className="ex-chip-row">
        <div className="ex-chips" role="group" aria-label="Travel style">
          <button type="button" className="ex-chip" aria-pressed={style === 'all'} onClick={onAllStyles}>All styles</button>
          {styles.map(option => (
            <button key={option.value} type="button" className="ex-chip" aria-pressed={style === option.value}
              onClick={() => onToggleStyle(option.value)}>
              {option.label} <span className="ex-chip-count">{option.count}</span>
            </button>
          ))}
        </div>
        {/* Saved sits in the same wrapping row as the style chips. */}
        <button type="button" className="ex-chip ex-chip-saved" aria-pressed={savedOnly} onClick={onToggleSaved}>
          <Heart size={14} aria-hidden fill={savedOnly ? 'currentColor' : 'none'} />
          Saved{savedCount > 0 && <span className="ex-chip-count">{savedCount}</span>}
        </button>
      </div>
      <div className="ex-selects">
        <div className="ex-select">
          <Select value={duration} onChange={onDuration} aria-label="Duration" options={DURATION_OPTIONS} />
        </div>
        <div className="ex-select">
          <Select value={maxBudget} onChange={onBudget} aria-label="Max budget" options={BUDGET_OPTIONS} />
        </div>
        <div className="ex-select ex-select--sort">
          <Select value={sortKey} onChange={onSort} aria-label="Sort by" options={SORT_OPTIONS} />
        </div>
        {filtersActive && (
          <button type="button" className="btn btn-quiet ex-clear" onClick={onClear}>
            <X size={13} aria-hidden />Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
