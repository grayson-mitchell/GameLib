/**
 * Phase 73 Plan 13 Task 1 (renamed from depotPipelineFlag.test.ts in 73-19, when the D-16 flag
 * was removed): the CM-only plan half, the job builder and the progress bridge.
 */
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { buildDepotRefs } from '../../depot/plan'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { mockLeaseOk } from '../../__tests__/depotLeaseMocks'
import { selectAllDepots } from '../../depot/select'
import { getFileSize, sendProgressUpdate } from 'backend/utils'
import { buildDepotJob, orderRefsForCollisions } from '../jobBuilder'
import { createProgressBridge } from '../progressBridge'
import type { RustJobEvent } from '../types'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  getRunnerLogWriter: jest.fn().mockReturnValue({}),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn((n: number) => `${n}B`),
  sendProgressUpdate: jest.fn()
}))
jest.mock('../../depot/select', () => ({
  ...jest.requireActual('../../depot/select'),
  selectAllDepots: jest.fn()
}))
jest.mock('../../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (_key: string, fallback = '') => fallback }
}))

const APP_ID = '12345'
const OPTS = {
  installRuntime: createTestSteamInstallRuntime(),
  steamUser,
  config: createTestGlobalConfig(),
  targetSteamappsDir: '/tmp/steamapps',
  installdir: 'SomeGame',
  os: 'macos'
}

function makeClient() {
  return {
    licenses: [] as Array<{ package_id: number }>,
    steamID: { getSteamID64: jest.fn().mockReturnValue('76561198012345678') },
    getProductInfo: jest.fn().mockResolvedValue({
      apps: {
        12345: {
          appinfo: {
            common: { name: 'Some Game' },
            depots: { branches: { public: { buildid: 987 } } },
            extended: {}
          }
        }
      },
      packages: {},
      unknownApps: [],
      unknownPackages: []
    }),
    getDepotDecryptionKey: jest.fn(
      (
        _app: number,
        depotId: number,
        cb: (e: Error | null, k: Buffer) => void
      ) => cb(null, Buffer.alloc(32, depotId % 256))
    ),
    // Present so a stray TS manifest fetch would be counted (D-01: there must be none).
    getRawManifest: jest.fn()
  }
}

function wire(client: ReturnType<typeof makeClient>) {
  mockLeaseOk(steamUser)
  jest.mocked(steamUser.getClient).mockReturnValue(client as never)
  jest.mocked(selectAllDepots).mockReturnValue([
    { id: '111', manifest: '11111111111111111', size: 0, ownerAppId: APP_ID },
    { id: '222', manifest: '22222222222222222', size: 0, ownerAppId: APP_ID }
  ])
}

describe('buildDepotRefs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('buildDepotRefs_never_fetches_manifests', async () => {
    const client = makeClient()
    wire(client)
    const refs = await buildDepotRefs(APP_ID, OPTS)
    expect(client.getRawManifest).toHaveBeenCalledTimes(0)
    expect(client.getDepotDecryptionKey).toHaveBeenCalledTimes(2)
    expect(refs.depots.map((d) => d.depotId)).toEqual(['111', '222'])
  })

  it('returns the selected ids, manifests, owner, display name and public buildid', async () => {
    const client = makeClient()
    wire(client)
    const refs = await buildDepotRefs(APP_ID, OPTS)
    expect(refs.depots.map((d) => [d.depotId, d.gid, d.ownerAppId])).toEqual([
      ['111', '11111111111111111', APP_ID],
      ['222', '22222222222222222', APP_ID]
    ])
    expect(refs.name).toBe('Some Game')
    expect(refs.skippedDepots).toEqual([])
    expect(refs.buildid).toBe('987')
  })

  it('skips an EResult 40 depot and reports it', async () => {
    const client = makeClient()
    wire(client)
    client.getDepotDecryptionKey.mockImplementation(
      (_a: number, d: number, cb: (e: Error | null, k: Buffer) => void) =>
        d === 111
          ? cb(
              Object.assign(new Error('Blocked'), { eresult: 40 }),
              Buffer.alloc(0)
            )
          : cb(null, Buffer.alloc(32, 1))
    )
    const refs = await buildDepotRefs(APP_ID, OPTS)
    expect(refs.depots.map((d) => d.depotId)).toEqual(['222'])
    expect(refs.skippedDepots).toEqual(['111'])
  })

  it('throws the all-blocked error when every depot is blocked', async () => {
    const client = makeClient()
    wire(client)
    client.getDepotDecryptionKey.mockImplementation(
      (_a: number, _d: number, cb: (e: Error | null, k: Buffer) => void) =>
        cb(
          Object.assign(new Error('Blocked'), { eresult: 40 }),
          Buffer.alloc(0)
        )
    )
    await expect(buildDepotRefs(APP_ID, OPTS)).rejects.toMatchObject({
      eresult: 40
    })
  })
})

