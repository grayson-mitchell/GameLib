/**
 * Sidecar bootstrap module (Phase 27 Plan 02 — Task 2).
 *
 * The real process entry is `src/sidecar/index.ts` (bundled by `pnpm
 * build:sidecar` to `build/main/sidecar.js`, spawned by the Rust shell —
 * `src-tauri/src/main.rs`, 27-01), which imports `init` from this module and
 * calls it unconditionally.
 *
 * This module's ordering is load-bearing (spike 009's sharp edge): the
 * `Module._load` hook that redirects `require('electron')` -> electronStub MUST
 * be installed BEFORE `./handlers` is imported, because
 * `backend/constants/paths.ts` calls `app.getPath()` at MODULE SCOPE.
 *
 * Phase 35 Plan 05 (D-04): this paragraph used to describe a SECOND redirect,
 * `require('electron-store')` -> fileStore, for the module-scope `new Store()`
 * calls in `backend/electron_store.ts` / `backend/cache.ts`. That wall no
 * longer exists — `electron-store` was replaced by `backend/store_backend.ts`,
 * a first-party shim over `conf` that needs no Electron runtime — so the
 * interception and this half of its documentation were deleted together.
 *
 * The hook lives in `./installElectronHook` (imported FIRST below), NOT inline
 * here: ES modules evaluate every static import before a module's own
 * executable statements, so an inline hook-install statement would run AFTER
 * `import './handlers'` had already reached `app.getPath()` against the real
 * `electron` — crashing the sidecar on boot (Phase 27 Plan 05 blank-screen
 * fix; see installElectronHook.ts for the full rationale).
 */

// ---- Step 1: install the require hook — MUST be the first import so it runs
//              before `./handlers` (below) pulls in the backend module graph. --
import './installElectronHook'

import type { Readable, Writable } from 'node:stream'
import { existsSync } from 'graceful-fs'
import { join } from 'node:path'
import Backend from 'i18next-fs-backend'
import i18next from 'i18next'
import * as electronStub from '../platform'
import { startInstalledJsonWatcher } from './installedJsonWatcher'
import { READY_SENTINEL } from 'common/types/sidecarTransport'
import { i18nextLanguageOptions, toShippedLanguage } from 'common/languages'

// ---- Step 2: import the backend registration path — AFTER the hook -------

import './handlers'
// Block D (finding A1, quick-260907-odi). Adds NO new module to the sidecar bundle:
// `sidecar/storeRegistration.ts:61` already imports `playtimeSyncQueue` from this exact
// module, so this is a second binding onto an already-resident singleton, not a new edge.
import { playtimeSyncQueue } from '../storeManagers/gog/electronStores'
// Block G (todo 2026-09-06, quick-260908-wk0). Adds NO new module to the sidecar bundle:
// `grep -rn "libraryManagerMap" src/backend/sidecar/*.ts` (re-run at execution time) confirms
// `bootstrap.ts` already imports `./installedJsonWatcher` at its own line 39, and
// `installedJsonWatcher.ts:41` already imports `libraryManagerMap` from `'../storeManagers'` --
// so this is a second binding onto an already-resident singleton, strictly stronger than the
// `./handlers`-transitive route (`runnerMiscFlowRegistration.ts:92`,
// `installFlowRegistration.ts:125`, `appShellFlowRegistration.ts:164` all also import it), not a
// new edge.
import { libraryManagerMap } from '../storeManagers'
// Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09, REQ-34.5-01/05/12): `protocol.ts` imports
// `dialog`/`app` from `electron`, so this import is safe ONLY because `./installElectronHook`
// (Step 1, above) has already installed the `Module._load` redirect by the time this
// statement runs — ES modules evaluate every static import before a module's own executable
// statements run, so the exact ordering that makes `import './handlers'` safe makes this safe
// too. `bootstrap.ts` is deliberately absent from `electronReachLedger.test.ts`'s
// `ENTRY_POINTS` list (confirmed at planning time): that ledger tracks registration modules,
// and `bootstrap.ts` itself has never been a member.
import { handleProtocol } from '../protocol'
import {
  startRpcServer,
  pushFrontendMessage,
  requestOpenExternal
} from './sidecarRpc'
import { setTokenStore as installTokenStore } from '../storeManagers/steam/tokenStore'
import { SidecarKeyringTokenStore } from './keyringTokenStore'
import { installSidecarHumbleSecretStore } from './humbleSecretStore'
import { installSidecarSteamGridDbSecretStore } from './steamgridSecretStore'
// 34.5 gap cycle 4 plan 36 (developer-scoped Routing addition): the dev-only plaintext vault
// that this branch installs INSTEAD OF the two keyring stores below, when opted into. Import
// only — no module-scope call. See installDevSecretVault()'s own header for the full guardrail
// set; this file only decides WHICH arm runs and records which one did.
import { installDevSecretVault } from './devSecretVault'
// Deviation (Rule 1 — bug, found live during the 33-05 install-hang gate,
// fix/steam-native-install-stability): `initOnlineMonitor()` was previously wired ONLY at
// `main.ts`'s `app.whenReady()`, which the headless sidecar never runs. With no init, `isOnline()`
// (backend/online_monitor.ts) read `undefined === 'online'` forever, so
// `downloadmanager/utils.ts`'s pre-install guard rejected EVERY Steam install instantly with
// "App offline, skipping install" even when fully online. Paired with the sidecar
// `net.isOnline()` stub (electronStub.ts) so the very first status check falls through to the
// real `pingSites()` ping instead of pinning `'offline'` permanently.
import { initOnlineMonitor, runOnceWhenOnline } from '../online_monitor'
// Block E (todo 2026-09-06, quick-260908-fre). `grep -rn
// "storeManagers/legendary/user\|storeManagers/gog/user" src/backend/sidecar/` confirms
// `./handlers` (Step 2, above) already pulls both classes in transitively:
// `handlers.ts` imports `registerRunnerAuthFlows` from `./runnerAuthFlowRegistration`, which
// itself imports `LegendaryUser` from `../storeManagers/legendary/user` and `GOGUser` from
// `../storeManagers/gog/user`. So these three imports add NO new module to the sidecar
// bundle — each is a second binding onto an already-resident module, not a new edge.
import { LegendaryUser } from '../storeManagers/legendary/user'
import { GOGUser } from '../storeManagers/gog/user'
import { configStore } from '../constants/key_value_stores'
// Block H (todo 2026-09-06, quick-260909-k5x). `grep -rn "gog/presence" src/backend
// --include='*.ts'` (re-run at execution time) confirms `presence.ts` is ALREADY resident in
// the sidecar bundle: `utils.ts:43` does `import gogPresence from './storeManagers/gog/
// presence'`, and `bootstrap.ts` already imports `checkRosettaInstall` from `'../utils'` for
// Block F above -- pulling `utils.ts`'s module graph in, which already contains this import.
// `launcher.ts:77` is a second, independent route. So this is a second binding onto an
// already-resident singleton, NOT a new module edge. Corollary: because ES modules are
// singletons, this import does NOT cause a second registration of `presence.ts`'s module-scope
// `backendEvents.on('settingChanged', ...)` listener -- that listener is installed exactly
// once, the first time ANY route requires the module.
//
// Sanity note, not an action: this import is unaffected by `electronUntouched.test.ts`'s
// by-construction gate, which bans only the Steam token surface bindings (`configStore`,
// `TOKEN_STORE_KEY`, `TOKEN_PREFIX`) in this file.
import gogPresence from '../storeManagers/gog/presence'
// Deviation (Rule 3 — blocking, Phase 27 Plan 04): `backend/logger`'s
// `logInfo`/`logWarning`/`logError` (called throughout the REAL Steam
// read/action flow code Plan 04 wires up — e.g. library.ts's refresh()
// "Steam client not ready..." warning, games.ts's launch() "launching
// appId..." info line, buildSteamProtocolUrl's guard-rejection warning)
// dereference a module-private `heroicLogWriter` that is ONLY ever assigned
// by that module's exported `init()`/`initHeadless()`. The headless sidecar
// has no Electron-app startup hook, so every one of those log calls threw
// `Cannot read properties of undefined (reading 'logInfo')` the instant a
// real flow handler ran (discovered by Task 2's own end-to-end test). Uses
// `initHeadless()` (added by this same deviation, `backend/logger/index.ts`)
// rather than the real `init()` Electron's main process calls: `init()`
// pulls in `GlobalConfig.get()` (assumes an already-initialized `userData`
// config file — a real Electron app guarantees this, this headless process
// does not) and fires a fire-and-forget system-info dump (shells out to
// hardware/binary-version probes; its async chain can outlive a short-lived
// caller, e.g. a test process tearing down before it resolves).
// `initHeadless()` assigns the SAME `heroicLogWriter` singleton via the
// SAME real `LogWriter` class, skipping only those two Electron-app-only
// side effects — not a reimplementation of logging itself.
import {
  initHeadless as initLogger,
  logDebug,
  logInfo,
  logWarning,
  logError,
  LogPrefix
} from '../logger'
import { GlobalConfig } from '../config'
import { publicDir } from '../constants/paths'
import { backendEvents } from '../backend_events'
import { fetchLastestReleases } from '../utils/releases'
import { downloadAntiCheatData } from '../anticheat/utils'
import { isMac } from '../constants/environment'
// Block F (todo 2026-09-06, quick-260908-k3x). `checkRosettaInstall()` has no static import
// edge back into `sidecar/` (`grep -n "from './sidecar\|from '\.\./sidecar" src/backend/
// utils.ts` returns nothing), so this import introduces no cycle. `isMac` above is already
// imported for other blocks -- not duplicated here.
import { checkRosettaInstall } from '../utils'
// Todo 2026-08-16 (quick task 260822-s8y): `applyMigrations()` had exactly ONE call site in
// the whole repo -- `main.ts:412`, inside Electron's `app.whenReady()` -- so under Tauri the
// entire migration system was dead code that PRESENTED as live (`storeRegistration.ts`
// registers `migrationsStore`, so grepping for "migration" made it look wired). Two
// consequences: `LegendaryGlobalConfigFolderMigration` had never run on the shipping runtime,
// and any future `Migration` added to `getAllMigrations()` would have shipped as a silent
// no-op. Same family as the `initOnlineMonitor()` gap above.
import MigrationSystem from '../migration'
// WR-04 (gap cycle 1): a PURE import of a module with zero static imports of its
// own -- it contributes nothing to this file's evaluation graph, which is the whole
// reason the guard could be hoisted to `src/sidecar/index.ts`'s first import. Placed
// last deliberately: attempt (b) at WR-04 added a SIDE-EFFECTING import here and
// reordered the handler graph (`installFlows.test.ts` Test 1b went red).
import {
  setUncaughtExceptionLogSink,
  setUnhandledRejectionLogSink
} from './processGuards'

