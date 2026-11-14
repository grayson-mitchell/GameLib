/**
 * The Humble server-action id owner: one per boot, built by `createHumbleServices` and passed to
 * the library, the key reveal and the dev validation run by slice (D-05, D-66.3-17).
 *
 * The ids are Next.js build artifacts. The adapter scrapes them at runtime from the public JS
 * chunks Humble serves, caches them here, and re-discovers one only when a POST proves it stale.
 * A new boot starts empty, so discovery runs again and an id is never shared across boots.
 *
 * This replaces the two module-level caches (`libraryActionCache`, `redeemActionCache`) that
 * 66.4-REVIEW CR-01 found shared across boots (D-66.4-02).
 *
 * Kept in its own leaf module, with no imports, so suites that `jest.mock('../adapter')` can still
 * build one: under such a mock any factory imported from the adapter would be `undefined`.
 *
 * It holds `{ id, chunk }` and nothing else: never a cookie, gamekey or response body (C4/C5).
 */

/** A discovered server-action id. */
export interface HumbleActionIdEntry {
  /** The server-action id (a 40-44 character hex string). */
  id: string
  /** Chunk path the id was found in (diagnostics + search-first hint). */
  chunk: string
}

/** The two server actions the adapter calls. Each has its own slot. */
type HumbleServerAction = 'library' | 'redeem'

/** The boot's action-id owner. */
export interface HumbleActionIdCache {
  get(action: HumbleServerAction): HumbleActionIdEntry | null
  set(action: HumbleServerAction, entry: HumbleActionIdEntry | null): void
}

export function createHumbleActionIdCache(): HumbleActionIdCache {
  let library: HumbleActionIdEntry | null = null
  let redeem: HumbleActionIdEntry | null = null
  return {
    get: (action) => (action === 'library' ? library : redeem),
    set: (action, entry) => {
      if (action === 'library') library = entry
      else redeem = entry
    }
  }
}
