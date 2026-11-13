/**
 * Behavioural dispatch coverage for `handleLaunch` against the production sidecar wiring
 * (Phase 34.5 gap cycle 6, plan 34.5-46).
 *
 * `skeletonFlows.test.ts` is this cycle's Steam-side regression detector and stays
 * untouched — its Test 2/Test 3 `launch` coverage both pass `runner: 'steam'`, so a
 * runner-blind handler and a runner-aware one are indistinguishable to them. This file
 * exists for the coverage hole that shape leaves: a NON-steam runner's dispatch, and the
 * unknown-runner fail-closed guard.
 *
 * Drives the REAL sidecar RPC server in-process, exactly as `skeletonFlows.test.ts` does —
 * a real invoke frame written to stdin, real emitted frames read back — so this exercises
 * `handlers.ts`'s `registerSteamFlows()` registration and the real transport, not a
 * hand-built call to `handleLaunch` (a test reconstructing the call site is a replica and
 * drifts silently; this phase has an in-cycle precedent in plan 34.5-45's
 * `shortcutsFlows.test.ts` finding, where a mock asserted the defect as correct).
 *
 * `backend/storeManagers` and `storeManagers/steam/games` are DELIBERATELY left unmocked —
 * mocking either would erase the very dispatch this test exists to observe. Only
 * `backend/launcher`'s `launchEventCallback` is mocked, to keep the assertion about
 * DISPATCH (was the right function called, with the right runner) rather than about a real
 * non-Steam launch succeeding end to end.
 */
import { createContainedHomeAppPaths } from 'backend/testUtils/testAppPaths'
import { createTestVersioning } from 'backend/testUtils/testStoreRoot'
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'

// Per case (reset in freshRegistry): the boot is handed this root so the stores a case seeds
// and the boot's own stores share one file-cell table, as the old module-level registry did.
let testRoot = createTestStoreRoot()
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'

// ── os — same disposable-homedir redirect as skeletonFlows.test.ts. Without it this suite
// would reach the developer's real `~/Library/Application Support/GameLib` store files. ──
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-steamflows-test-home-${process.pid}`)
  }
})

// ── electron / electron-store — route Jest's own module resolution at the real sidecar
// shims, same as skeletonFlows.test.ts (see that file's header for the full reasoning). ──
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — the boot wires the real online monitor, which would otherwise make a live
// network call from this suite. Same stub as skeletonFlows.test.ts. ──────────────────────
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

// ── backend/utils mock — no real on-disk Steam install to scan in CI. ────────────────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── backend/constants/environment mock — pins the native (non-bottle) Steam branch
// deterministically regardless of the host OS running this test. ─────────────────────────
// The runtime `process.platform` pin below is also needed: since 721c2fa01 `shell.openExternal`
// calls `shouldOpenInBackground(process.platform, ...)` at call time, so on a Mac the
// `isMac:false` mock alone still spawns a real detached `/usr/bin/open -g steam://...`
// and never writes the `openExternal` frame.
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── SteamUser mock — mirrors skeletonFlows.test.ts / library.test.ts's LIB-01
// convention; automocked, no factory. ──────────────────────────────────────────────────────
// The boot builds its SteamUser through createSteamUser; hand it the suite's one jest-fn double (66.3-16).
// `mock`-prefixed so the hoisted factory may reference it; it is initialised before the first require.
const mockSteamUser = createMockSteamUser()
jest.mock('../../storeManagers/steam/user', () => ({
  createSteamUser: () => mockSteamUser
}))

