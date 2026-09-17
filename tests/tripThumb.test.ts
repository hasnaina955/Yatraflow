// ============ tripThumb — My-Trips card cover images ============
// Node env, pure logic only (same convention as uiPrefs tests): query picking,
// Wikipedia response extraction, and the localStorage cache contract —
// including the negative-result TTL that keeps a "no photo" verdict from
// becoming permanent while still preventing refetch storms on every visit.
import { describe, it, expect } from 'vitest'
import {
  COVER_WIDTH,
  pickTripQuery,
  parseThumbCache,
  extractRestThumbUrl,
  extractThumbUrl,
  getCachedThumb,
  setCachedThumb,
  sizedCoverUrl,
} from '../src/lib/tripThumb'

const mkTrip = (over: Partial<Parameters<typeof pickTripQuery>[0]> = {}) => ({
  name: 'Leh escape',
  startLocation: 'Delhi',
  destinations: ['Manali', 'Leh'],
  ...over,
})

describe('pickTripQuery', () => {
  it('prefers the last destination (the card advertises start → last)', () => {
    expect(pickTripQuery(mkTrip())).toBe('Leh')
  })

  it('falls back to startLocation, then the trip name', () => {
    expect(pickTripQuery(mkTrip({ destinations: [] }))).toBe('Delhi')
    expect(pickTripQuery(mkTrip({ destinations: [], startLocation: '  ' }))).toBe('Leh escape')
  })

  it('trims whitespace and tolerates a missing destinations array', () => {
    expect(pickTripQuery(mkTrip({ destinations: [' Kochi '], startLocation: undefined }))).toBe('Kochi')
    expect(pickTripQuery(mkTrip({ destinations: undefined as unknown as string[] }))).toBe('Delhi')
  })
})

describe('extractThumbUrl', () => {
  const page = (title: string, thumb?: string) => ({ title, ...(thumb ? { thumbnail: { source: thumb } } : {}) })
  const resp = (...pages: ReturnType<typeof page>[]) => ({
    query: { pages: Object.fromEntries(pages.map((p, i) => [String(i), p])) },
  })

  it('returns null for missing/empty page maps', () => {
    expect(extractThumbUrl({}, 'Leh')).toBeNull()
    expect(extractThumbUrl({ query: { pages: {} } }, 'Leh')).toBeNull()
    expect(extractThumbUrl(null, 'Leh')).toBeNull()
  })

  it('prefers the page whose title matches the query exactly', () => {
    const data = resp(page('Leh district', 'https://upload.wikimedia.org/district.jpg'), page('Leh', 'https://upload.wikimedia.org/leh.jpg'))
    expect(extractThumbUrl(data, 'Leh')).toBe('https://upload.wikimedia.org/leh.jpg')
  })

  it('falls back to the first page with a thumbnail (case-insensitive match)', () => {
    const data = resp(page('Manali, Himachal Pradesh', 'https://upload.wikimedia.org/manali.jpg'), page('Old Manali', 'https://upload.wikimedia.org/old.jpg'))
    expect(extractThumbUrl(data, 'manali, himachal pradesh')).toBe('https://upload.wikimedia.org/manali.jpg')
  })

  it('skips thumbnail-less pages entirely', () => {
    const data = resp(page('Leh (disambiguation)'), page('Leh', 'https://upload.wikimedia.org/leh.jpg'))
    expect(extractThumbUrl(data, 'Leh')).toBe('https://upload.wikimedia.org/leh.jpg')
    expect(extractThumbUrl(resp(page('No image here')), 'Leh')).toBeNull()
  })
})

// The URLs below are what the two APIs really returned on 2026-09-17, and why
// this exists: the REST summary hands back either the *unscaled* upload or a
// 3840px thumbnail, so an auto cover could arrive at 1.3–3.3 MB — over the
// 600 KB ceiling a link preview needs. Wikimedia serves only the widths it has
// generated, so a composed `/thumb/…/1200px-…` URL answers 400; the supported
// route is `Special:Redirect/file`, which lands on the nearest size that exists.
describe('sizedCoverUrl', () => {
  it('sizes an unscaled REST original (Chandratal, 1304 KB live)', () => {
    const live =
      'https://upload.wikimedia.org/wikipedia/commons/3/3a/Chandratal_1.JPG' +
      '?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled'
    expect(sizedCoverUrl(live)).toBe(
      'https://commons.wikimedia.org/wiki/Special:Redirect/file/Chandratal_1.JPG?width=1200',
    )
  })

  it('sizes an already-3840px REST thumbnail (Munnar, 2894 KB live)', () => {
    const live =
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b9/Munnar_Overview.jpg/3840px-Munnar_Overview.jpg' +
      '?utm_content=thumbnail'
    expect(sizedCoverUrl(live)).toBe(
      'https://commons.wikimedia.org/wiki/Special:Redirect/file/Munnar_Overview.jpg?width=1200',
    )
  })

  it('does not double-escape a file name that arrives percent-encoded', () => {
    const live =
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ca/Telkupi%2C_Purulia.jpg/330px-Telkupi%2C_Purulia.jpg'
    expect(sizedCoverUrl(live)).toBe(
      'https://commons.wikimedia.org/wiki/Special:Redirect/file/Telkupi%2C_Purulia.jpg?width=1200',
    )
  })

  it('routes a non-commons project to its own wiki', () => {
    expect(sizedCoverUrl('https://upload.wikimedia.org/wikipedia/en/1/1a/Local.jpg')).toBe(
      'https://en.wikipedia.org/wiki/Special:Redirect/file/Local.jpg?width=1200',
    )
  })

  it('honours a caller-supplied width', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Alappuzha_Boat_Beauty_W.jpg'
    expect(sizedCoverUrl(url, 800)).toContain('?width=800')
  })

  it('leaves a non-Wikimedia cover untouched, so an owner URL is never rewritten', () => {
    for (const url of ['', 'https://upload.wikimedia.org/leh.jpg', 'https://images.example.test/cover.jpg']) {
      expect(sizedCoverUrl(url)).toBe(url)
    }
  })

  it('asks for the width a 1200x630 preview wants', () => {
    expect(COVER_WIDTH).toBe(1200)
  })
})

