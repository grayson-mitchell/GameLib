/**
 * D-51-06 (Phase 51 Plan 17): the cheap pre-install screen ROADMAP
 * sub-decision 2 left open. `screenDepotPlanForSteamApi` is a pure,
 * side-effect-free classifier over an already-built `DepotPlan`'s file
 * list; `prescreenBridgeDepots` is the guarded wrapper that builds a SECOND
 * plan (PICS + manifest only, never chunk bytes) purely to run that
 * classifier before any routing/download decision, and never throws --
 * every failure mode (no CM connection, PICS error, an aborted signal)
 * resolves 'unknown' so a screen failure can never block an install.
 *
 * Mock strategy mirrors depot.test.ts's top-of-file setup (the minimal set
 * proven sufficient to load the real depot.ts module without pulling in its
 * heavier transitive dependencies): backend/logger (factory form), '../user'
 * (auto-mocked), '../depot/select' (selectAllDepots mocked, dlcAppIds real),
 * '../depot/crypto', steam-user's raw manifest parser, '../depot/decompress'
 * (fetchChunk -- spied on here to prove the no-download invariant),
 * 'backend/utils', '../../../ipc', and i18next (depotErrors.ts's own
 * transitive dependency).
 */
import {
  screenDepotPlanForSteamApi,
  prescreenBridgeDepots,
  type DepotPlanFile
} from '../depot'
import { SteamUser } from '../user'
import { mockLeaseOk, mockLeaseRefused } from './depotLeaseMocks'
import { selectAllDepots } from '../depot/select'
import { decryptFilename } from '../depot/crypto'
import { fetchChunk } from '../depot/decompress'

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

// ── backend/utils mock — provides getFileSize()/sendProgressUpdate() ─────────
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn()
}))

// ── SteamUser mock — controls acquireAuthenticated()/getClient() return values ────
jest.mock('../user')

// ── depot/select mock — selectAllDepots is a jest.fn(); dlcAppIds stays real ─
jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))

// ── depot/crypto mock — decryptFilename fully controlled by tests ────────────
jest.mock('../depot/crypto', () => ({
  decryptFilename: jest.fn()
}))

// ── depot/fileAttributes mock — never exercised by buildDepotPlan, present
//    only so the real module (which does real fs chmod work) is never loaded.
jest.mock('../depot/fileAttributes', () => ({
  applyDepotFileFlags: jest.fn()
}))

// ── steam-user's undocumented raw-manifest parser (Pitfall 5) ────────────────
jest.mock('steam-user/components/content_manifest.js', () => ({
  parse: jest.fn()
}))

// ── depot/decompress mock — fetchChunk is the ONLY network-dependent piece of
//    the chunk-download path; a spy on it proves prescreenBridgeDepots (which
//    only ever calls buildDepotPlan, the "PLAN-BUILDING half") never reaches
//    it (T-51-38's no-chunk-bytes prohibition).
jest.mock('../depot/decompress', () => ({
  fetchChunk: jest.fn(),
  isDecodeStageError: () => false
}))

// ── backend/ipc mock ───────────────────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── i18next mock — depotErrors.ts's own transitive dependency ────────────────
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

const APP_ID = '12345'
const BASE_OPTS = {
  targetSteamappsDir: '/tmp/steamapps',
  installdir: 'SomeGame',
  os: 'macos'
}

function makeFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    licenses: [] as Array<{ package_id: number }>,
    steamID: { getSteamID64: jest.fn().mockReturnValue('76561198012345678') },
    getProductInfo: jest.fn().mockResolvedValue({
      apps: { 12345: { appinfo: { depots: {}, extended: {} } } },
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
    ...overrides
  }
}

function makeDepotFile(filename: string): DepotPlanFile {
  return { filename, size: 0, sha_content: '', chunks: [] }
}

/** Wires the PICS/manifest-fetch plumbing a successful buildDepotPlan needs —
 *  a single owned depot, single file, mirroring depot.test.ts's own
 *  setupPlanPlumbing helper. The returned file list is whatever
 *  `content_manifest.parse` is configured to return per-test. */
