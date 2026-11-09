/* eslint-disable @typescript-eslint/unbound-method */
/**
 * Phase 73 Plan 14: the prescreen, selected-files fetch and startup-resume verify behind
 * GAMELIB_DEPOT_PIPELINE, over a stubbed rustInvoke leaf and a fake steam-user client.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { requestRustInvoke } from 'backend/sidecar/sidecarRpc'
import { downloadSelectedDepotFiles, prescreenBridgeDepots } from '../../depot'
import { SteamUser } from '../../user'
import { mockLeaseOk } from '../../__tests__/depotLeaseMocks'
import { selectAllDepots } from '../../depot/select'
import { decryptFilename } from '../../depot/crypto'
import { getSteamLibraries } from 'backend/utils'
import { resumeInterruptedSteamInstall } from '../../library/resume'
import { startInstallPolling } from '../../library/installPolling'
import { RUST_DEPOT_MANIFEST_SUMMARY } from 'common/types/sidecarTransport'
import { createStubRustDepot } from './fixtures/stubRustDepot'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  getRunnerLogWriter: jest.fn().mockReturnValue({}),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn(),
  getSteamLibraries: jest.fn()
}))
jest.mock('backend/sidecar/sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))
jest.mock('../../user')
jest.mock('../../depot/select', () => ({
  ...jest.requireActual('../../depot/select'),
  selectAllDepots: jest.fn()
}))
jest.mock('../../depot/crypto', () => ({ decryptFilename: jest.fn() }))
jest.mock('../../depot/fileAttributes', () => ({
  applyDepotFileFlags: jest.fn()
}))
jest.mock('steam-user/components/content_manifest.js', () => ({
  parse: jest.fn()
}))
jest.mock('../../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('../../library/installPolling', () => ({
  startInstallPolling: jest.fn()
}))
jest.mock('../../library/pollState', () => ({
  activePolls: new Map(),
  MAX_TICKS: 1
}))
jest.mock('../../library/acfState', () => ({ readAcfState: jest.fn() }))
jest.mock('../../library/restartHold', () => ({
  pendingSteamHoldRearm: new Set(),
  setReconcileRanDuringRearm: jest.fn()
}))
jest.mock('../../steamClientProcess', () => ({
  listSteamClientPids: jest.fn(),
  readSteamProcessStartTokens: jest.fn()
}))
jest.mock('../../steamRestartHold', () => ({
  clearSteamRestartHold: jest.fn(),
  decideSteamRestartHoldRearm: jest.fn(),
  listSteamRestartHolds: jest.fn().mockReturnValue(new Map())
}))
jest.mock('../../gameSessionState', () => ({
  isNativeInstallInFlight: jest.fn()
}))
jest.mock('backend/constants/environment', () => ({
  isMac: true,
  isLinux: false
}))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback = '') => fallback }
}))

const invokeMock = requestRustInvoke as unknown as jest.Mock

const APP_ID = '12345'
let steamapps: string
let client: ReturnType<typeof makeClient>

function makeClient() {
  return {
    licenses: [] as Array<{ package_id: number }>,
    steamID: { getSteamID64: jest.fn().mockReturnValue('76561198012345678') },
    getProductInfo: jest.fn((ids: number[]) => {
      const id = ids[0] ?? 0
      return Promise.resolve({
        apps: {
          [id]: {
            appinfo: {
              common: { name: 'Some Game' },
              depots: { branches: { public: { buildid: 321 } } },
              config: { installdir: 'SomeGame' },
              extended: {}
            }
          }
        },
        packages: {}
      })
    }),
    getDepotDecryptionKey: jest.fn(
      (_a: number, d: number, cb: (e: Error | null, k: Buffer) => void) =>
        cb(null, Buffer.alloc(32, d % 250))
    ),
    getRawManifest: jest.fn(),
    getContentServers: jest.fn(
      (_a: number, cb: (e: Error | null, s: unknown[]) => void) =>
        cb(null, [{ Host: 'cdn1.example.com', type: 'CDN', weightedload: '5' }])
    ),
    getManifestRequestCode: jest.fn().mockResolvedValue({ requestCode: '42' })
  }
}

const OPTS = () => ({
  targetSteamappsDir: steamapps,
  installdir: 'SomeGame',
  os: 'macos'
})

beforeEach(() => {
  jest.resetAllMocks()
  steamapps = mkdtempSync(join(tmpdir(), 'rustsecondary-'))
  client = makeClient()
  jest.mocked(SteamUser.getClient).mockReturnValue(client as never)
  jest
    .mocked(SteamUser.getPersistedSteamId64)
    .mockReturnValue('76561198012345678')
  mockLeaseOk()
  jest
    .mocked(selectAllDepots)
    .mockReturnValue([
      { id: '111', manifest: '11111111111111111', size: 0, ownerAppId: APP_ID }
    ])
  jest.mocked(decryptFilename).mockImplementation((raw: unknown) => String(raw))
  process.env.GAMELIB_DEPOT_PIPELINE = 'rust'
})

afterEach(() => {
  delete process.env.GAMELIB_DEPOT_PIPELINE
  if (steamapps.startsWith(tmpdir()))
    rmSync(steamapps, { recursive: true, force: true })
})

function summaryOf(matches: string[]) {
  return {
    depots: [{ depotId: '111', fileCount: 3, totalBytes: 30, matches }]
  }
}

describe('prescreenBridgeDepots on the rust pipeline', () => {
  it.each([
    [['bin/steam_api.dll', 'x/steam_api64.dll'], 'both'],
    [['x/steam_api64.dll'], 'x64'],
    [['bin/steam_api.dll'], 'x86'],
    [[], 'none']
  ] as const)(
    'answers %j as %s from the summary, with no manifest in TS',
    async (matches, want) => {
      const stub = createStubRustDepot({ summary: summaryOf([...matches]) })
      invokeMock.mockImplementation(stub.invoke)

      const r = await prescreenBridgeDepots(APP_ID, OPTS())

      expect(r).toBe(want)
      expect(stub.jobs).toHaveLength(0)
      const call = stub.calls.find(
        (c) => c.channel === RUST_DEPOT_MANIFEST_SUMMARY
      )
      expect(call?.args[0]).toMatchObject({
        appId: APP_ID,
        patterns: ['steam_api.dll', 'steam_api64.dll']
      })
      expect(client.getRawManifest).not.toHaveBeenCalled()
    }
  )

  it('resolves unknown when the summary reports an error', async () => {
    const stub = createStubRustDepot({
      summary: {
        error: {
          file: null,
          kind: 'manifest_unavailable',
          message: 'x',
          code: null,
          eresult: 40,
          httpStatus: null,
          scope: null,
          msSinceProgress: null
        }
      }
    })
    invokeMock.mockImplementation(stub.invoke)
    expect(await prescreenBridgeDepots(APP_ID, OPTS())).toBe('unknown')
  })

  it('flag ts: never calls the summary channel', async () => {
    process.env.GAMELIB_DEPOT_PIPELINE = 'ts'
    jest.mocked(selectAllDepots).mockReturnValue([])
    const stub = createStubRustDepot()
    invokeMock.mockImplementation(stub.invoke)
    expect(await prescreenBridgeDepots(APP_ID, OPTS())).toBe('none')
    expect(stub.calls).toHaveLength(0)
  })
})

describe('downloadSelectedDepotFiles on the rust pipeline', () => {
  it('runs one select_files job with the path list and maps Outcome.files', async () => {
    const files = [{ filename: 'bin\\steam_api64.dll', size: 7, sha1: 'ab' }]
    const stub = createStubRustDepot({ outcome: { files, acf: null } })
    invokeMock.mockImplementation(stub.invoke)

    const r = await downloadSelectedDepotFiles(APP_ID, {
      ...OPTS(),
      selectPaths: ['bin/steam_api64.dll']
    })

    expect(r).toEqual({ status: 'done', files })
    expect(stub.jobs).toHaveLength(1)
    expect(stub.jobs[0]).toMatchObject({
      mode: 'select_files',
      selectPaths: ['bin/steam_api64.dll'],
      finalize: null,
      installRoot: join(steamapps, 'common', 'SomeGame')
    })
  })

  it('maps a failed job to an error result and an abort to cancelled', async () => {
    const stub = createStubRustDepot({
      outcome: {
        status: 'error',
        acf: null,
        failures: [
          {
            file: 'a',
            kind: 'disk_full',
            message: 'ENOSPC: no space left',
            code: null,
            eresult: null,
            httpStatus: null,
            scope: null,
            msSinceProgress: null
          }
        ]
      }
    })
    invokeMock.mockImplementation(stub.invoke)
    const r = await downloadSelectedDepotFiles(APP_ID, {
      ...OPTS(),
      selectPaths: ['a']
    })
    expect(r.status).toBe('error')
    expect(r.error).toBeTruthy()

    const ac = new AbortController()
    ac.abort()
    const c = await downloadSelectedDepotFiles(APP_ID, {
      ...OPTS(),
      selectPaths: ['a'],
      signal: ac.signal
    })
    expect(c.status).toBe('cancelled')
  })

  it('rejects a select predicate on the rust path', async () => {
    await expect(
      downloadSelectedDepotFiles(APP_ID, {
        ...OPTS(),
        selectPaths: [],
        select: () => true
      } as never)
    ).rejects.toThrow(/selectPaths/)
  })
})

describe('startup resume on the rust pipeline', () => {
  it('runs one verify_only job with the finalize policy and still starts the poller', async () => {
    // getSteamLibraries gives a library root; resume joins `steamapps` onto it.
    const lib = mkdtempSync(join(tmpdir(), 'rustresume-'))
    const sa = join(lib, 'steamapps')
    mkdirSync(sa)
    writeFileSync(
      join(sa, `appmanifest_${APP_ID}.acf`),
      `"AppState"\n{\n\t"appid"\t"${APP_ID}"\n\t"installdir"\t"SomeGame"\n}\n`
    )
    jest.mocked(getSteamLibraries).mockResolvedValue([lib])
    const stub = createStubRustDepot({
      outcome: { missing: ['bin/a.dll'], allFilesVerified: false }
    })
    invokeMock.mockImplementation(stub.invoke)

    await resumeInterruptedSteamInstall(APP_ID)

    expect(stub.jobs).toHaveLength(1)
    const job = stub.jobs[0]
    expect(job?.mode).toBe('verify_only')
    expect(job?.finalize).toEqual({
      steamappsDir: sa,
      installdir: 'SomeGame',
      name: 'SomeGame',
      buildid: '321',
      lastOwner: '76561198012345678',
      allowFullOwnership: true
    })
    expect(client.getRawManifest).not.toHaveBeenCalled()
    expect(startInstallPolling).toHaveBeenCalledWith(APP_ID)
    // The TS finalize does not run on top of the ACF Rust wrote (the stub wrote none).
    expect(
      readFileSync(join(sa, `appmanifest_${APP_ID}.acf`), 'utf8')
    ).not.toContain('StateFlags')
    rmSync(lib, { recursive: true, force: true })
  })

  it('falls back to the honest-empty finalize and still polls when the job cannot run', async () => {
    const lib = mkdtempSync(join(tmpdir(), 'rustresume-'))
    const sa = join(lib, 'steamapps')
    mkdirSync(sa)
    writeFileSync(
      join(sa, `appmanifest_${APP_ID}.acf`),
      `"AppState"\n{\n\t"appid"\t"${APP_ID}"\n\t"installdir"\t"SomeGame"\n}\n`
    )
    jest.mocked(getSteamLibraries).mockResolvedValue([lib])
    const stub = createStubRustDepot({ outcome: { status: 'cancelled' } })
    invokeMock.mockImplementation(stub.invoke)

    await resumeInterruptedSteamInstall(APP_ID)

    expect(startInstallPolling).toHaveBeenCalledWith(APP_ID)
    expect(
      readFileSync(join(sa, `appmanifest_${APP_ID}.acf`), 'utf8')
    ).toContain('1026')
    rmSync(lib, { recursive: true, force: true })
  })
})
