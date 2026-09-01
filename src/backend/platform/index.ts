/**
 * Electron-module replacement for the headless sidecar (Phase 27 Plan 02 —
 * Task 1).
 *
 * Installed by `bootstrap.ts`'s `Module._load` hook in place of
 * `require('electron')`, BEFORE any backend module is imported. Spike 009
 * mapped 16 distinct Electron main-process APIs touched somewhere in the
 * backend's module graph (`app` x26, `dialog` x9, `BrowserWindow` x7,
 * `shell` x5, `safeStorage` x4, `nativeImage` x4, `Notification` x3,
 * `session`/`screen`/`net`/`Menu` x2, `protocol`/`powerSaveBlocker`/
 * `clipboard`/`Tray`/`ipcMain` x1). `backend/storeManagers/steam/library.ts`
 * pulls in `backend/utils.ts` -> `backend/storeManagers/index.ts`, which
 * eagerly constructs EVERY store manager (GOG/Legendary/Nile/Zoom/Sideload/
 * Steam) at import time — so this stub covers the full surface, not just
 * Steam's touchpoints, to keep that whole chain import-safe.
 *
 * Real window/tray/menu/protocol management is explicitly OUT of scope for
 * the skeleton (27-CONTEXT) — these are safe no-op stand-ins, not
 * reimplementations. Only `app.getPath` (paths.ts's import-time wall),
 * `ipcMain` (the RPC dispatch surface handlers.ts registers against),
 * `shell.openExternal` (the E2E action-flow parity path),
 * `BrowserWindow.getAllWindows()` (the `sendFrontendMessage` push path
 * `backend/ipc.ts` already implements via `getMainWindow()`), and
 * `dialog.showOpenDialog` (Phase 30 Plan 03 — the native folder-picker path,
 * forwarded to Rust's `dialog_open` rustInvoke channel) have real
 * behavior — everything else only needs to not throw at import time.
 * `safeStorage` is the one exception below (Phase 28): its Steam
 * refresh-token callers were graduated onto `getTokenStore()` instead, so
 * `safeStorage` itself is intentionally left dead here (throws on use).
 *
 * ---------------------------------------------------------------------------
 * PHASE 35 PLAN 13 (D-02, REQ-35-01/REQ-35-02): MOVED HERE from
 * `src/backend/sidecar/electronStub.ts`. The move was mechanical — the file's
 * own content changed by exactly four lines out of 926 (the relative imports
 * whose depth changed). Everything above this block is the original
 * provenance comment, carried forward unaltered because it still documents
 * which API surfaces are real and which are stand-ins.
 *
 * THIS MODULE IS THE SINGLE IMPORT TARGET REPLACING `'electron'` ACROSS THE
 * BACKEND. Plan 35-15 rewrites the tree's ~67 `from 'electron'` sites to
 * `from 'backend/platform'`; plan 35-18 then removes `electron` from
 * `package.json` entirely. As of plan 13 this module has ZERO consumers of the
 * bare `backend/platform` specifier — that is deliberate (D-17 step 1): the
 * module is built and fully tested in isolation, while both shells still
 * build, BEFORE anything irreversible happens.
 *
 * EXPORT COUNT: 22 — unchanged from the pre-move file, so D-02's "same 22
 * exports" holds exactly and no delta needs stating.
 *
 * A note on the census, because the record disagrees with itself:
 * `35-PREFLIGHT.md`'s PD-B section records `PLATFORM_EXPORT_COUNT: 19`,
 * having marked `ElectronStubTransport`, `IpcHandler` and `IpcListener` DEAD.
 * That census answered "is this live PRODUCTION surface?" — its stated rule
 * excluded test files. It does NOT answer "can this export be deleted without
 * breaking the build", which is the question the move actually poses.
 * Re-measured across the whole tree, tests included:
 *   - `IpcHandler`  — LIVE: `eosOverlayFlows.test.ts`, `wineToolsFlows.test.ts`,
 *                     `runnerSliceRegistration.test.ts` (~10 cast sites)
 *   - `IpcListener` — LIVE: `runnerSliceRegistration.test.ts`
 *   - `ElectronStubTransport` — genuinely zero consumers anywhere; the only
 *                     truly dead export. Kept for API-shape parity at zero
 *                     runtime cost (it is an interface: nothing is emitted).
 * Deleting the first two would break three test files, which this plan is
 * separately forbidden from rewriting. So the corrected census is 21 live +
 * 1 dead = 22 shipped, and PD-B itself authorises this ("keep them for
 * API-shape parity at zero functional cost — either is valid").
 * `PLATFORM_EXPORT_COUNT: 19` is SUPERSEDED, not contradicted: it was correct
 * for the production-only question it asked.
 * ---------------------------------------------------------------------------
 */

import { release as osRelease } from 'os'

// Phase 34.1 Plan 04 (T-34.1-17): static import, same pattern
// `utils/systeminfo/heroicVersion.ts` already uses -- `process.env.npm_package_version`
// (the previous source of app.getVersion() below) is UNSET in the packaged SEA sidecar
// binary, so without this every shipped build's `getHeroicVersion` reported '0.0.0'.
import pkgJson from '../../../package.json'
import { getPath } from '../sidecar/pathShim'
import { isPackagedSidecar } from '../sidecar/isPackagedSidecar'
import { requestRustInvoke } from '../sidecar/sidecarRpc'
import {
  RUST_APP_EXIT,
  RUST_APP_HIDE,
  RUST_APP_RELAUNCH,
  RUST_CLIPBOARD_WRITE_TEXT,
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_OPEN,
  RUST_DIALOG_SAVE,
  RUST_NOTIFICATION_SHOW,
  RUST_SHELL_OPEN_PATH,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER,
  RUST_WAKE_LOCK_START,
  RUST_WAKE_LOCK_STOP
} from 'common/types/sidecarTransport'

// ---- process.getSystemVersion polyfill (Phase 31 Plan 01, discovered while
// wiring `getSystemInfo`) -------------------------------------------------------
//
// Electron augments the global `process` object with a handful of extra
// methods when running inside the Electron main process (`getSystemVersion`,
// `resourcesPath`, etc.) — outside Electron (this sidecar's plain Node
// process) none of these exist. `backend/utils/systeminfo/index.ts` (shared,
// UNCHANGED Electron code, per this module's own "prove the real logic runs"
// convention) calls `process.getSystemVersion()` unconditionally — under the
// sidecar this threw `process.getSystemVersion is not a function`, crashing
// EVERY `getSystemInfo` invocation (Rule 1 bug, not a test-only artifact —
// this would have crashed in the shipped Tauri build identically to how it
// crashed the settingsFlows.test.ts unit test that first exercised it).
// Polyfilled here, once, at import time — `os.release()` is Node's closest
// built-in analog (the host OS's kernel/build release string). Guarded so a
// real Electron environment's own implementation is never clobbered if this
// file were ever require()'d there.
if (
  typeof (process as NodeJS.Process & { getSystemVersion?: () => string })
    .getSystemVersion !== 'function'
) {
  ;(
    process as NodeJS.Process & { getSystemVersion: () => string }
  ).getSystemVersion = () => osRelease()
}
// NOTE: this file must NOT import 'backend/logger' (or anything else from the backend module
// graph) -- backend/logger's import chain (game_config -> config -> compatibility_layers ->
// constants/paths.ts) calls `app.getPath('appData')` at MODULE SCOPE, which requires the
// Module._load hook (installElectronHook.ts) to already be installed. That hook installs
// itself by requiring THIS file first (bootstrap.ts's doc comment), so importing backend/logger
// here would reintroduce the exact "second wall" bootstrap.ts's docstring warns about, just one
// file earlier in the chain. `console.warn` is used instead for the one error path below.

