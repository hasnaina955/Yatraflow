// ============ Invite recipient copy ============
// The builder behind /join/<code>. The reader was told by a friend to tap a
// link, so the screen removes doubt instead of selling. These rules are the
// contract: an absent fact is dropped, never printed as "0 stops", "₹0",
// "undefined" or a raw id, and the quiet read-only path is always there.
import { describe, expect, it } from 'vitest'
import {
  INVITE_LOOK_FIRST, alreadyMemberCopy, expiredInviteCopy, inviteConfirmCopy,
  inviteDateRange, inviteFirstName, inviteFactParts, inviteReadOnlyFacts,
  invitesStopCount, paidGuidePriceFor, recipientInviteCopy,
} from '../src/lib/inviteLandingCopy'
import type { PublishedItinerary } from '../src/data/types'

const FULL = {
  tripTitle: 'Goa with the gang',
  inviterFirstName: 'Riya',
  route: 'Pune → Goa',
  crew: 4,
  startDate: '2026-12-12',
  endDate: '2026-12-17',
  days: 6,
  stops: 11,
  perPersonBudget: 18400,
  role: 'editor' as const,
  paidGuidePrice: 199,
}

describe('recipient copy with every fact', () => {
  const copy = recipientInviteCopy(FULL)

  it('names the inviter and the trip in the headline', () => {
    expect(copy.headline).toBe('Riya added you to Goa with the gang.')
  })

  it('lists the facts the trip has, in order', () => {
    expect(copy.facts).toBe('12 – 17 Dec · 6 days · 11 stops · ₹18,400 per person budget')
  })

  it('adds the paid-guide note only when a guide is priced', () => {
    expect(copy.paidGuideNote).toBe('Part of this plan is a paid guide (₹199). Joining the crew is free; you only pay if you want the locked days.')
  })

  it('speaks to an editor about voting', () => {
    expect(copy.roleLine).toContain('you can vote on the open decisions')
  })

  it('keeps the quiet read-only path and the three next steps', () => {
    expect(copy.lookFirst).toBe(INVITE_LOOK_FIRST)
    expect(copy.nextSteps).toHaveLength(3)
  })
})

describe('recipient copy with no facts', () => {
  const copy = recipientInviteCopy({ tripTitle: 'Goa with the gang' })

  it('degrades the headline instead of leaving a hole', () => {
    expect(copy.headline).toBe('You were added to Goa with the gang.')
  })

  it('says what the trip is when nothing else is known', () => {
    expect(copy.facts).toBe('A group trip on YatraFlow.')
    expect(copy.paidGuideNote).toBeNull()
  })

  it('says only what both roles share when the role is unknown', () => {
    expect(copy.roleLine).toBe('You’ll see the whole plan: days, stops, drive times and the ₹ split.')
  })
})

describe('role wording', () => {
  it('promises a viewer only what the server enforces: no edit, comment or vote', () => {
    const copy = recipientInviteCopy({ tripTitle: 'Goa', role: 'viewer' })
    expect(copy.roleLine).toContain('You can’t edit it, comment or vote.')
    // Notifications reach every member, viewers included (20261120 sends one to
    // every trip_members row), so the line must not claim silence.
    expect(copy.roleLine).not.toContain('notification')
  })

  it('says what the link gives, in both the headline sentence and the role line', () => {
    expect(recipientInviteCopy({ tripTitle: 'Goa', inviterFirstName: 'Shubham' }).headline)
      .toBe('Shubham added you to Goa.')
    expect(recipientInviteCopy({ tripTitle: 'Goa', inviterFirstName: 'Shubham', role: 'editor' }).roleLine)
      .toContain('you can vote on the open decisions')
    expect(recipientInviteCopy({ tripTitle: 'Goa', inviterFirstName: 'Shubham', role: 'viewer' }).roleLine)
      .not.toContain('you can vote')
  })
})

