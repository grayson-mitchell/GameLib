/* eslint-disable @typescript-eslint/unbound-method */
/**
 * Phase 73 Plan 13 Task 2: downloadSteamDepots and downloadSharedRedistDepots on the Rust
 * pipeline (the only one since 73-19), over a stubbed rustInvoke leaf and a fake steam-user
 * client.
 */
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
const requestRustInvoke = jest.fn()
const depotTransport = {
  requestRustInvoke,
  sendFrontendMessage: jest.fn()
}
import { downloadSharedRedistDepots, downloadSteamDepots } from '../../depot'
import { classifyDepotError } from '../../depotErrors'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { mockLeaseOk, mockOpenLease } from '../../__tests__/depotLeaseMocks'
import { selectAllDepots } from '../../depot/select'
import { requestCodeRefresher } from '../install'
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
  sendProgressUpdate: jest.fn()
}))
jest.mock('../../depot/select', () => ({
  ...jest.requireActual('../../depot/select'),
  selectAllDepots: jest.fn()
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
      const redist = id === 228980
      return Promise.resolve({
        apps: {
          [id]: {
            appinfo: {
              common: { name: 'Some Game' },
              depots: {
                branches: { public: { buildid: 321 } },
                '228990': redist
                  ? { manifests: { public: { gid: '9000000000000000001' } } }
                  : { depotfromapp: '228980', sharedinstall: '1' }
              },
              config: { installdir: 'Steamworks Shared' },
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
    // Present so a stray TS manifest fetch would be counted (D-01: there must be none).
    getRawManifest: jest.fn(),
    getContentServers: jest.fn(
      (_a: number, cb: (e: Error | null, s: unknown[]) => void) =>
        cb(null, [{ Host: 'cdn1.example.com', type: 'CDN', weightedload: '5' }])
    ),
    getManifestRequestCode: jest.fn().mockResolvedValue({ requestCode: '42' })
  }
}

// The all-blocked message for depots 111 and 222, as the crate words it (manifest.rs).
const ALL_BLOCKED_MSG =
  'buildDepotPlan: every selected depot for appId 12345 was blocked by Steam (eresult=40) and had to be skipped: 111, 222'

const OPTS = () => ({
  installRuntime: createTestSteamInstallRuntime(depotTransport),
  steamUser,
  config: createTestGlobalConfig(),
  targetSteamappsDir: steamapps,
  installdir: 'SomeGame',
  os: 'macos'
})

beforeEach(() => {
  jest.resetAllMocks()
  steamapps = mkdtempSync(join(tmpdir(), 'rustinstall-'))
  client = makeClient()
  jest.mocked(steamUser.getClient).mockReturnValue(client as never)
  jest
    .mocked(steamUser.getPersistedSteamId64)
    .mockReturnValue('76561198012345678')
  mockLeaseOk(steamUser)
  mockOpenLease(steamUser)
  jest.mocked(selectAllDepots).mockReturnValue([
    { id: '111', manifest: '11111111111111111', size: 0, ownerAppId: APP_ID },
    { id: '222', manifest: '22222222222222222', size: 0, ownerAppId: APP_ID }
  ])
})

afterEach(() => {
  if (steamapps.startsWith(tmpdir()))
    rmSync(steamapps, { recursive: true, force: true })
})

describe('downloadSteamDepots on the rust pipeline', () => {
  it('runs one install job carrying the finalize policy and returns the mapped outcome', async () => {
    const stub = createStubRustDepot()
    invokeMock.mockImplementation(stub.invoke)
    client.getDepotDecryptionKey.mockImplementation(
      (_a: number, d: number, cb: (e: Error | null, k: Buffer) => void) =>
        d === 111
          ? cb(
              Object.assign(new Error('Blocked'), { eresult: 40 }),
              Buffer.alloc(0)
            )
          : cb(null, Buffer.alloc(32, 7))
    )

    const out = await downloadSteamDepots(APP_ID, OPTS())

    expect(out).toEqual({ status: 'done', skippedDepots: ['111'] })
    expect(stub.jobs).toHaveLength(1)
    const job = stub.jobs[0]
    expect(job?.mode).toBe('install')
    expect(job?.installRoot).toBe(join(steamapps, 'common', 'SomeGame'))
    expect(job?.depots.map((d) => d.depotId)).toEqual(['222'])
    expect(job?.depots[0]?.key).toBe('07'.repeat(32))
    expect(job?.hosts[0]).toMatchObject({
      host: 'cdn1.example.com',
      useTokenAuth: true
    })
    expect(job?.finalize).toEqual({
      steamappsDir: steamapps,
      installdir: 'SomeGame',
      name: 'Some Game',
      buildid: '321',
      lastOwner: '76561198012345678',
      allowFullOwnership: true
    })
    expect(client.getRawManifest).not.toHaveBeenCalled()
  })

  it('EResult-40 manifest refusals skip the depot and join the key-level skips', async () => {
    jest.mocked(selectAllDepots).mockReturnValue([
      { id: '111', manifest: '11111111111111111', size: 0, ownerAppId: APP_ID },
      { id: '222', manifest: '22222222222222222', size: 0, ownerAppId: APP_ID },
      { id: '333', manifest: '33333333333333333', size: 0, ownerAppId: APP_ID }
    ])
    client.getDepotDecryptionKey.mockImplementation(
      (_a: number, d: number, cb: (e: Error | null, k: Buffer) => void) =>
        d === 111
          ? cb(
              Object.assign(new Error('Blocked'), { eresult: 40 }),
              Buffer.alloc(0)
            )
          : cb(null, Buffer.alloc(32, 7))
    )
    // Rust dropped depot 222 when Steam refused its manifest; the job carried on without it.
    const stub = createStubRustDepot({ outcome: { skippedDepots: ['222'] } })
    invokeMock.mockImplementation(stub.invoke)

    const out = await downloadSteamDepots(APP_ID, OPTS())

    expect(out).toEqual({ status: 'done', skippedDepots: ['111', '222'] })
    expect(stub.jobs[0]?.depots.map((d) => d.depotId)).toEqual(['222', '333'])
  })

  it('every depot blocked at the manifest fails with the depotBlocked classification of the key-level all-blocked error', async () => {
    const stub = createStubRustDepot({
      outcome: {
        status: 'error',
        acf: null,
        skippedDepots: ['111', '222'],
        failures: [
          {
            file: null,
            kind: 'manifest_unavailable' as const,
            message: ALL_BLOCKED_MSG,
            code: null,
            eresult: 40,
            httpStatus: null,
            scope: 'run' as const,
            msSinceProgress: null
          }
        ]
      }
    })
    invokeMock.mockImplementation(stub.invoke)

    const out = await downloadSteamDepots(APP_ID, OPTS())

    // buildDepotRefs throws an Error with eresult 40 when every key is blocked (throwIfAllDepotsSkipped).
    const expected = classifyDepotError(
      Object.assign(new Error(ALL_BLOCKED_MSG), {
        eresult: 40
      })
    )
    expect(out.status).toBe('error')
    expect(out.error).toBe(expected.message)
    expect(out.errorAction).toBe(expected.action)
    expect(out.skippedDepots).toBeUndefined()
  })

  it('a plan-build failure runs no job, writes no ACF and classifies the CM error', async () => {
    const stub = createStubRustDepot()
    invokeMock.mockImplementation(stub.invoke)
    const boom = Object.assign(new Error('AccessDenied'), { eresult: 15 })
    client.getDepotDecryptionKey.mockImplementation(
      (_a: number, _d: number, cb: (e: Error | null, k: Buffer) => void) =>
        cb(boom, Buffer.alloc(0))
    )

    const out = await downloadSteamDepots(APP_ID, OPTS())

    expect(stub.jobs).toHaveLength(0)
    expect(readdirSync(steamapps)).toEqual([])
    const expected = classifyDepotError(
      Object.assign(new Error('x'), { eresult: 15 })
    )
    expect(out.status).toBe('error')
    expect(out.errorAction).toBe(expected.action)
  })

  it('an abort mid-job fires cancel once and returns cancelled', async () => {
    const stub = createStubRustDepot({ holdUntilCancel: true })
    invokeMock.mockImplementation(stub.invoke)
    const ac = new AbortController()

    const pending = downloadSteamDepots(APP_ID, {
      ...OPTS(),
      signal: ac.signal
    })
    while (stub.jobs.length === 0) await new Promise((r) => setImmediate(r))
    ac.abort()
    const out = await pending

    expect(stub.cancels).toEqual([stub.jobs[0]?.jobId])
    expect(out.status).toBe('cancelled')
  })

  it('maps a Rust error outcome through the shared classifier', async () => {
    const stub = createStubRustDepot({
      outcome: {
        status: 'error',
        acf: { stateFlags: '1026', sizeOnDisk: '0' },
        failures: [
          {
            file: 'a.bin',
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
    const out = await downloadSteamDepots(APP_ID, OPTS())
    expect(out.status).toBe('error')
    expect(out.errorAction).toBe(classifyDepotError(new Error('ENOSPC')).action)
  })
})

describe('downloadSharedRedistDepots on the rust pipeline', () => {
  const SCRIPT = '_CommonRedist\\DirectX\\Jun2010\\installscript.vdf'
  const scriptText = readFileSync(
    join(
      __dirname,
      '../../bridge/__tests__/fixtures/sharedRedists/228990-directx-jun2010.vdf'
    ),
    'utf8'
  )

  it('runs ordinary jobs with its own install root and no finalize, keeping index and onComponent', async () => {
    const root = join(steamapps, 'common', 'Steamworks Shared')
    const stub = createStubRustDepot({
      outcome: { acf: null },
      summary: {
        depots: [
          {
            depotId: '228990',
            fileCount: 2,
            totalBytes: 90 + scriptText.length,
            matches: [],
            installscripts: [SCRIPT]
          }
        ],
        skippedDepots: []
      },
      onRun: () => {
        const target = join(root, SCRIPT.replace(/\\/g, '/'))
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, scriptText)
      }
    })
    invokeMock.mockImplementation(stub.invoke)
    const labels: string[] = []

    const r = await downloadSharedRedistDepots(APP_ID, {
      installRuntime: createTestSteamInstallRuntime(depotTransport),
      steamUser,
      cacheSteamappsDir: steamapps,
      optInDepotIds: [],
      allowLogon: true,
      onComponent: (l) => labels.push(l)
    })

    expect(r.status).toBe('ok')
    expect(r.failed).toEqual([])
    expect(r.depots).toHaveLength(1)
    expect(labels).toHaveLength(1)
    expect(stub.jobs.map((j) => j.mode)).toEqual(['select_files', 'install'])
    for (const j of stub.jobs) {
      expect(j.finalize).toBeNull()
      expect(j.installRoot).toBe(root)
      expect(j.appId).toBe('228980')
    }
    expect(stub.jobs[0]?.selectPaths).toEqual([SCRIPT])
    expect(client.getRawManifest).not.toHaveBeenCalled()
    expect(
      existsSync(join(steamapps, 'gamelib-shared-redist-index.json'))
    ).toBe(true)
  })
})

describe('requestCodeRefresher', () => {
  const owners = new Map([['111', APP_ID]])
  it('returns the code, null for ordinary failures, and rethrows EResult 40 so the crate can skip the depot', async () => {
    const ok = requestCodeRefresher(client, owners, APP_ID)
    expect(await ok('111', '7')).toBe('42')

    client.getManifestRequestCode.mockRejectedValueOnce(new Error('timeout'))
    expect(await ok('111', '7')).toBeNull()

    const blocked = Object.assign(new Error('Blocked'), { eresult: 40 })
    client.getManifestRequestCode.mockRejectedValueOnce(blocked)
    await expect(ok('111', '7')).rejects.toBe(blocked)

    // Only the literal 40: AccessDenied and friends stay "no code".
    client.getManifestRequestCode.mockRejectedValueOnce(
      Object.assign(new Error('AccessDenied'), { eresult: 15 })
    )
    expect(await ok('111', '7')).toBeNull()
  })

  it('requests codes for the given branch, defaulting to public', async () => {
    client.getManifestRequestCode.mockClear()
    await requestCodeRefresher(
      client,
      owners,
      APP_ID,
      'release-101'
    )('111', '7')
    expect(client.getManifestRequestCode).toHaveBeenLastCalledWith(
      Number(APP_ID),
      111,
      '7',
      'release-101'
    )
    await requestCodeRefresher(client, owners, APP_ID)('111', '7')
    expect(client.getManifestRequestCode).toHaveBeenLastCalledWith(
      Number(APP_ID),
      111,
      '7',
      'public'
    )
  })
})
