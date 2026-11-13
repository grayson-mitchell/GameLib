import { isDeepStrictEqual } from 'util'
import { join } from 'path'
import * as logger from 'backend/logger'
import { parseValveClientManifestFile } from '../../bridge/drm/valveClient'
import { readInstallScript } from '../../bridge/sharedRedists'
import { listFiles, normalizeForGolden } from './oracle/normalize'
import {
  expectedFor,
  replayDeps,
  withFixtureCopy
} from './fixtures/replayParity'

/**
 * P75-E: the real bridge wrappers (`parseValveClientManifestFile`, `readInstallScript`) fed the
 * RECORDED Rust results equal the captured oracle, or the case has an overrides/bridge.json entry
 * with a divergenceNote. Each case replays against the temp copy of the fixtures, the same path
 * the recording named.
 *
 * Not replayed: the synthesised `oversize` and `not-text` manifest cases. They are inputs the TS
 * oracle built in memory (a 512 KiB+ string, `undefined`); the file-based wrapper cannot express
 * them, and the cargo golden tests cover the Rust size cap and the shape guards.
 */
const replayed: string[] = []
const mismatches: { caseKey: string; actual: unknown; expected: unknown }[] = []

async function check(
  caseKey: string,
  root: string,
  run: () => Promise<unknown>
): Promise<void> {
  const actual = normalizeForGolden(await run(), root)
  const expected = expectedFor('bridge', caseKey)
  if (!isDeepStrictEqual(actual, expected)) {
    mismatches.push({ caseKey, actual, expected })
  }
  replayed.push(caseKey)
}

describe('bridge replay parity (TS wrappers over recorded Rust results)', () => {
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

  it('replays every valve manifest and installscript case', async () => {
    await withFixtureCopy('', async (root) => {
      const rust = replayDeps(root)
      for (const file of listFiles(join(root, 'valve'))) {
        const name = file.slice(0, -'.vdf'.length)
        await check(`parseValveClientManifest/${name}`, root, () =>
          parseValveClientManifestFile(rust, join(root, 'valve', file))
        )
      }
      for (const file of listFiles(join(root, 'installscript'))) {
        const name = file.slice(0, -'.vdf'.length)
        await check(`parseInstallScript/${name}`, root, () =>
          readInstallScript(rust, join(root, 'installscript', file))
        )
      }
    })
    // Every mismatch is listed at once so an override review sees them all.
    expect(mismatches).toEqual([])
    // Anti-vacuity: the area is replayed, not skipped.
    expect(replayed.length).toBeGreaterThanOrEqual(12)
  })
})
