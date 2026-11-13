/**
 * Phase 73 Plan 13 Task 1 (renamed from depotPipelineFlag.test.ts in 73-19, when the D-16 flag
 * was removed): the CM-only plan half, the job builder and the progress bridge.
 */
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { buildDepotRefs } from '../../depot/plan'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { mockLeaseOk } from '../../__tests__/depotLeaseMocks'
import { selectAllDepots } from '../../depot/select'
import { getFileSize, sendProgressUpdate } from 'backend/utils'
import {
  buildDepotJob,
  orderRefsForCollisions,
  toRustDepotRefs
} from '../jobBuilder'
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
    const bridge = createProgressBridge(
      { sendFrontendMessage: jest.fn(), appRuntime: createTestAppRuntime() },
      '777',
      'steam',
      () => t
    )
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
    const calls = jest.mocked(sendProgressUpdate).mock.calls.map((c) => c[1])
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
    const bridge = createProgressBridge(
      { sendFrontendMessage: jest.fn(), appRuntime: createTestAppRuntime() },
      '777',
      'steam',
      () => t
    )
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

describe('delta job inputs (Phase 74)', () => {
  const entry = (depotId: string, gid: string) => ({
    depotId,
    gid,
    key: Buffer.alloc(32, 0xab),
    ownerAppId: '1'
  })
  const hosts = { hosts: [], weightedLoads: new Map(), hostMeta: new Map() }

  it('toRustDepotRefs sends fromManifest only for depots in the map', () => {
    const refs = [entry('333302', '2'), entry('333303', '3')]
    expect(toRustDepotRefs(refs).map((r) => r.fromManifest)).toEqual([
      null,
      null
    ])
    const out = toRustDepotRefs(
      refs,
      new Map([['333302', '1547379086645511101']])
    )
    expect(out.find((r) => r.depotId === '333302')?.fromManifest).toBe(
      '1547379086645511101'
    )
    expect(out.find((r) => r.depotId === '333303')?.fromManifest).toBeNull()
  })

  it('buildDepotJob always emits retiredDepots, carrying the old gid and key', () => {
    const base = {
      appId: '1',
      mode: 'install' as const,
      installRoot: '/x',
      refs: [entry('1', '2')],
      hosts,
      finalize: null
    }
    expect(buildDepotJob(base).retiredDepots).toEqual([])
    const job = buildDepotJob({
      ...base,
      retiredDepots: [entry('9', '999')]
    })
    expect(job.retiredDepots).toEqual([
      {
        depotId: '9',
        manifestId: '999',
        requestCode: null,
        key: 'ab'.repeat(32),
        ownerAppId: '1',
        fromManifest: null
      }
    ])
  })
})

describe('collectBranchDepotList (WR-01)', () => {
  const m = (gid?: string) => (gid ? { manifests: { public: { gid } } } : {})
  it('lists unfiltered branch depots and completeness', async () => {
    const { collectBranchDepotList } = await import('../../depot/plan')
    const base = {
      depots: {
        branches: {},
        '1': m('a'),
        '2': { ...m('b'), config: { language: 'french', oslist: 'linux' } },
        '3': m()
      },
      extended: { listofdlc: '999' }
    }
    const dlc = { '999': { depots: { '4': m('c'), '1': m('z') } } }
    const r = collectBranchDepotList(
      base as never,
      dlc as never,
      'public',
      '10'
    )
    expect(r.branchDepotIds).toEqual(['1', '2', '4'])
    expect(r.fetchedDlcAppIds).toEqual(['999'])
    expect(r.branchDepotListComplete).toBe(true)
    expect(
      collectBranchDepotList(base as never, {}, 'public', '10')
        .branchDepotListComplete
    ).toBe(false)
    expect(
      collectBranchDepotList(
        { depots: { branches: {} } } as never,
        {},
        'public',
        '10'
      ).branchDepotListComplete
    ).toBe(false)
  })

  it('branchManifestGid falls back to public on a beta branch', async () => {
    const { branchManifestGid } = await import('../../depot/select')
    expect(branchManifestGid(m('p') as never, 'beta')).toBe('p')
    expect(branchManifestGid(m() as never, 'public')).toBeUndefined()
  })

  it('logs the public fallback once from branchManifestGid, never from the branch list', async () => {
    const { logInfo } = await import('backend/logger')
    const { collectBranchDepotList } = await import('../../depot/plan')
    const { branchManifestGid } = await import('../../depot/select')
    const base = { depots: { branches: {}, '1': m('a') } }
    jest.mocked(logInfo).mockClear()
    const r = collectBranchDepotList(base as never, {}, 'beta', '10')
    expect(r.branchDepotIds).toEqual(['1'])
    expect(logInfo).not.toHaveBeenCalled()
    branchManifestGid(base.depots['1'] as never, 'beta', '1')
    expect(logInfo).toHaveBeenCalledTimes(1)
  })
})

describe('decideRetirement owner (IN-03)', () => {
  it('owns a retired depot by its DLC app, else the base app', async () => {
    const { decideRetirement } = await import('../retire')
    const r = decideRetirement({
      appId: '10',
      oldGidByDepot: new Map([
        ['1', 'g1'],
        ['2', 'g2']
      ]),
      refs: {
        depots: [],
        skippedDepots: [],
        branchDepotIds: [],
        fetchedDlcAppIds: ['999'],
        branchDepotListComplete: true
      },
      acfDlcOwner: new Map([['2', '999']])
    })
    expect(r.retire).toEqual([
      { depotId: '1', gid: 'g1', ownerAppId: '10' },
      { depotId: '2', gid: 'g2', ownerAppId: '999' }
    ])
  })
})
