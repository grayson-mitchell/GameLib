import { readFileSync } from 'fs'
import { join } from 'path'
import { migrateFocusRowSelection } from 'common/focusRowMigration'
import { migrateTrayIconVariant } from 'common/trayIconVariant'
import { settingsGlobalChain } from '../settingsGlobal'
import { createMigrations } from '../index'
import { settingsAsyncArgs, settingsSyncArgs } from 'common/types/ipc/settings'
import {
  parseSettingsVersion,
  settingsVersionCodec
} from '../../storeVersioning/settingsFiles'

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'))

const step = settingsGlobalChain[0]!

describe('settings/global v0 -> v1', () => {
  test('persists trayIconVariant and focusRow, drops the superseded fields', () => {
    const file = fixture('settings-global-v0.json')
    const original = file['defaultSettings'] as Record<string, unknown>
    const out = step.run(structuredClone(file))
    const next = out['defaultSettings'] as Record<string, unknown>
    expect(next['trayIconVariant']).toBe(migrateTrayIconVariant(original))
    expect(next['trayIconVariant']).toBe('dark')
    expect(next['focusRow']).toEqual(migrateFocusRowSelection(original))
    expect(next['focusRow']).toEqual({ kind: 'view', value: 'recentlyPlayed' })
    expect('darkTrayIcon' in next).toBe(false)
    expect('libraryTopSection' in next).toBe(false)
    expect(next['language']).toBe('en')
  })

  test('preserves values already present', () => {
    const file = fixture('settings-global-v0-with-focusrow.json')
    const next = step.run(structuredClone(file))['defaultSettings'] as Record<
      string,
      unknown
    >
    expect(next['trayIconVariant']).toBe('light')
    expect(next['focusRow']).toEqual({ kind: 'view', value: 'favourites' })
    expect(next['language']).toBe('de')
  })

  test('a file without a defaultSettings object is returned unchanged', () => {
    const file = { version: 'v0' }
    expect(step.run(file)).toBe(file)
  })

  test('parseSettingsVersion and codec', () => {
    expect(parseSettingsVersion(undefined)).toBe(0)
    expect(parseSettingsVersion('v0')).toBe(0)
    expect(parseSettingsVersion('v1')).toBe(1)
    expect(parseSettingsVersion('v0.1')).toBe(0)
    expect(parseSettingsVersion('v12')).toBe(12)
    expect(parseSettingsVersion('auto')).toBe(0)
    expect(parseSettingsVersion(42)).toBe(0)
    expect(parseSettingsVersion('garbage')).toBe(0)
    const d = { a: 1, version: 'v0' }
    expect(settingsVersionCodec.write(d, 1)).toEqual({ a: 1, version: 'v1' })
    expect(d.version).toBe('v0')
  })
})

describe('settings/global v1 -> v2', () => {
  const v2 = settingsGlobalChain[1]!
  const run = (file: Record<string, unknown>) =>
    v2.run(structuredClone(file))['defaultSettings'] as Record<string, unknown>
  const writeOk = (config: unknown) =>
    settingsAsyncArgs.writeConfig.safeParse([{ appName: 'default', config }])
      .success

  const expectIpcPass = (name: string) => {
    const raw = fixture(name)
    expect(writeOk(raw['defaultSettings'])).toBe(false) // control
    const next = run(raw)
    expect(writeOk(next)).toBe(true)
    for (const [key, value] of Object.entries(next)) {
      expect(
        settingsSyncArgs.setSetting.safeParse([
          { appName: 'default', key, value }
        ]).success
      ).toBe(true)
    }
    return next
  }

  test('chain shape', () => {
    expect(settingsGlobalChain.map((m) => m.id)).toEqual([
      'settings-global-v0-v1',
      'settings-global-v1-v2'
    ])
    expect(createMigrations().currentVersionOf('settings/global')).toBe(2)
  })

  test('retired keys, nulls and nested extras are removed', () => {
    const next = expectIpcPass('settings-global-v1-retired-keys.json')
    expect('useSteamRuntime' in next).toBe(false)
    expect('checkUpdatesInterval' in next).toBe(false)
    expect(next['experimentalFeatures']).toEqual({ cometSupport: true })
    expect(next['focusRow']).toBeNull()
    expect(next['language']).toBe('en')
    expect(next['customWinePaths']).toEqual(['/x'])
    expect(next['trayIconVariant']).toBe('auto')
  })

  test('invalid values are dropped, valid ones kept', () => {
    const next = expectIpcPass('settings-global-v1-invalid-values.json')
    expect('checkUpdatesInterval' in next).toBe(false)
    expect('experimentalFeatures' in next).toBe(false)
    expect(next['maxWorkers']).toBe(4)
    expect(next['focusRow']).toEqual({ kind: 'view', value: 'favourites' })
    expect(next['language']).toBe('de')
  })

  test('valid values come out deep-equal', () => {
    const valid = {
      language: 'de',
      maxWorkers: 2,
      focusRow: null,
      trayIconVariant: 'dark',
      customWinePaths: ['/a']
    }
    expect(run({ defaultSettings: valid, version: 'v1' })).toEqual(valid)
  })

  test('a file without a defaultSettings object is returned unchanged', () => {
    const file = { version: 'v1' }
    expect(v2.run(file)).toBe(file)
  })

  test('v0 -> v1 -> v2 keeps the tray and focusRow fold', () => {
    const file = fixture('settings-global-v0.json')
    const next = settingsGlobalChain[1]!.run(step.run(structuredClone(file)))[
      'defaultSettings'
    ] as Record<string, unknown>
    expect(next['trayIconVariant']).toBe('dark')
    expect(next['focusRow']).toEqual({ kind: 'view', value: 'recentlyPlayed' })
    expect('darkTrayIcon' in next).toBe(false)
    expect('libraryTopSection' in next).toBe(false)
  })
})
