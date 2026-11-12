/**
 * Headless-boot integration test for the sidecar (Phase 27 Plan 02 — Task 3).
 *
 * Proves spike 009's two import-time walls (app.getPath, electron-store) are
 * shimmed and the sidecar serves its transport contract, by driving
 * bootstrap.ts's exported `init()` in-process with the `Module._load` hook
 * it installs at import time, against injected `stream.PassThrough` pairs.
 * Follows the project's real-tmpdir black-box pattern (steam
 * library.test.ts precedent) rather than mocking `node:fs`/`graceful-fs`,
 * since this project's ts-jest/CJS interop makes fs exports non-mockable
 * (non-configurable getters) — the shims under test (fileStore.ts,
 * pathShim.ts) read/write the real OS config directory instead, exactly as
 * they would in production.
 *
 * CONTAINMENT (Phase 34.2, gap cycle 3, plan 34.2-19 — REQ-34.2-07/-14):
 * this suite was independently reproduced DESTROYING the developer's real
 * `~/Library/Logs/GameLib/gamelib.log` three times during the 2026-07-26
 * verification (log mtimes 10:49 → 10:56 → 10:57) — each of the three
 * `init()` calls below runs `initHeadless()` → `new
 * LogWriter(getLogFilePath({}))` → `archiveOldLogFile()`'s `renameSync`,
 * unmocked, against whatever `getBaseLogPath()` resolves to. Containment is
 * now enforced structurally by `src/backend/jest.setupContainment.ts`, wired
 * into the backend project's `setupFiles` (`src/backend/jest.config.js`) —
 * NOT by any mock added to this file. That module redirects
 * `os.homedir()` via a project-wide `os` module mock (env-var
 * redirection alone does not reach `os.homedir()`'s native binding inside a
 * Jest test — see `jest.setupContainment.ts`'s own docstring for the full
 * finding) plus `HOME`/`APPDATA`/`XDG_CONFIG_HOME`/`XDG_STATE_HOME`
 * env-var redirection for the Windows/Linux branches. The tripwire test
 * immediately below is this suite's OWN local, failing-loudly proof of that
 * containment, placed first so it runs before any `init()` call — a future
 * removal of the `setupFiles` entry fails HERE too, not only in a distant
 * gate file. Do not add `os` / `pathShim` / `backend/logger/paths`
 * `jest.mock` blocks to this file — doing so would re-establish the
 * per-suite pattern this plan exists to replace, and would make the
 * tripwire vacuous (this suite would then be "contained" by its own local
 * mock, not by the structural mechanism the tripwire is supposed to prove).
 *
 * `backend/online_monitor` is mocked (fix/steam-native-install-stability, 33-05 live-gate gap):
 * `init()` calls `initOnlineMonitor()`; this suite's whole point is proving the sidecar boots
 * without an uncaught exception, and it is not the place to validate online-monitor wiring itself
 * (see `onlineMonitorWiring.test.ts`). A no-op stub here remains sufficient.
 *
 * The mock covers the module's FULL exported surface, not just `initOnlineMonitor`:
 * `./handlers`'s transitive import graph (steamFlowRegistration -> storeManagers/index.ts ->
 * every store manager, plus `downloadmanager/downloadqueue.ts`, `utils.ts`, `launcher.ts`, etc.)
 * pulls in numerous OTHER real (unmocked) modules that import `isOnline`/`runOnceWhenOnline`/
 * `onConnectivityChange` from this same module at their own module scope -- `downloadqueue.ts`
 * calls `onConnectivityChange(...)` immediately at import time, for example. Leaving any of
 * these undefined would reintroduce the exact "Cannot read properties of undefined" import-time
 * crash this suite exists to catch.
 */

const mockRestoreMacSteamOnlineIfOwed = jest.fn()
jest.mock('../../storeManagers/steam/macSteamOffline', () => {
  const actual = jest.requireActual('../../storeManagers/steam/macSteamOffline')
  return {
    ...actual,
    // The boot-built instance is real except its restore, so a quit or boot reaches the
    // scripted restore without firing any steam:// URL.
    createMacSteamOffline: (deps: unknown) => ({
      ...actual.createMacSteamOffline(deps),
      restoreMacSteamOnlineIfOwed: (...args: unknown[]) =>
        mockRestoreMacSteamOnlineIfOwed(...args)
    })
  }
})

