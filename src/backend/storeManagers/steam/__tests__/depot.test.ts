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
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logWarning, logInfo } from 'backend/logger'
import {
  buildDepotPlan,
  downloadSteamDepots,
  downloadDepotFiles,
  downloadFileChunks,
  finalizeToSteam,
  canWriteFullOwnership,
  formatEta,
  rollingRateMiBs,
  CHUNK_CONCURRENCY,
  CHUNK_FETCH_ATTEMPTS,
  PLAN_BUILD_MAX_ATTEMPTS,
  reduceContentServers,
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  EXECUTABLE_FLAG,
  type DepotPlan,
  type DepotPlanFile,
  type DepotDownloadFailure,
  type RawContentServer
} from '../depot'
import { SteamUser } from '../user'
import { selectAllDepots } from '../depot/select'
import { decryptFilename } from '../depot/crypto'
import { fetchChunk, type LzmaModule } from '../depot/decompress'
import { CdnAuthTokenCache } from '../depot/cdnAuth'
import { StallTracker } from '../depot/stallTracker'
import { sendFrontendMessage } from '../../../ipc'
import { classifyDepotError, isNonRetryableDepotError } from '../depotErrors'
import { applyDepotFileFlags } from '../depot/fileAttributes'
import {
  CContentServerDirectory_GetCDNAuthToken_Request,
  CContentServerDirectory_GetCDNAuthToken_Response
} from 'steam-user/protobufs/generated/_load.js'

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

// ── backend/utils mock — provides getFileSize() (prevents pulling in the
//    heavy gog/library.ts transitive chain via the real utils.ts module,
//    same pattern as library.test.ts). Progress tests below don't assert on
//    the formatted `bytes` string, so no implementation needs re-establishing.
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn()
}))

// ── depot/select mock — selectAllDepots is a jest.fn(); dlcAppIds stays real ─
jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))

// ── depot/crypto mock — decryptFilename fully controlled by Task 2 tests ─────
jest.mock('../depot/crypto', () => ({
  decryptFilename: jest.fn()
}))

// ── depot/fileAttributes mock — a jest.fn() shell so individual ReadOnly/
//    Hidden tests can either delegate to the REAL implementation (real-tmpdir
//    POSIX mode-bit assertions, per depot.test.ts's established real-fs
//    discipline) or force a failure (mode-application-failure-surfaces test)
//    without depending on an environment-specific real chmod failure.
jest.mock('../depot/fileAttributes', () => ({
  applyDepotFileFlags: jest.fn()
}))
const actualApplyDepotFileFlags = jest.requireActual(
  '../depot/fileAttributes'
).applyDepotFileFlags

// ── steam-user's undocumented raw-manifest parser (Pitfall 5) ────────────────
jest.mock('steam-user/components/content_manifest.js', () => ({
  parse: jest.fn()
}))

// ── depot/decompress mock — fetchChunk is the only network-dependent piece of
//    downloadDepotFiles; everything else (fs, crypto) runs for REAL against a
//    tmpdir per manifest.test.ts's established precedent (node:fs/promises
//    exports are non-configurable getters under this project's ts-jest/CJS
//    interop — jest.mock/jest.spyOn cannot reliably intercept a specific fs
//    call without breaking the underlying real I/O, so black-box real-fs
//    assertions are used instead of mocking open/write/mkdir).
// Debug/steam-install-slow-start (cycle 17): isDecodeStageError is a real,
// pure duck-typed check (never network/fs-dependent) — mocked here with the
// SAME logic as the real implementation (depot/decompress.ts) rather than a
// bare jest.fn(), so downloadFileChunks' new decode-stage-vs-network requeue
// guard behaves identically to production against this suite's fixture
// errors (which never set `.code` unless a test explicitly constructs one).
jest.mock('../depot/decompress', () => ({
  fetchChunk: jest.fn(),
  isDecodeStageError: (err: unknown) => {
    const code = (err as { code?: unknown } | undefined)?.code
    return (
      typeof code === 'string' &&
      [
        'bad_footer_magic',
        'unknown_container',
        'sha1_mismatch',
        'size_mismatch',
        'decode_failed'
      ].includes(code)
    )
  }
}))

// ── backend/ipc mock — captures progressUpdate emits for Task 2 assertions ───
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── i18next mock — returns the fallback string for classifyDepotError
//    assertions (library.test.ts's established pattern) ─────────────────────
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
  os: 'windows'
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
    // Debug/steam-install-slow-start (cycle 6, transport-swapped in the
    // CDN-auth implementation cycle; cycle 11 swapped the transport AGAIN —
    // see depot/cdnAuth.ts's module doc comment, CYCLE 11 UPDATE section):
    // default fake for the undocumented `_send` surface. Not exercised by
    // most tests here (fetchChunk itself is fully jest.mock'd in this file,
    // so CdnAuthTokenCache.getToken is never actually invoked through the
    // mocked fetchChunk), but present so a test can call it directly on the
    // CdnAuthTokenCache instance downloadSteamDepots constructs. Encodes/
    // decodes REAL protobuf buffers (same classes cdnAuth.ts's manual bypass
    // uses), matching the actual wire shape rather than a plain-object fake.
    _send: jest
      .fn()
      .mockImplementation(
        (
          _header: { msg: number; proto: { target_job_name: string } },
          _body: Buffer,
          cb: (body: unknown, hdr?: { proto?: { eresult?: number } }) => void
        ) =>
          cb(
            CContentServerDirectory_GetCDNAuthToken_Response.encode({
              token: '?fake-token',
              expiration_time: Math.floor(Date.now() / 1000) + 3600
            }).finish(),
            { proto: { eresult: 1 } }
          )
      ),
    ...overrides
  }
}

