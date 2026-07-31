/**
 * Sidecar bootstrap module (Phase 27 Plan 02 — Task 2).
 *
 * The real process entry is `src/sidecar/index.ts` (bundled by `pnpm
 * build:sidecar` to `build/main/sidecar.js`, spawned by the Rust shell —
 * `src-tauri/src/main.rs`, 27-01), which imports `init` from this module and
 * calls it unconditionally.
 *
 * This module's ordering is load-bearing (spike 009's sharp edge): the
 * `Module._load` hook that redirects `require('electron')` -> electronStub
 * AND `require('electron-store')` -> fileStore MUST be installed BEFORE
 * `./handlers` is imported, because `backend/constants/paths.ts` calls
 * `app.getPath()` at MODULE SCOPE and `backend/electron_store.ts` /
 * `backend/cache.ts` construct `new Store()` at MODULE SCOPE (20+ files route
 * through them) — intercepting only 'electron' leaves that second wall standing.
 *
 * The hook lives in `./installElectronHook` (imported FIRST below), NOT inline
 * here: ES modules evaluate every static import before a module's own
 * executable statements, so an inline hook-install statement would run AFTER
 * `import './handlers'` had already constructed store managers against the real
 * electron-store — crashing the sidecar on boot (Phase 27 Plan 05 blank-screen
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
import {
  startRpcServer,
  pushFrontendMessage,
  requestOpenExternal
} from './sidecarRpc'
import { setTokenStore as installTokenStore } from '../storeManagers/steam/tokenStore'
import { SidecarKeyringTokenStore } from './keyringTokenStore'
import { installSidecarHumbleSecretStore } from './humbleSecretStore'
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
  LogPrefix
} from '../logger'
import { GlobalConfig } from '../config'
import { publicDir } from '../constants/paths'
import { backendEvents } from '../backend_events'
import { fetchLastestReleases } from '../utils/releases'
import { downloadAntiCheatData } from '../anticheat/utils'
import { isMac } from '../constants/environment'

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
          supportedLngs: supportedLanguages
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
  electronStub.bindTransport({
    openExternal: requestOpenExternal,
    pushFrontendMessage
  })
  // Placement is load-bearing (Phase 28, T-28-10): must run AFTER startRpcServer() so
  // requestRustInvoke can write frames, and BEFORE any invoke handler body can run (those
  // only fire from the RPC loop below, never at module-import time) so no handler ever
  // observes the default ElectronTokenStore in the sidecar build.
  installTokenStore(new SidecarKeyringTokenStore())
  // Phase 34.4.1 gap-cycle plan 13 (F-1 BLOCKING closure): install the keyring-backed Humble
  // secret store the same way and at the same site as the Steam TokenStore just above. Must run
  // AFTER startRpcServer() for the same reason installTokenStore() does (its migration logic
  // calls requestRustInvoke, which needs a live transport), and harmless to call on every
  // bootstrap.test.ts/*Flows.test.ts init() re-run -- setHumbleSecretStore() just reassigns a
  // registry variable (no accumulating listener, unlike onlineMonitorInitialized's guard above).
  installSidecarHumbleSecretStore()
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
}
