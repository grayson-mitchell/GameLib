/**
 * D-UAT-09 (21-17): unit tests proving a user-cancelled / interrupted native
 * Steam install can NEVER finalize a StateFlags=4 manifest — it always
 * writes the honest 1026 verify-repair handoff (D-04 preserved), while a
 * genuinely complete run still earns StateFlags=4 (no regression to Phase
 * 23's canWriteFullOwnership).
 *
 * REPRODUCTION FIRST (ground truth before/after Task 1.2's fix): the first
 * test below drives the FULL downloadSteamDepots orchestrator with a
 * download that would otherwise satisfy every canWriteFullOwnership input
 * (buildid present, zero failures, sha1-verified bytes, modes applied) but
 * whose AbortSignal becomes aborted mid-flight (inside the single file's own
 * chunk fetch — the earliest point a real user cancel could land while data
 * is already in transit). Observed result: StateFlags is written as "1026",
 * never "4" — the abort-aware `cancelled` computation this plan adds to
 * downloadSteamDepots's finalize() closure (and the pre-existing live
 * `opts.signal?.aborted` check inside downloadDepotFiles's own outcome
 * calculation) both converge on the same honest answer. This confirms the
 * invariant holds end-to-end through the real orchestrator, not just at the
 * canWriteFullOwnership unit level (already covered by depot.test.ts).
 *
 * Mock strategy mirrors depot.test.ts's "full orchestration" describe block
 * (setupPlanPlumbing helper, makeFakeClient) — only the CM/network seams
 * (SteamUser, selectAllDepots, decryptFilename, content_manifest.parse,
 * fetchChunk) are mocked; real fs (node:fs/promises via a real tmpdir) does
 * the actual file/manifest writes, since those exports are non-configurable
 * getters under this project's ts-jest/CJS interop (manifest.test.ts /
 * depot.test.ts precedent — jest.mock cannot reliably intercept them).
 */
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import {
  downloadSteamDepots,
  DIRECTORY_FLAG,
  EXECUTABLE_FLAG
} from '../depot'
import { SteamUser } from '../user'
import { selectAllDepots } from '../depot/select'
import { decryptFilename } from '../depot/crypto'
import { fetchChunk } from '../depot/decompress'
import { getBottleDir, getBottleSteamappsDir } from '../bottle'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import { buildAppManifestText } from '../depot/manifest'

// ── Logger mock (factory form — prevents transitive fs-extra native crash) ───
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  getRunnerLogWriter: jest.fn().mockReturnValue({}),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

// ── SteamUser mock — controls ensureConnected()/getClient() return values ────
jest.mock('../user')

// ── backend/utils mock — provides getFileSize() plus the bottle.ts imports
//    (checkWineBeforeLaunch/downloadFile/spawnAsync) needed for the D-08
//    describe block below, which imports getBottleDir/getBottleSteamappsDir
//    for real (unmocked) — none of these three are called by those two
//    functions, so no-op jest.fn()s are sufficient to satisfy the import. ──
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  // 23.2-02: was missing prior to this plan — depot.ts's own emitProgress
  // heartbeat (a setInterval) calls sendProgressUpdate every tick and, left
  // undefined, throws repeatedly for the rest of the run (never cleared
  // before the test's own timeout), a pre-existing latent bug in this
  // file's mock that eventually OOMs a full-suite run. depot.test.ts's own
  // backend/utils mock already includes this (established precedent).
  sendProgressUpdate: jest.fn(),
  checkWineBeforeLaunch: jest.fn(),
  downloadFile: jest.fn(),
  spawnAsync: jest.fn()
}))

// ── electron mock — bottle.ts's transitive import chain (backend/constants/
//    paths.ts) calls app.getPath() at module load. ──────────────────────────
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path'),
    getAppPath: () => '/tmp/mock-path',
    hide: jest.fn()
  }
}))

// ── ../electronStores mock — avoids real TypeCheckedStoreBackend/CacheStore
//    instantiation at module load (bottle.ts imports steamBottleConfigStore). ─
jest.mock('../electronStores', () => ({
  steamBottleConfigStore: { get: jest.fn(), get_nodefault: jest.fn(), set: jest.fn() }
}))

// ── backend/config mock — bottle.ts imports GlobalConfig; not called by
//    getBottleDir/getBottleSteamappsDir, but the import must resolve safely. ─
jest.mock('backend/config', () => ({
  GlobalConfig: { get: jest.fn() }
}))