// ── backend/launcher mock — the ONLY store-manager-adjacent mock in this file. Isolates
// the assertion to DISPATCH (was launchEventCallback called, with runner='gog') rather than
// a real GOG launch succeeding — a real launch would need a real install path, wine
// version, etc. that this test has no business constructing.
const launchEventCallbackMock = jest.fn()
jest.mock('../../launcher', () => ({
  // The boot builds the launcher through createLauncher (66.1-23); the mock hands back only the
  // member this file asserts on.
  createLauncher: () => ({
    launchEventCallback: (...args: unknown[]) =>
      launchEventCallbackMock(...args)
  })
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────────────────
import { bootFresh, writeInvoke } from './helpers/sidecarHarness'
import type { GameInfo } from 'common/types'
// Type-only namespace import: the runtime handles are rebound per case from the
// fresh registry (freshRegistry), but this keeps the static import edge knip sees.
import type * as RecentGamesModule from 'backend/recent_games/recent_games'
import { RUST_MAIN_WINDOW_HIDE } from 'common/types/sidecarTransport'
import { createStoreRegistry } from 'backend/stores/storeRegistry'

// D-08: every case boots the sidecar once, in a fresh module registry. Module
// handles the cases configure or inspect are rebound from that registry in
// freshRegistry() (run before each case, ahead of any mock configuration), and
// boot() then boots without a second reset.
let getSteamLibraries: typeof import('backend/utils').getSteamLibraries
let getRecentGames: typeof RecentGamesModule.getRecentGames
let testingExportsRecentGames: typeof RecentGamesModule.testingExportsRecentGames
let steamLibraryStore: ReturnType<
  typeof import('backend/storeManagers/steam/stores').createSteamStores
>['steamLibraryStore']
let createGlobalConfig: typeof import('backend/config').createGlobalConfig
let recentGamesDeps: RecentGamesModule.RecentGamesDeps & {
  appRuntime: ReturnType<typeof createTestAppRuntime>
}

function freshRegistry(): void {
  jest.resetModules()
  testRoot = createTestStoreRoot()
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('../bootstrap')
  ;({ getSteamLibraries } = require('backend/utils'))
  ;({
    getRecentGames,
    testingExportsRecentGames
  } = require('backend/recent_games/recent_games'))
  ;({ steamLibraryStore } =
    require('backend/storeManagers/steam/stores').createSteamStores({
      registry: createStoreRegistry(),
      root: testRoot
    }))
  ;({ createGlobalConfig } = require('backend/config'))
  recentGamesDeps = {
    sendFrontendMessage: jest.fn(),
    appRuntime: createTestAppRuntime(),
    stores: {
      kvs: require('backend/constants/key_value_stores').createKvsStores({
        registry: createStoreRegistry(),
        root: testRoot
      })
    }
  }
  /* eslint-enable @typescript-eslint/no-require-imports */
}

const boot = () =>
  bootFresh({
    reuseRegistry: true,
    services: { storeRoot: testRoot }
  })

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

// Pin the native Linux branch of shell.openExternal regardless of host OS (see the
// environment mock above): restored afterAll, same idiom as openExternalBackground.test.ts.
const realPlatform = process.platform
beforeAll(() => {
  Object.defineProperty(process, 'platform', { value: 'linux' })
})
afterAll(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
})

describe('sidecar Steam flows — runner-aware launch dispatch (gap cycle 6, plan 34.5-46)', () => {
  beforeEach(() => {
    freshRegistry()
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    launchEventCallbackMock.mockReset()
    launchEventCallbackMock.mockResolvedValue({ status: 'done' })
    // D-35-19-06 / Test D below: `addRecentGame` is real and unmocked in this suite (it is
    // NOT store-manager-adjacent), and its store is the same disposable per-PID homedir the
    // `os` mock above redirects. Cleared here so Test D observes ONLY its own launch.
    testingExportsRecentGames.setRecentGames(recentGamesDeps, [])
    // Same reasoning for the library cache Test D seeds: cleared here so no other test in this
    // file (run before or after it) can observe a leaked '999003' library entry.
    steamLibraryStore.set('games', [])
  })

  // Test A (the defect, RED before Task 1's fix): a launch invoke for runner='gog'
  // produces ZERO openExternal frames whose URL is steam://. Against the pre-fix handler
  // (`new SteamGame(appName)` unconditionally) this test FAILS because
  // steam://rungameid/... is emitted — that failure is the point of it; see the SUMMARY
  // for the verbatim RED output captured at authoring time.
  it("Test A: a launch invoke for runner='gog' dispatches to launchEventCallback with runner='gog' and emits no steam:// openExternal frame", async () => {
    const { input, frames } = boot()
    writeInvoke(input, 'launch-gog-1', 'launch', [
      { appName: '1207659037', runner: 'gog' }
    ])
    await flush()

    // Asserted FIRST and deliberately: against the pre-fix handler this is the assertion
    // that fails, and its failure output names the actual steam:// URL that was wrongly
    // emitted for a GOG title — the decisive RED evidence, not merely "dispatch didn't
    // happen".
    const openExternal = frames.filter(
      (frame) =>
        frame.kind === 'openExternal' &&
        typeof (frame.args as unknown[] | undefined)?.[0] === 'string' &&
        ((frame.args as unknown[])[0] as string).startsWith('steam://')
    )
    expect(openExternal).toHaveLength(0)

    expect(launchEventCallbackMock).toHaveBeenCalledTimes(1)
    expect(launchEventCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ runner: 'gog', appName: '1207659037' })
    )

    const response = frames.find((frame) => frame.id === 'launch-gog-1')
    expect(response).toMatchObject({
      id: 'launch-gog-1',
      ok: true,
      result: { status: 'done' }
    })
  })

  // Test B (the guard): an unrecognised runner — absent, and each of a prototype-chain
  // name — is rejected at the Phase 67 schema boundary (ok: false), emits no openExternal frame, and calls no
  // manager/launchEventCallback at all.
  describe('Test B: unknown-runner guard', () => {
    const badRunners: Array<{ label: string; runner: unknown }> = [
      { label: 'absent', runner: undefined },
      { label: "'STEAM' (wrong case)", runner: 'STEAM' },
      { label: "'constructor'", runner: 'constructor' }
    ]

    it.each(badRunners)(
      'runner=$label is rejected by the channel schema, emits no openExternal frame, and calls no manager',
      async ({ runner, label }) => {
        const { input, frames } = boot()
        const args: Record<string, unknown> = { appName: 'some-app-id' }
        if (runner !== undefined) {
          args.runner = runner
        }
        writeInvoke(input, `launch-bad-${label}`, 'launch', [args])
        await flush()

        expect(launchEventCallbackMock).not.toHaveBeenCalled()

        const openExternal = frames.find(
          (frame) => frame.kind === 'openExternal'
        )
        expect(openExternal).toBeUndefined()

        const response = frames.find(
          (frame) => frame.id === `launch-bad-${label}`
        )
        expect(response).toMatchObject({
          id: `launch-bad-${label}`,
          ok: false
        })
      }
    )
  })

  // Test C (Steam parity): a numeric appId Steam launch still emits
  // steam://rungameid/<id> and responds { status: 'done' } — the same assertion
  // skeletonFlows.test.ts Test 2 makes, restated here so THIS file alone can detect a
  // Steam regression from a change scoped to this test file's own mocks.
  it("Test C: a launch invoke for runner='steam' still emits steam://rungameid/<id> and responds done", async () => {
    const { input, frames } = boot()
    writeInvoke(input, 'launch-steam-1', 'launch', [
      { appName: '999002', runner: 'steam' }
    ])
    await flush()

    expect(launchEventCallbackMock).not.toHaveBeenCalled()

    const openExternal = frames.find((frame) => frame.kind === 'openExternal')
    expect(openExternal).toBeDefined()
    const url = (openExternal?.args as unknown[])[0] as string
    expect(url).toBe('steam://rungameid/999002')

    const response = frames.find((frame) => frame.id === 'launch-steam-1')
    expect(response).toMatchObject({
      id: 'launch-steam-1',
      ok: true,
      result: { status: 'done' }
    })
  })

  // Test D (Phase 35 plan 20, D-35-19-06, live-gate criterion 6): the cross-regression this
  // gap-closure plan exists to fix. Before `dispatchSteamLaunch`, `handleLaunch`'s Steam branch
  // called `game.launch()` and returned directly, writing NO `games.recent` entry — the exact
  // A/B gap the live gate recorded (`store/config.json` written for a GOG launch, not for two
  // Steam launches). `addRecentGame` and its store are real and unmocked here, so this proves
  // the effect end-to-end through the production sidecar wiring, not through a mock.
  it("Test D: a launch invoke for runner='steam' records exactly one recent-games entry with runner='steam' (D-35-19-06)", async () => {
    // `SteamGame.launch()` (games.ts) dispatches purely off the numeric appId — it never reads
    // the library cache, which is why Test C above needs no seeding. `getGameInfo()` (called by
    // `dispatchSteamLaunch` for the `addRecentGame` side effect under test HERE) is different: on
    // a cache miss it returns `{} as GameInfo` (see that method's own comment on the
    // steam-library-22-games-missing fallback), which is exactly what produced this test's
    // original RED (`{ appName: undefined, runner: undefined }`). Seeding `steamLibraryStore` —
    // the same persisted cache `getGameInfo()` falls back to — mirrors a real installed title
    // already known to the library, which is the only realistic precondition for a user to have
    // requested this launch in the first place.
    steamLibraryStore.set('games', [
      {
        app_name: '999003',
        title: 'Test D Steam Game',
        runner: 'steam',
        is_installed: true
      } as GameInfo
    ])

    const { input, frames } = boot()
    writeInvoke(input, 'launch-steam-recent-1', 'launch', [
      { appName: '999003', runner: 'steam' }
    ])
    await flush()

    const response = frames.find(
      (frame) => frame.id === 'launch-steam-recent-1'
    )
    expect(response).toMatchObject({
      id: 'launch-steam-recent-1',
      ok: true,
      result: { status: 'done' }
    })

    const recentGames = await getRecentGames(recentGamesDeps)
    expect(recentGames).toHaveLength(1)
    expect(recentGames[0]).toMatchObject({
      appName: '999003',
      runner: 'steam'
    })
  })

  // quick 261108-kpc: "Hide GameLib for every launch" must also cover in-app Steam launches,
  // which never pass through launcher.ts. isMac is mocked false here, so the tray gate applies.
  it.each([
    { minimizeOnLaunch: true, noTrayIcon: false, hides: true },
    { minimizeOnLaunch: true, noTrayIcon: true, hides: false },
    { minimizeOnLaunch: false, noTrayIcon: false, hides: false }
  ])(
    'in-app steam launch with $minimizeOnLaunch/$noTrayIcon hides=$hides',
    async ({ minimizeOnLaunch, noTrayIcon, hides }) => {
      // The boot's real global config, with only the two launch-hide settings overridden.
      const real = createGlobalConfig({
        requestRustInvoke: jest.fn(),
        versioning: createTestVersioning(),
        paths: createContainedHomeAppPaths()
      })
      const config = new Proxy(real, {
        get: (target, key) => {
          if (key === 'getSettings') {
            return () => ({
              ...target.getSettings(),
              minimizeOnLaunch,
              noTrayIcon
            })
          }
          const member = Reflect.get(target, key) as unknown
          return typeof member === 'function' ? member.bind(target) : member
        }
      })

      const { input, frames } = bootFresh({
        reuseRegistry: true,
        services: { storeRoot: testRoot, config }
      })
      writeInvoke(input, 'launch-steam-hide', 'launch', [
        { appName: '999002', runner: 'steam' }
      ])
      await flush()

      const hideFrames = frames.filter(
        (frame) =>
          frame.kind === 'rustInvoke' && frame.channel === RUST_MAIN_WINDOW_HIDE
      )
      expect(hideFrames).toHaveLength(hides ? 1 : 0)
    }
  )
})
