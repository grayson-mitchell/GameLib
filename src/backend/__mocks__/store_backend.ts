/**
 * Manual mock for `backend/store_backend` (Phase 35 Plan 05 — renamed from
 * `__mocks__/electron-store.ts` when D-04 removed `electron-store`).
 *
 * Subclasses the REAL shim and forces every `cwd` under a fixed subdirectory,
 * so a suite doing a bare `jest.mock('backend/store_backend')` gets its own
 * store tree rather than sharing one with production code paths.
 *
 * The redirect target is a RELATIVE cwd, which the real shim joins onto
 * `pathShim.getPath('userData')`. That is what makes it safe: for the whole
 * `Backend` jest project, `jest.setupContainment.ts` has already redirected
 * `os.homedir()` and `HOME`/`APPDATA`/`XDG_*` into a disposable per-test-file
 * root, so the resolved userData is itself throwaway.
 *
 * This mock previously pointed `cwd` at an ABSOLUTE `tmp.dirSync()` path. That
 * worked only because `electron-store` had no containment check of its own —
 * the check lived in `sidecar/fileStore.ts`. Now that the shim carries WR-11's
 * containment forward, an absolute path outside userData throws, which is the
 * correct behaviour and is what caught this during Plan 05's own gate run.
 */

import { join } from 'path'
import type { StoreOptions } from 'common/types/electron_store'

const OriginalStore = jest.requireActual('../store_backend').default

const MOCK_STORE_ROOT = 'jest_store_root'

export default class Store<
  T extends Record<string, unknown> = Record<string, unknown>
> extends OriginalStore<T> {
  constructor(options?: StoreOptions<T>) {
    super({
      ...(options ?? {}),
      cwd: options?.cwd ? join(MOCK_STORE_ROOT, options.cwd) : MOCK_STORE_ROOT
    })
  }
}
