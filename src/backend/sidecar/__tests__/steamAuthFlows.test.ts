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

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { SteamUser } from '../../storeManagers/steam/user'
import { getSteamLibraries } from 'backend/utils'
import { configStore as steamConfigStore } from '../../storeManagers/steam/electronStores'
import { getTokenStore } from '../../storeManagers/steam/tokenStore'
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
    const snapshotResponse = frames.find((frame) => frame.id === 'snapshot-1') as
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

  // Test 5 (Invariant B guard): a deliberately unported channel (D-02 —
  // credential/SteamGuard/logout are out of scope for this plan) still
  // rejects carrying UNPORTED_CHANNEL_MARKER, and the RPC loop keeps serving
  // afterward.
  it('Test 5 (Invariant B guard): logoutSteam (deliberately unported) still rejects non-fatally, and the RPC loop keeps serving', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'logout-1', 'logoutSteam', [])
    await flush()

    const logoutResponse = frames.find((frame) => frame.id === 'logout-1') as
      | { ok: boolean; error?: string }
      | undefined
    expect(logoutResponse?.ok).toBe(false)
    expect(logoutResponse?.error).toContain(UNPORTED_CHANNEL_MARKER)

    writeInvoke(input, 'health-after-logout', 'health', [])
    await flush()
    const healthResponse = frames.find(
      (frame) => frame.id === 'health-after-logout'
    )
    expect(healthResponse).toMatchObject({
      id: 'health-after-logout',
      ok: true,
      result: 'ok'
    })
  })
})