// ---- Step 3: start the RPC server, wire the transport, signal READY -------

/**
 * Starts the sidecar: begins serving the stdio JSON-RPC loop, wires
 * electronStub's `shell.openExternal`/`sendFrontendMessage` push path onto
 * it, then prints `READY_SENTINEL`. Streams are injectable for testing
 * (`bootstrap.test.ts` drives this with `stream.PassThrough` pairs);
 * production use (`src/sidecar/index.ts`) relies on the
 * `process.stdin`/`process.stdout` defaults.
 */
let loggerInitialized = false
// Guards initOnlineMonitor() (fix/steam-native-install-stability, 33-05 live-gate gap): unlike
// loggerInitialized's target (initLogger() is naturally idempotent — it just reassigns a
// singleton), initOnlineMonitor() calls `addListener`/`addHandler`, which push onto
// electronStub's `ipcMain.on` listener arrays every call. Without this guard, each repeated
// init() (bootstrap.test.ts / skeletonFlows.test.ts call it many times per file with fresh
// streams; production calls it once) would register another `connectivity-changed`/
// `set-connectivity-online` listener, firing `setStatus()` (and a fresh `pingSites()` ping) once
// per accumulated registration on every subsequent event.
let onlineMonitorInitialized = false
// Guards the i18next initialization block below (D-02). Same reason
// loggerInitialized/onlineMonitorInitialized exist: bootstrap.test.ts / *Flows.test.ts call
// init() many times per file with fresh streams, and re-initializing i18next per call is
// wasteful and can race its async resource load.
let i18nInitialized = false
// Guards the re-homed `releasesInfoReady` anticheat listener below (D-04). Same reason as
// onlineMonitorInitialized: `backendEvents.on` accumulates a listener per call, so without
// this guard repeated init() calls in tests would fire N downloads per event.
let anticheatListenerRegistered = false
// Guards the fetchLastestReleases() call below (D-07). Same reason as the other guards:
// bootstrap.test.ts / *Flows.test.ts call init() many times per file, and a second fetch per
// call is wasteful and would violate the "one fetch, one listener" idempotency contract.
let releasesFetchInitialized = false
// Guards applyMigrations() (todo 2026-08-16, quick task 260822-s8y). Same reason as
// releasesFetchInitialized: bootstrap.test.ts / *Flows.test.ts call init() many times per file,
// and re-running the migration set per call would re-issue its filesystem work. Production calls
// init() once, exactly as the Electron main process calls applyMigrations() once.
let migrationsInitialized = false
// Guards registerProtocolUrlHandler()'s ipcMain.handle() registration below (Phase 34.5 gap
// cycle 6 plan 44). Same reason as the guards above: bootstrap.test.ts / *Flows.test.ts call
// init() many times per file, and electronStub's handlerRegistry is a plain module-scope Map
// keyed by channel name — a second handle('handleProtocolUrl', ...) call would just silently
// overwrite the first, which is harmless today but is exactly the kind of "works by accident"
// idempotency this file's other five guards exist to make explicit instead.
let protocolUrlHandlerRegistered = false
// Guards clearStrandedPlaytimeSyncLock() below (Block D, finding A1, quick-260907-odi). Same
// reason as the other guards: bootstrap.test.ts / *Flows.test.ts call init() many times per
// file, production calls it once.
let playtimeLockClearInitialized = false
// Guards reconcileStoreUsersWhenOnline() below (Block E, todo 2026-09-06, quick-260908-fre).
// Same reason as the other guards: bootstrap.test.ts / *Flows.test.ts call init() many times
// per file, and without this guard each call would register another
// runOnceWhenOnline(...) — either invoking the reconciliation body again immediately (if
// already online) or stacking another 'online' listener on connectivityEmitter (if not).
// Production calls init() once.
let storeUserReconcileInitialized = false
// Guards checkRosettaWhenMac()'s call site below (Block F, todo 2026-09-06, quick-260908-k3x).
// Same reason as the other guards: bootstrap.test.ts / *Flows.test.ts call init() many times
// per file, and without this guard each call would re-chain another `.then()` off `i18nReady`
// and could paint a second Rosetta-warning dialog. Lives at the CALL SITE, not inside
// `checkRosettaWhenMac()` itself, so `rosettaPlatformGate.test.ts` can call the function
// directly without needing to reset a guard it doesn't own -- re-running the read-only probe
// is harmless; the guard exists only to prevent a duplicate dialog.
let rosettaCheckInitialized = false
// Guards syncQueuedPlaytimeWhenOnline()'s call site below (Block G, todo 2026-09-06,
// quick-260908-wk0). Same reason as storeUserReconcileInitialized above: bootstrap.test.ts /
// *Flows.test.ts call init() many times per file, and without this guard each call would
// register another runOnceWhenOnline(...) -- either invoking the drain body again immediately
// (if already online) or stacking another 'online' listener on connectivityEmitter (if not).
// Production calls init() once. Lives at the CALL SITE, not inside
// syncQueuedPlaytimeWhenOnline() itself, matching Blocks A/B/E/F, so the new suite can call the
// helper directly without owning a guard it cannot reset.
let playtimeQueueDrainInitialized = false
// Guards setGogPresenceWhenOnline()'s call site below (Block H, todo 2026-09-06,
// quick-260909-k5x). Same reason as storeUserReconcileInitialized/playtimeQueueDrainInitialized
// above: bootstrap.test.ts / *Flows.test.ts call init() many times per file, and without this
// guard each call would register another runOnceWhenOnline(...) -- either invoking the presence
// body again immediately (if already online) or stacking another 'online' listener on
// connectivityEmitter (if not). Production calls init() once. Lives at the CALL SITE, not
// inside setGogPresenceWhenOnline() itself, matching Blocks E/F/G, so the new suite can call the
// helper directly without owning a guard it cannot reset.
let gogPresenceInitialized = false
// Holds the i18next init promise, chained so a caller can await CATALOG READINESS rather than
// mere init()-was-called (D-02 area, Block F). Assigned the CAUGHT promise -- not the raw
// `i18next.use(Backend).init(...)` one -- because a failed i18n init must still let the
// Rosetta check run (falling back to i18next's own inline defaults), and must never leave a
// second unhandled rejection sitting alongside the existing `.catch()` below. If the i18next
// block's own outer `try` (around `GlobalConfig.get().getSettings()`) throws before ever
// reaching `i18next.use(Backend).init(...)`, this stays at its initial `Promise.resolve()`
// value, which is the correct degrade: the Rosetta check still runs, just without having
// waited on anything.
let i18nReady: Promise<void> = Promise.resolve()

/**
 * Delivers a startup (cold-start) `gamelib://` deep link to `handleProtocol`, if `argv`
 * carries one (Phase 34.5 gap cycle 6 plan 44, F-34.5-G6-09, REQ-34.5-01/05/12) — the sidecar
 * side of the shell's `sidecar_forward_args` allow-list (`src-tauri/src/main.rs`).
 *
 * Finds the first element starting `gamelib://` — mirrors `protocol.ts`'s own
 * `parseHeroicUrl`'s `args.find((arg) => arg.startsWith('gamelib://'))` exactly, so this
 * function's own pre-check can never diverge from what `handleProtocol` itself would accept.
 * Returns `false` with NO logging when absent — a normal boot has no deep link, and a
 * per-boot log line would be noise.
 *
 * When present, logs `[bootstrap] startup protocol URL present` at `LogPrefix.Backend` — the
 * URL itself is NOT logged here; `handleProtocol` (`protocol.ts:50`) logs it authoritatively
 * one line later, and double-logging would put two different renderings of the same value in
 * the gate's evidence.
 *
 * Calls `handleProtocol` wrapped in `Promise.resolve(...).catch(...)`: `handleProtocol` is not
 * `async`, and its `launch` arm returns `handleLaunch`'s promise un-awaited (`protocol.ts:56`)
 * — an unwrapped call would leave a floating rejection. The whole body is wrapped in
 * try/catch so a synchronous throw can never fail boot (T-34.5-G3-02, matching the two
 * existing boot-time diagnostic blocks above at `:161`/`:203`).
 *
 * `argv` defaults to `process.argv` but is injectable, so a test can drive this PRODUCTION
 * function with a synthetic argv instead of reconstructing the call site
 * (`test-must-exercise-production-call-shape`).
 */
