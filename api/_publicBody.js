// The readable body of a published itinerary's share page (/i/<id>), and its
// structured data (#691). Pure: no I/O, no environment, so a test can feed it
// a hostile trip and read the HTML it would send.
//
// The trip arrives from the anonymous `get_public_trip` RPC. The database
// already stubs locked days, and this module is the second lock: it decides
// which days are free from the PUBLICATION's own fields and prints a locked
// day as its title and nothing else. Anything it does not understand is
// locked. It never prints a day's notes, times, costs, links or place ids.
//
// #700 — the publication's own free fields print beside the days: best season,
// travel tips, warnings and assumptions, the budget per person and the cover
// image with alt text. The paywall gates DAYS, never fields, and the public
// page prints these outside the day gate. So a locked plan still shows them.
// A field with no value is left out. A value of the wrong type is absent too.

export const LOCKED_MARKER = 'Locked —'

// The declared box of the body's picture. It is the same 1200×630 pair the
// head declares for the app's own social image. The pair only reserves space,
// so it is a layout value. It is not a claim about the stored file.
const COVER_BOX_WIDTH = 1200
const COVER_BOX_HEIGHT = 630

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function text(value, max = 600) {
  if (typeof value !== 'string') return ''
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${Array.from(clean).slice(0, max - 1).join('')}…` : clean
}

/** The printable strings of a publication list field.
 *  A missing or corrupt value reads as an empty list. A wrong-type item inside
 *  a real list is dropped. So nothing invented reaches the page. */
function listItems(value, max = 200) {
  if (!Array.isArray(value)) return []
  return value.map(item => text(item, max)).filter(Boolean)
}

/** The set of day indexes a stranger may read in full.
 *  An unpriced publication is free as a whole. A priced one, or one whose
 *  price field is missing, shows only the days its free list names. */
export function freeDaySet(publication) {
  const priceKnown = publication && 'premium_price_inr' in publication
  if (priceKnown && publication.premium_price_inr === null) return 'all'
  const list = publication?.free_day_indexes
  if (!Array.isArray(list)) return new Set()
  return new Set(list.filter(value => Number.isInteger(value) && value >= 0))
}

/** Split the trip's days into the parts the page prints.
 *  A free day that still carries the database's locked marker is demoted. */
export function planBody(publication, trip) {
  const days = Array.isArray(trip?.days) ? trip.days : []
  const free = freeDaySet(publication)
  return days.map((day, position) => {
    const stops = Array.isArray(day?.stops) ? day.stops : []
    const index = Number.isInteger(day?.index) ? day.index : null
    const stubbed = stops.some(stop => text(stop?.description).startsWith(LOCKED_MARKER))
    const open = index !== null && !stubbed && (free === 'all' || free.has(index))
    return {
      number: position + 1,
      title: text(day?.title, 160),
      open,
      stops: open
        ? stops.map(stop => ({
            title: text(stop?.title, 160),
            place: text(stop?.locationName, 160),
            description: text(stop?.description, 600),
          })).filter(stop => stop.title)
        : [],
    }
  })
}

/** The readable body.
 *
 *  `cover` is the publication's picture, already sized by the caller, because
 *  the head needs the same answer for og:image. An empty string prints no
 *  picture. */
export function renderBodyHTML(publication, trip, appHref, cover = '') {
  const parts = planBody(publication, trip)
  const title = text(publication?.title, 200)
  const heading = escapeHtml(title)
  const lead = text(publication?.tagline, 300)
  const facts = []
  if (Number.isFinite(Number(publication?.duration_days)) && Number(publication.duration_days) > 0) {
    facts.push(Number(publication.duration_days) === 1 ? '1 day' : `${Number(publication.duration_days)} days`)
  }
  const budget = Number(publication?.estimated_budget_per_person_inr)
  if (Number.isFinite(budget) && budget > 0) facts.push(`₹${budget.toLocaleString('en-IN')}/person`)
  const route = publication?.route_summary
  const routeText = Array.isArray(route) ? route.map(item => text(item, 80)).filter(Boolean).join(' → ') : text(route, 300)
  if (routeText) facts.push(routeText)
  // #700 — the publication's own free fields. Each one prints only when it has
  // a value, so an empty row never leaves a blank heading behind.
  const season = text(publication?.best_season, 120)
  const tips = listItems(publication?.travel_tips)
  const warnings = listItems(publication?.warnings_and_assumptions)
  const coverAlt = title ? `Cover image for ${title}` : 'Cover image for this itinerary'
  const dayHtml = parts.map(part => {
    const name = part.title ? `Day ${part.number}: ${escapeHtml(part.title)}` : `Day ${part.number}`
    if (!part.open) {
      return `<section><h2>${name}</h2><p>The full plan for this day is in the app.</p></section>`
    }
    const stops = part.stops.map(stop => {
      const place = stop.place && stop.place !== stop.title ? ` <span>(${escapeHtml(stop.place)})</span>` : ''
      const detail = stop.description ? `<p>${escapeHtml(stop.description)}</p>` : ''
      return `<li><h3>${escapeHtml(stop.title)}${place}</h3>${detail}</li>`
    }).join('')
    return `<section><h2>${name}</h2>${stops ? `<ol>${stops}</ol>` : ''}</section>`
  }).join('\n')
  const listed = (name, list) => list.length
    ? `<section><h2>${name}</h2><ul>${list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`
    : ''
  return `<main>
${heading ? `<h1>${heading}</h1>` : ''}
${lead ? `<p>${escapeHtml(lead)}</p>` : ''}
${facts.length ? `<p>${escapeHtml(facts.join(' · '))}</p>` : ''}
${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(coverAlt)}" width="${COVER_BOX_WIDTH}" height="${COVER_BOX_HEIGHT}" />` : ''}
${season ? `<section><h2>Best season</h2><p>${escapeHtml(season)}</p></section>` : ''}
${dayHtml}
${listed('Travel tips', tips)}
${listed('Warnings and assumptions', warnings)}
<p><a href="${escapeHtml(appHref)}">Open this itinerary in the YatraFlow app</a></p>
</main>`
}

/** schema.org TouristTrip. No rating, no offer, no price: the page claims
 *  nothing it cannot show. Only open days contribute stops. */
export function touristTripJsonLd(publication, trip, canonical) {
  const parts = planBody(publication, trip)
  const stops = parts.filter(part => part.open).flatMap(part => part.stops.map(stop => stop.title))
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: text(publication?.title, 200),
    url: canonical,
    inLanguage: 'en-IN',
  }
  const lead = text(publication?.tagline, 300)
  if (lead) data.description = lead
  if (stops.length) {
    data.itinerary = {
      '@type': 'ItemList',
      itemListElement: stops.slice(0, 40).map((name, position) => ({
        '@type': 'ListItem', position: position + 1, name,
      })),
    }
  }
  // `<` is escaped so no value can close the script element.
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
