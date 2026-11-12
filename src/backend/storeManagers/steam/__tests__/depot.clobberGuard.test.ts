/**
 * D-08 (23.2-02): a CM-half failure before any depot job ran must never clobber a COMPLETE
 * prior install's appmanifest with a zero-byte-download stub (the 2026-08-19 KCD2
 * reproduction). Since 73-19 the download is a Rust job (stubbed here through the rustInvoke
 * leaf): these tests prove the entry point fails before any job and writes nothing.
 *
 * Renamed from depot.finalize.test.ts in 73-19. The rest of that file drove the TS
 * orchestrator's finalize; its assertions now live in the gamelib-depot crate (acf.rs
 * complete_run_earns_4 / cancelled_writes_1026 / modes_not_applied_writes_1026 /
 * failure_writes_1026 / missing_last_owner_defaults_zero, job_install.rs
 * cancel_still_finalizes_1026 / blocked_manifest_skips_that_depot_and_installs_the_rest,
 * reconcile.rs verify_structural_integrity cases) and in depotRust/__tests__/rustInstall.test.ts.
 */
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
const requestRustInvoke = jest.fn()
const depotTransport = {
  requestRustInvoke,
  sendFrontendMessage: jest.fn()
}
import { downloadSteamDepots } from '../depot'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { mockLeaseOk } from './depotLeaseMocks'
import { selectAllDepots } from '../depot/select'
import { getBottleSteamappsDir } from '../bottle'
import { getBottleDir } from 'backend/storeManagers/steam/bottleDirs'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import {
  createStubRustDepot,
  type StubRustDepot
} from '../depotRust/__tests__/fixtures/stubRustDepot'

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

// ── SteamUser mock — controls acquireAuthenticated()/getClient() return values ────

// ── backend/utils mock — the bottle.ts imports (checkWineBeforeLaunch/downloadFile/spawnAsync)
//    the real getBottleDir/getBottleSteamappsDir chain needs; none is called by those two. ──
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn(),
  checkWineBeforeLaunch: jest.fn(),
  downloadFile: jest.fn(),
  spawnAsync: jest.fn()
}))

// ── ../stores mock — avoids real TypeCheckedStoreBackend/CacheStore
//    instantiation at module load (bottle.ts imports steamBottleConfigStore). ─
jest.mock('../stores', () => ({
  steamBottleConfigStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn()
  }
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
    getContentServers: jest
      .fn()
      .mockImplementation(
        (
          _appId: number,
          cb: (err: Error | null, servers: Array<{ Host?: string }>) => void
        ) => cb(null, [{ Host: 'cdn1.example.com' }])
      ),
    getManifestRequestCode: jest.fn().mockResolvedValue({ requestCode: '42' }),
    ...overrides
  }
}

let rust: StubRustDepot

/** One owned depot, a working key, and the stubbed Rust leaf. */
function setupPlanPlumbing(fakeClient: ReturnType<typeof makeFakeClient>) {
  mockLeaseOk(steamUser)
  jest.mocked(steamUser.getClient).mockReturnValue(fakeClient as never)
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
      ) => cb(null, Buffer.alloc(32, depotId % 250))
    )
  rust = createStubRustDepot()
  jest.mocked(requestRustInvoke).mockImplementation(rust.invoke)
}

/**
 * D-08: a CM-half throw before any depot job ran must not clobber a COMPLETE prior install's
 * `appmanifest_*.acf` with a zero-byte-download stub (Case A in
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
    seededManifestText = [
      '"AppState"',
      '{',
      `\t"appid"\t\t"${KCD2_APP_ID}"`,
      '\t"Universe"\t\t"1"',
      '\t"StateFlags"\t\t"4"',
      `\t"installdir"\t\t"${KCD2_INSTALLDIR}"`,
      '\t"name"\t\t"Kingdom Come: Deliverance II"',
      '\t"LastUpdated"\t\t"1755600000"',
      '\t"SizeOnDisk"\t\t"96422090071"',
      '\t"buildid"\t\t"23914554"',
      '\t"LastOwner"\t\t"76561198012345678"',
      '\t"BytesToDownload"\t\t"96422090071"',
      '\t"BytesDownloaded"\t\t"96422090071"',
      '\t"AutoUpdateBehavior"\t\t"0"',
      '\t"InstalledDepots"',
      '\t{',
      '\t\t"1771302"',
      '\t\t{',
      '\t\t\t"manifest"\t\t"1111111111111111111"',
      '\t\t\t"size"\t\t"32000000000"',
      '\t\t}',
      '\t\t"1771303"',
      '\t\t{',
      '\t\t\t"manifest"\t\t"2222222222222222222"',
      '\t\t\t"size"\t\t"4000000000"',
      '\t\t}',
      '\t\t"1771306"',
      '\t\t{',
      '\t\t\t"manifest"\t\t"3333333333333333333"',
      '\t\t\t"size"\t\t"60422090071"',
      '\t\t}',
      '\t}',
      '\t"UserConfig"',
      '\t{',
      '\t}',
      '\t"MountedDepots"',
      '\t{',
      '\t}',
      '}',
      ''
    ].join('\n')
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
      installRuntime: createTestSteamInstallRuntime(depotTransport),
      steamUser,
      config: createTestGlobalConfig(),
      targetSteamappsDir,
      installdir: KCD2_INSTALLDIR,
      os: 'windows'
    })

    expect(result.status).toBe('error')
    expect(rust.jobs).toHaveLength(0)

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
    jest
      .mocked(fakeClient.getDepotDecryptionKey)
      .mockImplementation(
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
      installRuntime: createTestSteamInstallRuntime(depotTransport),
      steamUser,
      config: createTestGlobalConfig(),
      targetSteamappsDir,
      installdir: KCD2_INSTALLDIR,
      os: 'windows'
    })

    expect(result.status).toBe('error')
    expect(rust.jobs).toHaveLength(0)

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
