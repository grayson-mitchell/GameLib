/**
 * Installs the `Module._load` hook that redirects `require('electron')` ->
 * electronStub, satisfying spike 009's import-time wall: `app.getPath()` is
 * called at MODULE SCOPE in `constants/paths.ts`.
 *
 * PHASE 35 PLAN 05 (D-04) — the second interception is GONE. This hook used to
 * ALSO redirect `require('electron-store')` -> `fileStore`, because the real
 * `electron-store` does `require('electron')` on line 3 of its `index.js` and
 * threw `TypeError: The "path" argument must be of type string. Received
 * undefined` under bare Node, which is spike 009's second import-time wall
 * (`new Store()` at module scope in `electron_store.ts` and `cache.ts`).
 * `electron-store` has been replaced by `backend/store_backend.ts` — a
 * first-party shim over `conf` that resolves its `cwd` from `pathShim` and
 * requires no Electron runtime at all. Nothing asks for `electron-store` by
 * name any more, so the branch was dead and was deleted with its docs.
 *
 * WHY ITS OWN MODULE (Phase 27 Plan 05 — blank-screen fix): the hook MUST be
 * installed before ANY backend module is imported. It previously lived as an
 * assignment STATEMENT in `bootstrap.ts`'s body — but ES modules evaluate every
 * static `import` in a module BEFORE any of that module's own top-level
 * executable statements run. So `bootstrap.ts`'s `import './handlers'` (which
 * transitively pulls in `constants/paths.ts` -> `app.getPath()`) evaluated
 * BEFORE the hook assignment ever executed, hitting the REAL `electron` and
 * crashing the sidecar on boot. A dead sidecar never answers the renderer's
 * `sidecar:store-snapshot` RPC, so the Tauri window rendered blank (the
 * renderer hard-awaits that snapshot before mounting React).
 *
 * Installing the hook as a SIDE EFFECT of a module that is the FIRST-declared
 * import in `bootstrap.ts` guarantees hook-before-graph: ES modules evaluate
 * imports depth-first in declaration order, and this module's own import
 * (`electronStub`, transitively `pathShim`) touches only Node built-ins —
 * never the backend graph — so nothing here triggers an `app.getPath()` call
 * before the hook is up.
 */

import Module from 'node:module'
import * as electronStub from '../platform'

interface ModuleWithLoad {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}

const moduleWithLoad = Module as unknown as ModuleWithLoad
const originalLoad = moduleWithLoad._load.bind(moduleWithLoad)

moduleWithLoad._load = (
  request: string,
  parent: unknown,
  isMain: boolean
): unknown => {
  if (request === 'electron') {
    return electronStub
  }
  return originalLoad(request, parent, isMain)
}

export {}
