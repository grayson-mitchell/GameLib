//
// TYPE-USAGE ASSERTION MODULE for `src/backend/platform/types.ts`
// (Phase 35 plan 13, Task 2 -- D-03, REQ-35-02, mitigation for T-35-56).
//
// WHY THIS FILE EXISTS. `types.ts` declares first-party replacements for every
// electron type this tree references. A declaration that compiles IN ISOLATION
// but does not satisfy its real call site is not caught by anything else: it
// surfaces in plan 35-18, after `electron` leaves `package.json`, as a wall of
// type errors with no owner and nothing left to compare against. So each
// declaration is exercised BELOW the way its real consuming site exercises it,
// authored while `node_modules/electron/electron.d.ts` still exists to check
// against. Each block names the site it reproduces.
//
// WHAT MAKES IT A REAL GATE, NOT A VACUOUS ONE. The assertions are not "does
// this name exist" -- they reproduce field reads, discriminated-union pushes,
// object-literal construction and `as` casts, which are what actually break when
// a declaration is too narrow, and they use literal types where the real sites
// do, which is what breaks when a declaration is too WIDE. Non-vacuity was
// verified by deliberately damaging declarations and confirming this module goes
// red; the results are recorded in the plan summary.
//
// This is the ONLY module in the tree permitted to import the bare specifier
// `backend/platform` at the end of plan 13. Production sites are rewritten in
// plan 35-15, after the point of no return (D-17).
//
// It is a `.test.ts` under the Backend jest project so that `tsc` (via
// `pnpm codecheck`) AND `ts-jest` both compile it. The single runtime `it()` at
// the end exists because jest fails a suite containing no tests; the real
// assertions are the compile itself.
//
// EVERY ASSERTION LIVES IN AN `export function assert_*()` THAT IS NEVER CALLED.
// That is deliberate and load-bearing in both directions: `export` keeps eslint
// from pruning them as unused, and never invoking them keeps them compile-only.
// The first draft used bare block statements, which ts-jest happily EXECUTED --
// `undefined as unknown as` (the now-retired `<webview>`-element method-surface
// shim) then threw
// `TypeError: Cannot read properties of undefined (reading 'addEventListener')`
// at load. A type-usage assertion that has to be runtime-safe is a weaker
// assertion, because it can only exercise values it can actually construct.
//

import type {
  IpcRendererEvent,
  IpcMainEvent,
  IpcMainInvokeEvent,
  Event as ElectronEvent,
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
} from 'backend/platform'

// `BrowserWindow` cannot be re-exported from `backend/platform`: that module
// already exports a `BrowserWindow` VALUE, and TypeScript rejects the pair with
// `TS2323: Cannot redeclare exported variable 'BrowserWindow'` (measured, see the
// note in `../index.ts`). The instance type is therefore imported from the
// declarations module directly.
import type { BrowserWindow } from 'backend/platform/types'

// ---------------------------------------------------------------------------
// IpcRendererEvent
// Reproduces: src/frontend/screens/DownloadManager/index.tsx:41,
//             src/frontend/state/SteamBridgeSetup.ts:49,
//             src/preload/api/misc.ts:78 / src/preload/ipc.ts's Tauri branch.
// ---------------------------------------------------------------------------
export function assert_ipcRendererEvent(): void {
  // The DownloadManager / DialogHandler / Winetricks shape: a listener whose
  // first parameter is the event and which never reads it.
  const listener = (
    e: IpcRendererEvent,
    elements: string[],
    state: 'idle' | 'running'
  ): void => {
    void e
    void elements
    void state
  }
  listener(undefined as unknown as IpcRendererEvent, ['a'], 'idle')

  // The `_e` shape used by the three Steam*Setup modules.
  const underscored = (_e: IpcRendererEvent, payload: { appId: number }) =>
    payload.appId
  void underscored(undefined as unknown as IpcRendererEvent, { appId: 1 })

  // preload/api/misc.ts:78 manufactures the event for the Tauri transport, which
  // has no electron event to hand. This is the ONLY way to produce one.
  const manufactured: IpcRendererEvent =
    undefined as unknown as IpcRendererEvent
  void manufactured
}

