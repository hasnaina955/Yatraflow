import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editorialRouteCover, EXPLORE_HERO, MY_TRIPS_BANNER } from '../src/lib/editorialAssets'

describe('approved editorial assets', () => {
  it.each([
    [['Kochi', 'Alleppey'], '/img/mockup-adopted/kerala-backwaters.jpg'],
    [['Panjim'], '/img/mockup-adopted/goa-panjim.jpg'],
    [['Jaipur'], '/img/mockup-adopted/rajasthan-forts.jpg'],
    [['Kaza'], '/img/mockup-adopted/spit-valley.jpg'],
    [['Shimla'], '/img/mockup-adopted/himalayan-loop.jpg'],
    [['Unknown destination'], undefined],
    [[], undefined],
    [['Goanna Bay'], undefined],
    [['  Kochi, Kerala '], '/img/mockup-adopted/kerala-backwaters.jpg'],
    [['Unknown destination', 'Panaji'], '/img/mockup-adopted/goa-panjim.jpg'],
  ])('selects a context-matched photo for %j', (places, expected) => {
    expect(editorialRouteCover(places as string[])).toBe(expected)
  })

  it('serves the banners and route photos from this project', () => {
    const paths = [MY_TRIPS_BANNER, EXPLORE_HERO,
      editorialRouteCover(['Kochi']), editorialRouteCover(['Panjim']),
      editorialRouteCover(['Jaipur']), editorialRouteCover(['Kaza']), editorialRouteCover(['Shimla'])]
    for (const asset of paths) {
      expect(asset).toBeDefined()
      expect(existsSync(resolve('public', asset!.slice(1))), asset).toBe(true)
    }
  })
})
