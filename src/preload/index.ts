/* eslint-disable @typescript-eslint/no-unused-vars */
// Phase 35 Plan 14 (D-17): the Electron context-bridge block is GONE with the shell.
//
// It exposed `api`, `platform`, `isE2ETesting`, `flatpakRuntimeVersion` and the Steam
// Deck / Flatpak flags on `window`, behind an Electron-only guard -- the Electron
// branch of a two-runtime file. That API does not exist under Tauri, and the
// unconditional top-level `electron` import it required is precisely why
// `src/frontend/index.tsx` imports `./tauriAttach` DIRECTLY rather than importing this
// file: neither `electron` nor `backend/constants/environment` is safe in the renderer
// bundle. With Electron deleted the guard has only one reachable branch, so the block
// and its four now-unused imports go together.
//
// What this file still does, and why it is not deleted outright:
//   - the `./tauriAttach` side-effect import below, which runs tauriAttach's own
//     Tauri-context detection, so this bundle stays correct if a later plan ever wires it
//     into the Tauri webview directly (e.g. via an init-script injection);
//   - the Windows `navigator.platform` / `navigator.userAgentData` shim below.
//
// `src/preload/api/*` is UNTOUCHED and must stay: `tauriAttach` consumes it. This bundle
// (`build/preload/index.js`) was never loaded by the Tauri webview at runtime --
// `tauri.conf.json`'s frontendDist points only at the renderer output (27-01's finding),
// which is what made this cut small (D-00f).
import './tauriAttach'

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
