/**
 * The CM half of a depot job (73-19): what Node still does before Rust takes over. Ported from
 * depot.test.ts's `buildDepotPlan` and orchestration describes when the TS pipeline branch was
 * removed. Two layers:
 *
 *  - `buildDepotRefs` directly: depot selection, the per-depot key loop, abort between steps,
 *    the bounded reconnect+retry (D-UAT-06), the owning-appId key request (D-UAT-08), the
 *    EResult-40 skip (23.2-03) and the bounded CM calls (G-30-02).
 *  - `downloadSteamDepots` over the stubbed rustInvoke leaf (stubRustDepot): the appId guard,
 *    the lease, cancel and failure classification at the entry point, and the failure summary
 *    log line.
 *
 * Everything a manifest decides (filenames, sizes, totals, path collisions, per-file failures)
 * is Rust's and is tested in src-tauri/crates/gamelib-depot.
 */
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createTestSteamInstallRuntime } from 'backend/testUtils/testSteamInstallRuntime'
import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logError, logWarning } from 'backend/logger'
const requestRustInvoke = jest.fn()
const depotTransport = {
  requestRustInvoke,
  sendFrontendMessage: jest.fn(),
  appRuntime: createTestAppRuntime()
}
import { downloadSteamDepots, PLAN_BUILD_MAX_ATTEMPTS } from '../depot'
import { buildDepotRefs } from '../depot/plan'
import { fsBackedSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import { mockLeaseOk, mockLeaseRefused } from './depotLeaseMocks'
import { selectAllDepots } from '../depot/select'
import { classifyDepotError } from '../depotErrors'
import { at } from './fixtures/indexed'
import {
  createStubRustDepot,
  type StubRustDepot
} from '../depotRust/__tests__/fixtures/stubRustDepot'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn()
}))
jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

const APP_ID = '12345'
const BASE_OPTS = {
  installRuntime: createTestSteamInstallRuntime(depotTransport),
  steamUser,
  config: createTestGlobalConfig(),
  targetSteamappsDir: '/tmp/steamapps',
  installdir: 'SomeGame',
  os: 'windows'
}

type KeyCb = (err: Error | null, key: Buffer) => void

function makeFakeClient() {
  return {
    licenses: [] as Array<{ package_id: number }>,
    steamID: { getSteamID64: jest.fn().mockReturnValue('76561198012345678') },
    getProductInfo: jest.fn().mockResolvedValue({
      apps: { 12345: { appinfo: { depots: {}, extended: {} } } },
      packages: {},
      unknownApps: [],
      unknownPackages: []
    }),
    getDepotDecryptionKey: jest.fn(
      (_appId: number, depotId: number, cb: KeyCb) =>
        cb(null, Buffer.alloc(32, depotId % 250))
    ),
    getContentServers: jest.fn(
      (
        _appId: number,
        cb: (err: Error | null, servers: Array<{ Host?: string }>) => void
      ) => cb(null, [{ Host: 'cdn1.example.com' }])
    ),
    getManifestRequestCode: jest.fn().mockResolvedValue({ requestCode: '42' })
  }
}

type FakeClient = ReturnType<typeof makeFakeClient>

const eresultError = (message: string, eresult: number) =>
  Object.assign(new Error(message), { eresult })

const depot = (
  id: string,
  ownerAppId = APP_ID,
  manifest = `${id}000000000`
) => ({
  id,
  manifest,
  size: 0,
  ownerAppId
})

let client: FakeClient

function wire(depots = [depot('111')]): FakeClient {
  client = makeFakeClient()
  mockLeaseOk(steamUser)
  jest.mocked(steamUser.getClient).mockReturnValue(client as never)
  jest.mocked(selectAllDepots).mockReturnValue(depots)
  return client
}

