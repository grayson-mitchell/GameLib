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
import * as electronStub from './electronStub'
import { READY_SENTINEL } from 'common/types/sidecarTransport'
import { supportedLanguages } from 'common/languages'

// ---- Step 2: import the backend registration path — AFTER the hook -------

import './handlers'
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
import { initOnlineMonitor } from '../online_monitor'
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
import { setUnhandledRejectionLogSink } from './processGuards'

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
export function registerProtocolUrlHandler(): void {
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
      i18next
        .use(Backend)
        .init({
          backend: {
            addPath: join(publicDir, 'locales', '{{lng}}', '{{ns}}'),
            allowMultiLoading: false,
            loadPath: join(publicDir, 'locales', '{{lng}}', '{{ns}}.json')
          },
          debug: false,
          returnEmptyString: false,
          returnNull: false,
          fallbackLng: 'en',
          lng: settings.language,
          supportedLngs: supportedLanguages,
          // Plan 34.6-19 (REQ-34.6-05, T-34.6-51): fork strings live in their
          // own `gamelib` namespace (public/locales/{{lng}}/gamelib.json),
          // upstream Heroic strings stay in `translation`. Both i18next init
          // sites (this one and main.ts's Electron leg) must change together
          // -- a one-sided change is a build divergence.
          ns: ['translation', 'gamelib'],
          defaultNS: 'translation'
        })
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
  output.write(`${READY_SENTINEL}\n`)
  // Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09): the LAST statement of init(), deliberately
  // AFTER the READY_SENTINEL write above — so the shell knows the sidecar is up before any
  // launch begins, and so every store manager imported by ./handlers (Step 2, above) is fully
  // constructed before handleProtocol can possibly touch libraryManagerMap.
  deliverStartupProtocolUrl()
}
