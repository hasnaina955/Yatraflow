// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  saveDraft, loadDraft, clearDraft, draftIsWorthKeeping, draftAgeLabel,
  DRAFT_KEY, DRAFT_VERSION, type DraftStore,
} from '../src/lib/createDraft'

/** A Map-backed Storage stand-in. */
function fakeStore(opts: { failSet?: boolean; failGet?: boolean } = {}): DraftStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem(k: string) {
      if (opts.failGet) throw new Error('denied')
      return map.has(k) ? map.get(k)! : null
    },
    setItem(k: string, v: string) {
      if (opts.failSet) throw new Error('QuotaExceededError')
      map.set(k, v)
    },
    removeItem(k: string) { map.delete(k) },
  }
}

const payload = {
  form: { name: 'Kerala with the crew', startLocation: 'Kochi, Kerala', startDate: '2026-02-14', endDate: '2026-02-19' },
  dests: [{ name: 'Munnar, Kerala', lat: 10.0889, lng: 77.0595 }],
  returnCount: 0,
}

describe('create drafts - the unfinished trip that waits', () => {
  it('round-trips a draft through the store', () => {
    const store = fakeStore()
    expect(saveDraft(payload, { store, now: new Date('2026-02-01T10:00:00Z') })).toBe(true)
    const got = loadDraft({ store })
    expect(got).not.toBeNull()
    expect(got!.v).toBe(DRAFT_VERSION)
    expect(got!.savedAt).toBe('2026-02-01T10:00:00.000Z')
    expect(got!.form.name).toBe('Kerala with the crew')
    expect(got!.dests).toHaveLength(1)
    expect(store.map.has(DRAFT_KEY)).toBe(true)
  })

  it('re-saving overwrites rather than duplicating', () => {
    const store = fakeStore()
    saveDraft(payload, { store })
    saveDraft({ ...payload, form: { ...payload.form, name: 'Second name' } }, { store })
    expect(store.map.size).toBe(1)
    expect(loadDraft({ store })!.form.name).toBe('Second name')
  })

  it('NEGATIVE: a version we do not understand is discarded, not half-read', () => {
    const store = fakeStore()
    store.map.set(DRAFT_KEY, JSON.stringify({ v: 99, savedAt: 'x', form: {}, dests: [], returnCount: 0 }))
    expect(loadDraft({ store })).toBeNull()
  })

  it('NEGATIVE: corrupt or partial JSON degrades to "no draft"', () => {
    const store = fakeStore()
    store.map.set(DRAFT_KEY, '{not json')
    expect(loadDraft({ store })).toBeNull()
    store.map.set(DRAFT_KEY, JSON.stringify({ v: DRAFT_VERSION }))
    expect(loadDraft({ store })).toBeNull()
    store.map.set(DRAFT_KEY, JSON.stringify({ v: DRAFT_VERSION, savedAt: 'x', form: null }))
    expect(loadDraft({ store })).toBeNull()
  })

  it('NEGATIVE: a denied or full store never throws, it just declines', () => {
    const full = fakeStore({ failSet: true })
    expect(saveDraft(payload, { store: full })).toBe(false)
    const denied = fakeStore({ failGet: true })
    expect(loadDraft({ store: denied })).toBeNull()
    expect(saveDraft(payload, { store: null })).toBe(false)
    expect(loadDraft({ store: null })).toBeNull()
    expect(clearDraft({ store: null })).toBe(false)
  })

  it('clear removes it for good', () => {
    const store = fakeStore()
    saveDraft(payload, { store })
    expect(clearDraft({ store })).toBe(true)
    expect(loadDraft({ store })).toBeNull()
  })

  it('an untouched form is not worth interrupting anyone about', () => {
    expect(draftIsWorthKeeping(null)).toBe(false)
    expect(draftIsWorthKeeping({
      v: DRAFT_VERSION, savedAt: 'x', returnCount: 0, dests: [],
      form: { name: '', startLocation: '', startDate: '', endDate: '', travellers: 2 },
    })).toBe(false)
  })

  it('any real progress makes it worth keeping', () => {
    const base = { v: DRAFT_VERSION, savedAt: 'x', returnCount: 0, dests: [] as const }
    expect(draftIsWorthKeeping({ ...base, form: { name: 'Goa' } })).toBe(true)
    expect(draftIsWorthKeeping({ ...base, form: { startLocation: 'Panaji, Goa' } })).toBe(true)
    expect(draftIsWorthKeeping({ ...base, form: { startDate: '2026-02-14' } })).toBe(true)
    expect(draftIsWorthKeeping({ ...base, form: {}, dests: [{ name: 'Palolem, Goa' }] })).toBe(true)
  })

  it('the age label is coarse and honest', () => {
    const now = new Date('2026-02-01T12:00:00Z')
    expect(draftAgeLabel('2026-02-01T11:59:40Z', now)).toBe('just now')
    expect(draftAgeLabel('2026-02-01T11:48:00Z', now)).toBe('12 min ago')
    expect(draftAgeLabel('2026-02-01T09:00:00Z', now)).toBe('3 h ago')
    expect(draftAgeLabel('2026-01-31T09:00:00Z', now)).toBe('yesterday')
    expect(draftAgeLabel('2026-01-28T09:00:00Z', now)).toBe('4 days ago')
    expect(draftAgeLabel('not-a-date', now)).toBe('earlier')
  })

  it('a draft with junk in dests or returnCount is still loadable and safe', () => {
    const store = fakeStore()
    store.map.set(DRAFT_KEY, JSON.stringify({
      v: DRAFT_VERSION, savedAt: 'x', form: { name: 'X' },
      dests: [{ name: 'ok' }, { nope: 1 }, null, { name: 'fine' }],
      returnCount: -4.7,
    }))
    const got = loadDraft({ store })!
    expect(got.dests.map(d => d.name)).toEqual(['ok', 'fine'])
    expect(got.returnCount).toBe(0)
  })
})