function rust(options: Parameters<typeof createStubRustDepot>[0] = {}) {
  const stub: StubRustDepot = createStubRustDepot(options)
  jest.mocked(requestRustInvoke).mockImplementation(stub.invoke)
  return stub
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('buildDepotRefs', () => {
  describe('selection', () => {
    it('calls selectAllDepots with the caller-supplied os, not a hardcoded default', async () => {
      wire([])

      const refs = await buildDepotRefs(APP_ID, { ...BASE_OPTS, os: 'macos' })

      expect(jest.mocked(selectAllDepots)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ os: 'macos' }),
        APP_ID
      )
      // A second call with a different os proves the value flows through.
      jest.mocked(selectAllDepots).mockClear()
      await buildDepotRefs(APP_ID, { ...BASE_OPTS, os: 'linux' })
      expect(jest.mocked(selectAllDepots)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ os: 'linux' }),
        APP_ID
      )
      expect(refs.depots).toEqual([])
    })

    it('keeps a 64-bit manifest GID as a string end to end', async () => {
      wire([depot('111', APP_ID, '9007199254740993')])
      const refs = await buildDepotRefs(APP_ID, BASE_OPTS)
      expect(at(refs.depots, 0).gid).toBe('9007199254740993')
    })
  })

  describe('quick 261110-up7: per-app beta branch', () => {
    const withBranches = (branches: unknown) => {
      client.getProductInfo.mockResolvedValue({
        apps: { 12345: { appinfo: { depots: { branches }, extended: {} } } },
        packages: {},
        unknownApps: [],
        unknownPackages: []
      })
    }
    const BRANCHES = { public: { buildid: 1 }, 'release-101': { buildid: 2 } }

    it('an explicit branch drives selection and buildid', async () => {
      wire([])
      withBranches(BRANCHES)
      const refs = await buildDepotRefs(APP_ID, {
        ...BASE_OPTS,
        branch: 'release-101'
      })
      expect(jest.mocked(selectAllDepots)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ branch: 'release-101' }),
        APP_ID
      )
      expect(refs.branch).toBe('release-101')
      expect(refs.buildid).toBe('2')
    })

    it('an unknown branch falls back to public', async () => {
      wire([])
      withBranches({ public: { buildid: 1 } })
      const refs = await buildDepotRefs(APP_ID, {
        ...BASE_OPTS,
        branch: 'release-101'
      })
      expect(refs.branch).toBe('public')
      expect(refs.buildid).toBe('1')
    })

    it('a password-protected branch falls back to public', async () => {
      wire([])
      withBranches({
        public: { buildid: 1 },
        'release-101': { buildid: 2, pwdrequired: '1' }
      })
      const refs = await buildDepotRefs(APP_ID, {
        ...BASE_OPTS,
        branch: 'release-101'
      })
      expect(refs.branch).toBe('public')
    })

    it('with no explicit branch, the ACF BetaKey is resolved', async () => {
      wire([])
      requestRustInvoke.mockImplementation(
        fsBackedSteamFiles().requestRustInvoke
      )
      withBranches(BRANCHES)
      const dir = mkdtempSync(join(tmpdir(), 'cmplan-beta-'))
      try {
        writeFileSync(
          join(dir, `appmanifest_${APP_ID}.acf`),
          `"AppState"\n{\n\t"UserConfig"\n\t{\n\t\t"BetaKey"\t\t"release-101"\n\t}\n}\n`
        )
        const refs = await buildDepotRefs(APP_ID, {
          ...BASE_OPTS,
          targetSteamappsDir: dir
        })
        expect(refs.branch).toBe('release-101')
        expect(refs.buildid).toBe('2')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  describe('D-UAT-05: abort signal during the CM loop', () => {
    it('aborting mid-loop (after the first of two depots) stops before the second key request', async () => {
      const c = wire([depot('111'), depot('222')])
      const controller = new AbortController()
      c.getDepotDecryptionKey.mockImplementation(
        (_appId: number, depotId: number, cb: KeyCb) => {
          if (depotId === 111) controller.abort()
          cb(null, Buffer.alloc(32, 1))
        }
      )

      await expect(
        buildDepotRefs(APP_ID, { ...BASE_OPTS, signal: controller.signal })
      ).rejects.toThrow(/aborted/i)

      expect(c.getDepotDecryptionKey).toHaveBeenCalledTimes(1)
    })
  })

  describe('D-UAT-06: reconnect+retry-on-drop', () => {
    it('a CM drop on the first key attempt triggers a plan-retry lease + retry, and the refs still complete', async () => {
      const c = wire()
      let keyCalls = 0
      c.getDepotDecryptionKey.mockImplementation(
        (_appId: number, depotId: number, cb: KeyCb) => {
          keyCalls++
          if (keyCalls === 1) {
            cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
            return
          }
          cb(null, Buffer.alloc(32, depotId % 250))
        }
      )

      const refs = await buildDepotRefs(APP_ID, BASE_OPTS)

      expect(refs.depots.map((d) => d.depotId)).toEqual(['111'])
      expect(keyCalls).toBe(2)
      // buildDepotRefs takes no lease of its own: the one acquire is the retry's reconnect.
      expect(jest.mocked(steamUser.acquireAuthenticated)).toHaveBeenCalledTimes(
        1
      )
      expect(jest.mocked(steamUser.acquireAuthenticated)).toHaveBeenCalledWith({
        reason: 'plan-retry'
      })
    })

    it('exhausts PLAN_BUILD_MAX_ATTEMPTS on a PERSISTENT drop and rejects — never retries unboundedly', async () => {
      const c = wire()
      c.getDepotDecryptionKey.mockImplementation(
        (_appId: number, _depotId: number, cb: KeyCb) =>
          cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
      )

      await expect(buildDepotRefs(APP_ID, BASE_OPTS)).rejects.toThrow(
        /ECONNRESET/
      )

      expect(c.getDepotDecryptionKey).toHaveBeenCalledTimes(
        PLAN_BUILD_MAX_ATTEMPTS
      )
      expect(jest.mocked(steamUser.acquireAuthenticated)).toHaveBeenCalledTimes(
        PLAN_BUILD_MAX_ATTEMPTS - 1
      )
    })

    it('a cancel that lands the instant a step fails short-circuits the retry', async () => {
      const c = wire()
      const controller = new AbortController()
      c.getDepotDecryptionKey.mockImplementation(
        (_appId: number, _depotId: number, cb: KeyCb) => {
          controller.abort()
          cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
        }
      )

      await expect(
        buildDepotRefs(APP_ID, { ...BASE_OPTS, signal: controller.signal })
      ).rejects.toThrow(/aborted/i)

      expect(c.getDepotDecryptionKey).toHaveBeenCalledTimes(1)
    })

    it('a non-terminal error (no eresult) still retries normally — the non-retryable set does not over-broaden', async () => {
      const c = wire()
      let calls = 0
      c.getDepotDecryptionKey.mockImplementation(
        (_appId: number, depotId: number, cb: KeyCb) => {
          calls++
          if (calls === 1) {
            cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
            return
          }
          cb(null, Buffer.alloc(32, depotId % 250))
        }
      )

      const refs = await buildDepotRefs(APP_ID, BASE_OPTS)

      expect(refs.depots).toHaveLength(1)
      expect(calls).toBe(2)
    })
  })

  describe('D-UAT-08: depot decryption key requested with the owning appId', () => {
    it('requests the key with a DLC/sub-app ownerAppId, NOT the base appId, and carries that owner on the ref', async () => {
      const c = wire([depot('1460472', '54321', '9007199254740993')])

      const refs = await buildDepotRefs(APP_ID, BASE_OPTS)

      expect(c.getDepotDecryptionKey).toHaveBeenCalledWith(
        54321,
        1460472,
        expect.any(Function)
      )
      expect(c.getDepotDecryptionKey).not.toHaveBeenCalledWith(
        12345,
        1460472,
        expect.any(Function)
      )
      // Rust asks for the manifest under this owner (D-01).
      expect(at(refs.depots, 0).ownerAppId).toBe('54321')
    })

    it('requests the key with the BASE appId for a base-app depot', async () => {
      const c = wire([depot('111', APP_ID)])

      await buildDepotRefs(APP_ID, BASE_OPTS)

      expect(c.getDepotDecryptionKey).toHaveBeenCalledWith(
        12345,
        111,
        expect.any(Function)
      )
    })

    it('a terminal EResult (FileNotFound=9) fails FAST — one attempt, never PLAN_BUILD_MAX_ATTEMPTS', async () => {
      const c = wire([depot('1460472')])
      c.getDepotDecryptionKey.mockImplementation(
        (_appId: number, _depotId: number, cb: KeyCb) =>
          cb(eresultError('FileNotFound', 9), undefined as unknown as Buffer)
      )

      await expect(buildDepotRefs(APP_ID, BASE_OPTS)).rejects.toThrow(
        /couldn't get decryption key/i
      )

      expect(c.getDepotDecryptionKey).toHaveBeenCalledTimes(1)
      expect(PLAN_BUILD_MAX_ATTEMPTS).toBeGreaterThan(1)
    })

    it('a Blocked (eresult=40) key on the ONLY depot logs the depot, owner and EResult at the failure site, then fails via the all-skipped guard', async () => {
      const c = wire([depot('1771304', '1771300')])
      c.getDepotDecryptionKey.mockImplementation(
        (_appId: number, _depotId: number, cb: KeyCb) =>
          cb(eresultError('Blocked', 40), undefined as unknown as Buffer)
      )

      await expect(buildDepotRefs(APP_ID, BASE_OPTS)).rejects.toThrow(
        /every selected depot.*blocked by Steam \(eresult=40\).*1771304/
      )

      const matchingCall = jest
        .mocked(logWarning)
        .mock.calls.find(
          (call) =>
            typeof call[0] === 'string' &&
            call[0].includes('1771304') &&
            call[0].includes('1771300')
        )
      expect(matchingCall).toBeDefined()
      expect(matchingCall?.[0]).toMatch(/eresult=40/)
    })
  })

  describe('23.2-03 (G-23-01): skip-and-warn EResult 40 Blocked depots (D-01)', () => {
    const FOUR = [depot('111'), depot('222'), depot('333'), depot('444')]
    const BLOCKED_ID = '222'

    function keyFailsFor(c: FakeClient, id: string, err: () => Error) {
      c.getDepotDecryptionKey.mockImplementation(
        (_appId: number, depotId: number, cb: KeyCb) =>
          String(depotId) === id
            ? cb(err(), undefined as unknown as Buffer)
            : cb(null, Buffer.alloc(32, depotId % 250))
      )
    }

    it('a Blocked key on ONE of several depots skips only that depot and reports it', async () => {
      const c = wire(FOUR)
      keyFailsFor(c, BLOCKED_ID, () => eresultError('Blocked', 40))

      const refs = await buildDepotRefs(APP_ID, BASE_OPTS)

      expect(refs.depots.map((d) => d.depotId)).toEqual(['111', '333', '444'])
      expect(refs.skippedDepots).toEqual([BLOCKED_ID])
    })

    // RED-PROOF: only the literal 40 skips. 15 (AccessDenied) / 17 (Banned) and friends signal a
    // real account or ownership problem that must never be downgraded to "skipped a depot".
    it.each([8, 9, 15, 17, 42, 43])(
      'EResult %i still aborts the whole refs build — never silently skipped',
      async (eresult) => {
        const c = wire(FOUR)
        keyFailsFor(c, BLOCKED_ID, () =>
          eresultError(`EResult ${eresult}`, eresult)
        )

        await expect(buildDepotRefs(APP_ID, BASE_OPTS)).rejects.toThrow()
      }
    )

    it('a transient ECONNRESET on the first key attempt is still RETRIED into success, with nothing skipped', async () => {
      const c = wire(FOUR)
      let attempts = 0
      c.getDepotDecryptionKey.mockImplementation(
        (_appId: number, depotId: number, cb: KeyCb) => {
          if (String(depotId) === BLOCKED_ID && ++attempts === 1) {
            cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
            return
          }
          cb(null, Buffer.alloc(32, depotId % 250))
        }
      )

      const refs = await buildDepotRefs(APP_ID, BASE_OPTS)

      expect(refs.depots).toHaveLength(4)
      expect(refs.skippedDepots).toEqual([])
      expect(attempts).toBe(2)
    })
  })

  // G-30-02 (30-07): a never-settling CM call must not hang the CM half forever.
  describe('G-30-02: CM calls are bounded by withTimeout', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('a never-settling getProductInfo REJECTS within the bounded window, after ONE attempt (WR-02)', async () => {
      jest.useFakeTimers()
      const c = wire()
      c.getProductInfo.mockImplementation(() => new Promise(() => {}))

      const rejection = expect(
        buildDepotRefs(APP_ID, BASE_OPTS)
      ).rejects.toThrow(/getProductInfo timed out/)
      await jest.advanceTimersByTimeAsync(300000)
      await rejection

      expect(c.getProductInfo).toHaveBeenCalledTimes(1)
    })

    it('a healthy getProductInfo is unaffected', async () => {
      wire([])
      const refs = await buildDepotRefs(APP_ID, BASE_OPTS)
      expect(refs.depots).toEqual([])
    })

    it('a never-settling getDepotDecryptionKey mid-build is bounded too, after ONE attempt', async () => {
      jest.useFakeTimers()
      const c = wire()
      c.getDepotDecryptionKey.mockImplementation(() => {})

      const rejection = expect(
        buildDepotRefs(APP_ID, BASE_OPTS)
      ).rejects.toThrow(/getDepotDecryptionKey timed out/)
      await jest.advanceTimersByTimeAsync(300000)
      await rejection

      expect(c.getDepotDecryptionKey).toHaveBeenCalledTimes(1)
    })
  })
})

