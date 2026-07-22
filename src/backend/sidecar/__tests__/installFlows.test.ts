/**
 * End-to-end wiring test for the sidecar's curated install-slice channels
 * (Phase 30 Plan 02 — Task 3).
 *
 * Drives the REAL sidecar RPC server in-process (bootstrap.test.ts's
 * real-shim black-box pattern — the shims under test are the actual
 * electronStub.ts/fileStore.ts modules, unmocked) against injected
 * `stream.PassThrough` pairs, mirroring `steamAuthFlows.test.ts`'s own shape.
 *
 * **GAP FIX precedent (2026-07-22, see skeletonFlows.test.ts's own header):**
 * this suite's config directory is NOT the real OS config directory. The
 * `jest.mock('os', ...)` below overrides `homedir()` to a disposable
 * per-process tmp directory so the real electronStub/fileStore CODE runs
 * (preserving this suite's fidelity), while the location it reads/writes can
 * never be the developer's real config directory.
 *
 * `jest.mock('electron', ...)` / `jest.mock('electron-store', ...)` below
 * point Jest's OWN module resolution at electronStub.ts/fileStore.ts
 * directly — see skeletonFlows.test.ts's header for why this is necessary.
 *
 * Mocked only at the DEEPEST boundary this plan's own module docstring names:
 *   - `storeManagers/steam/games` (the `SteamGame` class) — a factory mock
 *     whose `install`/`update`/`uninstall`/`getGameInfo` are plain jest.fn()s
 *     exposed on the mocked constructor's own `__mocks` property (avoids the
 *     babel-jest-hoist "mock"-prefix TDZ hazard of referencing outer consts
 *     from inside a `jest.mock()` factory). This is what keeps a real
 *     `install` invoke from ever reaching the real depot-download
 *     orchestrator, PICS, or the filesystem — proving the WIRING, not the
 *     depot mechanics (already covered by
 *     `storeManagers/steam/__tests__/games.test.ts`).
 *   - `backend/utils`'s `getSteamLibraries` (no real on-disk Steam install
 *     to scan in CI) — every OTHER export (notably `sendGameStatusUpdate`,
 *     the D-06 push this suite asserts on) is preserved via
 *     `jest.requireActual` so the real push path runs unmodified.
 *   - `backend/constants/environment` (pins a deterministic branch regardless
 *     of host OS, mirrors skeletonFlows.test.ts/steamAuthFlows.test.ts).
 *   - `backend/config` (`GlobalConfig.get`) — mirrors
 *     `nativeInstallSetting.test.ts`'s own mock strategy: a real
 *     `GlobalConfig.get()` call writes a fresh `config.json` to disk via
 *     `graceful-fs`, which needs its parent directory to already exist (real
 *     Electron creates it at app-start via `makeSureFoldersExist`, a
 *     concern this narrow wiring suite has no reason to reproduce). A plain
 *     `{ getSettings: () => settings }` stub avoids that disk dependency
 *     while still exercising the real `isSteamNativeInstallEnabled()` and
 *     `checkGameUpdates()` bodies.
 *
 * Every other module in the registration/transport/store path
 * (`installFlowRegistration.ts`, `handlers.ts`, `sidecarRpc.ts`,
 * `bootstrap.ts`, `electronStub.ts`, `fileStore.ts`,
 * `backend/utils/uninstaller.ts`, `backend/utils/checkGameUpdates.ts`,
 * `backend/storeManagers` incl. all six library managers,
 * `storeManagers/steam/installLocation.ts`,
 * `storeManagers/steam/nativeInstallSetting.ts`) runs for real, unmodified.
 */

import { PassThrough } from 'node:stream'