// ── depot/select mock — selectAllDepots is a jest.fn(); dlcAppIds stays real ─
jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))

// ── depot/crypto mock — decryptFilename fully controlled by these tests ──────
jest.mock('../depot/crypto', () => ({
  decryptFilename: jest.fn()
}))

// ── steam-user's undocumented raw-manifest parser (Pitfall 5) ────────────────
jest.mock('steam-user/components/content_manifest.js', () => ({
  parse: jest.fn()
}))

// ── depot/decompress mock — fetchChunk is the only network-dependent piece ───
jest.mock('../depot/decompress', () => ({
  fetchChunk: jest.fn(),
  isDecodeStageError: () => false
}))

// ── backend/ipc mock — swallow progressUpdate emits ───────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── i18next mock ────────────────────────────────────────────────────────────
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

function makeFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    licenses: [] as Array<{ package_id: number }>,
    steamID: { getSteamID64: jest.fn().mockReturnValue('76561198012345678') },
    getProductInfo: jest.fn().mockResolvedValue({
      apps: {
        12345: {
          appinfo: {
            depots: { branches: { public: { buildid: '9044149' } } },
            extended: {}
          }
        }
      },
      packages: {},
      unknownApps: [],
      unknownPackages: []
    }),
    getDepotDecryptionKey: jest.fn(),
    getRawManifest: jest.fn(),
    getContentServers: jest
      .fn()
      .mockImplementation(
        (
          _appId: number,
          cb: (err: Error | null, servers: Array<{ Host?: string }>) => void
        ) => cb(null, [{ Host: 'cdn1.example.com' }])
      ),
    _send: jest.fn(),
    ...overrides
  }
}

function sha1Hex(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex')
}

/** Wires the PICS/manifest-fetch plumbing every test in this file shares —
 *  a single owned depot, single file (depot.test.ts's established pattern). */
function setupPlanPlumbing(fakeClient: ReturnType<typeof makeFakeClient>) {
  jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
  jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
  jest
    .mocked(selectAllDepots)
    .mockReturnValue([
      { id: '111', manifest: '11111111111111111', size: 0, ownerAppId: '12345' }
    ])
  jest
    .mocked(fakeClient.getDepotDecryptionKey)
    .mockImplementation(
      (
        _appId: number,
        depotId: number,
        cb: (err: Error | null, key: Buffer) => void
      ) => cb(null, Buffer.from(`key-${depotId}`))
    )
  jest
    .mocked(fakeClient.getRawManifest)
    .mockImplementation(
      (
        _appId: number,
        depotId: number,
        _gid: string,
        _branch: string,
        cb: (err: Error | null, raw: Buffer) => void
      ) => cb(null, Buffer.from(`raw-${depotId}`))
    )
  jest.mocked(decryptFilename).mockReturnValue('game.bin')
}

