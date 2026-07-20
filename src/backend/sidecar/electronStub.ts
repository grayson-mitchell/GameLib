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
 * `safeStorage` (byte round-trip, T-27-05 accepted passthrough),
 * `shell.openExternal` (the E2E action-flow parity path), and
 * `BrowserWindow.getAllWindows()` (the `sendFrontendMessage` push path
 * `backend/ipc.ts` already implements via `getMainWindow()`) have real
 * behavior — everything else only needs to not throw at import time.
 */

import { getPath } from './pathShim'

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

export const dialog = {
  showErrorBox: (): void => {},
  showMessageBox: async () => ({ response: 0, checkboxChecked: false }),
  showMessageBoxSync: (): number => 0,
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showOpenDialogSync: (): undefined => undefined,
  showSaveDialog: async () => ({ canceled: true, filePath: undefined })
}

// ---- Notification ----------------------------------------------------------------

export class Notification {
  static isSupported(): boolean {
    return false
  }
  constructor(_options?: unknown) {}
  on(): this {
    return this
  }
  show(): void {}
  close(): void {}
}

// ---- safeStorage (T-27-05: minimal passthrough — keyring deferred per CONTEXT) ---

export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (plainText: string): Buffer =>
    Buffer.from(plainText, 'utf-8'),
  decryptString: (encrypted: Buffer): string => encrypted.toString('utf-8')
}

// ---- shell -------------------------------------------------------------------------

export const shell = {
  openExternal: async (url: string): Promise<void> => {
    transport?.openExternal(url)
  },
  showItemInFolder: (): void => {},
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
  writeText: (): void => {},
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