describe('buildDepotPlan', () => {
  describe('selection', () => {
    it('T-21-05: rejects a non-numeric appId before any network call', async () => {
      await expect(
        buildDepotPlan('12345; rm -rf /', BASE_OPTS)
      ).rejects.toThrow(/non-numeric/i)

      expect(jest.mocked(SteamUser.ensureConnected)).not.toHaveBeenCalled()
    })

    it('throws cleanly when the CM connection is not authenticated', async () => {
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(false)

      await expect(buildDepotPlan(APP_ID, BASE_OPTS)).rejects.toThrow(
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

      const plan = await buildDepotPlan(APP_ID, { ...BASE_OPTS, os: 'macos' })

      expect(jest.mocked(selectAllDepots)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ os: 'macos' }),
        APP_ID
      )
      // A second call with a different os proves the value flows through —
      // it is a parameter, not a literal baked into depot.ts.
      jest.mocked(selectAllDepots).mockClear()
      await buildDepotPlan(APP_ID, { ...BASE_OPTS, os: 'linux' })
      expect(jest.mocked(selectAllDepots)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ os: 'linux' }),
        APP_ID
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
        {
          id: '111',
          manifest: '9007199254740993',
          size: 0,
          ownerAppId: '12345'
        },
        {
          id: '222',
          manifest: '9007199254740995',
          size: 0,
          ownerAppId: '12345'
        }
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

      const contentManifest = jest.requireMock(
        'steam-user/components/content_manifest.js'
      )
      jest.mocked(contentManifest.parse).mockImplementation((raw: Buffer) => {
        if (raw.toString() === 'raw-111') {
          return {
            files: [
              {
                filename: 'enc-a',
                size: '100',
                sha_content: 'sha-a',
                chunks: []
              }
            ]
          }
        }
        return {
          files: [
            {
              filename: 'enc-b1',
              size: '150',
              sha_content: 'sha-b1',
              chunks: []
            },
            {
              filename: 'enc-b2',
              size: '100',
              sha_content: 'sha-b2',
              chunks: []
            }
          ]
        }
      })

      jest
        .mocked(decryptFilename)
        .mockImplementation((b64: string) => `decrypted-${b64}`)

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)

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

      jest
        .mocked(selectAllDepots)
        .mockReturnValue([
          {
            id: '333',
            manifest: '18446744073709551615',
            size: 0,
            ownerAppId: '12345'
          }
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

      const contentManifest = jest.requireMock(
        'steam-user/components/content_manifest.js'
      )
      jest.mocked(contentManifest.parse).mockReturnValue({
        files: [
          {
            filename: 'enc-solo',
            size: '42',
            sha_content: 'sha-solo',
            chunks: []
          }
        ]
      })
      jest
        .mocked(decryptFilename)
        .mockImplementation((b64: string) => `decrypted-${b64}`)

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)

      expect(plan.depots).toHaveLength(1)
      expect(plan.depots[0].depotId).toBe('333')
      expect(plan.depots[0].gid).toBe('18446744073709551615')
      expect(plan.depots[0].files[0].filename).toBe('decrypted-enc-solo')
      expect(plan.totalBytes).toBe(42)
    })

    it('smoke: steam-user/components/content_manifest.js still exports a parse() function (Pitfall 5, T-21-10)', () => {
      const real = jest.requireActual(
        'steam-user/components/content_manifest.js'
      )
      expect(typeof real.parse).toBe('function')
    })
  })

  describe('D-UAT-05: abort signal during plan-build', () => {
    it('an already-aborted signal throws before ensureConnected() is even called', async () => {
      const controller = new AbortController()
      controller.abort()

      await expect(
        buildDepotPlan(APP_ID, { ...BASE_OPTS, signal: controller.signal })
      ).rejects.toThrow(/aborted/i)

      expect(jest.mocked(SteamUser.ensureConnected)).not.toHaveBeenCalled()
    })

    it('aborting mid-loop (after the first of two depots) stops before fetching the second depot manifest', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      jest.mocked(selectAllDepots).mockReturnValue([
        {
          id: '111',
          manifest: '9007199254740993',
          size: 0,
          ownerAppId: '12345'
        },
        {
          id: '222',
          manifest: '9007199254740995',
          size: 0,
          ownerAppId: '12345'
        }
      ])

      const controller = new AbortController()
      jest
        .mocked(fakeClient.getDepotDecryptionKey)
        .mockImplementation(
          (
            _appId: number,
            depotId: number,
            cb: (err: Error | null, key: Buffer) => void
          ) => {
            // Abort partway through — right after the first depot's key fetch
            // starts resolving, before the loop moves to the second descriptor.
            if (depotId === 111) controller.abort()
            cb(null, Buffer.from(`key-${depotId}`))
          }
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
      const contentManifest = jest.requireMock(
        'steam-user/components/content_manifest.js'
      )
      jest.mocked(contentManifest.parse).mockReturnValue({
        files: [
          { filename: 'enc-a', size: '100', sha_content: 'sha-a', chunks: [] }
        ]
      })
      jest
        .mocked(decryptFilename)
        .mockImplementation((b64: string) => `decrypted-${b64}`)

      await expect(
        buildDepotPlan(APP_ID, { ...BASE_OPTS, signal: controller.signal })
      ).rejects.toThrow(/aborted/i)

      // The second depot's manifest fetch never starts (loop bailed before it).
      expect(fakeClient.getDepotDecryptionKey).toHaveBeenCalledTimes(1)
    })
  })

  describe('D-UAT-06: reconnect+retry-on-drop during plan-build', () => {
    it('a CM drop on the first attempt at a depot manifest fetch triggers ensureConnected() + retry, and the plan still completes', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      jest
        .mocked(selectAllDepots)
        .mockReturnValue([
          {
            id: '111',
            manifest: '9007199254740993',
            size: 0,
            ownerAppId: '12345'
          }
        ])

      let keyCalls = 0
      jest
        .mocked(fakeClient.getDepotDecryptionKey)
        .mockImplementation(
          (
            _appId: number,
            depotId: number,
            cb: (err: Error | null, key: Buffer) => void
          ) => {
            keyCalls++
            if (keyCalls === 1) {
              // Simulates the CM connection dropping mid-request (the exact
              // D-UAT-06 field failure signature — classifyDepotError already
              // recognizes ECONNRESET as a connection-dropped failure).
              cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
              return
            }
            cb(null, Buffer.from(`key-${depotId}`))
          }
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
      const contentManifest = jest.requireMock(
        'steam-user/components/content_manifest.js'
      )
      jest.mocked(contentManifest.parse).mockReturnValue({
        files: [
          { filename: 'enc-a', size: '100', sha_content: 'sha-a', chunks: [] }
        ]
      })
      jest
        .mocked(decryptFilename)
        .mockImplementation((b64: string) => `decrypted-${b64}`)

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)

      expect(plan.depots).toHaveLength(1)
      expect(plan.depots[0].depotId).toBe('111')
      expect(keyCalls).toBe(2)
      // Initial connect (1, top of buildDepotPlan) + one mid-loop reconnect
      // triggered by the retry wrapper after the drop (1) = 2.
      expect(jest.mocked(SteamUser.ensureConnected)).toHaveBeenCalledTimes(2)
    })

    it('exhausts PLAN_BUILD_MAX_ATTEMPTS on a PERSISTENT drop and rejects — never retries unboundedly', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      jest
        .mocked(selectAllDepots)
        .mockReturnValue([
          {
            id: '111',
            manifest: '9007199254740993',
            size: 0,
            ownerAppId: '12345'
          }
        ])

      jest
        .mocked(fakeClient.getDepotDecryptionKey)
        .mockImplementation(
          (
            _appId: number,
            _depotId: number,
            cb: (err: Error | null, key: Buffer) => void
          ) => cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
        )

      await expect(buildDepotPlan(APP_ID, BASE_OPTS)).rejects.toThrow(
        /ECONNRESET/
      )

      expect(fakeClient.getDepotDecryptionKey).toHaveBeenCalledTimes(
        PLAN_BUILD_MAX_ATTEMPTS
      )
      // 1 initial connect + (PLAN_BUILD_MAX_ATTEMPTS - 1) retry-reconnects.
      expect(jest.mocked(SteamUser.ensureConnected)).toHaveBeenCalledTimes(
        PLAN_BUILD_MAX_ATTEMPTS
      )
    })

    it('a cancel that lands the instant a plan-build step fails short-circuits the retry — never proceeds to a second attempt or waits out the backoff', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      jest
        .mocked(selectAllDepots)
        .mockReturnValue([
          {
            id: '111',
            manifest: '9007199254740993',
            size: 0,
            ownerAppId: '12345'
          }
        ])

      const controller = new AbortController()
      jest
        .mocked(fakeClient.getDepotDecryptionKey)
        .mockImplementation(
          (
            _appId: number,
            _depotId: number,
            cb: (err: Error | null, key: Buffer) => void
          ) => {
            // First attempt fails (triggers the retry path); abort lands
            // while withPlanBuildRetry is backing off before attempt 2.
            controller.abort()
            cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
          }
        )

      await expect(
        buildDepotPlan(APP_ID, { ...BASE_OPTS, signal: controller.signal })
      ).rejects.toThrow(/aborted/i)

      // Never reached a second attempt — the abort short-circuited the retry.
      expect(fakeClient.getDepotDecryptionKey).toHaveBeenCalledTimes(1)
    })
  })

  describe('D-UAT-08: depot decryption key requested with the owning appId', () => {
    it('requests getDepotDecryptionKey/getRawManifest with a DLC/sub-app descriptor.ownerAppId, NOT the base appId, when they differ', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      // Descriptor enumerated from a DLC/sub-app (ownerAppId 54321) — as
      // Cyberpunk 2077's macOS depots (1460472/2224089) were, per the field
      // failure log — while the base game is APP_ID (12345).
      jest
        .mocked(selectAllDepots)
        .mockReturnValue([
          {
            id: '1460472',
            manifest: '9007199254740993',
            size: 0,
            ownerAppId: '54321'
          }
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
      const contentManifest = jest.requireMock(
        'steam-user/components/content_manifest.js'
      )
      jest.mocked(contentManifest.parse).mockReturnValue({
        files: [
          { filename: 'enc-a', size: '10', sha_content: 'sha-a', chunks: [] }
        ]
      })
      jest
        .mocked(decryptFilename)
        .mockImplementation((b64: string) => `decrypted-${b64}`)

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)

      expect(plan.depots).toHaveLength(1)
      // The KEY assertion: called with 54321 (the DLC/sub-app's own appId),
      // never 12345 (the base game's appId) — the D-UAT-08 root cause.
      expect(fakeClient.getDepotDecryptionKey).toHaveBeenCalledWith(
        54321,
        1460472,
        expect.any(Function)
      )
      expect(fakeClient.getDepotDecryptionKey).not.toHaveBeenCalledWith(
        12345,
        1460472,
        expect.any(Function)
      )
      expect(fakeClient.getRawManifest).toHaveBeenCalledWith(
        54321,
        1460472,
        '9007199254740993',
        'public',
        expect.any(Function)
      )
    })

    it('requests getDepotDecryptionKey with the BASE appId for a base-app depot (including one gated by dlcappid) — unchanged from before', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      jest
        .mocked(selectAllDepots)
        .mockReturnValue([
          {
            id: '111',
            manifest: '9007199254740993',
            size: 0,
            ownerAppId: APP_ID
          }
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
      const contentManifest = jest.requireMock(
        'steam-user/components/content_manifest.js'
      )
      jest.mocked(contentManifest.parse).mockReturnValue({
        files: [
          { filename: 'enc-a', size: '10', sha_content: 'sha-a', chunks: [] }
        ]
      })
      jest
        .mocked(decryptFilename)
        .mockImplementation((b64: string) => `decrypted-${b64}`)

      await buildDepotPlan(APP_ID, BASE_OPTS)

      expect(fakeClient.getDepotDecryptionKey).toHaveBeenCalledWith(
        12345,
        111,
        expect.any(Function)
      )
    })

    it('never re-writes the base appId as the finalizeToSteam manifest filename/appid, even when depots are owned by a different appId', async () => {
      // CRITICAL CONSTRAINT: the owning-appId change is ONLY for per-depot
      // key/manifest requests — finalizeToSteam's .acf writer must KEEP
      // using the base game's appId (Steam adopts the install as
      // appmanifest_{BASE_appId}.acf regardless of which sub-app a depot's
      // decryption key was fetched under).
      const source = readFileSync(join(__dirname, '../depot.ts'), 'utf8')
      const finalizeToSteamFn = source.slice(
        source.indexOf('export async function finalizeToSteam')
      )
      const acfCallSite = finalizeToSteamFn.slice(
        0,
        finalizeToSteamFn.indexOf('writeAppManifest')
      )
      // finalizeToSteam takes `appId` as ITS OWN first parameter (the base
      // appId downloadSteamDepots was invoked with) — it never reads
      // ownerAppId/descriptor at all.
      expect(acfCallSite).not.toMatch(/ownerAppId/)
    })

    it('a terminal EResult (FileNotFound=9) fails FAST — never burns all PLAN_BUILD_MAX_ATTEMPTS retries on an error that will recur identically', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      jest
        .mocked(selectAllDepots)
        .mockReturnValue([
          {
            id: '1460472',
            manifest: '9007199254740993',
            size: 0,
            ownerAppId: APP_ID
          }
        ])

      jest
        .mocked(fakeClient.getDepotDecryptionKey)
        .mockImplementation(
          (
            _appId: number,
            _depotId: number,
            cb: (err: Error | null, key: Buffer) => void
          ) => {
            const err = new Error('FileNotFound') as Error & {
              eresult?: number
            }
            err.eresult = 9 // EResult.FileNotFound — steam-user's helpers.eresultError shape
            cb(err, undefined as unknown as Buffer)
          }
        )

      await expect(buildDepotPlan(APP_ID, BASE_OPTS)).rejects.toThrow(
        /couldn't get decryption key/i
      )

      // Exactly ONE attempt — never retried (retrying a terminal EResult can
      // never succeed) — unlike the PLAN_BUILD_MAX_ATTEMPTS-attempt behavior
      // for a transient ECONNRESET (see the D-UAT-06 tests above).
      expect(fakeClient.getDepotDecryptionKey).toHaveBeenCalledTimes(1)
      expect(fakeClient.getDepotDecryptionKey).toHaveBeenCalledTimes(1)
      expect(PLAN_BUILD_MAX_ATTEMPTS).toBeGreaterThan(1) // sanity: the bound this test proves we did NOT hit
    })

    it('a non-terminal error (no eresult / not in the terminal set) still retries normally — non-retryable classification does not over-broaden', async () => {
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      jest
        .mocked(selectAllDepots)
        .mockReturnValue([
          {
            id: '111',
            manifest: '9007199254740993',
            size: 0,
            ownerAppId: APP_ID
          }
        ])

      let calls = 0
      jest
        .mocked(fakeClient.getDepotDecryptionKey)
        .mockImplementation(
          (
            _appId: number,
            depotId: number,
            cb: (err: Error | null, key: Buffer) => void
          ) => {
            calls++
            if (calls === 1) {
              cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
              return
            }
            cb(null, Buffer.from(`key-${depotId}`))
          }
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
      const contentManifest = jest.requireMock(
        'steam-user/components/content_manifest.js'
      )
      jest.mocked(contentManifest.parse).mockReturnValue({
        files: [
          { filename: 'enc-a', size: '10', sha_content: 'sha-a', chunks: [] }
        ]
      })
      jest
        .mocked(decryptFilename)
        .mockImplementation((b64: string) => `decrypted-${b64}`)

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)

      expect(plan.depots).toHaveLength(1)
      expect(calls).toBe(2)
    })

    it('surfaces an HONEST error (depot id + owning appId + real EResult name) instead of the misleading "connection dropped" copy', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'gamelib-honest-error-test-'))
      try {
        const fakeClient = makeFakeClient()
        jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
        jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
        jest
          .mocked(selectAllDepots)
          .mockReturnValue([
            {
              id: '1460472',
              manifest: '9007199254740993',
              size: 0,
              ownerAppId: '54321'
            }
          ])

        jest
          .mocked(fakeClient.getDepotDecryptionKey)
          .mockImplementation(
            (
              _appId: number,
              _depotId: number,
              cb: (err: Error | null, key: Buffer) => void
            ) => {
              const err = new Error('FileNotFound') as Error & {
                eresult?: number
              }
              err.eresult = 9
              cb(err, undefined as unknown as Buffer)
            }
          )

        const result = await downloadSteamDepots(APP_ID, {
          targetSteamappsDir: dir,
          installdir: 'SomeGame',
          os: 'windows'
        })

        expect(result.status).toBe('error')
        // Never the generic/misleading "connection dropped" copy.
        expect(result.error).not.toMatch(/dropped the connection/i)
        // Honest: names the depot + owning appId so the failure is diagnosable.
        expect(result.error).toMatch(/1460472/)
        expect(result.error).toMatch(/54321/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  // ── G-30-02 (30-07 gap closure) ────────────────────────────────────────
  // A never-settling steam-user CM call (getProductInfo OR
  // getDepotDecryptionKey/getRawManifest — the same bare, un-timed
  // callback-Promise call-class) must no longer hang buildDepotPlan forever.
  // FAKE-TIMER DISCIPLINE: scoped to this describe block ONLY (see the
  // suite-wide note at the progress-heartbeat block below, which documents
  // why full fake timers are avoided elsewhere in this file — real
  // DecompressPool worker_threads). buildDepotPlan/fetchDepotPlanEntry never
  // touch DecompressPool, so fake timers are safe here in isolation.
  describe('G-30-02: pre-download CM calls are bounded by withTimeout', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('a never-settling getProductInfo makes buildDepotPlan REJECT within the bounded window instead of hanging', async () => {
      jest.useFakeTimers()
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      // fetchAppInfo (the first withPlanBuildRetry step in buildDepotPlan)
      // never settles on every attempt — simulates a CM socket that is
      // present but unresponsive to every PICS request.
      jest
        .mocked(fakeClient.getProductInfo)
        .mockImplementation(() => new Promise(() => {}))

      const rejection = expect(
        buildDepotPlan(APP_ID, BASE_OPTS)
      ).rejects.toThrow(/getProductInfo timed out/)

      // Advance well past the single bound. WR-02: a withTimeout timeout is
      // marked isTimeout and treated as NON-retryable by withPlanBuildRetry —
      // retrying would only re-hang identically against the same stale
      // fast-path socket — so the first bound rejects terminally.
      await jest.advanceTimersByTimeAsync(300000)
      await rejection

      // WR-02: exactly ONE attempt, not PLAN_BUILD_MAX_ATTEMPTS — the hang is
      // not retried, restoring the documented single pre-download deadline.
      expect(fakeClient.getProductInfo).toHaveBeenCalledTimes(1)
      expect(PLAN_BUILD_MAX_ATTEMPTS).toBeGreaterThan(1) // sanity: the bound this test proves we did NOT hit
    })

    it('a healthy (fast-resolving) getProductInfo is unaffected — buildDepotPlan completes normally (happy path unchanged)', async () => {
      // Deliberately NO fake timers here — this proves the wrapper is
      // transparent on the healthy path with real timers, protecting the
      // Electron build's install flow.
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      jest.mocked(selectAllDepots).mockReturnValue([])

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)

      expect(plan.depots).toEqual([])
    })

    it('EXTENDED coverage (checker finding #3): a never-settling getDepotDecryptionKey on the fetchDepotPlanEntry path also produces a bounded reject, NOT a hang — a socket going stale MID-buildDepotPlan is bounded too', async () => {
      jest.useFakeTimers()
      const fakeClient = makeFakeClient()
      jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
      // getProductInfo (fetchAppInfo/getOwnedSets/fetchDlcInfos) resolves
      // normally so execution actually REACHES the depot-manifest fetch —
      // only fetchDepotPlanEntry's getDepotDecryptionKey hangs, simulating
      // the socket going stale mid-buildDepotPlan (after the earlier PICS
      // calls already succeeded).
      jest
        .mocked(selectAllDepots)
        .mockReturnValue([
          {
            id: '111',
            manifest: '9007199254740993',
            size: 0,
            ownerAppId: '12345'
          }
        ])
      jest
        .mocked(fakeClient.getDepotDecryptionKey)
        .mockImplementation(() => {
          // Bare callback-Promise CM call that never calls its callback —
          // simulates the exact hang class this gap closure bounds.
        })

      const rejection = expect(
        buildDepotPlan(APP_ID, BASE_OPTS)
      ).rejects.toThrow(/getDepotDecryptionKey timed out/)

      await jest.advanceTimersByTimeAsync(300000)
      await rejection

      // WR-02: single attempt — a mid-plan hang is bounded once and fails
      // fast, not retried PLAN_BUILD_MAX_ATTEMPTS times.
      expect(fakeClient.getDepotDecryptionKey).toHaveBeenCalledTimes(1)
    })
  })
})

/**
 * Unit tests for canWriteFullOwnership (Phase 23-02, D-01/D-02) — the single
 * completeness gate deciding StateFlags=4 vs. the safe 1026 fallback. Every
 * behavior bullet from the plan gets its own case; the gate must fail CLOSED
 * on any missing/ambiguous input.
 */
