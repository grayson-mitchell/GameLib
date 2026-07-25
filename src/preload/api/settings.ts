import { makeListenerCaller, makeHandlerInvoker } from '../ipc'
import { isTauri } from '../tauriTransport'
import { applyFramelessDecorations } from './tauriWindowChrome'

export const requestAppSettings = makeHandlerInvoker('requestAppSettings')
export const requestGameSettings = makeHandlerInvoker('requestGameSettings')

const setSettingIpc = makeListenerCaller('setSetting')

// D-05 (Phase 34.1 Plan 03): under Tauri, writing `settings.framelessWindow` (the
// `default` app scope -- game-scoped settings never affect the app window)
// re-applies window decorations immediately via `applyFramelessDecorations()`. This
// is a deliberate SUPERSET of Electron parity: Electron's own Settings label for this
// toggle says "requires restart" (it is only read once, at `createMainWindow()` time,
// `main_window.ts:44`), whereas D-05's own text calls for "re-applying when the user
// toggles it". Never runs on the Electron path.
// WR-05 (Phase 34.1 code review): the destructure must not run on the Electron path.
// The comment above claims "Never runs on the Electron path", but only the
// `applyFramelessDecorations` CALL was guarded -- `const [{ appName, key, value }] =
// args` executed on BOTH paths, after the IPC send had already gone out. `setSetting`
// used to be a pure passthrough that could not throw; it is reachable from untyped
// renderer code (including anything running in the `main` window, per this capability's
// own threat model), where `window.api.setSetting()` or `setSetting(null)` then threw a
// TypeError synchronously into the caller instead of being harmlessly forwarded --
// breaking the "Electron path byte-identical" invariant this slice asserts elsewhere.
// The `isTauri()` early return now precedes any property access, and the remaining
// destructure is itself null-safe.
export const setSetting = (...args: Parameters<typeof setSettingIpc>) => {
  setSettingIpc(...args)
  if (!isTauri()) return
  const { appName, key, value } = args[0] ?? {}
  if (appName === 'default' && key === 'framelessWindow') {
    applyFramelessDecorations(Boolean(value))
  }
}
export const getLegendaryVersion = makeHandlerInvoker('getLegendaryVersion')
export const getGogdlVersion = makeHandlerInvoker('getGogdlVersion')
export const getCometVersion = makeHandlerInvoker('getCometVersion')
export const getNileVersion = makeHandlerInvoker('getNileVersion')
export const getEosOverlayStatus = makeHandlerInvoker('getEosOverlayStatus')
export const getLatestEosOverlayVersion = makeHandlerInvoker('getLatestEosOverlayVersion')
export const removeEosOverlay = makeHandlerInvoker('removeEosOverlay')
export const updateEosOverlayInfo = makeHandlerInvoker('updateEosOverlayInfo')
export const changeTrayColor = makeListenerCaller('changeTrayColor')
export const getMaxCpus = makeHandlerInvoker('getMaxCpus')
export const showUpdateSetting = makeHandlerInvoker('showUpdateSetting')
export const egsSync = makeHandlerInvoker('egsSync')
export const showLogFileInFolder = makeListenerCaller('showLogFileInFolder')
export const getLogContent = makeHandlerInvoker('getLogContent')
export const systemInfo = {
  get: makeHandlerInvoker('getSystemInfo'),
  copyToClipboard: makeListenerCaller('copySystemInfoToClipboard')
}
export const hasExecutable = makeHandlerInvoker('hasExecutable')