// ---- Transport binding ------------------------------------------------------
//
// electronStub.ts has no knowledge of the RPC transport (sidecarRpc.ts,
// Task 2) to avoid a circular import — sidecarRpc dispatches TO the handlers
// this stub's ipcMain records. bootstrap.ts wires the two together via
// bindTransport() strictly after the RPC server starts, which is always
// before any real openExternal/sendFrontendMessage call can occur (those
// only fire from handler bodies invoked over the RPC loop, never at
// module-import time).

export interface ElectronStubTransport {
  /** Forwards `shell.openExternal(url)` to the Rust shell's opener command. */
  openExternal: (url: string) => void
  /** Forwards `mainWindow.webContents.send(channel, ...args)` as a SidecarNotification. */
  pushFrontendMessage: (channel: string, ...args: unknown[]) => void
}

let transport: ElectronStubTransport | null = null

export function bindTransport(next: ElectronStubTransport): void {
  transport = next
}

// ---- ipcMain recorder --------------------------------------------------------

// Return type is `unknown` — this collapses `unknown | Promise<unknown>` (the union is
// redundant since `unknown` already subsumes `Promise<unknown>`), but the handler is still
// permitted to return a Promise; callers `await` the result regardless.
export type IpcHandler = (event: unknown, ...args: unknown[]) => unknown
export type IpcListener = (event: unknown, ...args: unknown[]) => void

/** channel -> registered `ipcMain.handle` handler (req/resp — sidecarRpc dispatches here). */
export const handlerRegistry = new Map<string, IpcHandler>()
/** channel -> registered `ipcMain.on`/`ipcMain.once` listeners (fire-and-forget). */
export const listenerRegistry = new Map<string, IpcListener[]>()

export const ipcMain = {
  handle(channel: string, handler: IpcHandler): void {
    handlerRegistry.set(channel, handler)
  },
  removeHandler(channel: string): void {
    handlerRegistry.delete(channel)
  },
  on(channel: string, listener: IpcListener): void {
    const listeners = listenerRegistry.get(channel) ?? []
    listeners.push(listener)
    listenerRegistry.set(channel, listeners)
  },
  once(channel: string, listener: IpcListener): void {
    const wrapped: IpcListener = (...args) => {
      const remaining = (listenerRegistry.get(channel) ?? []).filter(
        (registered) => registered !== wrapped
      )
      listenerRegistry.set(channel, remaining)
      listener(...args)
    }
    ipcMain.on(channel, wrapped)
  }
}

// ---- app ---------------------------------------------------------------------

