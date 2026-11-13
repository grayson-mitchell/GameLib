import { isDeepStrictEqual } from 'util'
import { join } from 'path'
import * as logger from 'backend/logger'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { readAcfInstalldir } from '../../acfInstalldir'
import { listFiles, normalizeForGolden } from './oracle/normalize'
import {
  expectedFor,
  replayDeps,
  withFixtureCopy
} from './fixtures/replayParity'

/**
 * P75-E: the real readAcfInstalldir wrapper, fed the RECORDED Rust results, equals the captured
 * oracle for the installdir area (or the case has an overrides/installdir.json entry with a
 * divergenceNote). The oracle copied each acf/<name>.acf to _installdir/<name>/appmanifest_77.acf;
 * the recorded invocations name the fixture file directly, so the leaf below rewrites that one
 * path and replays everything else untouched.
 */
const SCRATCH_ACF = /[\\/]_installdir[\\/]([^\\/]+)[\\/]appmanifest_77\.acf$/

function replayFor(root: string) {
  const inner = replayDeps(root)
  const requestRustInvoke = (channel: string, argv: readonly unknown[]) => {
    if (channel !== RUST_STEAMFILES_READ_ACF) {
      return inner.requestRustInvoke(channel, argv)
    }
    const { path } = argv[0] as { path: string }
    const name = SCRATCH_ACF.exec(path)?.[1]
    // A directory with no manifest was never recorded; it must resolve to undefined.
    const fixture = join(root, 'acf', `${name ?? '_nowhere'}.acf`)
    return inner.requestRustInvoke(channel, [{ path: fixture }])
  }
  return { requestRustInvoke }
}

describe('installdir replay parity (TS wrapper over recorded Rust results)', () => {
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

  it('replays every installdir case', async () => {
    const replayed: string[] = []
    const mismatches: unknown[] = []
    await withFixtureCopy('', async (root) => {
      const rust = replayFor(root)
      const cases: [string, string][] = listFiles(join(root, 'acf')).map(
        (file) => {
          const name = file.slice(0, -'.acf'.length)
          return [`readAcfInstalldir/${name}`, join(root, '_installdir', name)]
        }
      )
      cases.push([
        'readAcfInstalldir/missing',
        join(root, '_installdir', '_empty')
      ])
      for (const [caseKey, dir] of cases) {
        const actual = normalizeForGolden(
          await readAcfInstalldir(rust, dir, '77'),
          root
        )
        const expected = expectedFor('installdir', caseKey)
        // The oracle hangs on a truncated manifest; Rust returns instead (recorded override).
        if (!isDeepStrictEqual(actual, expected)) {
          mismatches.push({ caseKey, actual, expected })
        }
        replayed.push(caseKey)
      }
    })
    expect(mismatches).toEqual([])
    expect(replayed.length).toBeGreaterThanOrEqual(15)
  })
})
