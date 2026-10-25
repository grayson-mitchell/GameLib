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
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'

import { downloadSharedRedistDepots, type DepotPlan } from '../depot'
import { SteamUser } from '../user'
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

function resetManifests() {
  manifestFiles = {
    '228990': [
      { filename: DX_SCRIPT, size: 10, flags: 256, chunks: [] },
      {
        filename: '_CommonRedist\\DirectX\\Jun2010\\DXSETUP.exe',
        size: 90,
        flags: 0,
        chunks: []
      }
    ],
    '229004': [
      { filename: NET_SCRIPT, size: 10, flags: 256, chunks: [] },
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

function makeClient() {
  return {
    getProductInfo: jest.fn((ids: number[]) => {
      const id = ids[0]
      if (id === 228980) {
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
        isScript ? SCRIPT_TEXT[plan.depots[0].depotId] : 'x'
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
  jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
  jest.mocked(SteamUser.getClient).mockReturnValue(client as never)
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
  it('resolves offline without touching the client', async () => {
    jest.mocked(SteamUser.ensureConnected).mockResolvedValue(false)
    const dl = fakeDownloader()
    const r = await downloadSharedRedistDepots(GAME, {
      cacheSteamappsDir: cacheDir,
      optInDepotIds: [],
      downloadFiles: dl
    })
    expect(r).toEqual({
      status: 'offline',
      depots: [],
      failed: [],
      skipped: []
    })
    expect(SteamUser.getClient).not.toHaveBeenCalled()
    expect(dl).not.toHaveBeenCalled()
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
