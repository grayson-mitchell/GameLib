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
// otherwise scan a real on-disk Steam install in CI. Plan 34.6-06 additionally
// stubs writeConfig (moveInstall/importGame pass-through tests assert on its
// call arguments rather than letting it write a real config.json to disk) —
// isEpicServiceOffline/getGame stay real: getGame(id, runner) just delegates
// to the already-mocked SteamGame instance below (libraryManagerMap[runner]
// .getGame(id)), and isEpicServiceOffline is never reached by these tests
// (gated on runner === 'legendary', which none of the new tests use) ────────
jest.mock('backend/utils', () => ({
  ...jest.requireActual('backend/utils'),
  getSteamLibraries: jest.fn(),
  writeConfig: jest.fn()
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
// Plan 34.6-06 (REQ-34.6-04): moveInstall/importGame/getSettings added to the
// same __mocks factory shape — the deepest boundary these two new channels
// touch, mirroring install/update/uninstall/getGameInfo exactly.
jest.mock('../../storeManagers/steam/games', () => {
  const install = jest.fn()
  const update = jest.fn()
  const uninstall = jest.fn()
  const getGameInfo = jest.fn()
  const moveInstall = jest.fn()
  const importGame = jest.fn()
  const getSettings = jest.fn()
  const ctor = jest.fn().mockImplementation(() => ({
    install,
    update,
    uninstall,
    getGameInfo,
    moveInstall,
    importGame,
    getSettings
  }))
  ;(ctor as unknown as { __mocks: Record<string, jest.Mock> }).__mocks = {
    install,
    update,
    uninstall,
    getGameInfo,
    moveInstall,
    importGame,
    getSettings
  }
  return { __esModule: true, default: ctor }
})

// ── backend/dialog/dialog mock narrow override, real module (mirrors
// shellFilesFlows.test.ts's own boundary choice) — `showDialogBoxModalAuto`
// bare `jest.fn()` here (Plan 34.6-06's error-branch/D-15-adjacent assertion
// needs to observe the call, not exercise the real sendFrontendMessage/
// electronStub fallback chain, which shellFilesFlows.test.ts/wineToolsFlows
// .test.ts already cover). `notify` stays real via the requireActual spread —
// unchanged from every other test in this file. ─────────────────────────────
jest.mock('../../dialog/dialog', () => ({
  ...jest.requireActual('../../dialog/dialog'),
  showDialogBoxModalAuto: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { startSidecar, writeInvoke } from './helpers/sidecarHarness'
import { getSteamLibraries, writeConfig } from 'backend/utils'
import { GlobalConfig } from 'backend/config'
import { libraryManagerMap } from 'backend/storeManagers'
import SteamGame from '../../storeManagers/steam/games'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { showDialogBoxModalAuto } from '../../dialog/dialog'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import type { AppSettings } from 'common/types'
import * as loggerModule from '../../logger'

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedWriteConfig = writeConfig as jest.Mock
const mockedShowDialogBoxModalAuto = showDialogBoxModalAuto as jest.Mock

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
    moveInstall: jest.Mock
    importGame: jest.Mock
    getSettings: jest.Mock
  }
}
const steamGameMocks = (SteamGame as unknown as MockedSteamGame).__mocks

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
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
    // Plan 34.6-06 defaults: moveInstall succeeds, importGame succeeds (no
    // abort/error), getSettings returns an empty settings object so
    // writeConfig's spread has something to merge onto.
    steamGameMocks.moveInstall.mockReset().mockResolvedValue({ status: 'done' })
    steamGameMocks.importGame
      .mockReset()
      .mockResolvedValue({ abort: false, error: undefined })
    steamGameMocks.getSettings.mockReset().mockResolvedValue({})
    mockedWriteConfig.mockReset()
    mockedShowDialogBoxModalAuto.mockReset()
    // resetMocks:true wipes the mocked constructor's own mockImplementation
    // too (not just steamGameMocks.*'s), so it must be re-established here —
    // otherwise `new SteamGame(appName)` returns a bare `{}` with none of the
    // steamGameMocks.* methods attached.
    ;(SteamGame as unknown as jest.Mock).mockImplementation(() => ({
      install: steamGameMocks.install,
      update: steamGameMocks.update,
      uninstall: steamGameMocks.uninstall,
      getGameInfo: steamGameMocks.getGameInfo,
      moveInstall: steamGameMocks.moveInstall,
      importGame: steamGameMocks.importGame,
      getSettings: steamGameMocks.getSettings
    }))
    // Opt-in setting defaults to false (D-13 safety valve) and autoUpdateGames
    // defaults to false (D-12's checkGameUpdates only calls autoUpdate() when
    // this is truthy). defaultInstallPath is set here purely as a realistic
    // suite-wide settings default -- gap plan 34.6-18 (34.6-VERIFICATION.md
    // CR-01) removed it as a containment root for moveInstall/importGame;
    // these two handlers no longer validate any path against it.
    mockSettings({
      enableSteamNativeInstall: false,
      autoUpdateGames: false,
      defaultInstallPath: '/home/deck/Games'
    })
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

  // ── Plan 34.6-06 (REQ-34.6-04/REQ-34.6-13, D-02) ──────────────────────────
  // moveInstall/importGame ported byte-equivalently from main.ts:1112-1245.
  // HARDENED by plan 34.6-11 (REQ-34.6-05, T-34.5-C6-49-03): both validated
  // their renderer-supplied `path` via `rendererPathGuard.assertContainedPath`
  // against GlobalConfig's own `defaultInstallPath`. Gap plan 34.6-18
  // (`34.6-VERIFICATION.md` CR-01) REMOVED that containment root -- it was
  // circular (renderer-writable via `setSetting`) and rejected the
  // cross-drive move / out-of-tree import each feature exists to perform --
  // and replaced it with `rendererPathGuard.assertPlausibleAbsolutePath`, a
  // shape/plausibility-only check with no root. The two pass-through tests
  // below were RETARGETED (plan 34.6-11) from a `..`-bearing tricky path to a
  // legitimate, apostrophe-and-space-bearing path (originally chosen to sit
  // inside the now-removed `defaultInstallPath` root; now just a realistic
  // fixture path) -- retargeting (not deleting) them is the visible record
  // of that.

  it('T-34.6 registration-kind: moveInstall and importGame are invoke-kind (handlerRegistry), never listener-kind (listenerRegistry)', () => {
    startSidecar()
    expect(handlerRegistry.has('moveInstall')).toBe(true)
    expect(handlerRegistry.has('importGame')).toBe(true)
    expect(listenerRegistry.has('moveInstall')).toBe(false)
    expect(listenerRegistry.has('importGame')).toBe(false)
  })

  // RETARGETED (plan 34.6-11, REQ-34.6-05): was "D-02: moveInstall forwards a
  // '..'-containing, space-containing path... unchanged" -- that input would
  // have correctly failed `assertPlausibleAbsolutePath`'s `..`-segment check
  // (proven by the REJECT test below) had it kept the `..`, so it can no
  // longer prove pass-through. This is now the ALLOW-direction proof: a
  // legitimate, plausible absolute path containing an apostrophe and a
  // space must still arrive at SteamGame.moveInstall() by STRICT EQUALITY,
  // unchanged -- the shape guard is a gate, not a rewrite.
  it('moveInstall forwards a legitimate apostrophe-and-space-containing absolute path to SteamGame.moveInstall() unchanged', async () => {
    const { input, frames } = startSidecar()
    const legitimatePath = "/home/deck/Games/Sid Meier's Civilization V/save"
    writeInvoke(input, 'move-passthrough-1', 'moveInstall', [
      { appName: '999001', path: legitimatePath, runner: 'steam' }
    ])
    await flush()

    expect(steamGameMocks.moveInstall).toHaveBeenCalledTimes(1)
    // Identity/strict-equality, not just deep-equality -- proves the handler
    // forwards the SAME value rather than normalising/reshaping it first
    // (assertPlausibleAbsolutePath is used purely as a gate and returns
    // void; the handler forwards the ORIGINAL renderer-supplied string,
    // never a resolved/rewritten substitute).
    expect(steamGameMocks.moveInstall.mock.calls[0][0]).toBe(legitimatePath)

    const response = frames.find((f) => f.id === 'move-passthrough-1')
    expect(response).toMatchObject({ id: 'move-passthrough-1', ok: true })
  })

  // NEW (gap plan 34.6-18, REQ-34.6-05, 34.6-VERIFICATION.md CR-01): the
  // PRIMARY real-world use case -- a cross-drive move to a destination
  // OUTSIDE the mocked defaultInstallPath ('/home/deck/Games'). Before this
  // plan's source change, this specimen was rejected by
  // assertContainedPath's containment against defaultInstallPath -- RED-proven
  // in evidence/34.6-18-RED-crossroot.txt.
  it('moveInstall forwards an absolute destination OUTSIDE the configured defaultInstallPath to SteamGame.moveInstall() unchanged (cross-drive move, CR-01)', async () => {
    const { input, frames } = startSidecar()
    const crossRootPath = '/Volumes/External SSD/GameLib Games/Civ V'
    writeInvoke(input, 'move-crossroot-1', 'moveInstall', [
      { appName: '999001', path: crossRootPath, runner: 'steam' }
    ])
    await flush()

    expect(steamGameMocks.moveInstall).toHaveBeenCalledTimes(1)
    expect(steamGameMocks.moveInstall.mock.calls[0][0]).toBe(crossRootPath)

    const response = frames.find((f) => f.id === 'move-crossroot-1')
    expect(response).toMatchObject({ id: 'move-crossroot-1', ok: true })
  })

  // NEW (gap plan 34.6-18, T-34.6-47): a channel-level REJECT for an
  // absolute path that DOES carry a `..` segment -- proves the new shape
  // guard still rejects traversal even though containment against
  // defaultInstallPath is gone.
  it('moveInstall rejects an absolute path containing a ".." segment, and SteamGame.moveInstall is never reached', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'move-reject-traversal-1', 'moveInstall', [
      {
        appName: '999001',
        path: '/Volumes/Ext/../../etc/passwd',
        runner: 'steam'
      }
    ])
    await flush()

    expect(steamGameMocks.moveInstall).not.toHaveBeenCalled()

    const response = frames.find((f) => f.id === 'move-reject-traversal-1') as
      | { ok: boolean; error?: string }
      | undefined
    expect(response?.ok).toBe(false)
  })

  // NEW (plan 34.6-11, REQ-34.6-05, T-34.5-C6-49-03; retained by gap plan
  // 34.6-18): the REJECT direction -- a RELATIVE path must never reach
  // SteamGame at all. Originally this specimen was rejected by
  // `assertContainedPath`'s containment check; it is now rejected earlier,
  // by `assertPlausibleAbsolutePath`'s "not absolute" check (it would also
  // fail the `..`-segment check if it ever got that far). RED-proven
  // originally by temporarily commenting out the containment call
  // (restore via `cp`, never `git checkout --`); the shape guard's own
  // REJECT coverage is RED-proven separately in
  // evidence/34.6-18-RED-crossroot.txt's sibling ACCEPT-direction proof.
  it('moveInstall rejects a relative (non-absolute) path, and SteamGame.moveInstall is never reached (T-34.5-C6-49-03)', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'move-reject-1', 'moveInstall', [
      { appName: '999001', path: '../../etc/passwd', runner: 'steam' }
    ])
    await flush()

    expect(steamGameMocks.moveInstall).not.toHaveBeenCalled()

    const response = frames.find((f) => f.id === 'move-reject-1') as
      | { ok: boolean; error?: string }
      | undefined
    expect(response?.ok).toBe(false)
  })

  // NEW (plan 34.6-11, T-34.6-31): a rejected moveInstall must still emit the
  // terminal "done" status so the renderer never wedges in "moving" -- and,
  // since `assertPlausibleAbsolutePath` runs BEFORE the "moving" push,
  // "moving" itself must never be emitted for a rejected request.
  it('a rejected moveInstall still emits the terminal gameStatusUpdate "done" (never wedges in "moving")', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'move-reject-status-1', 'moveInstall', [
      { appName: '999001', path: '../../etc/passwd', runner: 'steam' }
    ])
    await flush()

    const statuses = frames
      .filter(
        (f) => f.kind === 'frontendMessage' && f.channel === 'gameStatusUpdate'
      )
      .map((f) => ((f.args as unknown[])?.[0] as { status?: string })?.status)
    expect(statuses).toEqual(['done'])
  })

  // NEW (plan 34.6-11): the rejected path itself must never appear in a log
  // message (this is a public fork whose users paste logs) -- proves the
  // redacted logError call, not merely that SOME error was logged.
  it('a rejected moveInstall never logs the rejected path itself', async () => {
    const logErrorSpy = jest.spyOn(loggerModule, 'logError')
    const escapingPath = '../../etc/shadow'

    const { input } = startSidecar()
    writeInvoke(input, 'move-reject-nolog-1', 'moveInstall', [
      { appName: '999001', path: escapingPath, runner: 'steam' }
    ])
    await flush()

    const loggedSomethingContainingPath = logErrorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes(escapingPath))
    )
    expect(loggedSomethingContainingPath).toBe(false)
    logErrorSpy.mockRestore()
  })

  it('moveInstall emits gameStatusUpdate "moving" before the move and "done" after, on the success branch', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'move-status-1', 'moveInstall', [
      { appName: '999001', path: '/home/deck/Games/dest', runner: 'steam' }
    ])
    await flush()

    const statuses = frames
      .filter(
        (f) => f.kind === 'frontendMessage' && f.channel === 'gameStatusUpdate'
      )
      .map((f) => ((f.args as unknown[])?.[0] as { status?: string })?.status)
    expect(statuses).toEqual(['moving', 'done'])
  })

  it('moveInstall calls showDialogBoxModalAuto on the error branch, and STILL emits the trailing "done" status', async () => {
    steamGameMocks.moveInstall.mockResolvedValue({
      status: 'error',
      error: 'disk full'
    })

    const { input, frames } = startSidecar()
    writeInvoke(input, 'move-error-1', 'moveInstall', [
      { appName: '999001', path: '/home/deck/Games/dest', runner: 'steam' }
    ])
    await flush()

    expect(mockedShowDialogBoxModalAuto).toHaveBeenCalledTimes(1)

    const statuses = frames
      .filter(
        (f) => f.kind === 'frontendMessage' && f.channel === 'gameStatusUpdate'
      )
      .map((f) => ((f.args as unknown[])?.[0] as { status?: string })?.status)
    expect(statuses).toEqual(['moving', 'done'])
  })

  // RETARGETED (plan 34.6-11, REQ-34.6-05): tricky path was `..`-bearing;
  // now a legitimate, plausible absolute apostrophe-and-space path (see the
  // moveInstall retargeting comment above for the full rationale).
  it('importGame forwards every field of its argument object through unchanged (path/platform to SteamGame.importGame(), winePrefix/wineVersion/wineCrossoverBottle to writeConfig())', async () => {
    const legitimatePath =
      "/home/deck/Games/Sid Meier's Civilization V/save source"
    const wineVersionRef = { bin: '/wine', name: 'wine-ge', type: 'wine' }

    const { input } = startSidecar()
    writeInvoke(input, 'import-passthrough-1', 'importGame', [
      {
        appName: '999001',
        path: legitimatePath,
        runner: 'steam',
        platform: 'Windows',
        winePrefix: '/prefix',
        wineVersion: wineVersionRef,
        wineCrossoverBottle: 'MyBottle'
      }
    ])
    await flush()

    expect(steamGameMocks.importGame).toHaveBeenCalledTimes(1)
    expect(steamGameMocks.importGame.mock.calls[0][0]).toBe(legitimatePath)
    expect(steamGameMocks.importGame.mock.calls[0][1]).toBe('Windows')

    expect(mockedWriteConfig).toHaveBeenCalledTimes(1)
    const [writeConfigAppName, writeConfigPayload] =
      mockedWriteConfig.mock.calls[0]
    expect(writeConfigAppName).toBe('999001')
    expect(writeConfigPayload).toMatchObject({
      winePrefix: '/prefix',
      wineCrossoverBottle: 'MyBottle'
    })
    // The harness round-trips args through the real JSON-lines RPC transport
    // (`writeInvoke` -> `dispatchInvoke`), so object *identity* cannot survive
    // the wire -- a fresh, structurally-identical object is unavoidable and
    // is NOT a sign of reshaping by the handler. Deep-equality is the correct
    // "unchanged" proof here; strict `.toBe` above (trickyPath/platform) is
    // reserved for primitives, which DO survive the round-trip by value.
    expect(
      (writeConfigPayload as { wineVersion: unknown }).wineVersion
    ).toStrictEqual(wineVersionRef)
  })

  // NEW (gap plan 34.6-18, REQ-34.6-05, 34.6-VERIFICATION.md CR-01): the
  // PRIMARY real-world use case -- an already-installed game located
  // OUTSIDE the mocked defaultInstallPath. Before this plan's source
  // change, this specimen was rejected by assertContainedPath's containment
  // against defaultInstallPath -- RED-proven in
  // evidence/34.6-18-RED-crossroot.txt.
  it('importGame forwards an absolute source OUTSIDE the configured defaultInstallPath to SteamGame.importGame() unchanged (out-of-tree import, CR-01)', async () => {
    const crossRootPath = '/Volumes/External SSD/Existing Installs/Civ V'

    const { input, frames } = startSidecar()
    writeInvoke(input, 'import-crossroot-1', 'importGame', [
      {
        appName: '999001',
        path: crossRootPath,
        runner: 'steam',
        platform: 'Windows'
      }
    ])
    await flush()

    expect(steamGameMocks.importGame).toHaveBeenCalledTimes(1)
    expect(steamGameMocks.importGame.mock.calls[0][0]).toBe(crossRootPath)
    expect(steamGameMocks.importGame.mock.calls[0][1]).toBe('Windows')

    const response = frames.find((f) => f.id === 'import-crossroot-1')
    expect(response).toMatchObject({ id: 'import-crossroot-1', ok: true })
  })

  // NEW (plan 34.6-11, REQ-34.6-05, T-34.5-C6-49-03; retained by gap plan
  // 34.6-18): the REJECT direction for importGame -- mirrors the moveInstall
  // REJECT test above. This RELATIVE path is now rejected by
  // `assertPlausibleAbsolutePath`'s "not absolute" check rather than by
  // `assertContainedPath`'s containment check (which it originally
  // RED-proved by temporarily commenting out the containment call in
  // importGame's handler body).
  it('importGame rejects a relative (non-absolute) path, and SteamGame.importGame is never reached (T-34.5-C6-49-03)', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'import-reject-1', 'importGame', [
      {
        appName: '999001',
        path: '../../etc/passwd',
        runner: 'steam',
        platform: 'Windows'
      }
    ])
    await flush()

    expect(steamGameMocks.importGame).not.toHaveBeenCalled()

    const response = frames.find((f) => f.id === 'import-reject-1') as
      | { ok: boolean; error?: string }
      | undefined
    expect(response?.ok).toBe(false)

    // No-wedge (T-34.6-31): importGame's own "importing" status is never
    // emitted for a rejected request -- `assertPlausibleAbsolutePath` runs
    // before it.
    const statuses = frames
      .filter(
        (f) => f.kind === 'frontendMessage' && f.channel === 'gameStatusUpdate'
      )
      .map((f) => ((f.args as unknown[])?.[0] as { status?: string })?.status)
    expect(statuses).toEqual(['done'])
  })
})
