import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { freeDaySet, planBody, renderBodyHTML, touristTripJsonLd } from '../api/_publicBody.js'

// #691 — a search visitor reads the free days of a published itinerary at
// /i/<id>. The hostile fixture below hands the page a trip whose locked day
// still carries real content, as if the database stub had failed. The page
// must print none of it.

const PUB_ID = 'kerala-trip_1'
const SECRET = 'SECRET-LOCKED-CONTENT'
const stop = (title: string, description: string, extra: Record<string, unknown> = {}) => ({
  id: title, title, locationName: `${title} town`, description, notes: `${SECRET} note`,
  openTime: '09:00', sourceUrl: `https://${SECRET}.example/x`, entryFeeInrPerPerson: 777, ...extra,
})
const trip = {
  days: [
    { id: 'd0', index: 0, title: 'Munnar hills', stops: [stop('Tea museum', 'Walk the estate.')] },
    { id: 'd1', index: 1, title: 'Thekkady forest', stops: [stop(`${SECRET} stop`, `${SECRET} description`)] },
    { id: 'd2', index: 2, title: 'Alleppey backwaters', stops: [stop('Houseboat', 'Locked — the full plan is on the original itinerary.')] },
    { id: 'd3', stops: [stop(`${SECRET} no index`, `${SECRET} d3`)] },
  ],
}
const priced = {
  id: PUB_ID, title: 'Kerala in 4 days', tagline: 'Hills and water', duration_days: 4,
  premium_price_inr: 299, free_day_indexes: [0, 2],
  best_season: 'Oct–Mar', estimated_budget_per_person_inr: 24500,
  travel_tips: ['Book the houseboat a month ahead.', 'Carry cash for the estate gate.'],
  warnings_and_assumptions: ['Ghat roads close after heavy rain.'],
  // #700 — the RAW upload the live publication carries, tracking query and all.
  // The handler must size it before it prints (api/i.js `sizedCover`).
  cover_image_url: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Chandratal_1.JPG?utm_source=en.wikipedia.org&utm_content=thumbnail_unscaled',
}
// What the handler hands the body after it sizes that row.
const SIZED_COVER = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Chandratal_1.JPG?width=1200'

describe('free-day rules', () => {
  it('treats an unpriced publication as free and everything else as locked unless listed', () => {
    expect(freeDaySet({ premium_price_inr: null })).toBe('all')
    expect([...(freeDaySet(priced) as Set<number>)]).toEqual([0, 2])
  })
  it('fails closed on a missing or corrupt list and a missing price', () => {
    expect((freeDaySet({ premium_price_inr: 5 }) as Set<number>).size).toBe(0)
    expect((freeDaySet({ premium_price_inr: 5, free_day_indexes: 'all' }) as Set<number>).size).toBe(0)
    expect((freeDaySet({ free_day_indexes: [0] , premium_price_inr: undefined }) as Set<number>).has(0)).toBe(true)
    expect((freeDaySet({}) as Set<number>).size).toBe(0)
    expect([...(freeDaySet({ premium_price_inr: 5, free_day_indexes: [-1, 1.5, '0', 2] }) as Set<number>)]).toEqual([2])
  })
  it('locks a listed day that still carries the database marker, and a day with no index', () => {
    const open = planBody(priced, trip).map(day => day.open)
    expect(open).toEqual([true, false, false, false])
  })
})

describe('the body never prints locked content', () => {
  const html = renderBodyHTML(priced, trip, `/pub/${PUB_ID}`)
  it('prints the free day in full', () => {
    expect(html).toContain('<h1>Kerala in 4 days</h1>')
    expect(html).toContain('Tea museum')
    expect(html).toContain('Walk the estate.')
  })
  it('prints a locked day as its title and an in-app line only', () => {
    expect(html).toContain('Day 2: Thekkady forest')
    expect(html).toContain('The full plan for this day is in the app.')
    expect(html).not.toContain(SECRET)
    expect(html).not.toContain('Houseboat')
    expect(html).not.toContain('777')
    expect(html).not.toContain('09:00')
  })
  it('keeps the structured data free of locked stops, ratings and prices', () => {
    const ld = touristTripJsonLd(priced, trip, `https://app.example.test/i/${PUB_ID}`)
    expect(ld).not.toContain(SECRET)
    expect(ld).not.toContain('Houseboat')
    expect(ld).not.toMatch(/aggregateRating|offers|price/i)
    expect(JSON.parse(ld)['@type']).toBe('TouristTrip')
  })
  it('escapes markup in titles', () => {
    const out = renderBodyHTML({ ...priced, title: '<script>x</script>' }, trip, '/pub/x')
    expect(out).not.toContain('<script>')
  })
})

