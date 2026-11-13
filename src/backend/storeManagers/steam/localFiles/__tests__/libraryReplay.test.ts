import { isDeepStrictEqual } from 'util'
import { join } from 'path'
import * as logger from 'backend/logger'
import { getSteamLibraries } from 'backend/utils'
import { RUST_STEAMFILES_READ_LIBRARY_FOLDERS } from 'common/types/sidecarTransport'
import {
  buildIncompleteInstallSet,
  buildInstalledMap
} from '../../library/installedMap'
import {
  findOtherManifestsWithInstalldir,
  readAcfState,
  scanDownloadingAppIds
} from '../../library/acfState'
import { breadcrumbAppIsFullyInstalledOnDisk } from '../../library/resumeBreadcrumbs'
import { listFiles, normalizeForGolden } from './oracle/normalize'
import { SYSTEM_STEAM, depsFor, steamRootWith } from './oracle/libraryOracle'
import {
  expectedFor,
  replayDeps,
  withFixtureCopy
} from './fixtures/replayParity'

/**
 * P75-E: the real TS wrappers, fed the RECORDED Rust results, equal the captured oracle for the
 * library area (or the case has an overrides/library.json entry with a divergenceNote).
 *
 * The oracle read a temp Steam root's steamapps/libraryfolders.vdf, while the recorded
 * invocations name the fixture file directly, so the transport leaf below rewrites that one
 * path; every other argument is replayed untouched.
 */
const SCRATCH_VDF =
  /[\\/]_steam[\\/]([^\\/]+)[\\/]steamapps[\\/]libraryfolders\.vdf$/

function replayFor(root: string) {
  const inner = replayDeps(root)
  const requestRustInvoke = (channel: string, argv: readonly unknown[]) => {
    if (channel !== RUST_STEAMFILES_READ_LIBRARY_FOLDERS) {
      return inner.requestRustInvoke(channel, argv)
    }
    const { path } = argv[0] as { path: string }
    const scratch = SCRATCH_VDF.exec(path)?.[1]
    // The oracle's scan root `scan` is built from modern.vdf.
    const name = scratch === 'scan' ? 'modern' : scratch
    const fixture = name ? join(root, 'libraryfolders', `${name}.vdf`) : null
    return inner.requestRustInvoke(channel, [
      { path: fixture ?? join(root, 'libraryfolders', 'none.vdf') }
    ])
  }
  return { requestRustInvoke }
}

function rustDeps(steam: string, root: string) {
  return {
    ...(depsFor(steam) as object),
    ...replayFor(root)
  } as never
}

const stripSystem = (libs: string[]) => libs.filter((l) => l !== SYSTEM_STEAM)

const replayed: string[] = []
const mismatches: { caseKey: string; actual: unknown; expected: unknown }[] = []

async function check(
  caseKey: string,
  root: string,
  run: () => Promise<unknown>
): Promise<void> {
  const actual = normalizeForGolden(await run(), root)
  const expected = expectedFor('library', caseKey)
  if (!isDeepStrictEqual(actual, expected)) {
    mismatches.push({ caseKey, actual, expected })
  }
  replayed.push(caseKey)
}

describe('library replay parity (TS wrappers over recorded Rust results)', () => {
  const realEnv = process.env.GAMELIB_STEAMFILES_TEXT

  beforeAll(() => {
    process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
  })
  beforeEach(() => {
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())
  afterAll(() => {
    if (realEnv === undefined) delete process.env.GAMELIB_STEAMFILES_TEXT
    else process.env.GAMELIB_STEAMFILES_TEXT = realEnv
  })

  it('replays every library case', async () => {
    await withFixtureCopy('', async (root) => {
      for (const file of listFiles(join(root, 'libraryfolders'))) {
        const name = file.slice(0, -'.vdf'.length)
        const steam = steamRootWith(root, name, name)
        await check(`getSteamLibraries/${name}`, root, async () =>
          stripSystem(await getSteamLibraries(rustDeps(steam, root)))
        )
      }
      await check('getSteamLibraries/no-file', root, async () =>
        stripSystem(
          await getSteamLibraries(rustDeps(join(root, '_nowhere'), root))
        )
      )

      const steam = steamRootWith(root, 'modern', 'scan')
      const deps = rustDeps(steam, root)
      const hangs = 'with-truncated-manifest'
      for (const suffix of ['scan', hangs]) {
        await check(`buildInstalledMap/${suffix}`, root, () =>
          buildInstalledMap(deps)
        )
        await check(`buildIncompleteInstallSet/${suffix}`, root, () =>
          buildIncompleteInstallSet(deps)
        )
      }
      for (const appId of ['10', '20', '40', '99']) {
        await check(`readAcfState/${appId}`, root, () =>
          readAcfState(deps as never, appId)
        )
      }
      await check(`readAcfState/30/${hangs}`, root, () =>
        readAcfState(deps as never, '30')
      )

      const stateDeps = {
        ...(deps as object),
        steamSession: {
          libraryState: {
            library: new Map([
              ['10', {}],
              ['20', {}],
              ['40', {}]
            ])
          }
        }
      } as never
      for (const suffix of ['scan', hangs]) {
        await check(`scanDownloadingAppIds/${suffix}`, root, async () =>
          (await scanDownloadingAppIds(stateDeps)).sort()
        )
      }

      const lib1 = join(root, 'scan', 'lib1', 'steamapps')
      const lib2 = join(root, 'scan', 'lib2', 'steamapps')
      const others: [string, string, string, string][] = [
        ['lib1-self-installdir', lib1, 'ScanInstalled', '10'],
        ['lib1-nonnumeric-shares', lib1, 'NonNumeric', '10'],
        ['lib2-duplicate-dir', lib2, 'DuplicateDir', '40'],
        ['lib1-no-match', lib1, 'Nothing', '10']
      ]
      for (const [label, dir, installdir, self] of others) {
        await check(
          `findOtherManifestsWithInstalldir/${label}`,
          root,
          async () =>
            (
              await findOtherManifestsWithInstalldir(
                deps,
                dir,
                installdir,
                self
              )
            ).sort()
        )
      }
      // The oracle hangs on the truncated manifest; Rust skips it (override).
      await check(
        'findOtherManifestsWithInstalldir/with-truncated-manifest',
        root,
        async () =>
          (
            await findOtherManifestsWithInstalldir(
              deps,
              lib1,
              'NonNumeric',
              '10'
            )
          ).sort()
      )

      for (const appId of ['10', '20']) {
        await check(`breadcrumbAppIsFullyInstalledOnDisk/${appId}`, root, () =>
          breadcrumbAppIsFullyInstalledOnDisk(deps, appId, {
            steamResumeTargetSteamappsDir: lib1
          })
        )
      }
      await check('breadcrumbAppIsFullyInstalledOnDisk/no-dir', root, () =>
        breadcrumbAppIsFullyInstalledOnDisk(deps, '10', {})
      )
      await check('breadcrumbAppIsFullyInstalledOnDisk/no-manifest', root, () =>
        breadcrumbAppIsFullyInstalledOnDisk(deps, '99', {
          steamResumeTargetSteamappsDir: lib1
        })
      )
    })
    // Every mismatch is listed at once so an override review sees them all.
    expect(mismatches).toEqual([])
    // Anti-vacuity: the area is replayed, not skipped.
    expect(replayed.length).toBeGreaterThanOrEqual(24)
  })
})