describe('D-UAT-09 (21-17): abort-aware finalize — cancel can never write StateFlags=4', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-21-17-finalize-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('REPRODUCTION: an aborted signal mid-flight (data already in transit, otherwise-complete download) still finalizes StateFlags=1026, never 4', async () => {
    const content = Buffer.from('game-bytes')
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)
    const controller = new AbortController()

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: String(content.length),
          sha_content: sha1Hex(content),
          chunks: [{ sha: 'chunk-sha', cb_original: content.length, offset: 0 }]
        }
      ]
    })
    // Simulates a user cancel landing WHILE this chunk's fetch is already
    // in flight — the data still arrives (network I/O already started), but
    // the signal is aborted by the time the promise resolves.
    jest.mocked(fetchChunk).mockImplementation(async () => {
      controller.abort()
      return content
    })

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows',
      signal: controller.signal
    })

    expect(result.status).toBe('cancelled')

    const acfText = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(acfText).toMatch(/"StateFlags"\s+"1026"/)
    expect(acfText).not.toMatch(/"StateFlags"\s+"4"/)
  })

  it('Test C: signal.aborted === true finalizes 1026 and returns cancelled even when the download-result inputs would otherwise satisfy canWriteFullOwnership', async () => {
    const content = Buffer.from('game-bytes')
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)
    const controller = new AbortController()

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: String(content.length),
          sha_content: sha1Hex(content),
          chunks: [{ sha: 'chunk-sha', cb_original: content.length, offset: 0 }]
        }
      ]
    })
    jest.mocked(fetchChunk).mockImplementation(async () => {
      controller.abort()
      return content
    })

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows',
      signal: controller.signal
    })

    expect(result.status).toBe('cancelled')
    const acfText = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(acfText).toMatch(/"StateFlags"\s+"1026"/)
  })

  it('Test D: no regression — a genuine complete run (no abort, all gate inputs satisfied) still earns StateFlags=4', async () => {
    const content = Buffer.from('game-bytes')
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: String(content.length),
          sha_content: sha1Hex(content),
          chunks: [{ sha: 'chunk-sha', cb_original: content.length, offset: 0 }]
        }
      ]
    })
    jest.mocked(fetchChunk).mockResolvedValue(content)

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
      // No signal at all — mirrors a caller that never wires an
      // AbortController (never aborted).
    })

    expect(result.status).toBe('done')
    const acfText = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(acfText).toMatch(/"StateFlags"\s+"4"/)
  })

  it('Test E (23-08 Task 2a, G-23-02/T-23-27): a run whose manifest claims an executable-flagged entry but never actually chmods it (Directory|Executable combo routes it away, WR-01) finalizes StateFlags "1026", never "4", even though zero failures were recorded', async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'weird-dir',
          size: '0',
          sha_content: '',
          chunks: [],
          // Directory(64) | Executable(32): downloadSingleFile's Directory
          // guard (WR-01) returns before ever calling applyEDepotFileModes,
          // so this run's chmodAttempts stays 0 even though the manifest
          // census counts this entry as executableFlagged. No failure is
          // recorded (mkdir succeeds) — the pre-fix vacuous-truth shape.
          flags: DIRECTORY_FLAG | EXECUTABLE_FLAG
        }
      ]
    })

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
    })

    expect(result.status).toBe('done')
    const acfText = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(acfText).toMatch(/"StateFlags"\s+"1026"/)
    expect(acfText).not.toMatch(/"StateFlags"\s+"4"/)
  })
})

/**
 * D-08: the catch-path `finalize()` (depot.ts's `downloadSteamDepots`, the
 * `catch (err)` block) must not clobber a COMPLETE prior install's
 * `appmanifest_*.acf` with a zero-byte-download stub when `buildDepotPlan`
 * throws before its depot-accumulation loop ever runs (Case A in
 * 23.2-MANIFEST-WRITE-TAXONOMY.md) — the 2026-08-19 KCD2 reproduction.
 *
 * Anti-vacuity discipline (23.2-02-PLAN.md):
 *  - the target directory is a genuinely bottle-shaped path, computed from
 *    the REAL (unmocked) getBottleDir/getBottleSteamappsDir — not a
 *    hardcoded lookalike — because checking the macOS steamapps directory
 *    instead of the CrossOver bottle is the most likely reason this defect
 *    went unnoticed for a month (23.2-01's adjudication note).
 *  - the primary assertion is EXACT manifest text equality against a real
 *    prior manifest seeded via buildAppManifestText — never a bare
 *    `toMatch(/"InstalledDepots"/)`, which is VACUOUS: buildAppManifestText
 *    emits that key unconditionally, even for an empty array (present-but-
 *    empty block, manifest.ts:174-177). A bare key-name match would pass
 *    against the exact stub this test exists to catch.
 */
