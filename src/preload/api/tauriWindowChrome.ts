/**
 * Tauri renderer-side window chrome (Phase 34.1 Plan 03, D-01/D-02).
 *
 * Implements the ten D-01 window-chrome channels directly against Tauri's JS
 * window/webview API -- no sidecar hop, no new `dispatch_rust_channel` arm.
 * `src/preload/api/misc.ts`'s `isTauri()` branch (Task 2 of this plan) is the ONLY
 * caller path into this module; nothing on the Electron path reaches it, and the
 * sidecar registers nothing for these channels (D-02 -- the `UNPORTED_CHANNEL_MARKER`
 * path is simply never reached).
 *
 * Also exports `applyFramelessDecorations`/`installDragRegionHandlers` (D-05/D-06,
 * Task 3), which `tauriAttach.ts` calls directly from its pre-paint `window.api`
 * attach path -- a throw there blanks the window (SEAM Invariant A). Every export in
 * this module is therefore TOTAL: Tauri promises are floated with `void` and chained
 * with `.catch()` so a rejection only warns, and `applyFramelessDecorations` also
 * wraps its synchronous resolution logic in try/catch.
 *
 * The Tauri window/webview accessors below are safe to import statically here -- both
 * read `__TAURI_INTERNALS__` at CALL time, not at import time, the same property
 * `tauriTransport.ts`'s own static imports of `@tauri-apps/api/core`/`/event` already
 * rely on to stay import-safe under Electron.
 */
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { isTauri, snapshotGet } from '../tauriTransport'

function warn(label: string, error: unknown): void {
  console.warn(`[tauriWindowChrome] ${label} failed:`, error)
}

function readFramelessSetting(): boolean {
  const settings = snapshotGet('configStore', 'settings') as
    | { framelessWindow?: boolean }
    | undefined
  return settings?.framelessWindow === true
}

export const tauriMinimizeWindow = (): void => {
  void getCurrentWindow()
    .minimize()
    .catch((error) => warn('minimize', error))
}

export const tauriMaximizeWindow = (): void => {
  void getCurrentWindow()
    .maximize()
    .catch((error) => warn('maximize', error))
}

export const tauriUnmaximizeWindow = (): void => {
  void getCurrentWindow()
    .unmaximize()
    .catch((error) => warn('unmaximize', error))
}

export const tauriCloseWindow = (): void => {
  void getCurrentWindow()
    .close()
    .catch((error) => warn('close', error))
}

export const tauriIsMaximized = (): Promise<boolean> =>
  getCurrentWindow()
    .isMaximized()
    .catch((error) => {
      warn('isMaximized', error)
      return false
    })

export const tauriIsMinimized = (): Promise<boolean> =>
  getCurrentWindow()
    .isMinimized()
    .catch((error) => {
      warn('isMinimized', error)
      return false
    })

export const tauriSetFullscreen = (enabled: boolean): void => {
  void getCurrentWindow()
    .setFullscreen(enabled)
    .catch((error) => warn('setFullscreen', error))
}

/**
 * `isFullscreen` -- the Electron body (`main.ts:747`) is `isSteamDeckGameMode ||
 * isCLIFullscreen`, two Node-only env/CLI signals (`XDG_CURRENT_DESKTOP ===
 * 'gamescope'` and `process.argv.includes('--fullscreen')`), NOT a real
 * window-fullscreen query. `App.tsx`'s `fullscreen` CSS class tracks THAT signal, not
 * OS window state -- substituting a real fullscreen read here would silently change
 * what that class means. `tauriAttach.ts` already hardcodes `window.isSteamDeckGameMode
 * = false` as a declared Phase 27 stub; `isCLIFullscreen` has no Tauri renderer
 * equivalent without a new Rust arm this slice deliberately does not add (D-01 adds
 * zero new arms). This function must NEVER call the Window API for this reason --
 * verified by test.
 */
export const tauriIsFullscreen = (): Promise<boolean> => {
  return Promise.resolve(
    (window as { isSteamDeckGameMode?: boolean }).isSteamDeckGameMode === true
  )
}

/**
 * `isFrameless` -- reads the SETTING, not window decoration state. Electron's body
 * (`main_window.ts:15`) reads persisted `window-props`, which is itself populated FROM
 * `settings.framelessWindow` at window-creation time (`main_window.ts:43-53`) -- so
 * reading the setting directly is the faithful Tauri equivalent, and the snapshot is a
 * boot-time read, matching Electron's own read-once-at-startup behavior. This function
 * must NEVER call the Window API for this reason -- verified by test.
 */
export const tauriIsFrameless = (): Promise<boolean> => {
  return Promise.resolve(readFramelessSetting())
}

