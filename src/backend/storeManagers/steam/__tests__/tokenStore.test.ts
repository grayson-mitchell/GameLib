/**
 * Unit tests for the Steam TokenStore seam (D-09, REQ-28-02/REQ-28-03).
 *
 * Covers:
 *  - D-12 (Phase 72, 2026-11-08): the module default is a FAIL-CLOSED
 *    `UnconfiguredTokenStore`. This REVERSES the earlier D-11 stance, under which
 *    the Electron-era store "deliberately" kept a plaintext fallback ("DELIBERATE,
 *    do not remove"). That store and its plaintext write path are deleted; the
 *    assertions below now prove nothing is ever persisted before bootstrap
 *    installs the keyring / dev-vault store.
 *  - The setTokenStore/getTokenStore registry swap point, proven by routing
 *    user.ts's SteamUser.getCredentials() through a fake implementation.
 *  - REQ-28-03 (no migration): tokenStore.ts contains no import of a
 *    keyring/sidecar transport module.
 *
 * Mock boundaries mirror user.test.ts's existing convention in this directory:
 *  - backend/platform (app.getPath: constants.ts calls it at import time)
 *  - backend/logger
 *  - ../stores -> configStore (in-memory map, not electron-store)
 *  - steam-session / steam-user / graceful-fs -> minimal stubs so `../user`
 *    can be imported for the registry-swap proof.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('backend/platform', () => ({
  app: { getPath: () => '/tmp/test' }
}))

// ── Logger mock ────────────────────────────────────────────────────────────
const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logError: jest.fn(),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend',
    Gog: 'Gog',
    Legendary: 'Legendary',
    Nile: 'Nile',
    Sideload: 'Sideload'
  }
}))

// ── stores mock — in-memory map standing in for configStore ─────────
let backingStore: Record<string, unknown> = {}
const mockConfigStore = {
  has: jest.fn((key: string) => key in backingStore),
  get_nodefault: jest.fn((key: string) => backingStore[key]),
  set: jest.fn((key: string, value: unknown) => {
    backingStore[key] = value
  }),
  delete: jest.fn((key: string) => {
    delete backingStore[key]
  }),
  clear: jest.fn(() => {
    backingStore = {}
  })
}
jest.mock('../stores', () => ({
  configStore: mockConfigStore
}))

// ── Minimal stubs so ../user can be imported (registry-swap proof only) ─────
jest.mock('graceful-fs', () => ({ existsSync: jest.fn(() => false) }))
jest.mock('steam-session', () => ({
  LoginSession: jest.fn(),
  EAuthTokenPlatformType: { SteamClient: 2 }
}))
jest.mock('steam-user', () => jest.fn())

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import {
  TokenStore,
  setTokenStore,
  getTokenStore,
  readTokenOutcome,
  clearOrphanedElectronToken
} from '../tokenStore'
import { SteamUser } from '../user'

describe('tokenStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    backingStore = {}
    // resetMocks: true (jest.config.js) wipes even a jest.fn(impl) factory's
    // initial implementation before every test — re-establish the in-memory
    // configStore backing so get_nodefault/set/delete/clear are genuinely
    // wired to `backingStore`, not silently no-op stubs that only record calls.
    mockConfigStore.has.mockImplementation((key: string) => key in backingStore)
    mockConfigStore.get_nodefault.mockImplementation(
      (key: string) => backingStore[key]
    )
    mockConfigStore.set.mockImplementation((key: string, value: unknown) => {
      backingStore[key] = value
    })
    mockConfigStore.delete.mockImplementation((key: string) => {
      delete backingStore[key]
    })
    mockConfigStore.clear.mockImplementation(() => {
      backingStore = {}
    })
    mockLogWarning.mockClear()
  })

  // Each test imports a fresh module so the default store is the untouched one.
  describe('default store (UnconfiguredTokenStore, D-12)', () => {
    function freshModule(): typeof import('../tokenStore') {
      let mod: typeof import('../tokenStore') | undefined
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require('../tokenStore')
      })
      if (!mod) throw new Error('tokenStore failed to load')
      return mod
    }

    it('isAvailable() is false', async () => {
      const store = freshModule().getTokenStore()
      await expect(store.isAvailable()).resolves.toBe(false)
    })

    it('getToken() returns "" and readToken() reports unreadable/unavailable', async () => {
      const mod = freshModule()
      const store = mod.getTokenStore()
      await expect(store.getToken()).resolves.toBe('')
      await expect(mod.readTokenOutcome(store)).resolves.toEqual({
        status: 'unreadable',
        reason: 'unavailable'
      })
    })

    it('setToken() throws "Steam token store not installed" and never writes configStore (T-72-16)', async () => {
      const store = freshModule().getTokenStore()
      await expect(store.setToken('abc')).rejects.toThrow(
        'Steam token store not installed'
      )
      expect(mockConfigStore.set).not.toHaveBeenCalled()
      expect(backingStore['refreshToken']).toBeUndefined()
    })

    it('clearToken() resolves without throwing and logs a warning', async () => {
      const store = freshModule().getTokenStore()
      await expect(store.clearToken()).resolves.toBeUndefined()
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
    })
  })

  describe('registry (setTokenStore/getTokenStore)', () => {
    it('setTokenStore(fake) swaps the active store, and SteamUser.getCredentials() reads through it', async () => {
      const fake: TokenStore = {
        isAvailable: jest.fn().mockResolvedValue(true),
        getToken: jest.fn().mockResolvedValue('fake-token'),
        setToken: jest.fn().mockResolvedValue(undefined),
        clearToken: jest.fn().mockResolvedValue(undefined)
      }

      setTokenStore(fake)
      expect(getTokenStore()).toBe(fake)

      // Proves the swap point is real: user.ts needed no edit to pick up a
      // different TokenStore implementation per build.
      const creds = await SteamUser.getCredentials()
      expect(creds).toEqual({ refreshToken: 'fake-token' })
      expect(fake.getToken).toHaveBeenCalled()

      // The fake never touches configStore's TOKEN_STORE_KEY at all.
      expect(mockConfigStore.get_nodefault).not.toHaveBeenCalled()
    })
  })

  describe('readTokenOutcome (quick-260814-r2d)', () => {
    it('on a store WITHOUT readToken(), a non-empty getToken() resolves { status: "present", token }', async () => {
      const store: TokenStore = {
        isAvailable: jest.fn().mockResolvedValue(true),
        getToken: jest.fn().mockResolvedValue('abc'),
        setToken: jest.fn().mockResolvedValue(undefined),
        clearToken: jest.fn().mockResolvedValue(undefined)
      }

      await expect(readTokenOutcome(store)).resolves.toEqual({
        status: 'present',
        token: 'abc'
      })
    })

    it('on a store WITHOUT readToken(), an empty getToken() resolves { status: "absent" }', async () => {
      const store: TokenStore = {
        isAvailable: jest.fn().mockResolvedValue(true),
        getToken: jest.fn().mockResolvedValue(''),
        setToken: jest.fn().mockResolvedValue(undefined),
        clearToken: jest.fn().mockResolvedValue(undefined)
      }

      await expect(readTokenOutcome(store)).resolves.toEqual({
        status: 'absent'
      })
    })

    it('on a store WITH readToken(), delegates to it verbatim and never calls getToken()', async () => {
      const mockGetToken = jest.fn().mockResolvedValue('should-not-be-used')
      const mockReadToken = jest
        .fn()
        .mockResolvedValue({ status: 'unreadable', reason: 'timeout' })
      const store: TokenStore = {
        isAvailable: jest.fn().mockResolvedValue(true),
        getToken: mockGetToken,
        setToken: jest.fn().mockResolvedValue(undefined),
        clearToken: jest.fn().mockResolvedValue(undefined),
        readToken: mockReadToken
      }

      await expect(readTokenOutcome(store)).resolves.toEqual({
        status: 'unreadable',
        reason: 'timeout'
      })
      expect(mockReadToken).toHaveBeenCalledTimes(1)
      expect(mockGetToken).not.toHaveBeenCalled()
    })
  })

  // debug/steam-token-survives-keychain: `clearOrphanedElectronToken()` retires a
  // frozen pre-Tauri Electron-era `refreshToken` key from `configStore`
  // (`steam_store/config.json`). Unit-level coverage against the mocked
  // `configStore` — presence-only has()/delete(), never a read of the value
  // itself. Boot-time log-line and real-store coverage lives in
  // `bootstrap.test.ts` (the caller decides whether to log; this function never
  // does).
  describe('clearOrphanedElectronToken (debug/steam-token-survives-keychain)', () => {
    it('present: deletes the key, returns true, and never reads the value in any form', () => {
      backingStore['refreshToken'] =
        'steam:v1:some-ciphertext-or-legacy-plaintext'

      const result = clearOrphanedElectronToken()

      expect(result).toBe(true)
      expect(mockConfigStore.delete).toHaveBeenCalledWith('refreshToken')
      expect(backingStore['refreshToken']).toBeUndefined()
      // PRESENCE-ONLY by design: has()+delete() only, never get()/get_nodefault().
      expect(mockConfigStore.get_nodefault).not.toHaveBeenCalled()
    })

    it('absent: no-op, returns false, and delete() is never called', () => {
      const result = clearOrphanedElectronToken()

      expect(result).toBe(false)
      expect(mockConfigStore.delete).not.toHaveBeenCalled()
    })

    it('idempotent: a second call after the key is already gone is a silent no-op', () => {
      backingStore['refreshToken'] =
        'steam:v1:some-ciphertext-or-legacy-plaintext'

      expect(clearOrphanedElectronToken()).toBe(true)
      expect(mockConfigStore.delete).toHaveBeenCalledTimes(1)

      expect(clearOrphanedElectronToken()).toBe(false)
      // Still exactly once — the second call never touches delete() at all.
      expect(mockConfigStore.delete).toHaveBeenCalledTimes(1)
    })

    it('tokenStore.ts source contains no import of storeWriteHandlers — the delete structurally cannot route through the D-04 write guard', () => {
      const src = readFileSync(join(__dirname, '../tokenStore.ts'), 'utf-8')
      const importLines = src
        .split('\n')
        .filter((line) => /^\s*import\b/.test(line))
      for (const line of importLines) {
        expect(line).not.toMatch(/storeWriteHandlers/i)
      }
      expect(importLines.length).toBeGreaterThan(0)
    })
  })

  describe('no-migration guard (REQ-28-03)', () => {
    it('tokenStore.ts source contains no import of a keyring/sidecar transport module', () => {
      const src = readFileSync(join(__dirname, '../tokenStore.ts'), 'utf-8')
      // Structural proof, scoped to actual `import` statements (not prose —
      // the module's own docstring legitimately discusses "keyring" as
      // context for a FUTURE sidecar implementation, D-09/D-11). Nothing in
      // this module's import graph reaches a keyring or sidecar transport
      // module, so there is no code path that could forward an
      // Electron-stored token toward one.
      const importLines = src
        .split('\n')
        .filter((line) => /^\s*import\b/.test(line))
      for (const line of importLines) {
        expect(line).not.toMatch(/keyring|sidecarRpc/i)
      }
      // Sanity: this module does import something (guards against a
      // vacuously-true assertion if the file were ever emptied).
      expect(importLines.length).toBeGreaterThan(0)
    })
  })
})
