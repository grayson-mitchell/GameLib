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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logWarning } from 'backend/logger'
import {
  buildDepotPlan,
  downloadSteamDepots,
  downloadDepotFiles,
  finalizeToSteam,
  CHUNK_CONCURRENCY,
  type DepotPlan,
  type DepotPlanFile
} from '../depot'
import { SteamUser } from '../user'
import { selectAllDepots } from '../depot/select'
import { decryptFilename } from '../depot/crypto'
import { fetchChunk } from '../depot/decompress'
import { sendFrontendMessage } from '../../../ipc'

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
jest.mock('../depot/decompress', () => ({
  fetchChunk: jest.fn()
}))

// ── backend/ipc mock — captures progressUpdate emits for Task 2 assertions ───
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
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
    getContentServers: jest.fn().mockImplementation(
      (_appId: number, cb: (err: Error | null, servers: Array<{ Host?: string }>) => void) =>
        cb(null, [{ Host: 'cdn1.example.com' }])
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
        expect.objectContaining({ os: 'macos' })
      )
      // A second call with a different os proves the value flows through —
      // it is a parameter, not a literal baked into depot.ts.
      jest.mocked(selectAllDepots).mockClear()
      await buildDepotPlan(APP_ID, { ...BASE_OPTS, os: 'linux' })
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

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)

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
      depots: [{ depotId: '111', gid: 'g1', size: 999999 }]
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
    jest.mocked(selectAllDepots).mockReturnValue([{ id: '111', manifest: 'g1', size: 0 }])
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
    jest.mocked(decryptFilename).mockReturnValue('game.bin')
  }

  it('on full success: finalizeToSteam is invoked AFTER every file is written, and writes StateFlags=1026', async () => {
    const content = Buffer.from('game-bytes')
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock('steam-user/components/content_manifest.js')
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

  it('on failure (SHA1 mismatch): finalizeToSteam is still invoked with whatever landed, and downloadSteamDepots resolves — never throws — with status error', async () => {
    const fakeClient = makeFakeClient()
    setupPlanPlumbing(fakeClient)

    const contentManifest = jest.requireMock('steam-user/components/content_manifest.js')
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

    const contentManifest = jest.requireMock('steam-user/components/content_manifest.js')
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

    const contentManifest = jest.requireMock('steam-user/components/content_manifest.js')
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
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    expect(uncommented).not.toMatch(/"StateFlags"[^\n]*"4"/)
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

  function makePlan(depots: DepotPlan['depots'], totalBytes: number): DepotPlan {
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

    jest.mocked(fetchChunk).mockImplementation(async (_hosts, _depotId, chunk) =>
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
    const plan = makePlan([{ depotId: '333', gid: 'g3', key: Buffer.from('key'), files: [file] }], 0)

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
    const plan = makePlan([{ depotId: '444', gid: 'g4', key: Buffer.from('key'), files: [file] }], content.length)

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
    const calls = mockedSend.mock.calls.filter(([channel]) => channel === 'progressUpdate')
    // Fewer emits than chunks (2 chunks total, forced-final emit still fires).
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.length).toBeLessThan(2)

    const [, payload] = calls[calls.length - 1] as [string, Record<string, unknown>]
    expect(payload).toMatchObject({ appName: '12345', runner: 'steam', status: 'installing' })
    const progress = payload.progress as Record<string, unknown>
    // Both files done -> 2/400 rounds to 1%, denominator is the SUMMED total.
    expect(progress.percent).toBe(1)
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
    const plan = makePlan([{ depotId: '555', gid: 'g5', key: Buffer.from('key'), files: [file] }], 5)

    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: dir,
      installdir: 'SomeGame',
      hosts: HOSTS,
      signal: controller.signal
    })

    expect(result.outcome).toBe('cancelled')
    // The abort fires inside the very first fetchChunk call; every other
    // worker must observe signal.aborted before issuing its own fetch.
    expect(jest.mocked(fetchChunk).mock.calls.length).toBeLessThan(chunks.length)
  })
})
