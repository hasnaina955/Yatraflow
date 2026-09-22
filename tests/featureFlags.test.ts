// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseFunnelPhases } from '../src/lib/featureFlags'

describe('create-funnel flag discipline', () => {
  it('an explicit list turns on exactly those phases - dev or prod', () => {
    const dev = parseFunnelPhases('templates', true)
    expect(dev.all).toBe(false)
    expect(dev.phases.has('templates')).toBe(true)
    expect(dev.phases.has('budget')).toBe(false)
    const prod = parseFunnelPhases('templates,budget', false)
    expect(prod.all).toBe(false)
    expect(prod.phases.has('templates')).toBe(true)
    expect(prod.phases.has('budget')).toBe(true)
    expect(prod.phases.has('drafts')).toBe(false)
  })

  it('unset in a dev build means everything on, so local work is visible without config', () => {
    const r = parseFunnelPhases(undefined, true)
    expect(r.all).toBe(true)
    expect(r.phases.size).toBe(0)
  })

  it('unset in a production build means dark', () => {
    expect(parseFunnelPhases(undefined, false).all).toBe(false)
    expect(parseFunnelPhases('', false).all).toBe(false)
  })

  it('whitespace and empty entries are tolerated', () => {
    expect(Array.from(parseFunnelPhases('  templates , , budget ,', false).phases)).toEqual(['templates', 'budget'])
    expect(parseFunnelPhases('   ', true).all).toBe(true)
  })

  it('an explicit list wins over the dev default - dev can dark-run a single phase', () => {
    const r = parseFunnelPhases('iq', true)
    expect(r.all).toBe(false)
    expect(r.phases.has('iq')).toBe(true)
    expect(r.phases.has('templates')).toBe(false)
  })
})