describe('the extractors size what they return', () => {
  it('sizes the REST summary original instead of handing back the upload', () => {
    const data = {
      originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Chandratal_1.JPG', width: 2496, height: 1664 },
      thumbnail: { source: 'https://thumb.wikimedia.org/wikipedia/commons/3/3a/Chandratal_1.JPG/330px-Chandratal_1.JPG', width: 330, height: 220 },
    }
    expect(extractRestThumbUrl(data)).toBe(
      'https://commons.wikimedia.org/wiki/Special:Redirect/file/Chandratal_1.JPG?width=1200',
    )
  })

  it('sizes the pageimages thumbnail too', () => {
    const data = {
      query: {
        pages: {
          1: {
            title: 'Munnar',
            thumbnail: { source: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b9/Munnar_Overview.jpg/3840px-Munnar_Overview.jpg' },
          },
        },
      },
    }
    expect(extractThumbUrl(data, 'Munnar')).toBe(
      'https://commons.wikimedia.org/wiki/Special:Redirect/file/Munnar_Overview.jpg?width=1200',
    )
  })
})

describe('parseThumbCache', () => {
  it('keeps well-formed positive and negative entries, drops the rest', () => {
    const raw = JSON.stringify({ t1: { u: 'https://upload.wikimedia.org/x.jpg' }, t2: { ts: 123 }, bad: 1, worse: { u: 9 }, arr: [] })
    expect(parseThumbCache(raw)).toEqual({
      t1: { u: 'https://upload.wikimedia.org/x.jpg' },
      t2: { ts: 123 },
    })
  })

  it('returns empty for null / malformed / non-object JSON', () => {
    expect(parseThumbCache(null)).toEqual({})
    expect(parseThumbCache('{oops')).toEqual({})
    expect(parseThumbCache('[{ }]')).toEqual({})
  })
})

describe('thumb cache contract', () => {
  const stubStorage = () => {
    const store = new Map<string, string>()
    const prev = globalThis.localStorage
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
      key: () => null,
      get length() { return store.size },
    } as Storage
    return { store, restore: () => { (globalThis as unknown as { localStorage: Storage }).localStorage = prev } }
  }

  it('round-trips a positive entry and reports it as fresh', () => {
    const { restore } = stubStorage()
    try {
      expect(getCachedThumb('t1')).toBeNull()
      setCachedThumb('t1', 'https://upload.wikimedia.org/leh.jpg')
      expect(getCachedThumb('t1')).toEqual({ url: 'https://upload.wikimedia.org/leh.jpg', stale: false })
    } finally {
      restore()
    }
  })

  it('stores negatives with a timestamp; they go stale only after a week', () => {
    const { store, restore } = stubStorage()
    try {
      setCachedThumb('t1', null)
      expect(getCachedThumb('t1')).toEqual({ url: null, stale: false })

      // age the negative entry past the TTL by rewriting its ts directly
      const map = JSON.parse(store.get('yatraflow_trip_thumbs_v2')!)
      map.t1.ts = Date.now() - 8 * 24 * 60 * 60 * 1000
      store.set('yatraflow_trip_thumbs_v2', JSON.stringify(map))
      expect(getCachedThumb('t1')).toEqual({ url: null, stale: true })

      // a different trip in the same map is untouched
      expect(getCachedThumb('t2')).toBeNull()
    } finally {
      restore()
    }
  })

  it('degrades to null / no-op when localStorage is unavailable (node)', () => {
    expect(getCachedThumb('t1')).toBeNull()
    expect(() => setCachedThumb('t1', 'https://upload.wikimedia.org/x.jpg')).not.toThrow()
  })
})
