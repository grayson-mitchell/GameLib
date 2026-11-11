/**
 * The 66.3 interim delegate for the Electron-module facade (D-66.3-02).
 *
 * `backend/platform` used to be the headless sidecar's stand-in for `require('electron')`:
 * module state, an ipcMain recorder, a transport binding and real behaviour for dialogs,
 * notifications, shell, wake locks and the clipboard. That behaviour now lives in the stateless
 * host services under `src/backend/host/` (built once by the 'host-services' boot step and held
 * on `BootServices.host`) and the registry in `src/backend/sidecar/ipcRegistry.ts`.
 *
 * What remains here is a thin delegate that keeps every export name its current importers use
 * until the cascade plans rewire them to take services directly; plan 18 deletes this file.
 * Exactly one module-state site exists (`bound`, set by `bindHostServices` at the 'shim-bind'
 * boot step), and the registry behind `ipcMain` / `handlerRegistry` / `listenerRegistry` is the
 * same object as `BootServices.host.ipc` (`interimIpc`), so there is no split-brain registry.
 * No `Module._load` hook exists; this module is the esbuild `--alias:electron=` target only for
 * the type surface, and `from 'backend/platform'` is a plain import.
 *
 * Unbound behaviour (before 'shim-bind'): `shell.openExternal` and `webContents.send` are
 * no-ops, as the unbound transport always made them; every other stateful member logs
 * `[platform delegate] <member> called before the host-services boot step` and returns its
 * documented safe default (dialogs resolve the caller's cancelId / a cancel, counts are 0,
 * `powerSaveBlocker.start` returns -1). Nothing here ever throws or rejects.
 *
 * Still real here (stateless): `app.getPath`, `getAppPath`, `getVersion`, `userAgentFallback`
 * and `isPackaged`. The window/session/net/menu/protocol/tray members are no-op stand-ins whose
 * call sites the cascade plans delete; `safeStorage` is intentionally dead (steam/tokenStore.ts).
 */

import { release as osRelease } from 'os'

import { getPath } from '../sidecar/pathShim'
import { isPackagedSidecar } from '../sidecar/isPackagedSidecar'
import { resolveAppInfo } from '../host/appInfo'
import type { HostServices } from '../host'
import {
  createIpcRegistry,
  type IpcHandler,
  type IpcListener
} from '../sidecar/ipcRegistry'
import type { MessageBoxOptions, OpenDialogOptions } from './types'
import type { SaveDialogOptions } from '../host/dialogs'

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
// constants/paths.ts) calls `app.getPath('appData')` at MODULE SCOPE, which requires this file to
// have loaded first (the retired installElectronHook.ts used to guarantee that; bootstrap.ts now
// imports this file first itself), so importing backend/logger
// here would reintroduce the exact "second wall" bootstrap.ts's docstring warns about, just one
// file earlier in the chain. `console.warn` is used instead for the one error path below.

// ---- Delegate binding -------------------------------------------------------------
//
// bootstrap.ts's 'shim-bind' step calls bindHostServices() strictly after the RPC server
// starts, which is always before any real call can occur (those only fire from handler bodies
// invoked over the RPC loop, never at module-import time).

let bound: HostServices | null = null

export function bindHostServices(next: HostServices): void {
  bound = next
}

const unbound = (member: string): void => {
  console.warn(
    `[platform delegate] ${member} called before the host-services boot step`
  )
}

// ---- ipcMain recorder --------------------------------------------------------

export type { IpcHandler, IpcListener }

/** The ONE registry instance; the boot step uses it as `BootServices.host.ipc`. */
export const interimIpc = createIpcRegistry()

/** channel -> registered `ipcMain.handle` handler. Read/write view over `interimIpc`. */
export const handlerRegistry = Object.freeze({
  get: (channel: string): IpcHandler | undefined =>
    interimIpc.getHandler(channel),
  has: (channel: string): boolean => interimIpc.handlerMap().has(channel),
  set: (channel: string, handler: IpcHandler): void =>
    interimIpc.handle(channel, handler),
  delete: (channel: string): boolean => {
    const had = interimIpc.handlerMap().has(channel)
    interimIpc.removeHandler(channel)
    return had
  },
  clear: (): void => {
    for (const channel of [...interimIpc.handlerMap().keys()]) {
      interimIpc.removeHandler(channel)
    }
  },
  keys: () => interimIpc.handlerMap().keys(),
  entries: () => interimIpc.handlerMap().entries(),
  [Symbol.iterator]: () => interimIpc.handlerMap().entries(),
  get size(): number {
    return interimIpc.handlerMap().size
  }
})

