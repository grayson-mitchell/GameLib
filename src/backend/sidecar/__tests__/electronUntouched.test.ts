/**
 * Electron-untouched byte-comparison proof (Phase 28 Plan 05).
 *
 * ── STRICTLY READ-ONLY. DO NOT ADD `.set()`/`.delete()`/`.clear()` CALLS HERE. ──
 * A previous version of this suite snapshotted the real store in `beforeAll` and
 * restored it in `afterAll`, seeding a synthetic write when no token was present.
 * That restore never ran when the Jest worker was force-killed (this repo has a
 * known leaked-timer crash in `storeManagers/steam/library.ts` that does exactly
 * that), and it permanently destroyed a real developer's Steam session — their
 * refresh token was wiped and `config.json` was left as `{}`. This suite must
 * never write to the real store again, under any code path, for any reason.
 *
 * Covers REQ-28-02/REQ-28-04/D-04: the sidecar's `SidecarKeyringTokenStore` — and the
 * `TokenStore` seam that selects it in a sidecar build — must never write, mutate, or delete
 * anything in the shared Electron `configStore`. This suite drives the REAL (unmocked)
 * `configStore` from `../../storeManagers/steam/electronStores` — the exact module instance
 * `user.ts`/`tokenStore.ts` read/write in production — while faking `requestRustInvoke` (no
 * real Rust process exists in Jest) so every one of `SidecarKeyringTokenStore`'s four
 * operations, success and failure, actually runs.
 *
 * **Load-bearing real-config-directory convention** (mirrors `skeletonFlows.test.ts`'s module
 * docstring and Test 4): `pathShim.ts` has no `HOME`/`XDG_CONFIG_HOME`/`APPDATA` override for
 * darwin, so `configStore` reads/writes the developer's REAL
 * `~/Library/Application Support/GameLib/steam_store/config.json` — NOT `steamConfigStore.json`
 * (the store's `name` argument, `'steamConfigStore'`, is never forwarded into electron-store's
 * real `Store` options by `TypeCheckedStoreBackend`'s constructor — only `{ cwd: 'steam_store' }`
 * is, so electron-store falls back to its own default filename, `config.json`). Because this
 * suite may run against real user data, it only ever READS that file — never snapshots-and-
 * restores it. Safety is proven by comparing the file's raw bytes (`fs.readFileSync`) before and
 * after driving the sidecar; reading is inherently safe, so there is nothing to restore.
 *
 * The final two tests are a by-construction source gate (T-28-01/T-28-09): they read the
 * sidecar's own source files with comments stripped and assert the forbidden identifiers/lie
 * never reappear, so a regression fails this automated suite rather than relying on code
 * review.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

// ── electron / electron-store — route Jest's own module resolution at the REAL
// sidecar shims (mirrors skeletonFlows.test.ts): without this, Jest's automatic
// backend-wide manual mock (`src/backend/__mocks__/electron.ts`, tmpdir-backed)
// would apply instead, and this suite would only prove a synthetic store is
// untouched, not the actual production `configStore` file path a compiled
// sidecar/Electron build shares (`~/Library/Application Support/GameLib/...`
// via `pathShim.ts` -- the whole point of D-04's proof). `jest.requireActual`
// resolves the SAME singleton module instance `configStore`/`tokenStore.ts`
// bind onto in production. ────────────────────────────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── sidecarRpc mock — fake Rust responder, in-memory program + call log ─────
jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

// ── logger mock — mirrors keyringTokenStore.test.ts's existing convention ──
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  // `SidecarKeyringSlotStore` logs cache-hit lines at DEBUG (F-34.5-G6-26); this suite drives
  // that class directly, so the mock must supply `logDebug` or a cached read throws.
  logDebug: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend',
    Gog: 'Gog',
    Legendary: 'Legendary',
    Nile: 'Nile',
    Sideload: 'Sideload',
    Zoom: 'Zoom'
  }
}))

// ── Imports (after mocks) — configStore is the REAL, unmocked module ───────
import { requestRustInvoke } from '../sidecarRpc'
import { SidecarKeyringTokenStore } from '../keyringTokenStore'
import { configStore as steamConfigStore } from '../../storeManagers/steam/electronStores'
import {
  setTokenStore,
  getTokenStore,
  ElectronTokenStore
} from '../../storeManagers/steam/tokenStore'
// Real (unmocked) pathShim — same module electronStub.ts / fileStore.ts resolve
// paths through in production, used here ONLY to compute the real store file's
// path for a read-only byte comparison. Never used to write.
import { getPath } from '../pathShim'

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

const mockRequestRustInvoke = requestRustInvoke as jest.Mock

let program: Record<string, ProgrammedOutcome> = {}

function programChannel(channel: string, outcome: ProgrammedOutcome): void {
  program[channel] = outcome
}

function programAllReject(message: string): void {
  for (const channel of [
    'keyring_get',
    'keyring_set',
    'keyring_delete',
    'keyring_available'
  ]) {
    programChannel(channel, { type: 'reject', error: new Error(message) })
  }
}

function programAllResolve(): void {
  programChannel('keyring_get', {
    type: 'resolve',
    value: 'sidecar-only-token'
  })
  programChannel('keyring_set', { type: 'resolve', value: true })
  programChannel('keyring_delete', { type: 'resolve', value: true })
  programChannel('keyring_available', { type: 'resolve', value: true })
}

function fullSnapshot(): string {
  return JSON.stringify(steamConfigStore.raw_store)
}

function currentRefreshToken(): string | undefined {
  return steamConfigStore.get_nodefault('refreshToken')
}

// ── Real store file byte-comparison (read-only) ─────────────────────────────
// Mirrors fileStore.ts's own `resolveStorePath`: name is never forwarded by
// `TypeCheckedStoreBackend`, so electron-store's default filename applies.
const REAL_STORE_PATH = join(getPath('userData'), 'steam_store', 'config.json')

/**
 * Reads the real on-disk store file's raw bytes, or `null` if it does not
 * exist (the user's current state, and a fully valid "nothing to compare
 * against went wrong" state). NEVER creates, writes, or deletes the file.
 */
