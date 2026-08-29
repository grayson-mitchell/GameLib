/* eslint-disable @typescript-eslint/no-namespace */
//
// FIRST-PARTY ELECTRON TYPE DECLARATIONS (Phase 35 plan 13, Task 2 -- D-03,
// REQ-35-02).
//
// WHAT THIS FILE IS. Every type declared here replaces a name the tree currently
// reads out of the `electron` package -- either through the AMBIENT `Electron`
// namespace that `node_modules/electron/electron.d.ts` installs globally
// (`Electron.IpcRendererEvent`, `Electron.WebviewTag`, ...), or through an
// explicit `import type { X } from 'electron'`. Neither shape survives the
// phase: plan 35-15 rewrites the import sites to `backend/platform`, plan 35-16
// rewrites the bare `Electron.` namespace references, and plan 35-18 removes
// `electron` from `package.json` altogether. At that point the ambient
// namespace stops existing. Anything still referencing a type NOT declared here
// fails to compile then, loudly, rather than silently resolving to something
// else.
//
// WHY THE DECLARATIONS ARE NARROW. T-35-56: an over-permissive declaration --
// an `any`-shaped `IpcMainEvent`, a `type: string` where electron has a literal
// union -- silently turns OFF type checking at every consuming site, including
// IPC handler signatures. After plan 35-18 there is no `electron.d.ts` left to
// compare against, so that damage would be undetectable. Every declaration below
// was written by reading (a) the real shape in
// `node_modules/electron/electron.d.ts` while it still exists, and (b) each
// consuming site, to see whether the value is passed through as an opaque handle
// or has its fields read. NO declaration uses a bare `any`.
//
// HOW TO READ IT. Each declaration is preceded by the repo-relative paths of the
// sites that consume it. If a site disappears, the declaration can go with it.
// If a future site needs a field that is not declared, WIDEN THIS FILE
// deliberately against the real electron shape -- do not reach for `any`.
//
// The declarations are re-exported from `./index.ts` with `export type { ... }`
// so nothing here is emitted at runtime.
//
// PROVEN BY: `src/backend/platform/__tests__/types.usage.test.ts`, a
// type-usage assertion module that reproduces each real call site's usage
// against these declarations. It was authored WHILE the real `electron` types
// were still installed, which is the only window in which "is this declaration
// faithful?" is an answerable question.
//

// ---------------------------------------------------------------------------
// SECTION 1 -- OPAQUE EVENT HANDLES
//
// Three types the tree accepts but never reads. Every consuming site names the
// parameter and then ignores it (`_e`, or an unused `e`), or manufactures one
// with `undefined as unknown as T` for the Tauri transport, which has no
// electron event to hand. Declaring these structurally would invite a wrong
// object to satisfy them by accident; declaring them `any` is exactly T-35-56.
// So they are BRANDED: uninhabitable except through an explicit
// `as unknown as` cast, which is what every existing site already writes. Any
// future attempt to READ a field off one of these is a compile error naming the
// site -- the loud failure mode, which is the point.
// ---------------------------------------------------------------------------

// Consumed by:
//   src/frontend/screens/DownloadManager/index.tsx:41   (unused `e` param)
//   src/frontend/components/UI/DialogHandler/index.tsx:38
//   src/frontend/components/UI/Winetricks/index.tsx:95, :105
//   src/frontend/state/SteamBridgeSetup.ts:49           (`_e`)
//   src/frontend/state/SteamBottleSetup.ts:32           (`_e`)
//   src/frontend/state/SteamClientSetup.ts:36           (`_e`)
//   src/frontend/state/GlobalState.tsx:1473, :1535
//   src/preload/ipc.ts:3                                (`undefined as unknown as`)
//   src/preload/api/misc.ts:76, :81, :86                (`undefined as unknown as`)
// Real shape: `{ ports: MessagePort[]; sender: IpcRenderer }` -- neither field is
// read anywhere in this tree.
export interface IpcRendererEvent {
  /** Opaque brand. Not a real electron field; see SECTION 1. */
  readonly __gamelibIpcRendererEvent: never
}

