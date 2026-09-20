// ============ Presence pure-state tests (M6 · B1) ============
// The channel wiring is integration-tested (a presence round-trip needs a
// second live session — see scripts/integration/); these pin the reducer the
// channel callbacks run: join/leave/replace, one-avatar-per-user, stable
// ordering, and hostile sync payloads.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  reducePresence, removePresence, presenceFromSync, visiblePeers,
  presenceChannelName, presenceKey, presencePayload, EMPTY_PRESENCE,
} from '../src/lib/presence'

describe('reducePresence', () => {
  it('adds a peer', () => {
    const s = reducePresence(EMPTY_PRESENCE, 'u1:aaa', { userId: 'u1', name: 'Amelia' }, 100)
    expect(s.peers).toEqual([{ sessionKey: 'u1:aaa', userId: 'u1', name: 'Amelia', joinedAt: 100 }])
  })

  it('replaces the SAME session in place (refresh/rejoin) without reshuffling others', () => {
    let s = reducePresence(EMPTY_PRESENCE, 'u1:aaa', { userId: 'u1', name: 'Amelia' }, 100)
    s = reducePresence(s, 'u2:bbb', { userId: 'u2', name: 'Ravi' }, 200)
    s = reducePresence(s, 'u1:aaa', { userId: 'u1', name: 'Amelia' }, 300)
    expect(s.peers.map(p => p.sessionKey)).toEqual(['u2:bbb', 'u1:aaa'])
    expect(s.peers.find(p => p.sessionKey === 'u1:aaa')?.joinedAt).toBe(300)
  })

  it('ignores malformed input (empty key or userId)', () => {
    expect(reducePresence(EMPTY_PRESENCE, '', { userId: 'u1', name: 'x' }, 1)).toBe(EMPTY_PRESENCE)
    expect(reducePresence(EMPTY_PRESENCE, 'k', { userId: '', name: 'x' }, 1)).toBe(EMPTY_PRESENCE)
  })
})

describe('removePresence', () => {
  it('removes exactly one session', () => {
    let s = reducePresence(EMPTY_PRESENCE, 'u1:aaa', { userId: 'u1', name: 'A' }, 1)
    s = reducePresence(s, 'u2:bbb', { userId: 'u2', name: 'B' }, 2)
    s = removePresence(s, 'u1:aaa')
    expect(s.peers.map(p => p.sessionKey)).toEqual(['u2:bbb'])
  })

  it('is a no-op for an unknown key', () => {
    const s = reducePresence(EMPTY_PRESENCE, 'u1:aaa', { userId: 'u1', name: 'A' }, 1)
    expect(removePresence(s, 'nope')).toEqual(s)
  })
})

describe('one avatar per user (dedupe)', () => {
  it('collapses two sessions of one user to the OLDEST join', () => {
    let s = reducePresence(EMPTY_PRESENCE, 'u1:aaa', { userId: 'u1', name: 'A' }, 100)
    s = reducePresence(s, 'u1:zzz', { userId: 'u1', name: 'A' }, 200)
    expect(s.peers).toHaveLength(1)
    expect(s.peers[0].sessionKey).toBe('u1:aaa')
    expect(s.peers[0].joinedAt).toBe(100)
  })

  it('keeps the oldest session when the second tab joined first (order-stable)', () => {
    let s = reducePresence(EMPTY_PRESENCE, 'u1:zzz', { userId: 'u1', name: 'A' }, 200)
    s = reducePresence(s, 'u1:aaa', { userId: 'u1', name: 'A' }, 100)
    expect(s.peers[0].sessionKey).toBe('u1:aaa')
  })
})

describe('ordering', () => {
  it('sorts by joinedAt asc, ties by userId (stable across re-syncs)', () => {
    let s = reducePresence(EMPTY_PRESENCE, 'u3:c', { userId: 'u3', name: 'C' }, 30)
    s = reducePresence(s, 'u1:a', { userId: 'u1', name: 'A' }, 10)
    s = reducePresence(s, 'u2:b', { userId: 'u2', name: 'B' }, 20)
    s = reducePresence(s, 'u4:d', { userId: 'u4', name: 'D' }, 10)
    expect(s.peers.map(p => p.userId)).toEqual(['u1', 'u4', 'u2', 'u3'])
  })
})

describe('presenceFromSync', () => {
  it('rebuilds state from a full snapshot', () => {
    const s = presenceFromSync({
      'u1:aaa': { userId: 'u1', name: 'A', joinedAt: 5 },
      'u2:bbb': { userId: 'u2', name: 'B', joinedAt: 3 },
    })
    expect(s.peers.map(p => p.userId)).toEqual(['u2', 'u1'])
  })

  it('skips malformed entries instead of crashing (wire payloads are not ours to trust)', () => {
    const s = presenceFromSync({
      bad1: null as never,
      bad2: { name: 'no id' },
      bad3: { userId: 42 },
      ok: { userId: 'u1', name: 'A', joinedAt: 'not-a-number' },
    })
    expect(s.peers).toHaveLength(1)
    expect(s.peers[0].joinedAt).toBe(0)
  })

  it('falls back to the userId when the name is missing', () => {
    const s = presenceFromSync({ 'u9:k': { userId: 'u9', joinedAt: 1 } })
    expect(s.peers[0].name).toBe('u9')
  })
})

describe('visiblePeers', () => {
  it('filters the caller\'s own session out', () => {
    let s = reducePresence(EMPTY_PRESENCE, 'me:aaa', { userId: 'me', name: 'Me' }, 1)
    s = reducePresence(s, 'u2:bbb', { userId: 'u2', name: 'B' }, 2)
    expect(visiblePeers(s, 'me:aaa').map(p => p.userId)).toEqual(['u2'])
    expect(visiblePeers(s, 'me:aaa')).toHaveLength(1)
  })
})

describe('helpers', () => {
  it('names the channel per trip', () => {
    expect(presenceChannelName('t1')).toBe('presence:t1')
  })

  it('mints session keys that carry the user id prefix', () => {
    expect(presenceKey('u1')).toMatch(/^u1:/)
    expect(presenceKey('u1')).not.toBe(presenceKey('u1'))
  })

  it('never repeats a key across a roomful of tabs', () => {
    const keys = new Set(Array.from({ length: 500 }, () => presenceKey('u1')))
    expect(keys.size).toBe(500)
  })

  it('still mints distinct keys with no Web Crypto (the insecure-context path)', () => {
    vi.stubGlobal('crypto', undefined)
    try {
      const keys = new Set(Array.from({ length: 200 }, () => presenceKey('u2')))
      expect(keys.size).toBe(200)
      expect(presenceKey('u2')).toMatch(/^u2:/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps the module off the weak generator the linter flags', () => {
    const src = readFileSync(new URL('../src/lib/presence.ts', import.meta.url), 'utf8')
    // Comments may name the generator — the key's history is worth recording —
    // so judge code lines only, and only an actual CALL counts.
    const code = src
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')
    expect(code).not.toMatch(/Math\s*\.\s*random\s*\(/)
  })

  it('broadcasts a payload with userId, name and a fresh joinedAt', () => {
    const p = presencePayload('u1', 'Amelia') as { userId: string; name: string; joinedAt: number }
    expect(p.userId).toBe('u1')
    expect(p.name).toBe('Amelia')
    expect(typeof p.joinedAt).toBe('number')
  })
})
