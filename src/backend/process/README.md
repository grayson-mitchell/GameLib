# src/backend/process

The process leaf (Phase 66): the injected clock, the process runner and the
`AppContext` that bundles them. This directory imports only Node builtins and
its own files. It must not import `backend/logger`, `backend/config` or
`backend/utils` (the `runner-is-a-leaf` dependency-cruiser rule enforces it).

## What AppContext holds

`AppContext` is a type plus the `createAppContext()` factory. It has no
`getContext()` locator and no module state. Today it holds:

- `platform`: the `NodeJS.Platform` the app runs on
- `paths`: `appRoot`, `publicDir`, `userData`
- `clock`: the injected `Clock`
- `runner`: the injected `ProcessRunner`
- `log`: a `LogSink` with `info`, `warn` and `error`

Phase 66.1 adds the stores and the manager maps.

## Declaring a slice

No module receives the whole context. Each module declares a narrow interface
whose members are typed from `AppContext` fields, and a `createX(deps)`
factory that closes over it:

    interface MacArchDeps {
      runner: AppContext['runner']
      platform: AppContext['platform']
    }
    export function createMacArch(deps: MacArchDeps) { ... }

Forbidden: a whole-`AppContext` parameter, a `getContext()` locator, and a
`deps = defaultDeps` default argument. The composition root builds the context
once and passes each factory its slice.

## The runner

- `run(cmd, argv, opts)` is the normal path. The default timeout is 30 s
  (`DEFAULT_RUN_TIMEOUT_MS`); `timeoutMs` must be positive and finite.
- `spawnLongLived(cmd, argv, { id, ... })` is for processes that outlive a
  call. It registers a teardown that `teardownAll()` runs at shutdown.
- `runSync(cmd, argv, { timeoutMs, reason })` is the synchronous escape hatch.
  Both the timeout and a non-empty reason are required.
- Argv only, never a shell string.
- Only the runner may detach or `unref()` a child.

## The clock

Every timer is `unref()`'d by default so it cannot hold the sidecar's event loop
open. A timer that must keep the process alive passes
`{ keepAlive: { reason } }`; the reason is mandatory and non-empty.

## Writing a test

Build only the slice you need from `createTestContext()` in
`src/backend/testUtils/testContext.ts`. It returns the context together with
its fakes (`runner`, `clock`, `log`, `profile`) and a `dispose()`:

    const t = createTestContext({
      script: [{ cmd: 'lipo', argv: ['-archs', '/x'], result: { stdout: 'arm64\n' } }]
    })
    const arch = createMacArch({ runner: t.ctx.runner, platform: 'darwin' })
    // ...
    t.runner.expectAllConsumed()
    t.dispose()

- Scripted runner (`createScriptedRunner`) is the default. It never spawns, and
  an unscripted call fails loudly naming the cmd and argv.
  It calls `onSpawn` once with an inert handle, honours `opts.signal`
  (`aborted: true`), validates the `timeout` opt-out like the real runner, and
  supports `hold: true` steps that stay pending until `runner.release(cmd)` or an
  abort. `createScriptedRunner(script, { killCounts })` makes `killTracked`
  record its filter in `calls` and return the scripted counts (default 0).
- Fake clock (`createFakeClock`) replaces `jest.useFakeTimers`: call
  `advance(ms)` or `runAll()`, and `assertNoKeepAlive()` to prove nothing holds
  the loop open.
- Capture log (`createCaptureLog`) records `{ level, msg }` lines in `lines`.
- Real runner (`createRealRunner`) only when the test must actually spawn. It
  runs under a fresh `createFakeHomeProfile()` and its `openDetached` throws.
- The real-profile arm, `createRealRunner({ realProfile: { justification } })`,
  is required only when a defect arms under a populated profile (the
  two-profile rule). The justification must name that defect. Never mock
  `child_process`.

`createTestContext` creates directories only for its fake-HOME defaults. A
`paths` override is used as given and never created.

## Runner semantics (66.1)