// Consumed by:
//   src/backend/ipc.ts:15, :25, :42 -- listener signatures only. Each listener is
//   handed to `ipcMain.on/once` through an `as never` cast, and no listener body
//   touches the event.
// Real shape carries frameId/ports/processId/reply/returnValue/sender/senderFrame
// /type -- none read here.
export interface IpcMainEvent {
  /** Opaque brand. Not a real electron field; see SECTION 1. */
  readonly __gamelibIpcMainEvent: never
}

// Consumed by:
//   src/backend/utils/uninstaller.ts:13, :95 -- `uninstallGameCallback(event: Event, ...)`.
//   The parameter is never read. Its only two registration sites already erase it:
//   `src/backend/main.ts:1114` via `addHandler`, and
//   `src/backend/sidecar/installFlowRegistration.ts:217` via an explicit
//   `as (event: unknown, ...)` widening cast.
// NOTE: electron's `Event` SHADOWS the DOM lib's global `Event` at that site
// today. Once plan 35-15 removes the import, an un-rewritten `Event` there would
// silently resolve to the DOM `Event` instead -- a different type that would
// still compile. That is why this name is declared here explicitly.
export interface Event {
  /** Opaque brand. Not a real electron field; see SECTION 1. */
  readonly __gamelibElectronEvent: never
}

// ---------------------------------------------------------------------------
// SECTION 2 -- EVENTS WHOSE FIELDS ARE READ
// ---------------------------------------------------------------------------

// Consumed by:
//   src/backend/dialog/dialog.ts:9 -- declared as `event?: Electron.IpcMainInvokeEvent`
//   src/backend/dialog/dialog.ts:16 -- READS `event.sender.send(channel, ...args)`
// `sender` is electron's `WebContents`. Only `send` is reached from this tree, so
// only `send` is declared. Its args are `...unknown[]` rather than electron's
// `...any[]`: in a PARAMETER position `unknown` accepts every argument while
// still refusing to hand anything back untyped.
export interface IpcMainInvokeEvent {
  readonly sender: {
    send(channel: string, ...args: unknown[]): void
  }
}

// Consumed by:
//   src/frontend/screens/WebView/index.tsx:346 -- destructures `{ validatedURL }`
//   and matches/parses it as a URL string.
// All four fields are declared with electron's real types even though only
// `validatedURL` is read today: they are cheap, correct, and a `did-fail-load`
// listener that starts reading `errorCode` should not have to widen this file.
export interface DidFailLoadEvent {
  errorCode: number
  errorDescription: string
  validatedURL: string
  isMainFrame: boolean
}

// ---------------------------------------------------------------------------
// SECTION 3 -- THE <webview> ELEMENT
// ---------------------------------------------------------------------------

