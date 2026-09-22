// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createReadiness, readinessLine, readinessFromDraft } from '../src/lib/createReadiness'

const base = {
  name: 'Kerala with the crew',
  startLocation: 'Kochi, Kerala',
  stopCount: 2,
  roadKm: 412,
  startDate: '2026-02-14',
  endDate: '2026-02-19',
  days: 6,
  travellers: 4,
  budgetPerPersonInr: 12500,
  hasCover: false,
  commitmentCount: 0,
}

describe('create readiness - what is left, said plainly', () => {
  it('a fully filled form is ready, at 100%, with nothing left', () => {
    const r = createReadiness(base)
    expect(r.ready).toBe(true)
    expect(r.pct).toBe(100)
    expect(r.remaining).toBe(0)
    expect(readinessLine(r)).toBe('Ready to plan')
  })

  it('optional rows never move the percentage', () => {
    const bare = createReadiness({ ...base, hasCover: false, commitmentCount: 0 })
    const dressed = createReadiness({ ...base, hasCover: true, commitmentCount: 3 })
    expect(dressed.pct).toBe(bare.pct)
    expect(dressed.remaining).toBe(bare.remaining)
    // but they do report their own state honestly
    expect(dressed.items.find(i => i.key === 'cover')!.why).toBe('set')
    expect(dressed.items.find(i => i.key === 'commitments')!.why).toBe('3 pinned')
    expect(bare.items.find(i => i.key === 'cover')!.why).toBe('optional')
  })

  it('MIRROR GUARD: every rule matches what submit() enforces', () => {
    // submit() requires: name, start, >=1 destination, both dates, end >= start,
    // travellers >= 1, budget >= 0. Each is reflected here.
    expect(createReadiness({ ...base, name: '  ' }).ready).toBe(false)
    expect(createReadiness({ ...base, startLocation: '' }).ready).toBe(false)
    expect(createReadiness({ ...base, stopCount: 0 }).ready).toBe(false)
    expect(createReadiness({ ...base, startDate: '' }).ready).toBe(false)
    expect(createReadiness({ ...base, endDate: '' }).ready).toBe(false)
    expect(createReadiness({ ...base, endDate: '2026-02-01' }).ready).toBe(false)
    expect(createReadiness({ ...base, travellers: 0 }).ready).toBe(false)
    expect(createReadiness({ ...base, budgetPerPersonInr: -1 }).ready).toBe(false)
  })

  it('an end date equal to the start date is acceptable (a day out)', () => {
    const r = createReadiness({ ...base, endDate: base.startDate, days: 1 })
    expect(r.ready).toBe(true)
  })

  it('the percentage is over required items only, and steps by 20', () => {
    const r = createReadiness({ ...base, name: '', stopCount: 0 })
    // 3 of 5 required done
    expect(r.pct).toBe(60)
    expect(r.remaining).toBe(2)
  })

  it('the why strings describe real state, not encouragement', () => {
    const r = createReadiness(base)
    const why = Object.fromEntries(r.items.map(i => [i.key, i.why]))
    expect(why.route).toBe('2 stops, ~412 km')
    expect(why.dates).toBe('6 days')
    expect(why.party).toBe('4 travellers')
    expect(why.budget).toContain('/ head')
    expect(why.name).toBe('Kerala with the crew')
    const empty = createReadiness({ ...base, name: '', startLocation: '', stopCount: 0, startDate: '', endDate: '', travellers: 0 })
    const e = Object.fromEntries(empty.items.map(i => [i.key, i.why]))
    expect(e.name).toBe('name it to make it yours')
    expect(e.route).toBe('add a stop and a starting point')
    expect(e.dates).toBe('pick the window')
  })

  it('readinessFromDraft reads an opaque stored form defensively', () => {
    const full = readinessFromDraft(
      { name: 'Goa', startLocation: 'Panaji, Goa', startDate: '2026-02-14', endDate: '2026-02-17', travellers: 4, budgetPerPersonInr: 12000 }, 2)
    expect(full.pct).toBe(100)
    expect(full.ready).toBe(true)
    // junk types must not be believed: the name is ignored, not accepted
    const junk = readinessFromDraft({ name: 42, travellers: 'lots', startDate: null } as Record<string, unknown>, 0)
    expect(junk.items.find(i => i.key === 'name')!.done).toBe(false)
    expect(junk.items.find(i => i.key === 'route')!.done).toBe(false)
    // travellers falls back to the floor of 1, which is a real party
    expect(junk.items.find(i => i.key === 'party')!.why).toBe('1 traveller')
    expect(junk.pct).toBe(40)
    expect(junk.ready).toBe(false)
  })

  it('the line names the single thing that is left', () => {
    const r = createReadiness({ ...base, startDate: '', endDate: '' })
    expect(r.remaining).toBe(1)
    expect(readinessLine(r)).toBe('One thing left - dates')
    const two = createReadiness({ ...base, startDate: '', endDate: '', name: '' })
    expect(readinessLine(two)).toBe('2 things left')
  })

  it('road distance is optional in the line - an ungeocoded route still reads', () => {
    const r = createReadiness({ ...base, roadKm: null })
    expect(r.items.find(i => i.key === 'route')!.why).toBe('2 stops')
    expect(r.ready).toBe(true)
  })
})