function readRealStoreFileBytes(): Buffer | null {
  if (!existsSync(REAL_STORE_PATH)) return null
  return readFileSync(REAL_STORE_PATH)
}

let storeBytesBeforeSuite: Buffer | null

beforeAll(() => {
  // Read-only snapshot for the whole-suite byte-identity proof below. No
  // `.set()`/`.delete()`/`.clear()` call exists anywhere in this file.
  storeBytesBeforeSuite = readRealStoreFileBytes()
})

beforeEach(() => {
  program = {}
  // resetMocks: true wipes even a factory-supplied implementation before every test (the
  // same gotcha keyringTokenStore.test.ts documents) — re-wire the fake responder here.
  mockRequestRustInvoke.mockImplementation(
    (channel: string, _args: unknown[]) => {
      const outcome = program[channel]
      if (!outcome) {
        return Promise.reject(
          new Error(`no outcome programmed for channel: ${channel}`)
        )
      }
      return outcome.type === 'resolve'
        ? Promise.resolve(outcome.value)
        : Promise.reject(outcome.error)
    }
  )
})

describe('Electron-untouched byte-comparison proof (D-04, REQ-28-02/REQ-28-04)', () => {
  it('setToken() leaves configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.setToken('sidecar-only-token')

    expect(currentRefreshToken()).toBe(before)
  })

  it('getToken() leaves configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    const result = await store.getToken()

    expect(result).toBe('sidecar-only-token')
    expect(currentRefreshToken()).toBe(before)
  })

  it('clearToken() leaves configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.clearToken()

    expect(currentRefreshToken()).toBe(before)
  })

  it('isAvailable() leaves configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.isAvailable()

    expect(currentRefreshToken()).toBe(before)
  })

  it('all four operations in sequence leave configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.setToken('sidecar-only-token')
    await store.getToken()
    await store.isAvailable()
    await store.clearToken()

    expect(currentRefreshToken()).toBe(before)
  })

  it('every failure path (all four keyring channels rejecting) writes nothing to configStore', async () => {
    programAllReject('keyring:unavailable:PlatformFailure')
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.setToken('should-never-persist')
    await store.getToken()
    await store.isAvailable()
    await store.clearToken()

    expect(currentRefreshToken()).toBe(before)
  })

  it('the full serialized configStore snapshot is unchanged across success and failure sequences (no collateral key writes)', async () => {
    const beforeFull = fullSnapshot()

    programAllResolve()
    const store = new SidecarKeyringTokenStore()
    await store.setToken('sidecar-only-token')
    await store.getToken()
    await store.isAvailable()
    await store.clearToken()

    programAllReject('keyring:unavailable:NoStorageAccess')
    await store.setToken('should-never-persist')
    await store.getToken()
    await store.isAvailable()
    await store.clearToken()

    expect(fullSnapshot()).toBe(beforeFull)
  })

  it('the TokenStore seam (setTokenStore/getTokenStore), not just the class directly, leaves configStore byte-identical', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const beforeFull = fullSnapshot()

    try {
      setTokenStore(new SidecarKeyringTokenStore())
      // This is the exact call path user.ts's getCredentials()/finishAuth() use in
      // production — proving the SEAM is safe, not merely the class in isolation.
      await getTokenStore().setToken('sidecar-only-token')
      await getTokenStore().getToken()
      await getTokenStore().clearToken()
    } finally {
      setTokenStore(new ElectronTokenStore())
    }

    expect(currentRefreshToken()).toBe(before)
    expect(fullSnapshot()).toBe(beforeFull)
  })

  it('the real store file on disk is byte-identical before and after the whole suite (fs.readFileSync proof)', () => {
    // Stronger evidence than the in-memory `raw_store` projection above: reads
    // the actual bytes electron-store persisted to disk. Absence-before /
    // absence-after (the user's current state) is a valid pass; so is
    // identical-bytes-before / identical-bytes-after.
    const after = readRealStoreFileBytes()

    if (storeBytesBeforeSuite === null) {
      expect(after).toBeNull()
    } else {
      expect(after).not.toBeNull()
      expect((after as Buffer).equals(storeBytesBeforeSuite)).toBe(true)
    }
  })

  it('by-construction gate: keyringTokenStore.ts and bootstrap.ts never reference configStore/TOKEN_STORE_KEY/TOKEN_PREFIX (comments stripped)', () => {
    const files = [
      join(__dirname, '../keyringTokenStore.ts'),
      join(__dirname, '../bootstrap.ts')
    ]
    for (const file of files) {
      const stripped = stripComments(readFileSync(file, 'utf-8'))
      expect(stripped).not.toMatch(/TOKEN_STORE_KEY|TOKEN_PREFIX|configStore/)
    }
  })

  it('by-construction gate: electronStub.ts safeStorage.isEncryptionAvailable never regresses to the "always true" lie (comments stripped)', () => {
    const src = readFileSync(join(__dirname, '../electronStub.ts'), 'utf-8')
    const stripped = stripComments(src)
    expect(stripped).not.toMatch(
      /isEncryptionAvailable:\s*\(\):\s*boolean\s*=>\s*true/
    )
  })
})

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.