// Consumed by:
//   src/frontend/screens/WebView/index.tsx:71                       (`useRef<WebviewTag>(null)`)
//   src/frontend/screens/WebView/components/HumbleLoginSurface.tsx:33 (`useRef<WebviewTag>(null)`)
//   src/frontend/components/UI/WebviewControls/index.tsx:14          (`webview: WebviewTag | null` prop)
//
// EXHAUSTIVE list of the surface those three sites actually touch:
//   getURL()          WebviewControls:41; WebView:309, :322, :331, :393, :395, :402
//   loadURL()         WebView:361
//   getUserAgent()    WebView:302
//   setUserAgent()    WebView:303
//   canGoBack()       WebviewControls:44, :48; WebView:477
//   canGoForward()    WebviewControls:45, :49; WebView:483
//   goBack()          WebviewControls:70; WebView:479
//   goForward()       WebviewControls:75; WebView:485
//   reload()          WebviewControls:65
//   insertCSS()       reached structurally via `HumbleLoginChromeCssWebview`
//                     (src/frontend/screens/WebView/components/humbleLoginChromeCss.ts)
//   addEventListener/removeEventListener for exactly these five events:
//     'dom-ready'             WebView:368, :380
//     'did-fail-load'         WebView:369, :381        -> DidFailLoadEvent
//     'page-title-updated'    WebView:377, :382
//     'did-navigate'          WebView:416, :419, :422, :424; WebviewControls:43, :47, :53
//                             HumbleLoginSurface:147, :151
//     'did-navigate-in-page'  WebView:418, :423; WebviewControls:42, :46, :52
//                             HumbleLoginSurface:148, :152
//
// It extends `HTMLElement` because it is a real DOM element: it is the target of
// a React `ref` on the `<webview>` intrinsic (declared by `@types/react`, NOT by
// electron -- verified, so `<webview>` itself survives plan 35-18 untouched), and
// `humbleLoginChromeCss.ts`'s structural stand-in relies on the inherited
// `addEventListener(type: string, ...)` overload being present.
export interface WebviewTag extends HTMLElement {
  getURL(): string
  loadURL(
    url: string,
    options?: { httpReferrer?: string; userAgent?: string }
  ): Promise<void>
  getUserAgent(): string
  setUserAgent(userAgent: string): void
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  insertCSS(css: string): Promise<string>

  addEventListener(
    event: 'did-fail-load',
    listener: (event: DidFailLoadEvent) => void,
    useCapture?: boolean
  ): this
  removeEventListener(
    event: 'did-fail-load',
    listener: (event: DidFailLoadEvent) => void
  ): this
  addEventListener(
    event:
      | 'dom-ready'
      | 'did-navigate'
      | 'did-navigate-in-page'
      | 'page-title-updated',
    listener: (event: globalThis.Event) => void,
    useCapture?: boolean
  ): this
  removeEventListener(
    event:
      | 'dom-ready'
      | 'did-navigate'
      | 'did-navigate-in-page'
      | 'page-title-updated',
    listener: (event: globalThis.Event) => void
  ): this
}

// ---------------------------------------------------------------------------
// SECTION 4 -- DIALOG AND WINDOW OPTION BAGS
//
// These are plain data. They are declared field-for-field against
// `node_modules/electron/electron.d.ts`, because every one of them is an object
// LITERAL position: a missing field is a compile error the author will see, and
// a widened field type is precisely the silent-checking-loss of T-35-56.
// ---------------------------------------------------------------------------

// Consumed by:
//   src/frontend/components/UI/PathSelectionBox/index.tsx:6, :23 (`FileFilter[]` prop)
//   ...and transitively by `OpenDialogOptions.filters` below.
export interface FileFilter {
  extensions: string[]
  name: string
}

// Consumed by:
//   src/backend/utils/openDialog.ts:20 (parameter of `openDialogCallback`)
//   src/common/types/ipc.ts:1, :438    (`openDialog: (args: OpenDialogOptions) => ...`)
// Declared complete -- electron's own definition is only seven fields.
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

// Consumed by:
//   src/backend/main.ts:571 -- `const snapWarning: Electron.MessageBoxOptions = {...}`
//   sets `title`, `message`, `checkboxLabel`, `checkboxChecked`, then spreads the
//   whole bag into `dialog.showMessageBox({ ...snapWarning })`.
// `icon` is electron's `NativeImage | string`; this tree never sets it, and
// `NativeImage` is not otherwise referenced by name anywhere, so the field is
// narrowed to `string` rather than dragging a second declaration in. If a future
// site needs the NativeImage form, declare `NativeImage` here and widen.
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

// Consumed by:
//   src/backend/shortcuts/shortcuts/shortcuts.ts:79 --
//   `const shortcutOptions: Electron.ShortcutDetails = { target: launchWithProtocol }`
//   then `icon`/`iconIndex`/`args` are assigned onto it before
//   `shell.writeShortcutLink`. `target` is REQUIRED in electron and stays so here.
// Declared complete -- electron's own definition is eight fields.
export interface ShortcutDetails {
  appUserModelId?: string
  args?: string
  cwd?: string
  description?: string
  icon?: string
  iconIndex?: number
  target: string
  toastActivatorClsid?: string
}

