// ============ Home join card: link-or-code parse ============
// The "Got an invite?" card takes a pasted link or a typed code and only ever
// produces a route. These tests pin which values lead where, and that every bad
// value gets its own error and never a route.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { INVITE_ENTRY_COPY, readInviteEntry } from '../src/lib/inviteEntry'
import { inviteRoute } from '../src/lib/inviteCode'

const CODE = 'GOA-K7QFH3WT'
const LEGACY_CODE = 'GOA-K7QF'
const TRIP_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('readInviteEntry: a bare code', () => {
  it('leads to the invite route of the code', () => {
    expect(readInviteEntry(CODE)).toEqual({ kind: 'join', code: CODE, route: '/join/GOA-K7QFH3WT' })
  })

  it('accepts casual input: lowercase, spaces around the dash, outer space', () => {
    expect(readInviteEntry('  goa-k7qfh3wt ')).toMatchObject({ kind: 'join', code: CODE })
    expect(readInviteEntry('goa - k7qfh3wt')).toMatchObject({ kind: 'join', code: CODE })
  })

  it('accepts a legacy code with a four-character tail', () => {
    expect(readInviteEntry(LEGACY_CODE)).toMatchObject({ kind: 'join', code: LEGACY_CODE })
  })

  it('uses the same route the Share tab builds', () => {
    const verdict = readInviteEntry(CODE)
    expect(verdict.kind === 'join' && verdict.route).toBe(inviteRoute(CODE))
  })
})

describe('readInviteEntry: a pasted link', () => {
  it.each([
    ['a web link', `https://yatraflow.app/join/${CODE}`],
    ['a link with a query and a fragment', `https://yatraflow.app/join/${CODE}?utm=x#top`],
    ['a link with a trailing slash', `https://yatraflow.app/join/${CODE}/`],
    ['a native hash link', `https://localhost/#/join/${CODE}`],
    ['a hash route', `#/join/${CODE}`],
    ['a path', `/join/${CODE}`],
    ['a link in lowercase', `https://yatraflow.app/join/${CODE.toLowerCase()}`],
    ['a link with an encoded dash', `https://yatraflow.app/join/GOA%2DK7QFH3WT`],
    ['a link with outer space', `  https://yatraflow.app/join/${CODE}  `],
  ])('reads %s', (_label, link) => {
    expect(readInviteEntry(link)).toEqual({ kind: 'join', code: CODE, route: `/join/${CODE}` })
  })

  it('reads an older trip-id link and keeps its own route', () => {
    expect(readInviteEntry(`https://yatraflow.app/invite/${TRIP_ID}`))
      .toEqual({ kind: 'trip-link', tripId: TRIP_ID, route: `/invite/${TRIP_ID}` })
  })
})

describe('readInviteEntry: a value that is not an invite', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['hello', 'not-a-code'],
    ['GOA', 'not-a-code'],
    ['GOA-K7QFH3', 'not-a-code'],            // wrong tail length
    ['GOA-K7QFH3W0', 'not-a-code'],          // 0 is not in the alphabet
    ['GOA-K7QFH3WT-EXTRA', 'not-a-code'],
    [`https://yatraflow.app/join/hello`, 'not-a-code'],
    [`https://yatraflow.app/invite/not-a-uuid`, 'not-a-code'],
    [`https://yatraflow.app/join/`, 'link-without-code'],
    [`https://yatraflow.app/join`, 'link-without-code'],
    [`https://yatraflow.app/trips`, 'link-without-code'],
    [`https://yatraflow.app/`, 'link-without-code'],
    ['#/trips', 'link-without-code'],
  ])('refuses %j as %s', (value, reason) => {
    const verdict = readInviteEntry(value)
    expect(verdict).toEqual({ kind: 'error', reason, message: INVITE_ENTRY_COPY[reason as keyof typeof INVITE_ENTRY_COPY] })
  })

  it('never returns a route for an error', () => {
    for (const value of ['', 'x', 'GOA-', '/join/', 'https://a.b/c']) {
      expect(readInviteEntry(value)).not.toHaveProperty('route')
    }
  })

  it('does not throw on a broken percent escape', () => {
    expect(readInviteEntry('https://yatraflow.app/join/%E0%A4%A').kind).toBe('error')
  })

  it('gives each error its own words, and none says "not found"', () => {
    const messages = Object.values(INVITE_ENTRY_COPY)
    expect(new Set(messages).size).toBe(messages.length)
    for (const message of messages) {
      expect(message).toMatch(/^[A-Z]/)
      expect(message.toLowerCase()).not.toContain('not found')
    }
  })
})

describe('the Home join card wiring', () => {
  const card = readFileSync('src/components/home/JoinInviteCard.tsx', 'utf8').replace(/\r\n/g, '\n')
  const home = readFileSync('src/pages/NativeHome.tsx', 'utf8').replace(/\r\n/g, '\n')

  it('labels the field with the Field component', () => {
    expect(card).toMatch(/<Field label="[^"]+"/)
  })

  it('only navigates: it holds no store, supabase or fetch call', () => {
    expect(card).not.toMatch(/store\/store|supabase|fetch\(|joinViaInvite/)
    expect(card).toContain('onNavigate(verdict.route)')
  })

  it('mounts on the signed-in native home', () => {
    expect(home).toContain('<JoinInviteCard onNavigate={onNavigate} />')
  })
})
