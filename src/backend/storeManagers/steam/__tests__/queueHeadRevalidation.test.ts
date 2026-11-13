import { createTestStoreRoot } from '../../../testUtils/testStoreRoot'
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSteamLibraries } from 'backend/utils'
import { clearSteamResumeBreadcrumb } from '../library/resumeBreadcrumbs'
import { steamQueueHeadAlreadyInstalled } from '../queueHeadRevalidation'
import type { GameInfo } from 'common/types'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
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
  logDebug: jest.fn(),
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

  // The manifest is read through Rust (steamfiles_read_acf), so no file is written to disk.
  const depsWith = (
    stateFlags: number | null,
    buildid: string | null,
    exists = true
  ) => {
    const stub = stubRustSteamFiles({
      steamfiles_read_acf: () => ({
        exists,
        parsed: exists,
        readError: null,
        record: (exists ? { stateFlags, buildid } : null) as never
      })
    })
    return { ...steamTestDeps, requestRustInvoke: stub.requestRustInvoke }
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
    seedBreadcrumb()
    expect(
      await steamQueueHeadAlreadyInstalled(
        depsWith(4, '25485521'),
        '108600',
        {}
      )
    ).toBe(true)
    expect(clearSteamResumeBreadcrumb).toHaveBeenCalledWith(
      expect.anything(),
      '108600'
    )
  })

  it.each([
    ['1026', 1026],
    ['update required (6)', 6],
    ['a null stateFlags', null]
  ])('false for %s', async (_n, flags) => {
    seedBreadcrumb()
    expect(
      await steamQueueHeadAlreadyInstalled(depsWith(flags, '1'), '108600', {})
    ).toBe(false)
    expect(clearSteamResumeBreadcrumb).not.toHaveBeenCalled()
  })

  it('false for a missing ACF, a non-numeric appId and no determinable target', async () => {
    seedBreadcrumb()
    expect(
      await steamQueueHeadAlreadyInstalled(
        depsWith(null, null, false),
        '108600',
        {}
      )
    ).toBe(false)
    expect(
      await steamQueueHeadAlreadyInstalled(depsWith(4, '1'), '../1', {})
    ).toBe(false)
    library.clear()
    expect(
      await steamQueueHeadAlreadyInstalled(depsWith(4, '1'), '108600', {})
    ).toBe(false)
  })

  it('without a breadcrumb falls back to params.path/steamapps only for a registered library', async () => {
    expect(
      await steamQueueHeadAlreadyInstalled(depsWith(4, '25485521'), '108600', {
        path: join(tmp, 'lib')
      })
    ).toBe(true)
    expect(
      await steamQueueHeadAlreadyInstalled(depsWith(4, '25485521'), '108600', {
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
