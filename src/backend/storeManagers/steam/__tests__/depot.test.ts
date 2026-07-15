/**
 * Unit tests for downloadSteamDepots (Phase 21-04) — the depot-download
 * orchestrator's front half: connection gate, appId guard, os-parameterized
 * depot selection (Task 1), and per-depot manifest fetch + filename decrypt +
 * summed real total bytes (Task 2, D-03).
 *
 * Mock strategy follows games.test.ts/library.test.ts conventions:
 *  - backend/logger uses factory form (prevents transitive fs-extra native crash)
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test
 *  - ../user is auto-mocked (jest.mock('../user')) — SteamUser static methods
 *    become jest.fn()s, matching library.test.ts's pattern
 *  - ../depot/select is PARTIALLY mocked — selectAllDepots is a jest.fn() so
 *    tests can assert call args / control the descriptor list, while
 *    dlcAppIds (a pure function keyed only off appinfo.extended.listofdlc)
 *    stays real, since depot.ts calls it directly to build DLC fetch lists
 *  - ../depot/crypto (decryptFilename) and
 *    steam-user/components/content_manifest.js (parse) are fully mocked —
 *    Task 2 tests control their outputs directly rather than round-tripping
 *    through the real AES/protobuf implementations (those are covered by
 *    depotPrimitives.test.ts already)
 */
import { logWarning } from 'backend/logger'
import { downloadSteamDepots } from '../depot'
import { SteamUser } from '../user'
import { selectAllDepots } from '../depot/select'
import { decryptFilename } from '../depot/crypto'

// ── Logger mock (factory form) ────────────────────────────────────────────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

// ── SteamUser mock — controls ensureConnected()/getClient() return values ────
jest.mock('../user')

// ── depot/select mock — selectAllDepots is a jest.fn(); dlcAppIds stays real ─
jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))

// ── depot/crypto mock — decryptFilename fully controlled by Task 2 tests ─────
jest.mock('../depot/crypto', () => ({
  decryptFilename: jest.fn()
}))

// ── steam-user's undocumented raw-manifest parser (Pitfall 5) ────────────────
jest.mock('steam-user/components/content_manifest.js', () => ({
  parse: jest.fn()
}))

const APP_ID = '12345'
const BASE_OPTS = {
  targetSteamappsDir: '/tmp/steamapps',
  installdir: 'SomeGame',
  os: 'windows'
}

function makeFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    licenses: [] as Array<{ package_id: number }>,
    getProductInfo: jest.fn().mockResolvedValue({
      apps: { 12345: { appinfo: { depots: {}, extended: {} } } },
      packages: {},
      unknownApps: [],
      unknownPackages: []
    }),
    getDepotDecryptionKey: jest.fn(),
    getRawManifest: jest.fn(),
    ...overrides
  }
}