// ---------------------------------------------------------------------------
// IpcMainEvent
// Reproduces: src/backend/ipc.ts:15, :25, :42 -- listener signatures handed to
// `ipcMain.on/once` through an `as never` cast.
// ---------------------------------------------------------------------------
export function assert_ipcMainEvent(): void {
  type SyncChannel = (appName: string, force: boolean) => void
  const addListener = (
    _channel: string,
    listener: (e: IpcMainEvent, ...args: Parameters<SyncChannel>) => void
  ) => {
    // backend/ipc.ts:19 -- `ipcMain.on(channel, listener as never)`
    void (listener as never)
  }
  addListener('someChannel', (e, appName, force) => {
    void e
    void appName
    void force
  })
}

// ---------------------------------------------------------------------------
// Event (electron's, NOT the DOM global)
// Reproduces: src/backend/utils/uninstaller.ts:94 and its two registration
// sites -- main.ts:1114 (`addHandler`) and
// installFlowRegistration.ts:217 (the explicit widening cast).
// ---------------------------------------------------------------------------
export function assert_electronEvent(): void {
  const uninstallGameCallback = async (
    event: ElectronEvent,
    appName: string,
    runner: string,
    shouldRemovePrefix: boolean,
    shouldRemoveSetting: boolean
  ): Promise<void> => {
    // The parameter is never read at the real site either.
    void event
    void appName
    void runner
    void shouldRemovePrefix
    void shouldRemoveSetting
  }

  // installFlowRegistration.ts:217 -- the widened re-cast must still be legal.
  const widened = uninstallGameCallback as (
    event: unknown,
    appName: string,
    runner: string,
    shouldRemovePrefix: boolean,
    shouldRemoveSetting: boolean
  ) => Promise<void>
  void widened(undefined, 'app', 'steam', false, false)
}

// ---------------------------------------------------------------------------
// IpcMainInvokeEvent -- FIELDS ARE READ
// Reproduces: src/backend/dialog/dialog.ts:9 + :16
//   `props.event.sender.send('showDialog', title, message, type, buttons)`
// ---------------------------------------------------------------------------
export function assert_ipcMainInvokeEvent(): void {
  type ButtonOptions = { text: string; action?: string }
  const showDialogBoxModalAuto = (props: {
    event?: IpcMainInvokeEvent
    title: string
    message: string
    type: 'ERROR' | 'MESSAGE'
    buttons?: Array<ButtonOptions>
  }) => {
    if (props.event) {
      props.event.sender.send(
        'showDialog',
        props.title,
        props.message,
        props.type,
        props.buttons
      )
    }
  }
  showDialogBoxModalAuto({ title: 't', message: 'm', type: 'MESSAGE' })
}

// ---------------------------------------------------------------------------
// The <webview>-element event-payload type and method-surface shim --
// RETIRED (Phase 40 Plan 03, REQ-40-10).
// Tauri has no `<webview>` element to type: the embedded child surface is a
// real OS-native `WebviewWindow`/child window owned by Rust, not a
// renderer-side HTML custom element with a did-fail-load event or a JS method
// surface. Every consumer this section reproduced (WebView/index.tsx,
// HumbleLoginSurface.tsx, WebviewControls/index.tsx,
// humbleLoginChromeCss.ts's structural stand-in) was deleted by plan 40-01.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FileFilter + OpenDialogOptions
// Reproduces: src/frontend/components/UI/PathSelectionBox/index.tsx:23, :146-:152
//             src/backend/utils/openDialog.ts:31-:38
//             src/common/types/ipc.ts:438
// ---------------------------------------------------------------------------
export function assert_fileFilterAndOpenDialogOptions(): void {
  const pathDialogFilters: FileFilter[] = [
    { name: 'Executables', extensions: ['exe', 'app'] }
  ]

  // PathSelectionBox/index.tsx:146 -- the literal handed to `openDialog`.
  const options: OpenDialogOptions = {
    buttonLabel: 'Choose',
    properties: ['openDirectory'],
    title: 'Pick a folder',
    filters: pathDialogFilters,
    defaultPath: '/somewhere'
  }
  // The other branch at :148 uses 'openFile'.
  const fileOptions: OpenDialogOptions = { properties: ['openFile'] }
  void fileOptions

  // common/types/ipc.ts:438 -- the IPC signature.
  const openDialog: (
    args: OpenDialogOptions
  ) => Promise<string | false> = async () => false
  void openDialog(options)
}