// app.userAgentFallback (34.4.1-02 Task 4, DEFECT 3): `standardBrowserUserAgent()`
// (backend/humble/userAgent.ts:26-36) reads this property unconditionally and regex-extracts a
// `(<platform>)` token and a `Chrome/<version>` token from it. Real Electron populates this at
// startup with Chromium's own UA string; this stub previously left it `undefined`, so every call
// under the sidecar threw `Cannot read properties of undefined (reading 'replace')` -- the A4
// smoke gate's Task-4 DEFECT 3, discovered only once DEFECT 1/2's logging fixes made the sidecar
// observable at all. Shaped to match the happy-path regex directly (platform token in parens,
// `Chrome/<version>` present) rather than the function's own defensive fallback branch, and
// DELIBERATELY carries no `Electron/x.y.z` token -- the whole point of `standardBrowserUserAgent`
// is to strip that token so Google's SSO does not fingerprint an embedded browser, and a stub
// that already omits it exercises the happy path the real runtime is meant to produce.
// `Chrome/142.0.7444.52` is the real Chromium build electron@41.1.1 (this repo's pinned Electron
// version, see package.json) ships -- the same pairing `humble/__tests__/user.test.ts` already
// hardcodes for its own synthetic `userAgentFallback` fixture, kept in parity here rather than
// invented fresh. The platform token is derived from `process.platform` (mirroring
// `constants/environment.ts`'s `isMac`/`isWindows`/`isLinux` convention) rather than hardcoded to
// macOS, since the sidecar itself is cross-platform.
function stubUserAgentFallback(): string {
  const chromeVersion = '142.0.7444.52'
  const platformToken =
    process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : process.platform === 'win32'
        ? 'Windows NT 10.0; Win64; x64'
        : 'X11; Linux x86_64'
  return `Mozilla/5.0 (${platformToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
}

// app.quit()/exit()/relaunch() (Phase 33 Plan 04, D-05 app lifecycle essentials): forward a
// real exit/relaunch request to Tauri's AppHandle via RUST_APP_EXIT/RUST_APP_RELAUNCH, mirroring
// shell.openExternal's fire-and-forget void-forwarding shape below -- neither the two real
// sidecar-reachable callers (resetHeroic's relaunch+quit, the handleExit-shaped uninstall/quit
// exit path) await these or check a return value, so a best-effort forward (never throws, logs
// on failure) is sufficient. Without this the sidecar's own no-op left a zombie process: the
// real Tauri window/process never actually exited or relaunched.
//
// Phase 34.3 Plan 05 (D-06, REQ-34.3-07): relaunch-vs-quit race guard. In real Electron,
// app.relaunch() only *registers* a restart and app.quit() *performs* it -- both are needed,
// ordered, inside one process. Under Tauri, app.restart() alone does everything, and this stub
// forwards relaunch()/quit() as two INDEPENDENT fire-and-forget frames, each dispatched to
// dispatch_rust_channel on its own spawned worker thread (main.rs) -- so app_exit's frame can be
// processed BEFORE app_relaunch's, and the app quits instead of restarting, nondeterministically.
// resetHeroic (utils.ts) is the real caller that hits this ordering (relaunch() then quit(), one
// setTimeout tick apart) -- its body is intentionally NOT modified; this guard lives entirely
// here so utils.ts stays byte-identical for both builds and Phase 35 has one less build-detection
// conditional to unwind. Not reset on the SUCCESS path: a relaunch is terminal for this process --
// app.restart() never returns and the process is about to be replaced, so resetting the flag
// would only reintroduce the race for code that (cannot) run after. It IS reset when the relaunch
// dispatch REJECTS (CR-01) -- see relaunch()'s catch below: a failed relaunch means the process
// survives, so holding the flag would make the app permanently unquittable. Rejected alternative:
// serializing dispatch_rust_channel itself would fix this for every caller, but it would touch
// the hot path for every single rustInvoke, not just these two rare lifecycle calls.
let relaunchInFlight = false

export const app = {
  getPath,
  getName: (): string => 'GameLib',
  setName: (): void => {},
  // Phase 35 Plan 15: signature-only widening, all no-ops. The About panel is a Tauri window
  // concern (see the `showAboutWindow` channel), and getGPUInfo has no sidecar equivalent --
  // utils/systeminfo/gpu/linux.ts's caller already tolerates an empty result.
  setAboutPanelOptions: (_options?: unknown): void => {},
  showAboutPanel: (): void => {},
  getGPUInfo: async (_infoType?: string): Promise<unknown> => ({}),
  // R-34.5-G1-PKG half (b) / D-14 (Phase 35 plan 04). This key held a hardcoded
  // `false` literal from Phase 27 until now -- and that literal was the root cause of the
  // packaged-build asset failure. `constants/paths.ts:73-76` computes
  //   publicDir = resolve(app.getAppPath(), app.isPackaged || CI === 'e2e' ? 'build' : 'public')
  // so a constant `false` made every packaged run append 'public' to the Tauri resource
  // dir -- a directory that does not exist inside the bundle -- and every asset resolved
  // through `publicDir` (runner binaries, locales, changelog.json, webviewPreload.js,
  // icon.png, the CrossOver index snapshot) ENOENT'd. `main.rs:5495-5496` documents the
  // same defect independently from the Rust side.
  //
  // A GETTER, not a captured boolean, and that is load-bearing: this object literal is
  // evaluated at MODULE SCOPE, and `paths.ts` reads `app.isPackaged` at module scope too.
  // Freezing the value at construction time would bake in whatever the SEA context looked
  // like at the earliest possible moment. A getter defers the probe to the read.
  //
  // Delegates to `./isPackagedSidecar` and never re-derives. That module is the SINGLE
  // derivation in the tree; `devSecretVault.ts`'s fail-closed guardrail (c) and
  // `humbleFlowRegistration.ts`'s `humbleRunValidation` gate are the other two callers.
  // Do NOT reintroduce a local `node:sea` probe here or a build-time constant: a second
  // derivation that disagrees with the first is a silent unlock of the dev secret vault
  // in a shipped binary (T-35-11/T-35-12), not a tidiness problem.
  get isPackaged(): boolean {
    return isPackagedSidecar()
  },
  // GAMELIB_APP_ROOT (Phase 34.5 Plan 16, Task 3, G-1): the root cause of live-gate items
  // 1/2/3/5 was this line returning `process.cwd()`, which under the sidecar is `src-tauri/`
  // -- so `paths.ts:73`'s `publicDir = resolve(app.getAppPath(), ...)` resolved to
  // `src-tauri/public`, a directory that does not exist, and every bundled runner binary
  // (`legendary`/`gogdl`/`nile`/`comet`) ENOENT'd on spawn (see `34.5-APP-ROOT-SWEEP.md` for
  // the full consumer sweep this single line repairs).
  //
  // The value comes from the Tauri shell's own app root, handed down at spawn time exactly
  // like `GAMELIB_SHELL_EXE` (`main.rs`'s `resolve_dev_app_root`/`resolve_packaged_app_root`,
  // set on BOTH spawn paths). Returned verbatim, never resolved or existence-checked here --
  // the shell is the authority for its own root.
  //
  // Deliberately non-throwing, unlike `pathShim`'s `case 'exe'`: `getAppPath()` is called at
  // MODULE SCOPE by `backend/constants/paths.ts`, and a throw there would take the whole
  // sidecar down at import time, before the logger exists (the standing
  // `sidecar-console-and-logger-are-invisible` gotcha means that failure would be invisible).
  // So an unset or empty `GAMELIB_APP_ROOT` falls back to today's `process.cwd()` behaviour
  // instead -- this is REQ-34.5-13's invariant: jest and any non-Tauri host (including the
  // real Electron build, which never sets this var) see NO behaviour change. The loudness
  // lives in plan 34.5-18's boot self-check instead, not here.
  getAppPath: (): string => process.env.GAMELIB_APP_ROOT || process.cwd(),
  getVersion: (): string => pkgJson.version ?? '0.0.0',
  userAgentFallback: stubUserAgentFallback(),
  whenReady: (): Promise<void> => Promise.resolve(),
  on: () => app,
  once: () => app,
  quit: (): void => {
    // D-06: a relaunch already in flight owns this process's teardown -- suppress quit() so its
    // independently-dispatched app_exit frame cannot win the race and quit instead of restart.
    if (relaunchInFlight) {
      console.warn(
        '[electronStub] app.quit(): suppressed -- a relaunch is already in flight'
      )
      return
    }
    requestRustInvoke(RUST_APP_EXIT, []).catch((error) => {
      console.warn(
        `[electronStub] app.quit(): ${RUST_APP_EXIT} failed:`,
        error instanceof Error ? error.message : String(error)
      )
    })
  },
  exit: (): void => {
    // D-06: see quit()'s comment above -- same suppression, same reason.
    if (relaunchInFlight) {
      console.warn(
        '[electronStub] app.exit(): suppressed -- a relaunch is already in flight'
      )
      return
    }
    requestRustInvoke(RUST_APP_EXIT, []).catch((error) => {
      console.warn(
        `[electronStub] app.exit(): ${RUST_APP_EXIT} failed:`,
        error instanceof Error ? error.message : String(error)
      )
    })
  },
  relaunch: (): void => {
    // D-06: mark a relaunch in flight BEFORE dispatching -- terminal for this process, never
    // reset (see the module-scope comment above `app` for why resetting would reintroduce the
    // race).
    relaunchInFlight = true
    requestRustInvoke(RUST_APP_RELAUNCH, []).catch((error) => {
      // CR-01: RELEASE the guard here. On the SUCCESS path this promise never settles -- Rust's
      // app_relaunch arm sends no response frame and the process is replaced before it could --
      // so reaching this catch means the relaunch genuinely did NOT happen (transport failure, or
      // the 60s rustInvoke timeout). This process is therefore NOT being replaced, so the teardown
      // ownership the flag asserts is void, and there is no pending relaunch frame left for an
      // exit frame to race against. Leaving it set would permanently no-op app.quit()/app.exit()
      // for the rest of this process's life -- including the ordinary Quit menu path -- leaving
      // the app closable only by force-quit. resetHeroic() runs this on every reset.
      relaunchInFlight = false
      console.warn(
        `[electronStub] app.relaunch(): ${RUST_APP_RELAUNCH} failed:`,
        error instanceof Error ? error.message : String(error)
      )
    })
  },
  requestSingleInstanceLock: (): boolean => true,
  setAsDefaultProtocolClient: (): boolean => true,
  // quick/260815-vvz: `raiseFrontmostBottledProcess`'s (bottle.ts) yield fallback --
  // when the ~18s poll for a matching bottled Steam installer/uninstaller window comes up
  // empty, it calls `app.hide()` so GameLib at least steps aside instead of staying in front
  // of an invisible Steam confirm dialog. Byte-shaped on quit()'s forward above: fire-and-
  // forget `requestRustInvoke(RUST_APP_HIDE, [])`, forwarded to Tauri's real
  // `AppHandle::hide()` (macOS-only, `main.rs`'s `app_hide` arm). Two deliberate differences
  // from quit()/exit(), both load-bearing:
  //   - No `relaunchInFlight` suppression. That guard exists so quit/exit cannot win a
  //     process-teardown race against an in-flight relaunch. Hiding a window is not teardown
  //     and cannot win (or need to win) that race -- suppressing it here would just make the
  //     yield fallback silently do nothing during a relaunch, with no correctness benefit.
  //   - Never throws (same total-method convention as every other member here) -- a failed
  //     hide is a best-effort UX nicety, not something that may affect the install/uninstall
  //     flow that calls it.
  hide: (): void => {
    requestRustInvoke(RUST_APP_HIDE, []).catch((error) => {
      console.warn(
        `[electronStub] app.hide(): ${RUST_APP_HIDE} failed:`,
        error instanceof Error ? error.message : String(error)
      )
    })
  }
}

// ---- dialog --------------------------------------------------------------------
//
// showOpenDialog (Phase 30 Plan 03, D-09/REQ-30-07) and showErrorBox/showSaveDialog
// (Phase 31 Plan 02, D-03/REQ-31-03/REQ-31-05) forward to the Rust shell's native dialogs via
// the existing generic `requestRustInvoke()` channel. This is a deliberate, narrow exception
// to this module's own "no knowledge of the RPC transport" rule above (which exists to avoid
// a circular import between electronStub.ts and sidecarRpc.ts for the
// openExternal/pushFrontendMessage bindTransport() pair) — `requestRustInvoke` is imported
// directly here, matching `keyringTokenStore.ts`'s call shape, because unlike
// openExternal/pushFrontendMessage this is a one-directional call (electronStub -> sidecarRpc
// only) with no callback the other way, so it does not reintroduce the bidirectional cycle
// bindTransport() was built to avoid.
//
// showMessageBox is DELIBERATELY NOT wired to RUST_DIALOG_MESSAGE (Phase 31 Plan 04, CR-01
// de-scope). Rust's dialog is OK-only (`blocking_show()` returns a single bool), but real
// callers (`promptI386Recovery`, `askForceUninstall`) present multi-button
// destructive/non-destructive confirms and branch on `response`. Forwarding to the OK-only
// dialog auto-confirms the destructive branch every time -- a real correctness/security bug
// (CR-01). The safe fix is to de-wire showMessageBox entirely: it logs a console.warn and
// RESOLVES the sentinel `{ response: -1, checkboxChecked: false }` -- never forwarding to
// RUST_DIALOG_MESSAGE and never rejecting. It must never reject/throw because the two live
// callers `await` it unguarded and fire-and-forget (no try/catch, no `.catch()`), and even
// though `sidecar/processGuards.ts` now installs a process-level `unhandledRejection` guard
// (Phase 34.2 Plan 09), that guard is defence-in-depth only -- an always-rejecting stub here
// would still surface as a logged crash-adjacent warning the first time either path is hit,
// not a clean no-op. `-1` is neither `0`
// (promptI386Recovery's affirmative/destructive branch, decline = `response !== 0`) nor `1`
// (askForceUninstall's destructive branch, decline = `response !== 1`), so it declines BOTH
// reachable callers.
//
// CORRECTED (CR-04, Phase 34.1 code review). This block previously asserted:
//   "`handleExit`'s inverted sense (`response === 0` = safe "No") is moot: it is wired in
//    `main.ts` via `app.on('before-quit')`, and `main.ts` is not in the sidecar's curated
//    import graph, so `handleExit` never runs under the sidecar."
// That is NO LONGER TRUE. Phase 34.1 Plan 04 registers `ipcMain.on('quit', () =>
// handleExit())` in `appShellFlowRegistration.ts`, which imports `handleExit` directly from
// `backend/utils` -- so `handleExit` IS sidecar-reachable, and with it the one caller in this
// codebase whose SAFE index is 0 rather than the last index. The `safeIndex` fallback below
// (`cancelId ?? buttons.length - 1`) would have resolved to 1 = "Yes" for its two-button
// array, i.e. the DESTRUCTIVE branch (killPattern legendary/gogdl/nile +
// callAllAbortControllers + app.exit) on any transport error or timeout -- fail-OPEN, the
// exact opposite of this stub's documented property. `handleExit` now declares an explicit
// `cancelId: 0` (see `backend/utils.ts`) so the first operand of that `??` is used and the
// fail-safe-to-decline property holds for it too. Any FUTURE caller whose safe button is not
// the last index must likewise declare `cancelId` -- the positional fallback cannot infer it.
// Real multi-button `showMessageBox` behavior is deferred to Phase 33 (lifecycle/dialog cluster).
//
// The two Sync members (showMessageBoxSync/showOpenDialogSync) stay logged no-ops (D-03) --
// synchronous dialogs cannot be forwarded across the async rustInvoke transport, so they log a
// console.warn and return a safe default rather than silently doing nothing.

export const dialog = {
  showErrorBox: async (title?: string, content?: string): Promise<void> => {
    try {
      await requestRustInvoke(RUST_DIALOG_MESSAGE, [
        { message: content, title, kind: 'error' }
      ])
    } catch (error) {
      // Never throw to the caller (total-method convention) -- an error dialog that itself
      // fails to render must not crash the caller's error-handling path.
      console.warn(
        `[electronStub] dialog.showErrorBox(): ${RUST_DIALOG_MESSAGE} failed:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  },
  showMessageBox: async (
    _windowOrOptions?: unknown,
    maybeOptions?: unknown
  ): Promise<{ response: number; checkboxChecked: boolean }> => {
    // Real multi-button forward (Phase 33 Plan 03, D-06/D-07) -- retires the Phase 31 Plan 04
    // CR-01 `{ response: -1 }` safe-sentinel stopgap. Mirrors showOpenDialog's
    // forward-to-transport shape: try { requestRustInvoke(RUST_DIALOG_MESSAGE) } catch { safe
    // default }. Handles both call forms electron's real API supports --
    // `(window, options)` and `(options)` -- by preferring maybeOptions when present.
    //
    // D-07 fail-safe-to-decline: safeIndex is the CALLER's own declared `cancelId`, never a
    // positional "last index" heuristic (33-RESEARCH Pitfall 4 -- provably wrong for
    // askForceUninstall, whose destructive button is index 1, not the last index when
    // buttons.length is 2... the two happen to coincide there, but promptI386Recovery's
    // destructive button IS index 0 while a "last index" guess would default to 1 -- unsafe).
    // ANY transport error/timeout resolves `{ response: safeIndex }` -- never `-1`, never
    // reject/throw (total-method convention; an unguarded reject crashes the sidecar, see
    // memory: sidecar-dialog-reject-crashes).
    const options = (maybeOptions ?? _windowOrOptions) as
      | {
          buttons?: string[]
          cancelId?: number
          message?: string
          title?: string
          type?: string
        }
      | undefined
    const safeIndex = options?.cancelId ?? (options?.buttons?.length ?? 1) - 1
    try {
      const result = await requestRustInvoke(RUST_DIALOG_MESSAGE, [
        {
          message: options?.message,
          title: options?.title,
          kind: options?.type,
          buttons: options?.buttons
        }
      ])
      // result: true -> buttons[0] clicked (response 0), false -> buttons[1] clicked (response 1)
      return { response: result === false ? 1 : 0, checkboxChecked: false }
    } catch (error) {
      console.warn(
        `[electronStub] dialog.showMessageBox(): ${RUST_DIALOG_MESSAGE} failed, defaulting to safe index ${safeIndex}:`,
        error instanceof Error ? error.message : String(error)
      )
      return { response: safeIndex, checkboxChecked: false }
    }
  },
  showMessageBoxSync: (_window?: unknown, _options?: unknown): number => {
    console.warn(
      '[electronStub] dialog.showMessageBoxSync(): logged no-op (D-03) -- synchronous dialogs cannot cross the async rustInvoke transport; returns the default response (0)'
    )
    return 0
  },
  showOpenDialog: async (
    _window?: unknown,
    options?: unknown
  ): Promise<{ canceled: boolean; filePaths: string[] }> => {
    try {
      const result = await requestRustInvoke(RUST_DIALOG_OPEN, [options])
      if (typeof result === 'string') {
        return { canceled: false, filePaths: [result] }
      }
      // `null` (or anything else non-string) is the healthy cancel case.
      return { canceled: true, filePaths: [] }
    } catch (error) {
      // Never throw to the caller (mirrors keyringTokenStore.ts's total-method convention) --
      // a rejection (timeout, unknown channel, permission denial) resolves as a clean cancel.
      // console.warn, not logWarning: this file must not import 'backend/logger' (see the
      // module-scope note above the imports).
      console.warn(
        `[electronStub] dialog.showOpenDialog(): ${RUST_DIALOG_OPEN} failed:`,
        error instanceof Error ? error.message : String(error)
      )
      return { canceled: true, filePaths: [] }
    }
  },
  showOpenDialogSync: (): undefined => {
    console.warn(
      '[electronStub] dialog.showOpenDialogSync(): logged no-op (D-03) -- synchronous dialogs cannot cross the async rustInvoke transport'
    )
    return undefined
  },
  showSaveDialog: async (
    _window?: unknown,
    options?: unknown
  ): Promise<{ canceled: boolean; filePath?: string }> => {
    try {
      const result = await requestRustInvoke(RUST_DIALOG_SAVE, [options])
      if (typeof result === 'string') {
        return { canceled: false, filePath: result }
      }
      // `null` (or anything else non-string) is the healthy cancel case.
      return { canceled: true, filePath: undefined }
    } catch (error) {
      // Never throw to the caller (mirrors keyringTokenStore.ts's total-method convention).
      console.warn(
        `[electronStub] dialog.showSaveDialog(): ${RUST_DIALOG_SAVE} failed:`,
        error instanceof Error ? error.message : String(error)
      )
      return { canceled: true, filePath: undefined }
    }
  }
}

// ---- Notification ----------------------------------------------------------------
//
// Real OS notification (Phase 33 Plan 04, D-05) via tauri-plugin-notification's
// notification_show rustInvoke arm. isSupported() flips to true; show() forwards the
// constructor's {title, body} inside a try/catch that console.warns and no-ops on failure --
// never throws (total-method convention, mirrors showErrorBox's shape). No icon/nativeImage
// plumbing (33-RESEARCH confirmed the plugin's icon param is optional).
//
// Zero-change consumer: backend/dialog/dialog.ts's notify() already gates on
// Notification.isSupported() with an established logged-no-op fallback -- no changes needed
// there beyond isSupported() returning true.

interface NotificationOptions {
  title?: string
  body?: string
  // Phase 35 Plan 15: type-only widening. utils.ts's offline notification passes these three;
  // the stub ignores all of them, exactly as it ignored title/body before.
  urgency?: 'normal' | 'critical' | 'low'
  timeoutType?: 'default' | 'never'
  silent?: boolean
}

export class Notification {
  static isSupported(): boolean {
    return true
  }

  private readonly options: NotificationOptions

  constructor(options?: NotificationOptions) {
    this.options = options ?? {}
  }

  on(_event?: string, _listener?: () => void): this {
    return this
  }

  show(): void {
    requestRustInvoke(RUST_NOTIFICATION_SHOW, [
      { title: this.options.title, body: this.options.body }
    ]).catch((error) => {
      console.warn(
        `[electronStub] Notification.show(): ${RUST_NOTIFICATION_SHOW} failed:`,
        error instanceof Error ? error.message : String(error)
      )
    })
  }

  close(): void {}
}

// ---- safeStorage (Phase 28 graduated this API: real Keychain storage now lives in
// SidecarKeyringTokenStore, installed by bootstrap.ts via setTokenStore(); safeStorage
// itself is intentionally left dead in the sidecar — see steam/tokenStore.ts) ---

export const safeStorage = {
  isEncryptionAvailable: (): boolean => false,
  encryptString: (_plainText: string): Buffer => {
    throw new Error(
      'safeStorage is not available in the sidecar — use getTokenStore() (see steam/tokenStore.ts)'
    )
  },
  decryptString: (_encrypted: Buffer): string => {
    throw new Error(
      'safeStorage is not available in the sidecar — use getTokenStore() (see steam/tokenStore.ts)'
    )
  }
}

// ---- shell -------------------------------------------------------------------------

export const shell = {
  // Phase 35 Plan 15: signature-only widening. Windows-only in real Electron and never
  // reachable on the platforms the sidecar runs; returns false rather than pretending.
  writeShortcutLink: (
    _shortcutPath: string,
    _operation?: unknown,
    _options?: unknown
  ): boolean => false,
  openExternal: async (url: string, _options?: unknown): Promise<void> => {
    transport?.openExternal(url)
  },
  // Phase 33 Plan 04 (D-05): upgraded from the D-04 logged no-op to a real forward, backed by
  // tauri-plugin-opener's reveal_item_in_dir (RUST_SHELL_SHOW_ITEM_IN_FOLDER). Fire-and-forget
  // (mirrors real Electron's void-returning API) -- never throws; a transport failure is logged,
  // never silent.
  showItemInFolder: (fullPath: string): void => {
    requestRustInvoke(RUST_SHELL_SHOW_ITEM_IN_FOLDER, [fullPath]).catch(
      (error) => {
        console.warn(
          `[electronStub] shell.showItemInFolder(): ${RUST_SHELL_SHOW_ITEM_IN_FOLDER} failed:`,
          error instanceof Error ? error.message : String(error)
        )
      }
    )
  },
  // D-05: stays a LOGGED no-op (never silent) -- tauri-plugin-fs 2.5.1 (the only first-party
  // candidate audited in 33-RESEARCH) has no trash/recycle-bin capability at all in this
  // version (confirmed by reading its source directly), so there is no vetted first-party Tauri
  // plugin to forward to. Declared as an accepted gap for Plan 06's 33-PORTED-CHANNELS.md.
  trashItem: async (): Promise<void> => {
    console.warn(
      '[electronStub] shell.trashItem(): logged no-op (D-05, Phase 33) -- no vetted Tauri v2 trash-capable plugin found; item is NOT moved to the OS trash'
    )
  },
  // Phase 33 Plan 04 (D-05): real forward via tauri-plugin-opener's open_path
  // (RUST_SHELL_OPEN_PATH). Mirrors real Electron's shell.openPath contract: resolves an empty
  // string on success, or a human-readable error string on failure -- never rejects.
  openPath: async (path: string): Promise<string> => {
    try {
      await requestRustInvoke(RUST_SHELL_OPEN_PATH, [path])
      return ''
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        `[electronStub] shell.openPath(): ${RUST_SHELL_OPEN_PATH} failed:`,
        message
      )
      return message
    }
  }
}

// ---- BrowserWindow (push-message path only — no real window management) --------

const fakeWebContents = {
  isDestroyed: (): boolean => false,
  // Phase 35 Plan 15: signature-only widening, no-op body. steamhelper.ts calls this.
  executeJavaScript: async (_code: string): Promise<string> => '',
  send: (channel: string, ...args: unknown[]): void => {
    transport?.pushFrontendMessage(channel, ...args)
  },
  // Phase 34.5 Plan 08 (T-34.5-27): `processShortcut`'s `ctrl+shift+i` case
  // (`main.ts:1465`, `mainWindow?.webContents?.openDevTools()`) is reachable under the sidecar
  // via `shortcutsFlowRegistration.ts`'s `processShortcut` listener, which resolves
  // `getMainWindow()` to this (truthy) fakeWebContents rather than `undefined` -- the missing
  // method threw `TypeError: mainWindow.webContents.openDevTools is not a function` the moment
  // that hotkey combination was ported. Missing today because devtools is a Chromium/Electron
  // renderer-chrome concept with no Tauri WebView equivalent: opening devtools for a Tauri
  // window is new shell work (a Rust-side WebView devtools toggle), not a port of existing
  // Electron logic -- so a real implementation is out of scope here, same reasoning as `hide`'s
  // Phase 34.1 Plan 04 precedent immediately below. DECLARED DEGRADED under Tauri: this hotkey
  // is recorded as non-functional in `34.5-PORTED-CHANNELS.md`, not silently pretended to work.
  // Logs once per call so the degradation is visible, never silent.
  openDevTools: (): void => {
    console.warn(
      '[electronStub] fakeWebContents.openDevTools(): logged no-op (T-34.5-27, declared degraded) -- ' +
        'devtools is a Chromium/renderer-chrome concept with no Tauri WebView equivalent under the sidecar'
    )
  }
}

const fakeWindow = {
  isDestroyed: (): boolean => false,
  webContents: fakeWebContents,
  // Phase 35 Plan 15: signature-only widening. These four are real-window concerns with no
  // sidecar equivalent, and they stay no-ops -- but the backend now types against this stub
  // instead of Electron, so a missing member is a compile error rather than a runtime one.
  setProgressBar: (_progress: number, _options?: unknown): void => {},
  show: (): void => {},
  isVisible: (): boolean => false,
  isMinimized: (): boolean => false,
  restore: (): void => {},
  focus: (): void => {},
  // Phase 34.1 Plan 04 (Rule 1 bug fix): `handleExit()` (backend/utils.ts) is now
  // sidecar-reachable via the `quit` channel and unconditionally calls
  // `mainWindow?.hide()` after its pending-operations dialog branch -- since
  // `getMainWindow()` resolves this (truthy) fakeWindow rather than `undefined`,
  // the missing method threw `TypeError: mainWindow.hide is not a function` and
  // prevented `app.exit()` from ever being reached. A safe no-op is sufficient:
  // real window visibility is not a sidecar concern (there is no real window here).
  hide: (): void => {},
  // Phase 34.5 Plan 08 (T-34.5-27): `processShortcut`'s `ctrl+r` case (`main.ts:1465`,
  // `mainWindow?.reload()`) is reachable under the sidecar via
  // `shortcutsFlowRegistration.ts`'s `processShortcut` listener, which resolves
  // `getMainWindow()` to this (truthy) fakeWindow rather than `undefined` -- the missing method
  // threw `TypeError: mainWindow.reload is not a function` the moment that hotkey combination
  // was ported. Missing today because a renderer reload is a real-window shell concern with no
  // sidecar equivalent: routing it to an actual Tauri window reload would be new shell work, not
  // a port of existing Electron logic. DECLARED DEGRADED under Tauri: this hotkey is recorded as
  // non-functional in `34.5-PORTED-CHANNELS.md`, not silently pretended to work. Logs once per
  // call so the degradation is visible, never silent.
  reload: (): void => {
    console.warn(
      '[electronStub] fakeWindow.reload(): logged no-op (T-34.5-27, declared degraded) -- ' +
        'a renderer reload has no sidecar/window equivalent under the sidecar'
    )
  }
}

export const BrowserWindow = {
  getAllWindows: () => [fakeWindow]
}

// ---- session (D-09, accepted no-op) -------------------------------------------------
//
// Was previously not exported at all (an `import { session } ...` destructure against this
// stub's real module resolved to `undefined`) -- per 33-RESEARCH, confirmed no Steam-reachable
// code path in the sidecar's curated import graph touches Electron's `session` API (its only
// real callers, `humble/user.ts`/`legendary/user.ts`'s `session.fromPartition()` for the
// Epic/Humble embedded browser-login flows, are neither reachable from steam-user's headless
// client). Exporting a logged stub -- rather than leaving the import silently `undefined` --
// means a future reachable call fails loudly with a clear log line instead of an opaque
// "Cannot read properties of undefined" TypeError (D-09, accept + document).
/**
 * The shape `session.fromPartition()` and `defaultSession` hand back. Phase 35 Plan 15 widened
 * this from `unknown`: the D-09 stub returns `{}` and always will, but `unknown` made every
 * caller a TS18046 the moment the backend stopped importing real Electron's types (14 errors
 * across humble/user.ts and legendary/user.ts alone). The members are the ones those callers
 * actually touch; the runtime behaviour is untouched and still a logged no-op.
 */
export interface SidecarCookie {
  name: string
  value: string
  domain?: string
  path?: string
  expirationDate?: number
  secure?: boolean
  httpOnly?: boolean
}

export interface SidecarSession {
  cookies: {
    get: (filter?: unknown) => Promise<SidecarCookie[]>
    set: (details?: unknown) => Promise<void>
    remove: (url?: string, name?: string) => Promise<void>
    flushStore: () => Promise<void>
  }
  clearStorageData: (options?: unknown) => Promise<void>
  clearCache: () => Promise<void>
  clearData: (options?: unknown) => Promise<void>
  clearHostResolverCache: () => Promise<void>
  clearAuthCache: () => Promise<void>
  setPermissionRequestHandler: (handler: unknown) => void
  setUserAgent: (userAgent: string) => void
  webRequest: { onBeforeSendHeaders: (...args: unknown[]) => void }
  protocol: { handle: (...args: unknown[]) => void }
}

// EVERY method REJECTS, and that is deliberate. The first draft of this object resolved
// each call (`async () => {}`), which turned the D-09 accepted gap into a LYING one: a
// cookie wipe that reports success while wiping nothing is exactly the affordance D-05
// exists to forbid, and `humbleFlows.test.ts`'s D-05 ordering proof caught it -- that suite
// asserts the Humble store clears happen INDEPENDENTLY of every session wipe step failing.
// Rejecting keeps the documented behaviour (no session support in the sidecar) while giving
// callers a named error instead of the opaque "Cannot read properties of undefined" the
// previous `return {}` produced. That was the stated goal of this stub all along.
const sessionUnavailable = (member: string) => async (): Promise<never> => {
  throw new Error(
    `[electronStub] session.${member}(): not available in the sidecar (D-09, accepted gap)`
  )
}

const fakeSession: SidecarSession = {
  cookies: {
    get: sessionUnavailable('cookies.get'),
    set: sessionUnavailable('cookies.set'),
    remove: sessionUnavailable('cookies.remove'),
    flushStore: sessionUnavailable('cookies.flushStore')
  },
  clearStorageData: sessionUnavailable('clearStorageData'),
  clearCache: sessionUnavailable('clearCache'),
  clearData: sessionUnavailable('clearData'),
  clearHostResolverCache: sessionUnavailable('clearHostResolverCache'),
  clearAuthCache: sessionUnavailable('clearAuthCache'),
  setPermissionRequestHandler: () => {},
  setUserAgent: () => {},
  webRequest: { onBeforeSendHeaders: () => {} },
  protocol: { handle: () => {} }
}

export const session = {
  defaultSession: fakeSession,
  fromPartition: (_partition: string): SidecarSession => {
    console.warn(
      '[electronStub] session.fromPartition(): logged no-op (D-09, accepted gap) -- session partitions are not available in the sidecar'
    )
    return fakeSession
  }
}

// ---- nativeImage (Phase 34.5 gap cycle 6, plan 34.5-45, F-34.5-G6-07) ---------------------
//
// Previously a four-line stub with only `createFromPath`/`createFromDataURL`/`createEmpty`, each
// returning a bare `{}` -- the buffer-based factory member (`createFrom` + `Buffer`) did not
// exist at all. That made `shortcuts.ts:259`'s icon-buffer conversion call throw ("...is not a
// function"), so `convertPngToICNS` always failed, `generateMacOsApp` never reached its
// `run.sh` write, and the throw was swallowed into the generic `Error generating MacOS App` --
// structurally dead for EVERY macOS game, not target- or icon-format-specific. A second,
// independent instance of the same defect class sat on `steamhelper.ts:121`'s data-URL-to-JPEG
// call (reached from `prepareImagesForSteam` on the `addToSteam` path, for any non-`http` image
// URL) -- `.toJPEG` was not a function on the old bare `{}` either.
//
// Now a real, `sips`-backed implementation -- see `nativeImageShim.ts` for the full contract
// (lazy resize/crop, real toPNG/toJPEG, a loud non-darwin decline instead of a silent empty
// Buffer).
export { nativeImage } from '../sidecar/nativeImageShim'

export const screen = {
  getPrimaryDisplay: () => ({
    workAreaSize: { width: 1280, height: 800 }
  })
}

// isOnline (fix/steam-native-install-stability, gap found during 33-05 live gate): real
// Electron's `net.isOnline()` is a coarse OS-reachability pre-check consulted by
// `backend/online_monitor.ts`'s `initOnlineMonitor()` to pick the INITIAL connectivity status
// before its own authoritative `pingSites()` (axios HEAD against github/epic/gog/cloudflare)
// ever runs. Returning `true` here is deliberate, not a lie: it only lets initOnlineMonitor fall
// through to `setStatus('check-online')`, which immediately kicks off the real ping -- the
// actual online/offline signal the rest of the app relies on. Returning `false` instead would
// permanently pin the sidecar's status to `'offline'` (online_monitor.ts's `else` branch never
// re-pings on its own), which is exactly the bug this fixes: `isOnline()` in
// `downloadmanager/utils.ts` read `undefined === 'online'` (false) forever because this member
// did not exist, so every Steam install request under Tauri failed instantly with "App offline,
// skipping install" even though the machine (and Steam) were fully online.
// net.request: was previously a total silent dead end -- `on()` recorded nothing, so a
// caller's `request.on('error', ...)` handler could never fire. Added purely so `net.isOnline`
// (below) could exist alongside it, then hardened (D-06) to emit a loud, named-seam error
// instead of a bare timeout, and later RETIRED (a subsequent phase's D-06 retirement decision,
// see that phase's RESEARCH.md Discretion Finding (c) if this history needs revisiting):
// `humblePostRequest` (`backend/humble/adapter.ts`) now routes its reveal POST through a real
// `rustInvoke` seam under Tauri, so this stub has no remaining callers on that path --
// Electron's own real `net.request` is untouched, and no other caller of this stub exists in
// the codebase. The stub itself is deliberately NOT deleted (an unguarded missing method is a
// worse failure mode than a harmless logged no-op -- `sidecar-dialog-reject-crashes`'s
// governing lesson, same reasoning as `session.fromPartition`'s D-09 stub immediately above),
// but its error message no longer names a specific phase as "the missing seam" -- that seam
// now exists, and a stale phase pointer would send a future reader chasing work that already
// shipped.
//
// Fix: emit an asynchronous `'error'` event (via `setImmediate`) naming the missing seam, so
// any future caller's handler clears its own timeout and rejects immediately with an accurate
// cause. Two constraints are load-bearing, not stylistic (`sidecar-dialog-reject-crashes`):
//   1. Never throw or reject synchronously inside `request()` -- the caller registers
//      `request.on('error', ...)` on the object THIS function returns, so a synchronous
//      emission would fire before any handler could be attached and vanish silently.
//   2. Never reject a promise the caller cannot handle -- this emits an event, it does not
//      return a rejecting promise. An unguarded fire-and-forget `await` of a rejecting stub is
//      exactly how `sidecar-dialog-reject-crashes` happened. Optional invocation (`handlers['error']?.(...)`)
//      means a caller that registers no `'error'` handler is unaffected.
//
// Mirrors `session.fromPartition`'s own D-09 rationale immediately above ("fails loudly with a
// clear log line instead of an opaque TypeError") applied to its neighbour.
/** What `net.request`'s 'response' handler receives. Widened from `unknown` by plan 35-15. */
export interface SidecarIncomingMessage {
  statusCode: number
  statusMessage: string
  headers: Record<string, string | string[]>
  on: {
    (event: 'data', cb: (chunk: Buffer) => unknown): void
    (event: 'end', cb: () => void): void
    (event: 'error', cb: (err: Error) => void): void
    (event: string, cb: (arg?: never) => void): void
  }
  setEncoding: (encoding: string) => void
}

export const net = {
  request: (
    _options?: unknown,
    _callback?: (response: SidecarIncomingMessage) => void
  ) => {
    const handlers: Record<string, (arg?: unknown) => void> = {}
    setImmediate(() => {
      handlers['error']?.(
        new Error(
          '[electronStub] net.request(): not implemented in the sidecar'
        )
      )
    })
    return {
      // Phase 35 Plan 15: signature-only widening. Behaviour is unchanged -- the stub still
      // fires 'error' on the next tick and implements nothing -- but the shapes are the ones
      // humble/adapter.ts and images_cache.ts actually pass and read, so a compile error no
      // longer stands in for the runtime no-op this deliberately is.
      on: ((event: string, cb: (arg?: never) => void): void => {
        handlers[event] = cb as (arg?: unknown) => void
      }) as {
        (
          event: 'response',
          cb: (response: SidecarIncomingMessage) => void
        ): void
        (event: 'error', cb: (error: Error) => void): void
        (event: string, cb: (arg?: unknown) => void): void
      },
      abort: (): void => {},
      end: (_chunk?: unknown): void => {},
      write: (_chunk?: unknown): void => {},
      setHeader: (_name?: string, _value?: unknown): void => {}
    }
  },
  isOnline: (): boolean => true
}

export const Menu = {
  buildFromTemplate: (_template?: unknown) => ({ popup: () => {} }),
  setApplicationMenu: (): void => {}
}

// SURVIVES-AS-GAP (35-PREFLIGHT PD-B): the sole consumer is `backend/images_cache.ts`'s
// `imagecache` scheme, an ACCEPTED D-05 gap — custom protocol registration has no Tauri
// equivalent wired yet, so these stay no-ops. Do NOT delete this as unused: it has a real
// caller, and that caller is knowingly degraded rather than absent.
export const protocol = {
  registerFileProtocol: (): void => {},
  registerHttpProtocol: (): void => {},
  handle: (
    _scheme?: string,
    _handler?: (request: { url: string }) => unknown
  ): void => {}
}

// D-08 (Phase 35 Plan 08, REQ-35-06): REAL as of the Phase 35 cutover this comment's earlier
// version scheduled. The history is kept because it records why the gap existed and what it cost.
//
// WAS (Phase 33): an accepted no-op. 33-RESEARCH found no maintained Tauri v2 wake-lock plugin
// meeting the "cheap and maintained" bar -- tauri-plugin-nosleep and tauri-plugin-keepawake were
// both rejected on maintenance recency -- so `start()` logged, returned `-1`, and held nothing.
// The real cost of that: the system idle-slept during long depot downloads, and `launcher.ts`'s
// `prevent-display-sleep` let the screen blank while a game was running. Both are user-visible
// on any machine with default power settings.
//
// IS NOW: a real forward to the Rust shell's `wake_lock_start`/`wake_lock_stop` arms, which take
// genuine per-platform OS power assertions (IOKit on macOS, SetThreadExecutionState on Windows,
// systemd-inhibit on Linux). 33-RESEARCH's plugin verdict was re-checked before this was written
// and HELD, so the binding is first-party -- see 35-08-SUMMARY.md for versions and dates.
//
// The two assertion KINDS stay distinct end to end. `'prevent-display-sleep'` (a game is running)
// and `'prevent-app-suspension'` (a download is in progress) are different OS assertions on every
// platform, and the Rust side rejects any other string rather than defaulting to one of them.
//
// SYNC/ASYNC BRIDGE -- why the id is allocated HERE and not taken from Rust:
// real Electron's `powerSaveBlocker.start()` is SYNCHRONOUS and returns a number, and callers
// store that number immediately (`launcher.ts`: `powerDisplayId = powerSaveBlocker.start(...)`).
// The Tauri command behind it is a Promise. A synchronous function structurally cannot await one,
// so this stub mints its own id, returns it in the same tick, and resolves the Rust id into
// `heldIds` when the round-trip lands. That keeps every existing call site byte-identical --
// nothing had to become async -- at the cost of a brief window where an id is held locally but
// not yet mapped to a Rust assertion, which `stop()` handles explicitly below.
//
// Ids start at 1, never 0: `launcher.ts`'s re-entry guard is `if (!powerDisplayId)`, which would
// read 0 as "no lock held" and take a second assertion on every launch, leaking the first.
let nextWakeLockId = 1

/**
 * JS id -> the Rust assertion id `wake_lock_start` resolved for it. An entry exists only while
 * the assertion is genuinely held: a rejected start deletes its entry, so a later `stop()` on
 * that id is a no-op rather than an error against an assertion Rust never took.
 *
 * `null` marks "start is still in flight" -- the id is live from the caller's point of view but
 * has no Rust id yet.
 */
const heldWakeLocks = new Map<number, number | null>()

export const powerSaveBlocker = {
  // `type` is REQUIRED, matching real Electron's own signature. Deliberately not defaulted: a
  // default kind is the silent collapse threat T-35-32 describes, and making it required turns
  // a caller that forgot to say which assertion it wants into a compile error instead.
  start: (type: string): number => {
    const id = nextWakeLockId++
    heldWakeLocks.set(id, null)
    requestRustInvoke(RUST_WAKE_LOCK_START, [type])
      .then((rustId) => {
        // A `stop()` may have already landed while this was in flight; if it did, the entry is
        // gone and the assertion must be released rather than recorded as held.
        if (!heldWakeLocks.has(id)) {
          if (typeof rustId === 'number') {
            requestRustInvoke(RUST_WAKE_LOCK_STOP, [rustId]).catch(() => {})
          }
          return
        }
        if (typeof rustId === 'number') {
          heldWakeLocks.set(id, rustId)
        } else {
          heldWakeLocks.delete(id)
        }
      })
      .catch((error) => {
        // Failure is logged, never thrown: real Electron's start() cannot surface an error
        // either, and an unhandled rejection here would take down a game launch. Dropping the
        // entry is what makes a later stop() on this id a silent no-op instead of an error.
        heldWakeLocks.delete(id)
        console.warn(
          `[electronStub] powerSaveBlocker.start(): ${RUST_WAKE_LOCK_START} failed:`,
          error instanceof Error ? error.message : String(error)
        )
      })
    return id
  },
  // `id` is REQUIRED, matching the real API this replaces. The Phase 33 stub took none, which is why the
  // `unlock` handler in appShellFlowRegistration.ts could not release a specific assertion.
  stop: (id: number): void => {
    if (!heldWakeLocks.has(id)) return
    const rustId = heldWakeLocks.get(id)
    heldWakeLocks.delete(id)
    // `null` means start never landed. Deleting the entry above is enough: start's own `.then`
    // sees the missing entry and releases the assertion if one did arrive.
    if (rustId === null || rustId === undefined) return
    requestRustInvoke(RUST_WAKE_LOCK_STOP, [rustId]).catch((error) => {
      console.warn(
        `[electronStub] powerSaveBlocker.stop(): ${RUST_WAKE_LOCK_STOP} failed:`,
        error instanceof Error ? error.message : String(error)
      )
    })
  },
  // D-05: answers from real state, not a hardcoded `false`. A stale `false` here is exactly the
  // lying accessor D-05 targets -- it would tell a caller nothing is holding the machine awake
  // while an assertion was live.
  isStarted: (): boolean => heldWakeLocks.size > 0
}

export const clipboard = {
  // Phase 34.3 Plan 05 (D-01/D-02/D-03, REQ-34.3-03/04): graduated from the D-04 logged no-op
  // (Phase 31 -- "deferred to Phase 33", never collected) to a real forward, backed by
  // tauri-plugin-clipboard-manager's write_text (RUST_CLIPBOARD_WRITE_TEXT). Byte-shape-identical
  // to shell.showItemInFolder above: fire-and-forget (mirrors real Electron's void-returning
  // clipboard.writeText) -- never throws; a transport failure is logged, never silent. Log-only
  // failure is deliberate Electron parity, not a shortcut: real clipboard.writeText is void and
  // cannot surface failure either, so matching it keeps both builds behaviorally identical.
  writeText: (text: string): void => {
    requestRustInvoke(RUST_CLIPBOARD_WRITE_TEXT, [text]).catch((error) => {
      console.warn(
        `[electronStub] clipboard.writeText(): ${RUST_CLIPBOARD_WRITE_TEXT} failed:`,
        error instanceof Error ? error.message : String(error)
      )
    })
  },
  // D-04: DELIBERATELY DEAD -- this member is NOT a shortcut left over, it is a documented,
  // permanent no-op. Real Electron's clipboard.readText() is synchronous, so this stub stays
  // synchronous to keep faithfully impersonating that shape -- but a sync function structurally
  // cannot await a Rust round-trip. The ONLY sidecar-reachable caller is `clipboardReadText`
  // (registered with addHandler, async), which awaits requestRustInvoke(RUST_CLIPBOARD_READ_TEXT,
  // []) directly inside its own handler (clipboardFlowRegistration.ts, Plan 06) and never calls
  // this member. No other backend module may call this and expect a real value.
  readText: (): string => ''
}

export class Tray {
  constructor(_icon?: unknown) {}
  setToolTip(): void {}
  setContextMenu(): void {}
  on(): this {
    return this
  }
}

// ---------------------------------------------------------------------------
// TYPE RE-EXPORTS (Phase 35 plan 13, Task 2 -- D-03, REQ-35-02).
//
// `./types.ts` declares first-party replacements for every electron type this
// tree references, so that `from 'backend/platform'` serves BOTH the value
// imports above and the type imports, and plan 35-15's mechanical rewrite stays
// a one-string change per site.
//
// `export type { ... }` (not a bare `export { ... }`) so nothing here is emitted
// at runtime -- this module is the esbuild `--alias:electron=` target and must
// not grow a runtime dependency on a declarations-only file.
//
// NOTE ON `BrowserWindow`: `./types.ts` also declares a `BrowserWindow` type (the
// window INSTANCE type that `backend/utils/openDialog.ts` names). It is NOT
// re-exported here, because this module already exports a `BrowserWindow` VALUE
// above -- a plain object with `getAllWindows()`, standing in for electron's
// class. The two are different things that happen to share a name in electron
// only because a class supplies both meanings at once, which a `const` cannot.
// Consumers that need the instance type import it from `backend/platform/types`
// directly. Recorded here so plan 35-15 does not discover it as a surprise.
// ---------------------------------------------------------------------------
export type {
  IpcRendererEvent,
  IpcMainEvent,
  IpcMainInvokeEvent,
  Event,
  DidFailLoadEvent,
  WebviewTag,
  FileFilter,
  OpenDialogOptions,
  MessageBoxOptions,
  ShortcutDetails,
  MenuItemConstructorOptions,
  BrowserWindowConstructorOptions,
  TitleBarOverlay,
  Rectangle,
  Display,
  MouseInputEvent,
  MouseWheelInputEvent,
  KeyboardInputEvent,
  CrossProcessExports
} from './types'
