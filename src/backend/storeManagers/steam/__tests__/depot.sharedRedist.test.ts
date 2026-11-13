/* eslint-disable @typescript-eslint/unbound-method */
/**
 * Quick 261025-rkj: downloadSharedRedistDepots -- the 228980 (Steamworks Common Redistributables)
 * download entry point. No real network: a fake steam-user client for the CM half and, since
 * 73-19, the stubbed rustInvoke leaf (stubRustDepot) for everything Rust does: the manifest
 * summary that names each depot's installscript, the select_files / install download jobs (which
 * write Task 1's verbatim installscript fixtures into a per-test mkdtemp directory under
 * os.tmpdir(), the only path this file ever removes) and the verify_only cache check.
 */
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'

const requestRustInvoke = jest.fn()
const depotTransport = {
  requestRustInvoke,
  sendFrontendMessage: jest.fn(),
  appRuntime: createTestAppRuntime()
}
import {
  RUST_DEPOT_MANIFEST_SUMMARY,
  RUST_STEAMFILES_READ_INSTALLSCRIPT
} from 'common/types/sidecarTransport'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import { downloadSharedRedistDepots } from '../depot'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { mockLeaseOk, mockLeaseRefused, mockOpenLease } from './depotLeaseMocks'
import { at, defined } from './fixtures/indexed'
import {
  createStubRustDepot,
  type StubRustDepot
} from '../depotRust/__tests__/fixtures/stubRustDepot'
import type {
  RustDepotJob,
  RustOutcome,
  RustSummarizeRequest
} from '../depotRust/types'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  getRunnerLogWriter: jest.fn().mockReturnValue({}),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn()
}))

jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

const fx = (name: string) =>
  readFileSync(
    join(__dirname, '../bridge/__tests__/fixtures/sharedRedists', name),
    'utf8'
  )

const DX_SCRIPT = '_CommonRedist\\DirectX\\Jun2010\\installscript.vdf'
const NET_SCRIPT = '_CommonRedist\\DotNet\\4.5.2\\installscript.vdf'
const SCRIPT_TEXT: Record<string, string> = {
  '228990': fx('228990-directx-jun2010.vdf'),
  '229004': fx('229004-dotnet-4.5.2.vdf'),
  '229007': fx('229007-dotnet-4.8.vdf')
}
type RecordedEntry = {
  name: string
  hasRunKey?: string
  minimumHasRunValue: number
  processes: { process: string; command?: string }[]
  requirementOs: { is64BitWindows?: string; osType?: string } | null
}
const RECORDED_ENTRIES = JSON.parse(fx('entries.json')) as Record<
  string,
  RecordedEntry[]
>
const FIXTURE_NAME: Record<string, string> = {
  '228990': '228990-directx-jun2010.vdf',
  '229004': '229004-dotnet-4.5.2.vdf',
  '229007': '229007-dotnet-4.8.vdf'
}

/**
 * steamfiles_read_installscript, programmed: a script whose bytes equal a committed fixture answers
 * the entries Rust recorded for it; any other bytes are the "does not parse" null. It parses nothing.
 */
const installScriptStub = stubRustSteamFiles({
  [RUST_STEAMFILES_READ_INSTALLSCRIPT]: ({ path }) => {
    const text = readFileSync(path, 'utf8')
    const id = Object.keys(FIXTURE_NAME).find(
      (k) => fx(FIXTURE_NAME[k]!) === text
    )
    const recorded = id ? RECORDED_ENTRIES[FIXTURE_NAME[id]!] : undefined
    if (!recorded) return { exists: true, entries: null }
    return {
      exists: true,
      entries: recorded.map((e) => ({
        name: e.name,
        hasRunKey: e.hasRunKey ?? null,
        minimumHasRunValue: e.minimumHasRunValue,
        processes: e.processes.map((p) => ({
          process: p.process,
          command: p.command ?? null
        })),
        requirementOs: e.requirementOs
          ? {
              is64BitWindows: e.requirementOs.is64BitWindows ?? null,
              osType: e.requirementOs.osType ?? null
            }
          : null
      }))
    }
  }
})

const GID: Record<string, string> = {
  '228990': '9000000000000000001',
  '229004': '9000000000000000002',
  '229007': '9000000000000000003'
}

interface FakeFile {
  filename: string
  size: number
  flags: number
}

/** The manifest Rust would read, per depot id. */
let manifestFiles: Record<string, FakeFile[]>