describe('buildDepotJob', () => {
  const refs = [
    {
      depotId: '2',
      gid: '22',
      key: Buffer.alloc(32, 0xab),
      ownerAppId: '9',
      appinfoRank: 1
    },
    {
      depotId: '1',
      gid: '11',
      key: Buffer.alloc(32, 0x01),
      ownerAppId: '9',
      appinfoRank: 0
    },
    { depotId: '3', gid: '33', key: Buffer.alloc(32, 0x02), ownerAppId: '8' }
  ]
  const hosts = {
    hosts: ['a.example', 'b.example'],
    weightedLoads: new Map([['a.example', 130]]),
    hostMeta: new Map([
      [
        'a.example',
        { httpsSupport: 'mandatory', usetokenauth: false, type: 'CDN' }
      ],
      ['b.example', { httpsSupport: 'unavailable', type: 'SteamCache' }]
    ])
  }

  it('maps refs, hosts and finalize into the wire shape', () => {
    const finalize = {
      steamappsDir: '/s',
      installdir: 'G',
      name: 'G',
      buildid: '5',
      lastOwner: null,
      allowFullOwnership: true
    }
    const job = buildDepotJob({
      appId: '12345',
      mode: 'install',
      installRoot: '/s/common/G',
      refs,
      hosts,
      finalize
    })
    expect(job.jobId).toMatch(/^[0-9a-f-]{36}$/)
    expect(job.depots.map((d) => d.depotId)).toEqual(['1', '2', '3'])
    for (const d of job.depots) {
      expect(d.key).toMatch(/^[0-9a-f]{64}$/)
      expect(d.fromManifest).toBeNull()
      expect(d.requestCode).toBeNull()
      expect(typeof d.manifestId).toBe('string')
    }
    expect(job.depots[1]?.key).toBe('ab'.repeat(32))
    expect(job.hosts).toEqual([
      {
        host: 'a.example',
        vhost: null,
        kind: 'CDN',
        httpsSupport: 'mandatory',
        useTokenAuth: true,
        weightedLoad: 130
      },
      {
        host: 'b.example',
        vhost: null,
        kind: 'SteamCache',
        httpsSupport: 'unavailable',
        useTokenAuth: false,
        weightedLoad: null
      }
    ])
    expect(job.finalize).toEqual(finalize)
    expect(job.selectPaths).toBeNull()
  })

  it('orders depots by appinfo rank inside each owner group', () => {
    expect(orderRefsForCollisions(refs).map((r) => r.depotId)).toEqual([
      '1',
      '2',
      '3'
    ])
  })
})

describe('progress bridge', () => {
  const ev = (
    seq: number,
    doneBytes: number,
    netBytes: number,
    totalBytes = 1000
  ): RustJobEvent => ({
    jobId: 'j',
    seq,
    kind: 'progress',
    doneBytes,
    netBytes,
    totalBytes,
    filesDone: 0,
    filesTotal: 1,
    host: null,
    elapsedMs: 0
  })

  beforeEach(() => {
    jest.mocked(sendProgressUpdate).mockClear()
    jest.mocked(getFileSize).mockImplementation((n: unknown) => `${String(n)}B`)
  })

  it('emits the downloadFiles payload shape with rolling rates and ETA', () => {
    let t = 10_000
    const bridge = createProgressBridge('777', 'steam', () => t)
    bridge.onEvent({
      jobId: 'j',
      seq: 0,
      kind: 'planned',
      totalBytes: 1000,
      totalFiles: 1,
      depots: []
    })
    bridge.onEvent(ev(1, 0, 0))
    t += 1000
    bridge.onEvent(ev(2, 500 * 1024, 250 * 1024, 1024 * 1024))
    const calls = jest.mocked(sendProgressUpdate).mock.calls.map((c) => c[0])
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual({
      appName: '777',
      runner: 'steam',
      status: 'installing',
      progress: {
        percent: 49,
        bytes: `${500 * 1024}B`,
        downSpeed: 250 / 1024,
        diskSpeed: 500 / 1024,
        eta: '00:00:01'
      }
    })
  })

  it('throttles bursts but re-sends on unchanged counters after the throttle window', () => {
    let t = 0
    const bridge = createProgressBridge('777', 'steam', () => t)
    bridge.onEvent(ev(1, 10, 10, 1_000_000))
    t += 100
    bridge.onEvent(ev(2, 11, 11, 1_000_000))
    expect(sendProgressUpdate).toHaveBeenCalledTimes(1)
    t += 1000
    bridge.onEvent(ev(3, 11, 11, 1_000_000))
    expect(sendProgressUpdate).toHaveBeenCalledTimes(2)
    t += 1000
    bridge.onEvent(ev(4, 11, 11, 1_000_000))
    expect(sendProgressUpdate).toHaveBeenCalledTimes(3)
  })
})
