import { readFileSync } from 'fs'
import { join } from 'path'
import { migrateFocusRowSelection } from 'common/focusRowMigration'
import { migrateTrayIconVariant } from 'common/trayIconVariant'
import { settingsGlobalChain } from '../settingsGlobal'
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
