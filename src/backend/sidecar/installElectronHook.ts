/**
 * Installs the `Module._load` hook that redirects `require('electron')` ->
 * electronStub and `require('electron-store')` -> fileStore, satisfying spike
 * 009's two import-time walls (`app.getPath()` at module scope in
 * `constants/paths.ts`; `new Store()` at module scope in `electron_store.ts`
 * and `cache.ts`).
 *
 * WHY ITS OWN MODULE (Phase 27 Plan 05 — blank-screen fix): the hook MUST be
 * installed before ANY backend module is imported. It previously lived as an
 * assignment STATEMENT in `bootstrap.ts`'s body — but ES modules evaluate every
 * static `import` in a module BEFORE any of that module's own top-level
 * executable statements run. So `bootstrap.ts`'s `import './handlers'` (which
 * transitively constructs store managers, e.g. `legendary/electronStores.ts`'s
 * `new CacheStore()` -> `require('electron-store')`) evaluated BEFORE the hook
 * assignment ever executed, hitting the REAL electron-store, which throws
 * `TypeError: The "path" argument must be of type string. Received undefined`
 * and crashes the sidecar on boot. A dead sidecar never answers the renderer's
 * `sidecar:store-snapshot` RPC, so the Tauri window rendered blank (the renderer
 * hard-awaits that snapshot before mounting React).
 *
 * Installing the hook as a SIDE EFFECT of a module that is the FIRST-declared
 * import in `bootstrap.ts` guarantees hook-before-graph: ES modules evaluate
 * imports depth-first in declaration order, and this module's own imports
 * (`electronStub`, `fileStore`, transitively `pathShim`) touch only Node
 * built-ins — never the backend graph — so nothing here triggers an
 * `electron-store` construction before the hook is up.
 */

import Module from 'node:module'
import * as electronStub from './electronStub'
import FileStore from './fileStore'

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
  if (request === 'electron-store') {
    return { __esModule: true, default: FileStore }
  }
  return originalLoad(request, parent, isMain)
}

export {}