// Consumed by:
//   src/backend/tray_icon/__tests__/tray_icon.test.ts:59
//     (`... as unknown as Electron.MenuItemConstructorOptions[]`, then reads
//      `menu[0]` expecting `{ click, label }` and `{ type: 'separator' }`)
//   src/common/typedefs/extra-mock-function.ts:24 (`menu: MenuItemConstructorOptions[]`)
//   src/backend/__mocks__/electron.ts:4, :78, :103, :112
//   ...and `CrossProcessExports.Tray.menu` below.
// `click`'s parameters are electron's `MenuItem`/`BaseWindow`/`KeyboardEvent`, none
// of which this tree names. They are declared `unknown` rather than `any`: a
// handler that ignores them (every handler here does) still type-checks, and one
// that wants to USE them is forced to narrow first.
export interface MenuItemConstructorOptions {
  click?: (menuItem: unknown, window: unknown, event: unknown) => void
  type?:
    | 'normal'
    | 'separator'
    | 'submenu'
    | 'checkbox'
    | 'radio'
    | 'header'
    | 'palette'
  label?: string
  sublabel?: string
  toolTip?: string
  accelerator?: string
  icon?: string
  enabled?: boolean
  acceleratorWorksWhenHidden?: boolean
  visible?: boolean
  checked?: boolean
  registerAccelerator?: boolean
  submenu?: MenuItemConstructorOptions[]
  id?: string
  before?: string[]
  after?: string[]
  beforeGroupContaining?: string[]
  afterGroupContaining?: string[]
}

// Consumed by:
//   src/common/typedefs/extra-mock-function.ts:14 (`options: Electron.BrowserWindowConstructorOptions`)
//   src/backend/__mocks__/electron.ts:3, :58, :60
//   src/backend/__tests__/main_window.test.ts reads `options.x/.y/.height/.width`
//     off that mock (:171-:172, :184-:187)
//   src/backend/main_window.ts:54 constructs one by spreading `WindowProps` and
//     adding minHeight/minWidth/show/webPreferences.
// Electron's real definition inherits ~50 fields from `BaseWindowConstructorOptions`.
// Only the ones this tree sets or reads are declared; the rest are omitted
// DELIBERATELY so that adding one is a visible edit here rather than an
// invisible widening.
export interface BrowserWindowConstructorOptions {
  x?: number
  y?: number
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  show?: boolean
  frame?: boolean
  title?: string
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover'
  titleBarOverlay?: TitleBarOverlay | boolean
  webPreferences?: {
    webviewTag?: boolean
    contextIsolation?: boolean
    nodeIntegration?: boolean
    sandbox?: boolean
    preload?: string
  }
}

// Consumed by:
//   src/common/types/ipc.ts:1, :136 (`setTitleBarOverlay: (options: TitleBarOverlay) => void`)
//   src/common/types.ts:17, :960     (`titleBarOverlay?: TitleBarOverlay | boolean`)
// Declared complete -- electron's own definition is three optional fields.
export interface TitleBarOverlay {
  color?: string
  symbolColor?: string
  height?: number
}

// ---------------------------------------------------------------------------
// SECTION 5 -- GEOMETRY AND DISPLAY
// ---------------------------------------------------------------------------

// Consumed by:
//   src/common/types.ts:956 -- `export interface WindowProps extends Electron.Rectangle`.
//   `WindowProps` is spread straight into `new BrowserWindow({...})` at
//   src/backend/main_window.ts:54, and its x/y/width/height are read at
//   src/backend/main_window.ts:34-:41.
// Declared complete; all four fields are required, exactly as electron has them.
export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Supporting shape for `Display` below. Not itself referenced by name anywhere in
 * the tree, so it is not exported -- it is reachable only through `Display`'s
 * fields, which is how electron's own `Size` is reached here too.
 */
