// ============ #1019 — what a code lookup's answer means ============
//
// classifyInviteRows is the one place that decides whether the RPC's answer is
// a trip, a dead link, or a failed read. fetchTripByInviteCode and the join
// gate both rely on it, so the decisions are pinned here, on the function
// itself.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { classifyInviteRows } from '../src/lib/inviteLookup'

const APP = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const ROW = {
  id: '1019b000-0000-4000-8000-000000000001', owner_id: '1019b000-0000-4000-8000-000000000002',
  name: 'Goa Beach Week', start_location: '', start_location_coords: null, destinations: ['Goa'],
  destination_coords: null, start_date: '2026-11-30', end_date: '2026-12-01',
  travellers: 2, transport_mode: 'car', budget_per_person_inr: 5000, travel_style: 'balanced',
  fixed_commitments: [{ id: 'checkin', title: 'Check in', type: 'hotel-checkin', dayIndex: 0, time: '14:00' }],
  days: [{
    id: 'day', index: 0, stops: [{
      id: 'stop', title: 'Beach', locationName: 'Goa', category: 'beach', status: 'confirmed',
      priority: 'must-do', lat: 15, lng: 73, visitMinutes: 60,
      entryFeeInrPerPerson: 0, transportCostInrTotal: 0, orderInDay: 0,
    }],
  }],
  expenses: [{ id: 'bus', label: 'Bus fare', category: 'transport', amountInr: 200 }],
  cover_emoji: '', visibility: 'private',
  invite_code: 'GOA-K7QF', created_at: 1, updated_at: 2, write_version: 3, deleted_at: null,
}

describe('classifyInviteRows', () => {
  it('no rows is dead: the RPC answered, and no trip has this code', () => {
    expect(classifyInviteRows([])).toEqual({ kind: 'dead' })
  })

  it('accepts one row in the legacy or projected shape', () => {
    for (const row of [
      ROW,
      { ...ROW, owner_first_name: 'Riya', invite_role: 'viewer' },
      { ...ROW, owner_first_name: null, invite_role: 'editor' },
    ]) {
      expect(classifyInviteRows([row])).toEqual({ kind: 'found', row })
    }
  })

  it('refuses duplicate rows or a valid row beside a malformed row', () => {
    expect(classifyInviteRows([ROW, ROW])).toEqual({ kind: 'failed' })
    expect(classifyInviteRows([ROW, null])).toEqual({ kind: 'failed' })
  })

  it.each([
    { id: 'bad id' }, { owner_id: null }, { name: 42 }, { visibility: 'hidden' },
    { destinations: [true] }, { days: [{ id: 'day', index: 0, stops: [null] }] },
    { days: [{ id: 'day', index: 0, stops: [{}] }] }, { deleted_at: undefined },
    { expenses: false }, { expenses: [{}] }, { fixed_commitments: [{}] },
    { transport_mode: 'invalid' }, { travel_style: 'invalid' }, { destination_coords: [{ lat: '12', lng: 73 }] },
    { owner_first_name: 'Riya' }, { invite_role: 'viewer' },
    { owner_first_name: 42, invite_role: 'editor' },
    { owner_first_name: 'Riya', invite_role: 'admin' },
    { owner_first_name: ' ', invite_role: 'editor' },
    { owner_first_name: null, invite_role: null },
  ])('refuses malformed fields %j', malformed => {
    expect(classifyInviteRows([{ ...ROW, ...malformed }])).toEqual({ kind: 'failed' })
  })

  it('a row with an empty or missing trip id is failed, not dead', () => {
    expect(classifyInviteRows([{ ...ROW, id: '' }])).toEqual({ kind: 'failed' })
    expect(classifyInviteRows([{ ...ROW, id: undefined }])).toEqual({ kind: 'failed' })
  })

  it('a row whose write_version is not a non-negative safe integer is failed', () => {
    for (const write_version of [undefined, null, 1.5, -1, '3', Number.MAX_SAFE_INTEGER + 2]) {
      expect(classifyInviteRows([{ ...ROW, write_version }]), `write_version ${String(write_version)}`).toEqual({ kind: 'failed' })
    }
  })

  it('a null row in the array is failed', () => {
    expect(classifyInviteRows([null])).toEqual({ kind: 'failed' })
  })

  it('a data value that is not an array is failed: a refused shape is a server fault', () => {
    for (const data of [null, undefined, {}, 'x']) {
      expect(classifyInviteRows(data), String(data)).toEqual({ kind: 'failed' })
    }
  })

  it('the join gate shows the dead-link copy word for word', () => {
    expect(APP).toContain('This invite link no longer works.')
    expect(APP).toContain('Ask the trip owner for a new one. If you are already on this trip, open it from My trips.')
  })
})