/** channel -> registered `ipcMain.on`/`ipcMain.once` listeners. View over `interimIpc`. */
export const listenerRegistry = Object.freeze({
  get: (channel: string): readonly IpcListener[] | undefined =>
    interimIpc.listenerMap().get(channel),
  has: (channel: string): boolean => interimIpc.listenerMap().has(channel),
  set: (channel: string, listeners: readonly IpcListener[]): void => {
    interimIpc.removeAllListeners(channel)
    for (const listener of listeners) interimIpc.on(channel, listener)
  },
  delete: (channel: string): boolean => {
    const had = interimIpc.listenerMap().has(channel)
    interimIpc.removeAllListeners(channel)
    return had
  },
  clear: (): void => {
    for (const channel of [...interimIpc.listenerMap().keys()]) {
      interimIpc.removeAllListeners(channel)
    }
  },
  keys: () => interimIpc.listenerMap().keys(),
  entries: () => interimIpc.listenerMap().entries(),
  [Symbol.iterator]: () => interimIpc.listenerMap().entries(),
  get size(): number {
    return interimIpc.listenerMap().size
  }
})

export const ipcMain = {
  handle: (channel: string, handler: IpcHandler): void =>
    interimIpc.handle(channel, handler),
  removeHandler: (channel: string): void => interimIpc.removeHandler(channel),
  on: (channel: string, listener: IpcListener): void =>
    interimIpc.on(channel, listener),
  once: (channel: string, listener: IpcListener): void =>
    interimIpc.once(channel, listener)
}

// ---- app ---------------------------------------------------------------------

// Stateless app facts come from resolveAppInfo(); the getters defer the isPackaged probe to the
// read (paths.ts reads `app.isPackaged` at module scope, so freezing it at construction would
// bake in whatever the SEA context looked like at the earliest possible moment).
// `./isPackagedSidecar` is the SINGLE derivation in the tree; never re-derive it here.
const appInfo = () =>
  resolveAppInfo({
    platform: process.platform,
    osRelease: osRelease(),
    isPackaged: isPackagedSidecar()
  })

export const app = {
  getPath,
  getName: (): string => 'GameLib',
  setName: (): void => {},
  setAboutPanelOptions: (_options?: unknown): void => {},
  showAboutPanel: (): void => {},
  getGPUInfo: async (_infoType?: string): Promise<unknown> => ({}),
  get isPackaged(): boolean {
    return isPackagedSidecar()
  },
  // GAMELIB_APP_ROOT (Phase 34.5 Plan 16, G-1): the Tauri shell's own app root, handed down at
  // spawn time. Deliberately non-throwing: `getAppPath()` is called at MODULE SCOPE by
  // `backend/constants/paths.ts`, so an unset or empty value falls back to `process.cwd()`
  // (jest and any non-Tauri host see no behaviour change).
  getAppPath: (): string => process.env.GAMELIB_APP_ROOT || process.cwd(),
  getVersion: (): string => appInfo().version,
  get userAgentFallback(): string {
    return appInfo().userAgentFallback
  },
  whenReady: (): Promise<void> => Promise.resolve(),
  on: () => app,
  once: () => app,
  quit: (): void => {
    if (!bound) return unbound('app.quit()')
    bound.appState.quit()
  },
  exit: (): void => {
    if (!bound) return unbound('app.exit()')
    bound.appState.exit()
  },
  relaunch: (): void => {
    if (!bound) return unbound('app.relaunch()')
    bound.appState.relaunch()
  },
  requestSingleInstanceLock: (): boolean => true,
  setAsDefaultProtocolClient: (): boolean => true,
  hide: (): void => {
    if (!bound) return unbound('app.hide()')
    bound.appState.hide()
  },
  raiseMainWindow: (): void => {
    if (!bound) return unbound('app.raiseMainWindow()')
    bound.appState.raiseMainWindow()
  },
  hideMainWindow: (): void => {
    if (!bound) return unbound('app.hideMainWindow()')
    bound.appState.hideMainWindow()
  },
  raiseMainWindowIfHiddenByGameLib: (): void => {
    if (!bound) return unbound('app.raiseMainWindowIfHiddenByGameLib()')
    bound.appState.raiseMainWindowIfHiddenByGameLib()
  },
  raiseMainWindowForInAppDialog: (): void => {
    if (!bound) return unbound('app.raiseMainWindowForInAppDialog()')
    bound.appState.raiseMainWindowForInAppDialog()
  },
  inAppDialogRaiseCount: (): number => {
    if (!bound) {
      unbound('app.inAppDialogRaiseCount()')
      return 0
    }
    return bound.appState.inAppDialogRaiseCount()
  },
  openBridgeInvitePicker: (payload: {
    appId: string
    ackId: string
  }): Promise<boolean> => {
    if (!bound) {
      unbound('app.openBridgeInvitePicker()')
      return Promise.resolve(false)
    }
    return bound.appState.openBridgeInvitePicker(payload)
  }
}

