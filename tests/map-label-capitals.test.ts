import { expect, it } from 'vitest'
import { lowercaseMapLabels, sourceFiles } from './uiSourceScan'

it('detects lowercase Map labels while preserving numeric units and ignoring code and comments', () => {
  const source = '// lowercase comment\r\nconst mode = "drive"\r\nconst view = <><p>planned</p><button title="open menu">45 min</button></>'
  expect(lowercaseMapLabels('example.tsx', source)).toEqual([
    expect.stringMatching(/^example\.tsx:3: planned$/), expect.stringMatching(/^example\.tsx:3: open menu$/),
  ])
})

it('starts visible Map labels with a capital or number', () => {
  const files = ['src/pages/trip/MapTab.tsx', 'src/components/TripMap.tsx', ...sourceFiles('src/pages/trip/map'), ...sourceFiles('src/components/map')]
  expect(files.flatMap(file => lowercaseMapLabels(file))).toEqual([])
})

it('detects a capital inserted inside a phrase, as after a number', () => {
  const source = 'const view = <><p>{`${n} picks Along the drive`}</p><span aria-label="2 Added by the app">X</span><p>Picks along the drive</p></>'
  expect(lowercaseMapLabels('example.tsx', source)).toEqual([
    expect.stringMatching(/^example\.tsx:1: picks Along the drive$/), expect.stringMatching(/^example\.tsx:1: 2 Added by the app$/),
  ])
})