describe('D-08: catch-path finalize must not clobber a complete install (bottle-path)', () => {
  const BOTTLE_NAME = DEFAULT_STEAM_BOTTLE_NAME
  const KCD2_APP_ID = '1771300'
  const KCD2_INSTALLDIR = 'KingdomComeDeliverance2'

  let root: string
  let targetSteamappsDir: string
  let manifestPath: string
  let seededManifestText: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gamelib-d08-bottle-clobber-'))

    // Genuinely bottle-shaped target dir — derived from the REAL, unmocked
    // bottle.ts helpers, not a hardcoded lookalike path.
    const bottleSuffix = relative(
      getBottleDir(BOTTLE_NAME),
      getBottleSteamappsDir(BOTTLE_NAME)
    )
    targetSteamappsDir = join(root, bottleSuffix)
    mkdirSync(targetSteamappsDir, { recursive: true })

    // Structural assertion: prove the computed suffix is actually
    // bottle-shaped (contains drive_c, ends with steamapps) — not a
    // trivially-satisfied relative path.
    const segments = bottleSuffix.split(sep)
    expect(segments).toContain('drive_c')
    expect(segments[segments.length - 1]).toBe('steamapps')

    // Seed a real, complete prior install's manifest — StateFlags 4,
    // real buildid, three installed depots — the exact shape a genuine
    // official-client KCD2 install leaves behind.
    seededManifestText = buildAppManifestText({
      appId: KCD2_APP_ID,
      installdir: KCD2_INSTALLDIR,
      name: 'Kingdom Come: Deliverance II',
      sizeOnDisk: '96422090071',
      buildid: '23914554',
      lastOwner: '76561198012345678',
      stateFlags: '4',
      bytes: '96422090071',
      installedDepots: [
        { depotId: '1771302', manifest: '1111111111111111111', size: 32000000000 },
        { depotId: '1771303', manifest: '2222222222222222222', size: 4000000000 },
        { depotId: '1771306', manifest: '3333333333333333333', size: 60422090071 }
      ]
    })
    manifestPath = join(targetSteamappsDir, `appmanifest_${KCD2_APP_ID}.acf`)
    writeFileSync(manifestPath, seededManifestText, 'utf8')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('a plan-build throw from selectAllDepots (zero depots ever selected) leaves the complete prior manifest byte-for-byte untouched', async () => {
    const fakeClient = makeFakeClient({
      getProductInfo: jest.fn().mockResolvedValue({
        apps: {
          1771300: {
            appinfo: {
              depots: { branches: { public: { buildid: '23914554' } } },
              extended: {}
            }
          }
        },
        packages: {},
        unknownApps: [],
        unknownPackages: []
      })
    })
    setupPlanPlumbing(fakeClient)
    jest.mocked(selectAllDepots).mockImplementation(() => {
      throw new Error('selectAllDepots: simulated plan-build failure')
    })

    const result = await downloadSteamDepots(KCD2_APP_ID, {
      targetSteamappsDir,
      installdir: KCD2_INSTALLDIR,
      os: 'windows'
    })

    expect(result.status).toBe('error')
    expect(fetchChunk).not.toHaveBeenCalled()

    const acfText = readFileSync(manifestPath, 'utf8')
    // Primary assertion: exact text equality — never `toMatch(/"InstalledDepots"/)`,
    // which is vacuous (see file-header comment above this describe block).
    expect(acfText).toBe(seededManifestText)
    // Diagnostic sub-assertions, named per the plan:
    expect(acfText).toMatch(/"StateFlags"\s+"4"/)
    expect(acfText).toMatch(/"buildid"\s+"23914554"/)
    expect(acfText).not.toMatch(/"buildid"\s+"0"/)
    expect(acfText).toMatch(/"1771302"/)
  })

  it('a plan-build throw from getDepotDecryptionKey rejecting with eresult 40 (the 2026-08-19 KCD2 reproduction) leaves the complete prior manifest byte-for-byte untouched', async () => {
    const fakeClient = makeFakeClient({
      getProductInfo: jest.fn().mockResolvedValue({
        apps: {
          1771300: {
            appinfo: {
              depots: { branches: { public: { buildid: '23914554' } } },
              extended: {}
            }
          }
        },
        packages: {},
        unknownApps: [],
        unknownPackages: []
      })
    })
    setupPlanPlumbing(fakeClient)
    jest.mocked(fakeClient.getDepotDecryptionKey).mockImplementation(
      (
        _appId: number,
        _depotId: number,
        cb: (err: Error | null, key?: Buffer) => void
      ) => {
        const err = new Error('Blocked') as Error & { eresult?: number }
        err.eresult = 40
        cb(err, undefined)
      }
    )

    const result = await downloadSteamDepots(KCD2_APP_ID, {
      targetSteamappsDir,
      installdir: KCD2_INSTALLDIR,
      os: 'windows'
    })

    expect(result.status).toBe('error')
    expect(fetchChunk).not.toHaveBeenCalled()

    const acfText = readFileSync(manifestPath, 'utf8')
    // Primary assertion: exact text equality — never `toMatch(/"InstalledDepots"/)`,
    // which is vacuous (see file-header comment above this describe block).
    expect(acfText).toBe(seededManifestText)
    // Diagnostic sub-assertions, named per the plan:
    expect(acfText).toMatch(/"StateFlags"\s+"4"/)
    expect(acfText).toMatch(/"buildid"\s+"23914554"/)
    expect(acfText).not.toMatch(/"buildid"\s+"0"/)
    expect(acfText).toMatch(/"1771302"/)
  })
})
