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
  SYSTEM_STEAM,
  depsFor,
  listFiles,
  normalizeForGolden,
  steamRootWith
} from './fixtures/fixtureCopy'
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
  beforeEach(() => {
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())
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
    })
    // Every mismatch is listed at once so an override review sees them all.
    expect(mismatches).toEqual([])
    // Anti-vacuity: the area is replayed, not skipped. The readAcfState, scanDownloadingAppIds,
    // findOtherManifestsWithInstalldir and breadcrumb cases moved to the cargo steampoll acf tests
    // (their TS wrappers read through the Rust poll commands now).
    expect(replayed.length).toBeGreaterThanOrEqual(8)
  })
})
