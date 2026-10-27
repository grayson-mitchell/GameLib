/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/require-await */
/**
 * Quick 261025-rkj: downloadSharedRedistDepots -- the 228980 (Steamworks Common Redistributables)
 * download entry point. No real network: a fake steam-user client, a mocked raw-manifest parser and
 * an injected `downloadFiles` that writes Task 1's verbatim installscript fixtures into a per-test
 * mkdtemp directory under os.tmpdir() (the only path this file ever removes).
 *
 * Mock preamble copied from depot.prescreen.test.ts (proven to load the real depot.ts).
 */
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
import { createHash } from 'crypto'
import { dirname, join, resolve } from 'path'

import { downloadSharedRedistDepots, type DepotPlan } from '../depot'
import { SteamUser } from '../user'
import { mockLeaseOk, mockLeaseRefused, mockOpenLease } from './depotLeaseMocks'
import { decryptFilename } from '../depot/crypto'

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

jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn()
}))

jest.mock('../user')

jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))

jest.mock('../depot/crypto', () => ({
  decryptFilename: jest.fn()
}))

jest.mock('../depot/fileAttributes', () => ({
  applyDepotFileFlags: jest.fn()
}))

jest.mock('steam-user/components/content_manifest.js', () => ({
  parse: jest.fn()
}))

jest.mock('../depot/decompress', () => ({
  fetchChunk: jest.fn(),
  isDecodeStageError: () => false
}))

jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const parser = require('steam-user/components/content_manifest.js') as {
  parse: jest.Mock
}

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
const GID: Record<string, string> = {
  '228990': '9000000000000000001',
  '229004': '9000000000000000002',
  '229007': '9000000000000000003'
}

/** Manifest files per depot id (what content_manifest.parse returns). */
let manifestFiles: Record<string, unknown[]>

const DX_EXE = '_CommonRedist\\DirectX\\Jun2010\\DXSETUP.exe'
/** fakeDownloader writes `size` bytes of 'x' for every non-script file. */
const sha1Of = (text: string) => createHash('sha1').update(text).digest('hex')
const scriptSize = (id: string) => Buffer.byteLength(fx(FIXTURE_FOR[id]))
const FIXTURE_FOR: Record<string, string> = {
  '228990': '228990-directx-jun2010.vdf',
  '229004': '229004-dotnet-4.5.2.vdf'
}

function resetManifests() {
  manifestFiles = {
    '228990': [
      {
        filename: DX_SCRIPT,
        size: scriptSize('228990'),
        flags: 256,
        chunks: []
      },
      {
        filename: DX_EXE,
        size: 90,
        sha_content: sha1Of('x'.repeat(90)),
        flags: 0,
        chunks: []
      }
    ],
    '229004': [
      {
        filename: NET_SCRIPT,
        size: scriptSize('229004'),
        flags: 256,
        chunks: []
      },
      {
        filename:
          '_CommonRedist\\DotNet\\4.5.2\\Microsoft .NET Framework 4.5.2.cmd',
        size: 5,
        flags: 0,
        chunks: []
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
      const id = ids[0]
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
          : cb(null, Buffer.from(`key-${depot}`))
    ),
    getRawManifest: jest.fn(
      (
        _app: number,
        depot: number,
        _gid: string,
        _branch: string,
        cb: (e: Error | null, m?: Buffer) => void
      ) => cb(null, Buffer.from(String(depot)))
    ),
    getContentServers: jest.fn(
      (_app: number, cb: (e: Error | null, s: unknown[]) => void) =>
        cb(null, [{ Host: 'cdn1.example.com' }])
    )
  }
}

type Client = ReturnType<typeof makeClient>
let client: Client
let cacheDir: string

type DownloadFn = NonNullable<
  Parameters<typeof downloadSharedRedistDepots>[1]['downloadFiles']
>

/** Writes fixture text for script files and 'x' for others, like a successful download. */
function fakeDownloader(): jest.MockedFunction<DownloadFn> {
  return jest.fn(async (plan: DepotPlan, o) => {
    for (const f of plan.depots[0].files) {
      const target = resolve(
        o.targetSteamappsDir,
        'common',
        o.installdir,
        f.filename.replace(/\\/g, '/')
      )
      mkdirSync(dirname(target), { recursive: true })
      const isScript = ((f.flags ?? 0) & 256) !== 0
      writeFileSync(
        target,
        isScript ? SCRIPT_TEXT[plan.depots[0].depotId] : 'x'.repeat(f.size)
      )
    }
    return {
      outcome: 'completed' as const,
      failures: [],
      allFilesVerifiedThisRun: true,
      allModesApplied: true
    }
  }) as unknown as jest.MockedFunction<DownloadFn>
}

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
  jest.mocked(SteamUser.getClient).mockReturnValue(client as never)
  mockLeaseOk()
  mockOpenLease()
  jest.mocked(decryptFilename).mockImplementation((raw: unknown) => String(raw))
  parser.parse.mockImplementation((raw: Buffer) => ({
    files: manifestFiles[raw.toString()] ?? []
  }))
})

