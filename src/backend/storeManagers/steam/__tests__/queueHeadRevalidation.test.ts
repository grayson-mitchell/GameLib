import { createTestStoreRoot } from '../../../testUtils/testStoreRoot'
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSteamLibraries } from 'backend/utils'
import { clearSteamResumeBreadcrumb } from '../library/resumeBreadcrumbs'
import { steamQueueHeadAlreadyInstalled } from '../queueHeadRevalidation'
import type { GameInfo } from 'common/types'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createSteamStores } from '../stores'

const steamStoresModule = createSteamStores({
  registry: createStoreRegistry(),
  root: createTestStoreRoot()
})

const steamTestDeps = createTestManagerDeps({
  stores: createTestStores({ steam: steamStoresModule })
})

// The boot-owned Steam library state the code under test reads (D-66.3-13): one instance per file.
const library = steamTestDeps.steamSession.libraryState.library

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({ getSteamLibraries: jest.fn() }))
jest.mock('../library/resumeBreadcrumbs', () => ({
  clearSteamResumeBreadcrumb: jest.fn()
}))

describe('steamQueueHeadAlreadyInstalled', () => {
  let tmp: string
  let steamapps: string

  function acf(flags: string, buildid = '25485521') {
    mkdirSync(steamapps, { recursive: true })
    writeFileSync(
      join(steamapps, 'appmanifest_108600.acf'),
      `"AppState"\n{\n\t"appid"\t"108600"\n\t"StateFlags"\t"${flags}"\n\t"buildid"\t"${buildid}"\n}\n`
    )
  }
  function seedBreadcrumb() {
    library.set('108600', {
      app_name: '108600',
      install: { steamResumeTargetSteamappsDir: steamapps }
    } as unknown as GameInfo)
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'queueHead-'))
    steamapps = join(tmp, 'lib', 'steamapps')
    library.clear()
    jest.mocked(getSteamLibraries).mockResolvedValue([join(tmp, 'lib')])
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('true for a current full install at the breadcrumb target, and clears the breadcrumb', async () => {
    acf('4')
    seedBreadcrumb()
    expect(
      await steamQueueHeadAlreadyInstalled(steamTestDeps, '108600', {})
    ).toBe(true)
    expect(clearSteamResumeBreadcrumb).toHaveBeenCalledWith(
      steamTestDeps,
      '108600'
    )
  })

  it.each([
    ['1026', '1026'],
    ['update required (6)', '6']
  ])('false for %s', async (_n, flags) => {
    acf(flags)
    seedBreadcrumb()
    expect(
      await steamQueueHeadAlreadyInstalled(steamTestDeps, '108600', {})
    ).toBe(false)
    expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
  })

  it('false for a missing ACF, a non-numeric appId and no determinable target', async () => {
    seedBreadcrumb()
    expect(
      await steamQueueHeadAlreadyInstalled(steamTestDeps, '108600', {})
    ).toBe(false)
    expect(
      await steamQueueHeadAlreadyInstalled(steamTestDeps, '../1', {})
    ).toBe(false)
    library.clear()
    expect(
      await steamQueueHeadAlreadyInstalled(steamTestDeps, '108600', {})
    ).toBe(false)
  })

  it('without a breadcrumb falls back to params.path/steamapps only for a registered library', async () => {
    acf('4')
    expect(
      await steamQueueHeadAlreadyInstalled(steamTestDeps, '108600', {
        path: join(tmp, 'lib')
      })
    ).toBe(true)
    expect(
      await steamQueueHeadAlreadyInstalled(steamTestDeps, '108600', {
        path: join(tmp, 'other')
      })
    ).toBe(false)
  })

  it('never throws', async () => {
    jest.mocked(getSteamLibraries).mockRejectedValue(new Error('boom'))
    await expect(
      steamQueueHeadAlreadyInstalled(steamTestDeps, '108600', { path: '/x' })
    ).resolves.toBe(false)
  })
})