// Consumed by src/backend/sidecar/__tests__/bootstrapWirings.test.ts via
// `const { init, deliverStartupProtocolUrl } = require('../bootstrap')`
// (line ~253), then actually CALLED. `require()`'s return type is `any`, so
// this reference is invisible to ts-prune despite both files being in
// tsconfig `include`.
// ts-prune-ignore-next
export function deliverStartupProtocolUrl(
  argv: string[] = process.argv
): boolean {
  const hasProtocolUrl = argv.some((arg) => arg.startsWith('gamelib://'))
  if (!hasProtocolUrl) return false

  try {
    logInfo('[bootstrap] startup protocol URL present', LogPrefix.Backend)
    void Promise.resolve(handleProtocol(argv)).catch((error) => {
      logError(
        `[bootstrap] deliverStartupProtocolUrl: handleProtocol rejected: ${error}`,
        LogPrefix.Backend
      )
    })
  } catch (error) {
    logError(
      `[bootstrap] deliverStartupProtocolUrl threw synchronously: ${error}`,
      LogPrefix.Backend
    )
  }
  return true
}

/**
 * Registers the `handleProtocolUrl` invoke channel — the sidecar-side entry point the Rust
 * shell's single-instance accept loop calls to deliver a WARM (already-running) deep link
 * (Phase 34.5 gap cycle 6 plan 44, D-44-A). Guarded by `protocolUrlHandlerRegistered`,
 * mirroring this file's other five idempotency guards immediately above.
 *
 * Rejects anything that is not a `string` beginning `gamelib://` by THROWING —
 * `new Error('handleProtocolUrl: rejected a non-gamelib argument')`, deliberately never
 * echoing the rejected value in the message (T-34.5-G6-25: the Rust accept loop that calls
 * this channel logs only the reason and byte count, never the payload, and this handler must
 * not undo that). A thrown handler produces an `ok:false` response frame back to the Rust
 * accept loop, which logs `ok`/`err` only.
 *
 * On acceptance, calls `handleProtocol` the same wrapped way `deliverStartupProtocolUrl` does
 * above, and returns `true` IMMEDIATELY — without awaiting the launch. This is load-bearing:
 * `handleProtocolUrl` is deliberately absent from `LONG_RUNNING_CHANNELS`
 * (`src-tauri/src/main.rs`'s `handle_protocol_url_channel_is_bounded_at_invoke_timeout` test,
 * Task 1), so a handler that awaited `handleLaunch` would block the shell's accept thread
 * until `INVOKE_TIMEOUT` (60s) fired mid-game.
 */
// Not exported: no file imports `registerProtocolUrlHandler` from this
// module -- the only outside references
// (src/backend/sidecar/__tests__/bootstrapWirings.test.ts) are source-text
// checks (`initBody.toContain('registerProtocolUrlHandler()')`), a call-site
// string match indifferent to the `export` keyword. Called internally by
// `init()` below.
function registerProtocolUrlHandler(): void {
  if (protocolUrlHandlerRegistered) return
  protocolUrlHandlerRegistered = true
  electronStub.ipcMain.handle(
    'handleProtocolUrl',
    (_event: unknown, url?: unknown) => {
      if (typeof url !== 'string' || !url.startsWith('gamelib://')) {
        throw new Error('handleProtocolUrl: rejected a non-gamelib argument')
      }
      void Promise.resolve(handleProtocol([url])).catch((error) => {
        logError(
          `[bootstrap] registerProtocolUrlHandler: handleProtocol rejected: ${error}`,
          LogPrefix.Backend
        )
      })
      return true
    }
  )
}

/**
 * Clears a stranded GOG playtime-sync `lock` sentinel at sidecar boot (finding A1 LEG 2,
 * quick-260907-odi).
 *
 * `syncQueuedPlaytime()` (`gog/library.ts:169`) guards its critical section with
 * `playtimeSyncQueue.has('lock')`. The deleted Electron `main.ts:469` cleared this key at every
 * boot (`playtimeSyncQueue.delete('lock')`); that line has no successor in the Tauri sidecar.
 * This is the process-death half of a two-leg fix: its companion is the `try/finally` added to
 * `syncQueuedPlaytime()` itself, which releases the lock on an in-process throw but cannot
 * survive SIGKILL, a crash, or a power loss -- `finally` never runs if the process dies mid-sync.
 * This function is the only thing that can recover from THAT case, and it only runs at boot.
 *
 * The lock never ages out on its own: `playtimeSyncQueue` is a file-backed `CacheStore`
 * (`gog/electronStores.ts:42`) that survives restarts, and `CacheStore` evaluates its
 * lifespan/expiry only inside `get()` (`cache.ts:64-88`) -- `has()` (`cache.ts:142`) is a raw
 * `current_store.has(key)` passthrough with no expiry check, and nothing else ever calls
 * `get('lock')` for this key.
 *
 * Checks `has('lock')` first and returns silently if absent -- a normal boot must log nothing
 * here. Only the clearing path logs, at `logWarning` (not `logInfo`): a stranded lock means a
 * previous sync died mid-flight, which is an anomaly worth surfacing, matching this file's
 * existing reservation of `logWarning` for its other abnormal boot paths. Wrapped in try/catch
 * per this file's standing rule that a boot-time block must never fail boot.
 */