describe('downloadSteamDepots', () => {
  describe('selection', () => {
    it('T-21-05: rejects a non-numeric appId before any network call', async () => {
      await expect(
        downloadSteamDepots('12345; rm -rf /', BASE_OPTS)
      ).rejects.toThrow(/non-numeric/i)

      expect(jest.mocked(SteamUser.ensureConnected)).not.toHaveBeenCalled()
    })

    it('throws cleanly when the CM connection is not authenticated', async () => {
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(false)

      await expect(downloadSteamDepots(APP_ID, BASE_OPTS)).rejects.toThrow(
        /no authenticated steam cm connection/i
      )

      expect(jest.mocked(SteamUser.getClient)).not.toHaveBeenCalled()
      expect(jest.mocked(logWarning)).toHaveBeenCalled()
    })

    it('calls selectAllDepots with the caller-supplied os, not a hardcoded default', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      jest.mocked(selectAllDepots).mockReturnValue([])

      const plan = await downloadSteamDepots(APP_ID, { ...BASE_OPTS, os: 'macos' })

      expect(jest.mocked(selectAllDepots)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ os: 'macos' })
      )
      // A second call with a different os proves the value flows through —
      // it is a parameter, not a literal baked into depot.ts.
      jest.mocked(selectAllDepots).mockClear()
      await downloadSteamDepots(APP_ID, { ...BASE_OPTS, os: 'linux' })
      expect(jest.mocked(selectAllDepots)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ os: 'linux' })
      )

      expect(plan.depots).toEqual([])
      expect(plan.totalBytes).toBe(0)
    })
  })

  describe('manifest + total', () => {
    it('fetches, parses, and decrypts filenames for a two-depot app, summing REAL total bytes across BOTH depots (D-03/D-14)', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)

      jest.mocked(selectAllDepots).mockReturnValue([
        { id: '111', manifest: '9007199254740993', size: 0 },
        { id: '222', manifest: '9007199254740995', size: 0 }
      ])

      jest.mocked(fakeClient.getDepotDecryptionKey).mockImplementation(
        (
          _appId: number,
          depotId: number,
          cb: (err: Error | null, key: Buffer) => void
        ) => cb(null, Buffer.from(`key-${depotId}`))
      )
      jest.mocked(fakeClient.getRawManifest).mockImplementation(
        (
          _appId: number,
          depotId: number,
          _gid: string,
          _branch: string,
          cb: (err: Error | null, raw: Buffer) => void
        ) => cb(null, Buffer.from(`raw-${depotId}`))
      )

      const contentManifest = jest.requireMock('steam-user/components/content_manifest.js')
      jest.mocked(contentManifest.parse).mockImplementation((raw: Buffer) => {
        if (raw.toString() === 'raw-111') {
          return { files: [{ filename: 'enc-a', size: '100', sha_content: 'sha-a', chunks: [] }] }
        }
        return {
          files: [
            { filename: 'enc-b1', size: '150', sha_content: 'sha-b1', chunks: [] },
            { filename: 'enc-b2', size: '100', sha_content: 'sha-b2', chunks: [] }
          ]
        }
      })

      jest.mocked(decryptFilename).mockImplementation((b64: string) => `decrypted-${b64}`)

      const plan = await downloadSteamDepots(APP_ID, BASE_OPTS)

      expect(plan.depots).toHaveLength(2)
      expect(plan.depots[0].depotId).toBe('111')
      expect(plan.depots[0].gid).toBe('9007199254740993')
      expect(typeof plan.depots[0].gid).toBe('string')
      expect(typeof plan.depots[1].gid).toBe('string')
      expect(plan.depots[0].files[0].filename).toBe('decrypted-enc-a')
      expect(plan.depots[1].files.map((f) => f.filename)).toEqual([
        'decrypted-enc-b1',
        'decrypted-enc-b2'
      ])
      // 100 (depot 111) + 150 + 100 (depot 222) = 350 — summed across BOTH depots.
      expect(plan.totalBytes).toBe(350)
    })

    it('produces the same shape for a single-depot app (N=1 case)', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)

      jest.mocked(selectAllDepots).mockReturnValue([
        { id: '333', manifest: '18446744073709551615', size: 0 }
      ])

      jest.mocked(fakeClient.getDepotDecryptionKey).mockImplementation(
        (
          _appId: number,
          depotId: number,
          cb: (err: Error | null, key: Buffer) => void
        ) => cb(null, Buffer.from(`key-${depotId}`))
      )
      jest.mocked(fakeClient.getRawManifest).mockImplementation(
        (
          _appId: number,
          depotId: number,
          _gid: string,
          _branch: string,
          cb: (err: Error | null, raw: Buffer) => void
        ) => cb(null, Buffer.from(`raw-${depotId}`))
      )

      const contentManifest = jest.requireMock('steam-user/components/content_manifest.js')
      jest.mocked(contentManifest.parse).mockReturnValue({
        files: [{ filename: 'enc-solo', size: '42', sha_content: 'sha-solo', chunks: [] }]
      })
      jest.mocked(decryptFilename).mockImplementation((b64: string) => `decrypted-${b64}`)

      const plan = await downloadSteamDepots(APP_ID, BASE_OPTS)

      expect(plan.depots).toHaveLength(1)
      expect(plan.depots[0].depotId).toBe('333')
      expect(plan.depots[0].gid).toBe('18446744073709551615')
      expect(plan.depots[0].files[0].filename).toBe('decrypted-enc-solo')
      expect(plan.totalBytes).toBe(42)
    })

    it('smoke: steam-user/components/content_manifest.js still exports a parse() function (Pitfall 5, T-21-10)', () => {
      const real = jest.requireActual('steam-user/components/content_manifest.js')
      expect(typeof real.parse).toBe('function')
    })
  })
})