// The two fields the preview RPC projects (20261126_invite_preview_projection.sql).
// Each one degrades on its own: a name without a role, or a role without a name,
// still reads as a complete sentence.
describe('the inviter name the preview projects', () => {
  it('names the friend when the preview carries one', () => {
    expect(recipientInviteCopy({ tripTitle: 'Goa 2026', inviterFirstName: 'Shubham' }).headline)
      .toBe('Shubham added you to Goa 2026.')
    expect(inviteConfirmCopy({ tripTitle: 'Goa 2026', inviterFirstName: 'Shubham' }).sub)
      .toBe('Shubham invited you.')
  })

  it('keeps today’s anonymous wording when the preview carries none', () => {
    const anonymous = 'You were added to Goa 2026.'
    for (const inviterFirstName of [null, undefined, '', '   ']) {
      expect(recipientInviteCopy({ tripTitle: 'Goa 2026', inviterFirstName }).headline).toBe(anonymous)
    }
    expect(inviteConfirmCopy({ tripTitle: 'Goa 2026' }).sub).toBe('You were invited.')
  })

  it('strips a leading @ from a handle', () => {
    expect(recipientInviteCopy({ tripTitle: 'Goa 2026', inviterFirstName: '@shubham_k' }).headline)
      .toBe('shubham_k added you to Goa 2026.')
    expect(inviteFirstName('@shubham_k')).toBe('shubham_k')
    expect(inviteFirstName('@@riya')).toBe('riya')
  })

  it('caps a long name at 24 characters, ellipsis included', () => {
    const long = 'Bartholomewmaximilianjones'
    const copy = recipientInviteCopy({ tripTitle: 'Goa 2026', inviterFirstName: long })
    expect(copy.headline).toBe('Bartholomewmaximilianjo… added you to Goa 2026.')
    expect(inviteFirstName(long)).toHaveLength(24)
    // A name the server already capped comes through unchanged, never re-cut.
    expect(inviteFirstName('Bartholomewmaximilianjo…')).toBe('Bartholomewmaximilianjo…')
  })

  it('refuses a token that is an address, a URL or a phone number instead of printing it', () => {
    expect(inviteFirstName('Shubham@Example.com')).toBeNull()
    expect(inviteFirstName('https://instagram.com/shubham')).toBeNull()
    expect(inviteFirstName('+91 98765 43210')).toBeNull()
    expect(recipientInviteCopy({ tripTitle: 'Goa 2026', inviterFirstName: 'Shubham@Example.com' }).headline)
      .toBe('You were added to Goa 2026.')
  })

  it('refuses a schemeless web address or a dotted phone number, which carry no @ or /', () => {
    for (const contact of ['www.example.com', 'example.com', '98765.43210', 'shubham.k', '+91.98765.43210', '(022).123.4567', '-', '(', '()']) {
      expect(inviteFirstName(contact), contact).toBeNull()
      expect(recipientInviteCopy({ tripTitle: 'Goa 2026', inviterFirstName: contact }).headline)
        .toBe('You were added to Goa 2026.')
    }
    // A trailing full stop is punctuation, not a domain: the word survives it.
    expect(inviteFirstName('Riya.')).toBe('Riya')
  })
})

describe('the preview role, and the paid guide alongside it', () => {
  it('states an editor link and a viewer link differently, with the same name', () => {
    const base = { tripTitle: 'Goa 2026', inviterFirstName: 'Shubham' }
    expect(recipientInviteCopy({ ...base, role: 'editor' }).roleLine).toContain('you can vote')
    expect(recipientInviteCopy({ ...base, role: 'viewer' }).roleLine).toBe(
      'You’ll see the whole plan: days, stops, drive times and the ₹ split. You can’t edit it, comment or vote.',
    )
  })

  it('keeps the role line when the preview carried no name, and the name when it carried no role', () => {
    expect(recipientInviteCopy({ tripTitle: 'Goa 2026', role: 'viewer' }).headline).toBe('You were added to Goa 2026.')
    expect(recipientInviteCopy({ tripTitle: 'Goa 2026', inviterFirstName: 'Shubham' }).roleLine)
      .toBe('You’ll see the whole plan: days, stops, drive times and the ₹ split.')
  })

  it('names the friend and still says the guide is a paid extra', () => {
    const copy = recipientInviteCopy({
      tripTitle: 'Goa 2026', inviterFirstName: 'Shubham', role: 'viewer', paidGuidePrice: 499,
    })
    expect(copy.headline).toBe('Shubham added you to Goa 2026.')
    expect(copy.paidGuideNote).toBe('Part of this plan is a paid guide (₹499). Joining the crew is free; you only pay if you want the locked days.')
    expect(copy.roleLine).not.toContain('you can vote')
  })
})

describe('a failed preview read', () => {
  // The gate's `broken` state renders the same recipient copy from an empty
  // fact set, so a failed or unapplied read must read exactly like today's
  // anonymous screen rather than as an error.
  it('renders today’s anonymous wording from no facts at all', () => {
    const copy = recipientInviteCopy({})
    expect(copy.headline).toBe('You were added to a trip.')
    expect(copy.facts).toBe('A group trip on YatraFlow.')
    expect(copy.roleLine).toBe('You’ll see the whole plan: days, stops, drive times and the ₹ split.')
    expect(copy.paidGuideNote).toBeNull()
    expect(inviteReadOnlyFacts({})).toEqual([])
  })
})

describe('the signed-in confirm', () => {
  it('asks the question with the facts it has', () => {
    const copy = inviteConfirmCopy({ tripTitle: 'Goa with the gang', inviterFirstName: 'Riya', days: 6, stops: 11 })
    expect(copy.headline).toBe('Join Goa with the gang?')
    expect(copy.sub).toBe('Riya invited you. 6 days · 11 stops.')
    expect(copy.primary).toBe('Join the trip')
    expect(copy.quiet).toBe('Not now')
  })

  it('drops absent counts without leaving a dangling separator', () => {
    const copy = inviteConfirmCopy({ tripTitle: 'Goa', inviterFirstName: 'Riya', days: null, stops: null })
    expect(copy.sub).toBe('Riya invited you.')
  })
})