describe('canWriteFullOwnership', () => {
  const oneFailure: DepotDownloadFailure[] = [{ file: 'a.bin', error: 'boom' }]

  const complete = {
    outcome: 'completed' as const,
    failures: [] as DepotDownloadFailure[],
    buildid: '9044149',
    allFilesVerified: true,
    allModesApplied: true
  }

  it('returns true when every load-bearing field is present and clean', () => {
    expect(canWriteFullOwnership(complete)).toBe(true)
  })

  it('outcome "cancelled" -> false', () => {
    expect(canWriteFullOwnership({ ...complete, outcome: 'cancelled' })).toBe(
      false
    )
  })

  it('outcome "completed" with a non-empty failures array -> false (partial failure must not earn a 4)', () => {
    expect(canWriteFullOwnership({ ...complete, failures: oneFailure })).toBe(
      false
    )
  })

  it('buildid undefined -> false', () => {
    expect(canWriteFullOwnership({ ...complete, buildid: undefined })).toBe(
      false
    )
  })

  it('buildid "0" -> false (Steam reads "0" as UpdateRequired)', () => {
    expect(canWriteFullOwnership({ ...complete, buildid: '0' })).toBe(false)
  })

  it('allFilesVerified false -> false', () => {
    expect(
      canWriteFullOwnership({ ...complete, allFilesVerified: false })
    ).toBe(false)
  })

  it('allModesApplied false -> false', () => {
    expect(canWriteFullOwnership({ ...complete, allModesApplied: false })).toBe(
      false
    )
  })
})

/**
 * Unit tests for finalizeToSteam (Phase 21-06) — the SINGLE recovery function
 * cancel/failure/success all converge on (Pattern 5, D-04/D-07). Runs against
 * a REAL tmpdir (manifest.test.ts's established precedent).
 */
describe('finalizeToSteam', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-finalize-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes exactly one appmanifest via writeAppManifest with StateFlags=1026 and the InstalledDepots map of the depots attempted (GIDs as strings)', async () => {
    mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
    writeFileSync(join(dir, 'common', 'SomeGame', 'a.bin'), Buffer.alloc(10))

    await finalizeToSteam('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      name: 'Some Game',
      depots: [
        { depotId: '111', gid: '9007199254740993', size: 500 },
        { depotId: '222', gid: '18446744073709551615', size: 250 }
      ]
    })

    const acfPath = join(dir, 'appmanifest_12345.acf')
    expect(existsSync(acfPath)).toBe(true)
    const text = readFileSync(acfPath, 'utf8')
    expect(text).toMatch(/"StateFlags"\s+"1026"/)
    // Exactly one .acf written — no stray second write.
    expect(text.match(/"AppState"/g)).toHaveLength(1)
    // Both attempted depots present, GIDs preserved as exact strings.
    expect(text).toMatch(/"111"/)
    expect(text).toMatch(/"9007199254740993"/)
    expect(text).toMatch(/"222"/)
    expect(text).toMatch(/"18446744073709551615"/)
  })

  it("SizeOnDisk is the measured on-disk byte total, NOT the depots' declared/summed size", async () => {
    mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
    writeFileSync(join(dir, 'common', 'SomeGame', 'a.bin'), Buffer.alloc(123))

    await finalizeToSteam('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      name: 'Some Game',
      // Declared depot size is deliberately much larger than what's actually
      // on disk — proves SizeOnDisk is measured, not a DepotPlan-derived sum
      // (spike 001: a summed total overshoots multi-depot installs by 236MB).
      depots: [{ depotId: '111', gid: '11111111111111111', size: 999999 }]
    })

    const text = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(text).toMatch(/"SizeOnDisk"\s+"123"/)
  })

  it('measures 0 bytes and still writes a valid 1026 manifest when nothing has landed on disk yet', async () => {
    await finalizeToSteam('12345', {
      targetSteamappsDir: dir,
      installdir: 'NeverStarted',
      name: 'Never Started',
      depots: []
    })

    const text = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(text).toMatch(/"SizeOnDisk"\s+"0"/)
    expect(text).toMatch(/"StateFlags"\s+"1026"/)
  })

  // ── Phase 23 (23-02, D-01/D-02): canWriteFullOwnership-gated StateFlags=4 ──
  describe('StateFlags=4 full-ownership gate (D-01/D-02)', () => {
    it('writes StateFlags "4" with BytesToDownload==BytesDownloaded==SizeOnDisk and the real buildid when every completeness signal is proven', async () => {
      mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
      writeFileSync(
        join(dir, 'common', 'SomeGame', 'a.bin'),
        Buffer.alloc(117426878 % 1000)
      ) // arbitrary non-zero size

      await finalizeToSteam('12345', {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        name: 'Some Game',
        depots: [{ depotId: '111', gid: '9007199254740993', size: 500 }],
        buildid: '9044149',
        outcome: 'completed',
        failures: [],
        allFilesVerified: true,
        allModesApplied: true
      })

      const text = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"4"/)
      expect(text).toMatch(/"buildid"\s+"9044149"/)

      const sizeOnDisk = text.match(/"SizeOnDisk"\s+"(\d+)"/)?.[1]
      const bytesToDownload = text.match(/"BytesToDownload"\s+"(\d+)"/)?.[1]
      const bytesDownloaded = text.match(/"BytesDownloaded"\s+"(\d+)"/)?.[1]
      expect(sizeOnDisk).toBeDefined()
      expect(Number(sizeOnDisk)).toBeGreaterThan(0)
      expect(bytesToDownload).toBe(sizeOnDisk)
      expect(bytesDownloaded).toBe(sizeOnDisk)
    })

    it('falls back to StateFlags "1026" when the run had a non-empty failures array, even though every other signal is clean', async () => {
      mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
      writeFileSync(join(dir, 'common', 'SomeGame', 'a.bin'), Buffer.alloc(10))

      await finalizeToSteam('12345', {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        name: 'Some Game',
        depots: [{ depotId: '111', gid: '9007199254740993', size: 500 }],
        buildid: '9044149',
        outcome: 'completed',
        failures: [{ file: 'a.bin', error: 'sha1 mismatch' }],
        allFilesVerified: true,
        allModesApplied: true
      })

      const text = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"1026"/)
    })

    it('falls back to StateFlags "1026" when buildid is "0" (Steam UpdateRequired sentinel), even though every other signal is clean', async () => {
      mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
      writeFileSync(join(dir, 'common', 'SomeGame', 'a.bin'), Buffer.alloc(10))

      await finalizeToSteam('12345', {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        name: 'Some Game',
        depots: [{ depotId: '111', gid: '9007199254740993', size: 500 }],
        buildid: '0',
        outcome: 'completed',
        failures: [],
        allFilesVerified: true,
        allModesApplied: true
      })

      const text = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"1026"/)
    })

    it('falls back to StateFlags "1026" when the gate inputs are entirely omitted by the caller (fail-closed default)', async () => {
      mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
      writeFileSync(join(dir, 'common', 'SomeGame', 'a.bin'), Buffer.alloc(10))

      await finalizeToSteam('12345', {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        name: 'Some Game',
        depots: [{ depotId: '111', gid: '9007199254740993', size: 500 }],
        buildid: '9044149'
        // outcome/failures/allFilesVerified/allModesApplied all omitted.
      })

      const text = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"1026"/)
    })
  })
})

/**
 * Unit tests for downloadSteamDepots (Phase 21-06) — the public orchestrator
 * Plan 07's SteamGame.install() calls. Proves success, failure, and cancel
 * ALL converge on finalizeToSteam (Pattern 5) and that downloadSteamDepots
 * itself NEVER throws — every outcome resolves as a structured
 * { status, error? } object. Runs against a REAL tmpdir.
 */
describe('downloadSteamDepots (full orchestration + recovery convergence)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-orchestrate-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function sha1Hex(buf: Buffer): string {
    return createHash('sha1').update(buf).digest('hex')
  }

  /** Wires the PICS/manifest-fetch plumbing every test in this block shares —
   *  a single owned depot, single file. Each test configures its own
   *  content_manifest.parse()/fetchChunk() outcome for its scenario. */
  function setupPlanPlumbing(fakeClient: ReturnType<typeof makeFakeClient>) {
    jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
    jest
      .mocked(selectAllDepots)
      .mockReturnValue([
        {
          id: '111',
          manifest: '11111111111111111',
          size: 0,
          ownerAppId: '12345'
        }
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
    jest.mocked(decryptFilename).mockReturnValue('game.bin')
  }

  it('on full success: finalizeToSteam is invoked AFTER every file is written, and writes StateFlags=1026', async () => {
    const content = Buffer.from('game-bytes')
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: String(content.length),
          sha_content: sha1Hex(content),
          chunks: [{ sha: 'chunk-sha', cb_original: content.length, offset: 0 }]
        }
      ]
    })
    jest.mocked(fetchChunk).mockResolvedValue(content)

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
    })

    expect(result.status).toBe('done')

    // Files actually landed on disk BEFORE the manifest write below proves
    // the ordering — if the manifest were written first, this file would not
    // exist by the time we read it (downloadDepotFiles is fully awaited).
    const written = readFileSync(join(dir, 'common', 'SomeGame', 'game.bin'))
    expect(written.equals(content)).toBe(true)

    const acfText = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(acfText).toMatch(/"StateFlags"\s+"1026"/)
    expect(acfText).toMatch(/"111"/)
  })

  it('debug/steam-install-slow-start (cycle 6): threads a REAL CdnAuthTokenCache — bound to the actual client + numeric appId — into every fetchChunk call', async () => {
    const content = Buffer.from('game-bytes')
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: String(content.length),
          sha_content: sha1Hex(content),
          chunks: [{ sha: 'chunk-sha', cb_original: content.length, offset: 0 }]
        }
      ]
    })
    jest.mocked(fetchChunk).mockResolvedValue(content)

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
    })
    expect(result.status).toBe('done')

    expect(fetchChunk).toHaveBeenCalledTimes(1)
    // fetchChunk(hosts, depotId, chunk, key, lzma, attempts, decode,
    // onNetworkBytes, onAttempt, hostHealth, cdnAuth, hostMeta, signal,
    // workerSlot) — cdnAuth is the 11th positional argument (index 10);
    // hostMeta (cycle 7) is the 12th; signal (debug/steam-cancel-abort-
    // thread-a) is the 13th; workerSlot (Phase 25 multi-host fan-out) is now
    // the 14th/last.
    const callArgs = jest.mocked(fetchChunk).mock.calls[0]
    const cdnAuth = callArgs[callArgs.length - 4]
    expect(cdnAuth).toBeInstanceOf(CdnAuthTokenCache)

    // Prove it's bound to the REAL client + the numeric form of the appId
    // downloadSteamDepots was invoked with — calling getToken on it must
    // reach fakeClient._send with the MODERN unified-RPC method name (as
    // header.proto.target_job_name — cycle 11's manual bypass, see
    // depot/cdnAuth.ts's module doc comment) and app_id=12345
    // (Number('12345')), never the string form. Decode the REAL request
    // buffer _send actually received rather than asserting on a pre-decoded
    // object, since cdnAuth.ts no longer hands steam-user a plain object at
    // all — it hands it an already-encoded Buffer.
    await (cdnAuth as CdnAuthTokenCache).getToken('111', 'cdn1.example.com')
    expect(fakeClient._send).toHaveBeenCalledWith(
      {
        msg: 151,
        proto: { target_job_name: 'ContentServerDirectory.GetCDNAuthToken#1' }
      },
      expect.any(Buffer),
      expect.any(Function)
    )
    const sentBody = jest.mocked(fakeClient._send).mock.calls[0][1] as Buffer
    expect(
      CContentServerDirectory_GetCDNAuthToken_Request.decode(sentBody)
    ).toMatchObject({
      app_id: 12345,
      depot_id: 111,
      host_name: 'cdn1.example.com'
    })

    // Debug/steam-install-slow-start (cycle 7): the REAL, live-resolved
    // hostMeta map (built by reduceContentServers from fakeClient's default
    // getContentServers response — { Host: 'cdn1.example.com' }, no
    // https_support/usetokenauth declared) is threaded too — usetokenauth
    // defaults to false (fetchChunk must never call getCDNAuthToken for this
    // host on its own; the call above proves the CACHE itself still works
    // when a caller explicitly invokes getToken directly).
    const hostMeta = callArgs[callArgs.length - 3] as Map<
      string,
      { httpsSupport?: string; usetokenauth?: boolean; type?: string }
    >
    expect(hostMeta.get('cdn1.example.com')).toEqual({
      httpsSupport: undefined,
      usetokenauth: false,
      type: undefined
    })
  })

  it('on failure (SHA1 mismatch): finalizeToSteam is still invoked with whatever landed, and downloadSteamDepots resolves — never throws — with status error', async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: '5',
          // Deliberately never matches whatever fetchChunk actually returns.
          sha_content: 'sha-that-will-never-match',
          chunks: [{ sha: 'chunk-sha', cb_original: 5, offset: 0 }]
        }
      ]
    })
    jest.mocked(fetchChunk).mockResolvedValue(Buffer.from('wrong'))

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
    })

    expect(result.status).toBe('error')
    expect(typeof result.error).toBe('string')
    expect(existsSync(join(dir, 'appmanifest_12345.acf'))).toBe(true)
    const acfText = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(acfText).toMatch(/"StateFlags"\s+"1026"/)
  })

  it('D-02/D-04: on cancel (AbortSignal), finalizeToSteam is still invoked and downloadSteamDepots resolves with status cancelled', async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: '5',
          sha_content: 'irrelevant-for-this-test',
          chunks: [{ sha: 'chunk-sha', cb_original: 5, offset: 0 }]
        }
      ]
    })

    const controller = new AbortController()
    jest.mocked(fetchChunk).mockImplementation(async () => {
      controller.abort()
      return Buffer.from('x')
    })

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows',
      signal: controller.signal
    })

    expect(result.status).toBe('cancelled')
    expect(existsSync(join(dir, 'appmanifest_12345.acf'))).toBe(true)
    const acfText = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(acfText).toMatch(/"StateFlags"\s+"1026"/)
  })

  it('D-UAT-05: a cancel issued WHILE the plan is still being built (e.g. during the CM connect wait) resolves with status cancelled — never error — and never reaches downloadDepotFiles/fetchChunk', async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const controller = new AbortController()
    // Simulate a stop()/cancel() click that lands while ensureConnected()
    // is still resolving — the CM-reconnect-on-restart window this bug was
    // observed in.
    jest.mocked(SteamUser.ensureConnected).mockImplementation(async () => {
      controller.abort()
      return true
    })

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows',
      signal: controller.signal
    })

    expect(result.status).toBe('cancelled')
    expect(fetchChunk).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'appmanifest_12345.acf'))).toBe(true)
  })

  it('D-UAT-06: a transient CM drop during plan-build recovers via reconnect+retry — the install still completes as status done, not error', async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const content = Buffer.from('game-bytes')
    let keyCalls = 0
    jest
      .mocked(fakeClient.getDepotDecryptionKey)
      .mockImplementation(
        (
          _appId: number,
          depotId: number,
          cb: (err: Error | null, key: Buffer) => void
        ) => {
          keyCalls++
          if (keyCalls === 1) {
            cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
            return
          }
          cb(null, Buffer.from(`key-${depotId}`))
        }
      )

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: String(content.length),
          sha_content: sha1Hex(content),
          chunks: [{ sha: 'chunk-sha', cb_original: content.length, offset: 0 }]
        }
      ]
    })
    jest.mocked(fetchChunk).mockResolvedValue(content)

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
    })

    expect(result.status).toBe('done')
    expect(keyCalls).toBe(2)
  })

  it('D-UAT-06: a PERSISTENT CM drop during plan-build exhausts the bounded retry and resolves status error (classified, actionable message) — never cancelled, never an unhandled throw', async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    jest
      .mocked(fakeClient.getDepotDecryptionKey)
      .mockImplementation(
        (
          _appId: number,
          _depotId: number,
          cb: (err: Error | null, key: Buffer) => void
        ) => cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
      )

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
    })

    expect(result.status).toBe('error')
    expect(result.error).toBe(
      classifyDepotError(new Error('ECONNRESET')).message
    )
    // Still converges on finalizeToSteam (Pattern 5) — never left unresolved.
    expect(existsSync(join(dir, 'appmanifest_12345.acf'))).toBe(true)
  })

  it('a thrown plan-orchestration error (e.g. content-server resolution failure) also funnels through finalizeToSteam and NEVER rejects the caller', async () => {
    const fakeClient = makeFakeClient({
      getContentServers: jest
        .fn()
        .mockImplementation(
          (_appId: number, cb: (err: Error | null, servers: unknown) => void) =>
            cb(new Error('no CDN available'), [])
        )
    })
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [{ filename: 'enc-game', size: '5', sha_content: 'x', chunks: [] }]
    })

    const result = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
    })

    expect(result.status).toBe('error')
    expect(existsSync(join(dir, 'appmanifest_12345.acf'))).toBe(true)
  })

  it('never writes StateFlags "4" anywhere in depot.ts (T-21-07)', () => {
    const source = readFileSync(join(__dirname, '../depot.ts'), 'utf8')
    const uncommented = source
      .split('\n')
      .filter(
        (line) => !line.trim().startsWith('//') && !line.trim().startsWith('*')
      )
      .join('\n')
    expect(uncommented).not.toMatch(/"StateFlags"[^\n]*"4"/)
  })

  it('D-07: Retry (re-invoking downloadSteamDepots after a prior partial+1026) overwrites on-disk files without throwing and re-finalizes — no race with the already-written 1026 manifest', async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock(
      'steam-user/components/content_manifest.js'
    )

    // ── First attempt: SHA1 mismatch -> writes an honest 1026 over whatever landed.
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: '5',
          sha_content: 'sha-that-will-never-match',
          chunks: [{ sha: 'chunk-sha', cb_original: 5, offset: 0 }]
        }
      ]
    })
    jest.mocked(fetchChunk).mockResolvedValue(Buffer.from('wrong'))

    const first = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
    })
    expect(first.status).toBe('error')
    const acfBefore = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(acfBefore).toMatch(/"StateFlags"\s+"1026"/)

    // ── Retry: re-invoke from scratch against the SAME directory, now with
    // content that verifies correctly. Steam has not run its own repair pass
    // yet (that only happens when the Steam client itself launches/focuses),
    // so overwriting files + re-finalizing must not throw or race the
    // already-written 1026 manifest.
    const goodContent = Buffer.from('right')
    jest.mocked(contentManifest.parse).mockReturnValue({
      files: [
        {
          filename: 'enc-game',
          size: String(goodContent.length),
          sha_content: sha1Hex(goodContent),
          chunks: [
            { sha: 'chunk-sha', cb_original: goodContent.length, offset: 0 }
          ]
        }
      ]
    })
    jest.mocked(fetchChunk).mockResolvedValue(goodContent)

    const second = await downloadSteamDepots('12345', {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      os: 'windows'
    })
    expect(second.status).toBe('done')

    const written = readFileSync(join(dir, 'common', 'SomeGame', 'game.bin'))
    expect(written.equals(goodContent)).toBe(true)
    const acfAfter = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
    expect(acfAfter).toMatch(/"StateFlags"\s+"1026"/)
  })
})