// ---------------------------------------------------------------------------
// BrowserWindow (instance handle) -- reproduces
// src/backend/utils/openDialog.ts:30-:38 exactly, including the
// `parentWindow as BrowserWindow` re-cast of a possibly-undefined value.
// ---------------------------------------------------------------------------
export function assert_browserWindowHandle(): void {
  const showOpenDialog = async (
    _window: BrowserWindow,
    _options: OpenDialogOptions
  ): Promise<{ filePaths: string[]; canceled: boolean }> => ({
    filePaths: [],
    canceled: true
  })

  const openDialogCallback = async (
    parentWindow: BrowserWindow | undefined,
    options: OpenDialogOptions
  ): Promise<string | false> => {
    const { filePaths, canceled } = await showOpenDialog(
      parentWindow as BrowserWindow,
      options
    )
    if (!canceled) {
      return filePaths[0]
    }
    return false
  }
  void openDialogCallback(undefined, {})
}

// ---------------------------------------------------------------------------
// MessageBoxOptions
// Reproduces: src/backend/main.ts:571-:594 -- the annotated literal AND the
// spread into `dialog.showMessageBox({ ...snapWarning })`.
// ---------------------------------------------------------------------------
export function assert_messageBoxOptions(): void {
  const snapWarning: MessageBoxOptions = {
    title: 'GameLib is running as a Snap',
    message: 'Some features are not available…',
    checkboxLabel: 'Do not show this message again',
    checkboxChecked: false
  }
  const showMessageBox = async (
    _o: MessageBoxOptions
  ): Promise<{ checkboxChecked: boolean; response: number }> => ({
    checkboxChecked: false,
    response: 0
  })
  void showMessageBox({ ...snapWarning })

  // The `type` field is a literal union at the real site too.
  const typed: MessageBoxOptions = {
    message: 'm',
    type: 'warning',
    buttons: ['OK'],
    defaultId: 0,
    cancelId: 0
  }
  void typed
}

// ---------------------------------------------------------------------------
// ShortcutDetails
// Reproduces: src/backend/shortcuts/shortcuts/shortcuts.ts:79-:88 -- the
// `target`-only literal, then the later `icon`/`iconIndex` assignments onto it.
// ---------------------------------------------------------------------------
export function assert_shortcutDetails(): void {
  const shortcutOptions: ShortcutDetails = {
    target: 'gamelib://launch/steam/12345'
  }
  shortcutOptions.icon = '/path/to/game.exe'
  shortcutOptions.iconIndex = 0
  shortcutOptions.args = '--foo'

  const writeShortcutLink = (_path: string, _o: ShortcutDetails) => undefined
  writeShortcutLink('/desktop/Game.lnk', shortcutOptions)
}

// ---------------------------------------------------------------------------
// MenuItemConstructorOptions
// Reproduces: src/backend/tray_icon/tray_icon.ts's template shape and the
// assertions at src/backend/tray_icon/__tests__/tray_icon.test.ts:59-:66,
// plus src/backend/__mocks__/electron.ts:78, :103, :112.
// ---------------------------------------------------------------------------
export function assert_menuItemConstructorOptions(): void {
  const template: MenuItemConstructorOptions[] = [
    { click: () => undefined, label: 'game 1' },
    { type: 'separator' },
    { label: 'Quit', accelerator: 'Cmd+Q', enabled: true },
    {
      label: 'Recent',
      submenu: [{ label: 'nested', click: () => undefined }]
    }
  ]
  const buildFromTemplate = (o: MenuItemConstructorOptions[]) => o
  const menu = buildFromTemplate(template)
  // tray_icon.test.ts reads menu[0] and compares its `click`/`label`/`type`.
  const first: MenuItemConstructorOptions | undefined = menu[0]
  void first?.label
  void first?.type
  void first?.click
}

