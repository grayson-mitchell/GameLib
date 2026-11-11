/**
 * Host-shape types shared by the sidecar backend, the preload bridge and the renderer.
 *
 * These replace the type surface of the retired `backend/platform` Electron facade (deleted in
 * 66.3). They are first-party declarations of the few Electron-shaped values this tree still
 * names: the IPC event placeholders (opaque brands; no field is read except
 * `IpcMainInvokeEvent.sender.send`), the dialog option bags and the window geometry types.
 * Nothing here has a runtime value.
 */

export interface IpcRendererEvent {
  /** Opaque brand. Not a real electron field; see SECTION 1. */
  readonly __gamelibIpcRendererEvent: never
}

export interface IpcMainEvent {
  /** Opaque brand. Not a real electron field; see SECTION 1. */
  readonly __gamelibIpcMainEvent: never
}

export interface IpcMainInvokeEvent {
  readonly sender: {
    send(channel: string, ...args: unknown[]): void
  }
}

export interface FileFilter {
  extensions: string[]
  name: string
}

export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: FileFilter[]
  properties?: Array<
    | 'openFile'
    | 'openDirectory'
    | 'multiSelections'
    | 'showHiddenFiles'
    | 'createDirectory'
    | 'promptToCreate'
    | 'noResolveAliases'
    | 'treatPackageAsDirectory'
    | 'dontAddToRecent'
  >
  message?: string
  securityScopedBookmarks?: boolean
}

export interface MessageBoxOptions {
  message: string
  type?: 'none' | 'info' | 'error' | 'question' | 'warning'
  buttons?: string[]
  defaultId?: number
  signal?: AbortSignal
  title?: string
  detail?: string
  checkboxLabel?: string
  checkboxChecked?: boolean
  icon?: string
  textWidth?: number
  cancelId?: number
  noLink?: boolean
  normalizeAccessKeys?: boolean
}

export interface TitleBarOverlay {
  color?: string
  symbolColor?: string
  height?: number
}

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}
