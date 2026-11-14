/**
 * Pins the Settings toggle read path (quick 261114-l1j): useSetting ->
 * SettingsContext.getSetting -> readSetting. Pure-function test; this
 * jest env is node-only (no jsdom), same convention as
 * useSettingsContext.fallback.test.tsx.
 */
// `useSettingsContext.ts` transitively imports modules that touch `window` at
// load time; stub uiState so the pure export can be imported in node.
jest.mock('frontend/state/uiState', () => ({
  __esModule: true,
  default: { keys: () => ({ settingsModalProps: { isOpen: false } }) }
}))

import type { AppSettings } from 'common/types'
import { readSetting } from '../useSettingsContext'

describe('readSetting (261114-l1j)', () => {
  it('reads an explicit true', () => {
    expect(
      readSetting({ autoUpdateGames: true }, 'autoUpdateGames', true)
    ).toBe(true)
  })

  it('reads an explicit false even with a true fallback', () => {
    expect(
      readSetting({ autoUpdateGames: false }, 'autoUpdateGames', true)
    ).toBe(false)
  })

  it('falls back when the key is absent', () => {
    expect(readSetting({}, 'autoUpdateGames', true)).toBe(true)
  })

  it('never lets the fallback override a stored value', () => {
    expect(
      readSetting({ autoUpdateGames: false }, 'autoUpdateGames', false)
    ).toBe(false)
    expect(
      readSetting({ autoUpdateGames: true }, 'autoUpdateGames', false)
    ).toBe(true)
  })

  it('reads a requestAppSettings-shaped result both ways', () => {
    const base = { checkUpdatesOnStartup: true, language: 'en' }
    const on = { ...base, autoUpdateGames: true } as Partial<AppSettings>
    const off = { ...base, autoUpdateGames: false } as Partial<AppSettings>
    expect(readSetting(on, 'autoUpdateGames', true)).toBe(true)
    expect(readSetting(off, 'autoUpdateGames', true)).toBe(false)
  })
})