/**
 * Unit tests for classifyDepotError (Phase 21-06, D-06) — maps the
 * downloader's failure modes to plain-language, actionable copy. Accepts
 * either a real Error (thrown plan-orchestration failures) or a plain string
 * (downloadDepotFiles's DepotDownloadFailure.error is already a string by
 * the time it reaches the caller).
 */
describe('formatEta (D-UAT-02)', () => {
  it('formats seconds as zero-padded HH:MM:SS', () => {
    expect(formatEta(0)).toBe('00:00:00')
    expect(formatEta(47)).toBe('00:00:47')
    expect(formatEta(1247)).toBe('00:20:47') // was the unreadable "1247s"
    expect(formatEta(3723)).toBe('01:02:03')
    expect(formatEta(90061)).toBe('25:01:01')
  })

  it('never emits negative time (clamps to 0)', () => {
    expect(formatEta(-5)).toBe('00:00:00')
  })
})

describe('rollingRateMiBs', () => {
  const MIB = 1024 * 1024

  it('computes an instantaneous MiB/s rate over the given window', () => {
    // 5 MiB transferred in 500ms => 10 MiB/s.
    expect(rollingRateMiBs(5 * MIB, 500, 0)).toBeCloseTo(10)
  })

  it('reports 0 during a stall (no bytes this window), not the previous rate', () => {
    // Regression: the old cumulative-average never dropped to 0 while stalled.
    expect(rollingRateMiBs(0, 500, 42)).toBe(0)
  })

  it('reuses the previous rate when the window is too small to be meaningful', () => {
    // A forced emit landing right on top of a throttled one (~0ms) must not
    // divide by a near-zero window and produce a garbage spike.
    expect(rollingRateMiBs(1 * MIB, 1, 7.5)).toBe(7.5)
  })

  it('never returns a negative rate', () => {
    expect(rollingRateMiBs(-1 * MIB, 500, 3)).toBe(0)
  })
})

// Debug/steam-install-slow-start (cycle 5): pure reduction of the raw
// getContentServers directory response into {hosts, weightedLoads} —
// extracted so the weightedload-threading fix is testable without a live CM
// round-trip. See depot/hostHealth.test.ts for how weightedLoads then seeds
// HostHealthTracker's cold-start PRIOR.
describe('reduceContentServers', () => {
  it('maps Host to hostname and threads a numeric weightedload into the parallel map', () => {
    const servers: RawContentServer[] = [
      { Host: 'cache1-akl-tpwr.steamcontent.com', weightedload: 37 },
      { Host: 'cache2-akl-tpwr.steamcontent.com', weightedload: 48 }
    ]
    const { hosts, weightedLoads } = reduceContentServers(servers)
    expect(hosts).toEqual([
      'cache1-akl-tpwr.steamcontent.com',
      'cache2-akl-tpwr.steamcontent.com'
    ])
    expect(weightedLoads.get('cache1-akl-tpwr.steamcontent.com')).toBe(37)
    expect(weightedLoads.get('cache2-akl-tpwr.steamcontent.com')).toBe(48)
  })

  it('falls back to vhost when Host is absent', () => {
    const servers: RawContentServer[] = [
      { vhost: 'fastly.cdn.steampipe.steamcontent.com' }
    ]
    const { hosts } = reduceContentServers(servers)
    expect(hosts).toEqual(['fastly.cdn.steampipe.steamcontent.com'])
  })

  it('skips a server with neither Host nor vhost, never producing an empty-string/undefined hostname', () => {
    const servers: RawContentServer[] = [
      { weightedload: 130 },
      { Host: 'steampipe.akamaized.net', weightedload: 130 }
    ]
    const { hosts, weightedLoads } = reduceContentServers(servers)
    expect(hosts).toEqual(['steampipe.akamaized.net'])
    expect(weightedLoads.size).toBe(1)
  })

  it('omits a host from weightedLoads entirely when the field is missing or non-finite — never invents a synthetic worst-case ranking', () => {
    const servers: RawContentServer[] = [
      { Host: 'no-weightedload-field.example' },
      { Host: 'nan-weightedload.example', weightedload: Number.NaN },
      { Host: 'good.example', weightedload: 20 }
    ]
    const { weightedLoads } = reduceContentServers(servers)
    expect(weightedLoads.has('no-weightedload-field.example')).toBe(false)
    expect(weightedLoads.has('nan-weightedload.example')).toBe(false)
    expect(weightedLoads.get('good.example')).toBe(20)
  })

  // Debug/steam-install-slow-start (cycle 8): the REAL directory response
  // returns weightedload/load as STRINGS ("130", "20", ...), not numbers —
  // this is the regression that slipped through cycles 5-7 (their fixtures
  // only ever used numeric weightedload values, so `weightedLoads=0` on
  // every real hardware run went undetected by the test suite).
  it('coerces STRING-valued weightedload into a number, so weightedLoads is populated from a real (string-typed) directory response', () => {
    const servers: RawContentServer[] = [
      { Host: 'cache1-akl-edgx.steamcontent.com', weightedload: '20' },
      { Host: 'cache1-akl-tpwr.steamcontent.com', weightedload: '37' },
      { Host: 'cache2-akl-tpwr.steamcontent.com', weightedload: '48' },
      { Host: 'steampipe.akamaized.net', weightedload: '130' },
      { Host: 'alibaba.cdn.steampipe.steamcontent.com', weightedload: '130' },
      { Host: 'fastly.cdn.steampipe.steamcontent.com', weightedload: '130' }
    ]
    const { hosts, weightedLoads } = reduceContentServers(servers)
    expect(weightedLoads.size).toBe(hosts.length)
    expect(weightedLoads.get('cache1-akl-edgx.steamcontent.com')).toBe(20)
    expect(weightedLoads.get('cache1-akl-tpwr.steamcontent.com')).toBe(37)
    expect(weightedLoads.get('cache2-akl-tpwr.steamcontent.com')).toBe(48)
    expect(weightedLoads.get('steampipe.akamaized.net')).toBe(130)
    expect(weightedLoads.get('alibaba.cdn.steampipe.steamcontent.com')).toBe(
      130
    )
    expect(weightedLoads.get('fastly.cdn.steampipe.steamcontent.com')).toBe(130)
  })

  it('omits a host from weightedLoads when weightedload is a non-numeric string, without throwing', () => {
    const servers: RawContentServer[] = [
      { Host: 'bad-string.example', weightedload: 'not-a-number' },
      { Host: 'empty-string.example', weightedload: '' },
      { Host: 'good.example', weightedload: '20' }
    ]
    const { weightedLoads } = reduceContentServers(servers)
    expect(weightedLoads.has('bad-string.example')).toBe(false)
    // Number('') === 0, which IS finite — an empty string coerces to the
    // (arguably degenerate but not wrong) value 0, exactly matching
    // Number(...)'s own documented coercion behavior; not special-cased.
    expect(weightedLoads.get('empty-string.example')).toBe(0)
    expect(weightedLoads.get('good.example')).toBe(20)
  })

  it('preserves the directory response order in the returned hosts array', () => {
    const servers: RawContentServer[] = [
      { Host: 'z-host.example', weightedload: 1 },
      { Host: 'a-host.example', weightedload: 2 }
    ]
    const { hosts } = reduceContentServers(servers)
    expect(hosts).toEqual(['z-host.example', 'a-host.example'])
  })

  // Debug/steam-install-slow-start (cycle 7): hostMeta (https_support +
  // usetokenauth) — the data fetchChunk needs for EXACT steam-user
  // URL-scheme/token parity. See depot/decompress.ts's fetchChunk.
  it('threads https_support into the hostMeta map, keyed by hostname', () => {
    const servers: RawContentServer[] = [
      { Host: 'cache1-akl-tpwr.steamcontent.com', https_support: 'mandatory' },
      // The real cycle-5 hardware diagnosis's directory response for
      // alibaba.cdn.steampipe.steamcontent.com.
      {
        Host: 'alibaba.cdn.steampipe.steamcontent.com',
        https_support: 'unavailable'
      }
    ]
    const { hostMeta } = reduceContentServers(servers)
    expect(hostMeta.get('cache1-akl-tpwr.steamcontent.com')?.httpsSupport).toBe(
      'mandatory'
    )
    expect(
      hostMeta.get('alibaba.cdn.steampipe.steamcontent.com')?.httpsSupport
    ).toBe('unavailable')
  })

  it("maps usetokenauth === 1 to true (steam-user's own `== 1` gate, not a loose truthy check) and every other value (absent/0/other) to false", () => {
    const servers: RawContentServer[] = [
      { Host: 'wants-token.example', usetokenauth: 1 },
      { Host: 'no-usetokenauth-field.example' },
      { Host: 'zero-usetokenauth.example', usetokenauth: 0 }
    ]
    const { hostMeta } = reduceContentServers(servers)
    expect(hostMeta.get('wants-token.example')?.usetokenauth).toBe(true)
    expect(hostMeta.get('no-usetokenauth-field.example')?.usetokenauth).toBe(
      false
    )
    expect(hostMeta.get('zero-usetokenauth.example')?.usetokenauth).toBe(false)
  })

  it('every host present in `hosts` has a corresponding hostMeta entry, even when https_support/usetokenauth/type are all absent from the raw server', () => {
    const servers: RawContentServer[] = [{ Host: 'bare-host.example' }]
    const { hosts, hostMeta } = reduceContentServers(servers)
    expect(hosts).toEqual(['bare-host.example'])
    expect(hostMeta.has('bare-host.example')).toBe(true)
    expect(hostMeta.get('bare-host.example')).toEqual({
      httpsSupport: undefined,
      usetokenauth: false,
      type: undefined
    })
  })

  // CDN-auth implementation cycle, PART 2: `type` threads into hostMeta so
  // decompress.ts's `wantsCdnAuthToken` can widen the token gate to
  // `type === 'CDN'` -- see the RESEARCH SPIKE's content_log.txt finding
  // (real client authenticates on every type=CDN host unconditionally,
  // regardless of the never-populated usetokenauth flag).
  it("threads the raw server's `type` (CDN vs SteamCache) into the hostMeta map, keyed by hostname", () => {
    const servers: RawContentServer[] = [
      { Host: 'alibaba.cdn.steampipe.steamcontent.com', type: 'CDN' },
      { Host: 'cache1-akl-tpwr.steamcontent.com', type: 'SteamCache' }
    ]
    const { hostMeta } = reduceContentServers(servers)
    expect(hostMeta.get('alibaba.cdn.steampipe.steamcontent.com')?.type).toBe(
      'CDN'
    )
    expect(hostMeta.get('cache1-akl-tpwr.steamcontent.com')?.type).toBe(
      'SteamCache'
    )
  })
})