export function clearStrandedPlaytimeSyncLock(): void {
  try {
    if (!playtimeSyncQueue.has('lock')) {
      return
    }
    playtimeSyncQueue.delete('lock')
    logWarning(
      '[bootstrap] Cleared a stranded GOG playtime sync lock left by an interrupted sync',
      LogPrefix.Backend
    )
  } catch (error) {
    logWarning(
      `[bootstrap] clearStrandedPlaytimeSyncLock() failed: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

/**
 * Restores the boot-time Epic/GOG user reconciliation deleted with `src/backend/main.ts` in
 * commit `5643c7583` ("feat(35-14)!: delete the Electron entry points") (todo 2026-09-06,
 * quick-260908-fre). The deleted source, `main.ts:442-457`, ran inside `app.whenReady()`:
 *
 *     runOnceWhenOnline(async () => {
 *       if (!LegendaryUser.isLoggedIn()) {
 *         logInfo('User Not Found, removing it from Store', { prefix: ..., forceLog: true })
 *         configStore.delete('userInfo')
 *       }
 *       if (GOGUser.isLoggedIn()) GOGUser.getUserDetails()
 *     })
 *
 * Honesty note (established fact 4): `LegendaryUser.getUserInfo()` (`legendary/user.ts:679-681`)
 * already does `configStore.delete('userInfo')` lazily, whenever something calls it while
 * logged out. This function restores the EAGER boot-time leg only — it is a second, earlier
 * trigger for the same delete, not the sole reconciliation mechanism.
 *
 * The callback passed to `runOnceWhenOnline` is deliberately SYNCHRONOUS (`() => {...}`), unlike
 * the deleted `main.ts` version's `async` callback, which was never `await`ed for anything and
 * gained nothing from being `async`. A sync callback makes the floated `getUserDetails()`
 * promise and its `.catch` below syntactically obvious, instead of hiding a floated call behind
 * an unawaited `async` function body.
 *
 * TWO try/catch layers, not one — this is the subtle part. `runOnceWhenOnline` either invokes
 * the callback immediately (if already online) or defers it to
 * `connectivityEmitter.once('online', ...)` (if offline), so when offline the callback body runs
 * on a LATER turn, outside the stack frame of any `try` wrapping the `runOnceWhenOnline(...)`
 * call itself. An outer `try { runOnceWhenOnline(cb) } catch {}` therefore protects only the
 * registration, never the deferred work. Both `LegendaryUser.isLoggedIn()` (an `existsSync`) and
 * `configStore.delete()` can throw, so the callback body gets its OWN inner try/catch too. This
 * repo's standing rule is that a boot-time block must never fail boot — here that costs two
 * guards, not one. Do not "simplify" this back down to one.
 *
 * `GOGUser.getUserDetails()`'s promise gets an explicit `.catch`: `runOnceWhenOnline`'s callback
 * return value is discarded, so an unhandled rejection would otherwise surface only via
 * `processGuards`' process-wide net. Relying on that net for a known-floatable promise is exactly
 * what `deliverStartupProtocolUrl` and the migrations block above already refuse to do in this
 * file. `getUserDetails()` does `await axios.get(...).catch(...)` internally but can still reject
 * earlier — `getCredentials()` (`gog/user.ts:303`) spawns a `gogdl auth` subprocess.
 *
 * The ported `logInfo` line is deliberately VERBATIM, including `forceLog: true`, and does NOT
 * carry this file's local `[bootstrap] ` message-prefix convention: the literal
 * `'User Not Found, removing it from Store'` is the exact string the todo's bundle-level evidence
 * greps for, and it is the receipt that proves this port shipped. Prefixing it would silently
 * invalidate that evidence. The two catch-arm diagnostics below are new lines, so they DO follow
 * the local `[bootstrap] ` convention.
 */
export function reconcileStoreUsersWhenOnline(): void {
  try {
    runOnceWhenOnline(() => {
      try {
        if (!LegendaryUser.isLoggedIn()) {
          // Verbatim, unprefixed — see the doc comment above (D5).
          logInfo('User Not Found, removing it from Store', {
            prefix: LogPrefix.Backend,
            forceLog: true
          })
          configStore.delete('userInfo')
        }
        if (GOGUser.isLoggedIn()) {
          GOGUser.getUserDetails().catch((error: unknown) => {
            logWarning(
              `[bootstrap] reconcileStoreUsersWhenOnline: GOGUser.getUserDetails() failed: ${String(error)}`,
              LogPrefix.Backend
            )
          })
        }
      } catch (error) {
        logWarning(
          `[bootstrap] reconcileStoreUsersWhenOnline: callback failed: ${String(error)}`,
          LogPrefix.Backend
        )
      }
    })
  } catch (error) {
    logWarning(
      `[bootstrap] reconcileStoreUsersWhenOnline: could not be started: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

/**
 * Restores the boot-time GOG queued-playtime drain deleted with `src/backend/main.ts` in commit
 * `5643c7583` ("feat(35-14)!: delete the Electron entry points") (todo 2026-09-06,
 * quick-260908-wk0). The deleted source, `main.ts:470-476`, ran inside `app.whenReady()`,
 * immediately after the `playtimeSyncQueue.delete('lock')` line Block D above already ported:
 *
 *     // Make sure lock is not present when starting up
 *     playtimeSyncQueue.delete('lock')
 *     if (!settings.disablePlaytimeSync) {
 *       runOnceWhenOnline(() => libraryManagerMap['gog'].syncQueuedPlaytime())
 *     } else {
 *       logDebug('Skipping playtime sync queue upload - playtime sync disabled', {
 *         prefix: LogPrefix.Backend
 *       })
 *     }
 *
 * LOAD-BEARING ORDERING (D2): Block D already cleared a lock stranded by process death.
 * `syncQueuedPlaytime()`'s FIRST statement is `if (playtimeSyncQueue.has('lock')) return`
 * (`gog/library.ts`). Calling this helper before Block D's clear has run would let a stale lock
 * silently no-op the very drain this block adds -- restoring the call site while leaving the bug
 * unfixed for exactly the users whose previous sync died mid-flight, i.e. the ones with a
 * non-empty queue. THIS IS THE SINGLE MOST IMPORTANT SENTENCE IN THIS FILE'S BLOCK G. The call
 * site below is therefore placed after Block D (and Block E, appended as Block G), never before.
 *
 * THREE GUARDS, not one (D4). `runOnceWhenOnline` either invokes its callback immediately (if
 * already online) or defers it to `connectivityEmitter.once('online', ...)` (if offline) --
 * `online_monitor.ts:136-142`. In the deferred case the callback body runs on a LATER turn,
 * outside the stack frame of any `try` wrapping the `runOnceWhenOnline(...)` call itself, so an
 * outer `try { runOnceWhenOnline(cb) } catch {}` covers only the REGISTRATION, never the deferred
 * body -- hence the inner `try/catch` around the callback. And `syncQueuedPlaytime()` CAN reject:
 * its `try/finally` (finding A1 LEG 1, `gog/library.ts`) deliberately re-throws rather than
 * swallowing -- the `finally` only releases the lock -- and `postPlaytimeSession` does network
 * I/O. `runOnceWhenOnline`'s callback return value is discarded, so a floated
 * `syncQueuedPlaytime()` promise needs its OWN explicit `.catch`, or the rejection would surface
 * only via `processGuards`' process-wide net -- exactly what `deliverStartupProtocolUrl` and the
 * migrations block above already refuse to rely on. Do not "simplify" this back down to fewer
 * guards.
 *
 * SETTINGS READ OUTSIDE THE CALLBACK (D5): `GlobalConfig.get().getSettings()` runs synchronously
 * at helper-entry time, before `runOnceWhenOnline` is even called, and the `disablePlaytimeSync`
 * branch returns early. Two reasons: fidelity (the deleted `main.ts` read `settings` at
 * `whenReady()` time, not at online time), and determinism (a user toggling the setting between
 * boot and coming online should not change what a boot-time decision already made). The whole
 * synchronous body sits inside the outer try, so a throwing `getSettings()` cannot fail boot.
 *
 * THE `logDebug` LINE IS VERBATIM AND UNPREFIXED (D6), including its
 * `{ prefix: LogPrefix.Backend }` options-object form. Two reasons, and an honest limit:
 *   1. Block E established the house rule at this exact site: a PORTED log literal keeps its
 *      original form; NEW diagnostic lines added by the port take the local `[bootstrap] `
 *      prefix. This is the second application of that rule.
 *   2. Honesty about what it is NOT: unlike Block E's `'User Not Found, removing it from Store'`,
 *      this string is NOT the todo's own bundle-level evidence -- this todo's evidence is the
 *      *count of `syncQueuedPlaytime()` call sites in `build/main/sidecar.js`* (recorded exactly
 *      one, at `sidecar.js:23753`). So the verbatim decision here rests on the house rule and on
 *      port fidelity, not on protecting a named grep. It is nonetheless a clean, independent
 *      receipt for the DISABLED arm specifically -- that string appears zero times in `src/`
 *      today.
 * The two NEW catch-arm diagnostics below DO take the `[bootstrap] ` prefix and name this
 * function, in the shape of `reconcileStoreUsersWhenOnline`'s catch arms.
 *
 * OUT OF SCOPE AT THE TIME THIS WAS WRITTEN, explicitly (D13): `runOnceWhenOnline(gogPresence.
 * setPresence)` sat on the very next line of the deleted source (`main.ts:477`) and was, at the
 * time this function was ported, a SEPARATE todo that was not yet resolved
 * (`2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md`). That todo was
 * subsequently CLOSED by quick-260909-k5x and ported as **Block H**
 * (`setGogPresenceWhenOnline()`, below `checkRosettaWhenMac()`), with its own independent call
 * site in `init()`. The prohibition this note used to carry -- "do not import `gogPresence` from
 * this function" -- is now stale in its absolute form: the MODULE (this file) imports
 * `gogPresence` at file scope for Block H's use. The surviving, narrower statement is:
 * `syncQueuedPlaytimeWhenOnline()` itself still does not use `gogPresence` and is still not
 * Block H's caller -- the two blocks are independent boot-time side effects with independent
 * call sites in `init()`, and neither reads or writes state the other depends on. Leaving the old
 * absolute wording here would make this comment invert its own file.
 */
export function syncQueuedPlaytimeWhenOnline(): void {
  try {
    const settings = GlobalConfig.get().getSettings()
    if (settings.disablePlaytimeSync) {
      // Verbatim, unprefixed -- see the doc comment above (D6).
      logDebug('Skipping playtime sync queue upload - playtime sync disabled', {
        prefix: LogPrefix.Backend
      })
      return
    }
    runOnceWhenOnline(() => {
      try {
        libraryManagerMap['gog']
          .syncQueuedPlaytime()
          .catch((error: unknown) => {
            logWarning(
              `[bootstrap] syncQueuedPlaytimeWhenOnline: syncQueuedPlaytime() failed: ${String(error)}`,
              LogPrefix.Backend
            )
          })
      } catch (error) {
        logWarning(
          `[bootstrap] syncQueuedPlaytimeWhenOnline: callback failed: ${String(error)}`,
          LogPrefix.Backend
        )
      }
    })
  } catch (error) {
    logWarning(
      `[bootstrap] syncQueuedPlaytimeWhenOnline: could not be started: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

/**
 * Restores the boot-time Rosetta-availability probe deleted with `src/backend/main.ts` in
 * commit `5643c7583` ("feat(35-14)!: delete the Electron entry points") (todo 2026-09-06,
 * quick-260908-k3x). The old caller was `main.ts:241` -- that file no longer exists, so this
 * is a port into the sidecar's own boot path, not a re-wire of an existing call site.
 * `checkRosettaInstall()` itself (`utils.ts:1402`) is untouched: it has no platform guard of
 * its own, so the caller must gate it, which is this function's whole job.
 *
 * FIVE decisions this function's shape encodes:
 *
 * 1. **Why the mac gate lives HERE and not in `checkRosettaInstall()`**: the probe shells
 *    `arch -x86_64 /usr/sbin/sysctl`, which is meaningless off macOS. Gating the caller
 *    instead of the callee leaves `checkRosettaInstall()`'s own test suite
 *    (`checkRosettaInstall.test.ts`) valid and unmodified.
 * 2. **Why floated, not awaited**: `init()` is synchronous by contract -- `src/sidecar/
 *    index.ts` and ~10 test suites call it as such. Same constraint the `applyMigrations()`
 *    comment above records.
 * 3. **Why chained off `i18nReady` rather than relying on statement order**: the dialog's
 *    title/message come from `i18next.t()`, and `i18next.use(Backend).init()` is
 *    asynchronous (installed i18next is 22.5.1; `i18next-fs-backend` reads catalogs off
 *    disk). Statement order alone would only guarantee `i18next.init()` had been *called*,
 *    not that the catalog had *loaded* -- so a non-English user would get the inline English
 *    defaults baked into `checkRosettaInstall()`'s `t()` calls. Chaining makes the ordering
 *    exact rather than probable.
 * 4. **Why it cannot fail boot**: `dialog.showMessageBox` is a total method under the sidecar
 *    (never rejects -- `platform/index.ts`), the chained promise is `.catch()`-guarded, and
 *    the whole synchronous body is wrapped in try/catch too.
 * 5. **`icon: windowIcon`** (inside `checkRosettaInstall()`) is inert under the Rust dialog
 *    forward, which passes only `message`/`title`/`kind`/`buttons` -- named here so a reader
 *    does not go looking for a missing icon.
 */
export function checkRosettaWhenMac(): void {
  if (!isMac) return
  try {
    i18nReady
      .then(() => checkRosettaInstall())
      .catch((error: unknown) => {
        logWarning(
          `[bootstrap] checkRosettaInstall() failed: ${String(error)}`,
          LogPrefix.Backend
        )
      })
  } catch (error) {
    logWarning(
      `[bootstrap] checkRosettaWhenMac() could not be started: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

/**
 * Restores the boot-time GOG presence call deleted with `src/backend/main.ts` in commit
 * `5643c7583` ("feat(35-14)!: delete the Electron entry points") (todo
 * 2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md, quick-260909-k5x).
 * The deleted source, `main.ts:477`, was the line immediately after Block G's ported call
 * (`main.ts:470-476`) and read, in full:
 *
 *     runOnceWhenOnline(gogPresence.setPresence)
 *
 * KEEP-ALIVE NOTE: `presence.ts`'s module-scope `interval` is `undefined` at process start, and
 * `setPresence()` arms its own 5-minute `setInterval` the first time it runs past its early
 * return (`if (!interval) { interval = setInterval(setPresence, 5 * 60 * 1000) }`). So this one
 * boot-time call is what arms the keep-alive too -- Block H closes BOTH halves of the todo's
 * title, not just "presence is set at boot".
 *
 * D-K5X-01 -- PLACEMENT/ORDERING: Block H has NO ordering constraint of its own beyond the
 * generic three every boot-time block in this file already satisfies:
 *   1. after `initLogger()` -- the helper logs, and `heroicLogWriter` is unset before that
 *      (standing `sidecar-console-and-logger-are-invisible` finding);
 *   2. after `initOnlineMonitor()` -- it calls `runOnceWhenOnline`, the same requirement
 *      Blocks B/E/G already record;
 *   3. before the `READY_SENTINEL` write -- so presence is at least queued before the frontend
 *      can drive any RPC, without delaying READY itself.
 * Each candidate load-bearing dependency was checked and REFUTED, individually:
 *   - *Not* dependent on Block D (`playtimeSyncQueue.delete('lock')`). `setPresence` never reads
 *     `playtimeSyncQueue`. Block G's load-bearing constraint is specific to
 *     `syncQueuedPlaytime()`'s `if (playtimeSyncQueue.has('lock')) return` first statement;
 *     Block H has no analogue.
 *   - *Not* dependent on Block E (`reconcileStoreUsersWhenOnline`). Block E's
 *     `configStore.delete('userInfo')` arm is Epic-scoped and gated on
 *     `!LegendaryUser.isLoggedIn()`; its GOG arm only calls `GOGUser.getUserDetails()` when
 *     ALREADY logged in, which cannot change what `GOGUser.isLoggedIn()` returns. `setPresence`
 *     calls `GOGUser.getCredentials()` itself and refreshes on its own.
 *   - *Not* dependent on Block F (`i18nReady`). Block H paints no dialog and reads no catalog.
 *   - *Not* dependent on Block G. Both blocks read `disablePlaytimeSync`, but neither writes it
 *     and neither shares state with the other.
 * So: the only constraints are the generic three. Appending after Block G satisfies all three
 * and leaves the existing A->B->C->D->E->F->G sequence byte-identical.
 *
 * One HONEST, non-load-bearing note: when the process boots offline, Blocks E, G and H each
 * register a `connectivityEmitter.once('online', ...)` listener, so their callbacks fire in
 * registration order (E, then G, then H). That ordering is deterministic and observable, but
 * nothing depends on it -- it is not dressed up as a constraint here.
 *
 * D-K5X-02 -- NO SETTINGS HOIST, deliberately DIFFERENT from Block G's D5. Block G hoisted
 * `GlobalConfig.get().getSettings()` to helper entry because the deleted source ITSELF read
 * `settings` at `whenReady()` time (`main.ts:470-476`'s `if (!settings.disablePlaytimeSync)`
 * wrapper). Block H's deleted source had NO such wrapper -- `main.ts:477` was a bare
 * `runOnceWhenOnline(gogPresence.setPresence)` with zero settings access at the call site.
 * Reproducing that exactly means the gate stays exactly where the deleted source left it: inside
 * `setPresence`, evaluated at ONLINE time, not at helper-entry time. Two consequences, neither an
 * "improvement" to make:
 *   - There is NO skip-log arm here. Block G's verbatim `logDebug` receipt has no counterpart in
 *     the deleted presence source; inventing one would be a new log line masquerading as a port.
 *   - A user who toggles `disableGOGPresence` between boot and coming online SHOULD see the new
 *     value honoured. That is not a determinism regression relative to Block G -- it is the
 *     deleted source's own behaviour, and `presence.ts`'s module-scope `settingChanged` listener
 *     already makes live toggling the documented model for this specific flag.
 *
 * THREE GUARD LAYERS, same shape as Blocks E/G, and an honest limit on what they guard against:
 * `setPresence()` today wraps its ENTIRE body in its own `try/catch` and logs+swallows
 * (`presence.ts`), so it CANNOT reject as currently written -- the inner guards below are
 * UNREACHABLE against the current implementation. They are defence-in-depth for the call site,
 * the same shape Blocks E and G established, and insurance against a future `presence.ts`
 * refactor that lets a rejection out. Do NOT claim `setPresence` can reject today -- that would
 * be a false rationale, worse than a missing one. What IS structurally necessary regardless of
 * `setPresence`'s current implementation is the standing `runOnceWhenOnline` argument Block G's
 * header already records: when offline, the callback body runs on a LATER turn, outside the
 * stack frame of any `try` wrapping the `runOnceWhenOnline(...)` call, so the outer
 * `try { runOnceWhenOnline(cb) } catch {}` covers only REGISTRATION, never the deferred body --
 * hence the inner `try/catch` around the callback.
 *
 * There is no ported log literal in this block (unlike Block E/G's D6-shaped verbatim strings),
 * so the verbatim-log house rule does not apply here -- do not go looking for a verbatim string
 * that was never in the deleted source. The two new catch-arm diagnostics below take this file's
 * local `[bootstrap] ` prefix and name `setGogPresenceWhenOnline`, in the shape of
 * `reconcileStoreUsersWhenOnline`'s and `syncQueuedPlaytimeWhenOnline`'s own catch arms.
 *
 * LOAD-BEARING CALL SHAPE: `gogPresence.setPresence()` is called as a property access on the
 * default-export object, resolved at CALL time -- not destructured
 * (`const { setPresence } = gogPresence`), and not passed as the bare reference
 * `runOnceWhenOnline(gogPresence.setPresence)` the deleted source used. Two reasons: (i) the
 * arrow-function wrapper is what makes the inner try/catch and the explicit `.catch` possible at
 * all -- Block E made the same sync-arrow deviation from its deleted `async` callback for the
 * same reason; (ii) a `jest.spyOn(gogPresence, 'setPresence')` can only intercept a call-time
 * property access, so a destructured binding would make the wiring proof (this suite:
 * `gogPresenceBootWire.test.ts`) silently measure nothing.
 *
 * OUT OF SCOPE, filed separately: `deletePresence()` calls `clearInterval(interval)` but never
 * resets `interval` to `undefined`, so after any `deletePresence()` the `if (!interval)` guard in
 * `setPresence()` stays falsy-blocked and the keep-alive cannot re-arm within the same process.
 * That is a REAL, SEPARATE defect, filed as
 * `2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md` and
 * deliberately NOT fixed here to keep this task atomic. `presence.ts` is untouched by Block H.
 */
export function setGogPresenceWhenOnline(): void {
  try {
    runOnceWhenOnline(() => {
      try {
        gogPresence.setPresence().catch((error: unknown) => {
          logWarning(
            `[bootstrap] setGogPresenceWhenOnline: gogPresence.setPresence() failed: ${String(error)}`,
            LogPrefix.Backend
          )
        })
      } catch (error) {
        logWarning(
          `[bootstrap] setGogPresenceWhenOnline: callback failed: ${String(error)}`,
          LogPrefix.Backend
        )
      }
    })
  } catch (error) {
    logWarning(
      `[bootstrap] setGogPresenceWhenOnline: could not be started: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

export function init(
  input: Readable = process.stdin,
  output: Writable = process.stdout
): void {
  // Idempotent — bootstrap.test.ts / skeletonFlows.test.ts each call this
  // function multiple times per file (fresh streams per test); production
  // calls it once per process, same as the Electron main process's own
  // single `init()`/`initHeadless()` startup call.
  if (!loggerInitialized) {
    initLogger()
    loggerInitialized = true
    // WR-04 (gap cycle 1): `processGuards.ts` has ZERO static imports so that
    // `src/sidecar/index.ts` can install the unhandledRejection guard as its FIRST
    // import, ahead of this module's own graph (and therefore ahead of
    // `installElectronHook`). The price of that is a logger it cannot import, so the
    // sink is bound here instead -- the first moment `heroicLogWriter` exists. Before
    // this line the guard writes to stderr, which is the only safe channel that early
    // anyway. Adding an import of `logWarning` to `processGuards.ts` instead would
    // reintroduce the boot failure recorded in `727be5dbb`.
    setUnhandledRejectionLogSink((message) =>
      logWarning(message, LogPrefix.Backend)
    )
    // D-35-10-01: the `uncaughtException` sibling guard, bound in the same window and
    // for the same WR-04 reason. `logError`, NOT `logWarning` -- this preserves the
    // severity of the Electron handler at `main.ts:618` that plan 35-14 deletes
    // (`logError(err, LogPrefix.Backend)`). A shared sink would have demoted every
    // uncaught exception to a warning. Before this line the guard writes to stderr.
    setUncaughtExceptionLogSink((message) =>
      logError(message, LogPrefix.Backend)
    )
  }

  // ---- Data migrations (todo 2026-08-16, quick task 260822-s8y) -----------
  // Mirrors `main.ts:412`'s `await MigrationSystem.get().applyMigrations()`, which the headless
  // sidecar never runs -- the same class of gap as `initOnlineMonitor()` below.
  //
  // Placement: FIRST after `initLogger()`, matching Electron's ordering (migrations are the
  // very next statement after its own `initLogger()`), and required to be after it because
  // `applyMigration` calls `logInfo`/`logError` unconditionally and `heroicLogWriter` is unset
  // until `initLogger()` runs (the standing sidecar-logger finding).
  //
  // WHAT THIS DELIBERATELY DOES NOT REPRODUCE, and why. Electron AWAITS migrations before
  // `initStoreManagers()`. The sidecar cannot: `./handlers` (Step 2, above) is imported at
  // MODULE SCOPE, long before `init()` is ever called, so every store manager already exists by
  // the time this line runs -- and `initStoreManagers()` is itself dead under Tauri. `init()` is
  // also synchronous by contract (`src/sidecar/index.ts` and ~10 test suites call it as such),
  // so the promise is floated the way `fetchLastestReleases()` below is.
  //
  // The real constraint is narrower than Electron's: migrations must finish before the FIRST
  // read of `legendaryConfigPath`, which arrives as an RPC call after the READY_SENTINEL write
  // below. READY is deliberately NOT delayed on this promise. That is a known, bounded
  // limitation rather than a proof of safety: `LegendaryGlobalConfigFolderMigration` only does
  // any work when `legendaryConfigPath` is ABSENT -- i.e. the user has never logged into Epic in
  // GameLib -- so a read that loses the race finds nothing, which is precisely today's
  // behaviour, and the copy is local filesystem I/O begun milliseconds into boot. A migration
  // that ever needs a hard happens-before guarantee against a handler will need `init()` to
  // become async; do not assume this placement covers that case.
  if (!migrationsInitialized) {
    migrationsInitialized = true
    try {
      MigrationSystem.get()
        .applyMigrations()
        .catch((error: unknown) => {
          logWarning(
            `[bootstrap] applyMigrations() failed: ${String(error)}`,
            LogPrefix.Backend
          )
        })
    } catch (error) {
      logWarning(
        `[bootstrap] applyMigrations() could not be started: ${error}`,
        LogPrefix.Backend
      )
    }
  }

  // ---- Boot-time receipt logging (Phase 34.5 G-3, plan 34.5-18) -----------
  // Logs the GAMELIB_SHELL_EXE value the SIDECAR ACTUALLY RECEIVED, not what the Rust shell's
  // own `eprintln!` at main.rs:1231 CLAIMS it sent (that line only ever reaches the shell
  // process's own stderr -- the `pnpm tauri:dev` terminal -- never `gamelib.log`). The child's
  // own observation is strictly stronger evidence: it proves what pathShim can actually see,
  // not merely what the parent set on the spawn call. `34.5-LIVE-GATE.md` precondition 5 cites
  // this exact prefix (`GAMELIB_SHELL_EXE received=`) as its evidence source -- the gate's
  // re-run reads it from here, not the terminal.
  //
  // Reads `process.env.GAMELIB_SHELL_EXE` directly rather than `pathShim.getPath('exe')`,
  // which THROWS on an unset/empty value (T-34.5-01) -- this diagnostic must report an unset
  // value, never crash boot trying to report it. Placement (after `initLogger()` above, before
  // `output.write(READY_SENTINEL)` below) is load-bearing per the standing
  // `sidecar-console-and-logger-are-invisible` finding: anything logged before `initLogger()`
  // throws into a swallowed rejection, and the sidecar's stdout IS the RPC pipe, so `console.*`
  // is invisible too. Wrapped in try/catch -- a diagnostic must never fail boot (T-34.5-G3-02).
  try {
    const shellExeReceived = process.env.GAMELIB_SHELL_EXE
    if (shellExeReceived) {
      logInfo(
        `[bootstrap] GAMELIB_SHELL_EXE received=${shellExeReceived}`,
        LogPrefix.Backend
      )
    } else {
      logWarning(
        '[bootstrap] GAMELIB_SHELL_EXE received=<UNSET>',
        LogPrefix.Backend
      )
    }
  } catch (error) {
    logWarning(
      `[bootstrap] Failed to log GAMELIB_SHELL_EXE receipt: ${error}`,
      LogPrefix.Backend
    )
  }

  // ---- Boot-time asset-root self-check (Phase 34.5 G-1/G-3, plan 34.5-18) -------------------
  // Makes plan 34.5-16's GAMELIB_APP_ROOT handoff observable at the exact boot moment, before
  // any login can be attempted: on 2026-08-01 the `spawn ./{legendary,gogdl,nile} ENOENT` lines
  // fired at 00:06:26, six seconds before the first login interaction at 00:06:32
  // (`34.5-LIVE-GATE.md`'s "Root cause" section) -- this diagnosis must be present by then, so
  // it runs directly after the receipt log above and before the i18next block below (the first
  // other startup diagnostic, and cannot be outrun by a login attempt).
  //
  // This is the FOURTH recurrence of the `publicdir-getapppath-chunking` family. The `locales`
  // existsSync warning immediately below (D-02) already half-knew this in 2026 -- it added a
  // loud existsSync check for ONE publicDir-relative consumer and never generalised the
  // implication to every other one (`bin/`, the most costly). This block is that
  // generalisation, named here so a future reader sees the lesson at the exact site where it
  // was previously missed.
  //
  // Deliberately does NOT import `archSpecificBinary` (private to `utils.ts`) -- widening that
  // module's public surface just for a diagnostic costs more than duplicating its four-line
  // join here, and `appRootResolution.test.ts`'s real-filesystem block is what keeps the two
  // resolutions honest (it fails if they diverge). Under the packaged Tauri build this check is
  // EXPECTED to report `exists=false` until residual R-34.5-G1-PKG (`34.5-16-SUMMARY.md`) is
  // resolved -- that is the point of this check: loud, not silent. Wrapped in try/catch -- a
  // diagnostic must never fail boot (T-34.5-G3-02).
  try {
    const appRootEnv = process.env.GAMELIB_APP_ROOT
    const appRootSource = appRootEnv ? 'GAMELIB_APP_ROOT' : 'process.cwd'
    logInfo(
      `[bootstrap] appRoot resolved=${electronStub.app.getAppPath()} source=${appRootSource}`,
      LogPrefix.Backend
    )

    const publicDirExists = existsSync(publicDir)
    logInfo(
      `[bootstrap] publicDir resolved=${publicDir} exists=${publicDirExists}`,
      LogPrefix.Backend
    )

    let assetMissing = !publicDirExists
    for (const runnerBinaryName of ['legendary', 'gogdl', 'nile', 'comet']) {
      // Mirrors archSpecificBinary's own arch-native-first, x64-fallback resolution
      // (utils.ts:517-527) without importing it -- see comment above.
      const archNativePath = join(
        publicDir,
        'bin',
        process.arch,
        process.platform,
        runnerBinaryName
      )
      const x64FallbackPath = join(
        publicDir,
        'bin',
        'x64',
        process.platform,
        runnerBinaryName
      )
      const resolvedRunnerPath = existsSync(archNativePath)
        ? archNativePath
        : x64FallbackPath
      const runnerExists = existsSync(resolvedRunnerPath)
      if (!runnerExists) assetMissing = true
      logInfo(
        `[bootstrap] runner binary ${runnerBinaryName} path=${resolvedRunnerPath} exists=${runnerExists}`,
        LogPrefix.Backend
      )
    }

    if (assetMissing) {
      logError(
        `[bootstrap] SIDECAR ASSET ROOT DEFECT -- resolved publicDir "${publicDir}" is missing required assets; see 34.5-APP-ROOT-SWEEP.md for the full consumer sweep`,
        LogPrefix.Backend
      )
    }
  } catch (error) {
    logWarning(
      `[bootstrap] Asset-root self-check failed: ${error}`,
      LogPrefix.Backend
    )
  }

  // i18next initialization (D-02): mirrors main.ts:460-472's
  // `i18next.use(Backend).init({...})` call -- the ONLY i18next.init() call site in the
  // whole backend, which only ever runs inside Electron's `app.whenReady()` and therefore
  // never executes under the headless sidecar. Without it, `i18next.t()` returns
  // `undefined` for every one of the 103 backend `t()` call sites reachable from the
  // sidecar (verified against installed i18next 22.5.1 -- it does not throw and there is
  // no rescuing inline English default).
  //
  // Placement is load-bearing: must run AFTER `initLogger()` above -- `GlobalConfig.get()`
  // below is this process's first-ever `GlobalConfig` read, and the config-version-upgrade
  // path (config.ts:145/152) can itself call `logInfo`/`logError` synchronously, which
  // throws while `heroicLogWriter` is unset (same ordering reason as
  // `initOnlineMonitor()`'s and `installTokenStore()`'s placement comments below).
  if (!i18nInitialized) {
    i18nInitialized = true
    try {
      const settings = GlobalConfig.get().getSettings()
      const localesDir = join(publicDir, 'locales')
      // Loud-not-silent locale resolution (publicdir-getapppath-chunking gotcha family):
      // under the sidecar, electronStub's `app.getAppPath()` resolves to `process.cwd()`,
      // not a packaged asar root -- so the packaged-build half of this path cannot be
      // proven by jest and is a named deferred-UAT item. If the resolved directory is
      // absent, warn loudly naming the resolved path rather than silently falling back --
      // i18next's own `fallbackLng`/key-return behavior below is still strictly better than
      // the current permanent `undefined`.
      //
      // Phase 34.5 plan 34.5-18 (G-3): this check was, for a long time, the ONLY member of
      // this family in the codebase -- and it stopped short. The implication ("publicDir can
      // be wrong under the sidecar") was known here but never generalised past `locales/` to
      // every other publicDir-relative consumer, most costly `bin/` (the runner binaries) --
      // that gap cost live-gate items 1/2/3 (`spawn ./{legendary,gogdl,nile} ENOENT`,
      // `34.5-LIVE-GATE.md`'s "Root cause" section, the fourth recurrence of this family). The
      // boot-time asset-root self-check above generalises this exact pattern to `publicDir`
      // itself and every bundled runner binary, run earlier in `init()` than this block so it
      // cannot be outrun by a login attempt.
      if (!existsSync(localesDir)) {
        logWarning(
          `[bootstrap] i18next locales directory not found at "${localesDir}" -- backend-side translated strings will fall back to their keys`,
          LogPrefix.Backend
        )
      }
      // Assigned to `i18nReady` (Block F, quick-260908-k3x) -- see that variable's own
      // declaration comment for why the CAUGHT promise, not the raw one, is what's held.
      i18nReady = i18next
        .use(Backend)
        .init({
          backend: {
            // quick-260925-bq4: `addPath` used to sit here as
            // join(publicDir,'locales','{{lng}}','{{ns}}'). Nothing in this init
            // sets `saveMissing`, so it was never reached -- and once `{{lng}}`
            // became a BCP-47 tag it would have pointed at a `pt-BR` directory
            // that does not exist. Removed rather than "fixed", for the same
            // reason quick task 260901-b8z removed the renderer's copy: a dead
            // option pointing at a plausible-looking path is a trap.
            allowMultiLoading: false,
            // A function, not '{{lng}}': the resolved code is now the BCP-47 tag
            // while the directory keeps its shipped name. NOTE the signature --
            // i18next-fs-backend 2.6.0 calls loadPath with SCALARS
            // (`loadPath(language, namespace)`, :52-53), whereas
            // i18next-http-backend in the renderer passes ARRAYS. The two call
            // sites are deliberately not identical.
            loadPath: (language: string, namespace: string) =>
              join(
                publicDir,
                'locales',
                toShippedLanguage(language),
                `${namespace}.json`
              )
          },
          debug: false,
          returnEmptyString: false,
          returnNull: false,
          fallbackLng: 'en',
          // `lng` + `supportedLngs` as one unit (quick-260925-bq4) -- see
          // i18nextLanguageOptions' header for why they must stay in step.
          ...i18nextLanguageOptions(settings.language),
          // Plan 34.6-19 (REQ-34.6-05, T-34.6-51): fork strings live in their
          // own `gamelib` namespace (public/locales/{{lng}}/gamelib.json),
          // upstream Heroic strings stay in `translation`.
          //
          // The `supportedLngs` list above is shared with the renderer's own
          // i18next init (`src/frontend/index.tsx`) via `common/languages` --
          // that divergence risk is closed structurally, not by convention.
          // quick-260925-bq4 tightened this further: `lng` and `supportedLngs`
          // now arrive together from `i18nextLanguageOptions()`, so the two
          // inits cannot drift on either half independently, and
          // `languages.realI18next.test.ts` exercises that same function rather
          // than a hand-rolled copy of these options.
          //
          // The `ns`/`defaultNS` pair below is NOT mirrored in the renderer,
          // and that is correct, not a gap: `src/frontend/index.tsx`'s init
          // sets no `ns`/`defaultNS` at all, because the renderer loads the
          // `gamelib` namespace lazily via `useTranslation('gamelib')`
          // (react-i18next's `loadNamespaces`), used at `src/frontend/App.tsx:189`
          // and ~30 further call sites. Do not "fix" this by copying `ns` into
          // the renderer's init.
          ns: ['translation', 'gamelib'],
          defaultNS: 'translation'
        })
        .then(() => undefined)
        .catch((error) => {
          logWarning(
            `[bootstrap] i18next initialization failed: ${error}`,
            LogPrefix.Backend
          )
        })
    } catch (error) {
      logWarning(
        `[bootstrap] Failed to read settings for i18next initialization: ${error}`,
        LogPrefix.Backend
      )
    }
  }
  startRpcServer(input, output)
  // Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09): registered immediately after
  // startRpcServer() and BEFORE the READY_SENTINEL write below, so the shell can never send a
  // handleProtocolUrl frame for an unregistered channel.
  registerProtocolUrlHandler()
  electronStub.bindTransport({
    openExternal: requestOpenExternal,
    pushFrontendMessage
  })
  // Placement is load-bearing (Phase 28, T-28-10): must run AFTER startRpcServer() so
  // requestRustInvoke can write frames, and BEFORE any invoke handler body can run (those
  // only fire from the RPC loop below, never at module-import time) so no handler ever
  // observes the default ElectronTokenStore in the sidecar build. This constraint is inherited
  // UNCHANGED by both arms of the exclusive branch immediately below (34.5 gap cycle 4 plan 36):
  // installDevSecretVault() only performs local file I/O (no RPC), but the keyring arm it
  // replaces on the OTHER side of this branch needs the same live transport
  // installSidecarHumbleSecretStore()'s migration logic does, so the branch as a whole stays
  // below startRpcServer() regardless of which arm a given boot takes.
  //
  // Exclusive, not additive (34.5 gap cycle 4 plan 36, Routing's developer-scoped dev-vault
  // item): calling installDevSecretVault() first and checking its return value BEFORE touching
  // either keyring install is deliberate. Running the vault install alongside or after the
  // keyring installs would leave installSidecarHumbleSecretStore()'s fire-and-forget
  // migrateHumbleSecrets() already dispatched -- a migration that reads the keyring and writes
  // configStore, i.e. precisely the Keychain interaction this branch exists to let a developer
  // avoid -- and would mean a boot that both prompted for Keychain access AND then discarded the
  // result underneath the vault. Exactly one arm below ever runs. The `[bootstrap] secret
  // stores: ` line is the receipt: `34.5-UNTESTED-ITEMS.md`'s `U-34.5-01` row keys its
  // retirement condition directly off this exact string, so a live `gamelib.log` can prove which
  // arm a given gate run actually used. Phase 34.6 plan 02 (`34.6-CONTEXT.md` amendment A-03)
  // extends this same keyring arm with an additional SteamGridDB secret-store install below:
  // without it, the SteamGridDB port landing in plan 34.6-09 would persist the operator's API
  // key in `config.json` in the clear via the sidecar's dead `safeStorage` stub.
  const devSecretVaultInstalled = installDevSecretVault()
  if (devSecretVaultInstalled) {
    logInfo('[bootstrap] secret stores: dev-vault', LogPrefix.Backend)
  } else {
    installTokenStore(new SidecarKeyringTokenStore())
    // Phase 34.4.1 gap-cycle plan 13 (F-1 BLOCKING closure): install the keyring-backed Humble
    // secret store the same way and at the same site as the Steam TokenStore just above. Must
    // run AFTER startRpcServer() for the same reason installTokenStore() does (its migration
    // logic calls requestRustInvoke, which needs a live transport), and harmless to call on
    // every bootstrap.test.ts/*Flows.test.ts init() re-run -- setHumbleSecretStore() just
    // reassigns a registry variable (no accumulating listener, unlike
    // onlineMonitorInitialized's guard above).
    installSidecarHumbleSecretStore()
    // Phase 34.6 plan 02 (A-03): same placement reasoning as installSidecarHumbleSecretStore()
    // just above -- its migration also calls requestRustInvoke, so it must run AFTER
    // startRpcServer() and inside this same keyring arm.
    installSidecarSteamGridDbSecretStore()
    logInfo('[bootstrap] secret stores: keyring', LogPrefix.Backend)
  }
  // Placement is load-bearing (fix/steam-native-install-stability, 33-05 live-gate gap): must
  // run AFTER startRpcServer()/bindTransport() so initOnlineMonitor()'s immediate
  // `sendFrontendMessage('connectivity-changed', ...)` call (inside `setStatus()`) has a live
  // transport to push through, and BEFORE the READY_SENTINEL write below so the frontend's
  // `get-connectivity-status` handler is guaranteed registered before the renderer can possibly
  // ask for it.
  if (!onlineMonitorInitialized) {
    initOnlineMonitor()
    onlineMonitorInitialized = true
  }
  // Block A — re-homed `releasesInfoReady` anticheat listener (D-04). Reproduces
  // `anticheat/ipc_handler.ts:12-19`'s body exactly, including its `logDebug` line.
  // `anticheat/ipc_handler.ts` itself cannot be side-effect-imported from
  // `src/backend/sidecar/`: its module scope calls `addHandler` from `backend/ipc`, which
  // imports the real `electron` (D-04's curated-import discipline, carried from Phase 30
  // D-08 / 34.1 D-09) — so this listener has no other home under the sidecar, and without it
  // D-07's emit below would fire into a void and `getAnticheatInfo` would still structurally
  // be unable to return data. Electron keeps using `anticheat/ipc_handler.ts`'s own copy via
  // `main.ts`'s `import './anticheat/ipc_handler'` — this is an addition for the sidecar
  // only, never a second registration in the same process.
  //
  // Must be registered before Block B's fetch, below, so the listener exists before the
  // event it responds to can possibly fire.
  //
  // CR-02 (34.2-09): the outer `try`/`catch` below covers ONLY the synchronous
  // `backendEvents.on(...)` registration call, which cannot itself throw — it gives ZERO
  // coverage to the listener body, which runs later from the emitter, outside this stack
  // frame. The `.catch()` attached directly to the `downloadAntiCheatData(...)` call is what
  // covers that body: `createMD5`'s `await` inside `downloadAntiCheatData` sits outside its
  // own internal try/catch, so an `EACCES`/`ENOENT`/TOCTOU/is-a-directory fault on the local
  // anticheat cache file would otherwise reject an unguarded promise.
  if (!anticheatListenerRegistered) {
    anticheatListenerRegistered = true
    try {
      backendEvents.on('releasesInfoReady', (releasesInfo) => {
        logDebug(
          'Releases info ready, checking anticheat data',
          LogPrefix.Backend
        )
        downloadAntiCheatData(
          isMac
            ? releasesInfo.anticheatFiles.shaMac
            : releasesInfo.anticheatFiles.shaLinux
        ).catch((error) => {
          logWarning(
            `[bootstrap] downloadAntiCheatData failed: ${String(error)}`,
            LogPrefix.Backend
          )
        })
      })
    } catch (error) {
      logWarning(
        `[bootstrap] Failed to register releasesInfoReady anticheat listener: ${error}`,
        LogPrefix.Backend
      )
    }
  }
  // Block B — fetchLastestReleases() (D-07). Must run AFTER initOnlineMonitor() above,
  // because fetchLastestReleases wraps its work in runOnceWhenOnline, and AFTER Block A so
  // the releasesInfoReady listener exists before the event it responds to can fire. Its own
  // `process.env.CI === 'e2e'` and `isWindows` early-returns are preserved unchanged by
  // calling it as-is — not replicated or bypassed here.
  if (!releasesFetchInitialized) {
    releasesFetchInitialized = true
    try {
      fetchLastestReleases()
    } catch (error) {
      logWarning(
        `[bootstrap] fetchLastestReleases() failed: ${error}`,
        LogPrefix.Backend
      )
    }
  }
  // Block C — the `installed.json` watcher (Phase 35 plan 35-10, REQ-35-16). Ports
  // `main.ts:1036-1048`, an Electron-only module-scope side effect that the sidecar never
  // inherited: plan 35-01's D-17 census found ZERO import edges from the sidecar into
  // `main.ts`, so under Tauri nothing refreshed the in-memory `installedGames` map and
  // `legendary sync-saves` computed save paths against a stale view. See
  // `installedJsonWatcher.ts` for the full mechanism, the debounce rationale and teardown.
  //
  // Placement: after Block B and immediately before READY_SENTINEL, so the existence check runs
  // once the app-data path shim is fully resolved rather than at module load — a fresh profile
  // has no `installed.json` until legendary first writes one, which is exactly what `main.ts`'s
  // own `existsSync` guard is for. Idempotence is owned by the watcher module itself (a second
  // start returns `false`), so this call site deliberately carries no extra flag of its own.
  //
  // JEST GUARD, and it is load-bearing rather than cosmetic. `legendaryInstalled` resolves to
  // the developer's REAL `~/Library/Application Support/gamelib/legendaryConfig/installed.json`
  // in any suite that calls `init()` without a homedir override — and most do not. Opening a
  // real `fs.watch` there leaks a libuv handle into the Jest worker, which then parks in
  // `uv__io_poll` and never exits: measured directly during this plan's mutation testing, where
  // an orphaned watch handle hung the run outright instead of failing it. `JEST_WORKER_ID` is
  // Jest's own zero-config signal (always set in a worker, never set for the real Tauri sidecar
  // process), mirroring `handlers.ts:145`'s existing use of it for the same class of problem —
  // under real Tauri this is unconditionally false and the watcher always arms.
  if (process.env.JEST_WORKER_ID === undefined) {
    try {
      startInstalledJsonWatcher()
    } catch (error) {
      logWarning(
        `[bootstrap] startInstalledJsonWatcher() failed: ${error}`,
        LogPrefix.Backend
      )
    }
  }
  // Block D — boot-time stranded GOG playtime-sync lock clear (finding A1 LEG 2,
  // quick-260907-odi). Placed after `initLogger()` (the helper logs, and `heroicLogWriter` is
  // unset before that — see the standing `sidecar-console-and-logger-are-invisible` finding)
  // and before READY so the lock is already clear by the time any RPC-driven playtime sync can
  // arrive. Mirrors `main.ts`'s ordering intent, where the clear ran during app startup rather
  // than lazily. `clearStrandedPlaytimeSyncLock()` itself never fails boot (see its own header),
  // so no additional try/catch is needed at this call site — matches Blocks A/B's shape, which
  // wrap their own bodies rather than duplicating that at the call site too.
  if (!playtimeLockClearInitialized) {
    playtimeLockClearInitialized = true
    clearStrandedPlaytimeSyncLock()
  }
  // Block E — boot-time Epic/GOG user reconciliation (todo 2026-09-06, quick-260908-fre).
  // Placement (D2): must be after `initLogger()` above (the helper logs, and `heroicLogWriter`
  // is unset before that — the standing `sidecar-console-and-logger-are-invisible` finding);
  // must be after `initOnlineMonitor()` above (it calls `runOnceWhenOnline`, the same
  // requirement Block B's `fetchLastestReleases()` comment already records); and runs before
  // READY so the reconciliation is at least queued before the frontend can issue its first
  // `getUserInfo`-shaped RPC. Appending after Block D satisfies all three while leaving the
  // existing A→B→C→D sequence byte-identical. `reconcileStoreUsersWhenOnline()` itself never
  // fails boot (see its own header), so no additional try/catch is needed at this call site —
  // matches Block D's call site shape, which wraps its own body rather than duplicating that
  // here too.
  if (!storeUserReconcileInitialized) {
    storeUserReconcileInitialized = true
    reconcileStoreUsersWhenOnline()
  }
  // Block F — boot-time Rosetta-availability probe (todo 2026-09-06, quick-260908-k3x).
  // Placement is constrained from both sides:
  //   - Must be AFTER the i18next block above so `i18nReady` holds the real init promise
  //     rather than the `Promise.resolve()` initial value.
  //   - Must be AFTER `startRpcServer(input, output)` and `electronStub.bindTransport(...)`
  //     above, because the dialog reaches the shell via `requestRustInvoke`, which needs a
  //     live write stream -- do not rely on the `i18nReady` await pushing this into a later
  //     macrotask; the placement itself must carry it.
  // Runs before READY_SENTINEL below, but deliberately does NOT delay it: boot is not
  // blocked on a warning dialog (see `checkRosettaWhenMac()`'s own header for why it can
  // never fail boot). The guard flag lives at this call site, matching Blocks A/B/E, not
  // inside `checkRosettaWhenMac()` -- see `rosettaCheckInitialized`'s declaration comment.
  if (!rosettaCheckInitialized) {
    rosettaCheckInitialized = true
    checkRosettaWhenMac()
  }
  // Block G — boot-time GOG queued-playtime drain (todo 2026-09-06, quick-260908-wk0).
  // LOAD-BEARING PLACEMENT, stated first and in full: syncQueuedPlaytime()'s first statement is
  // `if (playtimeSyncQueue.has('lock')) return`, so running this before Block D would let a lock
  // stranded by process death silently no-op the very drain this block adds -- restoring the
  // call site while leaving the bug unfixed for exactly the users whose previous sync died
  // mid-flight. Appending here, after Block F, keeps this AFTER Block D's clear (the load-bearing
  // constraint), AFTER `initLogger()` (the helper logs, and `heroicLogWriter` is unset before
  // that -- the standing `sidecar-console-and-logger-are-invisible` finding), AFTER
  // `initOnlineMonitor()` (it calls `runOnceWhenOnline`, the same requirement Blocks B/E already
  // record), and BEFORE READY_SENTINEL below -- so the drain is at least queued before the
  // frontend can drive any RPC, without delaying READY itself. `syncQueuedPlaytimeWhenOnline()`
  // itself never fails boot (see its own header), so no additional try/catch is needed at this
  // call site -- matches Blocks D/E/F's call site shape.
  if (!playtimeQueueDrainInitialized) {
    playtimeQueueDrainInitialized = true
    syncQueuedPlaytimeWhenOnline()
  }
  // Block H — boot-time GOG presence call (todo 2026-09-06, quick-260909-k5x). Unlike Block G,
  // this block has NO load-bearing ordering constraint of its own -- do not go hunting for one.
  // Only the generic three apply (see `setGogPresenceWhenOnline()`'s own header for the full
  // refutation of Blocks D/E/F/G as candidates): after `initLogger()`, after
  // `initOnlineMonitor()`, and before READY_SENTINEL below. Appending here, after Block G,
  // satisfies all three. `setGogPresenceWhenOnline()` itself never fails boot per its own
  // header, so no additional try/catch is needed at this call site, matching Blocks D/E/F/G.
  if (!gogPresenceInitialized) {
    gogPresenceInitialized = true
    setGogPresenceWhenOnline()
  }
  output.write(`${READY_SENTINEL}\n`)
  // Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09): the LAST statement of init(), deliberately
  // AFTER the READY_SENTINEL write above — so the shell knows the sidecar is up before any
  // launch begins, and so every store manager imported by ./handlers (Step 2, above) is fully
  // constructed before handleProtocol can possibly touch libraryManagerMap.
  deliverStartupProtocolUrl()
}
