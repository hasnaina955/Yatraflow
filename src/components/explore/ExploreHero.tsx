// ============ Explore — hero ============
// The page label, the headline, one line of context, the search field, two
// quick picks, four catalog counts and a trio of papercut postcards with the
// catalog's own fork count on a note.
//
// The search field is the page's only one. It reads and writes the page's query
// (the same state the URL carries), and the filter bar has none, so there is no
// second source of truth. Search jumps to the results. A quick pick is a toggle
// on a filter the bar already has (length, budget), so it needs no state of its
// own. The count note is real data — the sum of `copies` over
// the live catalog — and it prints only when that sum is above zero, because a
// zero here would be a claim over a read that may not have happened.
//
// The handwritten note this slot used to carry is gone: the headline says the
// same words, and the note now carries a figure the reader cannot get anywhere
// else on the page at a glance.
//
// Each postcard shows the scene its own place resolves to. The place layer is
// asked first with the postcard's place name, so "Srinagar" reaches the J&K
// scene and "Alappuzha" reaches the Kerala scene rather than the state default.
// The seven-region scene stays as the answer when the place layer has nothing
// specific to say. The motif remains the loading and error floor. The postcard
// set is static, so the seed is the place name: a postcard keeps its scene.
import { ART_MANIFEST, artIdFor } from '../../lib/regionArt'
import { placeArtFor, placeFallbacksFrom } from '../../lib/placeArt'
import type { TripRegion } from '../../lib/tripsPage'
import { RegionArt } from '../RegionArt'
import { TripArt } from '../trips/TripArt'
import { SearchField } from '../filters/SearchField'
import { FilterChip } from '../filters/FilterChip'
import { PageHero } from '../page/PageHero'

export interface HeroStat { label: string; value: number }

const POSTCARDS: { region: TripRegion; place: string; className: string }[] = [
  { region: 'kashmir', place: 'Srinagar', className: 'ex-pc-1' },
  { region: 'kerala', place: 'Alappuzha', className: 'ex-pc-2' },
  { region: 'rajasthan', place: 'Udaipur', className: 'ex-pc-3' },
]

/**
 * `.ex-postcard` is 32% of `.ex-hero-visual`, which caps at 480px, less its own
 * 7px side padding (styles.css:8509, 8514-8515, 8520): 480 * .32 - 14 = 139.6.
 * The postcards are `display: none` below 960px (8566), so no smaller case exists.
 */
const POSTCARD_SIZES = '140px'

export interface QuickPick { key: string; label: string; pressed: boolean; onToggle: () => void }

export function ExploreHero({ stats, forks, query, onQueryChange, onSearch, quickPicks }: {
  stats: HeroStat[]
  /** The live catalog's total forks. The note prints only above zero. */
  forks: number
  query: string
  onQueryChange: (next: string) => void
  /** Search (button or Enter): bring the results to the top. */
  onSearch: () => void
  quickPicks: QuickPick[]
}) {
  return (
    <PageHero
      kicker="Explore · plans from the community"
      headline={{ lead: 'Find a plan, fork it,', accent: 'make it yours.' }}
      lede="Real trips from real travellers, with every drive and stop timed. Fork one into your trips and change anything."
      primary={
        <form className="ex-hero-search" role="search" aria-label="Search itineraries"
          onSubmit={event => { event.preventDefault(); onSearch() }}>
          <SearchField value={query} onChange={onQueryChange} label="Search by route, place or creator"
            placeholder="Search a route, place or creator" shortPlaceholder="Search routes" />
          <button type="submit" className="btn btn-primary ex-hero-search-go">Search</button>
        </form>
      }
      secondary={
        <div className="ex-quick" role="group" aria-label="Quick picks">
          {quickPicks.map(pick => (
            <FilterChip key={pick.key} className="ex-quick-chip" pressed={pick.pressed} onClick={pick.onToggle}>
              {pick.label}
            </FilterChip>
          ))}
        </div>
      }
      stats={stats}
      statsPlacement="below"
      statsLabel="Catalog at a glance"
      visual={
        <>
          <div className="ex-postcards">
            <svg className="ex-route-line" viewBox="0 0 480 272" preserveAspectRatio="none" focusable="false">
              <path d="M46 150C80 110 130 76 190 82S330 30 372 70 340 170 300 172" />
              <circle cx="46" cy="150" r="4" />
            </svg>
            {POSTCARDS.map(card => {
              const place = placeArtFor([card.place], card.place, placeFallbacksFrom(ART_MANIFEST))
              const id = place && place.kind !== 'generic' ? place.id : artIdFor(card.region, card.place)
              return (
                <figure className={`ex-postcard ${card.className}`} key={card.place}>
                  <div className="ex-postcard-art">
                    <RegionArt
                      id={id}
                      ratio="4:3"
                      sizes={POSTCARD_SIZES}
                      fallback={<TripArt region={card.region} />}
                    />
                  </div>
                  <figcaption>{card.place}<span className="ex-stamp" /></figcaption>
                </figure>
              )
            })}
          </div>
          {forks > 0 && <p className="ex-forks-note"><b>{forks}</b> forks and counting</p>}
        </>
      }
    />
  )
}