/**
 * Debug/steam-install-slow-start (cycle 7, PART 3): completion robustness —
 * a single chunk exhausting fetchChunk's CHUNK_FETCH_ATTEMPTS budget must
 * re-queue (not abort the whole file) as long as the download run overall
 * hasn't stalled; only a genuine, sustained run-wide stall gives up
 * honestly. `downloadFileChunks` is exported (cycle 7) specifically so this
 * behavior is directly testable without going through the full
 * downloadDepotFiles/downloadSteamDepots stack.
 */
describe('downloadFileChunks (cycle 7): completion robustness via StallTracker', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-depot-chunks-test-'))
    filePath = join(dir, 'out.bin')
    writeFileSync(filePath, Buffer.alloc(20))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function makeFile(): DepotPlanFile {
    return {
      filename: 'out.bin',
      size: 20,
      sha_content: 'unused-in-this-suite',
      chunks: [
        { sha: 'sha-a', cb_original: 10, offset: 0 },
        { sha: 'sha-b', cb_original: 10, offset: 10 }
      ]
    }
  }

  it("re-queues a chunk that exhausts fetchChunk's attempts instead of aborting the whole file, as long as the run has not stalled", async () => {
    let shaAAttempts = 0
    jest
      .mocked(fetchChunk)
      .mockImplementation(async (_hosts, _depotId, chunk) => {
        if (chunk.sha === 'sha-a') {
          shaAAttempts++
          if (shaAAttempts < 3) {
            throw new Error(
              `chunk sha-a failed after ${CHUNK_FETCH_ATTEMPTS} attempts: ECONNRESET`
            )
          }
          return Buffer.alloc(10, 'a')
        }
        return Buffer.alloc(10, 'b')
      })

    const fd = await open(filePath, 'r+')
    // Never stalls in this test -- 1 hour is far beyond anything a fast
    // unit test could accumulate.
    const stallTracker = new StallTracker(60 * 60 * 1000)
    try {
      await downloadFileChunks(
        fd,
        '111',
        Buffer.from('key'),
        ['cdn1.example.com'],
        undefined as unknown as LzmaModule,
        makeFile(),
        0,
        undefined,
        () => {},
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        stallTracker
      )
    } finally {
      await fd.close()
    }

    // sha-a exhausted fetchChunk's attempts TWICE (calls 1 and 2) and was
    // re-queued both times rather than aborting the whole file -- it only
    // succeeded on the 3rd pass.
    expect(shaAAttempts).toBe(3)
  })

  // Debug/steam-install-slow-start (cycle 17, retry-storm resilience): a
  // decode-stage failure (fetchChunk's final exhausted-attempts error
  // carrying a ChunkDecodeError `.code`, e.g. unknown_container) is
  // DETERMINISTIC given (ciphertext, key) -- re-queuing it for another pass,
  // exactly like the PREVIOUS test does for a genuinely transient network
  // error, can never succeed. This is the fix for the hardware-observed
  // retry storm (11,063 total attempt rotations in one run; 555 on a single
  // chunk alone). Contrast with the test above: same stallTracker
  // configuration (never stalls), but this chunk must fail on the FIRST
  // exhaustion, not the third.
  it('does NOT re-queue a chunk whose fetchChunk exhaustion carries a decode-stage .code (e.g. unknown_container) -- fails immediately even though the run has not stalled', async () => {
    let shaAAttempts = 0
    jest
      .mocked(fetchChunk)
      .mockImplementation(async (_hosts, _depotId, chunk) => {
        if (chunk.sha === 'sha-a') {
          shaAAttempts++
          const err = new Error(
            `chunk sha-a failed after ${CHUNK_FETCH_ATTEMPTS} attempts: unknown chunk container`
          ) as Error & { code?: string }
          err.code = 'unknown_container'
          throw err
        }
        return Buffer.alloc(10, 'b')
      })

    const fd = await open(filePath, 'r+')
    // Never stalls -- if the decode-stage guard were NOT in place, this
    // chunk would be re-queued indefinitely (the exact retry-storm bug).
    const stallTracker = new StallTracker(60 * 60 * 1000)
    try {
      await expect(
        downloadFileChunks(
          fd,
          '111',
          Buffer.from('key'),
          ['cdn1.example.com'],
          undefined as unknown as LzmaModule,
          makeFile(),
          0,
          undefined,
          () => {},
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          stallTracker
        )
      ).rejects.toThrow(/unknown chunk container/)
    } finally {
      await fd.close()
    }

    // Failed on the VERY FIRST exhaustion -- never re-queued, because the
    // failure was decode-stage (deterministic), not network (transient).
    expect(shaAAttempts).toBe(1)
  })

  it('gives up honestly (throws) once the run has genuinely stalled, rather than re-queuing forever', async () => {
    let shaAAttempts = 0
    jest
      .mocked(fetchChunk)
      .mockImplementation(async (_hosts, _depotId, chunk) => {
        if (chunk.sha === 'sha-a') {
          shaAAttempts++
          throw new Error(
            `chunk sha-a failed after ${CHUNK_FETCH_ATTEMPTS} attempts: ECONNRESET`
          )
        }
        return Buffer.alloc(10, 'b')
      })

    const fd = await open(filePath, 'r+')
    // A negative timeout means hasStalled() is true for ANY elapsed time
    // (including 0ms) -- deterministically "already stalled" from the very
    // first exhaustion, without needing to wait for a real stall window.
    const stallTracker = new StallTracker(-1)
    try {
      await expect(
        downloadFileChunks(
          fd,
          '111',
          Buffer.from('key'),
          ['cdn1.example.com'],
          undefined as unknown as LzmaModule,
          makeFile(),
          0,
          undefined,
          () => {},
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          stallTracker
        )
      ).rejects.toThrow(/failed after \d+ attempts[\s\S]*download stalled/)
    } finally {
      await fd.close()
    }

    // Gave up on the VERY FIRST exhaustion -- never re-queued, because the
    // run was already stalled.
    expect(shaAAttempts).toBe(1)
  })

  it('omitting stallTracker (every pre-cycle-7 caller/test) preserves the exact pre-cycle-7 behavior: a chunk exhausting its attempts immediately fails the whole file, no retry', async () => {
    let shaAAttempts = 0
    jest
      .mocked(fetchChunk)
      .mockImplementation(async (_hosts, _depotId, chunk) => {
        if (chunk.sha === 'sha-a') {
          shaAAttempts++
          throw new Error(
            `chunk sha-a failed after ${CHUNK_FETCH_ATTEMPTS} attempts: ECONNRESET`
          )
        }
        return Buffer.alloc(10, 'b')
      })

    const fd = await open(filePath, 'r+')
    try {
      await expect(
        downloadFileChunks(
          fd,
          '111',
          Buffer.from('key'),
          ['cdn1.example.com'],
          undefined as unknown as LzmaModule,
          makeFile(),
          0,
          undefined,
          () => {}
          // decode, onAttempt, hostHealth, cdnAuth, hostMeta, stallTracker: all omitted.
        )
      ).rejects.toThrow(/failed after \d+ attempts/)
    } finally {
      await fd.close()
    }

    expect(shaAAttempts).toBe(1)
  })

  it('a user cancel (signal.aborted) still exits promptly even while a chunk would otherwise be re-queued, never spinning on a stale abort', async () => {
    const controller = new AbortController()
    let shaAAttempts = 0
    jest
      .mocked(fetchChunk)
      .mockImplementation(async (_hosts, _depotId, chunk) => {
        if (chunk.sha === 'sha-a') {
          shaAAttempts++
          // Simulates a user cancel arriving at the exact moment this chunk's
          // attempts are exhausted.
          controller.abort()
          throw new Error(
            `chunk sha-a failed after ${CHUNK_FETCH_ATTEMPTS} attempts: ECONNRESET`
          )
        }
        return Buffer.alloc(10, 'b')
      })

    const fd = await open(filePath, 'r+')
    const stallTracker = new StallTracker(60 * 60 * 1000)
    try {
      await downloadFileChunks(
        fd,
        '111',
        Buffer.from('key'),
        ['cdn1.example.com'],
        undefined as unknown as LzmaModule,
        makeFile(),
        0,
        controller.signal,
        () => {},
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        stallTracker
      )
    } finally {
      await fd.close()
    }

    // Aborted right after sha-a's first exhaustion -- D-UAT-05/06: a user
    // cancel must still cancel promptly, even mid re-queue-eligible failure,
    // never re-queued/retried again despite stallTracker never reporting a
    // stall (the run was cancelled, not wedged).
    expect(shaAAttempts).toBe(1)
  })

  // debug/steam-cancel-abort-thread-a: downloadFileChunks previously checked
  // `signal?.aborted` before/after calling fetchChunk, but NEVER passed
  // `signal` INTO fetchChunk itself — fetchChunk had no way to observe a
  // cancel while it was mid-retry/mid-backoff, which is the root cause of
  // the hardware-observed ~62s hang. Proves the wiring fix: the exact same
  // `signal` this call received is forwarded as fetchChunk's own `signal`
  // argument (its second-to-last positional parameter — Phase 25 appended a
  // trailing `workerSlot` after it).
  it('forwards its own `signal` parameter through to every fetchChunk call (Thread A wiring fix)', async () => {
    const controller = new AbortController()
    jest.mocked(fetchChunk).mockResolvedValue(Buffer.alloc(10))

    const fd = await open(filePath, 'r+')
    try {
      await downloadFileChunks(
        fd,
        '111',
        Buffer.from('key'),
        ['cdn1.example.com'],
        undefined as unknown as LzmaModule,
        makeFile(),
        0,
        controller.signal,
        () => {}
        // decode, onAttempt, hostHealth, cdnAuth, hostMeta, stallTracker: all omitted.
      )
    } finally {
      await fd.close()
    }

    expect(fetchChunk).toHaveBeenCalled()
    for (const callArgs of jest.mocked(fetchChunk).mock.calls) {
      expect(callArgs[callArgs.length - 2]).toBe(controller.signal)
    }
  })
})

describe('classifyDepotError', () => {
  it('maps an ENOSPC error to a disk-full message', () => {
    const result = classifyDepotError(
      new Error('ENOSPC: no space left on device, write')
    )
    expect(result.message).toMatch(/disk space/i)
  })

  it('maps a CDN/connection-exhausted error to a "Steam servers dropped the connection" message', () => {
    const result = classifyDepotError(
      new Error('chunk abc123 failed after 4 attempts: CDN 503')
    )
    expect(result.message).toMatch(/steam servers dropped the connection/i)
  })

  it('maps a path-traversal rejection to its own message', () => {
    const result = classifyDepotError(
      'downloadDepotFiles: rejected path-traversal filename "../../evil.txt" (escapes /tmp/x)'
    )
    expect(result.message).toMatch(/unsafe file path/i)
  })

  it('maps a whole-file SHA1 mismatch to a verify message', () => {
    const result = classifyDepotError(
      'downloadDepotFiles: whole-file SHA1 mismatch for game.bin: abc123 != def456'
    )
    expect(result.message).toMatch(/failed verification/i)
  })

  it('falls back to a generic message for an unrecognized error', () => {
    const result = classifyDepotError(
      new Error('something totally unexpected happened')
    )
    expect(result.message).toMatch(/steam download failed/i)
  })

  it('accepts a plain string (DepotDownloadFailure.error shape), not only Error instances', () => {
    const result = classifyDepotError('ENOSPC: no space left on device')
    expect(result.message).toMatch(/disk space/i)
  })

  it('D-UAT-08: a wrapDepotKeyError-shaped message carrying a terminal `.eresult` is classified as depot-unavailable, NEVER "connection dropped", and embeds the depot/app-id detail', () => {
    const err = new Error(
      "couldn't get decryption key for depot 1460472 (app 54321): FileNotFound"
    ) as Error & { eresult?: number }
    err.eresult = 9 // FileNotFound — wrapDepotKeyError preserves this from the original steam-user error
    const result = classifyDepotError(err)
    expect(result.message).not.toMatch(/dropped the connection/i)
    expect(result.key).toBe('steam.download.error.depotUnavailable')
    expect(result.message).toMatch(/1460472/)
    expect(result.message).toMatch(/54321/)
  })

  it('D-UAT-08: an Error carrying a terminal `.eresult` (e.g. AccessDenied=15) is classified as depot-unavailable even without the wrapped message text', () => {
    const err = new Error('AccessDenied') as Error & { eresult?: number }
    err.eresult = 15
    const result = classifyDepotError(err)
    expect(result.key).toBe('steam.download.error.depotUnavailable')
    expect(result.message).not.toMatch(/dropped the connection/i)
  })

  it('D-UAT-08: a getDepotDecryptionKey failure with NO eresult (e.g. a genuine transient ECONNRESET, still wrapped with depot/app context) falls through to the connection-dropped classification, unchanged from before', () => {
    const result = classifyDepotError(
      new Error(
        "couldn't get decryption key for depot 111 (app 12345): ECONNRESET"
      )
    )
    expect(result.key).toBe('steam.download.error.connectionDropped')
    expect(result.message).toMatch(/dropped the connection/i)
  })
})