- **Drain grace.** When a run timed out, was aborted, or uses
  `resolveOn: 'exit'`, `run()` waits at most `DRAIN_GRACE_MS` (250 ms, on the
  injected clock) after the child's `exit` for its pipes to close. A grandchild
  holding the pipes no longer hangs the call: the pipes are destroyed, the child
  is untracked (so `killTracked` cannot signal a recycled PID), and the result
  carries the exit code/signal with `drainTimedOut: true`. Output after the
  grace is dropped.
- **Timeout opt-out.** Omitting both fields still means `DEFAULT_RUN_TIMEOUT_MS`.
  `timeout: { none: true, reason }` is the only way to run unbounded; the reason
  must be non-empty and the option cannot be combined with `timeoutMs`. Justified
  for installers, game launches and scripts the caller cancels via `signal`.
- **Handle exit state.** `ChildHandle` exposes `exitCode` and `signalCode`
  (null until the child exits), so callers do not need `ChildProcess`.
- **Truncation (WR-02).** Once a chunk is dropped on a stream, no later chunk is
  appended to it. The review's splice was not reproducible; a test pins it.
- **win32 kill.** `killPid` returns the `taskkill` outcome (false on failure or
  when it is missing) so the registry's warning fires. CI is ubuntu-only, so
  only the failure path is CI-verified (A6). `runSync` passes
  `maxBuffer: DEFAULT_MAX_BUFFER_BYTES`, so large stdout is captured, not ENOBUFS.

## Boot services (66.1)

`AppContext` is the process-level leaf (platform, paths, clock, runner, log). Stores, store
managers, the launcher, the command runner, `spawnAsync` and the quit handler are NOT on it:
`backend/process/` cannot type-import them. They live in a per-boot `BootServices` object
(`src/backend/services/types.ts`) held on the sidecar's `BootState`, built by named boot steps and
handed to `registerHandlers({ log, services })`, the composition root.

Transition (A3, expand/contract): every service is currently filled by an identity facade in
`src/backend/services/legacyFacades.ts` (since deleted) that only grouped today's singletons and functions. Each
facade is deleted by the plan that lands the real factory: command runner (05), `spawnAsync` and
quit (06), managers and launcher (23), stores (25). The file goes with the last one.

Step order: `logger`, `stores`, `migrations`, `command-runner`, `store-managers`,
`register-handlers`. `stores` precedes `migrations` because migrations read `migrationsStore`.

Tests: `bootFresh({ services })` hands prebuilt services to the boot (returned `services` carries
them by reference); `createTestServices`, `createTestManagers` and `createTestStores` in
`testUtils/testServices.ts` build fakes that throw on an unscripted call.

### Converting a consumer (66.1 rules)

- **R1 slice:** export `interface XDeps` holding only the members used, typed from
  `BootServices`/`StoreManagers`/`Stores` via `Pick`. Only composition roots (boot steps,
  `registerHandlers`, `createStoreManagers`) see the whole `BootServices`.
- **R2 classes** take deps in the constructor (`private readonly deps`); a library manager hands its
  deps to the game objects it creates.
- **R3 function modules:** an exported function that needs a dependency takes `deps` as its FIRST
  parameter, or the module exports `createX(deps)` when it has three or more such functions or
  closure state. Callers pass slices; the cascade ends at a registration, a boot step or a manager
  constructor. Call-site-only edits in files owned by other plans are allowed and listed in the
  SUMMARY.
- **R4** never dereference deps at import or construction time; siblings resolve at call time.
- **R5 tests** inject via `createTestServices`/`createTestManagers`/`bootFresh({ services })`. Remove
  a `jest.mock` only if the suite stays green without it, and lower that exact shard entry in the
  same commit. Never `jest.doMock`.
- **R6** callbacks passed to the command runner take `ChildHandle`, and unref helpers are deleted
  (the runner unrefs).
- **R7** lazy `await import('backend/storeManagers')` sites go away when the map arrives as a dep;
  other lazy imports stay.
- **R8 grep gate:** a converted file has no value import of `libraryManagerMap`, `storeLaunchHooks`,
  any of the 16 stores modules, utils `spawnAsync`/`getGame`/`handleExit`, or launcher
  `callRunner`/`runWineCommand`/`getWinePath`.

## 66.1 outcome

