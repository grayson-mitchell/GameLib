import { isDeepStrictEqual } from 'util'
import { join } from 'path'
import * as logger from 'backend/logger'
import {
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_RUNNING_APP_ID
} from 'common/types/sidecarTransport'
import { readAppManifestFlags } from '../../library/manifestFlags'
import { readMacRunningAppId } from '../../library/runningPoll'
import { isSteamAdoptedAcf, readAcfSnapshot } from '../../macSteamAdoption'
import { listFiles, normalizeForGolden } from './oracle/normalize'
import {
  expectedFor,
  replayDeps,
  withFixtureCopy
} from './fixtures/replayParity'

/**
 * P75-E: the real adoption wrappers, fed the RECORDED Rust results, equal the captured oracle for
 * the adoption area (or the case has an overrides/adoption.json entry with a divergenceNote).
 *
 * The oracle read copies under `_adoption/<name>/appmanifest_77.acf` and
 * `_home/<name>/Library/Application Support/Steam/registry.vdf`; the recorded invocations name the
 * fixture files directly, so the leaf rewrites those two path shapes and nothing else.
 */
const SCRATCH_ACF = /[\\/]_adoption[\\/]([^\\/]+)[\\/]appmanifest_77\.acf$/
const SCRATCH_REGISTRY =
  /[\\/]_home[\\/]([^\\/]+)[\\/]Library[\\/].*registry\.vdf$/

function replayFor(root: string) {
  const inner = replayDeps(root)
  const requestRustInvoke = (channel: string, argv: readonly unknown[]) => {
    const { path } = (argv[0] ?? {}) as { path?: string }
    if (channel === RUST_STEAMFILES_READ_ACF && path !== undefined) {
      const name = SCRATCH_ACF.exec(path)?.[1]
      if (name !== undefined) {
        const fixture = join(root, 'acf', `${name}.acf`)
        return inner.requestRustInvoke(channel, [{ path: fixture }])
      }
      // `_adoption/appmanifest_77.acf` (no per-case dir) is the oracle's "missing" case.
      if (/[\\/]_adoption[\\/]appmanifest_77\.acf$/.test(path)) {
        const fixture = join(root, 'acf', 'missing.acf')
        return inner.requestRustInvoke(channel, [{ path: fixture }])
      }
    }
    if (channel === RUST_STEAMFILES_READ_RUNNING_APP_ID && path !== undefined) {
      const name = SCRATCH_REGISTRY.exec(path)?.[1]
      const fixture = join(
        root,
        'registry',
        `${name === undefined || name === 'none' ? 'none' : name}.vdf`
      )
      return inner.requestRustInvoke(channel, [{ path: fixture }])
    }
    return inner.requestRustInvoke(channel, argv)
  }
  return { requestRustInvoke }
}

describe('adoption replay parity (TS wrappers over recorded Rust results)', () => {
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

  it('replays every adoption case', async () => {
    const replayed: string[] = []
    const mismatches: unknown[] = []
    await withFixtureCopy('', async (root) => {
      const rust = replayFor(root)
      const check = async (caseKey: string, run: () => Promise<unknown>) => {
        const actual = normalizeForGolden(await run(), root)
        const expected = expectedFor('adoption', caseKey)
        if (!isDeepStrictEqual(actual, expected)) {
          mismatches.push({ caseKey, actual, expected })
        }
        replayed.push(caseKey)
      }
      // The snapshot of a fixture ACF as Rust parsed it, with the oracle's mtime.
      const snapshot = async (name: string, mtimeMs: number) => ({
        ...(await readAcfSnapshot(rust, join(root, 'acf', `${name}.acf`)))!,
        mtimeMs
      })

      for (const file of listFiles(join(root, 'acf'))) {
        const name = file.slice(0, -'.acf'.length)
        await check(`readAppManifestFlags/${name}`, () =>
          readAppManifestFlags(rust, join(root, '_adoption', name), '77')
        )
        await check(`isSteamAdoptedAcf/null-baseline/${name}`, async () =>
          isSteamAdoptedAcf(null, await snapshot(name, 1))
        )
      }
      await check('readAppManifestFlags/missing', () =>
        readAppManifestFlags(rust, join(root, '_adoption'), '77')
      )
      await check('isSteamAdoptedAcf/null-current', async () =>
        isSteamAdoptedAcf(await snapshot('installed', 1), null)
      )
      await check('isSteamAdoptedAcf/same-content-same-mtime', async () =>
        isSteamAdoptedAcf(
          await snapshot('installed', 5),
          await snapshot('installed', 5)
        )
      )
      await check('isSteamAdoptedAcf/same-content-new-mtime', async () =>
        isSteamAdoptedAcf(
          await snapshot('installed', 5),
          await snapshot('installed', 6)
        )
      )
      await check('isSteamAdoptedAcf/differs-downloading', async () =>
        isSteamAdoptedAcf(
          await snapshot('installed', 5),
          await snapshot('downloading', 6)
        )
      )
      await check('isSteamAdoptedAcf/differs-installed', async () =>
        isSteamAdoptedAcf(
          await snapshot('downloading', 5),
          await snapshot('installed', 6)
        )
      )

      for (const file of listFiles(join(root, 'registry'))) {
        const name = file.slice(0, -'.vdf'.length)
        const home = join(root, '_home', name)
        await check(`readMacRunningAppId/${name}`, () =>
          readMacRunningAppId({ paths: { userHome: home }, ...rust } as never)
        )
      }
      await check('readMacRunningAppId/no-file', () =>
        readMacRunningAppId({
          paths: { userHome: join(root, '_home', 'none') },
          ...rust
        } as never)
      )
    })
    expect(mismatches).toEqual([])
    expect(replayed.length).toBeGreaterThanOrEqual(15)
  })
})