/**
 * `setZoomFactor` -- zoom is a WEBVIEW api in Tauri v2 (the current webview's own
 * `setZoom` method), not a window api. Electron's `setZoomLevel` takes a Chromium zoom
 * LEVEL;
 * `setZoom` takes a SCALE FACTOR, and Chromium's own relation between the two is
 * `factor = 1.2 ** level`. Derived from `main.ts`'s `processZoomForScreen`:
 *   f = parseFloat(zoomFactor)  (NaN falls back to 1, matching "no zoom change")
 *   screenW = window.screen.availWidth  (stands in for Electron's
 *     `screen.getPrimaryDisplay().workAreaSize.width`)
 *   k = screenW < 1200 ? screenW / 1200 : 1
 *   level = (f * k - 1) / 0.2
 * then convert level -> factor via `Math.pow(1.2, level)` before calling `setZoom`, so
 * the on-screen result matches what Electron's `setZoomLevel(level)` would have
 * produced. Dropping the `Math.pow` conversion and passing `level` straight to
 * `setZoom` silently mis-scales the whole UI -- verified by test.
 */
export const tauriSetZoomFactor = (zoomFactor: string): void => {
  const parsed = parseFloat(zoomFactor)
  const f = Number.isNaN(parsed) ? 1 : parsed
  const screenW = window.screen.availWidth
  const k = screenW < 1200 ? screenW / 1200 : 1
  const level = (f * k - 1) / 0.2
  void getCurrentWebview()
    .setZoom(Math.pow(1.2, level))
    .catch((error) => warn('setZoomFactor', error))
}

/**
 * D-05: applies `settings.framelessWindow` to the real window via `setDecorations()`.
 * Called with no argument to resolve from the settings snapshot (default `false` ->
 * DECORATED, matching Electron's shipped default); called with an explicit boolean
 * when the caller already knows the desired state (the `setSetting` on-toggle path,
 * Task 3). Never throws -- a capability denial or transport hiccup here must not blank
 * the window (SEAM Invariant A).
 */
export const applyFramelessDecorations = (frameless?: boolean): void => {
  try {
    const resolved = frameless ?? readFramelessSetting()
    void getCurrentWindow()
      .setDecorations(!resolved)
      .catch((error) => warn('setDecorations', error))
  } catch (error) {
    warn('applyFramelessDecorations', error)
  }
}

/**
 * D-06: `-webkit-app-region: drag`/`no-drag` is a Chromium/Electron-only affordance --
 * the platform webviews Tauri uses do not honor it, so without this a frameless window
 * would be undraggable. Reads the EXISTING CSS as the source of truth (no frontend
 * change): walks from the event target up through its ancestors, resolving `drag` on
 * the first ancestor that declares it, `no-drag` on the first ancestor that declares
 * `no-drag`. If the property is unsupported by the webview (every ancestor's computed
 * value is empty), falls back to a `.Sidebar`-vs-interactive-element heuristic that
 * approximates the same regions the CSS declares today.
 */
interface DragTarget {
  parentElement: DragTarget | null
  closest(selectors: string): DragTarget | null
}

function resolveDragRegion(target: EventTarget | null): boolean {
  const start = target as DragTarget | null
  if (!start || typeof start.closest !== 'function') return false

  let el: DragTarget | null = start
  let propertySeen = false
  while (el) {
    const value = getComputedStyle(el as unknown as Element)
      .getPropertyValue('-webkit-app-region')
      .trim()
    if (value === 'no-drag') return false
    if (value === 'drag') return true
    if (value) propertySeen = true
    el = el.parentElement
  }

  if (propertySeen) return false

  if (
    start.closest(
      'a, button, [role="button"], input, select, textarea, .WindowControls'
    )
  ) {
    return false
  }
  return start.closest('.Sidebar') !== null
}

function handleDragMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return
  if (!resolveDragRegion(event.target)) return
  void getCurrentWindow()
    .startDragging()
    .catch((error) => warn('startDragging', error))
}

function handleDragDoubleClick(event: MouseEvent): void {
  if (!resolveDragRegion(event.target)) return
  void getCurrentWindow()
    .toggleMaximize()
    .catch((error) => warn('toggleMaximize', error))
}

let dragHandlersInstalled = false

/**
 * Installs the `mousedown`/`dblclick` drag-region listeners once, only under Tauri.
 * Idempotent -- safe to call from `tauriAttach.ts` on every attach.
 */
export const installDragRegionHandlers = (): void => {
  if (dragHandlersInstalled) return
  if (!isTauri()) return
  dragHandlersInstalled = true
  try {
    document.addEventListener('mousedown', handleDragMouseDown, true)
    document.addEventListener('dblclick', handleDragDoubleClick, true)
  } catch (error) {
    warn('installDragRegionHandlers', error)
  }
}
