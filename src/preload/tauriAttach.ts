/**
 * Tauri window.api attach (Phase 27 Plan 03 -- BLOCKER-1 fix, 27-01).
 *
 * `contextBridge` does not exist under Tauri (Electron-only, only available inside a real
 * Electron preload script's isolated execution context) -- and the preload compiles to a
 * SEPARATE `build/preload` bundle the Tauri webview never loads at all (27-01 finding).
 * So under Tauri, the renderer entry (src/frontend/index.tsx) must attach `window.api` +
 * the 6 preload globals itself, directly, as part of the SAME renderer bundle -- this
 * module is that seam.
 *
 * Runs as a SIDE EFFECT on import (deliberately not a callable export the caller invokes
 * later): index.tsx imports this as its very first import specifically so this module's
 * dependency subtree (`./api` + `./tauriTransport`, both Electron/Node-free) evaluates
 * before any other import in that file -- critically before `frontend/helpers/electronStores`
 * (transitively pulled in by `frontend/state/GlobalState`), whose module-level
 * `new TypeCheckedStoreFrontend(...)` calls read `window.api.storeNew` synchronously the
 * moment THAT module is first imported. ES modules resolve all of a file's static imports,
 * in declaration order, before any of that file's own top-level statements run -- so a
 * callable `attachTauriApi()` invoked as a regular statement in index.tsx would always run
 * too late, after every sibling import has already evaluated.
 *
 * Deliberately its OWN file, separate from `src/preload/index.ts`: that file's top-level
 * code unconditionally calls `contextBridge.exposeInMainWorld(...)` in its Electron branch
 * (the real Electron preload entry point, loaded natively by Electron before any renderer
 * script runs) -- importing THAT file from the renderer bundle would also pull in its
 * Node-only `backend/constants/environment` import (os.cpus(), graceful-fs) at module
 * scope. This module has zero Electron/Node imports, so it is safe to import
 * unconditionally from the renderer entry; it no-ops entirely under Electron.
 */
import api from './api'
import { isTauri } from './tauriTransport'
import { applyFramelessDecorations, installDragRegionHandlers } from './api/tauriWindowChrome'
import { isMacWebview } from './platformDetect'

// Proof-of-execution marker (Phase 27 Plan 05): the literal first console line so we can
// confirm this attach module evaluates BEFORE the renderer renders / lazy-loads App (whose
// `frontend/helpers/index.ts` reads `window.api.readConfig` at module scope). If this line
// is absent from the console, the attach never ran; if present, the attach ran and any
// remaining `window.api` failure is a detection/attach-condition problem, not ordering.
console.log('[GameLib] tauriAttach evaluating (pre-detect)')

const tauriDetected = isTauri()
const apiAlreadyPresent = typeof window.api !== 'undefined'

// Attach when EITHER Tauri is detected OR `window.api` is not already present. The second
// clause is the load-bearing robustness fix (Phase 27 Plan 05): under Electron the real
// preload's `contextBridge.exposeInMainWorld('api', ...)` has ALREADY set `window.api`
// before this renderer bundle runs, so `apiAlreadyPresent` is true and we correctly no-op
// (Electron path byte-identical). Under Tauri there is NO preload, so `window.api` is
// undefined here regardless of whether `isTauri()` detection succeeds — attaching on
// `!apiAlreadyPresent` therefore eliminates the `isTauri()` false-negative that otherwise
// leaves `window.api` unset and blanks the screen.
const shouldAttach = tauriDetected || !apiAlreadyPresent

// Startup environment diagnostic — a detection/attach false-negative is the exact cause of
// the `window.api is undefined` blank screen, so log the signals up front (visible in the
// Tauri dev webview devtools console).
console.log('[GameLib] renderer env detection:', {
  isTauri: tauriDetected,
  hasTauriInternals: typeof (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined',
  hasWindowIsTauri: Boolean((globalThis as { isTauri?: unknown }).isTauri),
  apiAlreadyPresent,
  willAttach: shouldAttach
})

if (shouldAttach) {
  window.api = api
  console.log('[GameLib] window.api attached (readConfig present:', typeof window.api.readConfig, ')')
  // Tauri-safe fallbacks for the 6 globals the Electron preload normally computes from
  // `backend/constants/environment.ts` (Node-only: os.cpus(), graceful-fs,
  // process.env/argv -- no browser equivalent inside a webview). Neither Steam Deck nor
  // Flatpak detection is load-bearing for either of the skeleton's two E2E flows
  // (27-CONTEXT: explicitly out of scope this phase) -- revisit if/when Tauri packaging
  // targets those platforms for real.
  window.isSteamDeckGameMode = false
  window.isFlatpak = false
  window.isSteamDeck = false
  window.platform = (isMacWebview() ? 'darwin' : 'linux') as NodeJS.Platform
  window.isE2ETesting = false
  window.flatpakRuntimeVersion = undefined

  // D-05/D-06 (Phase 34.1 Plan 03): apply the settings.framelessWindow decoration
  // state before React renders, so the window never visibly flips on startup.
  // applyFramelessDecorations()/installDragRegionHandlers() are already total (never
  // throw -- see tauriWindowChrome.ts's own header comment); this try/catch is a
  // second, deliberately redundant layer, because a throw anywhere in this attach
  // path blanks the window (SEAM Invariant A) and no window-chrome failure is worth
  // that risk.
  try {
    applyFramelessDecorations()
  } catch (error) {
    console.warn('[GameLib] applyFramelessDecorations failed:', error)
  }
  try {
    installDragRegionHandlers()
  } catch (error) {
    console.warn('[GameLib] installDragRegionHandlers failed:', error)
  }
}

export {}
