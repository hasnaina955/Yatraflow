// ============ Map v2 package E: attributed Google photo references (#904) ============
// A scan carries photo references and attribution only. It never fetches an
// image. Without a Google key there are no photos and no other photo source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceHit } from '../src/lib/providers/hits'

vi.hoisted(() => {
  vi.stubEnv('VITE_MAPPLS_KEY', '')
})

const { googleNearbyAtPoint, cardPhotoRefs, placePhotoUrl, NEARBY_FIELD_MASK } = await import('../src/lib/providers/google')

const calls: { url: string; mask: string | null }[] = []

function photo(n: number, withAuthor = true) {
  return {
    name: `places/ABC/photos/REF${n}`, widthPx: 800, heightPx: 600,
    authorAttributions: withAuthor
      ? [{ displayName: `Author ${n}`, uri: `https://maps.google.com/contrib/${n}`, photoUri: `https://lh3.example/${n}` }]
      : [],
  }
}

function stubGoogle(photos: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), mask: (init?.headers as Record<string, string> | undefined)?.['X-Goog-FieldMask'] ?? null })
    return {
      ok: true,
      json: async () => ({
        places: [{
          id: 'ABC', displayName: { text: 'Fort Hill' }, location: { latitude: 10, longitude: 76 },
          primaryType: 'tourist_attraction', types: ['tourist_attraction'], photos,
        }],
      }),
    } as Response
  }))
}

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function scan(): Promise<PlaceHit[]> {
  return googleNearbyAtPoint({ lat: 10, lng: 76, radiusM: 5000, count: 10 })
}

describe('Google photo references on a scan', () => {
  it('carries at most three references, each with attribution text and an author link', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    stubGoogle([photo(1), photo(2), photo(3), photo(4)])
    const [hit] = await scan()
    expect(hit.photos?.map(p => p.name)).toEqual(['places/ABC/photos/REF1', 'places/ABC/photos/REF2', 'places/ABC/photos/REF3'])
    expect(hit.photos?.[0]).toMatchObject({
      widthPx: 800, heightPx: 600,
      attribution: { text: 'Author 1', authorUri: 'https://maps.google.com/contrib/1' },
    })
  })

  it('drops a photo that has no attribution text', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    stubGoogle([photo(1, false), photo(2)])
    const [hit] = await scan()
    expect(hit.photos?.map(p => p.name)).toEqual(['places/ABC/photos/REF2'])
  })

  it('leaves photos unset when Google returns none', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    stubGoogle([])
    const [hit] = await scan()
    expect(hit.photos).toBeUndefined()
  })

  it('asks for photo fields in the scan and never requests an image', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    stubGoogle([photo(1)])
    await scan()
    expect(NEARBY_FIELD_MASK).toContain('places.photos')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(c => c.url.includes(':searchText'))).toBe(true)
    expect(calls.some(c => c.url.includes('/media'))).toBe(false)
    expect(calls.every(c => c.mask?.includes('places.photos'))).toBe(true)
  })
})

describe('photos at display time', () => {
  const withPhotos: PlaceHit = {
    id: 'google_ABC', name: 'Fort Hill', latitude: 10, longitude: 76, kind: 'poi', source: 'google',
    thumb: 'https://upload.wikimedia.example/thumb.jpg',
    photos: [{ name: 'places/ABC/photos/REF1', widthPx: 800, heightPx: 600, attribution: { text: 'Author 1', authorUri: null } }],
  }

  it('builds a media URL on demand when a key is set', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    expect(placePhotoUrl(withPhotos.photos![0], 640)).toBe(
      'https://places.googleapis.com/v1/places/ABC/photos/REF1/media?maxWidthPx=640&key=test-key',
    )
    expect(cardPhotoRefs(withPhotos)).toHaveLength(1)
  })

  it('returns no photo and no URL without a key', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    expect(placePhotoUrl(withPhotos.photos![0], 640)).toBeNull()
    expect(cardPhotoRefs(withPhotos)).toEqual([])
  })

  it('never falls back to another photo source when a key is set', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const { photos: _photos, ...noPhotos } = withPhotos
    expect(cardPhotoRefs({ ...noPhotos, photos: undefined })).toEqual([])
  })
})
