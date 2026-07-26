/**
 * End-to-end wiring test for the sidecar's curated Steam QR-login channels
 * (Phase 30 Plan 01 — Task 2).
 *
 * Drives the REAL sidecar RPC server in-process (bootstrap.test.ts's
 * real-shim black-box pattern — the shims under test are the actual
 * electronStub.ts/fileStore.ts modules, unmocked) against injected
 * `stream.PassThrough` pairs, mirroring `skeletonFlows.test.ts`'s own shape.
 *
 * **GAP FIX precedent (2026-07-22, see skeletonFlows.test.ts's own header):**
 * this suite's config directory is NOT the real OS config directory. Several
 * tests below write fixture data (including a fake refreshToken) through the
 * real configStore/fileStore module instance, and a previous incident proved
 * that doing so against a developer's REAL
 * `~/Library/Application Support/GameLib/` is an active data-loss hazard. The
 * `jest.mock('os', ...)` below overrides `homedir()` to a disposable
 * per-process tmp directory so the real electronStub/fileStore CODE runs
 * (preserving this suite's fidelity), while the location it reads/writes can
 * never be the developer's real config directory.
 *
 * `jest.mock('electron', ...)` / `jest.mock('electron-store', ...)` below
 * point Jest's OWN module resolution at electronStub.ts/fileStore.ts
 * directly — see skeletonFlows.test.ts's header for why this is necessary,
 * not incidental (Jest's own manual mocks for these node_modules packages
 * would otherwise shadow the real sidecar shims this suite exists to prove).
 *
 * Mocked: `SteamUser`'s three QR-login static methods
 * (`isSteamClientInstalled`/`startQRLogin`/`pollQRLogin` — the network/
 * filesystem-touching surface this suite exists to wire, not re-test; their
 * own internal correctness is covered by `storeManagers/steam/__tests__/
 * user.test.ts`), `backend/utils` (no real on-disk Steam install to scan in
 * CI), and `backend/constants/environment` (pins a deterministic branch
 * regardless of host OS) — all four mirror `skeletonFlows.test.ts`'s own
 * mock set exactly. Every other module in the registration/transport/store
 * path (`steamAuthFlowRegistration.ts`, `handlers.ts`, `sidecarRpc.ts`,
 * `bootstrap.ts`, `electronStub.ts`, `fileStore.ts`, `keyringTokenStore.ts`,
 * `storeManagers/steam/tokenStore.ts`) runs for real, unmodified.
 *
 * The token-seam test (Test 4) does NOT mock or spy on `requestRustInvoke` —
 * it follows `rustInvokeChannel.test.ts`'s own established convention:
 * writing a synthetic `{id, ok, result}` response frame directly into the
 * injected input stream, simulating what `src-tauri/src/main.rs`'s reader
 * thread would write back. This proves the token round-trips over the real
 * `rustInvoke` wire protocol, not merely that a function was called.
 */

import { PassThrough } from 'node:stream'

// ── os — GAP FIX precedent (see module docstring above): redirect homedir()
// to a disposable per-process tmp directory so this suite can never touch a
// developer's real config directory ──────────────────────────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-steamauth-test-home-${process.pid}`)
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — fix/steam-native-install-stability (33-05 live-gate gap): `init()` now wires
// the REAL `initOnlineMonitor()` (backend/online_monitor.ts), which -- now that the real
// electronStub's `net.isOnline()` returns `true` (mocked above) -- immediately calls the real
// `pingSites()`, a live `axios.head()` against github/epic/gog/cloudflare. Mocked so this suite
// (which drives the real, unmocked RPC/handler graph) never makes a real network call; `.create`
// is also stubbed for `backend/utils.ts`'s module-scope `axiosClient` singleton.
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

// ── backend/utils mock — no real on-disk Steam install to scan in CI ────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── backend/constants/environment mock — pins a deterministic branch
// regardless of the host OS running this test (mirrors skeletonFlows.test.ts) ─
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── SteamUser mock — controls isSteamClientInstalled()/startQRLogin()/
// pollQRLogin() (the network/filesystem-touching surface this suite wires,
// not re-tests); automocked, no factory, mirrors skeletonFlows.test.ts's own
// LIB-01 convention for this exact module ────────────────────────────────────
jest.mock('../../storeManagers/steam/user')

