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
      path.join(
        actual.tmpdir(),
        `gamelib-installflows-test-home-${process.pid}`
      )
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
// (which drives the real, unmocked RPC/handler graph, including the real `backend/utils` below)
// never makes a real network call; `.create` is also stubbed for `backend/utils.ts`'s
// module-scope `axiosClient` singleton (real here, per the `jest.requireActual` below).
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
import { libraryManagerMap } from 'backend/storeManagers'
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
    steamGameMocks.uninstall
      .mockReset()
      .mockResolvedValue({ stdout: '', stderr: '' })
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
    expect(response).toMatchObject({
      id: 'targets-off-1',
      ok: true,
      result: []
    })
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

  // REMOVED (Phase 32 Plan 02, D-01): this suite used to cover Test 2/3,
  // CR-01 (install/updateGame non-steam rejection), CR-02/Gap-1 (error/abort/
  // deferredToSetup badge-clearing + showDialog), and G-30-02 (timeout-origin
  // error) here, all against the Phase 30 D-05a direct-SteamGame-bypass this
  // file used to run. Plan 32-02 retired that bypass and re-routed `install`/
  // `updateGame` onto the real `addToQueue()` (Electron parity) — none of
  // those behaviors are implemented in THIS file anymore, so asserting them
  // here would test code that no longer exists.
  //   - The addToQueue()-reached / Promise<void>-resolve / no-runner-guard
  //     behavior this plan introduces is covered by
  //     `downloadQueueFlows.test.ts`'s new install/updateGame enqueue tests
  //     (Plan 32-02 Task 1).
  //   - The queued/installing/done status-transition sequencing, and the
  //     deferredToSetup/wasAborted/error-surfacing edge cases (CR-02/Gap-1/
  //     G-30-02), live UNMODIFIED in `installQueueElement`
  //     (`downloadmanager/utils.ts`) — already covered by
  //     `downloadmanager/__tests__/utils.test.ts`'s own suite (e.g. "a
  //     CANCELLED native Steam install... force-clears the 'installing'
  //     badge", "a bottle guided-setup deferral... still force-clears the
  //     badge"), which now applies to BOTH builds since there is no longer a
  //     separate sidecar-only implementation to diverge.
  //   - The non-steam-runner CR-01 guard is intentionally gone: D-01 restores
  //     full Electron parity (`ipc_handler.ts` is runner-generic), and
  //     `downloadqueue.ts` itself stays runner-generic (D-02) — narrowing to
  //     Steam here would diverge from Electron for no benefit.

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

  // Test 5: checkGameUpdates resolves a string[] across all runners (D-12,
  // all runners) — a happy-path wiring assertion only. The per-runner
  // isolation property this comment used to claim is proven by the WR-05
  // test immediately below, not here: nothing in this test's mocked
  // environment throws, so it would pass with or without that guard.
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

  // WR-05: Test 5 above documents per-runner isolation but cannot prove it —
  // nothing in the mocked environment happens to throw, so it passes either
  // way. This one actually makes one manager reject and asserts the other
  // runners' already-collected results still come back.
  it('WR-05: one runner rejecting must not discard the other runners’ update results', async () => {
    const runners = Object.keys(
      libraryManagerMap
    ) as (keyof typeof libraryManagerMap)[]
    const failingRunner = runners[0]

    const spies = runners.map((runner) =>
      jest
        .spyOn(libraryManagerMap[runner], 'listUpdateableGames')
        .mockImplementation(async () => {
          if (runner === failingRunner) {
            throw new Error(`${runner} CLI/credentials absent`)
          }
          return [`${runner}-updateable`]
        })
    )

    try {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'updates-isolation-1', 'checkGameUpdates', [])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'updates-isolation-1'
      ) as { ok: boolean; result?: unknown } | undefined

      // The whole call must NOT reject just because one manager did.
      expect(response?.ok).toBe(true)
      expect(response?.result).toEqual(
        runners
          .filter((runner) => runner !== failingRunner)
          .map((runner) => `${runner}-updateable`)
      )
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }
  })

  // Test 6 (Invariant B guard): a deliberately-unported DownloadDialog channel
  // still rejects carrying UNPORTED_CHANNEL_MARKER, and the RPC loop keeps
  // serving afterward (health still resolves).
  //
  // UPDATED (Phase 32 Plan 01): `getDMQueueInformation` — this test's
  // original example channel — is no longer unported. It is now registered
  // for real by `downloadQueueFlowRegistration.ts` (REQ-32-04,
  // `downloadQueueFlows.test.ts` covers its ported behavior). `checkDiskSpace`
  // substitutes here as a channel this plan does not touch and that stays
  // genuinely unported (mirrors `settingsFlows.test.ts`'s own canonical
  // Invariant B example), so this test keeps proving the invariant rather
  // than asserting something Phase 32 deliberately made false.
  //
  // UPDATED AGAIN (Phase 34.3 Plan 01): `checkDiskSpace` is ALSO no longer
  // unported — it is now registered for real by `shellFilesFlowRegistration.ts`
  // (REQ-34.3-02, `shellFilesFlows.test.ts` covers its ported behavior).
  // `getLegendaryVersion` substituted here as a channel that plan did not
  // touch and that stayed genuinely unported until Phase 34.5.
  //
  // UPDATED AGAIN (Phase 34.5 Plan 07, REQ-34.5-06): `getLegendaryVersion` is
  // ALSO no longer unported — it is now registered for real by
  // `runnerMiscFlowRegistration.ts` (`runnerMiscFlows.test.ts` covers its
  // ported registration kind). `winetricksInstall` substitutes here as a
  // channel D-03 permanently DEFERS to Phase 34.6, so this test will not
  // need a further substitution once plan 34.5-12 lands.
  it('Test 6 (Invariant B guard): winetricksInstall (deliberately unported, deferred to Phase 34.6) still rejects non-fatally, and the RPC loop keeps serving', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'disk-space-1', 'winetricksInstall', [])
    await flush()

    const diskSpaceResponse = frames.find(
      (frame) => frame.id === 'disk-space-1'
    ) as { ok: boolean; error?: string } | undefined
    expect(diskSpaceResponse?.ok).toBe(false)
    expect(diskSpaceResponse?.error).toContain(UNPORTED_CHANNEL_MARKER)

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
