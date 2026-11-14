import type { AppSettings } from 'common/types'
import {
  mergeSettingsMirror,
  resyncSettingsMirror
} from '../settingsMirrorResync'

const s = (o: Record<string, unknown>) => o as unknown as AppSettings

describe('mergeSettingsMirror', () => {
  it('creates the mirror from settings when absent', () => {
    const settings = s({ autoUpdateGames: true })
    expect(mergeSettingsMirror(undefined, settings)).toEqual(settings)
  })

  it('lets config.json win and keeps mirror-only keys', () => {
    expect(
      mergeSettingsMirror(
        { autoUpdateGames: true, x: 1 },
        s({ autoUpdateGames: false })
      )
    ).toEqual({ autoUpdateGames: false, x: 1 })
  })

  it('does not mutate inputs', () => {
    const mirror = { legacy: 'a', autoUpdateGames: true }
    const settings = s({ autoUpdateGames: false })
    mergeSettingsMirror(mirror, settings)
    expect(mirror).toEqual({ legacy: 'a', autoUpdateGames: true })
    expect(settings).toEqual({ autoUpdateGames: false })
  })
})

describe('resyncSettingsMirror', () => {
  const make = (mirror: unknown, settings: Record<string, unknown>) => ({
    config: { getSettings: jest.fn(() => s(settings)) },
    configStore: {
      get_nodefault: jest.fn(() => mirror),
      set: jest.fn()
    },
    logError: jest.fn()
  })

  it('rewrites a drifted mirror', () => {
    const d = make({ autoUpdateGames: true }, { autoUpdateGames: false })
    resyncSettingsMirror(d as never)
    expect(d.configStore.set).toHaveBeenCalledTimes(1)
    expect(d.configStore.set).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({ autoUpdateGames: false })
    )
  })

  it('skips the write when already identical', () => {
    const d = make({ autoUpdateGames: false }, { autoUpdateGames: false })
    resyncSettingsMirror(d as never)
    expect(d.configStore.set).not.toHaveBeenCalled()
  })

  it('never throws and logs once on failures', () => {
    const a = make({}, {})
    a.config.getSettings.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() => resyncSettingsMirror(a as never)).not.toThrow()
    expect(a.logError).toHaveBeenCalledTimes(1)

    const b = make({}, { k: 1 })
    b.configStore.set.mockImplementation(() => {
      throw new Error('disk')
    })
    expect(() => resyncSettingsMirror(b as never)).not.toThrow()
    expect(b.logError).toHaveBeenCalledTimes(1)

    const c = make({}, {})
    c.configStore.get_nodefault.mockImplementation(() => {
      throw new Error('read')
    })
    expect(() => resyncSettingsMirror(c as never)).not.toThrow()
    expect(c.logError).toHaveBeenCalledTimes(1)
  })

  it('is synchronous', () => {
    const d = make({}, { a: 1 })
    expect(resyncSettingsMirror(d as never)).toBeUndefined()
  })
})