describe('isNonRetryableDepotError', () => {
  it('returns true for each terminal EResult (FileNotFound=9, AccessDenied=15, and peers)', () => {
    for (const eresult of [8, 9, 15, 17, 40, 42, 43]) {
      const err = new Error('x') as Error & { eresult?: number }
      err.eresult = eresult
      expect(isNonRetryableDepotError(err)).toBe(true)
    }
  })

  it('returns false for an error with no eresult property (e.g. ECONNRESET) — stays retryable', () => {
    expect(isNonRetryableDepotError(new Error('ECONNRESET'))).toBe(false)
  })

  it('returns false for an eresult NOT in the terminal set (e.g. a transient server-side code)', () => {
    const err = new Error('x') as Error & { eresult?: number }
    err.eresult = 2 // Fail — generic, not in the terminal set
    expect(isNonRetryableDepotError(err)).toBe(false)
  })

  it('returns false for non-object/non-Error values', () => {
    expect(isNonRetryableDepotError('plain string')).toBe(false)
    expect(isNonRetryableDepotError(null)).toBe(false)
    expect(isNonRetryableDepotError(undefined)).toBe(false)
  })
})

/**
 * Unit tests for downloadDepotFiles (Phase 21-05) — the streaming chunk-
 * download loop. Runs against a REAL tmpdir (manifest.test.ts's established
 * precedent: node:fs/promises exports are non-configurable getters under
 * this project's ts-jest/CJS interop, so open/write/mkdir cannot be reliably
 * mocked without breaking the underlying real I/O). Only the network-
 * dependent fetchChunk and the frontend IPC emit are mocked.
 */