// ── Plan 34.4-02 additions — bottle/clientSetup/games mocked at the module
// boundary (their own logic is already covered by
// storeManagers/steam/__tests__/). This suite proves registration and
// transport, not bottle or client-setup logic ────────────────────────────────
jest.mock('../../storeManagers/steam/bottle')
jest.mock('../../storeManagers/steam/clientSetup')
jest.mock('../../storeManagers/steam/games')

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { SteamUser } from '../../storeManagers/steam/user'
import { getSteamLibraries } from 'backend/utils'
import {
  configStore as steamConfigStore,
  steamBottleConfigStore
} from '../../storeManagers/steam/electronStores'
import { getTokenStore } from '../../storeManagers/steam/tokenStore'
import {
  provisionBottle,
  isBottleProvisioned
} from '../../storeManagers/steam/bottle'
import {
  startGuidedClientInstall,
  ensureSteamClientReady
} from '../../storeManagers/steam/clientSetup'
import { getSteamInstallSize } from '../../storeManagers/steam/games'
import {
  UNPORTED_CHANNEL_MARKER,
  RUST_KEYRING_SET
} from 'common/types/sidecarTransport'

type Frame = Record<string, unknown>

/** Buffers newline-delimited output from a PassThrough into parsed frames. */
function collectFrames(stream: PassThrough): Frame[] {
  const frames: Frame[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.trim().length > 0) {
        try {
          frames.push(JSON.parse(line))
        } catch {
          // Non-JSON diagnostic line (e.g. READY_SENTINEL) — ignore.
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return frames
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/** Starts a fresh sidecar RPC loop bound to its own stream pair. */
function startSidecar(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  init(input, output)
  return { input, frames }
}

/** Writes a well-formed `invoke` request frame to the sidecar's stdin. */
function writeInvoke(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'invoke', channel, args })}\n`)
}

/** Writes a well-formed `send` request frame to the sidecar's stdin (copied
 * from settingsFlows.test.ts:249-256 — this file has no prior `writeSend`). */
function writeSend(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'send', channel, args })}\n`)
}

