import { makeListenerCaller, makeHandlerInvoker } from '../ipc'
import { applyFramelessDecorations } from './tauriWindowChrome'

export const requestAppSettings = makeHandlerInvoker('requestAppSettings')
export const requestGameSettings = makeHandlerInvoker('requestGameSettings')

const setSettingIpc = makeListenerCaller('setSetting')

// D-05 (Phase 34.1 Plan 03): writing `settings.framelessWindow` (the `default` app
// scope -- game-scoped settings never affect the app window) re-applies window
// decorations immediately via `applyFramelessDecorations()`.
// WR-05 (Phase 34.1 code review): the destructure below is null-safe by construction
// (`args[0] ?? {}`), so it is safe to run unconditionally after the IPC send has gone
// out, regardless of whether `appName`/`key`/`value` are present.
// Phase 35 plan 17: the Tauri-context early return that used to precede this
// destructure is gone -- there is only one shell now, so the guard was always a no-op.
export const setSetting = (...args: Parameters<typeof setSettingIpc>) => {
  setSettingIpc(...args)
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
// Phase 35 plan 26 (REQ-35-17): `removeEosOverlay` now takes a `confirmed: boolean` argument —
// `makeHandlerInvoker` is a fully generic pass-through, so no code change is needed here beyond
// the widened type flowing through from `common/types/ipc.ts`.
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