describe('the expired link', () => {
  const copy = expiredInviteCopy()

  it('offers the code box and the FAQ section that explains codes', () => {
    expect(copy.headline).toBe('This invite link has expired.')
    expect(copy.codeLabel).toBe('Trip code')
    expect(copy.codePlaceholder).toBe('GOA-K7QF')
    expect(copy.codeAction).toBe('Open the trip')
    // A query, not a fragment: the native shell routes on the hash.
    expect(copy.helpHref).toBe('/faq?section=codes')
  })

  it('names the owner only when the name is known', () => {
    expect(copy.body).toBe('Links can be reset by whoever owns the trip. Ask whoever shared it for a fresh one, or enter the code they shared.')
    expect(expiredInviteCopy({ ownerFirstName: 'Riya Sharma' }).body).toContain('Ask Riya for a fresh one')
  })
})

describe('the already-member state', () => {
  it('is not an error and offers the plan', () => {
    expect(alreadyMemberCopy()).toEqual({ headline: 'You’re already on this trip.', action: 'Open the plan' })
  })
})

describe('no blank field reaches the screen', () => {
  const forbidden = ['undefined', '₹0', '0 stops', '0 days', 'NaN', 'null']
  const copies = [
    recipientInviteCopy({}),
    recipientInviteCopy({ tripTitle: '   ', days: 0, stops: 0, perPersonBudget: 0 }),
    recipientInviteCopy({ tripTitle: 'Goa', days: null, stops: null, perPersonBudget: Number.NaN }),
    recipientInviteCopy({ tripTitle: 'Goa', perPersonBudget: -400, days: -1 }),
  ]

  it.each(copies.map((copy, index) => [index, copy] as const))('copy %i reads clean', (_index, copy) => {
    const text = [copy.headline, copy.facts, copy.roleLine, copy.underPrimary, copy.lookFirst, ...copy.nextSteps, copy.paidGuideNote ?? ''].join(' ')
    for (const token of forbidden) expect(text).not.toContain(token)
  })

  it('never prints a zero-count fact', () => {
    expect(inviteFactParts({ days: 0, stops: 0, perPersonBudget: 0 })).toEqual([])
  })
})

describe('the read-only rows', () => {
  it('drops every row it does not have', () => {
    expect(inviteReadOnlyFacts({})).toEqual([])
    const rows = inviteReadOnlyFacts(FULL)
    expect(rows.map(row => row.label)).toEqual(['Route', 'Dates', 'Days', 'Stops', 'Crew', 'Budget'])
  })
})

describe('counting and lookup helpers', () => {
  it('counts stops across days and skips a day the server withheld', () => {
    expect(invitesStopCount([
      { stops: [1, 2, 3] },
      { stops: [1] },
    ])).toBe(4)
    expect(invitesStopCount([{ stops: [1, 2] }, { stops: null }, { stops: [1], locked: true }])).toBe(2)
    expect(invitesStopCount(null)).toBe(0)
  })

  it('takes the first name only', () => {
    expect(inviteFirstName('Riya Sharma')).toBe('Riya')
    expect(inviteFirstName('   ')).toBeNull()
    expect(inviteFirstName(undefined)).toBeNull()
  })

  it('formats a range without inventing a second date', () => {
    expect(inviteDateRange('2026-12-12', '2026-12-17')).toBe('12 – 17 Dec')
    expect(inviteDateRange('2026-12-12', '2026-12-12')).toBe('12 Dec')
    expect(inviteDateRange('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan')
    expect(inviteDateRange(null, null)).toBeNull()
  })

  it('finds a live paid publication and ignores a free or unpublished one', () => {
    const pub = (over: Partial<PublishedItinerary>): PublishedItinerary => ({
      id: 'pub', tripId: 'trip-1', creatorId: 'c', title: 't', tagline: '', routeSummary: [], durationDays: 3,
      estimatedBudgetPerPersonInr: 1000, travelStyle: 'balanced', travelTips: [], warningsAndAssumptions: [],
      freeDayIndexes: [0], publishedAt: 1, views: 0, copies: 0, ...over,
    })
    expect(paidGuidePriceFor('trip-1', [pub({}), pub({ id: 'b', premiumPriceInr: 249 })])).toBe(249)
    expect(paidGuidePriceFor('trip-1', [pub({ premiumPriceInr: 249, unpublishedAt: 5 })])).toBeNull()
    expect(paidGuidePriceFor('trip-2', [pub({ premiumPriceInr: 249 })])).toBeNull()
  })
})