const DX_EXE = '_CommonRedist\\DirectX\\Jun2010\\DXSETUP.exe'
const isScript = (f: FakeFile) => (f.flags & 256) !== 0
const scriptSize = (id: string) =>
  Buffer.byteLength(defined(SCRIPT_TEXT[id], `script text for ${id}`))

function resetManifests() {
  manifestFiles = {
    '228990': [
      { filename: DX_SCRIPT, size: scriptSize('228990'), flags: 256 },
      { filename: DX_EXE, size: 90, flags: 0 }
    ],
    '229004': [
      { filename: NET_SCRIPT, size: scriptSize('229004'), flags: 256 },
      {
        filename:
          '_CommonRedist\\DotNet\\4.5.2\\Microsoft .NET Framework 4.5.2.cmd',
        size: 5,
        flags: 0
      }
    ]
  }
}

const GAME = '12345'

let gameDepots: Record<string, unknown>
let redistDepots: Record<string, unknown>
let keyErrors: Set<string>
let redistInstalldir: unknown

function makeClient() {
  return {
    getProductInfo: jest.fn((ids: number[]) => {
      const id = at(ids, 0, 'product id')
      if (id === 228980) {
        return Promise.resolve({
          apps: {
            228980: {
              appinfo: {
                config: { installdir: redistInstalldir },
                depots: redistDepots
              }
            }
          }
        })
      }
      return Promise.resolve({
        apps: { [id]: { appinfo: { depots: gameDepots } } }
      })
    }),
    getDepotDecryptionKey: jest.fn(
      (
        _app: number,
        depot: number,
        cb: (e: Error | null, k?: Buffer) => void
      ) =>
        keyErrors.has(String(depot))
          ? cb(new Error('AccessDenied'))
          : cb(null, Buffer.alloc(32, depot % 250))
    ),
    getContentServers: jest.fn(
      (_app: number, cb: (e: Error | null, s: unknown[]) => void) =>
        cb(null, [{ Host: 'cdn1.example.com' }])
    ),
    getManifestRequestCode: jest.fn().mockResolvedValue({ requestCode: '42' })
  }
}

type Client = ReturnType<typeof makeClient>
let client: Client
let cacheDir: string

// ── The Rust leaf ────────────────────────────────────────────────────────────
let rust: StubRustDepot
/** Per-test override of a job's outcome (a failed or cancelled download). */
let failJob: ((job: RustDepotJob) => Partial<RustOutcome> | undefined) | null
/** Runs inside a download job before it writes, e.g. a delay or an abort. */
let beforeWrite: ((job: RustDepotJob) => Promise<void> | void) | null
/** Concurrent download jobs per depot, and every count seen at a job's start. */
let active: Map<string, number>
let maxSeen: number[]

const depotOf = (job: RustDepotJob) => at(job.depots, 0, 'job depot').depotId
const filesOf = (depotId: string) => manifestFiles[depotId] ?? []
const pathIn = (root: string, filename: string) =>
  join(root, ...filename.split('\\'))
const contentOf = (depotId: string, f: FakeFile) =>
  isScript(f)
    ? defined(SCRIPT_TEXT[depotId], `script text for ${depotId}`)
    : 'x'.repeat(f.size)

function makeRust(): StubRustDepot {
  return createStubRustDepot({
    outcome: { acf: null },
    summaryFor: (req: RustSummarizeRequest) => ({
      depots: req.depots.map((d) => ({
        depotId: d.depotId,
        fileCount: filesOf(d.depotId).length,
        totalBytes: 0,
        matches: [],
        installscripts: filesOf(d.depotId)
          .filter(isScript)
          .map((f) => f.filename)
      })),
      skippedDepots: []
    }),
    onRun: async (job) => {
      if (job.mode === 'verify_only') return
      const id = depotOf(job)
      active.set(id, (active.get(id) ?? 0) + 1)
      maxSeen.push(defined(active.get(id), 'active count'))
      try {
        await beforeWrite?.(job)
        if (failJob?.(job)) return
        const wanted = job.selectPaths ? new Set(job.selectPaths) : null
        for (const f of filesOf(id)) {
          if (wanted && !wanted.has(f.filename)) continue
          const target = pathIn(job.installRoot, f.filename)
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, contentOf(id, f))
        }
      } finally {
        active.set(id, defined(active.get(id), 'active count') - 1)
      }
    },
    outcomeFor: (job) => {
      const failed = failJob?.(job)
      if (failed) return failed
      if (job.mode !== 'verify_only') return {}
      // Rust's verify_only: every file sha1-checked, the bad ones reported, nothing written.
      const id = depotOf(job)
      return {
        missing: filesOf(id)
          .filter((f) => {
            const p = pathIn(job.installRoot, f.filename)
            return (
              !existsSync(p) || readFileSync(p, 'utf8') !== contentOf(id, f)
            )
          })
          .map((f) => f.filename.replace(/\\/g, '/').toLowerCase())
      }
    }
  })
}