describe('sidecar Steam QR-login flows (Phase 30 Plan 01)', () => {
  beforeEach(() => {
    // resetMocks:true (shared root config) wipes automock implementations
    // before every test — re-establish the defaults every test relies on.
    jest.mocked(getSteamLibraries).mockResolvedValue([])
  })

  afterEach(() => {
    // Isolated per-process tmp config dir (see the `os` module override at
    // the top of this file) — clear() here only ever touches that disposable
    // directory, never real user data.
    steamConfigStore.clear()
    steamBottleConfigStore.clear()
  })

  // Test 1: checkSteamInstalled resolves a real boolean, not the unported marker.
  it('Test 1: checkSteamInstalled invoke resolves a real boolean, not the unported marker', async () => {
    jest.mocked(SteamUser.isSteamClientInstalled).mockReturnValue(true)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'check-1', 'checkSteamInstalled', [])
    await flush()

    const response = frames.find((frame) => frame.id === 'check-1')
    expect(response).toMatchObject({ id: 'check-1', ok: true, result: true })
    expect(SteamUser.isSteamClientInstalled).toHaveBeenCalledTimes(1)
  })

  // Test 2: steamStartQR resolves the declared shape and delegates to
  // SteamUser.startQRLogin exactly once.
  it('Test 2: steamStartQR invoke resolves the declared shape and delegates to SteamUser.startQRLogin exactly once', async () => {
    jest.mocked(SteamUser.startQRLogin).mockResolvedValue({
      status: 'done',
      challengeUrl: 'https://s.team/q/1/999001'
    })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'start-1', 'steamStartQR', [])
    await flush()

    const response = frames.find((frame) => frame.id === 'start-1')
    expect(response).toMatchObject({
      id: 'start-1',
      ok: true,
      result: { status: 'done', challengeUrl: 'https://s.team/q/1/999001' }
    })
    expect(SteamUser.startQRLogin).toHaveBeenCalledTimes(1)
  })

  // Test 3: steamPollQR resolves the declared shape and delegates to
  // SteamUser.pollQRLogin.
  it('Test 3: steamPollQR invoke resolves the declared shape and delegates to SteamUser.pollQRLogin', async () => {
    jest.mocked(SteamUser.pollQRLogin).mockResolvedValue({ status: 'waiting' })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'poll-1', 'steamPollQR', [])
    await flush()

    const response = frames.find((frame) => frame.id === 'poll-1')
    expect(response).toMatchObject({
      id: 'poll-1',
      ok: true,
      result: { status: 'waiting' }
    })
    expect(SteamUser.pollQRLogin).toHaveBeenCalledTimes(1)
  })

  // Test 4 (token seam + Phase 28 D-04 regression, extended to this channel
  // set): with a mocked poll that reports success, the refresh token —
  // written through getTokenStore().setToken() exactly as SteamUser's real
  // 'authenticated' handler does (user.ts) — round-trips over the real
  // rustInvoke wire protocol (never a direct configStore write), and no
  // snapshot served by sidecar:store-snapshot ever surfaces a refreshToken
  // field for steamConfigStore.
  it('Test 4 (token seam): a successful QR poll writes the token through the TokenStore seam via rustInvoke, and it never surfaces in a store snapshot', async () => {
    jest
      .mocked(SteamUser.pollQRLogin)
      .mockResolvedValue({ status: 'done', username: 'gsd-tester' })

    const { input, frames } = startSidecar()

    // Simulates exactly what SteamUser's real 'authenticated' handler does on
    // a successful QR approval (user.ts's startQRLogin/finishAuth): write the
    // refresh token through the TokenStore seam, and only isLoggedIn/userData
    // (never the token itself) onto the shared steamConfigStore.
    const setTokenPromise = getTokenStore().setToken('QR-SESSION-TEST-TOKEN')
    await flush()

    // The seam must reach Rust over the real rustInvoke wire protocol — not a
    // direct configStore/steamConfigStore write (T-30-01/T-30-02).
    const rustInvokeFrame = frames.find(
      (frame) =>
        frame.kind === 'rustInvoke' && frame.channel === RUST_KEYRING_SET
    ) as { id: string; args: unknown[] } | undefined
    expect(rustInvokeFrame).toBeDefined()
    expect(rustInvokeFrame?.args).toEqual(['QR-SESSION-TEST-TOKEN'])

    // Simulate Rust's successful keyring_set response so setToken() resolves.
    input.write(
      `${JSON.stringify({ id: rustInvokeFrame?.id, ok: true, result: null })}\n`
    )
    await setTokenPromise

    steamConfigStore.set('isLoggedIn', true)
    steamConfigStore.set('userData', {
      username: 'gsd-tester',
      steamId: 'STEAMID_TEST'
    })

    writeInvoke(input, 'poll-done-1', 'steamPollQR', [])
    await flush()
    const pollResponse = frames.find((frame) => frame.id === 'poll-done-1')
    expect(pollResponse).toMatchObject({
      id: 'poll-done-1',
      ok: true,
      result: { status: 'done', username: 'gsd-tester' }
    })

    // Phase 28 D-04 regression, extended to this new channel set: even if a
    // refreshToken value ends up on steamConfigStore (e.g. a legacy write, or
    // an attacker-controlled storeSet), the eager snapshot must never surface
    // it. userData passes through; refreshToken never does.
    steamConfigStore.set(
      'refreshToken',
      'super-secret-should-never-leave-the-sidecar'
    )
    writeInvoke(input, 'snapshot-1', 'sidecar:store-snapshot', [])
    await flush()
    const snapshotResponse = frames.find(
      (frame) => frame.id === 'snapshot-1'
    ) as
      | {
          ok: boolean
          result: { steamConfigStore?: Record<string, unknown> }
        }
      | undefined

    expect(snapshotResponse?.ok).toBe(true)
    expect(snapshotResponse?.result.steamConfigStore?.userData).toEqual({
      username: 'gsd-tester',
      steamId: 'STEAMID_TEST'
    })
    expect(snapshotResponse?.result.steamConfigStore).not.toHaveProperty(
      'refreshToken'
    )
  })

  // Test 5 (Invariant B guard) — REWRITTEN by Phase 34.4 Plan 01. The
  // ORIGINAL channel this test drove was `logoutSteam`, asserting it stayed
  // "deliberately unported" per Phase 30 D-02. That contract is legitimately
  // CHANGED by this plan: REQ-34.4-02 ports `logoutSteam` as a real `send`
  // channel (see the describe block below for its own send-kind proof, plus
  // the plan 34.4-10 live-gate item 2 for the residual jest structurally
  // cannot reach). Re-pointed at `humbleRevealKey` instead — one of the 6
  // Humble channels deliberately deferred to Phase 34.4.1 (D-02) and not
  // registered by any 34.4 plan — to keep proving Invariant B (an unported
  // channel stays a non-fatal rejection, and the RPC loop keeps serving)
  // without silently dropping the assertion this test exists to make.
  it('Test 5 (Invariant B guard): humbleRevealKey (deferred to Phase 34.4.1, D-02) still rejects non-fatally, and the RPC loop keeps serving', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'reveal-1', 'humbleRevealKey', [])
    await flush()

    const revealResponse = frames.find((frame) => frame.id === 'reveal-1') as
      | { ok: boolean; error?: string }
      | undefined
    expect(revealResponse?.ok).toBe(false)
    expect(revealResponse?.error).toContain(UNPORTED_CHANNEL_MARKER)

    writeInvoke(input, 'health-after-reveal', 'health', [])
    await flush()
    const healthResponse = frames.find(
      (frame) => frame.id === 'health-after-reveal'
    )
    expect(healthResponse).toMatchObject({
      id: 'health-after-reveal',
      ok: true,
      result: 'ok'
    })
  })

  // ── Credential/SteamGuard/TOTP login trio (Phase 34.4 Plan 01, REQ-34.4-01) ──
  describe('credential/SteamGuard/TOTP login trio', () => {
    it('REQ-34.4-01 steamStartCredentials invoke resolves a real value (not the unported marker) and delegates the destructured username/password, not the raw payload object', async () => {
      jest
        .mocked(SteamUser.startCredentialLogin)
        .mockResolvedValue({ status: 'done' })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'start-cred-1', 'steamStartCredentials', [
        { username: 'gsd-tester', password: 'super-secret' }
      ])
      await flush()

      const response = frames.find((frame) => frame.id === 'start-cred-1')
      expect(response).toMatchObject({
        id: 'start-cred-1',
        ok: true,
        result: { status: 'done' }
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(SteamUser.startCredentialLogin).toHaveBeenCalledTimes(1)
      expect(SteamUser.startCredentialLogin).toHaveBeenCalledWith(
        'gsd-tester',
        'super-secret'
      )
    })

    it('REQ-34.4-01 steamStartCredentials round-trips a guard_required-shaped value unchanged (the frontend contract, steam/user.ts:49-51)', async () => {
      jest
        .mocked(SteamUser.startCredentialLogin)
        .mockResolvedValue({ status: 'guard_required' })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'start-cred-guard-1', 'steamStartCredentials', [
        { username: 'gsd-tester', password: 'super-secret' }
      ])
      await flush()

      const response = frames.find((frame) => frame.id === 'start-cred-guard-1')
      expect(response).toMatchObject({
        id: 'start-cred-guard-1',
        ok: true,
        result: { status: 'guard_required' }
      })
    })

    it('REQ-34.4-01 steamSubmitGuard invoke resolves a real value and delegates the bare code string to submitSteamGuardCode', async () => {
      jest
        .mocked(SteamUser.submitSteamGuardCode)
        .mockResolvedValue({ status: 'done' })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'submit-guard-1', 'steamSubmitGuard', ['ABCDE'])
      await flush()

      const response = frames.find((frame) => frame.id === 'submit-guard-1')
      expect(response).toMatchObject({
        id: 'submit-guard-1',
        ok: true,
        result: { status: 'done' }
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(SteamUser.submitSteamGuardCode).toHaveBeenCalledTimes(1)
      expect(SteamUser.submitSteamGuardCode).toHaveBeenCalledWith('ABCDE')
    })

    it('REQ-34.4-01 steamPollCredential invoke resolves a real value and delegates with no arguments', async () => {
      jest
        .mocked(SteamUser.pollCredentialLogin)
        .mockResolvedValue({ status: 'waiting' })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'poll-cred-1', 'steamPollCredential', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'poll-cred-1')
      expect(response).toMatchObject({
        id: 'poll-cred-1',
        ok: true,
        result: { status: 'waiting' }
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(SteamUser.pollCredentialLogin).toHaveBeenCalledTimes(1)
      expect(SteamUser.pollCredentialLogin).toHaveBeenCalledWith()
    })
  })

  // ── Session/identity trio (Phase 34.4 Plan 01, REQ-34.4-02) ──────────────────
  describe('session/identity trio', () => {
    it('REQ-34.4-02 getSteamUserInfo invoke round-trips a real value, not the unported marker', async () => {
      jest.mocked(SteamUser.getUserDetails).mockResolvedValue({
        username: 'gsd-tester',
        steamId: 'STEAMID_TEST'
      })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'user-info-1', 'getSteamUserInfo', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'user-info-1')
      expect(response).toMatchObject({
        id: 'user-info-1',
        ok: true,
        result: { username: 'gsd-tester', steamId: 'STEAMID_TEST' }
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(SteamUser.getUserDetails).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-02 getSteamSyncedAt invoke resolves null when the store has no syncedAt (matching `?? null`)', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'synced-at-1', 'getSteamSyncedAt', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'synced-at-1')
      expect(response).toMatchObject({
        id: 'synced-at-1',
        ok: true,
        result: null
      })
    })

    describe('logoutSteam (the G-30-01 send channel)', () => {
      it('REQ-34.4-02 kind proof, positive direction: a logoutSteam SEND frame causes SteamUser.logout to be called exactly once', async () => {
        jest.mocked(SteamUser.logout).mockResolvedValue(undefined)

        const { input, frames } = startSidecar()
        writeSend(input, 'logout-send-1', 'logoutSteam', [])
        await flush()

        // A send never produces a response frame with this id.
        expect(
          frames.find((frame) => frame.id === 'logout-send-1')
        ).toBeUndefined()
        expect(SteamUser.logout).toHaveBeenCalledTimes(1)
      })

      it('REQ-34.4-02 kind proof, negative direction: logoutSteam must NOT be reachable as an invoke handler', async () => {
        jest.mocked(SteamUser.logout).mockResolvedValue(undefined)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'logout-invoke-1', 'logoutSteam', [])
        await flush()

        const response = frames.find(
          (frame) => frame.id === 'logout-invoke-1'
        ) as { ok?: boolean; error?: string } | undefined
        // A send channel driven as an invoke must not resolve a successful
        // response frame carrying a SteamUser.logout() result — this is the
        // dispatchSend/dispatchInvoke mismatch G-30-01's inverse would produce.
        expect(response?.ok).not.toBe(true)
        expect(SteamUser.logout).not.toHaveBeenCalled()
      })

      it('REQ-34.4-02 rejection guard: a rejecting SteamUser.logout does not crash the sidecar and the RPC loop keeps serving', async () => {
        const unhandledRejections: unknown[] = []
        const onUnhandledRejection = (reason: unknown): void => {
          unhandledRejections.push(reason)
        }
        process.on('unhandledRejection', onUnhandledRejection)

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

        try {
          jest
            .mocked(SteamUser.logout)
            .mockRejectedValue(new Error('logout transport failure'))

          const { input, frames } = startSidecar()
          writeSend(input, 'logout-reject-1', 'logoutSteam', [])
          await flush()

          expect(warnSpy).toHaveBeenCalledWith(
            '[steamAuthFlowRegistration] logoutSteam failed:',
            expect.any(Error)
          )

          writeInvoke(input, 'health-after-logout-reject', 'health', [])
          await flush()
          const healthResponse = frames.find(
            (frame) => frame.id === 'health-after-logout-reject'
          )
          expect(healthResponse).toMatchObject({
            id: 'health-after-logout-reject',
            ok: true,
            result: 'ok'
          })

          expect(unhandledRejections).toEqual([])
        } finally {
          process.off('unhandledRejection', onUnhandledRejection)
          warnSpy.mockRestore()
        }
      })
    })
  })

  // ── macOS CrossOver bottle trio (Phase 34.4 Plan 02, REQ-34.4-03) ────────────
  describe('bottle trio', () => {
    it('REQ-34.4-03 steamBottleProvision invoke delegates to provisionBottle exactly once with the transport arg passed through unchanged', async () => {
      jest.mocked(provisionBottle).mockResolvedValue({ status: 'done' })

      const { input, frames } = startSidecar()
      const transportArg = { bottleName: 'GameLibSteam' }
      writeInvoke(input, 'bottle-provision-1', 'steamBottleProvision', [
        transportArg
      ])
      await flush()

      const response = frames.find((frame) => frame.id === 'bottle-provision-1')
      expect(response).toMatchObject({
        id: 'bottle-provision-1',
        ok: true,
        result: { status: 'done' }
      })
      expect(provisionBottle).toHaveBeenCalledTimes(1)
      expect(provisionBottle).toHaveBeenCalledWith(transportArg)
    })

    it("REQ-34.4-03 isSteamBottleProvisioned invoke round-trips isBottleProvisioned()'s boolean", async () => {
      jest.mocked(isBottleProvisioned).mockReturnValue(true)

      const { input, frames } = startSidecar()
      writeInvoke(input, 'is-provisioned-1', 'isSteamBottleProvisioned', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'is-provisioned-1')
      expect(response).toMatchObject({
        id: 'is-provisioned-1',
        ok: true,
        result: true
      })
      expect(isBottleProvisioned).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-03 steamBottleStatus resolves the exact defaulted object when both store reads return undefined', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'bottle-status-default-1', 'steamBottleStatus', [])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'bottle-status-default-1'
      )
      expect(response).toMatchObject({
        id: 'bottle-status-default-1',
        ok: true,
        result: { provisioned: false, bottleName: 'GameLibSteam' }
      })
    })

    it('REQ-34.4-03 steamBottleStatus resolves real stored values when present', async () => {
      steamBottleConfigStore.set('provisioned', true)
      steamBottleConfigStore.set('bottleName', 'CustomBottle')

      const { input, frames } = startSidecar()
      writeInvoke(input, 'bottle-status-real-1', 'steamBottleStatus', [])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'bottle-status-real-1'
      )
      expect(response).toMatchObject({
        id: 'bottle-status-real-1',
        ok: true,
        result: { provisioned: true, bottleName: 'CustomBottle' }
      })
    })

    it('REQ-34.4-03 steamBottleStatus resolved object has no loggedIn property (17-17/WR-02 — the always-false auth signal was deliberately removed)', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'bottle-status-no-loggedin-1', 'steamBottleStatus', [])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'bottle-status-no-loggedin-1'
      ) as { result?: Record<string, unknown> } | undefined
      expect(response?.result).not.toHaveProperty('loggedIn')
    })
  })

  // ── Guided Steam-client install pair (Phase 34.4 Plan 02, REQ-34.4-04) ───────
  describe('client-setup pair', () => {
    it('REQ-34.4-04 steamClientSetupStart invoke round-trips and delegates to startGuidedClientInstall exactly once', async () => {
      jest
        .mocked(startGuidedClientInstall)
        .mockResolvedValue({ status: 'started' })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'client-setup-start-1', 'steamClientSetupStart', [])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'client-setup-start-1'
      )
      expect(response).toMatchObject({
        id: 'client-setup-start-1',
        ok: true,
        result: { status: 'started' }
      })
      expect(startGuidedClientInstall).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-04 steamClientSetupRecheck invoke round-trips and delegates to ensureSteamClientReady exactly once with the appId argument', async () => {
      jest
        .mocked(ensureSteamClientReady)
        .mockResolvedValue({ status: 'ready', ready: true })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'client-setup-recheck-1', 'steamClientSetupRecheck', [
        '999001'
      ])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'client-setup-recheck-1'
      )
      expect(response).toMatchObject({
        id: 'client-setup-recheck-1',
        ok: true,
        result: { status: 'ready', ready: true }
      })
      expect(ensureSteamClientReady).toHaveBeenCalledTimes(1)
      expect(ensureSteamClientReady).toHaveBeenCalledWith('999001')
    })
  })

  // ── redeemSteamKey / getSteamInstallSize (Phase 34.4 Plan 02, REQ-34.4-05) ───
  describe('redeem / install size', () => {
    it('REQ-34.4-05 redeemSteamKey invoke, valid payload: reaches SteamUser.redeemKey with exactly the two positional args and the result round-trips', async () => {
      jest
        .mocked(SteamUser.redeemKey)
        .mockResolvedValue({ store: 'steam', outcome: 'success' })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'redeem-valid-1', 'redeemSteamKey', [
        { store: 'steam', key: 'AAAAA-BBBBB-CCCCC' }
      ])
      await flush()

      const response = frames.find((frame) => frame.id === 'redeem-valid-1')
      expect(response).toMatchObject({
        id: 'redeem-valid-1',
        ok: true,
        result: { store: 'steam', outcome: 'success' }
      })
      expect(SteamUser.redeemKey).toHaveBeenCalledTimes(1)
      expect(SteamUser.redeemKey).toHaveBeenCalledWith(
        'steam',
        'AAAAA-BBBBB-CCCCC'
      )
    })

    // ── WR-03 trust-boundary rejection cases — the point of this describe.
    // Each asserts SteamUser.redeemKey was NEVER called (not merely that the
    // returned message matches), which is what makes this a real
    // trust-boundary test rather than one that would still pass if the guard
    // were moved after the delegation.
    it('REQ-34.4-05 redeemSteamKey invoke rejects a non-"steam" store before reaching SteamUser.redeemKey', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'redeem-bad-store-1', 'redeemSteamKey', [
        { store: 'gog', key: 'AAAAA-BBBBB-CCCCC' }
      ])
      await flush()

      const response = frames.find((frame) => frame.id === 'redeem-bad-store-1')
      expect(response).toMatchObject({
        id: 'redeem-bad-store-1',
        ok: true,
        result: {
          store: 'steam',
          outcome: 'error',
          message: 'invalid-request'
        }
      })
      expect(SteamUser.redeemKey).not.toHaveBeenCalled()
    })

    it('REQ-34.4-05 redeemSteamKey invoke rejects a non-string key before reaching SteamUser.redeemKey', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'redeem-bad-key-type-1', 'redeemSteamKey', [
        { store: 'steam', key: 12345 }
      ])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'redeem-bad-key-type-1'
      )
      expect(response).toMatchObject({
        id: 'redeem-bad-key-type-1',
        ok: true,
        result: {
          store: 'steam',
          outcome: 'error',
          message: 'invalid-request'
        }
      })
      expect(SteamUser.redeemKey).not.toHaveBeenCalled()
    })

    it('REQ-34.4-05 redeemSteamKey invoke rejects an empty-string key before reaching SteamUser.redeemKey', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'redeem-empty-key-1', 'redeemSteamKey', [
        { store: 'steam', key: '' }
      ])
      await flush()

      const response = frames.find((frame) => frame.id === 'redeem-empty-key-1')
      expect(response).toMatchObject({
        id: 'redeem-empty-key-1',
        ok: true,
        result: {
          store: 'steam',
          outcome: 'error',
          message: 'invalid-request'
        }
      })
      expect(SteamUser.redeemKey).not.toHaveBeenCalled()
    })

    it('REQ-34.4-05 redeemSteamKey invoke rejects a missing/null payload before reaching SteamUser.redeemKey', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'redeem-null-payload-1', 'redeemSteamKey', [null])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'redeem-null-payload-1'
      )
      expect(response).toMatchObject({
        id: 'redeem-null-payload-1',
        ok: true,
        result: {
          store: 'steam',
          outcome: 'error',
          message: 'invalid-request'
        }
      })
      expect(SteamUser.redeemKey).not.toHaveBeenCalled()
    })

    it('REQ-34.4-05 no emitted log line or response frame in the rejection cases contains the submitted key value', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const SECRET_KEY = 'SUPER-SECRET-KEY-VALUE-DO-NOT-LEAK'

      try {
        const { input, frames } = startSidecar()
        writeInvoke(input, 'redeem-no-leak-1', 'redeemSteamKey', [
          { store: 'not-steam', key: SECRET_KEY }
        ])
        await flush()

        const response = frames.find((frame) => frame.id === 'redeem-no-leak-1')
        expect(JSON.stringify(response)).not.toContain(SECRET_KEY)

        const allLoggedText = [
          ...logSpy.mock.calls,
          ...warnSpy.mock.calls,
          ...errorSpy.mock.calls
        ]
          .flat()
          .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
          .join('\n')
        expect(allLoggedText).not.toContain(SECRET_KEY)
        expect(SteamUser.redeemKey).not.toHaveBeenCalled()
      } finally {
        logSpy.mockRestore()
        warnSpy.mockRestore()
        errorSpy.mockRestore()
      }
    })

    it('REQ-34.4-05 getSteamInstallSize invoke round-trips and delegates to getSteamInstallSize exactly once with the appId', async () => {
      jest.mocked(getSteamInstallSize).mockResolvedValue('1.5 GB')

      const { input, frames } = startSidecar()
      writeInvoke(input, 'install-size-1', 'getSteamInstallSize', ['999001'])
      await flush()

      const response = frames.find((frame) => frame.id === 'install-size-1')
      expect(response).toMatchObject({
        id: 'install-size-1',
        ok: true,
        result: '1.5 GB'
      })
      expect(getSteamInstallSize).toHaveBeenCalledTimes(1)
      expect(getSteamInstallSize).toHaveBeenCalledWith('999001')
    })
  })
})
