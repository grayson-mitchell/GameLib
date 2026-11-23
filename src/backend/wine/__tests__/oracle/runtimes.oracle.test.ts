/**
 * The runtimes oracle (87-05, D-08): the lutris runtimes list, `isInstalled`, and `download` with its
 * `current_version` write, driven on a fake HOME and recorded as goldens the Rust `gamelib-wine`
 * runtimes slice later has to reproduce. The wine-manager half of the `wine/` goldens follows in 87-07.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts and recorder.ts):
 *   GAMELIB_ENGINE_ORACLE=record     fetch the lutris list live and write recorded/runtimes/<case>/
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    replay the recordings and rewrite golden/runtimes/expected/
 *   (default)                        replay and compare, offline
 *
 * The archive bodies are never downloaded: the archive URL is served a synthetic body built from the
 * in-repo test archive (T-87-11), and record mode refuses any live request except the list.
 *
 * The goldens are recorded on a POSIX host (file modes, `tar`); the Rust replay covers Windows.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  loadCases,
  mockPlatform,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type OraclePlatform,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import {
  installAdapter,
  installRecorder,
  type SyntheticResponse
} from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import { createRealRunner } from 'backend/testUtils/realRunner'
import type { RuntimeName } from 'common/types'

const CRATE = 'gamelib-wine'
const SLICE = 'runtimes'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 9

interface RuntimesCase {
  id: string
  op: 'download' | 'isInstalled'
  name: string
  platform: OraclePlatform
  seed?: SeedEntry[]
  archive?: 'ok' | 'http-404'
}

const ARCHIVE = join(
  __dirname,
  '..',
  '..',
  'runtimes',
  '__tests__',
  'runtimes',
  'test_data',
  'ArchiveWithSubfolder.tar.xz'
)

const LIST_URL = /^https:\/\/lutris\.net\/api\/runtimes$/

/** Matches the archive of the runtime a case downloads, whatever the live list's release tag is. */
const ARCHIVE_PATH = /\/eac_runtime[^/]*\.tar\.xz$/

function archiveResponse(c: RuntimesCase): SyntheticResponse[] {
  if (c.archive === 'ok') {
    return [
      {
        method: 'GET',
        path: ARCHIVE_PATH,
        status: 200,
        headers: { 'content-type': 'application/x-xz' },
        body: '',
        bodyBase64: readFileSync(ARCHIVE).toString('base64')
      }
    ]
  }
  if (c.archive === 'http-404') {
    return [
      { method: 'GET', path: ARCHIVE_PATH, status: 404, body: 'Not Found' }
    ]
  }
  return []
}

type RuntimesModule = typeof import('backend/wine/runtimes/runtimes')
let runtimes: RuntimesModule

describeSkipOnWindows('runtimes oracle (87-05)', () => {
  const cases = loadCases<RuntimesCase>(CRATE, SLICE)

  beforeAll(async () => {
    // The recorder's dispatcher must be the default adapter before `backend/utils` builds its axios
    // client, so the slice module is imported after it.
    installAdapter()
    runtimes = await import('backend/wine/runtimes/runtimes')
  })

  it.each(cases)('$id', async (c) => {
    const restorePlatform = mockPlatform(c.platform)
    const recorder = installRecorder({
      crate: CRATE,
      slice: SLICE,
      caseId: c.id,
      synthetic: archiveResponse(c),
      allowLive: (url) => LIST_URL.test(url)
    })
    try {
      await withEngineOracleProfile(
        async (profile) => {
          const real = createRealRunner()
          const tracer = createSpawnTracer({
            baseEnv: profile.fake.childEnv(),
            delegate: real.runner
          })
          try {
            const value =
              c.op === 'download'
                ? await runtimes.download(
                    { runner: tracer.runner, paths: profile.paths },
                    c.name as RuntimeName
                  )
                : await runtimes.isInstalled(
                    { paths: profile.paths },
                    c.name as RuntimeName
                  )
            await recorder.finish()
            writeOrCompareGolden(CRATE, SLICE, c.id, {
              result: { op: c.op, name: c.name, result: value },
              events: [],
              after: snapshotTree(profile.home),
              spawns: normalisePaths(tracer.records, profile),
              requests: recorder.requested
            })
          } finally {
            real.dispose()
          }
        },
        { seed: c.seed }
      )
    } finally {
      restorePlatform()
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, FLOOR)
    assertManifest(CRATE, SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FLOOR)
  })
})