// ---- dialog --------------------------------------------------------------------
//
// The real behaviour lives in host/dialogs.ts. The delegate keeps the (window, options) call
// shape the existing callers use. The two Sync members stay logged no-ops (D-03): synchronous
// dialogs cannot cross the async rustInvoke transport.

const optionsOf = <T>(windowOrOptions?: unknown, maybeOptions?: unknown): T =>
  (maybeOptions ?? windowOrOptions) as T

export const dialog = {
  showErrorBox: async (title?: string, content?: string): Promise<void> => {
    if (!bound) return unbound('dialog.showErrorBox()')
    await bound.dialogs.showErrorBox(title, content)
  },
  showMessageBox: async (
    windowOrOptions?: unknown,
    maybeOptions?: unknown
  ): Promise<{ response: number; checkboxChecked: boolean }> => {
    const options = optionsOf<MessageBoxOptions | undefined>(
      windowOrOptions,
      maybeOptions
    )
    if (!bound) {
      unbound('dialog.showMessageBox()')
      const safeIndex = options?.cancelId ?? (options?.buttons?.length ?? 1) - 1
      return { response: safeIndex, checkboxChecked: false }
    }
    const result = await bound.dialogs.showMessageBox(
      options ?? { message: '' }
    )
    return { response: result.response, checkboxChecked: false }
  },
  showMessageBoxSync: (_window?: unknown, _options?: unknown): number => {
    console.warn(
      '[platformApi] dialog.showMessageBoxSync(): logged no-op (D-03) -- synchronous dialogs cannot cross the async rustInvoke transport; returns the default response (0)'
    )
    return 0
  },
  showOpenDialog: async (
    _window?: unknown,
    options?: OpenDialogOptions
  ): Promise<{ canceled: boolean; filePaths: string[] }> => {
    if (!bound) {
      unbound('dialog.showOpenDialog()')
      return { canceled: true, filePaths: [] }
    }
    return bound.dialogs.showOpenDialog(options ?? {})
  },
  showOpenDialogSync: (): undefined => {
    console.warn(
      '[platformApi] dialog.showOpenDialogSync(): logged no-op (D-03) -- synchronous dialogs cannot cross the async rustInvoke transport'
    )
    return undefined
  },
  showSaveDialog: async (
    _window?: unknown,
    options?: SaveDialogOptions
  ): Promise<{ canceled: boolean; filePath?: string }> => {
    if (!bound) {
      unbound('dialog.showSaveDialog()')
      return { canceled: true, filePath: undefined }
    }
    return bound.dialogs.showSaveDialog(options ?? {})
  }
}

// ---- Notification ----------------------------------------------------------------
//
// Real OS notification via host/notifications.ts. Only 'show' (Electron's own event of that
// name) and 'failed' are ever emitted; other events (e.g. 'click') are accepted and ignored.
// The class keeps its per-instance listener table; the shared state is the bound service.

interface NotificationOptions {
  title?: string
  body?: string
  // Type-only widening: utils.ts's offline notification passes these three; they are ignored.
  urgency?: 'normal' | 'critical' | 'low'
  timeoutType?: 'default' | 'never'
  silent?: boolean
}

// Widened so dialog.ts's `() => void` click handler and `(event, error: string)` failed handler
// both fit, as Electron's overloaded `on` allows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotificationListener = (...args: any[]) => void

export class Notification {
  static isSupported(): boolean {
    return true
  }

  private readonly options: NotificationOptions

  constructor(options?: NotificationOptions) {
    this.options = options ?? {}
  }

  private readonly listeners = new Map<string, NotificationListener[]>()

  on(event?: string, listener?: NotificationListener): this {
    if (event && listener) {
      const list = this.listeners.get(event) ?? []
      list.push(listener)
      this.listeners.set(event, list)
    }
    return this
  }