// #700 — the publication's OWN fields print beside the days. The paywall gates
// days, never fields, and the public page prints these outside the day gate.
// The cover arrives already sized: the handler sizes it once for og:image too.
describe('the body prints the publication fields a free view shows', () => {
  const html = renderBodyHTML(priced, trip, `/pub/${PUB_ID}`, SIZED_COVER)
  it('prints the best season', () => {
    expect(html).toContain('<h2>Best season</h2>')
    expect(html).toContain('<p>Oct–Mar</p>')
  })
  it('prints every travel tip and every warning', () => {
    expect(html).toContain('<h2>Travel tips</h2>')
    expect(html).toContain('<li>Book the houseboat a month ahead.</li>')
    expect(html).toContain('<li>Carry cash for the estate gate.</li>')
    expect(html).toContain('<h2>Warnings and assumptions</h2>')
    expect(html).toContain('<li>Ghat roads close after heavy rain.</li>')
  })
  it('prints the budget per person in the facts line', () => {
    expect(html).toContain('₹24,500/person')
  })
  it('prints the cover with a box and descriptive alt text', () => {
    expect(html).toContain(`src="${SIZED_COVER}"`)
    expect(html).toContain('alt="Cover image for Kerala in 4 days"')
    expect(html).toMatch(/<img [^>]*width="1200" height="630" \/>/)
  })
  it('prints the locked day content and the unlock price never', () => {
    expect(html).not.toContain(SECRET)
    expect(html).not.toContain('299')
  })
  it('escapes markup in a field value', () => {
    const out = renderBodyHTML({ ...priced, travel_tips: ['<script>x</script>'] }, trip, '/pub/x')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })
})

describe('an absent or corrupt publication field prints nothing', () => {
  const bare = { id: PUB_ID, title: 'Bare plan', premium_price_inr: null }
  const html = renderBodyHTML(bare, { days: [] }, '/pub/x')
  it('leaves out every field the row does not carry', () => {
    expect(html).not.toContain('<img')
    expect(html).not.toContain('Best season')
    expect(html).not.toContain('Travel tips')
    expect(html).not.toContain('Warnings and assumptions')
    expect(html).not.toContain('person')
    expect(html).not.toContain('<li>')
  })
  it('drops a wrong-type value instead of printing it', () => {
    const out = renderBodyHTML({
      ...bare, best_season: 42, travel_tips: 'not a list',
      warnings_and_assumptions: [null, 7, '', '   ', 'Only this line prints.'],
    }, { days: [] }, '/pub/x')
    expect(out).toContain('<li>Only this line prints.</li>')
    expect(out).not.toContain('<li></li>')
    expect(out).not.toContain('42')
    expect(out).not.toContain('not a list')
    expect(out).not.toContain('null')
    expect(out).not.toContain('7')
  })
  it('omits the heading rather than print it blank', () => {
    expect(renderBodyHTML({ ...bare, title: '' }, { days: [] }, '/pub/x')).not.toContain('<h1>')
  })
  it('prints no picture without a cover', () => {
    expect(renderBodyHTML(priced, trip, '/pub/x', '')).not.toContain('<img')
    expect(renderBodyHTML(priced, trip, '/pub/x', '')).not.toContain('alt=')
  })
})

