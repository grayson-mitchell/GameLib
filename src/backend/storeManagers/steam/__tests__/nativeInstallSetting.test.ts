/**
 * Unit tests for isSteamNativeInstallEnabled() — D-13's single backend read
 * seam for the opt-in Steam native-install setting (Plan 03).
 *
 * Mock strategy follows steam/__tests__/bottle.test.ts:
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test
 *  - the config slice is an in-memory createTestGlobalConfig — no real electron-store I/O
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import * as nativeInstallSettingModule from '../nativeInstallSetting'
import {
  isSteamNativeDeleteEnabled,
  isSteamNativeInstallEnabled
} from '../nativeInstallSetting'
import type { AppSettings } from 'common/types'

let config = createTestGlobalConfig()

function mockSettings(partial: Partial<AppSettings>) {
  config = createTestGlobalConfig(partial)
}

describe('nativeInstallSetting.ts', () => {
  beforeEach(() => {
    config = createTestGlobalConfig()
  })

  describe('isSteamNativeInstallEnabled', () => {
    it('returns true when the GlobalConfig setting is unset (default ON, quick 261024-exo)', () => {
      mockSettings({})

      expect(isSteamNativeInstallEnabled(config)).toBe(true)
    })

    it('returns true when the setting is explicitly true', () => {
      mockSettings({ enableSteamNativeInstall: true })

      expect(isSteamNativeInstallEnabled(config)).toBe(true)
    })

    it('returns false when the setting is explicitly false', () => {
      mockSettings({ enableSteamNativeInstall: false })

      expect(isSteamNativeInstallEnabled(config)).toBe(false)
    })
  })

  describe('isSteamNativeDeleteEnabled (quick 261106-s3n)', () => {
    it.each([
      ['unset + install unset', {}, true],
      ['unset + install false', { enableSteamNativeInstall: false }, false],
      ['unset + install true', { enableSteamNativeInstall: true }, true],
      [
        'false + install true',
        { enableSteamNativeDelete: false, enableSteamNativeInstall: true },
        false
      ],
      [
        'true + install false',
        { enableSteamNativeDelete: true, enableSteamNativeInstall: false },
        true
      ]
    ])('%s -> %s', (_name, settings, expected) => {
      mockSettings(settings)
      expect(isSteamNativeDeleteEnabled(config)).toBe(expected)
    })
  })

  // ── Phase 23 (23-02, D-03): no new user-facing toggle ───────────────────
  describe('D-03: StateFlags=4 inherits the D-13 opt-in, no new setting', () => {
    it('nativeInstallSetting.ts exports ONLY isSteamNativeInstallEnabled — no second StateFlags4-specific accessor was added', () => {
      expect(Object.keys(nativeInstallSettingModule)).toEqual([
        'isSteamNativeInstallEnabled',
        'isSteamNativeDeleteEnabled'
      ])
    })

    it('no StateFlags4/full-ownership-specific setting key exists on AppSettings', () => {
      const source = readFileSync(
        join(__dirname, '../../../../common/types.ts'),
        'utf8'
      )
      expect(source).not.toMatch(/stateFlags4/i)
      expect(source).not.toMatch(/fullOwnership/i)
      expect(source).not.toMatch(/enableSteamFullOwnership/i)
    })
  })
})
