/**
 * Phase 100 (D-03, D-21): cloudSync is pure apart from `window.api`, which each
 * test assigns, and the injected `syncSaves`. Mock-free.
 */
import type { SyncType } from 'common/types'
import type { GOGCloudSavesLocation } from 'common/types/gog'
import {
  cloudSavesPathMissing,
  cloudSavesValue,
  executeCloudSync,
  needsForceConfirm,
  SYNC_TYPES
} from '../cloudSync'

const api = {
  getDefaultSavePath: jest.fn(),
  syncGOGSaves: jest.fn(),
  logError: jest.fn()
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(globalThis as unknown as { window: { api: typeof api } }).window = {
    api
  }
})

const gogLocation = (location: string): GOGCloudSavesLocation => ({
  name: 'saves',
  location
})

describe('cloudSavesValue', () => {
  it('reads each state', () => {
    expect(cloudSavesValue({ supported: false })).toBe('unsupported')
    expect(cloudSavesValue({ supported: true, isSyncing: true })).toBe(
      'syncing'
    )
    expect(cloudSavesValue({ supported: true, autoSync: true })).toBe('auto')
    expect(cloudSavesValue({ supported: true, autoSync: false })).toBe('manual')
  })

  it('unsupported outranks syncing', () => {
    expect(cloudSavesValue({ supported: false, isSyncing: true })).toBe(
      'unsupported'
    )
  })
})

describe('needsForceConfirm', () => {
  it('confirms only the two overwriting commands (T-100-14)', () => {
    expect(needsForceConfirm('--force-download')).toBe(true)
    expect(needsForceConfirm('--force-upload')).toBe(true)
    expect(needsForceConfirm('--skip-upload')).toBe(false)
    expect(needsForceConfirm('--skip-download')).toBe(false)
  })

  it('lists exactly the four commands, two of them forced', () => {
    expect(SYNC_TYPES).toHaveLength(4)
    expect(SYNC_TYPES.filter(needsForceConfirm)).toHaveLength(2)
  })
})

describe('cloudSavesPathMissing', () => {
  it('legendary needs a saves path', () => {
    expect(
      cloudSavesPathMissing({
        runner: 'legendary',
        savesPath: '',
        gogSaves: []
      })
    ).toBe(true)
    expect(
      cloudSavesPathMissing({
        runner: 'legendary',
        savesPath: '/saves',
        gogSaves: []
      })
    ).toBe(false)
  })

  it('gog needs a location with a path', () => {
    expect(
      cloudSavesPathMissing({
        runner: 'gog',
        savesPath: '',
        gogSaves: [gogLocation('')]
      })
    ).toBe(true)
    expect(
      cloudSavesPathMissing({
        runner: 'gog',
        savesPath: '',
        gogSaves: [gogLocation('/saves')]
      })
    ).toBe(false)
  })
})

describe('executeCloudSync', () => {
  const syncType = '--skip-upload' as SyncType

  it('gog with no saved locations asks for the default, syncs and logs stderr', async () => {
    const defaults = [gogLocation('/default')]
    api.getDefaultSavePath.mockResolvedValue(defaults)
    api.syncGOGSaves.mockResolvedValue('some stderr')
    const syncSaves = jest.fn()

    await executeCloudSync({
      appName: 'g1',
      runner: 'gog',
      syncType,
      savesPath: '',
      gogSaves: [],
      syncSaves
    })

    expect(api.getDefaultSavePath).toHaveBeenCalledWith('g1', 'gog', [])
    expect(api.syncGOGSaves).toHaveBeenCalledWith(defaults, 'g1', syncType)
    expect(api.logError).toHaveBeenCalledWith('some stderr')
    expect(syncSaves).not.toHaveBeenCalled()
  })

  it('gog with saved locations skips the default lookup', async () => {
    const saved = [gogLocation('/mine')]
    api.syncGOGSaves.mockResolvedValue('')

    await executeCloudSync({
      appName: 'g1',
      runner: 'gog',
      syncType,
      savesPath: '',
      gogSaves: saved,
      syncSaves: jest.fn()
    })

    expect(api.getDefaultSavePath).not.toHaveBeenCalled()
    expect(api.syncGOGSaves).toHaveBeenCalledWith(saved, 'g1', syncType)
  })

  it('legendary with an empty savesPath asks for the default and syncs through the injected helper', async () => {
    api.getDefaultSavePath.mockResolvedValue('/default/saves')
    const syncSaves = jest.fn().mockResolvedValue('')

    await executeCloudSync({
      appName: 'e1',
      runner: 'legendary',
      syncType,
      savesPath: '',
      gogSaves: [],
      syncSaves
    })

    expect(api.getDefaultSavePath).toHaveBeenCalledWith('e1', 'legendary', [])
    expect(syncSaves).toHaveBeenCalledWith(
      '/default/saves',
      'e1',
      'legendary',
      syncType
    )
  })

  it('rejects when the sync rejects, so the row owns the failure', async () => {
    const syncSaves = jest.fn().mockRejectedValue(new Error('boom'))

    await expect(
      executeCloudSync({
        appName: 'e1',
        runner: 'legendary',
        syncType,
        savesPath: '/saves',
        gogSaves: [],
        syncSaves
      })
    ).rejects.toThrow('boom')
  })
})