describe('downloadDepotFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-depot-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const HOSTS = ['cdn1.example.com']

  function sha1Hex(buf: Buffer): string {
    return createHash('sha1').update(buf).digest('hex')
  }

  function makePlan(
    depots: DepotPlan['depots'],
    totalBytes: number
  ): DepotPlan {
    return { appId: '12345', depots, totalBytes, name: 'SomeGame' }
  }

  it('streams chunks to disk via positional writes at their exact offsets (no whole-file Buffer.alloc)', async () => {
    const chunkA = Buffer.from('AAAA') // 4 bytes at offset 0
    const chunkB = Buffer.from('BBBBBB') // 6 bytes at offset 4
    const content = Buffer.concat([chunkA, chunkB])

    const file: DepotPlanFile = {
      filename: 'game.bin',
      size: content.length,
      sha_content: sha1Hex(content),
      chunks: [
        { sha: 'sha-a', cb_original: chunkA.length, offset: 0 },
        { sha: 'sha-b', cb_original: chunkB.length, offset: chunkA.length }
      ]
    }

    jest
      .mocked(fetchChunk)
      .mockImplementation(async (_hosts, _depotId, chunk) =>
        chunk.sha === 'sha-a' ? chunkA : chunkB
      )

    const plan = makePlan(
      [{ depotId: '111', gid: 'g1', key: Buffer.from('key'), files: [file] }],
      content.length
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(result.outcome).toBe('completed')
    expect(result.failures).toEqual([])

    const written = readFileSync(join(dir, 'common', 'SomeGame', 'game.bin'))
    expect(written.equals(content)).toBe(true)
    // Positional proof: byte 0 is chunkA's first byte, byte 4 (chunkA.length) is chunkB's first byte.
    expect(written.subarray(0, 4).toString()).toBe('AAAA')
    expect(written.subarray(4, 10).toString()).toBe('BBBBBB')
  })

  it('bounds chunk fetches within a single file to CHUNK_CONCURRENCY — never fires an unbounded Promise.all over all chunks', async () => {
    const CHUNK_SIZE = 4
    const CHUNK_COUNT = 50
    const chunkBuf = Buffer.alloc(CHUNK_SIZE, 7)

    let active = 0
    let peak = 0
    jest.mocked(fetchChunk).mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return chunkBuf
    })

    const chunks = Array.from({ length: CHUNK_COUNT }, (_, i) => ({
      sha: `sha-${i}`,
      cb_original: CHUNK_SIZE,
      offset: i * CHUNK_SIZE
    }))

    const file: DepotPlanFile = {
      filename: 'many-chunks.bin',
      size: CHUNK_SIZE * CHUNK_COUNT,
      // Deliberately mismatched — this test only cares about bounded
      // concurrency, not whole-file integrity (a real mismatch is simply
      // recorded as a failure, which does not affect the assertions below).
      sha_content: 'irrelevant-for-this-test',
      chunks
    }

    const plan = makePlan(
      [{ depotId: '222', gid: 'g2', key: Buffer.from('key'), files: [file] }],
      CHUNK_SIZE * CHUNK_COUNT
    )

    await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(peak).toBeLessThanOrEqual(CHUNK_CONCURRENCY)
    expect(peak).toBeGreaterThan(1) // proves real concurrency, not a serial loop
    expect(jest.mocked(fetchChunk)).toHaveBeenCalledTimes(CHUNK_COUNT)
  })

  it('T-21-01: rejects a "../"-escaping filename before any write — no file is created outside common/{installdir}', async () => {
    const file: DepotPlanFile = {
      filename: '../../evil.txt',
      size: 0,
      sha_content: '',
      chunks: []
    }
    const plan = makePlan(
      [{ depotId: '333', gid: 'g3', key: Buffer.from('key'), files: [file] }],
      0
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].error).toMatch(/traversal/i)
    expect(existsSync(join(dir, 'evil.txt'))).toBe(false)
  })

  it('surfaces a whole-file SHA1 mismatch as a failure, not a silently accepted download', async () => {
    const content = Buffer.from('correct-content')
    jest.mocked(fetchChunk).mockResolvedValue(content)

    const file: DepotPlanFile = {
      filename: 'bad-hash.bin',
      size: content.length,
      sha_content: sha1Hex(Buffer.from('DIFFERENT CONTENT')), // deliberately wrong
      chunks: [{ sha: 'sha-x', cb_original: content.length, offset: 0 }]
    }
    const plan = makePlan(
      [{ depotId: '444', gid: 'g4', key: Buffer.from('key'), files: [file] }],
      content.length
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].file).toBe('bad-hash.bin')
    expect(result.failures[0].error).toMatch(/sha1 mismatch/i)
  })

  it('never RAM-buffers a whole file (no Buffer.alloc(Number(file.size)) grep gate)', () => {
    const source = readFileSync(join(__dirname, '../depot.ts'), 'utf8')
    expect(source).not.toContain('Buffer.alloc(Number(file.size))')
    expect(source).not.toContain('Buffer.alloc(Number(f.size))')
    expect(source).toMatch(/truncate/)
    expect(source).toMatch(/relative\(/)
    // The chunk loop must NOT be an unbounded Promise.all over all chunks.
    expect(source).not.toMatch(/Promise\.all\(\s*file\.chunks\.map/)
  })

  it('emits throttled progressUpdate into the DownloadManager queue; percent denominator is the multi-depot SUMMED total (D-01/D-03)', async () => {
    const chunkBuf = Buffer.from('x')
    jest.mocked(fetchChunk).mockResolvedValue(chunkBuf)

    // Depot A's single file is 1 of 400 total bytes — proves the percent
    // denominator is the SUM across both depots, not depot A's own total.
    const fileA: DepotPlanFile = {
      filename: 'a.bin',
      size: 1,
      sha_content: sha1Hex(chunkBuf),
      chunks: [{ sha: 's-a', cb_original: 1, offset: 0 }]
    }
    const fileB: DepotPlanFile = {
      filename: 'b.bin',
      size: 1,
      sha_content: sha1Hex(chunkBuf),
      chunks: [{ sha: 's-b', cb_original: 1, offset: 0 }]
    }

    const plan: DepotPlan = {
      appId: '12345',
      name: 'SomeGame',
      depots: [
        { depotId: '111', gid: 'g1', key: Buffer.from('key'), files: [fileA] },
        { depotId: '222', gid: 'g2', key: Buffer.from('key'), files: [fileB] }
      ],
      // Artificially large vs. the 2-byte real payload — forces the throttle
      // to hold every emit but the final forced one, proving emits are
      // throttled rather than fired per-chunk.
      totalBytes: 400
    }

    await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    const mockedSend = sendFrontendMessage as jest.Mock
    const calls = mockedSend.mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    // Fewer emits than chunks (2 chunks total, forced-final emit still fires).
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.length).toBeLessThan(2)

    const [, payload] = calls[calls.length - 1] as [
      string,
      Record<string, unknown>
    ]
    expect(payload).toMatchObject({
      appName: '12345',
      runner: 'steam',
      status: 'installing'
    })
    const progress = payload.progress as Record<string, unknown>
    // Both files done -> 2/400 rounds to 1%, denominator is the SUMMED total.
    expect(progress.percent).toBe(1)
    // D-UAT-02: downSpeed is a MiB/s number (not raw bytes/sec), eta is
    // HH:MM:SS or empty (never the old raw `${sec}s`).
    expect(typeof progress.downSpeed).toBe('number')
    expect(
      progress.eta === '' || /^\d{2}:\d{2}:\d{2}$/.test(progress.eta as string)
    ).toBe(true)
  })

  it('D-02: halts new chunk fetches once AbortSignal fires and returns a cancelled outcome promptly', async () => {
    const controller = new AbortController()
    jest.mocked(fetchChunk).mockImplementation(async () => {
      controller.abort()
      return Buffer.from('x')
    })

    const chunks = Array.from({ length: 5 }, (_, i) => ({
      sha: `sha-${i}`,
      cb_original: 1,
      offset: i
    }))
    const file: DepotPlanFile = {
      filename: 'abort-me.bin',
      size: 5,
      sha_content: 'irrelevant',
      chunks
    }
    const plan = makePlan(
      [{ depotId: '555', gid: 'g5', key: Buffer.from('key'), files: [file] }],
      5
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS,
      signal: controller.signal
    })

    expect(result.outcome).toBe('cancelled')
    // The abort fires inside the very first fetchChunk call; every other
    // worker must observe signal.aborted before issuing its own fetch.
    expect(jest.mocked(fetchChunk).mock.calls.length).toBeLessThan(
      chunks.length
    )
  })

  // ── CR-01 gap closure (21-13): Directory/Symlink manifest entries ──────────
  it('CR-01: a Directory manifest entry (flags: 64, size 0, no chunks) is written as a real directory, never an empty regular file', async () => {
    const dirEntry: DepotPlanFile = {
      filename: 'bin',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 64
    }
    const plan = makePlan(
      [
        {
          depotId: '666',
          gid: 'g6',
          key: Buffer.from('key'),
          files: [dirEntry]
        }
      ],
      0
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(result.failures).toEqual([])
    const stat = lstatSync(join(dir, 'common', 'SomeGame', 'bin'))
    expect(stat.isDirectory()).toBe(true)
  })

  it('CR-01: a Directory entry AND a child regular file both succeed regardless of processing order (the ENOTDIR/EISDIR regression)', async () => {
    const content = Buffer.from('exe-bytes')
    jest.mocked(fetchChunk).mockResolvedValue(content)

    const dirEntry: DepotPlanFile = {
      filename: 'bin',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 64
    }
    const childFile: DepotPlanFile = {
      filename: 'bin/game.exe',
      size: content.length,
      sha_content: sha1Hex(content),
      chunks: [{ sha: 'sha-exe', cb_original: content.length, offset: 0 }]
    }
    const plan = makePlan(
      [
        {
          depotId: '667',
          gid: 'g6b',
          key: Buffer.from('key'),
          files: [dirEntry, childFile]
        }
      ],
      content.length
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(result.failures).toEqual([])
    const binStat = lstatSync(join(dir, 'common', 'SomeGame', 'bin'))
    expect(binStat.isDirectory()).toBe(true)
    const exeStat = lstatSync(
      join(dir, 'common', 'SomeGame', 'bin', 'game.exe')
    )
    expect(exeStat.isFile()).toBe(true)
  })

  it('CR-01: a Symlink manifest entry (flags: 512, linktarget) is written as a real symlink pointing at its manifest LinkTarget', async () => {
    const symlinkEntry: DepotPlanFile = {
      filename: 'game.lnkname',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 512,
      linktarget: 'game.exe'
    }
    const plan = makePlan(
      [
        {
          depotId: '668',
          gid: 'g6c',
          key: Buffer.from('key'),
          files: [symlinkEntry]
        }
      ],
      0
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(result.failures).toEqual([])
    const linkPath = join(dir, 'common', 'SomeGame', 'game.lnkname')
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(linkPath)).toBe('game.exe')
  })

  it('CR-02: re-running an install over an already-created symlink succeeds (idempotent, no EEXIST) — preserves the D-07 retry guarantee', async () => {
    const symlinkEntry: DepotPlanFile = {
      filename: 'game.lnkname',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 512,
      linktarget: 'game.exe'
    }
    const plan = makePlan(
      [
        {
          depotId: '66a',
          gid: 'g6e',
          key: Buffer.from('key'),
          files: [symlinkEntry]
        }
      ],
      0
    )
    const opts = {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    }

    const first = await downloadDepotFiles(plan, opts)
    expect(first.failures).toEqual([])
    // Second pass over the same target — a symlink already exists on disk.
    const second = await downloadDepotFiles(plan, opts)
    expect(second.failures).toEqual([])
    const linkPath = join(dir, 'common', 'SomeGame', 'game.lnkname')
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(linkPath)).toBe('game.exe')
  })

  it('CR-01: a symlink whose resolved target escapes the install root is rejected (PathTraversalError), never created', async () => {
    const evilSymlink: DepotPlanFile = {
      filename: 'game.lnkname',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 512,
      linktarget: '../../evil'
    }
    const plan = makePlan(
      [
        {
          depotId: '669',
          gid: 'g6d',
          key: Buffer.from('key'),
          files: [evilSymlink]
        }
      ],
      0
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].error).toMatch(/traversal|escapes/i)
    expect(existsSync(join(dir, 'common', 'SomeGame', 'game.lnkname'))).toBe(
      false
    )
  })

  it("WR-02 (23-code-review): a backslash-separated relative linktarget is normalized before the containment check, consistent with resolveContainedPath's own filename normalization — a backslash-encoded traversal attempt is rejected, not silently accepted as one literal (non-traversing) path component", async () => {
    // The symlink lives one directory below installRoot (sub/game.lnkname)
    // so dirname(dest) !== installRoot and the naive relToRoot.startsWith('..')
    // string check can't accidentally catch this by coincidence. Without
    // normalizing '\' to '/' first, resolve() on POSIX treats the whole
    // target as ONE opaque path segment (no real separator present), so
    // '..\\..\\evil' resolves relative to installRoot as "sub/..\\..\\evil"
    // (starts with "sub", NOT rejected) rather than two real parent-directory
    // hops. With normalization (matching resolveContainedPath's own
    // convention for filenames), it correctly resolves to "../evil" and is
    // rejected as an escape attempt.
    const evilBackslashSymlink: DepotPlanFile = {
      filename: 'sub/game.lnkname',
      size: 0,
      sha_content: '',
      chunks: [],
      flags: 512,
      linktarget: '..\\..\\evil'
    }
    const plan = makePlan(
      [
        {
          depotId: '66b',
          gid: 'g6f',
          key: Buffer.from('key'),
          files: [evilBackslashSymlink]
        }
      ],
      0
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].error).toMatch(/traversal|escapes/i)
    expect(
      existsSync(join(dir, 'common', 'SomeGame', 'sub', 'game.lnkname'))
    ).toBe(false)
  })

  it('WR-02: a size>0 file whose manifest returned zero chunks is recorded as a failure, never silently reported as a completed empty file', async () => {
    const corruptFile: DepotPlanFile = {
      filename: 'corrupt.bin',
      size: 100,
      sha_content: 'irrelevant',
      chunks: []
    }
    const plan = makePlan(
      [
        {
          depotId: '670',
          gid: 'g6e',
          key: Buffer.from('key'),
          files: [corruptFile]
        }
      ],
      100
    )

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].file).toBe('corrupt.bin')
    const destPath = join(dir, 'common', 'SomeGame', 'corrupt.bin')
    // No silently-completed empty file left behind at the destination.
    expect(existsSync(destPath) && lstatSync(destPath).size === 0).toBe(false)
  })

  // ── EDepotFileFlag ReadOnly(8)/Hidden(16) wiring (D-06, 23-01) ────────────
  // Delegates to the REAL applyDepotFileFlags implementation so these assert
  // actual POSIX mode bits via a real tmpdir — the Windows attrib.exe path is
  // covered by fileAttributes.test.ts, not here.
  describe('EDepotFileFlag ReadOnly/Hidden (D-06, 23-01)', () => {
    beforeEach(() => {
      ;(applyDepotFileFlags as jest.Mock).mockImplementation(
        actualApplyDepotFileFlags
      )
    })

    it('ReadOnly(8) + Executable(32) → landed file is chmod 0o555 (exec bit preserved)', async () => {
      const content = Buffer.from('exe-bytes')
      jest.mocked(fetchChunk).mockResolvedValue(content)

      const file: DepotPlanFile = {
        filename: 'readonly-exec.bin',
        size: content.length,
        sha_content: sha1Hex(content),
        chunks: [
          { sha: 'sha-ro-exec', cb_original: content.length, offset: 0 }
        ],
        flags: 8 | 32 // ReadOnly | Executable
      }
      const plan = makePlan(
        [
          { depotId: '672', gid: 'g70', key: Buffer.from('key'), files: [file] }
        ],
        content.length
      )

      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      expect(result.failures).toEqual([])
      const stat = lstatSync(
        join(dir, 'common', 'SomeGame', 'readonly-exec.bin')
      )
      expect(stat.mode & 0o777).toBe(0o555)
    })

    it('ReadOnly(8) only → landed file is chmod 0o444', async () => {
      const content = Buffer.from('config-bytes')
      jest.mocked(fetchChunk).mockResolvedValue(content)

      const file: DepotPlanFile = {
        filename: 'readonly.cfg',
        size: content.length,
        sha_content: sha1Hex(content),
        chunks: [{ sha: 'sha-ro', cb_original: content.length, offset: 0 }],
        flags: 8 // ReadOnly
      }
      const plan = makePlan(
        [
          { depotId: '673', gid: 'g71', key: Buffer.from('key'), files: [file] }
        ],
        content.length
      )

      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      expect(result.failures).toEqual([])
      const stat = lstatSync(join(dir, 'common', 'SomeGame', 'readonly.cfg'))
      expect(stat.mode & 0o777).toBe(0o444)
    })

    it('Hidden(16) with no ReadOnly → file lands normally, no rename, no failure (documented POSIX no-op)', async () => {
      const content = Buffer.from('hidden-bytes')
      jest.mocked(fetchChunk).mockResolvedValue(content)

      const file: DepotPlanFile = {
        filename: 'hidden.dat',
        size: content.length,
        sha_content: sha1Hex(content),
        chunks: [{ sha: 'sha-hidden', cb_original: content.length, offset: 0 }],
        flags: 16 // Hidden
      }
      const plan = makePlan(
        [
          { depotId: '674', gid: 'g72', key: Buffer.from('key'), files: [file] }
        ],
        content.length
      )

      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      expect(result.failures).toEqual([])
      // Original filename, no dot-prefixed rename.
      expect(existsSync(join(dir, 'common', 'SomeGame', 'hidden.dat'))).toBe(
        true
      )
      expect(existsSync(join(dir, 'common', 'SomeGame', '.hidden.dat'))).toBe(
        false
      )
    })

    it('a mode-application failure is recorded as a DepotDownloadFailure, never a silent success (T-23-03)', async () => {
      const content = Buffer.from('mode-fail-bytes')
      jest.mocked(fetchChunk).mockResolvedValue(content)
      ;(applyDepotFileFlags as jest.Mock).mockResolvedValueOnce({
        ok: false,
        error: 'simulated mode-application failure'
      })

      const file: DepotPlanFile = {
        filename: 'mode-fail.bin',
        size: content.length,
        sha_content: sha1Hex(content),
        chunks: [
          { sha: 'sha-mode-fail', cb_original: content.length, offset: 0 }
        ],
        flags: 8 // ReadOnly
      }
      const plan = makePlan(
        [
          { depotId: '675', gid: 'g73', key: Buffer.from('key'), files: [file] }
        ],
        content.length
      )

      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      expect(result.failures).toHaveLength(1)
      expect(result.failures[0].file).toBe('mode-fail.bin')
      expect(result.failures[0].error).toMatch(
        /mode-application failure|simulated mode-application failure/i
      )
    })
  })

  // ── G-23-02 (23-08 Task 1, VERDICT: H2) ─────────────────────────────────
  // 23-TRACE.md's "Live run 2 — HUMANKIND" section: "### VERDICT: H2
  // CONFIRMED" — "Confirming field values: flagBearing=140 (> 0, so flags
  // *are* populated) and executableFlagged=0 ... GameLib applied precisely
  // what the manifest specified, which was nothing executable." H2's own
  // Task 1 action is explicit: "There is no mapping bug to fix here — leave
  // Task 1's code unchanged". No source change was made for this task.
  //
  // This is the plan's "branch-independent, the acceptance behavior" test,
  // required for every verdict branch. For H1/H5 it would need to be RED
  // before the fix; for H2 there is no fix, and (per WazHack's control
  // evidence in 23-TRACE.md Live run 1: chmodAttempts=1, landed binary
  // -rwxr-xr-x, byte-for-byte identical to Steam's own install) the writer
  // already applies EXECUTABLE_FLAG correctly. This test is therefore an
  // honest confirming regression guard, not a RED-then-GREEN proof — it was
  // already GREEN before this plan touched anything. See 23-08-SUMMARY.md
  // for the full accounting of why RED-first does not apply to the H2
  // branch.
  describe('G-23-02 (23-08 Task 1, H2): EXECUTABLE_FLAG lands +x through the real download path', () => {
    it('a fresh downloadDepotFiles run over an EXECUTABLE_FLAG(32)-only manifest entry leaves the landed file with a non-zero execute bit', async () => {
      const content = Buffer.from('exec-only-bytes')
      jest.mocked(fetchChunk).mockResolvedValue(content)

      const file: DepotPlanFile = {
        filename: 'game-only-exec.bin',
        size: content.length,
        sha_content: sha1Hex(content),
        chunks: [
          { sha: 'sha-exec-only', cb_original: content.length, offset: 0 }
        ],
        flags: EXECUTABLE_FLAG // 32, no other bits — the H2-relevant shape
      }
      const plan = makePlan(
        [
          { depotId: '676', gid: 'g74', key: Buffer.from('key'), files: [file] }
        ],
        content.length
      )

      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      expect(result.failures).toEqual([])
      const dest = join(dir, 'common', 'SomeGame', 'game-only-exec.bin')
      expect((await stat(dest)).mode & 0o111).not.toBe(0)
    })
  })

  it('WR-03: emitted DownloadManager progress percent never exceeds 100 even when doneBytes overshoots totalBytes', async () => {
    const chunkBuf = Buffer.from('0123456789') // 10 bytes
    jest.mocked(fetchChunk).mockResolvedValue(chunkBuf)

    const file: DepotPlanFile = {
      filename: 'overshoot.bin',
      size: chunkBuf.length,
      sha_content: sha1Hex(chunkBuf),
      chunks: [{ sha: 'sha-over', cb_original: chunkBuf.length, offset: 0 }]
    }
    // totalBytes deliberately declared SMALLER than the real bytes written,
    // so doneBytes/totalBytes*100 would exceed 100 without the WR-03 clamp.
    const plan = makePlan(
      [{ depotId: '671', gid: 'g6f', key: Buffer.from('key'), files: [file] }],
      1
    )

    await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS
    })

    const mockedSend = sendFrontendMessage as jest.Mock
    const calls = mockedSend.mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(calls.length).toBeGreaterThan(0)
    for (const [, payload] of calls as Array<
      [string, Record<string, unknown>]
    >) {
      const progress = payload.progress as Record<string, unknown>
      expect(progress.percent as number).toBeLessThanOrEqual(100)
    }
  })

  // ── Phase 23 (23-03, D-04): reconciliation wiring ─────────────────────────
  describe('reconciliation wiring (D-04/D-05)', () => {
    it('a pre-existing sha1-matching file is skipped from re-download (fetchChunk never called for it) on a partial resume', async () => {
      const goodContent = Buffer.from('already-here-content')
      const freshContent = Buffer.from('needs-download')

      mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
      writeFileSync(join(dir, 'common', 'SomeGame', 'good.bin'), goodContent)

      jest
        .mocked(fetchChunk)
        .mockImplementation(async (_hosts, _depotId, chunk) => {
          if (chunk.sha === 'sha-good') {
            throw new Error(
              'fetchChunk must never be called for an already-reconciled file'
            )
          }
          return freshContent
        })

      const fileGood: DepotPlanFile = {
        filename: 'good.bin',
        size: goodContent.length,
        sha_content: sha1Hex(goodContent),
        chunks: [
          { sha: 'sha-good', cb_original: goodContent.length, offset: 0 }
        ]
      }
      const fileFresh: DepotPlanFile = {
        filename: 'fresh.bin',
        size: freshContent.length,
        sha_content: sha1Hex(freshContent),
        chunks: [
          { sha: 'sha-fresh', cb_original: freshContent.length, offset: 0 }
        ]
      }
      const plan = makePlan(
        [
          {
            depotId: '900',
            gid: 'g90',
            key: Buffer.from('key'),
            files: [fileGood, fileFresh]
          }
        ],
        goodContent.length + freshContent.length
      )

      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      expect(result.failures).toEqual([])
      expect(result.allFilesVerifiedThisRun).toBe(true)
      expect(jest.mocked(fetchChunk)).toHaveBeenCalledTimes(1)
    })

    it('an already-complete on-disk install yields zero jobs, zero chunk fetches, and its outputs let finalizeToSteam earn StateFlags=4 (D-05: no update ownership, no re-download)', async () => {
      const contentA = Buffer.from('complete-file-a')
      const contentB = Buffer.from('complete-file-b')
      mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
      writeFileSync(join(dir, 'common', 'SomeGame', 'a.bin'), contentA)
      writeFileSync(join(dir, 'common', 'SomeGame', 'b.bin'), contentB)

      jest
        .mocked(fetchChunk)
        .mockRejectedValue(
          new Error(
            'fetchChunk must never be called on an already-complete install'
          )
        )

      const fileA: DepotPlanFile = {
        filename: 'a.bin',
        size: contentA.length,
        sha_content: sha1Hex(contentA),
        chunks: [{ sha: 's-a', cb_original: contentA.length, offset: 0 }]
      }
      const fileB: DepotPlanFile = {
        filename: 'b.bin',
        size: contentB.length,
        sha_content: sha1Hex(contentB),
        chunks: [{ sha: 's-b', cb_original: contentB.length, offset: 0 }]
      }
      const plan: DepotPlan = {
        appId: '12345',
        name: 'SomeGame',
        buildid: '9999999',
        depots: [
          {
            depotId: '901',
            gid: '9007199254740901',
            key: Buffer.from('key'),
            files: [fileA, fileB]
          }
        ],
        totalBytes: contentA.length + contentB.length
      }

      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      expect(result.failures).toEqual([])
      expect(result.allFilesVerifiedThisRun).toBe(true)
      expect(jest.mocked(fetchChunk)).not.toHaveBeenCalled()

      await finalizeToSteam('12345', {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        name: 'SomeGame',
        depots: plan.depots.map((d) => ({
          depotId: d.depotId,
          gid: d.gid,
          size: 0
        })),
        buildid: plan.buildid,
        outcome: result.outcome,
        failures: result.failures,
        allFilesVerified: result.allFilesVerifiedThisRun,
        allModesApplied: result.allModesApplied
      })

      const text = readFileSync(join(dir, 'appmanifest_12345.acf'), 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"4"/)
    })

    it('a reconciled (skipped-download) file gets its EDepotFileFlag modes RE-APPLIED even though it was not re-downloaded (mode-heal, RESEARCH Pattern 3)', async () => {
      const content = Buffer.from('already-here-exe-bytes')
      mkdirSync(join(dir, 'common', 'SomeGame'), { recursive: true })
      const destPath = join(dir, 'common', 'SomeGame', 'already-here.bin')
      writeFileSync(destPath, content)
      // An older partial download never applied the Executable bit — start
      // from a deliberately WRONG mode so the healing assertion is meaningful.
      chmodSync(destPath, 0o644)

      jest
        .mocked(fetchChunk)
        .mockRejectedValue(
          new Error('fetchChunk must never be called for a reconciled file')
        )

      const file: DepotPlanFile = {
        filename: 'already-here.bin',
        size: content.length,
        sha_content: sha1Hex(content),
        chunks: [{ sha: 's-exec', cb_original: content.length, offset: 0 }],
        flags: 32 // Executable
      }
      const plan = makePlan(
        [
          { depotId: '902', gid: 'g92', key: Buffer.from('key'), files: [file] }
        ],
        content.length
      )

      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      expect(result.failures).toEqual([])
      expect(jest.mocked(fetchChunk)).not.toHaveBeenCalled()
      const stat = lstatSync(destPath)
      expect(stat.mode & 0o777).toBe(0o755)
    })

    it('WR-01 (23-code-review): a reconciled Directory entry combined with ReadOnly is skipped by the mode-heal loop — never chmod-stripped of its traversable bit', async () => {
      const dirPath = join(dir, 'common', 'SomeGame', 'readonly-dir')
      mkdirSync(dirPath, { recursive: true })

      jest
        .mocked(fetchChunk)
        .mockRejectedValue(
          new Error('fetchChunk must never be called for a reconciled entry')
        )

      const file: DepotPlanFile = {
        filename: 'readonly-dir',
        size: 0,
        sha_content: '',
        chunks: [],
        flags: 64 | 8 // Directory | ReadOnly
      }
      const plan = makePlan(
        [
          { depotId: '903', gid: 'g93', key: Buffer.from('key'), files: [file] }
        ],
        0
      )

      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      expect(result.failures).toEqual([])
      // The heal loop must never hand a Directory/Symlink manifest entry to
      // chmod/attrib.exe — a directory stripped of its execute (traversable)
      // bit (0o444) would make every file inside it inaccessible.
      const st = lstatSync(dirPath)
      expect(st.mode & 0o100).not.toBe(0) // owner-execute bit intact
    })
  })

  // ── Progress heartbeat cadence (quick 260718-jmt) ──────────────────────────
  // NOTE: a full jest.useFakeTimers() simulation was avoided here -- the real
  // DecompressPool spawns real worker_threads with their own real internal
  // dispatch timeout (decompressPool.ts), and faking global timers while a
  // real cross-thread message round-trip is in flight risks a flaky/hanging
  // test. Instead this captures the ACTUAL setInterval callback wired into
  // downloadDepotFiles and invokes it directly (deterministic, no waiting),
  // which exercises the exact forced-emit code path a real 1s tick would.
  // Manual verify: start a real native Steam depot install and watch the
  // DownloadManager ProgressHeader graph advance smoothly during warm-up.
  describe('progress heartbeat: 1s wall-clock cadence independent of chunk completion', () => {
    it('registers a PROGRESS_HEARTBEAT_MS (1000ms) setInterval before the worker Promise.all, whose callback forces an honest ~0 MB/s progressUpdate when no chunk activity has occurred, and clears the interval once the download settles', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval')
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval')

      let resolveChunk!: (buf: Buffer) => void
      const stalledChunk = new Promise<Buffer>((resolve) => {
        resolveChunk = resolve
      })
      jest.mocked(fetchChunk).mockReturnValue(stalledChunk)

      const content = Buffer.from('heartbeat-payload')
      const file: DepotPlanFile = {
        filename: 'heartbeat.bin',
        size: content.length,
        sha_content: sha1Hex(content),
        chunks: [{ sha: 'sha-hb', cb_original: content.length, offset: 0 }]
      }
      const plan = makePlan(
        [
          { depotId: '778', gid: 'g78', key: Buffer.from('key'), files: [file] }
        ],
        content.length
      )

      const resultPromise = downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: HOSTS
      })

      // Poll (real timers, short real waits) until downloadDepotFiles reaches
      // its setInterval() call -- registered synchronously just before the
      // worker Promise.all, after pool.init()/reconciliation/mode-heal settle.
      for (let i = 0; i < 200 && setIntervalSpy.mock.calls.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 5))
      }

      expect(setIntervalSpy).toHaveBeenCalledTimes(1)
      const [heartbeatFn, heartbeatMs] = setIntervalSpy.mock.calls[0]
      expect(heartbeatMs).toBe(1000)

      const mockedSend = sendFrontendMessage as jest.Mock
      mockedSend.mockClear()

      // The single chunk fetch is still stalled (unresolved) here -- no
      // onBytes has fired, doneBytes/netBytes are still 0. Invoking the real
      // registered callback 3x simulates ~3s of wall-clock heartbeat ticks
      // with zero chunk activity.
      ;(heartbeatFn as () => void)()
      ;(heartbeatFn as () => void)()
      ;(heartbeatFn as () => void)()

      const heartbeatCalls = mockedSend.mock.calls.filter(
        ([channel]) => channel === 'progressUpdate'
      )
      expect(heartbeatCalls.length).toBe(3)
      for (const [, payload] of heartbeatCalls) {
        const progress = (payload as Record<string, unknown>)
          .progress as Record<string, unknown>
        // Zero bytes moved during the stall -> heartbeat honestly reports
        // ~0 MB/s, never a spike from the chunk-driven rolling-rate math.
        expect(progress.downSpeed).toBe(0)
      }

      // Let the stalled chunk resolve and the download settle normally.
      resolveChunk(content)
      const result = await resultPromise

      expect(result.outcome).toBe('completed')
      expect(result.failures).toEqual([])

      // The interval must be cleared with the SAME handle setInterval
      // returned, once the worker Promise.all settles -- the shared
      // try/finally covers normal completion AND throw/abort identically
      // (this codebase's Promise.all never rejects in practice: per-file
      // errors are caught inside the loop and a signal-abort also resolves
      // normally, so both paths exercise this exact finally).
      expect(clearIntervalSpy).toHaveBeenCalledWith(
        setIntervalSpy.mock.results[0].value
      )
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1)

      setIntervalSpy.mockRestore()
      clearIntervalSpy.mockRestore()
    })
  })

  describe('EDepotFileFlag census logging (23-06, G-23-02 trace instrumentation)', () => {
    /** Finds the single `steam-flags-census` logInfo call for `appId`+`stage`
     *  among ALL calls recorded during the test (across however many
     *  concurrent/sequential downloadDepotFiles runs happened) — the
     *  appId=/stage= tags in the log line are what let a test attribute a
     *  census line to the specific run that produced it. */
    function findCensusLine(appId: string, stage: string): string {
      const calls = jest.mocked(logInfo).mock.calls
      const match = calls.find(([msg]) => {
        if (typeof msg !== 'string') return false
        return (
          msg.includes('steam-flags-census') &&
          msg.includes(`stage=${stage}`) &&
          msg.includes(`appId=${appId}`)
        )
      })
      if (!match) {
        throw new Error(
          `no steam-flags-census log line found for appId=${appId} stage=${stage}`
        )
      }
      return match[0] as string
    }

    function buildNoFlagsPlan(appId: string, content: Buffer): DepotPlan {
      const file: DepotPlanFile = {
        filename: 'plain.bin',
        size: content.length,
        sha_content: sha1Hex(content),
        chunks: [
          { sha: `sha-noflags-${appId}`, cb_original: content.length, offset: 0 }
        ]
        // flags: undefined — H1's signature.
      }
      return {
        appId,
        name: 'NoFlagsGame',
        depots: [
          { depotId: `d-noflags-${appId}`, gid: `g-noflags-${appId}`, key: Buffer.from('key'), files: [file] }
        ],
        totalBytes: content.length
      }
    }

    function buildExecPlan(appId: string, content: Buffer): DepotPlan {
      const file: DepotPlanFile = {
        filename: 'exec.bin',
        size: content.length,
        sha_content: sha1Hex(content),
        chunks: [
          { sha: `sha-exec-${appId}`, cb_original: content.length, offset: 0 }
        ],
        flags: 32 // Executable
      }
      return {
        appId,
        name: 'ExecGame',
        depots: [
          { depotId: `d-exec-${appId}`, gid: `g-exec-${appId}`, key: Buffer.from('key'), files: [file] }
        ],
        totalBytes: content.length
      }
    }

    it('reports chmodAttempts=0 in its download-complete census for an all-flags-undefined plan, and chmodAttempts=1 for a one-executable-file plan', async () => {
      const contentNoFlags = Buffer.from('no-flags-payload')
      const contentExec = Buffer.from('exec-payload')
      jest
        .mocked(fetchChunk)
        .mockImplementation(async (_hosts, _depotId, chunk) =>
          String(chunk.sha).startsWith('sha-noflags')
            ? contentNoFlags
            : contentExec
        )

      const noFlagsPlan = buildNoFlagsPlan('census-no-flags', contentNoFlags)
      await downloadDepotFiles(noFlagsPlan, {
        targetSteamappsDir: dir,
        installdir: 'CensusNoFlagsGame',
        hosts: HOSTS
      })
      expect(
        findCensusLine('census-no-flags', 'download-complete')
      ).toMatch(/chmodAttempts=0/)

      const execPlan = buildExecPlan('census-exec', contentExec)
      await downloadDepotFiles(execPlan, {
        targetSteamappsDir: dir,
        installdir: 'CensusExecGame',
        hosts: HOSTS
      })
      expect(
        findCensusLine('census-exec', 'download-complete')
      ).toMatch(/chmodAttempts=1/)
    })

    it('CONCURRENCY: two downloadDepotFiles runs for DIFFERENT appIds executing concurrently each report their own uncorrupted chmodAttempts, in either start order — the test that would fail against module-level counters', async () => {
      const contentNoFlags = Buffer.from('no-flags-concurrency-payload')
      const contentExec = Buffer.from('exec-concurrency-payload')

      jest.mocked(fetchChunk).mockImplementation(async (_hosts, _depotId, chunk) => {
        // Small, asymmetric delays so both runs' chunk fetches genuinely
        // overlap in time rather than resolving one-after-the-other.
        const isNoFlags = String(chunk.sha).startsWith('sha-noflags')
        await new Promise((r) => setTimeout(r, isNoFlags ? 15 : 5))
        return isNoFlags ? contentNoFlags : contentExec
      })

      async function runBothOrders(
        startNoFlagsFirst: boolean,
        suffix: string
      ): Promise<void> {
        const noFlagsAppId = `concurrency-no-flags-${suffix}`
        const execAppId = `concurrency-exec-${suffix}`
        const noFlagsPlan = buildNoFlagsPlan(noFlagsAppId, contentNoFlags)
        const execPlan = buildExecPlan(execAppId, contentExec)

        const runNoFlags = () =>
          downloadDepotFiles(noFlagsPlan, {
            targetSteamappsDir: dir,
            installdir: `ConcurrencyNoFlagsGame-${suffix}`,
            hosts: HOSTS
          })
        const runExec = () =>
          downloadDepotFiles(execPlan, {
            targetSteamappsDir: dir,
            installdir: `ConcurrencyExecGame-${suffix}`,
            hosts: HOSTS
          })

        // Overlapping in time: both promises are created (and their async
        // work started) before either is awaited.
        if (startNoFlagsFirst) {
          const p1 = runNoFlags()
          const p2 = runExec()
          await Promise.all([p1, p2])
        } else {
          const p1 = runExec()
          const p2 = runNoFlags()
          await Promise.all([p1, p2])
        }

        expect(
          findCensusLine(noFlagsAppId, 'download-complete')
        ).toMatch(/chmodAttempts=0/)
        expect(
          findCensusLine(execAppId, 'download-complete')
        ).toMatch(/chmodAttempts=1/)
      }

      // Both start orders — proves neither direction leaks a chmod count
      // across the two concurrent runs.
      await runBothOrders(true, 'order-a')
      await runBothOrders(false, 'order-b')
    })
  })
})
