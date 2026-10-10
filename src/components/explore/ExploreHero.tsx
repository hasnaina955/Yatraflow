// ============ Explore — hero and search ============
// The page title, one line of context and the route search. The papercut
// skyline sits along the bottom edge, as on My trips.
import { useId } from 'react'
import { Search, X } from 'lucide-react'
import { BannerPanorama } from '../trips/TripArt'

export function ExploreHero({ query, onQueryChange, onClear }: {
  query: string
  onQueryChange: (next: string) => void
  onClear: () => void
}) {
  const titleId = useId()
  const inputId = useId()
  return (
    <section className="ex-hero" aria-labelledby={titleId}>
      <div className="ex-hero-inner">
        <h1 id={titleId}>Find your next <em>great journey.</em></h1>
        <p className="ex-hero-lede">Discover routes shared by the community. Make one your own.</p>
        <div className="ex-search">
          <label className="sr-only" htmlFor={inputId}>Search by route, place or creator</label>
          <Search className="ex-search-icon" size={18} aria-hidden />
          <input id={inputId} className="ex-search-input" type="search" autoComplete="off"
            placeholder="Search a route, place or creator" value={query}
            onChange={e => onQueryChange(e.target.value)} />
          {query.trim() !== '' && (
            <button type="button" className="ex-search-clear" aria-label="Clear search" onClick={onClear}>
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <BannerPanorama />
    </section>
  )
}