function setupPlanPlumbing(fakeClient: ReturnType<typeof makeFakeClient>) {
  mockLeaseOk()
  jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
  jest
    .mocked(selectAllDepots)
    .mockReturnValue([
      { id: '111', manifest: '11111111111111111', size: 0, ownerAppId: APP_ID }
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
  jest.mocked(decryptFilename).mockImplementation((raw: unknown) => String(raw))
}

describe('screenDepotPlanForSteamApi — pure file-list classifier', () => {
  it("classifies ['bin/Game.exe','bin/steam_api.dll'] as 'x86'", () => {
    const result = screenDepotPlanForSteamApi({
      depots: [
        {
          depotId: '1',
          gid: '1',
          key: Buffer.alloc(0),
          files: ['bin/Game.exe', 'bin/steam_api.dll'].map(makeDepotFile)
        }
      ]
    })
    expect(result).toBe('x86')
  })

  it("classifies ['system/STEAM_API64.DLL'] as 'x64' (case-insensitive basename, any directory)", () => {
    const result = screenDepotPlanForSteamApi({
      depots: [
        {
          depotId: '1',
          gid: '1',
          key: Buffer.alloc(0),
          files: ['system/STEAM_API64.DLL'].map(makeDepotFile)
        }
      ]
    })
    expect(result).toBe('x64')
  })

  it("classifies both steam_api.dll and steam_api64.dll present (even across different depots) as 'both'", () => {
    const result = screenDepotPlanForSteamApi({
      depots: [
        {
          depotId: '1',
          gid: '1',
          key: Buffer.alloc(0),
          files: ['bin/steam_api.dll'].map(makeDepotFile)
        },
        {
          depotId: '2',
          gid: '2',
          key: Buffer.alloc(0),
          files: ['bin64/steam_api64.dll'].map(makeDepotFile)
        }
      ]
    })
    expect(result).toBe('both')
  })

  it("classifies neither present as 'none'", () => {
    const result = screenDepotPlanForSteamApi({
      depots: [
        {
          depotId: '1',
          gid: '1',
          key: Buffer.alloc(0),
          files: ['bin/Game.exe', 'data/assets.pak'].map(makeDepotFile)
        }
      ]
    })
    expect(result).toBe('none')
  })

  it("a file named 'steam_api.dll.bak' is NOT counted (exact basename match only)", () => {
    const result = screenDepotPlanForSteamApi({
      depots: [
        {
          depotId: '1',
          gid: '1',
          key: Buffer.alloc(0),
          files: ['backup/steam_api.dll.bak'].map(makeDepotFile)
        }
      ]
    })
    expect(result).toBe('none')
  })

  it('an empty depots array classifies as none', () => {
    expect(screenDepotPlanForSteamApi({ depots: [] })).toBe('none')
  })

  describe('Windows-separator depot filenames (real manifests use backslashes)', () => {
    const screen = (files: string[]) =>
      screenDepotPlanForSteamApi({
        depots: [
          {
            depotId: '1',
            gid: '1',
            key: Buffer.alloc(0),
            files: files.map(makeDepotFile)
          }
        ]
      })

    it("ELEX system\\steam_api64.dll -> 'x64'", () => {
      expect(screen(['system\\steam_api64.dll', 'system\\ELEX.exe'])).toBe(
        'x64'
      )
    })
    it("XCOM Binaries\\Win32\\steam_api.dll -> 'x86'", () => {
      expect(screen(['Binaries\\Win32\\steam_api.dll'])).toBe('x86')
    })
    it("Hoard win32\\ + win64\\ -> 'both'", () => {
      expect(screen(['win32\\steam_api.dll', 'win64\\steam_api64.dll'])).toBe(
        'both'
      )
    })
    it("backup\\steam_api.dll.bak -> 'none'", () => {
      expect(screen(['backup\\steam_api.dll.bak'])).toBe('none')
    })
    it("root STEAM_API.DLL -> 'x86'", () => {
      expect(screen(['STEAM_API.DLL'])).toBe('x86')
    })
  })
})

describe('prescreenBridgeDepots — guarded second plan-build, never throws', () => {
  it("resolves 'unknown' (never rejects) when buildDepotPlan throws because there is no CM connection", async () => {
    mockLeaseRefused()

    const result = await prescreenBridgeDepots(APP_ID, BASE_OPTS)

    expect(result).toBe('unknown')
  })

  it("resolves 'unknown' (never rejects) when the abort signal is already fired", async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await prescreenBridgeDepots(APP_ID, {
      ...BASE_OPTS,
      signal: controller.signal
    })

    expect(result).toBe('unknown')
    // Aborted before even the connection check — ensureConnected is never
    // reached (mirrors buildDepotPlan's own already-aborted test in
    // depot.test.ts).
    expect(jest.mocked(SteamUser.acquireAuthenticated)).not.toHaveBeenCalled()
  })

  it("acquires its lease with reason 'prescreen' and still resolves a result", async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)
    jest.mocked(selectAllDepots).mockReturnValue([])

    await prescreenBridgeDepots(APP_ID, BASE_OPTS)

    expect(jest.mocked(SteamUser.acquireAuthenticated)).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'prescreen' })
    )
  })

  it("forwards os 'windows' to buildDepotPlan's depot selection regardless of the caller's own opts.os", async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)
    jest.mocked(selectAllDepots).mockReturnValue([])

    await prescreenBridgeDepots(APP_ID, { ...BASE_OPTS, os: 'macos' })

    expect(jest.mocked(selectAllDepots)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ os: 'windows' }),
      APP_ID
    )
  })

  it('never calls the chunk-download path (fetchChunk) — the PLAN-BUILDING half only, zero network bytes beyond PICS/manifest', async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)
    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'steam_api64.dll',
          size: '100',
          sha_content: 'sha',
          chunks: []
        }
      ]
    })

    const result = await prescreenBridgeDepots(APP_ID, BASE_OPTS)

    expect(result).toBe('x64')
    expect(jest.mocked(fetchChunk)).not.toHaveBeenCalled()
  })

  it("end-to-end: a real built plan whose single file is steam_api.dll classifies 'x86'", async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)
    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'steam_api.dll',
          size: '50',
          sha_content: 'sha',
          chunks: []
        }
      ]
    })

    const result = await prescreenBridgeDepots(APP_ID, BASE_OPTS)

    expect(result).toBe('x86')
  })
})
