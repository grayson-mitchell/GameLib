---
created: 2026-11-06T12:00:00.000Z
title: "Rename Electron-era store modules to neutral names, then retire the electron require hook"
area: tooling
files:
  - src/backend/electron_store.ts
  - src/common/types/electron_store.ts
  - src/frontend/helpers/electronStores.ts
  - src/backend/sidecar/installElectronHook.ts
severity: minor
platform: any
ready: code
---

## Problem

GameLib has run on Tauri since 2026-07-20, but its store layer still carries Electron names.
Measured 2026-11-06: 18 modules are named `electronStore(s).ts` or `electron_store.ts` (one per
backend domain and store manager, plus `src/common/types/electron_store.ts` and
`src/frontend/helpers/electronStores.ts`), and 131 non-test files reference
`electronStore`/`electron_store`/`ElectronStore`/`electronStub` names. New readers assume an
Electron app and look for one. From the post-Phase-62 architecture review on 2026-11-06.

Not all of it is naming. The `electron-store` package is already gone: Phase 35 replaced it with
`src/backend/store_backend.ts`, a first-party shim over `conf`. But
`src/backend/sidecar/installElectronHook.ts` still redirects `require('electron')` to a stub,
because backend code such as `constants/paths.ts` still asks the `electron` module for
`app.getPath()` at module scope. The hook and stub stay until those callers ask a neutral
path module instead.

## Solution

Run with `/gsd-quick`, after Phase 62 and Phase 65 so their file moves don't conflict.

1. Rename the modules and exported identifiers to neutral names (e.g. `stores.ts`,
   `TypeCheckedStoreBackend` stays or becomes `TypedStore`; pick one scheme and apply it
   everywhere). Use mechanical moves with no behaviour change, `pnpm codecheck` and jest green after.
2. **Never rename what is saved on disk.** Store names and `cwd`/`name` options passed to the
   store constructors (e.g. `migrationsStore` with `cwd: 'store', name: 'migrations'`) decide
   file paths in the user's config directory. Renaming one orphans that user's data. Leave them
   exactly as they are, or change them only through Phase 68's versioned migrations.
3. Update the jest module mocks and `__mocks__/` paths that follow the renamed modules.
4. Separately, list the remaining runtime `require('electron')` / `from 'electron'` callers the
   hook still serves (comments don't count; match the specifier, not the word). If they are few,
   point them at a neutral module (the `pathShim` that `store_backend.ts` already uses is the
   likely home) and delete `installElectronHook.ts` and the stub in a separate commit. The hook
   must be installed before any backend import (its header records the Phase 27 blank-screen
   incident), so check the sidecar still boots: `pnpm smoke:sidecar`, then a live `pnpm tauri:dev`.
   If there are many, raise a follow-up todo instead of growing this one.