**Built at boot, injected everywhere:** the command runner (`commandRunner`, `spawnAsync` and the
`runner` itself), the per-boot store registry and the 16 `createXStores` factories joined by
`createStores`, `createStoreManagers` (the manager table), `createLauncher`, `createDownloadQueue`,
the quit handler (`createQuitHandler`) and the long-lived helper services. Nothing in that list
constructs at import time; the boot's named steps are the only construction path.

**Now runs through the runner:** every tracked game/installer child (stop and cancel are marked by
the registry as `killedByUs`, so they do not surface as errors), long-lived children (comet, the
Steam bridge helper) via `spawnLongLived`, and quit teardown (`killAllTracked` then `teardownAll`).
`trackedChildren.ts`, `longLivedChildren.ts`, the quit handler's `legacyChildren` arm,
`libraryManagerMap`, `storeLaunchHooks`, `legacyManagerDeps`, `legacyBootQueue` and
`services/legacyFacades.ts` are deleted; `src/backend/__tests__/diPhaseGates.test.ts` keeps them
gone (zero `jest.mock`).

**C-05 decision:** the WR-04/05/06 and IN-02 gate hardening is not done in 66.1. Counting
`jest.doMock`/`setMock` would surface previously uncounted sites, and those can only enter the
shrink-only baselines as a raise. 66.2 owns the `child_process` ban and the gate hardening.

**66.2 end state:** every backend spawn goes through the runner. Three independent detectors hold
the line: the ESLint `no-restricted-imports` block for `src/backend` production code (static
imports, `createRequire`, `process.getBuiltinModule`), the dependency-cruiser rule
`no-child-process-outside-runner` (static, `require()`, `import()`, and the npm spawn packages),
and the AST census in `meta/backendDiCeilings.cjs` (computed specifiers included). The sanctioned
list is `src/backend/process/runner.ts` alone. The `childProcess` ceiling is deleted and shards
may not carry the section; the counter stays, so any other site is a new violation.

**Hand-off to 66.3:** see "66.3 outcome" below; what 66.3 left is listed under "Hand-off to 66.4".

## 66.3 outcome

**Gone, not relocated:** `src/backend/platform/` (the Electron facade and its interim delegate) no
longer exists. The live types it carried moved next to their users: the IPC event brands, the dialog
option bags, `TitleBarOverlay` and `Rectangle` into `src/common/types/hostTypes.ts`, `ShortcutDetails`
into `shortcuts/shortcuts/windowsShortcut.ts`; the dead Electron-shaped types were deleted. The
delegate-only stubs (logged no-op `net`, `session`, `Menu`, `protocol`, `Tray`, `BrowserWindow`, the
sync dialogs, `trashItem`, `safeStorage`) had no non-test caller left and went with it. The
`process.getSystemVersion` polyfill is replaced by `os.release()` at its two call sites, and the win32
memory probe reads `os.totalmem()` / `os.freemem()` (plain Node has no `getSystemMemoryInfo`).

**Six host services replace the shim:** `openExternal`, `dialogs`, `notifications`, `appState`
(window raise/hide, relaunch single-flight, wake locks, clipboard write, bridge picker),
`imageTools` and `pushFrontendMessage`, built once by the `host-services` boot step over a fresh
`createIpcRegistry()` and held on `BootServices.host`. The interim bind step is gone;
`backend/ipc.ts` keeps only `sendFrontendMessage`.

**Config is built at boot:** `createGlobalConfig()` (runs `ensureSettingsMigrated` first) and
`createGameConfigs({ config })` (the per-game Map lives in its closure) are called only by the
`config` boot step. `GlobalConfig.get()`, `GameConfig.get()`, `GlobalConfig.globalInstance`, the static
`instances` Map and the interim `adoptGlobalConfig()` are deleted. The SteamGridDB secret deps carry
the config slice, so no module reaches for a static config.

**Owners now instances, built by named boot steps:** the online monitor, engine state, the Steam
anonymous client, game-session/sign-in state, auth trigger, `steam/state`, the bridge helper registry,
shim coverage, the winetricks queue, the sign-in probe pass/outcomes/epochs, `SteamUser`, the Steam
bottle helper, dxmt, the SteamGridDB and Humble secret stores and the Humble services (classify,
library, login-window seam, sync fence, user), and the process guards (entry-built, D-66.3-10).
Constant `Set`s were frozen rather than moved (D-66.3-09), and stateful cascade edits that only
thread a slice through an unconverted module follow D-66.3-11 (the module keeps its census count).

