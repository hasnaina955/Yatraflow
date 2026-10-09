const ROOT = '/img/mockup-adopted/'
export const MY_TRIPS_BANNER = `${ROOT}hero-banner.jpg`
export const EXPLORE_HERO = `${ROOT}ch-hero.jpg`

const ROUTE_PHOTOS = [
  { places: ['kerala', 'kochi', 'alleppey', 'alappuzha', 'munnar', 'varkala'], file: 'kerala-backwaters.jpg' },
  { places: ['goa', 'panjim', 'panaji'], file: 'goa-panjim.jpg' },
  { places: ['rajasthan', 'jaipur', 'jodhpur', 'udaipur', 'jaisalmer'], file: 'rajasthan-forts.jpg' },
  { places: ['spiti', 'kaza', 'tabo'], file: 'spit-valley.jpg' },
  { places: ['shimla', 'manali', 'himachal'], file: 'himalayan-loop.jpg' },
] as const

/** Decorative route imagery. This never changes the saved-cover verdict. */
export function editorialRouteCover(destinations: readonly string[]): string | undefined {
  for (const destination of destinations) {
    const words = destination.toLowerCase().split(/[^a-z]+/).filter(Boolean)
    const photo = ROUTE_PHOTOS.find(candidate => candidate.places.some(place => words.includes(place)))
    if (photo) return ROOT + photo.file
  }
  return undefined
}
