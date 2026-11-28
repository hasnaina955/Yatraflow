import { describe, expect, it } from 'vitest'
import { coarsenPublicPlace } from '../src/lib/publicPlace'

describe('coarsenPublicPlace (#1015)', () => {
  it('strips street, flat, house number, PIN and country down to town and region', () => {
    expect(coarsenPublicPlace('42 MG Road, Indiranagar, Bengaluru, Karnataka, 560038, India')).toBe('Bengaluru, Karnataka')
    expect(coarsenPublicPlace('Flat 3B, Palm Grove, Kochi, Kerala')).toBe('Kochi, Kerala')
    expect(coarsenPublicPlace('14 Park Lane, Kolkata, West Bengal 700016')).toBe('Kolkata, West Bengal')
    expect(coarsenPublicPlace('House no 4, Sector 17, Chandigarh')).toBe('Chandigarh')
    expect(coarsenPublicPlace('42 MG Road, Bengaluru')).toBe('Bengaluru')
  })

  it('keeps clean town and city labels intact', () => {
    expect(coarsenPublicPlace('Kochi')).toBe('Kochi')
    expect(coarsenPublicPlace('Panaji, Goa')).toBe('Panaji, Goa')
    expect(coarsenPublicPlace('Gandhinagar, Gujarat')).toBe('Gandhinagar, Gujarat')
    expect(coarsenPublicPlace('Mumbai, Maharashtra, India')).toBe('Mumbai, Maharashtra')
  })

  it('returns empty string for address-only or empty input', () => {
    expect(coarsenPublicPlace('123 Secret Home Street')).toBe('')
    expect(coarsenPublicPlace('My Home')).toBe('')
    expect(coarsenPublicPlace('')).toBe('')
    expect(coarsenPublicPlace(null)).toBe('')
  })
})