afterEach(() => {
  // Only ever remove the mkdtemp dir created above.
  if (cacheDir.startsWith(tmpdir()))
    rmSync(cacheDir, { recursive: true, force: true })
})

const callsFor = (dl: { mock: { calls: unknown[][] } }, depotId: string) =>
  dl.mock.calls.filter(
    ([plan]) => (plan as DepotPlan).depots[0].depotId === depotId
  )

describe('downloadSharedRedistDepots', () => {
  const OFFLINE = {
    status: 'offline',
    depots: [],
    failed: [],
    skipped: []
  }

  it('Play time (no allowLogon) with no open session resolves offline and never logs on', async () => {
    jest.mocked(SteamUser.acquireOpenAuthenticated).mockReturnValue(null)
    jest.mocked(SteamUser.getClient).mockClear()
    const dl = fakeDownloader()
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: dl
    })
    expect(r).toEqual(OFFLINE)
    expect(SteamUser.acquireOpenAuthenticated).toHaveBeenCalledWith(
      'shared-redist'
    )
    expect(SteamUser.acquireAuthenticated).not.toHaveBeenCalled()
    expect(SteamUser.getClient).not.toHaveBeenCalled()
    expect(dl).not.toHaveBeenCalled()
  })

  it('Play time with an open session runs on it and releases it once', async () => {
    const releaseOpen = mockOpenLease()
    await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: fakeDownloader()
    })
    expect(SteamUser.acquireAuthenticated).not.toHaveBeenCalled()
    expect(releaseOpen).toHaveBeenCalledTimes(1)
  })

  it('allowLogon: a refused acquire resolves offline', async () => {
    mockLeaseRefused('go-offline-required')
    const dl = fakeDownloader()
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      allowLogon: true,
      downloadFiles: dl
    })
    expect(r).toEqual(OFFLINE)
    expect(SteamUser.acquireOpenAuthenticated).not.toHaveBeenCalled()
    expect(dl).not.toHaveBeenCalled()
  })

  it('allowLogon: acquires a shared-redist install lease and releases it once', async () => {
    const release = mockLeaseOk()
    await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      allowLogon: true,
      downloadFiles: fakeDownloader()
    })
    expect(SteamUser.acquireAuthenticated).toHaveBeenCalledWith({
      reason: 'shared-redist',
      guidedAction: 'install',
      appName: GAME
    })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('allowLogon: releases the lease when a step throws, and the throw propagates', async () => {
    const release = mockLeaseOk()
    jest
      .mocked(client.getProductInfo)
      .mockRejectedValue(new Error('appinfo down'))
    await expect(
      downloadSharedRedistDepots(GAME, {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: [],
        allowLogon: true,
        downloadFiles: fakeDownloader()
      })
    ).rejects.toThrow()
    // Every acquire (the outer lease and each plan-retry lease) is released.
    expect(release.mock.calls.length).toBe(
      jest.mocked(SteamUser.acquireAuthenticated).mock.calls.length
    )
    expect(release).toHaveBeenCalled()
  })

  it("returns 'none' when no 228980 depots are declared and never fetches 228980", async () => {
    gameDepots = {
      '12346': { manifests: {} },
      '230000': { depotfromapp: '1007' }
    }
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: fakeDownloader()
    })
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
    await expect(
      downloadSharedRedistDepots(GAME, {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: [],
        downloadFiles: fakeDownloader()
      })
    ).rejects.toThrow()
  })

  it('downloads DirectX under owner app 228980 and skips .NET (not failed)', async () => {
    const dl = fakeDownloader()
    const onComponent = jest.fn()
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: dl,
      onComponent
    })
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
    expect(r.depots[0].entries[0].name).toBe('dxsetup')

    // Key and manifest requested under the owner app, GID kept as a string.
    expect(client.getDepotDecryptionKey).toHaveBeenCalledWith(
      228980,
      228990,
      expect.any(Function)
    )
    expect(client.getRawManifest).toHaveBeenCalledWith(
      228980,
      228990,
      GID['228990'],
      'public',
      expect.any(Function)
    )
    expect(client.getRawManifest).toHaveBeenCalledWith(
      228980,
      229004,
      GID['229004'],
      'public',
      expect.any(Function)
    )
    // Depots from other shared apps are never touched.
    expect(client.getDepotDecryptionKey).not.toHaveBeenCalledWith(
      expect.anything(),
      230000,
      expect.anything()
    )

    // 228990: script-only download, then the full download. 229004: script only.
    const dx = callsFor(dl, '228990')
    expect(dx).toHaveLength(2)
    const [scriptPlan, scriptOpts] = dx[0] as [
      DepotPlan,
      { installdir: string }
    ]
    expect(scriptPlan.appId).toBe('228980')
    expect(scriptOpts.installdir).toBe('Steamworks Shared')
    expect(scriptPlan.depots[0].files.map((f) => f.filename)).toEqual([
      DX_SCRIPT
    ])
    expect((dx[1][0] as DepotPlan).depots[0].files).toHaveLength(2)
    expect(callsFor(dl, '229004')).toHaveLength(1)
    expect(onComponent).toHaveBeenCalledTimes(1)
    expect(onComponent).toHaveBeenCalledWith('DirectX Jun2010')
    // Written to the shared cache index only after the full download.
    expect(
      JSON.parse(
        readFileSync(join(cacheDir, 'gamelib-shared-redist-index.json'), 'utf8')
      )
    ).toEqual({ '228990': GID['228990'] })
  })

  it('calls onComponent before the full download starts', async () => {
    const dl = fakeDownloader()
    const onComponent = jest.fn()
    await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: dl,
      onComponent
    })
    const fullIdx = dl.mock.calls.findIndex(
      ([plan]) => plan.depots[0].files.length === 2
    )
    expect(onComponent.mock.invocationCallOrder[0]).toBeLessThan(
      dl.mock.invocationCallOrder[fullIdx]
    )
  })

  it('downloads an opted-in declared depot with kind other', async () => {
    const dl = fakeDownloader()
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: ['229004'],
      downloadFiles: dl
    })
    expect(r.skipped).toEqual([])
    expect(r.depots.map((d) => [d.depotId, d.kind, d.label])).toEqual([
      ['228990', 'directx', 'DirectX Jun2010'],
      ['229004', 'other', 'DotNet 4.5.2']
    ])
    expect(callsFor(dl, '229004')).toHaveLength(2)
  })

  it('never fetches an opted-in depot the game does not declare', async () => {
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: ['229007'],
      downloadFiles: fakeDownloader()
    })
    expect(r.depots.map((d) => d.depotId)).toEqual(['228990'])
    expect(client.getDepotDecryptionKey).not.toHaveBeenCalledWith(
      228980,
      229007,
      expect.anything()
    )
  })

  it('files a key failure under failed, continues, and retries cleanly next time', async () => {
    keyErrors.add('228990')
    const first = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: fakeDownloader()
    })
    expect(first.failed).toEqual(['228990'])
    expect(first.skipped).toEqual(['229004'])
    expect(first.depots).toEqual([])

    keyErrors.clear()
    const second = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: fakeDownloader()
    })
    expect(second.failed).toEqual([])
    expect(second.depots.map((d) => d.depotId)).toEqual(['228990'])
  })

  it('files a failed installscript download under failed', async () => {
    const ok = fakeDownloader()
    const dl = jest.fn(async (plan: DepotPlan, o) => {
      if (plan.depots[0].depotId === '228990')
        return {
          outcome: 'completed' as const,
          failures: [{ file: DX_SCRIPT, error: 'boom' }],
          allFilesVerifiedThisRun: false,
          allModesApplied: false
        }
      return ok(plan, o)
    }) as unknown as DownloadFn
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: dl
    })
    expect(r.failed).toEqual(['228990'])
    expect(r.skipped).toEqual(['229004'])
  })

  it('treats a cancelled script download as failed', async () => {
    const dl = jest.fn(async () => ({
      outcome: 'cancelled' as const,
      failures: [],
      allFilesVerifiedThisRun: false,
      allModesApplied: false
    })) as unknown as DownloadFn
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: dl
    })
    expect(r.failed.sort()).toEqual(['228990', '229004'])
    expect(r.depots).toEqual([])
  })

  it('files a failed full download under failed and writes no index', async () => {
    const ok = fakeDownloader()
    const dl = jest.fn(async (plan: DepotPlan, o) => {
      if (plan.depots[0].files.length > 1)
        return {
          outcome: 'completed' as const,
          failures: [{ file: 'x', error: 'boom' }],
          allFilesVerifiedThisRun: false,
          allModesApplied: false
        }
      return ok(plan, o)
    }) as unknown as DownloadFn
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: dl
    })
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
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: fakeDownloader()
    })
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
        flags: 256,
        chunks: []
      }))
      const r = await downloadSharedRedistDepots(GAME, {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: [],
        downloadFiles: fakeDownloader()
      })
      expect(r.skipped.sort()).toEqual(['228990', '229004'])
      expect(r.failed).toEqual([])
    }
  )

  it('skips a depot whose installscript does not parse', async () => {
    SCRIPT_TEXT['229004'] = '"installscript" {'
    try {
      const r = await downloadSharedRedistDepots(GAME, {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: ['229004'],
        downloadFiles: fakeDownloader()
      })
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
      const dl = fakeDownloader()
      const r = await downloadSharedRedistDepots(GAME, {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: [],
        downloadFiles: dl
      })
      const root = resolve(cacheDir, 'common', 'Steamworks Shared')
      expect(r.depots.map((d) => d.installDirHost)).toEqual([root])
      for (const [, o] of dl.mock.calls)
        expect((o as { installdir: string }).installdir).toBe(
          'Steamworks Shared'
        )
    })

    it('keeps a safe installdir from appinfo', async () => {
      redistInstalldir = 'Redist Cache'
      const r = await downloadSharedRedistDepots(GAME, {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: [],
        downloadFiles: fakeDownloader()
      })
      expect(r.depots[0].installDirHost).toBe(
        resolve(cacheDir, 'common', 'Redist Cache')
      )
    })
  })

  describe('concurrent launches sharing the cache (WR-02)', () => {
    /** fakeDownloader that yields mid-write and records per-depot overlap. */
    function slowDownloader(active: Map<string, number>, maxSeen: number[]) {
      const inner = fakeDownloader()
      return jest.fn(async (plan: DepotPlan, o) => {
        const id = plan.depots[0].depotId
        active.set(id, (active.get(id) ?? 0) + 1)
        maxSeen.push(active.get(id)!)
        await new Promise((r) => setTimeout(r, 5))
        try {
          return await inner(plan, o)
        } finally {
          active.set(id, active.get(id)! - 1)
        }
      }) as unknown as jest.MockedFunction<DownloadFn>
    }

    it('never runs two downloads of one depot at once, and the waiter takes the fast path with its own closure', async () => {
      const active = new Map<string, number>()
      const maxSeen: number[] = []
      const dlA = slowDownloader(active, maxSeen)
      const dlB = slowDownloader(active, maxSeen)
      const [a, b] = await Promise.all([
        downloadSharedRedistDepots(GAME, {
          cacheSteamappsDir: cacheDir,
          optInDepotIds: [],
          downloadFiles: dlA
        }),
        downloadSharedRedistDepots('54321', {
          cacheSteamappsDir: cacheDir,
          optInDepotIds: [],
          downloadFiles: dlB
        })
      ])
      expect(Math.max(...maxSeen)).toBe(1)
      expect(a.depots.map((d) => d.depotId)).toEqual(['228990'])
      expect(b.depots.map((d) => d.depotId)).toEqual(['228990'])
      // A downloaded 228990 (script + full); B waited and then hit the index.
      expect(callsFor(dlA, '228990')).toHaveLength(2)
      expect(callsFor(dlB, '228990')).toHaveLength(0)
      // B still ran its OWN closure for the unindexed .NET script.
      expect(callsFor(dlB, '229004')).toHaveLength(1)
    })

    it("uses its own abort signal, not the lock holder's", async () => {
      const active = new Map<string, number>()
      const maxSeen: number[] = []
      const ctlB = new AbortController()
      const inner = slowDownloader(active, maxSeen)
      // B is aborted while A holds 228990's lock; A must finish unaffected.
      const dlA = jest.fn(async (plan: DepotPlan, o) => {
        if (plan.depots[0].depotId === '228990') ctlB.abort()
        return inner(plan, o)
      }) as unknown as jest.MockedFunction<DownloadFn>
      const dlB = slowDownloader(active, maxSeen)
      const [a, b] = await Promise.allSettled([
        downloadSharedRedistDepots(GAME, {
          cacheSteamappsDir: cacheDir,
          optInDepotIds: [],
          downloadFiles: dlA
        }),
        downloadSharedRedistDepots('54321', {
          cacheSteamappsDir: cacheDir,
          optInDepotIds: [],
          downloadFiles: dlB,
          signal: ctlB.signal
        })
      ])
      expect(a.status).toBe('fulfilled')
      if (a.status === 'fulfilled') {
        expect(a.value.failed).toEqual([])
        expect(a.value.depots.map((d) => d.depotId)).toEqual(['228990'])
      }
      // B either rejected in a plan-build step or filed 228990 as failed; never downloaded it.
      if (b.status === 'fulfilled') expect(b.value.failed).toContain('228990')
      expect(callsFor(dlB, '228990')).toHaveLength(0)
    })

    it('keeps both entries when two runs write the index concurrently, atomically', async () => {
      const declaresOnly = (depotId: string) => (ids: number[]) => {
        const id = ids[0]
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
      const active = new Map<string, number>()
      const maxSeen: number[] = []
      await Promise.all([
        downloadSharedRedistDepots('11111', {
          cacheSteamappsDir: cacheDir,
          optInDepotIds: [],
          downloadFiles: slowDownloader(active, maxSeen)
        }),
        downloadSharedRedistDepots('22222', {
          cacheSteamappsDir: cacheDir,
          optInDepotIds: ['229004'],
          downloadFiles: slowDownloader(active, maxSeen)
        })
      ])
      expect(
        JSON.parse(
          readFileSync(
            join(cacheDir, 'gamelib-shared-redist-index.json'),
            'utf8'
          )
        )
      ).toEqual({ '228990': GID['228990'], '229004': GID['229004'] })
      expect(readdirSync(cacheDir).filter((f) => f.endsWith('.tmp'))).toEqual(
        []
      )
    })
  })

  describe('cache index', () => {
    it('does not download again for the same GID, and re-downloads for a changed GID', async () => {
      const opts = {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: [] as string[]
      }
      await downloadSharedRedistDepots(GAME, {
        ...opts,
        downloadFiles: fakeDownloader()
      })

      const dl2 = fakeDownloader()
      const onComponent = jest.fn()
      const r2 = await downloadSharedRedistDepots(GAME, {
        ...opts,
        downloadFiles: dl2,
        onComponent
      })
      expect(r2.depots.map((d) => d.depotId)).toEqual(['228990'])
      expect(callsFor(dl2, '228990')).toHaveLength(0)
      expect(onComponent).not.toHaveBeenCalled()

      redistDepots['228990'] = {
        manifests: { public: { gid: '9000000000000000099' } }
      }
      const dl3 = fakeDownloader()
      const r3 = await downloadSharedRedistDepots(GAME, {
        ...opts,
        downloadFiles: dl3
      })
      expect(callsFor(dl3, '228990')).toHaveLength(2)
      expect(r3.depots[0].gid).toBe('9000000000000000099')
      expect(
        JSON.parse(
          readFileSync(
            join(cacheDir, 'gamelib-shared-redist-index.json'),
            'utf8'
          )
        )['228990']
      ).toBe('9000000000000000099')
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
        const opts = {
          cacheSteamappsDir: cacheDir,
          optInDepotIds: [] as string[]
        }
        await downloadSharedRedistDepots(GAME, {
          ...opts,
          downloadFiles: fakeDownloader()
        })
        const exe = join(
          cacheDir,
          'common',
          'Steamworks Shared',
          ...DX_EXE.split('\\')
        )
        damage(exe)

        const dl = fakeDownloader()
        const onComponent = jest.fn()
        const r = await downloadSharedRedistDepots(GAME, {
          ...opts,
          downloadFiles: dl,
          onComponent
        })
        expect(r.depots.map((d) => d.depotId)).toEqual(['228990'])
        // The cached script is fine, so only the full download re-runs.
        const dx = callsFor(dl, '228990')
        expect(dx).toHaveLength(1)
        expect((dx[0][0] as DepotPlan).depots[0].files).toHaveLength(2)
        expect(onComponent).toHaveBeenCalledWith('DirectX Jun2010')
        expect(readFileSync(exe, 'utf8')).toBe('x'.repeat(90))
        expect(
          JSON.parse(
            readFileSync(
              join(cacheDir, 'gamelib-shared-redist-index.json'),
              'utf8'
            )
          )['228990']
        ).toBe(GID['228990'])
      }
    )

    it('drops the index entry when the repair download fails, so the next run retries', async () => {
      const opts = {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: [] as string[]
      }
      await downloadSharedRedistDepots(GAME, {
        ...opts,
        downloadFiles: fakeDownloader()
      })
      rmSync(
        join(cacheDir, 'common', 'Steamworks Shared', ...DX_EXE.split('\\'))
      )
      const failing = jest.fn(async () => ({
        outcome: 'completed' as const,
        failures: [{ file: 'x', error: 'boom' }],
        allFilesVerifiedThisRun: false,
        allModesApplied: false
      })) as unknown as DownloadFn
      const r = await downloadSharedRedistDepots(GAME, {
        ...opts,
        downloadFiles: failing
      })
      expect(r.failed).toContain('228990')
      expect(
        JSON.parse(
          readFileSync(
            join(cacheDir, 'gamelib-shared-redist-index.json'),
            'utf8'
          )
        )['228990']
      ).toBeUndefined()
    })

    it('re-downloads once when an indexed installscript no longer parses', async () => {
      const opts = {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: [] as string[]
      }
      await downloadSharedRedistDepots(GAME, {
        ...opts,
        downloadFiles: fakeDownloader()
      })
      const scriptPath = join(
        cacheDir,
        'common',
        'Steamworks Shared',
        '_CommonRedist',
        'DirectX',
        'Jun2010',
        'installscript.vdf'
      )
      writeFileSync(scriptPath, 'garbage {')

      const dl = fakeDownloader()
      const r = await downloadSharedRedistDepots(GAME, {
        ...opts,
        downloadFiles: dl
      })
      expect(r.depots.map((d) => d.depotId)).toEqual(['228990'])
      expect(r.failed).toEqual([])
      // Script re-download (index entry dropped) then the full download.
      expect(callsFor(dl, '228990')).toHaveLength(2)
      expect(readFileSync(scriptPath, 'utf8')).toBe(SCRIPT_TEXT['228990'])
    })

    it('gives up on a depot whose re-downloaded script still does not parse', async () => {
      const opts = {
        cacheSteamappsDir: cacheDir,
        optInDepotIds: [] as string[]
      }
      await downloadSharedRedistDepots(GAME, {
        ...opts,
        downloadFiles: fakeDownloader()
      })
      SCRIPT_TEXT['228990'] = 'garbage {'
      try {
        writeFileSync(
          join(
            cacheDir,
            'common',
            'Steamworks Shared',
            '_CommonRedist',
            'DirectX',
            'Jun2010',
            'installscript.vdf'
          ),
          'garbage {'
        )
        const dl = fakeDownloader()
        const r = await downloadSharedRedistDepots(GAME, {
          ...opts,
          downloadFiles: dl
        })
        expect(callsFor(dl, '228990')).toHaveLength(1)
        expect(r.skipped).toContain('228990')
        expect(r.failed).toEqual([])
        expect(
          JSON.parse(
            readFileSync(
              join(cacheDir, 'gamelib-shared-redist-index.json'),
              'utf8'
            )
          )
        ).toEqual({})
      } finally {
        SCRIPT_TEXT['228990'] = fx('228990-directx-jun2010.vdf')
      }
    })
  })
})
