/**
 * `removeWineVersion` must never recursively delete a directory the renderer chose. The
 * `removeWineVersion` IPC channel hands this function a whole `WineVersionInfo` from the
 * renderer payload, so `release.installDir` is untrusted; the only directory it may remove is
 * the `installDir` this backend itself stored for that `version` when it installed it.
 */
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { WineVersionInfo } from 'common/types'

jest.mock('backend/logger')
jest.mock('../../../ipc', () => ({
  ...jest.requireActual('../../../ipc'),
  sendFrontendMessage: jest.fn()
}))
jest.mock('../downloader/main', () => ({
  getAvailableVersions: jest.fn(),
  installVersion: jest.fn()
}))
jest.mock('../electronStores', () => {
  // Plain functions, not `jest.fn()`: the backend project sets `resetMocks: true`, which would
  // strip a `jest.fn()` implementation before each test.
  let releases: unknown[] = []
  return {
    wineDownloaderInfoStore: {
      has: () => true,
      get: () => releases,
      set: (_key: string, value: unknown[]) => {
        releases = value
      }
    }
  }
})

import { removeWineVersion } from '../utils'
import { wineDownloaderInfoStore } from '../electronStores'

function release(over: Partial<WineVersionInfo>): WineVersionInfo {
  return {
    version: 'Wine-GE-Proton8-26',
    type: 'Wine-GE',
    date: '',
    download: '',
    downsize: 0,
    disksize: 0,
    checksum: '',
    isInstalled: true,
    hasUpdate: false,
    installDir: '',
    ...over
  } as WineVersionInfo
}

describe('removeWineVersion — deletes only the stored installDir, never a renderer-supplied one', () => {
  let root: string
  let storedDir: string
  let victimDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gamelib-rmwine-'))
    storedDir = join(root, 'tools', 'wine', 'Wine-GE-Proton8-26')
    victimDir = join(root, 'precious-user-data')
    mkdirSync(storedDir, { recursive: true })
    mkdirSync(victimDir, { recursive: true })
    wineDownloaderInfoStore.set('wine-releases', [
      release({ installDir: storedDir })
    ])
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('ignores a tampered installDir and removes the stored one', async () => {
    await removeWineVersion(release({ installDir: victimDir }))

    expect(existsSync(victimDir)).toBe(true)
    expect(existsSync(storedDir)).toBe(false)
  })

  it('removes nothing when the version is not in the store', async () => {
    const result = await removeWineVersion(
      release({ version: 'not-installed', installDir: victimDir })
    )

    expect(result).toBe(false)
    expect(existsSync(victimDir)).toBe(true)
    expect(existsSync(storedDir)).toBe(true)
  })

  it('still removes and unmarks a legitimately installed version', async () => {
    const result = await removeWineVersion(release({ installDir: storedDir }))

    expect(result).toBe(true)
    expect(existsSync(storedDir)).toBe(false)
    const [stored] = wineDownloaderInfoStore.get('wine-releases', [])
    expect(stored.isInstalled).toBe(false)
    expect(stored.installDir).toBe('')
  })
})