describe('downloadSteamDepots entry (CM half before the Rust job)', () => {
  let dir: string
  const opts = (over: Record<string, unknown> = {}) => ({
    installRuntime: createTestSteamInstallRuntime(depotTransport),
    steamUser,
    config: createTestGlobalConfig(),
    targetSteamappsDir: dir,
    installdir: 'SomeGame',
    os: 'windows',
    ...over
  })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-cmplan-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('T-21-05: rejects a non-numeric appId before any network call', async () => {
    const stub = rust()
    const out = await downloadSteamDepots('12345; rm -rf /', opts())
    expect(out.status).toBe('error')
    expect(jest.mocked(steamUser.acquireAuthenticated)).not.toHaveBeenCalled()
    expect(stub.calls).toHaveLength(0)
  })

  it('Phase 54: a refused acquire reports the not-signed-in copy, never touches the client, and runs no job', async () => {
    const stub = rust()
    mockLeaseRefused(steamUser, 'go-offline-required')

    const out = await downloadSteamDepots(APP_ID, opts())

    const expected = classifyDepotError(
      new Error(
        `downloadSteamDepots: no authenticated Steam CM connection available for appId ${APP_ID} (go-offline-required)`
      )
    )
    expect(expected.key).toBe('steam.download.error.notSignedIn')
    expect(out.status).toBe('error')
    expect(out.error).toBe(expected.message)
    expect(out.errorAction).toBe(expected.action)
    expect(jest.mocked(steamUser.getClient)).not.toHaveBeenCalled()
    expect(jest.mocked(logWarning)).toHaveBeenCalled()
    expect(stub.jobs).toHaveLength(0)
  })

  it('Phase 54: acquires one user-install lease and releases it once on success', async () => {
    wire()
    const release = mockLeaseOk(steamUser)
    rust()

    const out = await downloadSteamDepots(APP_ID, opts())

    expect(out.status).toBe('done')
    expect(jest.mocked(steamUser.acquireAuthenticated)).toHaveBeenCalledTimes(1)
    expect(jest.mocked(steamUser.acquireAuthenticated)).toHaveBeenCalledWith({
      reason: 'user-install',
      guidedAction: 'install',
      appName: APP_ID
    })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('Phase 54: releases the lease once when a CM step throws, and resolves error without a job', async () => {
    wire()
    const release = mockLeaseOk(steamUser)
    const stub = rust()
    jest.mocked(selectAllDepots).mockImplementation(() => {
      throw new Error('select exploded')
    })

    const out = await downloadSteamDepots(APP_ID, opts())

    expect(out.status).toBe('error')
    expect(release).toHaveBeenCalledTimes(1)
    expect(stub.jobs).toHaveLength(0)
  })

  it('Phase 54: releases the lease once when the signal aborts after acquire, and resolves cancelled', async () => {
    wire()
    const controller = new AbortController()
    const release = mockLeaseOk(steamUser, () => controller.abort())
    const stub = rust()

    const out = await downloadSteamDepots(
      APP_ID,
      opts({ signal: controller.signal })
    )

    expect(out.status).toBe('cancelled')
    expect(release).toHaveBeenCalledTimes(1)
    expect(stub.jobs).toHaveLength(0)
  })

  it('D-UAT-05: an already-aborted signal resolves cancelled before acquireAuthenticated() is even called', async () => {
    wire()
    const stub = rust()
    const controller = new AbortController()
    controller.abort()

    const out = await downloadSteamDepots(
      APP_ID,
      opts({ signal: controller.signal })
    )

    expect(out.status).toBe('cancelled')
    expect(jest.mocked(steamUser.acquireAuthenticated)).not.toHaveBeenCalled()
    expect(stub.jobs).toHaveLength(0)
  })

  it('23.2-03: a cancel mid key loop resolves cancelled — never swallowed as a skip — and writes no ACF (D-08 Case A)', async () => {
    const c = wire([depot('111'), depot('222')])
    const stub = rust()
    const controller = new AbortController()
    let keyCalls = 0
    c.getDepotDecryptionKey.mockImplementation(
      (_appId: number, depotId: number, cb: KeyCb) => {
        if (++keyCalls === 1) controller.abort()
        cb(null, Buffer.alloc(32, depotId % 250))
      }
    )

    const out = await downloadSteamDepots(
      APP_ID,
      opts({ signal: controller.signal })
    )

    expect(out.status).toBe('cancelled')
    expect(keyCalls).toBe(1)
    expect(stub.jobs).toHaveLength(0)
    expect(readdirSync(dir)).toEqual([])
  })

  it('23.2-03 (T-23.2-16): EVERY depot key Blocked resolves error, never done, runs no job and reports no skipped list', async () => {
    const c = wire([depot('111'), depot('222')])
    const stub = rust()
    c.getDepotDecryptionKey.mockImplementation(
      (_appId: number, _depotId: number, cb: KeyCb) =>
        cb(eresultError('Blocked', 40), undefined as unknown as Buffer)
    )

    const out = await downloadSteamDepots(APP_ID, opts())

    expect(out.status).toBe('error')
    const blocked = classifyDepotError(eresultError('every depot blocked', 40))
    expect(blocked.key).toBe('steam.download.error.depotBlocked')
    expect(out.errorAction).toBe(blocked.action)
    expect(out.error).toMatch(/every selected depot.*111, 222/)
    expect(stub.jobs).toHaveLength(0)
    expect(out.skippedDepots).toBeUndefined()
  })

  it('D-UAT-06: a transient CM drop recovers via retry and the install still completes as done', async () => {
    const c = wire()
    rust()
    let keyCalls = 0
    c.getDepotDecryptionKey.mockImplementation(
      (_appId: number, depotId: number, cb: KeyCb) => {
        if (++keyCalls === 1) {
          cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
          return
        }
        cb(null, Buffer.alloc(32, depotId % 250))
      }
    )

    const out = await downloadSteamDepots(APP_ID, opts())

    expect(out.status).toBe('done')
  })

  it('D-UAT-06: a PERSISTENT CM drop resolves error with the classified, actionable copy — never cancelled, never a throw', async () => {
    const c = wire()
    const stub = rust()
    c.getDepotDecryptionKey.mockImplementation(
      (_appId: number, _depotId: number, cb: KeyCb) =>
        cb(new Error('ECONNRESET'), undefined as unknown as Buffer)
    )

    const out = await downloadSteamDepots(APP_ID, opts())

    expect(out.status).toBe('error')
    expect(out.error).toBe(classifyDepotError(new Error('ECONNRESET')).message)
    expect(stub.jobs).toHaveLength(0)
  })

  it('D-UAT-08: surfaces an HONEST error (depot id + owning appId) instead of the "connection dropped" copy', async () => {
    const c = wire([depot('1460472', '54321')])
    rust()
    c.getDepotDecryptionKey.mockImplementation(
      (_appId: number, _depotId: number, cb: KeyCb) =>
        cb(eresultError('FileNotFound', 9), undefined as unknown as Buffer)
    )

    const out = await downloadSteamDepots(APP_ID, opts())

    expect(out.status).toBe('error')
    expect(out.error).not.toMatch(/dropped the connection/i)
    expect(out.error).toMatch(/1460472/)
    expect(out.error).toMatch(/54321/)
  })

  it('a content-server resolution failure never rejects the caller and leaves no manifest behind', async () => {
    const c = wire()
    const stub = rust()
    c.getContentServers.mockImplementation(
      (
        _appId: number,
        cb: (err: Error | null, s: Array<{ Host?: string }>) => void
      ) => cb(new Error('no content servers available'), [])
    )

    const out = await downloadSteamDepots(APP_ID, opts())

    expect(out.status).toBe('error')
    expect(stub.jobs).toHaveLength(0)
    expect(readdirSync(dir)).toEqual([])
  })

  it('T-D4: logs the failure COUNT, the classification KEY and the first raw failure when the job errors', async () => {
    wire()
    rust({
      outcome: {
        status: 'error',
        acf: { stateFlags: '1026', sizeOnDisk: '5' },
        failures: [
          {
            file: 'game.bin',
            kind: 'sha1_mismatch',
            message: 'SHA1 mismatch for game.bin',
            code: null,
            eresult: null,
            httpStatus: null,
            scope: null,
            msSinceProgress: null
          }
        ]
      }
    })

    const out = await downloadSteamDepots(APP_ID, opts())

    expect(out.status).toBe('error')
    const aggregate = jest
      .mocked(logError)
      .mock.calls.map((c) => String(c[0]))
      .find((m) => m.includes('downloadSteamDepots:'))
    expect(aggregate).toBeDefined()
    expect(aggregate).toContain(APP_ID)
    expect(aggregate).toContain('1 file failure(s)')
    // The classification key is the only log-visible signal telling a real signature match from
    // the generic fallback; the user-facing string cannot express that.
    expect(aggregate).toContain(
      'classified as steam.download.error.verifyFailed'
    )
    expect(aggregate).not.toContain('steam.download.error.generic')
    expect(aggregate).toMatch(/sha1 mismatch/i)
  })

  it('T-D4: a completed or cancelled job logs no failure summary', async () => {
    wire()
    rust()
    await downloadSteamDepots(APP_ID, opts())
    expect(
      jest
        .mocked(logError)
        .mock.calls.some((c) => String(c[0]).includes('download failed'))
    ).toBe(false)
  })
})
