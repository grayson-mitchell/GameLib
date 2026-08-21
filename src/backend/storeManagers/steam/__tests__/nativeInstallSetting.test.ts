/**
 * Unit tests for isSteamNativeInstallEnabled() — D-13's single backend read
 * seam for the opt-in Steam native-install setting (Plan 03).
 *
 * Mock strategy follows steam/__tests__/bottle.test.ts:
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test
 *  - backend/config mocked (GlobalConfig.get) — no real electron-store I/O
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GlobalConfig } from 'backend/config'
import * as nativeInstallSettingModule from '../nativeInstallSetting'
import { isSteamNativeInstallEnabled } from '../nativeInstallSetting'
import type { AppSettings } from 'common/types'

jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock

function mockSettings(partial: Partial<AppSettings>) {
  mockedGlobalConfigGet.mockReturnValue({
    getSettings: () => partial as AppSettings
  })
}

describe('nativeInstallSetting.ts', () => {
  beforeEach(() => {
    mockedGlobalConfigGet.mockReset()
  })

  describe('isSteamNativeInstallEnabled', () => {
    it('returns false when the GlobalConfig setting is unset (default OFF)', () => {
      mockSettings({})

      expect(isSteamNativeInstallEnabled()).toBe(false)
    })

    it('returns true when the setting is explicitly true', () => {
      mockSettings({ enableSteamNativeInstall: true })

      expect(isSteamNativeInstallEnabled()).toBe(true)
    })

    it('returns false when the setting is explicitly false', () => {
      mockSettings({ enableSteamNativeInstall: false })

      expect(isSteamNativeInstallEnabled()).toBe(false)
    })
  })

  // ── Phase 23 (23-02, D-03): no new user-facing toggle ───────────────────
  describe('D-03: StateFlags=4 inherits the D-13 opt-in, no new setting', () => {
    it('nativeInstallSetting.ts exports ONLY isSteamNativeInstallEnabled — no second StateFlags4-specific accessor was added', () => {
      expect(Object.keys(nativeInstallSettingModule)).toEqual([
        'isSteamNativeInstallEnabled'
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