  private emit(event: string, payload: string | undefined): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        listener({ sender: this }, payload)
      } catch (listenerError) {
        console.warn(
          `[platformApi] Notification '${event}' listener threw:`,
          listenerError instanceof Error
            ? listenerError.message
            : String(listenerError)
        )
      }
    }
  }

  show(): void {
    if (!bound) return unbound('Notification.show()')
    bound.notifications.show(
      { title: this.options.title, body: this.options.body },
      {
        onShown: (backend) => this.emit('show', backend),
        onFailed: (message) => this.emit('failed', message)
      }
    )
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
  // Windows-only in real Electron; returns false rather than pretending. The sidecar DOES run on
  // Windows, so `shortcuts.ts` writes `.lnk` files through `windowsShortcut.ts` instead.
  writeShortcutLink: (
    _shortcutPath: string,
    _operation?: unknown,
    _options?: unknown
  ): boolean => false,
  // Unbound (jest on a Mac before 'shim-bind') is a no-op, so no real `open` is ever spawned.
  openExternal: async (url: string, options?: unknown): Promise<void> => {
    if (!bound) return
    await bound.openExternal.openExternal(url, options)
  },
  showItemInFolder: (fullPath: string): void => {
    if (!bound) return unbound('shell.showItemInFolder()')
    bound.openExternal.showItemInFolder(fullPath)
  },
  // D-05: a LOGGED no-op (never silent) -- no vetted first-party Tauri v2 trash plugin exists.
  trashItem: async (): Promise<void> => {
    console.warn(
      '[platformApi] shell.trashItem(): logged no-op (D-05, Phase 33) -- no vetted Tauri v2 trash-capable plugin found; item is NOT moved to the OS trash'
    )
  },
  openPath: async (path: string): Promise<string> => {
    if (!bound) {
      unbound('shell.openPath()')
      return '[platform delegate] not bound'
    }
    return bound.openExternal.openPath(path)
  }
}

// ---- BrowserWindow (push-message path only — no real window management) --------

const fakeWebContents = {
  isDestroyed: (): boolean => false,
  // Phase 35 Plan 15: signature-only widening, no-op body. steamhelper.ts calls this.
  executeJavaScript: async (_code: string): Promise<string> => '',
  send: (channel: string, ...args: unknown[]): void => {
    // Unbound: dropped, exactly as the unbound transport always did (no buffering).
    bound?.pushFrontendMessage(channel, ...args)
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
      '[platformApi] fakeWebContents.openDevTools(): logged no-op (T-34.5-27, declared degraded) -- ' +
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
      '[platformApi] fakeWindow.reload(): logged no-op (T-34.5-27, declared degraded) -- ' +
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
    `[platformApi] session.${member}(): not available in the sidecar (D-09, accepted gap)`
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
      '[platformApi] session.fromPartition(): logged no-op (D-09, accepted gap) -- session partitions are not available in the sidecar'
    )
    return fakeSession
  }
}

// ---- nativeImage ------------------------------------------------------------------------
//
// The `sips`-backed implementation is host.imageTools (see nativeImageShim.ts for the full
// contract). The delegate forwards each factory to the bound instance; unbound, a call throws
// the same way an unbound transport's runSync did.
const imageTools = (): HostServices['imageTools'] => {
  if (!bound) throw new Error('platformApi host services not bound')
  return bound.imageTools
}

export const nativeImage = {
  createFromBuffer: (buffer: Buffer) => imageTools().createFromBuffer(buffer),
  createFromPath: (path: string) => imageTools().createFromPath(path),
  createFromDataURL: (dataUrl: string) =>
    imageTools().createFromDataURL(dataUrl),
  createEmpty: () => imageTools().createEmpty()
}

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
        new Error('[platformApi] net.request(): not implemented in the sidecar')
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

// ---- powerSaveBlocker / clipboard -----------------------------------------------------
//
// Real behaviour (the sync-id/async-Rust bridge, ids starting at 1 so launcher.ts's
// `if (!powerDisplayId)` guard works) lives in host/appState.ts `wakeLock`. Unbound,
// `start` returns -1 and holds nothing.

export const powerSaveBlocker = {
  // `type` is REQUIRED, matching real Electron's own signature: a default kind would be the
  // silent collapse threat T-35-32 describes.
  start: (type: string): number => {
    if (!bound) {
      unbound('powerSaveBlocker.start()')
      return -1
    }
    return bound.appState.wakeLock.start(type)
  },
  stop: (id: number): void => {
    if (!bound) return unbound('powerSaveBlocker.stop()')
    bound.appState.wakeLock.stop(id)
  },
  isStarted: (): boolean => bound?.appState.wakeLock.isStarted() ?? false
}

export const clipboard = {
  writeText: (text: string): void => {
    if (!bound) return unbound('clipboard.writeText()')
    bound.appState.writeClipboardText(text)
  },
  // D-04: DELIBERATELY DEAD -- real Electron's readText() is synchronous, a sync function cannot
  // await a Rust round-trip. The only sidecar-reachable caller (`clipboardReadText`) awaits
  // requestRustInvoke(RUST_CLIPBOARD_READ_TEXT, []) directly and never calls this member.
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
