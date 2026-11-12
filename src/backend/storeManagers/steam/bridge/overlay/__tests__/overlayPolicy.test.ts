import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDir = mkdtempSync(join(tmpdir(), 'gamelib-overlay-cfg-'))
const deps = { paths: { gamesConfigPath: mockDir } }

import {
  isAbnormalOverlayExit,
  parseOverlayOverride,
  readStoredOverlayOverride,
  resolveOverlayEnabled
} from '../overlayPolicy'

afterAll(() => rmSync(mockDir, { recursive: true, force: true }))

describe('resolveOverlayEnabled', () => {
  const r = (platform: NodeJS.Platform, userOverride: unknown, k: boolean) =>
    resolveOverlayEnabled({ platform, userOverride, knownFixOff: k })

  test.each(['linux', 'win32'] as const)('%s is platform-off', (p) => {
    expect(r(p, 'on', false)).toEqual({ enabled: false, source: 'platform' })
  })
  test('user on beats known-fix off', () => {
    expect(r('darwin', 'on', true)).toEqual({ enabled: true, source: 'user' })
  })
  test('user off beats default', () => {
    expect(r('darwin', 'off', false)).toEqual({
      enabled: false,
      source: 'user'
    })
  })
  test.each(['automatic', undefined, 'yes', 1, {}])(
    '%p + known-fix off is known-fix off',
    (u) => {
      expect(r('darwin', u, true)).toEqual({
        enabled: false,
        source: 'known-fix'
      })
    }
  )
  test.each(['automatic', undefined, 'yes', 1, {}])(
    '%p + no fix is default on',
    (u) => {
      expect(r('darwin', u, false)).toEqual({
        enabled: true,
        source: 'default'
      })
    }
  )
})

describe('parseOverlayOverride', () => {
  test.each([
    ['on', 'on'],
    ['off', 'off'],
    ['automatic', 'automatic'],
    [undefined, 'automatic'],
    ['junk', 'automatic']
  ])('%p -> %p', (i, o) => expect(parseOverlayOverride(i)).toBe(o))
})

describe('readStoredOverlayOverride', () => {
  test.each(['../1', '', '12a'])('bad appId %p is undefined', (id) => {
    expect(readStoredOverlayOverride(id, deps)).toBeUndefined()
  })
  test('missing file is undefined', () => {
    expect(readStoredOverlayOverride('111', deps)).toBeUndefined()
  })
  test('invalid JSON is undefined', () => {
    writeFileSync(join(mockDir, '222.json'), '{nope')
    expect(readStoredOverlayOverride('222', deps)).toBeUndefined()
  })
  test('returns the stored value', () => {
    writeFileSync(
      join(mockDir, '620.json'),
      JSON.stringify({ '620': { steamOverlayOverride: 'off' } })
    )
    expect(readStoredOverlayOverride('620', deps)).toBe('off')
  })
})

describe('isAbnormalOverlayExit (D-10)', () => {
  test('non-zero code inside the window', () => {
    expect(
      isAbnormalOverlayExit({
        firstMatchAt: 1000,
        stoppedAt: 20000,
        wrapperCode: 1
      })
    ).toBe(true)
  })
  test('unknown code inside the window', () => {
    expect(
      isAbnormalOverlayExit({ firstMatchAt: 1000, stoppedAt: 20000 })
    ).toBe(true)
  })
  test('zero code is never abnormal', () => {
    expect(
      isAbnormalOverlayExit({
        firstMatchAt: 1000,
        stoppedAt: 20000,
        wrapperCode: 0
      })
    ).toBe(false)
  })
  test('outside the window is not abnormal', () => {
    expect(
      isAbnormalOverlayExit({
        firstMatchAt: 1000,
        stoppedAt: 31001,
        wrapperCode: 1
      })
    ).toBe(false)
  })
  test('never seen is not abnormal', () => {
    expect(isAbnormalOverlayExit({ stoppedAt: 20000, wrapperCode: 1 })).toBe(
      false
    )
  })
})