interface Size {
  width: number
  height: number
}

// Consumed by:
//   src/backend/__tests__/main_window.test.ts:3, :183 --
//   `jest.spyOn(screen, 'getPrimaryDisplay').mockReturnValue({ workAreaSize: {...} } as Display)`
//   src/backend/main_window.ts:33-:41 reads `screenInfo.workAreaSize.height/.width`
//   off the return of `screen.getPrimaryDisplay()`.
// FOUND DURING EXECUTION: `Display` is imported as a VALUE-position specifier
// (`import { BrowserWindow, Display, screen } from 'electron'`) with no `type`
// keyword, so the plan's `import type ... from 'electron'` grep does not see it.
// See the summary's "Enumeration corrections".
export interface Display {
  id: number
  bounds: Rectangle
  workArea: Rectangle
  size: Size
  workAreaSize: Size
  scaleFactor: number
  rotation: number
  internal: boolean
}

// ---------------------------------------------------------------------------
// SECTION 6 -- SYNTHETIC INPUT EVENTS
//
// The `type` fields below are electron's real STRING-LITERAL unions, not `string`.
// That is load-bearing, not decoration: src/backend/main.ts:1304 declares
// `(MouseInputEvent | MouseWheelInputEvent | KeyboardInputEvent)[]` and then
// pushes bare object literals into it. Discrimination between the three members
// happens entirely through `type`. Widening `type` to `string` would make every
// one of those ~12 pushes accept a malformed event silently -- the exact shape of
// T-35-56.
// ---------------------------------------------------------------------------

/**
 * Supporting base for the three input events. Deliberately NOT exported and NOT
 * named `InputEvent`: `InputEvent` is a global in `lib.dom`, which this project
 * has enabled (`tsconfig.json` `lib: ["esnext","dom","dom.iterable"]`), and
 * exporting a same-named type would set a shadowing trap for a later reader.
 * Electron calls it `InputEvent`; nothing in this tree references that name.
 */
interface ElectronInputEventBase {
  modifiers?: Array<
    | 'shift'
    | 'control'
    | 'ctrl'
    | 'alt'
    | 'meta'
    | 'command'
    | 'cmd'
    | 'iskeypad'
    | 'isautorepeat'
    | 'leftbuttondown'
    | 'middlebuttondown'
    | 'rightbuttondown'
    | 'capslock'
    | 'numlock'
    | 'left'
    | 'right'
  >
}

// Consumed by:
//   src/backend/main.ts:1305 (union member), :1354-:1378 -- pushes
//   `{ type: 'mouseDown' | 'mouseUp', button: 'left' | 'right', x, y }`.
export interface MouseInputEvent extends ElectronInputEventBase {
  type:
    | 'mouseDown'
    | 'mouseUp'
    | 'mouseEnter'
    | 'mouseLeave'
    | 'contextMenu'
    | 'mouseWheel'
    | 'mouseMove'
  x: number
  y: number
  button?: 'left' | 'middle' | 'right'
  clickCount?: number
  globalX?: number
  globalY?: number
  movementX?: number
  movementY?: number
}

// Consumed by:
//   src/backend/main.ts:1306 (union member), :1320-:1334 -- pushes
//   `{ type: 'mouseWheel', deltaY, x, y }`.
// `type` narrows to the single literal `'mouseWheel'`, exactly as electron has
// it; that is what makes the union at main.ts:1304 discriminate.
export interface MouseWheelInputEvent extends Omit<MouseInputEvent, 'type'> {
  type: 'mouseWheel'
  accelerationRatioX?: number
  accelerationRatioY?: number
  canScroll?: boolean
  deltaX?: number
  deltaY?: number
  hasPreciseScrollingDeltas?: boolean
  wheelTicksX?: number
  wheelTicksY?: number
}

