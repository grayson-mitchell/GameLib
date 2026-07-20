/* eslint-disable @typescript-eslint/no-unused-vars */
import { contextBridge } from 'electron'
import api from './api'
import { flatpakRuntimeVersion, isFlatpak, isSteamDeck, isSteamDeckGameMode } from 'backend/constants/environment'
import { isTauri } from './tauriTransport'
// BLOCKER-1 (27-01): contextBridge doesn't exist under Tauri, and this bundle
// (build/preload/index.js) is never loaded by the Tauri webview at runtime --
// `tauri.conf.json`'s frontendDist points only at the renderer output (27-01's own
// finding). In practice `src/frontend/index.tsx` imports `./tauriAttach` directly for its
// own bundle instead (see that file's doc comment for why: importing THIS file's
// unconditional `import { contextBridge } from 'electron'` / `backend/constants/environment`
// from the renderer bundle would break, since neither is Node/Electron-safe there). This
// side-effect import runs tauriAttach's own isTauri() guard here too, so this specific
// bundle stays correct if a later plan ever does wire it into the Tauri webview directly
// (e.g. via an init-script injection) -- today it is a guarded no-op under Tauri, since
// this file is never actually loaded there.
import './tauriAttach'

if (!isTauri()) {
  // contextBridge branch -- unchanged Electron behavior. Tauri's attach already ran via
  // the `./tauriAttach` side-effect import above.
  contextBridge.exposeInMainWorld('api', api)
  contextBridge.exposeInMainWorld('isSteamDeckGameMode', isSteamDeckGameMode)
  contextBridge.exposeInMainWorld('isFlatpak', isFlatpak)
  contextBridge.exposeInMainWorld('isSteamDeck', isSteamDeck)
  contextBridge.exposeInMainWorld('platform', process.platform)
  contextBridge.exposeInMainWorld('isE2ETesting', process.env.CI === 'e2e')
  contextBridge.exposeInMainWorld('flatpakRuntimeVersion', flatpakRuntimeVersion)
}

if (navigator.userAgent.includes('Windows')) {
  Object.defineProperty(navigator, 'platform', {
    get: function () {
      return 'Win32'
    },
    set: function (a) {}
  })

  Object.defineProperty(navigator, 'userAgentData', {
    get: function () {
      return null
    },
    set: function (a) {}
  })
}
