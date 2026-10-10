// ============ Explore — filter bar ============
// The search field, three selects, then the travel-style chips with counts, the
// Saved toggle and Clear. The page owns the state and the URL. This bar only
// shows it and reports taps. The bar is a stacking host, so the select menus
// open above the cards. On a phone the selects fold behind a Filters button.
import { useEffect, useId, useState } from 'react'
import { ArrowDownUp, Heart, Search, SlidersHorizontal, X } from 'lucide-react'
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

/** A phone has room for a short placeholder only; the long one is cut off. */
function useShortPlaceholder(): boolean {
  const [short, setShort] = useState(() => typeof window !== 'undefined' && (window.matchMedia?.('(max-width: 640px)').matches ?? false))
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 640px)')
    if (!query) return
    const sync = () => setShort(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return short
}

export function ExploreFilterBar({
  query, onQueryChange,
  styles, style, onAllStyles, onToggleStyle,
  savedOnly, savedCount, onToggleSaved,
  duration, onDuration, maxBudget, onBudget, sortKey, onSort,
  filtersActive, onClear,
}: {
  query: string
  onQueryChange: (next: string) => void
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
  const inputId = useId()
  const selectsId = useId()
  const shortPlaceholder = useShortPlaceholder()
  const [selectsOpen, setSelectsOpen] = useState(false)
  const selectCount = (duration !== 'all' ? 1 : 0) + (maxBudget !== '' ? 1 : 0) + (sortKey !== 'popular' ? 1 : 0)
  return (
    <div className="ex-filterbar explore-filterbar" role="search" aria-label="Filter itineraries">
      <div className="ex-filter-row">
        <div className="ex-search">
          <label className="sr-only" htmlFor={inputId}>Search by route, place or creator</label>
          <Search className="ex-search-icon" size={18} aria-hidden />
          <input id={inputId} className="ex-search-input" type="search" autoComplete="off"
            placeholder={shortPlaceholder ? 'Search routes' : 'Search a route, place or creator'} value={query}
            onChange={e => onQueryChange(e.target.value)} />
          {query.trim() !== '' && (
            <button type="button" className="ex-search-clear" aria-label="Clear search" onClick={() => onQueryChange('')}>
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
        <button type="button" className="btn btn-secondary ex-filters-toggle" aria-expanded={selectsOpen}
          aria-controls={selectsId} onClick={() => setSelectsOpen(open => !open)}>
          <SlidersHorizontal size={15} aria-hidden />Filters
          {selectCount > 0 && <span className="ex-filters-count">{selectCount}</span>}
        </button>
        <div className={`ex-selects${selectsOpen ? ' is-open' : ''}`} id={selectsId}>
          <div className="ex-select">
            <Select value={duration} onChange={onDuration} aria-label="Duration" options={DURATION_OPTIONS} />
          </div>
          <div className="ex-select">
            <Select value={maxBudget} onChange={onBudget} aria-label="Max budget" options={BUDGET_OPTIONS} />
          </div>
          <div className="ex-select ex-select--sort">
            <ArrowDownUp className="ex-select-icon" size={15} aria-hidden />
            <Select value={sortKey} onChange={onSort} aria-label="Sort by" options={SORT_OPTIONS} />
          </div>
        </div>
      </div>
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
        <span className="ex-chip-divider" aria-hidden="true" />
        {/* Saved sits in the same wrapping row as the style chips. */}
        <button type="button" className="ex-chip ex-chip-saved" aria-pressed={savedOnly} onClick={onToggleSaved}>
          <Heart size={14} aria-hidden fill={savedOnly ? 'currentColor' : 'none'} />
          Saved{savedCount > 0 && <span className="ex-chip-count">{savedCount}</span>}
        </button>
        {filtersActive && (
          <button type="button" className="btn btn-quiet ex-clear" onClick={onClear}>
            <X size={13} aria-hidden />Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