// ---------------------------------------------------------------------------
// BrowserWindowConstructorOptions + Rectangle + TitleBarOverlay
// Reproduces: src/common/types.ts:956-:961 (`WindowProps extends Rectangle`),
//             src/backend/main_window.ts:20-:70 (the spread construction),
//             src/backend/__tests__/main_window.test.ts:171-:187 (the reads),
//             src/common/types/ipc.ts:136 (`setTitleBarOverlay`).
// ---------------------------------------------------------------------------
export function assert_browserWindowConstructorOptions(): void {
  interface WindowProps extends Rectangle {
    maximized: boolean
    frame?: boolean
    titleBarStyle?: 'default' | 'hidden' | 'hiddenInset'
    titleBarOverlay?: TitleBarOverlay | boolean
  }

  const windowProps: WindowProps = {
    height: 690,
    width: 1200,
    x: 0,
    y: 0,
    maximized: false
  }
  // main_window.ts:34-:41 reads them back as numbers.
  const h: number = windowProps.height
  const w: number = windowProps.width
  void h
  void w

  windowProps.titleBarStyle = 'hidden'
  windowProps.titleBarOverlay = true
  windowProps.frame = false

  // main_window.ts:54 -- the spread. `maximized` is not a
  // BrowserWindowConstructorOptions field; spreads are exempt from excess
  // property checking, exactly as at the real site.
  const ctorOptions: BrowserWindowConstructorOptions = {
    ...windowProps,
    minHeight: 345,
    minWidth: 600,
    show: false,
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: true,
      preload: '/app/build/preload/index.js'
    }
  }

  // main_window.test.ts:171-:172, :184-:187 read these off the mock.
  const x: number | undefined = ctorOptions.x
  const y: number | undefined = ctorOptions.y
  void x
  void y

  // common/types/ipc.ts:136
  const setTitleBarOverlay: (options: TitleBarOverlay) => void = () => undefined
  setTitleBarOverlay({ color: '#000000', symbolColor: '#ffffff', height: 32 })
}

// ---------------------------------------------------------------------------
// Display
// Reproduces: src/backend/__tests__/main_window.test.ts:177-:183 (the partial
// `as Display` cast) and src/backend/main_window.ts:33-:41 (the reads).
// ---------------------------------------------------------------------------
export function assert_display(): void {
  const screenInfo = {
    workAreaSize: {
      height: 768,
      width: 1024
    }
  } as Display

  if (screenInfo?.workAreaSize?.height < 690) {
    void (screenInfo.workAreaSize.height * 0.8)
  }
  if (screenInfo?.workAreaSize?.width < 1200) {
    void (screenInfo.workAreaSize.width * 0.8)
  }

  const getPrimaryDisplay: () => Display = () => screenInfo
  void getPrimaryDisplay().bounds
}

// ---------------------------------------------------------------------------
// MouseInputEvent | MouseWheelInputEvent | KeyboardInputEvent
// Reproduces: src/backend/main.ts:1303-:1424 -- the discriminated union array
// and every literal pushed into it. THIS is the block that would go silently
// vacuous if any `type` field were widened to `string`.
// ---------------------------------------------------------------------------
export function assert_inputEvents(): void {
  const inputEvents: (
    | MouseInputEvent
    | MouseWheelInputEvent
    | KeyboardInputEvent
  )[] = []

  // rightStickUp / rightStickDown (:1320-:1334)
  inputEvents.push({ type: 'mouseWheel', deltaY: 50, x: 600, y: 345 })
  inputEvents.push({ type: 'mouseWheel', deltaY: -50, x: 600, y: 345 })
  // leftStick / dpad (:1344-:1349)
  inputEvents.push({ type: 'keyDown', keyCode: 'Up' })
  inputEvents.push({ type: 'keyUp', keyCode: 'Up' })
  // padA / padB (:1354-:1378)
  inputEvents.push({ type: 'mouseDown', button: 'left', x: 10, y: 20 })
  inputEvents.push({ type: 'mouseUp', button: 'left', x: 10, y: 20 })
  inputEvents.push({ type: 'mouseDown', button: 'right', x: 10, y: 20 })
  inputEvents.push({ type: 'mouseUp', button: 'right', x: 10, y: 20 })
  // Esc / Tab / Shift+Tab (:1385-:1416)
  inputEvents.push({ type: 'keyDown', keyCode: 'Esc' })
  inputEvents.push({ type: 'keyUp', keyCode: 'Esc' })
  inputEvents.push({ type: 'keyDown', keyCode: 'Tab' })
  inputEvents.push({ type: 'keyUp', keyCode: 'Tab' })
  inputEvents.push({ type: 'keyDown', keyCode: 'Tab', modifiers: ['shift'] })
  inputEvents.push({ type: 'keyUp', keyCode: 'Tab', modifiers: ['shift'] })

  // main.ts:1424 -- `inputEvents.forEach((e) => webContents.sendInputEvent(e))`
  const sendInputEvent = (
    _e: MouseInputEvent | MouseWheelInputEvent | KeyboardInputEvent
  ) => undefined
  inputEvents.forEach((event) => sendInputEvent(event))

  // The union must actually DISCRIMINATE on `type`, which is only true while the
  // literal unions are preserved. If `type` were widened to `string`, `keyCode`
  // would not narrow into scope here and this block would stop compiling.
  const narrowed = inputEvents[0]
  if (narrowed && narrowed.type === 'keyDown') {
    const keyCode: string = narrowed.keyCode
    void keyCode
  }
}