// ── os — GAP FIX precedent: redirect homedir() to a disposable per-process
// tmp directory so this suite can never touch a developer's real config
// directory (GlobalConfig/fileStore both resolve their on-disk path from
// homedir()) ──────────────────────────────────────────────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-installflows-test-home-${process.pid}`)
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── backend/utils — preserve every real export (notably sendGameStatusUpdate,
// the D-06 push this suite asserts on) except getSteamLibraries, which would
// otherwise scan a real on-disk Steam install in CI ─────────────────────────
jest.mock('backend/utils', () => ({
  ...jest.requireActual('backend/utils'),
  getSteamLibraries: jest.fn()
}))

// ── backend/constants/environment mock — pins a deterministic branch
// regardless of the host OS running this test (mirrors skeletonFlows.test.ts /
// steamAuthFlows.test.ts) ────────────────────────────────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── backend/config mock — mirrors nativeInstallSetting.test.ts's own
// strategy: avoid a real on-disk config.json write while still exercising
// the real isSteamNativeInstallEnabled()/checkGameUpdates() bodies against a
// controllable settings object ───────────────────────────────────────────────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── SteamGame — the deepest boundary this plan's install/uninstall/updateGame
// channels touch. Mocked so a real `install` invoke never reaches the real
// depot-download orchestrator, PICS, or the filesystem. Mock fns are exposed
// on the mocked constructor's own `__mocks` property rather than referenced
// via outer `const`s, to avoid the babel-jest-hoist "mock"-prefix TDZ hazard. ─
jest.mock('../../storeManagers/steam/games', () => {
  const install = jest.fn()
  const update = jest.fn()
  const uninstall = jest.fn()
  const getGameInfo = jest.fn()
  const ctor = jest.fn().mockImplementation(() => ({
    install,
    update,
    uninstall,
    getGameInfo
  }))
  ;(ctor as unknown as { __mocks: Record<string, jest.Mock> }).__mocks = {
    install,
    update,
    uninstall,
    getGameInfo
  }
  return { __esModule: true, default: ctor }
})

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { getSteamLibraries } from 'backend/utils'
import { GlobalConfig } from 'backend/config'
import SteamGame from '../../storeManagers/steam/games'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import type { AppSettings } from 'common/types'

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock

/** Points the mocked GlobalConfig.get() at a fresh settings object (mirrors
 *  nativeInstallSetting.test.ts's own helper). */
function mockSettings(partial: Partial<AppSettings>) {
  mockedGlobalConfigGet.mockReturnValue({
    getSettings: () => partial as AppSettings
  })
}

type MockedSteamGame = {
  __mocks: {
    install: jest.Mock
    update: jest.Mock
    uninstall: jest.Mock
    getGameInfo: jest.Mock
  }
}
const steamGameMocks = (SteamGame as unknown as MockedSteamGame).__mocks

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

describe('sidecar install-slice flows (Phase 30 Plan 02)', () => {
  beforeEach(() => {
    // resetMocks:true (shared root config) wipes automock implementations
    // before every test — re-establish the defaults every test relies on.
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    steamGameMocks.install.mockReset().mockResolvedValue({ status: 'done' })
    steamGameMocks.update
      .mockReset()
      .mockResolvedValue({ status: 'error', error: 'not implemented' })
    steamGameMocks.uninstall.mockReset().mockResolvedValue({ stdout: '', stderr: '' })
    steamGameMocks.getGameInfo
      .mockReset()
      .mockReturnValue({ title: 'Install Flows Test Game' })
    // resetMocks:true wipes the mocked constructor's own mockImplementation
    // too (not just steamGameMocks.*'s), so it must be re-established here —
    // otherwise `new SteamGame(appName)` returns a bare `{}` with none of the
    // steamGameMocks.* methods attached.
    ;(SteamGame as unknown as jest.Mock).mockImplementation(() => ({
      install: steamGameMocks.install,
      update: steamGameMocks.update,
      uninstall: steamGameMocks.uninstall,
      getGameInfo: steamGameMocks.getGameInfo
    }))
    // Opt-in setting defaults to false (D-13 safety valve) and autoUpdateGames
    // defaults to false (D-12's checkGameUpdates only calls autoUpdate() when
    // this is truthy).
    mockSettings({ enableSteamNativeInstall: false, autoUpdateGames: false })
  })

  // Test 1: listSteamLibraryTargets resolves an array (not the unported
  // marker), and mirrors Electron's own isSteamNativeInstallEnabled() gate —
  // [] with the opt-in OFF.
  it('Test 1: listSteamLibraryTargets resolves [] with the native-install opt-in OFF (mirrors Electron gate)', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'targets-off-1', 'listSteamLibraryTargets', [])
    await flush()

    const response = frames.find((frame) => frame.id === 'targets-off-1')
    expect(response).toMatchObject({ id: 'targets-off-1', ok: true, result: [] })
  })

  it('Test 1b: listSteamLibraryTargets resolves the real registered-library array with the opt-in ON', async () => {
    mockSettings({ enableSteamNativeInstall: true, autoUpdateGames: false })
    jest.mocked(getSteamLibraries).mockResolvedValue(['/fake/steam/library'])

    const { input, frames } = startSidecar()
    writeInvoke(input, 'targets-on-1', 'listSteamLibraryTargets', [])
    await flush()

    const response = frames.find((frame) => frame.id === 'targets-on-1') as
      | { ok: boolean; result: Array<{ path: string; isPrimary: boolean }> }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toEqual([
      {
        path: '/fake/steam/library',
        steamappsDir: '/fake/steam/library/steamapps',
        isPrimary: true
      }
    ])
  })

  // Test 2 + 3: install resolves, reaches SteamGame.install exactly once with
  // the appName from the invoke args, and emits a 'queued' gameStatusUpdate
  // frontendMessage BEFORE the install call resolves (the D-06 push proof —
  // zero Rust changes needed).
  it('Test 2/3: install resolves, reaches SteamGame.install exactly once, and pushes a queued gameStatusUpdate frame first', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'install-1', 'install', [
      {
        appName: '999001',
        runner: 'steam',
        gameInfo: {},
        path: '/fake/steam/library',
        platformToInstall: 'linux'
      }
    ])
    await flush()

    const response = frames.find((frame) => frame.id === 'install-1') as
      | { id: string; ok: boolean }
      | undefined
    expect(response?.id).toBe('install-1')
    expect(response?.ok).toBe(true)

    expect(SteamGame as unknown as jest.Mock).toHaveBeenCalledTimes(1)
    expect((SteamGame as unknown as jest.Mock).mock.calls[0][0]).toBe('999001')
    expect(steamGameMocks.install).toHaveBeenCalledTimes(1)
    expect(steamGameMocks.install.mock.calls[0][0]).toMatchObject({
      path: '/fake/steam/library',
      platformToInstall: 'linux'
    })

    const statusFrame = frames.find(
      (frame) =>
        frame.kind === 'frontendMessage' && frame.channel === 'gameStatusUpdate'
    ) as { args?: unknown[] } | undefined
    expect(statusFrame).toBeDefined()
    expect((statusFrame?.args ?? [])[0]).toMatchObject({
      appName: '999001',
      runner: 'steam',
      status: 'queued'
    })

    // downloadmanager's queue orchestrator is never involved (D-05a bypass) —
    // this file imports SteamGame directly, no download-queue module at all.
  })

  // CR-01: `install` must reject non-steam runners honestly instead of
  // silently constructing a SteamGame and running the depot installer
  // against a foreign appName.
  it('CR-01: install rejects a non-steam runner and never constructs a SteamGame', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'install-nonsteam-1', 'install', [
      {
        appName: 'gog-app-1',
        runner: 'gog',
        gameInfo: {},
        path: '/fake/gog/library'
      }
    ])
    await flush()

    const response = frames.find(
      (frame) => frame.id === 'install-nonsteam-1'
    ) as { ok: boolean; error?: string } | undefined
    expect(response?.ok).toBe(false)
    expect(response?.error).toContain(UNPORTED_CHANNEL_MARKER)
    expect(response?.error).toContain('gog')

    expect(SteamGame as unknown as jest.Mock).not.toHaveBeenCalled()
    expect(steamGameMocks.install).not.toHaveBeenCalled()

    // No status frame should have been pushed either — the rejection happens
    // before the D-05a 'queued' push.
    const statusFrame = frames.find(
      (frame) =>
        frame.kind === 'frontendMessage' && frame.channel === 'gameStatusUpdate'
    )
    expect(statusFrame).toBeUndefined()
  })

  // CR-01: `updateGame` has the identical defect — same guard, same proof.
  it('CR-01: updateGame rejects a non-steam runner and never constructs a SteamGame', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'update-nonsteam-1', 'updateGame', [
      {
        appName: 'gog-app-1',
        runner: 'gog',
        gameInfo: {}
      }
    ])
    await flush()

    const response = frames.find(
      (frame) => frame.id === 'update-nonsteam-1'
    ) as { ok: boolean; error?: string } | undefined
    expect(response?.ok).toBe(false)
    expect(response?.error).toContain(UNPORTED_CHANNEL_MARKER)
    expect(response?.error).toContain('gog')

    expect(SteamGame as unknown as jest.Mock).not.toHaveBeenCalled()
    expect(steamGameMocks.update).not.toHaveBeenCalled()
  })

  // Test 4: uninstall resolves and delegates to the runner-generic
  // uninstallGameCallback (registered UNCHANGED, D-05b).
  it('Test 4: uninstall resolves and delegates to the real uninstallGameCallback', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'uninstall-1', 'uninstall', [
      '999001',
      'steam',
      false,
      false
    ])
    await flush()

    const response = frames.find((frame) => frame.id === 'uninstall-1')
    expect(response).toMatchObject({ id: 'uninstall-1', ok: true })
    expect(steamGameMocks.uninstall).toHaveBeenCalledTimes(1)
    expect(steamGameMocks.getGameInfo).toHaveBeenCalled()

    // uninstallGameCallback's own 'uninstalling' status push, proving the
    // real (unmodified) function ran, not a reimplementation.
    const uninstallingFrame = frames.find(
      (frame) =>
        frame.kind === 'frontendMessage' &&
        frame.channel === 'gameStatusUpdate' &&
        ((frame.args as unknown[])?.[0] as { status?: string })?.status ===
          'uninstalling'
    )
    expect(uninstallingFrame).toBeDefined()
  })

  // Test 5: checkGameUpdates resolves a string[] across all runners — a
  // manager whose CLI/credentials are absent must not make the whole call
  // reject (D-12, all runners).
  it('Test 5: checkGameUpdates resolves a string[] without rejecting', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'updates-1', 'checkGameUpdates', [])
    await flush()

    const response = frames.find((frame) => frame.id === 'updates-1') as
      | { ok: boolean; result: unknown }
      | undefined
    expect(response?.ok).toBe(true)
    expect(Array.isArray(response?.result)).toBe(true)
  })

  // Test 6 (Invariant B guard): a deliberately-unported queue channel still
  // rejects carrying UNPORTED_CHANNEL_MARKER, and the RPC loop keeps serving
  // afterward (health still resolves).
  it('Test 6 (Invariant B guard): getDMQueueInformation (deliberately unported) still rejects non-fatally, and the RPC loop keeps serving', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'queue-1', 'getDMQueueInformation', [])
    await flush()

    const queueResponse = frames.find((frame) => frame.id === 'queue-1') as
      | { ok: boolean; error?: string }
      | undefined
    expect(queueResponse?.ok).toBe(false)
    expect(queueResponse?.error).toContain(UNPORTED_CHANNEL_MARKER)

    writeInvoke(input, 'health-after-queue', 'health', [])
    await flush()
    const healthResponse = frames.find(
      (frame) => frame.id === 'health-after-queue'
    )
    expect(healthResponse).toMatchObject({
      id: 'health-after-queue',
      ok: true,
      result: 'ok'
    })
  })
})