// The handler, end to end, with the fetch mocked.
function makeRes() {
  return {
    statusCode: 0, headers: {} as Record<string, string>, body: '',
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value },
    status(code: number) { this.statusCode = code; return this },
    send(body: string) { this.body = body; return this },
    end() { return this },
  }
}
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://database.example.test/')
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key')
  fetchMock.mockReset()
  fetchMock.mockImplementation(async input => {
    const url = String(input)
    if (url.includes('/rpc/get_public_trip')) return new Response(JSON.stringify([trip]), { status: 200 })
    return new Response(JSON.stringify([priced]), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

async function run(query: Record<string, string> = {}) {
  const res = makeRes()
  const { default: handler } = await import('../api/i.js')
  await handler({ method: 'GET', query: { id: PUB_ID, ...query } }, res)
  return res
}

describe('/i/<id> handler', () => {
  it('serves the readable page without a redirect to a search visitor', async () => {
    const res = await run()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Walk the estate.')
    expect(res.body).not.toContain('location.replace')
    expect(res.body).toContain('application/ld+json')
    expect(res.body).not.toContain(SECRET)
    expect(res.headers['cache-control']).toContain('s-maxage=300')
  })
  it('reads the extra columns in the one publication select', async () => {
    await run()
    const read = String(fetchMock.mock.calls[0][0])
    expect(read).toContain('best_season')
    expect(read).toContain('travel_tips')
    expect(read).toContain('warnings_and_assumptions')
  })
  it('sends the extra fields to a search visitor, with the cover picture', async () => {
    const res = await run()
    expect(res.body).toContain('Best season')
    expect(res.body).toContain('<h2>Travel tips</h2>')
    expect(res.body).toContain('<h2>Warnings and assumptions</h2>')
    expect(res.body).toContain('alt="Cover image for Kerala in 4 days"')
    expect(res.body).toMatch(/<img [^>]*width="1200" height="630" \/>/)
    expect(res.body).not.toContain(SECRET)
  })
  it('sizes the stored cover before it prints it', async () => {
    const res = await run()
    expect(res.body).toContain(`<img src="${SIZED_COVER}"`)
    expect(res.body).not.toContain('thumbnail_unscaled')
  })
  it('prints no picture for a cover a browser may not load', async () => {
    for (const bad of ['http://x.test/cover.jpg', 'javascript:alert(1)', 'not a url', 42, null]) {
      fetchMock.mockImplementation(async input => {
        if (String(input).includes('/rpc/get_public_trip')) return new Response(JSON.stringify([trip]), { status: 200 })
        return new Response(JSON.stringify([{ ...priced, cover_image_url: bad }]), { status: 200 })
      })
      const res = await run()
      expect(res.body, String(bad)).not.toContain('<img')
      // The head falls back to the app's own asset, which is the only picture
      // whose dimensions this page can state.
      expect(res.body).toContain('/og-default.png')
    }
  })
  it('still redirects a shared link that carries ref', async () => {
    const res = await run({ ref: 'wa' })
    expect(res.body).toContain('location.replace')
  })
  it('redirects an unverified buyer link without reading the trip', async () => {
    const res = await run({ buyer: '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f601' })
    expect(res.body).toContain('location.replace')
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('get_public_trip'))).toBe(false)
  })
  it('skips the trip read for a shared link and for HEAD', async () => {
    await run({ ref: 'wa' })
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('get_public_trip'))).toBe(false)
    fetchMock.mockClear()
    const res = makeRes()
    const { default: handler } = await import('../api/i.js')
    await handler({ method: 'HEAD', query: { id: PUB_ID } }, res)
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('get_public_trip'))).toBe(false)
  })
  it('does not cache a page whose trip read failed', async () => {
    fetchMock.mockImplementation(async input => {
      if (String(input).includes('/rpc/get_public_trip')) throw new Error('down')
      return new Response(JSON.stringify([priced]), { status: 200 })
    })
    expect((await run()).headers['cache-control']).toBe('no-store')
  })
  it('prints one day, not "1 days"', () => {
    expect(renderBodyHTML({ ...priced, duration_days: 1 }, trip, '/pub/x')).toContain('1 day')
    expect(renderBodyHTML({ ...priced, duration_days: 1 }, trip, '/pub/x')).not.toContain('1 days')
  })
  it('keeps the old redirect card when the trip read fails', async () => {
    fetchMock.mockImplementation(async input => {
      if (String(input).includes('/rpc/get_public_trip')) throw new Error('down')
      return new Response(JSON.stringify([priced]), { status: 200 })
    })
    const res = await run()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('location.replace')
    expect(res.body).not.toContain('Walk the estate.')
  })
})
