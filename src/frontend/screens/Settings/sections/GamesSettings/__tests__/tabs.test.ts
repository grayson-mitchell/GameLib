import type { GameInfo } from 'common/types'
import {
  getStartingTab,
  initialSettingsTab,
  readRememberedTab,
  rememberTab,
  settingsTabOrder,
  settingTabKey
} from '../tabs'

const game = (platform: string, runner = 'steam', appName = '576770') =>
  ({
    runner,
    app_name: appName,
    install: { platform }
  }) as unknown as GameInfo

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string): string | null => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    removeItem: (k: string) => {
      delete data[k]
    }
  }
}

describe('getStartingTab (261121-dzl)', () => {
  it('a macOS Windows-engine game opens on Run (#4)', () => {
    expect(getStartingTab('darwin', game('Windows'))).toBe('run')
  })
  it('a macOS native game opens on Run', () => {
    expect(getStartingTab('darwin', game('Mac'))).toBe('run')
  })
  it('Linux keeps Wine for a Windows game and Run for a Linux game', () => {
    expect(getStartingTab('linux', game('Windows'))).toBe('wine')
    expect(getStartingTab('linux', game('linux'))).toBe('run')
  })
  it('Windows always opens on Run', () => {
    expect(getStartingTab('win32', game('Windows'))).toBe('run')
    expect(getStartingTab('win32', null)).toBe('run')
  })
  it('the Default page keeps Wine off Windows', () => {
    expect(getStartingTab('darwin', null)).toBe('wine')
  })
})

describe('settingsTabOrder (261121-dzl)', () => {
  const all = {
    showWineTab: true,
    showWinetricksTab: true,
    showCloudSavesTab: true,
    showGamescopeTab: true,
    showLegacyTab: true
  }
  it('runFirst puts Run in front of Wine and Winetricks', () => {
    expect(
      settingsTabOrder({
        ...all,
        runFirst: true,
        showCloudSavesTab: false,
        showGamescopeTab: false,
        showLegacyTab: false
      })
    ).toEqual(['run', 'wine', 'winetricks', 'advanced'])
  })
  it('without runFirst the order is unchanged', () => {
    expect(
      settingsTabOrder({
        ...all,
        runFirst: false,
        showCloudSavesTab: false,
        showGamescopeTab: false,
        showLegacyTab: false
      })
    ).toEqual(['wine', 'winetricks', 'run', 'advanced'])
  })
  it('saves, gamescope and legacy follow advanced in that order', () => {
    expect(settingsTabOrder({ ...all, runFirst: true })).toEqual([
      'run',
      'wine',
      'winetricks',
      'advanced',
      'saves',
      'gamescope',
      'legacy'
    ])
  })
  it('hidden tabs are omitted; run and advanced are always present', () => {
    expect(
      settingsTabOrder({
        runFirst: false,
        showWineTab: false,
        showWinetricksTab: false,
        showCloudSavesTab: false,
        showGamescopeTab: false,
        showLegacyTab: false
      })
    ).toEqual(['run', 'advanced'])
  })
})

describe('settingTabKey (261121-dzl)', () => {
  it('is runner-keyed', () => {
    expect(settingTabKey(game('Windows'))).toBe('steam-576770-setting_tab')
  })
  it('is "default" with no game', () => {
    expect(settingTabKey(undefined)).toBe('default')
    expect(settingTabKey(null)).toBe('default')
  })
})

describe('readRememberedTab / rememberTab (261121-dzl)', () => {
  it('reads the new key and leaves a legacy key alone', () => {
    const s = fakeStorage({
      'steam-576770-setting_tab': 'advanced',
      '576770-setting_tab': 'wine'
    })
    expect(readRememberedTab(s, game('Windows'))).toBe('advanced')
    expect(s.data['576770-setting_tab']).toBe('wine')
  })
  it('migrates a legacy-only value once', () => {
    const s = fakeStorage({ '576770-setting_tab': 'wine' })
    expect(readRememberedTab(s, game('Windows'))).toBe('wine')
    expect(s.data['steam-576770-setting_tab']).toBe('wine')
    expect('576770-setting_tab' in s.data).toBe(false)
    expect(readRememberedTab(s, game('Windows'))).toBe('wine')
  })
  it('returns null when neither key is present', () => {
    expect(readRememberedTab(fakeStorage(), game('Windows'))).toBeNull()
  })
  it('reads "default" with no game', () => {
    expect(readRememberedTab(fakeStorage({ default: 'run' }), null)).toBe('run')
  })
  it('rememberTab writes the new key only', () => {
    const s = fakeStorage()
    rememberTab(s, game('Windows'), 'advanced')
    expect(s.data).toEqual({ 'steam-576770-setting_tab': 'advanced' })
  })
})

describe('initialSettingsTab (261121-dzl)', () => {
  const visible = ['run', 'wine', 'advanced'] as const
  const opts = { visible: [...visible], startingTab: 'wine' }
  it('null gives the starting tab', () => {
    expect(initialSettingsTab(null, opts)).toBe('wine')
  })
  it("'other' maps to run", () => {
    expect(initialSettingsTab('other', opts)).toBe('run')
  })
  it('a hidden or unknown value gives the starting tab', () => {
    expect(initialSettingsTab('winetricks', opts)).toBe('wine')
    expect(initialSettingsTab('bogus', opts)).toBe('wine')
  })
  it('a visible value is returned as is', () => {
    expect(initialSettingsTab('advanced', opts)).toBe('advanced')
  })
})