/** Download jobs (install or select_files) for one depot; verify_only is not a download. */
const downloadsFor = (depotId: string) =>
  rust.jobs.filter((j) => depotOf(j) === depotId && j.mode !== 'verify_only')
const verifiesFor = (depotId: string) =>
  rust.jobs.filter((j) => depotOf(j) === depotId && j.mode === 'verify_only')
const summaryCalls = () =>
  rust.calls
    .filter((c) => c.channel === RUST_DEPOT_MANIFEST_SUMMARY)
    .map((c) => at(c.args, 0) as RustSummarizeRequest)

beforeEach(() => {
  resetManifests()
  keyErrors = new Set()
  redistInstalldir = 'Steamworks Shared'
  gameDepots = {
    '12346': { manifests: { public: { gid: '1' } } },
    '228990': { depotfromapp: '228980', sharedinstall: '1' },
    '229004': { depotfromapp: 228980 },
    '230000': { depotfromapp: '1007' }
  }
  redistDepots = {
    '228990': { manifests: { public: { gid: GID['228990'], size: 100 } } },
    '229004': { manifests: { public: GID['229004'] } },
    '229007': { manifests: { public: { gid: GID['229007'] } } }
  }
  cacheDir = mkdtempSync(join(tmpdir(), 'rkj-depot-'))
  client = makeClient()
  jest.mocked(steamUser.getClient).mockReturnValue(client as never)
  mockLeaseOk(steamUser)
  mockOpenLease(steamUser)
  failJob = null
  beforeWrite = null
  active = new Map()
  maxSeen = []
  rust = makeRust()
  jest.mocked(requestRustInvoke).mockImplementation(rust.invoke)
})

afterEach(() => {
  // Only ever remove the mkdtemp dir created above.
  if (cacheDir.startsWith(tmpdir()))
    rmSync(cacheDir, { recursive: true, force: true })
})

const tick = () => new Promise<void>((r) => setTimeout(r, 5))