// ---------------------------------------------------------------------------
// CrossProcessExports.Tray
// Reproduces: src/backend/tray_icon/__tests__/tray_icon.test.ts:91, :133,
// :188, :228 -- the qualified namespace cast and the `.menu[0]` read.
// ---------------------------------------------------------------------------
export function assert_crossProcessExportsTray(): void {
  const initTrayIcon = async (): Promise<unknown> => ({ menu: [] })
  const useTray = async () => {
    const appIcon = (await initTrayIcon()) as CrossProcessExports.Tray
    const first: MenuItemConstructorOptions | undefined = appIcon.menu[0]
    void first?.label
    // The three methods tray_icon.ts calls on a tray instance.
    appIcon.setContextMenu(undefined)
    appIcon.setToolTip('GameLib')
    appIcon.on('click', () => undefined)
  }
  void useTray
}

// ---------------------------------------------------------------------------
// NEGATIVE ASSERTIONS -- proving the declarations are not merely PRESENT but
// actually NARROW.
//
// These exist because of a measured gap. The positive assertions above were
// tested for non-vacuity by damaging `types.ts` and confirming this module goes
// red. Two of three mutations were caught (dropping
// `IpcMainInvokeEvent.sender.send` -> TS18046; dropping the retired
// `<webview>`-element method-surface shim's `insertCSS` member -> TS2741).
// The THIRD -- widening `KeyboardInputEvent['type']` from its
// literal union to `string` -- was NOT caught, because the union at
// `src/backend/main.ts:1303` still discriminates by EXCLUDING the two mouse
// members, whose literals were left intact. A positive assertion can only ever
// show that something is permitted; it is structurally blind to a declaration
// that permits TOO MUCH, which is exactly T-35-56.
//
// So each block below asserts a REJECTION. `@ts-expect-error` inverts the gate:
// if a declaration is later widened so that the line stops being an error,
// TypeScript reports the directive itself as unused and the build fails. The
// narrowness becomes self-proving rather than assumed.
// ---------------------------------------------------------------------------

export function assert_inputEventTypesAreLiteralUnions(): void {
  const events: (
    | MouseInputEvent
    | MouseWheelInputEvent
    | KeyboardInputEvent
  )[] = []

  // Widening any of the three `type` fields to `string` makes each of these
  // stop being an error, which fails the build on the unused directive.
  // @ts-expect-error 'notAKey' is not in KeyboardInputEvent['type']
  events.push({ type: 'notAKey', keyCode: 'Tab' })
  // @ts-expect-error 'mouseWheel' requires the MouseWheelInputEvent shape, and
  // 'leftClick' is in no member's `type` union at all
  events.push({ type: 'leftClick', x: 0, y: 0 })
  // @ts-expect-error MouseInputEvent requires x and y
  events.push({ type: 'mouseDown', button: 'left' })
  // @ts-expect-error KeyboardInputEvent requires keyCode
  events.push({ type: 'keyDown' })
  // @ts-expect-error 'middleClick' is not in MouseInputEvent['button']
  events.push({ type: 'mouseDown', button: 'middleClick', x: 0, y: 0 })
  // @ts-expect-error 'hyper' is not in the modifiers union
  events.push({ type: 'keyDown', keyCode: 'Tab', modifiers: ['hyper'] })
}