// Consumed by:
//   src/backend/main.ts:1307 (union member), :1344-:1420 -- pushes
//   `{ type: 'keyDown' | 'keyUp', keyCode }` and, at :1409-:1416,
//   `{ type: 'keyDown'|'keyUp', keyCode: 'Tab', modifiers: ['shift'] }`.
export interface KeyboardInputEvent extends ElectronInputEventBase {
  type: 'rawKeyDown' | 'keyDown' | 'keyUp' | 'char'
  keyCode: string
}

// ---------------------------------------------------------------------------
// SECTION 7 -- WINDOW HANDLE
// ---------------------------------------------------------------------------

// Consumed by:
//   src/backend/utils/openDialog.ts:20, :30, :37 --
//   `parentWindow: BrowserWindow | undefined`, forwarded to
//   `dialog.showOpenDialog(parentWindow as BrowserWindow, options)` and otherwise
//   never touched. openDialog.ts's own header records why: the sidecar has no real
//   window and the platform stub ignores the argument entirely.
//
// This is the TYPE of a window INSTANCE. It is distinct from the `BrowserWindow`
// VALUE that `./index.ts` exports (a plain object with `getAllWindows`), which is
// why the two cannot be merged and why `./index.ts` re-exports this name through a
// namespace rather than at top level -- see the re-export block in `./index.ts`.
//
// Branded for the same reason as SECTION 1: `openDialog.ts` reads nothing off it,
// and a structural declaration would let an unrelated object drift in. Callers that
// hold a real window already reach it through `getMainWindow()`, which is typed by
// `main_window.ts`, not by this name.
export interface BrowserWindow {
  /** Opaque brand. Not a real electron field; see SECTION 7. */
  readonly __gamelibBrowserWindow: never
}

// ---------------------------------------------------------------------------
// SECTION 8 -- THE `CrossProcessExports` NAMESPACE
//
// This one is NOT an event or an option bag, and needs different treatment.
// In `electron.d.ts`, `Electron.CrossProcessExports` is the namespace that
// `declare module 'electron' { export = Electron.CrossProcessExports }` points at
// -- i.e. it IS the electron module's own export namespace, re-exposed as a
// qualified name. This tree reaches exactly ONE member of it, and only from a
// test: `Electron.CrossProcessExports.Tray`, four times.
//
// It is therefore declared as a namespace containing only type members, which
// TypeScript erases completely (no runtime object is emitted for a namespace that
// is never instantiated). The `@typescript-eslint/no-namespace` disable at the top
// of this file exists for this declaration alone; `src/common/typedefs/extra-mock-function.ts`
// carries the same disable for the same reason.
// ---------------------------------------------------------------------------

export namespace CrossProcessExports {
  // Consumed by:
  //   src/backend/tray_icon/__tests__/tray_icon.test.ts:91, :133, :188, :228 --
  //   `(await initTrayIcon(mainWindow)) as Electron.CrossProcessExports.Tray`,
  //   then reads `appIcon.menu[0]`.
  //
  // `menu` is NOT a real electron field. It is contributed by the ambient
  // augmentation in `src/common/typedefs/extra-mock-function.ts:22-:25`
  // (`declare global { namespace Electron { interface Tray { menu: ... } } }`),
  // which exists because the jest mock at `src/backend/__mocks__/electron.ts:103`
  // records the last menu passed to `setContextMenu`. It is declared here because
  // that augmentation has nowhere to attach once the ambient `Electron` namespace
  // is gone -- see the summary's note on why 35-16 cannot rewrite that file
  // mechanically.
  //
  // The three methods mirror `src/backend/tray_icon/tray_icon.ts:29, :34, :37`, so
  // that when plan 35-15 repoints `tray_icon.ts` at `./index.ts`'s `Tray` CLASS,
  // the test's `as` cast still has structural overlap and does not have to be
  // downgraded to `as unknown as`.
  export interface Tray {
    /** Test-only, via extra-mock-function.ts's ambient augmentation. */
    menu: MenuItemConstructorOptions[]
    setContextMenu(menu?: unknown): void
    setToolTip(toolTip?: string): void
    on(event?: string, listener?: () => void): unknown
  }
}
