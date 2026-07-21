/**
 * Electron-untouched byte-comparison proof (Phase 28 Plan 05).
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
 * `~/Library/Application Support/GameLib/steam_store/steamConfigStore.json`. This suite
 * snapshots the store's pre-existing contents in `beforeAll` and RESTORES (never `clear()`s)
 * them in `afterAll`, so a real Steam session on the machine running this suite is never lost.
 *
 * The final two tests are a by-construction source gate (T-28-01/T-28-09): they read the
 * sidecar's own source files with comments stripped and assert the forbidden identifiers/lie
 * never reappear, so a regression fails this automated suite rather than relying on code
 * review.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'node:crypto'

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
jest.mock('electron-store', () => ({
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
  programChannel('keyring_get', { type: 'resolve', value: 'sidecar-only-token' })
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

// ── Real-config-directory snapshot/restore (module scope, not clear()) ─────
let originalIsLoggedIn: boolean | undefined
let originalRefreshToken: string | undefined
let originalUserData: unknown
let subjectToken: string

beforeAll(() => {
  const original = steamConfigStore.raw_store
  originalIsLoggedIn = original.isLoggedIn
  originalRefreshToken = original.refreshToken
  originalUserData = original.userData

  // If the developer's real store already has a refreshToken, use it as the
  // byte-comparison subject (never touch it). Otherwise seed a synthetic
  // sentinel so the comparison has a real subject to check against.
  if (originalRefreshToken) {
    subjectToken = originalRefreshToken
  } else {
    subjectToken = `electron-owned-sentinel-${randomUUID()}`
    steamConfigStore.set('refreshToken', subjectToken)
  }
})

afterAll(() => {
  // Restore, never clear() — leaves the developer's real Steam session exactly
  // as this suite found it.
  if (originalRefreshToken !== undefined) {
    steamConfigStore.set('refreshToken', originalRefreshToken)
  } else {
    steamConfigStore.delete('refreshToken')
  }
  if (originalUserData !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    steamConfigStore.set('userData', originalUserData as any)
  }
  if (originalIsLoggedIn !== undefined) {
    steamConfigStore.set('isLoggedIn', originalIsLoggedIn)
  }
})

beforeEach(() => {
  program = {}
  // resetMocks: true wipes even a factory-supplied implementation before every test (the
  // same gotcha keyringTokenStore.test.ts documents) — re-wire the fake responder here.
  mockRequestRustInvoke.mockImplementation((channel: string, _args: unknown[]) => {
    const outcome = program[channel]
    if (!outcome) {
      return Promise.reject(new Error(`no outcome programmed for channel: ${channel}`))
    }
    return outcome.type === 'resolve'
      ? Promise.resolve(outcome.value)
      : Promise.reject(outcome.error)
  })
})

describe('Electron-untouched byte-comparison proof (D-04, REQ-28-02/REQ-28-04)', () => {
  it('setToken() leaves configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.setToken('sidecar-only-token')

    expect(currentRefreshToken()).toBe(before)
    expect(currentRefreshToken()).toBe(subjectToken)
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

/** Strips `//`, `/* ... *\/`-continuation, and `*`-prefixed docblock lines before matching, so
 * an explanatory comment naming a forbidden identifier does not fail its own gate. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}
