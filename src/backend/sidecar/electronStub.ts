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
 */

import { release as osRelease } from 'os'

import { getPath } from './pathShim'
import { requestRustInvoke } from './sidecarRpc'
import {
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_OPEN,
  RUST_DIALOG_SAVE,
  RUST_NOTIFICATION_SHOW
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

export type IpcHandler = (
  event: unknown,
  ...args: unknown[]
) => unknown | Promise<unknown>
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

export const app = {
  getPath,
  getName: (): string => 'GameLib',
  setName: (): void => {},
  isPackaged: false,
  getAppPath: (): string => process.cwd(),
  getVersion: (): string => process.env.npm_package_version ?? '0.0.0',
  whenReady: (): Promise<void> => Promise.resolve(),
  on: () => app,
  once: () => app,
  quit: (): void => {},
  exit: (): void => {},
  relaunch: (): void => {},
  requestSingleInstanceLock: (): boolean => true,
  setAsDefaultProtocolClient: (): boolean => true
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
// callers `await` it unguarded and fire-and-forget (no try/catch, no `.catch()`), and this
// sidecar process has no `process.on('unhandledRejection')` guard -- an always-rejecting stub
// would crash the sidecar the first time either path is hit. `-1` is neither `0`
// (promptI386Recovery's affirmative/destructive branch, decline = `response !== 0`) nor `1`
// (askForceUninstall's destructive branch, decline = `response !== 1`), so it declines BOTH
// reachable callers. `handleExit`'s inverted sense (`response === 0` = safe "No") is moot: it
// is wired in `main.ts` via `app.on('before-quit')`, and `main.ts` is not in the sidecar's
// curated import graph, so `handleExit` never runs under the sidecar. Real multi-button
// `showMessageBox` behavior is deferred to Phase 33 (lifecycle/dialog cluster).
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
  showMessageBoxSync: (): number => {
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
}

export class Notification {
  static isSupported(): boolean {
    return true
  }

  private readonly options: NotificationOptions

  constructor(options?: NotificationOptions) {
    this.options = options ?? {}
  }

  on(): this {
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
  encryptString: (): Buffer => {
    throw new Error(
      'safeStorage is not available in the sidecar — use getTokenStore() (see steam/tokenStore.ts)'
    )
  },
  decryptString: (): string => {
    throw new Error(
      'safeStorage is not available in the sidecar — use getTokenStore() (see steam/tokenStore.ts)'
    )
  }
}

// ---- shell -------------------------------------------------------------------------

export const shell = {
  openExternal: async (url: string): Promise<void> => {
    transport?.openExternal(url)
  },
  // D-04 (REQ-31-04): upgraded from a silent no-op to a logged one -- a caller relying on the
  // OS file-manager reveal getting neither the reveal nor a signal that it didn't happen is a
  // debugging trap. Real reveal support is deferred to Phase 33.
  showItemInFolder: (_fullPath: string): void => {
    console.warn(
      '[electronStub] shell.showItemInFolder(): logged no-op (D-04, deferred to Phase 33) -- reveal-in-file-manager is not yet forwarded to Rust'
    )
  },
  trashItem: async (): Promise<void> => {},
  openPath: async (): Promise<string> => ''
}

// ---- BrowserWindow (push-message path only — no real window management) --------

const fakeWebContents = {
  isDestroyed: (): boolean => false,
  send: (channel: string, ...args: unknown[]): void => {
    transport?.pushFrontendMessage(channel, ...args)
  }
}

const fakeWindow = {
  isDestroyed: (): boolean => false,
  webContents: fakeWebContents
}

export const BrowserWindow = {
  getAllWindows: () => [fakeWindow]
}

// ---- Remaining main-process surfaces (safe no-ops; out of scope per 27-CONTEXT) --

export const nativeImage = {
  createFromPath: () => ({}),
  createFromDataURL: () => ({}),
  createEmpty: () => ({})
}

export const screen = {
  getPrimaryDisplay: () => ({
    workAreaSize: { width: 1280, height: 800 }
  })
}

export const net = {
  request: () => ({
    on: (): void => {},
    end: (): void => {},
    write: (): void => {},
    setHeader: (): void => {}
  })
}

export const Menu = {
  buildFromTemplate: () => ({}),
  setApplicationMenu: (): void => {}
}

export const protocol = {
  registerFileProtocol: (): void => {},
  registerHttpProtocol: (): void => {},
  handle: (): void => {}
}

export const powerSaveBlocker = {
  start: (): number => -1,
  stop: (): void => {},
  isStarted: (): boolean => false
}

export const clipboard = {
  // D-04 (REQ-31-04): upgraded from a silent no-op to a logged one -- see shell.showItemInFolder
  // above for the rationale. Real clipboard-write support is deferred to Phase 33.
  writeText: (_text: string): void => {
    console.warn(
      '[electronStub] clipboard.writeText(): logged no-op (D-04, deferred to Phase 33) -- clipboard writes are not yet forwarded to Rust'
    )
  },
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
