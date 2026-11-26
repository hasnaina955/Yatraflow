// The stored-session hint behind the signed-out topnav. It reads the client's real
// session key from a storage. Every failed or unknown read counts as "may have a
// session", so a signed-in reader never sees the signed-out items early.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { browserLocalStorage, storedSessionHint, type SessionStorageReader } from '../src/lib/storedSession'

const KEY = 'sb-abcdwxyz-auth-token'

function storageWith(entries: Record<string, string>): SessionStorageReader {
  return { getItem: key => (Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null) }
}

describe('storedSessionHint', () => {
  it('reads a stored session value as present, so the caller waits for hydrate', () => {
    expect(storedSessionHint(storageWith({ [KEY]: '{"access_token":"x"}' }), KEY)).toBe('present')
  })

  it('reads a missing key as absent, so the signed-out items show at once', () => {
    expect(storedSessionHint(storageWith({}), KEY)).toBe('absent')
  })

  it('treats an empty or blank value as absent, because it holds no session', () => {
    expect(storedSessionHint(storageWith({ [KEY]: '' }), KEY)).toBe('absent')
    expect(storedSessionHint(storageWith({ [KEY]: '   ' }), KEY)).toBe('absent')
  })

  it('treats a value it cannot parse as present, so it waits rather than guesses', () => {
    expect(storedSessionHint(storageWith({ [KEY]: 'not json' }), KEY)).toBe('present')
    expect(storedSessionHint(storageWith({ [KEY]: 'null' }), KEY)).toBe('present')
  })

  it('answers unknown when the storage read throws, as in private mode or blocked site data', () => {
    const blocked: SessionStorageReader = { getItem: () => { throw new Error('SecurityError') } }
    expect(storedSessionHint(blocked, KEY)).toBe('unknown')
  })

  it('answers unknown when there is no storage at all', () => {
    expect(storedSessionHint(null, KEY)).toBe('unknown')
    expect(storedSessionHint(undefined, KEY)).toBe('unknown')
  })

  it('answers unknown when the key is blank, because nothing can be read', () => {
    expect(storedSessionHint(storageWith({ [KEY]: '{}' }), '')).toBe('unknown')
  })

  it('answers unknown when the read returns something other than a string', () => {
    const odd = { getItem: () => 42 as unknown as string }
    expect(storedSessionHint(odd, KEY)).toBe('unknown')
  })
})

describe('browserLocalStorage', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('has no storage without a window, as in the node test environment', () => {
    expect(browserLocalStorage()).toBeNull()
  })

  it('returns the window storage when the browser allows it', () => {
    const store = storageWith({})
    vi.stubGlobal('window', { localStorage: store })
    expect(browserLocalStorage()).toBe(store)
  })

  it('returns null when reading the window storage itself throws', () => {
    vi.stubGlobal('window', { get localStorage(): never { throw new Error('SecurityError') } })
    expect(browserLocalStorage()).toBeNull()
  })
})

describe('the session key the hint reads', () => {
  it('is the key the installed client derives for its project URL', () => {
    // supabase-js derives sb-<first hostname label>-auth-token. The app reads the
    // client's own resolved key, so this pins the rule the library applies today.
    const client = createClient('https://abcdwxyz.supabase.co', 'anon-key-for-test')
    expect((client.auth as unknown as { storageKey?: string }).storageKey).toBe(KEY)
  })
})
