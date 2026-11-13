import { isDeepStrictEqual } from 'util'
import { join } from 'path'
import * as logger from 'backend/logger'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { readAcfInstalledDepots } from '../../acfInstalledDepots'
import { readAcfUpdateFieldsFromDir } from '../../library/acfUpdateState'
import { readAcfBetaKey, readLocalConfigBetaKey } from '../../depot/betaBranch'
import { listFiles, normalizeForGolden } from './fixtures/fixtureCopy'
import {
  expectedFor,
  replayDeps,
  withFixtureCopy
} from './fixtures/replayParity'

/**
 * P75-E: the real update/beta wrappers, fed the RECORDED Rust results, equal the captured oracle
 * for the acfUpdate area (or the case has an overrides/acfUpdate.json entry with a divergenceNote).
 * The oracle copied each acf/<name>.acf to _acfupdate/<name>/appmanifest_77.acf; the recorded
 * invocations name the fixture file directly, so the leaf rewrites that one path.
 */
const SCRATCH_ACF = /[\\/]_acfupdate[\\/]([^\\/]+)[\\/]appmanifest_77\.acf$/

function replayFor(root: string) {
  const inner = replayDeps(root)
  const requestRustInvoke = (channel: string, argv: readonly unknown[]) => {
    if (channel !== RUST_STEAMFILES_READ_ACF) {
      return inner.requestRustInvoke(channel, argv)
    }
    const { path } = argv[0] as { path: string }
    const name = SCRATCH_ACF.exec(path)?.[1]
    // A directory with no manifest was never recorded; it must resolve to "nothing found".
    const fixture = join(root, 'acf', `${name ?? '_nowhere'}.acf`)
    return inner.requestRustInvoke(channel, [{ path: fixture }])
  }
  return { requestRustInvoke }
}

describe('acfUpdate replay parity (TS wrappers over recorded Rust results)', () => {
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

  it('replays every acfUpdate case', async () => {
    const replayed: string[] = []
    const mismatches: unknown[] = []
    await withFixtureCopy('', async (root) => {
      const rust = replayFor(root)
      const check = async (caseKey: string, run: () => Promise<unknown>) => {
        const actual = normalizeForGolden(await run(), root)
        const expected = expectedFor('acfUpdate', caseKey)
        if (!isDeepStrictEqual(actual, expected)) {
          mismatches.push({ caseKey, actual, expected })
        }
        replayed.push(caseKey)
      }
      for (const file of listFiles(join(root, 'acf'))) {
        const name = file.slice(0, -'.acf'.length)
        const dir = join(root, '_acfupdate', name)
        await check(`readAcfBetaKey/${name}`, () =>
          readAcfBetaKey(rust, dir, '77')
        )
        await check(`readAcfInstalledDepots/${name}`, () =>
          readAcfInstalledDepots(rust, dir, '77')
        )
        await check(`readAcfUpdateFieldsFromDir/${name}`, () =>
          readAcfUpdateFieldsFromDir(rust, dir, '77')
        )
      }
      await check('readAcfInstalledDepots/bad-appid', () =>
        readAcfInstalledDepots(rust, root, '../x')
      )
      await check('readAcfUpdateFieldsFromDir/missing', () =>
        readAcfUpdateFieldsFromDir(rust, join(root, '_acfupdate'), '77')
      )
      for (const file of listFiles(join(root, 'localconfig'))) {
        const name = file.slice(0, -'.vdf'.length)
        for (const appId of ['10', '20', '99', 'abc']) {
          await check(`readLocalConfigBetaKey/${name}/${appId}`, () =>
            readLocalConfigBetaKey(rust, join(root, 'localconfig', file), appId)
          )
        }
      }
      await check('readLocalConfigBetaKey/missing-file', () =>
        readLocalConfigBetaKey(
          rust,
          join(root, 'localconfig', 'nope.vdf'),
          '10'
        )
      )
    })
    expect(mismatches).toEqual([])
    expect(replayed.length).toBeGreaterThanOrEqual(15)
  })
})
