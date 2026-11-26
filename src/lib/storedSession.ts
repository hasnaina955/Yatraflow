// ============ Stored session hint ============
// Tells the topnav whether the browser may hold a Supabase session. The client
// keeps its session in localStorage under its own key, so a stored value means
// the reader may be signed in, even before the store hydrates. No stored value
// means the reader is signed out for certain.
//
// Every read is guarded. A storage that throws (private mode, blocked site data)
// answers 'unknown', and the caller treats 'unknown' like 'present': it waits.
// The hint never reads a failing or unexpected value as 'absent'. That would show
// signed-out items to a signed-in reader.

/** What the browser's storage says about the client's session key. */
export type StoredSessionHint = 'absent' | 'present' | 'unknown'

/** The one storage method the hint needs. localStorage and test doubles both fit it. */
export interface SessionStorageReader {
  getItem(key: string): string | null
}

/**
 * Reads the session key from a storage. A missing storage or a blank key is
 * 'unknown'. A null or blank value is 'absent'. Any other value is 'present',
 * even when it is not a readable session, so the caller waits rather than guess.
 */
export function storedSessionHint(storage: SessionStorageReader | null | undefined, key: string): StoredSessionHint {
  if (!storage || !key) return 'unknown'
  try {
    const value = storage.getItem(key)
    if (value === null) return 'absent'
    return value.trim() === '' ? 'absent' : 'present'
  } catch {
    return 'unknown'
  }
}

/**
 * The browser's localStorage, or null when reading it throws. Reading
 * `window.localStorage` itself can throw in private mode or with blocked site data.
 */
export function browserLocalStorage(): SessionStorageReader | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage ?? null
  } catch {
    return null
  }
}