describe('downloadSharedRedistDepots', () => {
  const OFFLINE = {
    status: 'offline',
    depots: [],
    failed: [],
    skipped: []
  }
  // One runtime per test: concurrent runs in a test share the boot's lock table, as in production.
  let installRuntime = createTestSteamInstallRuntime(depotTransport)
  beforeEach(() => {
    installRuntime = createTestSteamInstallRuntime(depotTransport)
  })
  const run = (
    appId = GAME,
    extra: Partial<Parameters<typeof downloadSharedRedistDepots>[1]> = {}
  ) =>
    downloadSharedRedistDepots(appId, {
      installRuntime,
      steamUser,
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      rust: {
        requestRustInvoke: installScriptStub.requestRustInvoke as never
      },
      ...extra
    })
  const readIndex = () =>
    JSON.parse(
      readFileSync(join(cacheDir, 'gamelib-shared-redist-index.json'), 'utf8')
    ) as Record<string, string>

  it('Play time (no allowLogon) with no open session resolves offline and never logs on', async () => {
    jest.mocked(steamUser.acquireOpenAuthenticated).mockReturnValue(null)
    jest.mocked(steamUser.getClient).mockClear()
    const r = await run()
    expect(r).toEqual(OFFLINE)
    expect(steamUser.acquireOpenAuthenticated).toHaveBeenCalledWith(
      'shared-redist'
    )
    expect(steamUser.acquireAuthenticated).not.toHaveBeenCalled()
    expect(steamUser.getClient).not.toHaveBeenCalled()
    expect(requestRustInvoke).not.toHaveBeenCalled()
  })

  it('Play time with an open session runs on it and releases it once', async () => {
    const releaseOpen = mockOpenLease(steamUser)
    await run()
    expect(steamUser.acquireAuthenticated).not.toHaveBeenCalled()
    expect(releaseOpen).toHaveBeenCalledTimes(1)
  })

  it('allowLogon: a refused acquire resolves offline', async () => {
    mockLeaseRefused(steamUser, 'go-offline-required')
    const r = await run(GAME, { allowLogon: true })
    expect(r).toEqual(OFFLINE)
    expect(steamUser.acquireOpenAuthenticated).not.toHaveBeenCalled()
    expect(requestRustInvoke).not.toHaveBeenCalled()
  })

  it('allowLogon: acquires a shared-redist install lease and releases it once', async () => {
    const release = mockLeaseOk(steamUser)
    await run(GAME, { allowLogon: true })
    expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith({
      reason: 'shared-redist',
      guidedAction: 'install',
      appName: GAME
    })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('allowLogon: releases the lease when a step throws, and the throw propagates', async () => {
    const release = mockLeaseOk(steamUser)
    jest
      .mocked(client.getProductInfo)
      .mockRejectedValue(new Error('appinfo down'))
    await expect(run(GAME, { allowLogon: true })).rejects.toThrow()
    // Every acquire (the outer lease and each plan-retry lease) is released.
    expect(release.mock.calls.length).toBe(
      jest.mocked(steamUser.acquireAuthenticated).mock.calls.length
    )
    expect(release).toHaveBeenCalled()
  })

  it("returns 'none' when no 228980 depots are declared and never fetches 228980", async () => {
    gameDepots = {
      '12346': { manifests: {} },
      '230000': { depotfromapp: '1007' }
    }
    const r = await run()
    expect(r).toEqual({ status: 'none', depots: [], failed: [], skipped: [] })
    expect(client.getProductInfo).toHaveBeenCalledTimes(1)
    expect(client.getProductInfo).not.toHaveBeenCalledWith(
      [228980],
      expect.anything(),
      expect.anything()
    )
    expect(client.getDepotDecryptionKey).not.toHaveBeenCalled()
  })

  it('propagates a throw from the appinfo fetch', async () => {
    client.getProductInfo.mockRejectedValue(new Error('PICS down'))
    await expect(run()).rejects.toThrow()
  })

  it('downloads DirectX under owner app 228980 and skips .NET (not failed)', async () => {
    const onComponent = jest.fn()
    const r = await run(GAME, { onComponent })
    expect(r.status).toBe('ok')
    expect(r.failed).toEqual([])
    expect(r.skipped).toEqual(['229004'])
    expect(r.depots).toHaveLength(1)
    expect(r.depots[0]).toMatchObject({
      depotId: '228990',
      gid: GID['228990'],
      kind: 'directx',
      label: 'DirectX Jun2010',
      installDirHost: resolve(cacheDir, 'common', 'Steamworks Shared')
    })
    expect(at(at(r.depots, 0).entries, 0).name).toBe('dxsetup')

    // Key requested under the owner app; the manifest is Rust's (D-01), asked for under the
    // owner app with the GID kept as a string.
    expect(client.getDepotDecryptionKey).toHaveBeenCalledWith(
      228980,
      228990,
      expect.any(Function)
    )
    expect(
      summaryCalls().map((req) => [
        req.appId,
        at(req.depots, 0).depotId,
        at(req.depots, 0).manifestId,
        at(req.depots, 0).ownerAppId
      ])
    ).toEqual([
      ['228980', '228990', GID['228990'], '228980'],
      ['228980', '229004', GID['229004'], '228980']
    ])
    // Depots from other shared apps are never touched.
    expect(client.getDepotDecryptionKey).not.toHaveBeenCalledWith(
      expect.anything(),
      230000,
      expect.anything()
    )

    // 228990: script-only select_files job, then the full install job. 229004: script only.
    const dx = downloadsFor('228990')
    expect(dx.map((j) => j.mode)).toEqual(['select_files', 'install'])
    for (const j of rust.jobs) {
      expect(j.appId).toBe('228980')
      expect(j.finalize).toBeNull()
      expect(j.installRoot).toBe(join(cacheDir, 'common', 'Steamworks Shared'))
    }
    expect(at(dx, 0).selectPaths).toEqual([DX_SCRIPT])
    expect(at(dx, 1).selectPaths).toBeNull()
    expect(downloadsFor('229004').map((j) => j.mode)).toEqual(['select_files'])
    expect(onComponent).toHaveBeenCalledTimes(1)
    expect(onComponent).toHaveBeenCalledWith('DirectX Jun2010')
    // Written to the shared cache index only after the full download.
    expect(readIndex()).toEqual({ '228990': GID['228990'] })
  })

  it('calls onComponent before the full download starts', async () => {
    const onComponent = jest.fn()
    let fullStartedAfterComponent: boolean | undefined
    beforeWrite = (job) => {
      if (job.mode === 'install')
        fullStartedAfterComponent = onComponent.mock.calls.length === 1
    }
    await run(GAME, { onComponent })
    expect(fullStartedAfterComponent).toBe(true)
  })

  it('downloads an opted-in declared depot with kind other', async () => {
    const r = await run(GAME, { optInDepotIds: ['229004'] })
    expect(r.skipped).toEqual([])
    expect(r.depots.map((d) => [d.depotId, d.kind, d.label])).toEqual([
      ['228990', 'directx', 'DirectX Jun2010'],
      ['229004', 'other', 'DotNet 4.5.2']
    ])
    expect(downloadsFor('229004')).toHaveLength(2)
  })

  it('never fetches an opted-in depot the game does not declare', async () => {
    const r = await run(GAME, { optInDepotIds: ['229007'] })
    expect(r.depots.map((d) => d.depotId)).toEqual(['228990'])
    expect(client.getDepotDecryptionKey).not.toHaveBeenCalledWith(
      228980,
      229007,
      expect.anything()
    )
  })

  it('files a key failure under failed, continues, and retries cleanly next time', async () => {
    keyErrors.add('228990')
    const first = await run()
    expect(first.failed).toEqual(['228990'])
    expect(first.skipped).toEqual(['229004'])
    expect(first.depots).toEqual([])

    keyErrors.clear()
    const second = await run()
    expect(second.failed).toEqual([])
    expect(second.depots.map((d) => d.depotId)).toEqual(['228990'])
  })

  it('files a depot under failed when its manifest summary fails (73-19)', async () => {
    const base = makeRust()
    requestRustInvoke.mockImplementation(
      (channel: string, args: Array<{ depots: Array<{ depotId: string }> }>) =>
        channel === RUST_DEPOT_MANIFEST_SUMMARY &&
        at(at(args, 0).depots, 0).depotId === '228990'
          ? Promise.resolve({
              error: {
                file: null,
                kind: 'manifest_unavailable',
                message: 'Blocked',
                code: null,
                eresult: 40,
                httpStatus: null,
                scope: null,
                msSinceProgress: null
              }
            })
          : base.invoke(channel, args)
    )
    rust = base
    const r = await run()
    expect(r.failed).toEqual(['228990'])
    expect(r.skipped).toEqual(['229004'])
    expect(downloadsFor('228990')).toHaveLength(0)
  })

  it('files a failed installscript download under failed', async () => {
    failJob = (job) =>
      depotOf(job) === '228990' ? { status: 'error' } : undefined
    const r = await run()
    expect(r.failed).toEqual(['228990'])
    expect(r.skipped).toEqual(['229004'])
  })

  it('treats a cancelled script download as failed', async () => {
    failJob = () => ({ status: 'cancelled' })
    const r = await run()
    expect(r.failed.sort()).toEqual(['228990', '229004'])
    expect(r.depots).toEqual([])
  })

  it('files a failed full download under failed and writes no index', async () => {
    failJob = (job) =>
      job.mode === 'install' ? { status: 'error' } : undefined
    const r = await run()
    expect(r.failed).toEqual(['228990'])
    expect(r.depots).toEqual([])
    expect(existsSync(join(cacheDir, 'gamelib-shared-redist-index.json'))).toBe(
      false
    )
  })

  it('files a depot with no public GID under failed', async () => {
    redistDepots = {
      '228990': { manifests: { beta: 'abc' } },
      '229004': { manifests: { public: GID['229004'] } }
    }
    const r = await run()
    expect(r.failed).toEqual(['228990'])
    expect(r.skipped).toEqual(['229004'])
  })

  it.each([
    ['zero', 0],
    ['two', 2]
  ])(
    'skips a depot whose manifest has %s flag-256 files',
    async (_n, count) => {
      manifestFiles['228990'] = Array.from({ length: count }, (_v, i) => ({
        filename: `_CommonRedist\\DirectX\\Jun2010\\s${i}.vdf`,
        size: 1,
        flags: 256
      }))
      const r = await run()
      expect(r.skipped.sort()).toEqual(['228990', '229004'])
      expect(r.failed).toEqual([])
    }
  )

  it('skips a depot whose installscript does not parse', async () => {
    SCRIPT_TEXT['229004'] = '"installscript" {'
    try {
      const r = await run(GAME, { optInDepotIds: ['229004'] })
      expect(r.skipped).toEqual(['229004'])
      expect(r.depots.map((d) => d.depotId)).toEqual(['228990'])
    } finally {
      SCRIPT_TEXT['229004'] = fx('229004-dotnet-4.5.2.vdf')
    }
  })

  describe('228980 installdir (WR-03)', () => {
    it.each([
      ['a traversal', '../../escape'],
      ['an absolute path', '/etc'],
      ['a separator', 'a\\b'],
      ['a quote', 'Steam"works'],
      ['a cmd metacharacter', 'Steam & works'],
      ['a percent', '%TEMP%'],
      ['blank', '   '],
      ['a non-string', 42]
    ])('falls back to Steamworks Shared for %s', async (_what, value) => {
      redistInstalldir = value
      const r = await run()
      const root = resolve(cacheDir, 'common', 'Steamworks Shared')
      expect(r.depots.map((d) => d.installDirHost)).toEqual([root])
      expect(rust.jobs.length).toBeGreaterThan(0)
      for (const j of rust.jobs) expect(j.installRoot).toBe(root)
    })

    it('keeps a safe installdir from appinfo', async () => {
      redistInstalldir = 'Redist Cache'
      const r = await run()
      expect(at(r.depots, 0).installDirHost).toBe(
        resolve(cacheDir, 'common', 'Redist Cache')
      )
    })
  })

  describe('concurrent launches sharing the cache (WR-02)', () => {
    it('never runs two downloads of one depot at once, and the waiter takes the fast path', async () => {
      beforeWrite = tick
      const [a, b] = await Promise.all([run(GAME), run('54321')])
      expect(Math.max(...maxSeen)).toBe(1)
      expect(a.depots.map((d) => d.depotId)).toEqual(['228990'])
      expect(b.depots.map((d) => d.depotId)).toEqual(['228990'])
      // One run downloaded 228990 (script + full); the other waited, then verified the indexed
      // copy instead of downloading it.
      expect(downloadsFor('228990').map((j) => j.mode)).toEqual([
        'select_files',
        'install'
      ])
      expect(verifiesFor('228990')).toHaveLength(1)
      // Each run still ran its OWN closure for the unindexed .NET script.
      expect(downloadsFor('229004')).toHaveLength(2)
    })

    it("uses its own abort signal, not the lock holder's", async () => {
      const ctlB = new AbortController()
      // B is aborted while A holds 228990's lock; A must finish unaffected.
      beforeWrite = async (job) => {
        if (depotOf(job) === '228990') ctlB.abort()
        await tick()
      }
      const [a, b] = await Promise.allSettled([
        run(GAME),
        run('54321', { signal: ctlB.signal })
      ])
      expect(a.status).toBe('fulfilled')
      if (a.status === 'fulfilled') {
        expect(a.value.failed).toEqual([])
        expect(a.value.depots.map((d) => d.depotId)).toEqual(['228990'])
      }
      // B either rejected in a plan-build step or filed 228990 as failed; never downloaded it.
      if (b.status === 'fulfilled') expect(b.value.failed).toContain('228990')
      expect(downloadsFor('228990')).toHaveLength(2)
      expect(verifiesFor('228990')).toHaveLength(0)
    })

    it('keeps both entries when two runs write the index concurrently, atomically', async () => {
      const declaresOnly = (depotId: string) => (ids: number[]) => {
        const id = at(ids, 0, 'product id')
        if (id === 228980)
          return Promise.resolve({
            apps: {
              228980: {
                appinfo: {
                  config: { installdir: 'Steamworks Shared' },
                  depots: redistDepots
                }
              }
            }
          })
        return Promise.resolve({
          apps: {
            [id]: {
              appinfo: {
                depots: { [depotId]: { depotfromapp: '228980' } }
              }
            }
          }
        })
      }
      client.getProductInfo.mockImplementation((ids: number[]) =>
        declaresOnly(ids[0] === 11111 ? '228990' : '229004')(ids)
      )
      beforeWrite = tick
      await Promise.all([
        run('11111'),
        run('22222', { optInDepotIds: ['229004'] })
      ])
      expect(readIndex()).toEqual({
        '228990': GID['228990'],
        '229004': GID['229004']
      })
      expect(readdirSync(cacheDir).filter((f) => f.endsWith('.tmp'))).toEqual(
        []
      )
    })
  })

  describe('cache index', () => {
    it('does not download again for the same GID, and re-downloads for a changed GID', async () => {
      await run()

      rust.jobs.length = 0
      const onComponent = jest.fn()
      const r2 = await run(GAME, { onComponent })
      expect(r2.depots.map((d) => d.depotId)).toEqual(['228990'])
      expect(downloadsFor('228990')).toHaveLength(0)
      expect(verifiesFor('228990')).toHaveLength(1)
      expect(onComponent).not.toHaveBeenCalled()

      redistDepots['228990'] = {
        manifests: { public: { gid: '9000000000000000099' } }
      }
      rust.jobs.length = 0
      const r3 = await run()
      expect(downloadsFor('228990')).toHaveLength(2)
      expect(at(r3.depots, 0).gid).toBe('9000000000000000099')
      expect(readIndex()['228990']).toBe('9000000000000000099')
    })

    it.each([
      ['deleted', (p: string) => rmSync(p)],
      ['truncated', (p: string) => writeFileSync(p, 'x'.repeat(10))],
      [
        'corrupted at the same size',
        (p: string) => writeFileSync(p, 'y'.repeat(90))
      ]
    ])(
      'repairs the cache when an indexed installer file is %s (WR-05)',
      async (_what, damage) => {
        await run()
        const exe = pathIn(
          join(cacheDir, 'common', 'Steamworks Shared'),
          DX_EXE
        )
        damage(exe)

        rust.jobs.length = 0
        const onComponent = jest.fn()
        const r = await run(GAME, { onComponent })
        expect(r.depots.map((d) => d.depotId)).toEqual(['228990'])
        // The cached script is fine, so after the verify only the full download re-runs.
        expect(verifiesFor('228990')).toHaveLength(1)
        expect(downloadsFor('228990').map((j) => j.mode)).toEqual(['install'])
        expect(onComponent).toHaveBeenCalledWith('DirectX Jun2010')
        expect(readFileSync(exe, 'utf8')).toBe('x'.repeat(90))
        expect(readIndex()['228990']).toBe(GID['228990'])
      }
    )

    it('repairs the cache when the verify job itself fails', async () => {
      await run()
      rust.jobs.length = 0
      failJob = (job) =>
        job.mode === 'verify_only' ? { status: 'error' } : undefined
      const r = await run()
      expect(r.depots.map((d) => d.depotId)).toEqual(['228990'])
      expect(downloadsFor('228990').map((j) => j.mode)).toEqual(['install'])
    })

    it('drops the index entry when the repair download fails, so the next run retries', async () => {
      await run()
      rmSync(pathIn(join(cacheDir, 'common', 'Steamworks Shared'), DX_EXE))
      failJob = (job) =>
        job.mode === 'install' ? { status: 'error' } : undefined
      const r = await run()
      expect(r.failed).toContain('228990')
      expect(readIndex()['228990']).toBeUndefined()
    })

    it('re-downloads once when an indexed installscript no longer parses', async () => {
      await run()
      const scriptPath = pathIn(
        join(cacheDir, 'common', 'Steamworks Shared'),
        DX_SCRIPT
      )
      writeFileSync(scriptPath, 'garbage {')

      rust.jobs.length = 0
      const r = await run()
      expect(r.depots.map((d) => d.depotId)).toEqual(['228990'])
      expect(r.failed).toEqual([])
      // Script re-download (index entry dropped) then the full download.
      expect(downloadsFor('228990').map((j) => j.mode)).toEqual([
        'select_files',
        'install'
      ])
      expect(readFileSync(scriptPath, 'utf8')).toBe(SCRIPT_TEXT['228990'])
    })

    it('gives up on a depot whose re-downloaded script still does not parse', async () => {
      await run()
      SCRIPT_TEXT['228990'] = 'garbage {'
      try {
        writeFileSync(
          pathIn(join(cacheDir, 'common', 'Steamworks Shared'), DX_SCRIPT),
          'garbage {'
        )
        rust.jobs.length = 0
        const r = await run()
        expect(downloadsFor('228990')).toHaveLength(1)
        expect(r.skipped).toContain('228990')
        expect(r.failed).toEqual([])
        expect(readIndex()).toEqual({})
      } finally {
        SCRIPT_TEXT['228990'] = fx('228990-directx-jun2010.vdf')
      }
    })
  })
})
