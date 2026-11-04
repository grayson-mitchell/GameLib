import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDir = mkdtempSync(join(tmpdir(), 'gamelib-title-cfg-'))
jest.mock('backend/constants/paths', () => ({
  ...jest.requireActual('backend/constants/paths'),
  gamesConfigPath: mockDir
}))

import {
  readStoredTitleConfig,
  TITLE_AUTHORITATIVE_KEYS,
  pickTitleSettings
} from '../titleSettings'

afterAll(() => rmSync(mockDir, { recursive: true, force: true }))

describe('readStoredTitleConfig', () => {
  it.each(['../x', 'abc', '12345678901', ''])(
    'rejects the malformed appId %p',
    (id) => {
      expect(readStoredTitleConfig(id)).toBeUndefined()
    }
  )

  it('returns undefined for a missing file', () => {
    expect(readStoredTitleConfig('111')).toBeUndefined()
  })

  it('returns undefined for corrupt JSON', () => {
    writeFileSync(join(mockDir, '222.json'), '{nope')
    expect(readStoredTitleConfig('222')).toBeUndefined()
  })

  it('returns undefined when the file has no entry for the appId', () => {
    writeFileSync(join(mockDir, '333.json'), JSON.stringify({ '999': {} }))
    expect(readStoredTitleConfig('333')).toBeUndefined()
  })

  it.each([
    ['a string', '"x"'],
    ['null', 'null'],
    ['an array', '[1]']
  ])('returns undefined when the entry is %s', (_n, json) => {
    writeFileSync(join(mockDir, '444.json'), `{"444":${json}}`)
    expect(readStoredTitleConfig('444')).toBeUndefined()
  })

  it('returns the entry object', () => {
    writeFileSync(
      join(mockDir, '620.json'),
      JSON.stringify({ '620': { launcherArgs: '-x' } })
    )
    expect(readStoredTitleConfig('620')).toEqual({ launcherArgs: '-x' })
  })
})

describe('TITLE_AUTHORITATIVE_KEYS', () => {
  it('is the 11 per-title keys', () => {
    expect([...TITLE_AUTHORITATIVE_KEYS].sort()).toEqual(
      [
        'launcherArgs',
        'targetExe',
        'enviromentOptions',
        'wrapperOptions',
        'beforeLaunchScriptPath',
        'afterLaunchScriptPath',
        'language',
        'verboseLogs',
        'showFps',
        'showMangohud',
        'lastUsedLaunchOption'
      ].sort()
    )
  })
})

describe('pickTitleSettings', () => {
  it('returns {} for undefined', () => {
    expect(pickTitleSettings(undefined)).toEqual({})
  })

  it('keeps only allowlisted keys', () => {
    expect(
      pickTitleSettings({
        launcherArgs: '-x',
        wineVersion: { name: 'stale' },
        winePrefix: '/stale',
        wineCrossoverBottle: 'Old',
        steamEngineOverride: 'pinned:a',
        steamOverlayOverride: 'off',
        junk: 1
      })
    ).toEqual({ launcherArgs: '-x' })
  })

  it('keeps falsy-but-present values and drops undefined ones', () => {
    const r = pickTitleSettings({
      verboseLogs: false,
      launcherArgs: '',
      enviromentOptions: [],
      showFps: undefined
    })
    expect(r).toEqual({
      verboseLogs: false,
      launcherArgs: '',
      enviromentOptions: []
    })
    expect('showFps' in r).toBe(false)
  })
})