import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { defined } from 'backend/testUtils/indexed'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { tmpdir } from 'os'
import { isAbsolute, join, relative, resolve } from 'path'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { createFakeHomeProfile } from '../../testUtils/fakeHomeProfile'
import {
  createTestManagers,
  createTestServices
} from '../../testUtils/testServices'
import { PassThrough } from 'node:stream'
import * as util_os_processes from '../../utils/os/processes'
import * as helperBinaries from '../../utils/helperBinaries'
import { createStoreRegistry } from '../../stores/storeRegistry'
import { bootFresh } from './helpers/sidecarHarness'
import { createTestOnlineMonitor } from 'backend/testUtils/testOnlineMonitor'
import type { BootServices } from '../../services/types'
import { getLogFilePath } from '../../logger/paths'
import {
  READY_SENTINEL,
  UNPORTED_CHANNEL_MARKER
} from 'common/types/sidecarTransport'

/** Buffers newline-delimited output from a PassThrough into discrete lines. */
function collectLines(stream: PassThrough): string[] {
  const lines: string[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      lines.push(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return lines
}

/**
 * Loads a module from the CURRENT registry (D-08). Every case boots once in a fresh registry via
 * bootFresh(), so anything a case inspects after boot must be read with this, never through a
 * top-level import captured before the reset.
 */
function fresh<T>(id: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(id) as T
}

/** Boots once and returns the raw output lines (READY sentinel included). */
function bootWithLines(opts?: {
  before?: () => void
  services?: Partial<BootServices>
}) {
  const output = new PassThrough()
  const lines = collectLines(output)
  const sidecar = bootFresh({ ...opts, output })
  return { ...sidecar, lines }
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('sidecar bootstrap (headless boot)', () => {
  // Containment tripwire (Phase 34.2 gap cycle 3, plan 34.2-19 --
  // REQ-34.2-07/-14). FIRST test in this describe block, but this is a
  // DETECTOR, not a preventer (corrected 34.2-29, WR-10 remaining half):
  // being the first `it` in this describe only means it runs before the
  // real `init()` calls further down in THIS test body -- it does NOT run
  // before this file's own module-scope imports (`../bootstrap`,
  // `../../logger/paths`, line 66-75 above), and `constants/paths.ts`
  // performs real filesystem work (an `app.getPath('appData')` read plus a
  // conditional `mkdirSync`) at module scope, i.e. before ANY test body in
  // this file runs, tripwire included. The actual preventer is
  // `src/backend/jest.setupContainment.ts`'s `setupFiles`-time precondition
  // (added by plan 34.2-25): `setupFiles` entries run once per test file,
  // strictly BEFORE that file's own imports are evaluated, so containment
  // is already in place by the time this file's module-scope imports above
  // execute -- something a first-test tripwire structurally cannot do. This
  // test carries no jest.mock for os/pathShim/backend/logger/paths of its
  // own; containment comes entirely from that setupFiles registration. Its
  // real value is as LOCALISED DOCUMENTATION at the exact site of the
  // historical defect: if a future edit removes the setupFiles entry, this
  // test still fails HERE too, not only in a distant gate file -- it just
  // does so as a second, redundant detector, not as the mechanism that kept
  // the destruction from happening in the first place.
  it('containment tripwire: getLogFilePath({}) resolves inside os.tmpdir(), not the developer real home', () => {
    const logPath = getLogFilePath({})
    const tmpRoot = resolve(tmpdir())
    const rel = relative(tmpRoot, resolve(logPath))
    expect(rel.startsWith('..')).toBe(false)
    expect(isAbsolute(rel)).toBe(false)
  })

  // Behavior 1: building + running the sidecar entry under bare `node`
  // (electron absent) reaches READY without an uncaught exception --
  // proves paths.ts's app.getPath() and typed_store.ts's `new Store()`
  // import-time walls (spike 009) are shimmed before backend code sees them.
  describe('boot-time owed Mac Steam goonline (54-13)', () => {
    beforeEach(() => {
      mockRestoreMacSteamOnlineIfOwed.mockReset()
      mockRestoreMacSteamOnlineIfOwed.mockImplementation(() =>
        Promise.resolve('not-owed')
      )
    })

    it("one boot pays a stale owed goonline once with the 'boot' trigger", () => {
      mockRestoreMacSteamOnlineIfOwed.mockImplementation(async () => {
        return 'not-owed'
      })
      bootFresh()
      expect(mockRestoreMacSteamOnlineIfOwed).toHaveBeenCalledTimes(1)
      expect(mockRestoreMacSteamOnlineIfOwed).toHaveBeenCalledWith('boot')
    })
  })

  describe('boot services (66.1-04)', () => {
    it('a default boot returns BootServices with all thirty-two fields', () => {
      const { services } = bootWithLines()
      expect(Object.keys(services).sort()).toEqual([
        'anonymousClient',
        'appInfo',
        'bridgeHelpers',
        'bridgeRuntime',
        'clock',
        'commandRunner',
        'config',
        'downloadQueue',
        'engineRuntime',
        'engineState',
        'gameConfigs',
        'host',
        'humble',
        'launcher',
        'managers',
        'onlineMonitor',
        'paths',
        'quit',
        'runner',
        'signInProbe',
        'spawnAsync',
        'steamBottle',
        'steamGridSecrets',
        'steamLaunchRuntime',
        'steamProcesses',
        'steamSession',
        'steamUser',
        'storeRegistry',
        'storeRoot',
        'stores',
        'tokenStore',
        'winetricksQueue'
      ])
      for (const value of Object.values(services)) expect(value).toBeDefined()
    })

    it('a boot with prebuilt services uses them by reference', () => {
      const managers = createTestManagers()
      const { services } = bootFresh({ services: { managers } })
      expect(services.managers).toBe(managers)
    })

    it('a boot with every service prebuilt never reports missing services', () => {
      const prebuilt = createTestServices()
      expect(() => bootFresh({ services: prebuilt })).not.toThrow()
    })

    it('a boot starts no system-info child and never touches comet (A-CR-1)', async () => {
      const spawnWrapper = jest.spyOn(util_os_processes, 'genericSpawnWrapper')
      const comet = jest.spyOn(helperBinaries, 'getCometVersion')
      const rejections: unknown[] = []
      const onRejection = (reason: unknown) => rejections.push(reason)
      process.on('unhandledRejection', onRejection)
      try {
        // createTestServices' default managers throw on use: a boot-time probe fetch would
        // reject (unhandled) AND call the spies below.
        expect(() =>
          bootFresh({ services: createTestServices() })
        ).not.toThrow()
        await new Promise((resolve) => setImmediate(resolve))
        await new Promise((resolve) => setImmediate(resolve))
        expect(spawnWrapper).not.toHaveBeenCalled()
        expect(comet).not.toHaveBeenCalled()
        expect(rejections).toEqual([])
      } finally {
        process.off('unhandledRejection', onRejection)
        spawnWrapper.mockRestore()
        comet.mockRestore()
      }
    })
  })

  it('reaches READY under bare node without an uncaught exception', () => {
    let lines: string[] = []
    expect(() => {
      lines = bootWithLines().lines
    }).not.toThrow()

    expect(lines).toContain(READY_SENTINEL)
  })

  // Behavior 2: a health/ping invoke frame written to the sidecar's stdin
  // yields a matching SidecarRpcResponse on stdout within a timeout.
  it('round-trips a health/ping invoke frame over stdio', async () => {
    const { input, lines } = bootWithLines()
    input.write(
      `${JSON.stringify({
        id: 'test-ping-1',
        kind: 'invoke',
        channel: 'health',
        args: []
      })}\n`
    )

    await flush()

    const responseLine = lines.find((line) =>
      line.includes('"id":"test-ping-1"')
    )
    expect(responseLine).toBeDefined()
    expect(JSON.parse(responseLine as string)).toEqual({
      id: 'test-ping-1',
      ok: true,
      result: 'ok'
    })
  })

  // Behavior 2b (27-05 regression): an invoke for one of the ~217 deliberately-unported
  // channels must reject with the UNPORTED_CHANNEL_MARKER tag, not a bare message. The
  // renderer's on-page error surface keys off that marker to distinguish a documented seam
  // gap from a real bootstrap failure; without it, any module-scope `.then()` on an unported
  // channel (e.g. getLegendaryVersion) paints over the whole app at boot.
  //
  // Phase 34.3 plan 04: this test used `getUploadedLogFiles` as its "still
  // genuinely unported" stand-in channel. That plan legitimately ports
  // `getUploadedLogFiles`, so the example was substituted for
  // `getLegendaryVersion` -- a Phase 34.5 channel confirmed still
  // unregistered anywhere in the sidecar, following the exact precedent
  // `34.3-01-SUMMARY.md` already documents for the same situation
  // (`checkDiskSpace` -> `getLegendaryVersion` across 4 other test files).
  //
  // UPDATED AGAIN (Phase 34.5 Plan 07, REQ-34.5-06): `getLegendaryVersion` is
  // ALSO no longer unported -- it is now registered for real by
  // `runnerMiscFlowRegistration.ts` (`runnerMiscFlows.test.ts` covers its
  // ported registration kind). `winetricksInstall` substitutes here as a
  // channel D-03 permanently DEFERS to Phase 34.6, so this test will not
  // need a further substitution once plan 34.5-12 lands.
  it('tags an unported-channel invoke as an expected seam gap', async () => {
    const { input, lines } = bootWithLines()
    input.write(
      `${JSON.stringify({
        id: 'test-unported-1',
        kind: 'invoke',
        channel: 'winetricksInstall',
        args: []
      })}\n`
    )

    await flush()

    const responseLine = lines.find((line) =>
      line.includes('"id":"test-unported-1"')
    )
    expect(responseLine).toBeDefined()
    const response = JSON.parse(responseLine as string)
    // Still an honest rejection -- only the reason is classified.
    expect(response.ok).toBe(false)
    expect(response.error).toContain(UNPORTED_CHANNEL_MARKER)
    expect(response.error).toContain('winetricksInstall')
  })

  // Behavior 3: importing REAL backend modules under the installed stub does
  // not throw -- require('backend/typed_store') constructs a store
  // (electron-store wall shimmed) AND
  // require('backend/storeManagers/steam/library') imports headlessly (the
  // transitive Electron coupling the live 27-05 run hits -- it pulls in
  // backend/utils.ts -> backend/storeManagers/index.ts, which eagerly
  // constructs EVERY store manager at import time). At least one ipcMain
  // handler (bootstrap's own ./handlers import) is recorded in the
  // platformApi registry.
  it('imports real backend modules headlessly under the installed stub', () => {
    // The assertion is literally that this require call does not throw; a static
    // import would move the load to module-eval time and destroy the test.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('backend/typed_store')).not.toThrow()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TypeCheckedStoreBackend } = require('backend/typed_store')
    const store = new TypeCheckedStoreBackend(
      'configStore',
      { cwd: 'store' },
      {
        kind: 'user-state'
      },
      { root: createTestStoreRoot() }
    )
    expect(typeof store.get).toBe('function')
    expect(typeof store.set).toBe('function')

    // The assertion is literally that this require call does not throw; a static
    // import would move the load to module-eval time and destroy the test.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('backend/storeManagers/steam/library')).not.toThrow()

    const { services } = bootFresh()
    expect(services.host.ipc.handlerMap().has('health')).toBe(true)
  })

  // Phase 34.5 Plan 18, Task 1 (G-3, REQ-34.5-01). Asserts on the emitted log TEXT, not merely
  // that a logger function was called -- the exact prefix
  // (`[bootstrap] GAMELIB_SHELL_EXE received=`) is a contract `34.5-LIVE-GATE.md` precondition
  // 5 depends on. `jest.spyOn` (not `jest.mock`) wraps the real, already-loaded `backend/logger`
  // module object in place so the real implementation still runs (mirrors
  // `sidecarRejectionGuard.test.ts`'s established precedent for this exact module).
  describe('boot-time GAMELIB_SHELL_EXE receipt logging (Phase 34.5 G-3, plan 34.5-18)', () => {
    let savedShellExe: string | undefined

    beforeEach(() => {
      savedShellExe = process.env.GAMELIB_SHELL_EXE
    })

    afterEach(() => {
      // Restore exactly, including "was absent" -- pathShim.test.ts's own established
      // precedent for this same env var.
      if (savedShellExe === undefined) {
        delete process.env.GAMELIB_SHELL_EXE
      } else {
        process.env.GAMELIB_SHELL_EXE = savedShellExe
      }
    })

    it('set arm: logs the value verbatim at info level, and the boot still reaches READY_SENTINEL', () => {
      process.env.GAMELIB_SHELL_EXE =
        '/Users/dev/GameLib/src-tauri/target/debug/gamelib-shell'
      let logInfoSpy!: jest.SpyInstance
      const { lines } = bootWithLines({
        before: () => {
          logInfoSpy = jest.spyOn(
            fresh<typeof import('../../logger')>('../../logger'),
            'logInfo'
          )
        }
      })

      expect(
        logInfoSpy.mock.calls.some(
          ([message]) =>
            message ===
            '[bootstrap] GAMELIB_SHELL_EXE received=/Users/dev/GameLib/src-tauri/target/debug/gamelib-shell'
        )
      ).toBe(true)
      expect(lines).toContain(READY_SENTINEL)
    })

    it('unset arm: logs <UNSET> at warning level, does not throw, and the boot still reaches READY_SENTINEL', () => {
      delete process.env.GAMELIB_SHELL_EXE
      let logWarningSpy!: jest.SpyInstance
      let lines: string[] = []
      expect(() => {
        lines = bootWithLines({
          before: () => {
            logWarningSpy = jest.spyOn(
              fresh<typeof import('../../logger')>('../../logger'),
              'logWarning'
            )
          }
        }).lines
      }).not.toThrow()

      expect(
        logWarningSpy.mock.calls.some(
          ([message]) =>
            message === '[bootstrap] GAMELIB_SHELL_EXE received=<UNSET>'
        )
      ).toBe(true)
      expect(lines).toContain(READY_SENTINEL)
    })
  })

  // Phase 34.5 Plan 18, Task 2 (G-1/G-3, REQ-34.5-12). `publicDir` (`constants/paths.ts:73`) is
  // a MODULE-SCOPE constant computed once, at import time, from `platformApi.app.getAppPath()`
  // -- so each arm needs a fresh module instance so `publicDir` gets recomputed against whatever
  // `GAMELIB_APP_ROOT` the arm sets. `bootFresh()` (D-08) resets the module registry and boots
  // once, against the REAL, unmocked `platformApi`.
  describe('boot-time asset-root self-check (Phase 34.5 G-1/G-3, plan 34.5-18)', () => {
    const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

    /**
     * Boots once via bootFresh() (so `publicDir` is recomputed in a fresh module registry
     * against whatever `GAMELIB_APP_ROOT` the calling arm set, against the REAL,
     * unmocked `platformApi`), and returns the isolated `logError` spy's
     * calls plus the transport output lines -- so each arm below only supplies the env var and
     * the assertions.
     */
    function runIsolatedInitAndCollectLogErrors(): {
      defectCalls: unknown[][]
      lines: string[]
    } {
      let logErrorSpy!: jest.SpyInstance
      const { lines } = bootWithLines({
        before: () => {
          logErrorSpy = jest.spyOn(
            fresh<typeof import('../../logger')>('../../logger'),
            'logError'
          )
        }
      })
      return {
        defectCalls: logErrorSpy.mock.calls.filter(([message]) =>
          String(message).includes('SIDECAR ASSET ROOT DEFECT')
        ),
        lines
      }
    }

    it('healthy arm: emits no SIDECAR ASSET ROOT DEFECT line when GAMELIB_APP_ROOT resolves the real repo assets, and the boot still reaches READY_SENTINEL', () => {
      const savedAppRoot = process.env.GAMELIB_APP_ROOT
      process.env.GAMELIB_APP_ROOT = REPO_ROOT

      try {
        const { defectCalls, lines } = runIsolatedInitAndCollectLogErrors()

        expect(defectCalls).toHaveLength(0)
        expect(lines).toContain(READY_SENTINEL)
      } finally {
        if (savedAppRoot === undefined) {
          delete process.env.GAMELIB_APP_ROOT
        } else {
          process.env.GAMELIB_APP_ROOT = savedAppRoot
        }
      }
    })

    it('missing-asset arm: emits exactly ONE SIDECAR ASSET ROOT DEFECT line when GAMELIB_APP_ROOT points at an empty temp directory, and the boot still reaches READY_SENTINEL', () => {
      const savedAppRoot = process.env.GAMELIB_APP_ROOT
      const emptyAppRoot = mkdtempSync(
        join(tmpdir(), 'gamelib-bootstrap-assetroot-')
      )
      process.env.GAMELIB_APP_ROOT = emptyAppRoot

      try {
        const { defectCalls, lines } = runIsolatedInitAndCollectLogErrors()

        expect(defectCalls).toHaveLength(1)
        expect(
          String(defined(defectCalls[0], 'first defect call')[0])
        ).toContain(emptyAppRoot)
        expect(lines).toContain(READY_SENTINEL)
      } finally {
        if (savedAppRoot === undefined) {
          delete process.env.GAMELIB_APP_ROOT
        } else {
          process.env.GAMELIB_APP_ROOT = savedAppRoot
        }
      }
    })
  })

  // D-12 (Phase 72, T-72-18): the Steam token store slot starts fail-closed, so the 'secret-stores'
  // step MUST configure the real store (keyring or dev-vault) before any handler can run.
  describe('boot-time Steam token store install (D-12)', () => {
    it('one boot configures the slot away from the fail-closed default', () => {
      const { services } = bootFresh()
      const store = services.tokenStore.current()
      // The unconfigured default reports the store as unavailable; the configured one is a real store.
      expect(store.constructor.name).not.toBe('UnconfiguredTokenStore')
    })
  })

  // debug/steam-token-survives-keychain: `clearOrphanedElectronToken()`
  // (tokenStore.ts) is now called unconditionally from `init()`, right after
  // the devSecretVaultInstalled if/else secret-store install block, to retire
  // a frozen pre-Tauri Electron-era `refreshToken` key from
  // `steam_store/config.json`. These tests exercise it at the real-boot
  // level, against the REAL (unmocked) `steamConfigStore` -- following
  // `skeletonFlows.test.ts`'s established precedent for touching this exact
  // store directly in a sidecar test.
  describe('boot-time orphaned Steam token cleanup (debug/steam-token-survives-keychain)', () => {
    type SteamStore = ReturnType<
      typeof import('../../storeManagers/steam/stores').createSteamStores
    >['configStore']
    let lastStore: SteamStore | undefined

    const LEGACY_VALUE = 'steam:v1:some-ciphertext-or-legacy-plaintext'
    const RECEIPT =
      '[bootstrap] removed a legacy pre-Tauri `refreshToken` key from `steam_store/config.json`; the Keychain (`steam-refresh-token` slot) is the authoritative store'

    /** One boot in a fresh registry, with the fresh steam store seeded (or not) ahead of it. */
    function bootWithSteamStore(seed: boolean) {
      let logInfoSpy!: jest.SpyInstance
      let store!: SteamStore
      // The boot builds its stores on this root, so the seeded store shares its file cell with
      // the boot's own steam config store and the cleanup is observable through it.
      const root = createTestStoreRoot()
      bootFresh({
        services: { storeRoot: root },
        before: () => {
          store = fresh<typeof import('../../storeManagers/steam/stores')>(
            '../../storeManagers/steam/stores'
          ).createSteamStores({
            registry: createStoreRegistry(),
            root
          }).configStore
          lastStore = store
          if (seed) store.set('refreshToken', LEGACY_VALUE)
          logInfoSpy = jest.spyOn(
            fresh<typeof import('../../logger')>('../../logger'),
            'logInfo'
          )
        }
      })
      return { store, logInfoSpy }
    }

    afterEach(() => {
      lastStore?.clear()
    })

    it('present: deletes the key and logs exactly the one receipt line, key name only, never the value', () => {
      const { store, logInfoSpy } = bootWithSteamStore(true)

      expect(store.get_nodefault('refreshToken')).toBeUndefined()
      expect(
        logInfoSpy.mock.calls.some(([message]) => message === RECEIPT)
      ).toBe(true)
    })

    it('absent: no-op, and the receipt line is never logged', () => {
      const { logInfoSpy } = bootWithSteamStore(false)

      expect(
        logInfoSpy.mock.calls.some(([message]) =>
          String(message).includes(
            'removed a legacy pre-Tauri `refreshToken` key'
          )
        )
      ).toBe(false)
    })

    it('one boot removes the key and logs the receipt exactly once', () => {
      const { store, logInfoSpy } = bootWithSteamStore(true)

      expect(store.get_nodefault('refreshToken')).toBeUndefined()
      expect(
        logInfoSpy.mock.calls.filter(([message]) => message === RECEIPT)
      ).toHaveLength(1)
    })

    it('does NOT route through applyStoreWrite -- the D-04 write guard is never invoked, yet the key is still gone', () => {
      let applyStoreWriteSpy!: jest.SpyInstance
      let store!: SteamStore
      const root = createTestStoreRoot()
      bootFresh({
        services: { storeRoot: root },
        before: () => {
          store = fresh<typeof import('../../storeManagers/steam/stores')>(
            '../../storeManagers/steam/stores'
          ).createSteamStores({
            registry: createStoreRegistry(),
            root
          }).configStore
          lastStore = store
          store.set('refreshToken', LEGACY_VALUE)
          applyStoreWriteSpy = jest.spyOn(
            fresh<typeof import('../storeWriteHandlers')>(
              '../storeWriteHandlers'
            ),
            'applyStoreWrite'
          )
        }
      })

      expect(store.get_nodefault('refreshToken')).toBeUndefined()
      expect(applyStoreWriteSpy).not.toHaveBeenCalled()
    })
  })
})

describe('register-handlers boot step (D-08, C-03)', () => {
  it('importing ../handlers alone registers nothing; the boot step registers health', () => {
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../handlers')
    const { services } = bootFresh()
    // The boot step builds the registry and registers into it; nothing registered before it.
    expect(services.host.ipc.handlerMap().has('health')).toBe(true)
  })

  it('legacy-zoom cleanup removes seeded data under ctx.paths.userData', async () => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-zoom-ctx-' })
    try {
      const ctxUserData = join(profile.root, 'ctx-userData')
      const seeded = join(ctxUserData, 'zoom_store')
      mkdirSync(seeded, { recursive: true })

      bootFresh({ context: { paths: { userData: ctxUserData } } })

      for (let turn = 0; turn < 50 && existsSync(seeded); turn++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      expect(existsSync(seeded)).toBe(false)
    } finally {
      profile.dispose()
    }
  })
})

describe('steam running-game poller boot wiring (quick 261111-7wo)', () => {
  const REG_ARGV = [
    'query',
    'HKCU\\Software\\Valve\\Steam',
    '/v',
    'RunningAppID'
  ]

  // Mirrors steamLaunchWatch.test.ts's tick(): drain the awaiting probe, advance the injected
  // clock, drain again so the tick's async body and its frame write have both run.
  async function tick(
    clock: { advance(ms: number): void },
    ms: number
  ): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve()
    clock.advance(ms)
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }

  const statusFrames = (frames: { [key: string]: unknown }[]) =>
    frames
      .filter(
        (f) => f.kind === 'frontendMessage' && f.channel === 'gameStatusUpdate'
      )
      .map((f) => (f.args as unknown[])[0])

  it('a booted win32 sidecar turns a RunningAppID 0 -> X -> 0 change into one playing and one done frame', async () => {
    const { frames, testContext } = bootFresh({
      context: {
        platform: 'win32',
        script: [
          {
            cmd: 'reg',
            argv: REG_ARGV,
            result: {
              code: 0,
              stdout: 'RunningAppID    REG_DWORD    0x407e0'
            }
          },
          {
            cmd: 'reg',
            argv: REG_ARGV,
            result: { code: 0, stdout: 'RunningAppID    REG_DWORD    0x0' },
            repeat: true
          }
        ]
      }
    })

    // Nothing ticks at boot itself (exit contract: no work before the first interval).
    const regCalls = () =>
      testContext.runner.calls.filter((c) => c.cmd === 'reg')
    expect(regCalls()).toHaveLength(0)
    expect(statusFrames(frames)).toHaveLength(0)

    await tick(testContext.clock, 5000)
    expect(regCalls()).toHaveLength(1)
    expect(statusFrames(frames)).toEqual([
      { appName: '264160', runner: 'steam', status: 'playing' }
    ])

    await tick(testContext.clock, 5000)
    expect(statusFrames(frames)).toEqual([
      { appName: '264160', runner: 'steam', status: 'playing' },
      { appName: '264160', runner: 'steam', status: 'done' }
    ])
    // Let the poller's own fire-and-forget log appends land before the next boot rotates the
    // shared gamelib.log (an in-flight append makes that rename EPERM on Windows).
    await flush()
  })
})

describe('one-shot boot (D-08)', () => {
  it('a second bootSidecar() or init() in the same process throws naming D-08', () => {
    const { testContext } = bootFresh()
    const bootstrap = fresh<typeof import('../bootstrap')>('../bootstrap')

    const guards =
      fresh<typeof import('../processGuards')>(
        '../processGuards'
      ).createProcessGuards()
    expect(() =>
      bootstrap.bootSidecar(
        testContext.ctx,
        new PassThrough(),
        new PassThrough(),
        guards
      )
    ).toThrow(/D-08/)
    expect(() =>
      bootstrap.init({ guards }, new PassThrough(), new PassThrough())
    ).toThrow(/D-08/)
  })

  it('each bootFresh() gets its own context with userData under that context fake HOME', () => {
    const first = bootFresh().testContext
    const second = bootFresh().testContext

    expect(first.profile.root).not.toBe(second.profile.root)
    expect(first.ctx.paths.userData.startsWith(first.profile.root)).toBe(true)
    expect(second.ctx.paths.userData.startsWith(second.profile.root)).toBe(true)
  })

  it('one boot writes READY once and initialises the online monitor once', () => {
    const onlineMonitor = createTestOnlineMonitor()
    const start = jest.spyOn(onlineMonitor, 'start')
    const { lines } = bootWithLines({ services: { onlineMonitor } })

    expect(lines.filter((line) => line === READY_SENTINEL)).toHaveLength(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  describe('rosetta step on macOS', () => {
    const bootAsMac = () => {
      let checkRosettaInstall!: jest.SpyInstance
      bootFresh({
        before: () => {
          jest.replaceProperty(
            fresh<typeof import('../../constants/environment')>(
              '../../constants/environment'
            ),
            'isMac',
            true
          )
          checkRosettaInstall = jest
            .spyOn(
              fresh<typeof import('../../utils')>('../../utils'),
              'checkRosettaInstall'
            )
            .mockResolvedValue(undefined)
        }
      })
      return checkRosettaInstall
    }

    it('probes exactly once per boot', async () => {
      const checkRosettaInstall = bootAsMac()
      await flush()

      expect(checkRosettaInstall).toHaveBeenCalledTimes(1)
    })

    it('does not probe before the i18n promise it is given resolves', async () => {
      const checkRosettaInstall = bootAsMac()
      await flush()
      checkRosettaInstall.mockClear()

      let release!: () => void
      const i18nReady = new Promise<void>((resolve) => {
        release = resolve
      })
      fresh<typeof import('../bootstrap')>('../bootstrap').checkRosettaWhenMac(
        i18nReady,
        {
          runner: createScriptedRunner([]),
          dialogs: createTestHostServices().dialogs
        }
      )
      await flush()
      expect(checkRosettaInstall).not.toHaveBeenCalled()

      release()
      await flush()
      expect(checkRosettaInstall).toHaveBeenCalledTimes(1)
    })
  })
})