export function assert_optionBagsRejectBadLiterals(): void {
  // @ts-expect-error 'openEverything' is not an OpenDialogOptions property
  const bad: OpenDialogOptions = { properties: ['openEverything'] }
  void bad

  // @ts-expect-error 'catastrophe' is not a MessageBoxOptions type
  const badBox: MessageBoxOptions = { message: 'm', type: 'catastrophe' }
  void badBox

  // @ts-expect-error MessageBoxOptions.message is REQUIRED
  const noMessage: MessageBoxOptions = { title: 't' }
  void noMessage

  // @ts-expect-error 'divider' is not a MenuItemConstructorOptions type
  const badItem: MenuItemConstructorOptions = { type: 'divider' }
  void badItem

  // @ts-expect-error ShortcutDetails.target is REQUIRED
  const noTarget: ShortcutDetails = { icon: '/x' }
  void noTarget

  // @ts-expect-error FileFilter requires both fields
  const badFilter: FileFilter = { name: 'Executables' }
  void badFilter

  // @ts-expect-error Rectangle's four fields are all REQUIRED
  const badRect: Rectangle = { x: 0, y: 0 }
  void badRect

  // @ts-expect-error TitleBarOverlay.height is a number, not a CSS string
  const badOverlay: TitleBarOverlay = { height: '32px' }
  void badOverlay
}

export function assert_opaqueHandlesStayOpaque(): void {
  // The brand is what stops an arbitrary object drifting into an event slot.
  // If any of these three were relaxed to `any`, `unknown`, `object` or an
  // empty interface, these lines would stop erroring.
  // @ts-expect-error a plain object is not an IpcRendererEvent
  const e1: IpcRendererEvent = {}
  void e1
  // @ts-expect-error a plain object is not an IpcMainEvent
  const e2: IpcMainEvent = { frameId: 1 }
  void e2
  // @ts-expect-error a plain object is not an electron Event
  const e3: ElectronEvent = { type: 'click' }
  void e3
  // @ts-expect-error a plain object is not a BrowserWindow handle
  const w: BrowserWindow = { id: 1 }
  void w

  // Reading a field off an opaque handle is a compile error naming the site --
  // the loud failure mode SECTION 1 of types.ts is designed for.
  const real = undefined as unknown as IpcRendererEvent
  // @ts-expect-error IpcRendererEvent declares no `sender`; widen types.ts
  // deliberately if a site ever needs one.
  void real.sender
}

// The negative assertions covering the <webview>-element method-surface shim
// and its event-payload type retired alongside the positive assertion section
// above (Phase 40 Plan 03, REQ-40-10) -- both existed only to prove the
// deleted declarations were narrow, not vacuous.

export function assert_displayAndCtorOptionsAreTyped(): void {
  // @ts-expect-error workAreaSize is a Size, not a number
  const badDisplay = { workAreaSize: 1024 } as Display
  void badDisplay

  // @ts-expect-error width is a number, not a CSS string
  const badCtor: BrowserWindowConstructorOptions = { width: '1200px' }
  void badCtor

  const badStyle: BrowserWindowConstructorOptions = {
    // @ts-expect-error 'floating' is not a titleBarStyle this tree supports
    titleBarStyle: 'floating'
  }
  void badStyle
}

export function assert_crossProcessExportsTrayIsTyped(): void {
  const tray = undefined as unknown as CrossProcessExports.Tray
  // @ts-expect-error menu is MenuItemConstructorOptions[], so `label` is
  // string | undefined and never a number
  const n: number = tray.menu[0].label
  void n
}

describe('backend/platform types', () => {
  it('compiles every first-party electron declaration against its real call-site usage', () => {
    // The assertions above are compile-time. This case exists so the suite is
    // non-empty; if `types.ts` drifts from any consuming site, `tsc` (via
    // `pnpm codecheck`) and `ts-jest` both fail before this line is reached.
    expect(true).toBe(true)
  })
})