**Final numbers:** moduleState 130 (127 long-tail sites in 85 files plus the 3 sanctioned: the
logger sink, 2, and the boot entry, 1), the sanctioned list is exactly the runner (child_process),
`logger/index.ts` and `sidecar/bootstrap.ts`, no rust-overlap entry exists, and every one of the
`OWNED_66_3` files is absent from the census. `diPhaseGates.test.ts` pins all of it, plus the absence
of any interim scaffolding under `src/`. The moduleState section is still a ceiling, not a ban.

## Hand-off to 66.4

Phase 66.4 owns:

- **The long tail:** about 85 files / 127 sites of module state still counted by the census, and the
  census-to-test flip (D-13/D-16): turn the moduleState ceilings into a zero-tolerance test and delete
  the section.
- **D-66.2-03 deferrals:** the `utils.ts` `default*Path` lets, the `tools/index.ts` caches
  (`installingComponent`, `catalogCache`, `scriptMetadataCache`), `engineNoticeStore` and the two `pci_ids`
  stores. (The win32 sync fallback in `knownFolders` and `pathShim` was retired in quick 261111-aq4:
  pathShim's win32 `desktop`/`documents` arms throw, and the two callers use the registry folder or go
  without it.)
- **Module-scope pathShim reads introduced as cascade edits:** `constants/paths.ts` (`configFolder`,
  `userDataPath`, `publicDir` from `GAMELIB_APP_ROOT`/`isPackagedSidecar()`), `steam/constants.ts`
  (`steamSupportPath`).
- **Latches that survive by design for now:** the module-level `registered` / `currentRegistry` guards in
  `devEpicCookieSweep`, `runnerAuth` and the store-layer registrations.
- **D-66.3-05:** the live macOS smoke with the scripted orphan/exit checker.
- **D-66.3-06:** the Windows operator UAT.
- **D-66.3-07:** reviving the RunningAppID poller (done since: quick 261111-7wo, the `steam-running-poll` boot step).
- **D-66.3-08:** the 66.2 Windows spawn-path live gate (passed since: quick 261111-5fw).
- **D-17:** the non-autonomous live smoke.

Known loose ends recorded here rather than fixed: the quit-handler release of the anonymous Steam client
has no unit test; `ElectronSteamGridDbSecretStore` is test-only dead code; `isMacSonomaOrHigher()` compares the Darwin kernel
major (`os.release()`) with the macOS major 14, which is not the same number. Fixed since: `SteamUser.logout()`
now calls `resetSteamAuthTrigger()` (quick 261112-7wv).

## Ratchets

`pnpm backend-di-ceilings` counts module-level singletons, `jest.mock` sites
and similar census items per shard in `meta/backendDiCeilings/`. Ceilings only
shrink: when a conversion lowers a count, lower the shard entry in the same
commit. Never raise a ceiling to admit growth. `childProcess` is now a ban, not a ceiling (66.2 D-16). The one exception is a census _definition_ change that starts counting state that already existed (e.g. 66.1 review C-WR-2 began counting non-readonly `static` class fields: moduleState 234 -> 251); that re-baseline must name every newly counted site and its owning phase in the same commit. 66.2-01 (C-05/WR-06) began counting jest.doMock/setMock/unstable_mockModule/destructured mock: jestMock 2402 -> 2438, sites: src/backend/**tests**/launcher_wineLibFolders.test.ts:+1, src/backend/**tests**/protocol.test.ts:+1, src/backend/sidecar/**tests**/appShellFlows.test.ts:+1, src/backend/sidecar/**tests**/humbleFlows.test.ts:+4, src/backend/sidecar/**tests**/isPackagedSidecar.test.ts:+5 (new entry), src/backend/sidecar/**tests**/wineToolsFlows.test.ts:+14, src/preload/**tests**/tauriAttach.test.ts:+10 (owning phase 66.2).
