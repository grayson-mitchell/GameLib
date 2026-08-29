/**
 * Unit tests for the Steam TokenStore seam (D-09, REQ-28-02/REQ-28-03).
 *
 * Covers:
 *  - ElectronTokenStore behavioral parity with the pre-seam encryptToken/
 *    decryptToken/encryptionAvailable free functions — byte-identical
 *    Electron behavior is REQ-28-07's hard constraint.
 *  - The D-11 divergence: ElectronTokenStore intentionally keeps a plaintext
 *    fallback on both read (legacy, no-prefix) and write (encryption
 *    unavailable) — this is DELIBERATE, preserved shipped behavior, not a
 *    bug. Do not "fix" the plaintext-write assertion below by removing it.
 *  - The setTokenStore/getTokenStore registry swap point, proven by routing
 *    user.ts's SteamUser.getCredentials() through a fake implementation.
 *  - REQ-28-03 (no migration): tokenStore.ts contains no import of a
 *    keyring/sidecar transport module — a structural proof there is no code
 *    path that reads an Electron-stored token and forwards it elsewhere.
 *
 * Mock boundaries mirror user.test.ts's existing convention in this
 * directory:
 *  - electron       → safeStorage (encrypt/decrypt/availability) + app.getPath
 *                      (constants.ts calls app.getPath('userData') at import time)
 *  - backend/logger
 *  - ../electronStores → configStore (in-memory map, not electron-store)
 *  - steam-session / steam-user / graceful-fs → minimal stubs so `../user`
 *    can be imported for the registry-swap proof without pulling in real
 *    network/OS dependencies.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

// ── Electron mock (must be first, jest.mock is hoisted) ──────────────────────
const mockEncryptString = jest.fn((s: string) => Buffer.from(s))
const mockDecryptString = jest.fn((b: Buffer) => b.toString())
const mockIsEncryptionAvailable = jest.fn(() => true)

jest.mock('backend/platform', () => ({
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString
  },
  app: { getPath: jest.fn(() => '/tmp/test') }
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
    Sideload: 'Sideload',
    Zoom: 'Zoom'
  }
}))

// ── electronStores mock — in-memory map standing in for configStore ─────────
let backingStore: Record<string, unknown> = {}
const mockConfigStore = {
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
jest.mock('../electronStores', () => ({
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
  ElectronTokenStore,
  setTokenStore,
  getTokenStore,
  readTokenOutcome
} from '../tokenStore'
import { SteamUser } from '../user'

describe('tokenStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    backingStore = {}
    mockIsEncryptionAvailable.mockReturnValue(true)
    mockEncryptString.mockImplementation((s: string) => Buffer.from(s))
    mockDecryptString.mockImplementation((b: Buffer) => b.toString())
    // resetMocks: true (jest.config.js) wipes even a jest.fn(impl) factory's
    // initial implementation before every test — re-establish the in-memory
    // configStore backing so get_nodefault/set/delete/clear are genuinely
    // wired to `backingStore`, not silently no-op stubs that only record calls.
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
    // Reset the module-level registry to a fresh ElectronTokenStore between
    // tests so registry-swap tests don't leak into unrelated tests.
    setTokenStore(new ElectronTokenStore())
    mockLogInfo.mockClear() // clear the setTokenStore-above's own info log
  })

  describe('ElectronTokenStore', () => {
    it('setToken writes a steam:v1:-prefixed ciphertext under refreshToken, not raw plaintext', async () => {
      const store = new ElectronTokenStore()
      await store.setToken('abc')

      expect(mockConfigStore.set).toHaveBeenCalledWith(
        'refreshToken',
        expect.stringMatching(/^steam:v1:/)
      )
      const [, storedValue] = mockConfigStore.set.mock.calls[0]
      expect(storedValue).not.toBe('abc')
    })

    it('getToken round-trips a setToken value back to the original plaintext', async () => {
      const store = new ElectronTokenStore()
      await store.setToken('abc')

      const token = await store.getToken()
      expect(token).toBe('abc')
    })

    it('getToken returns a legacy (no steam:v1: prefix) stored value verbatim', async () => {
      backingStore['refreshToken'] = 'legacy-plaintext-token'
      const store = new ElectronTokenStore()

      const token = await store.getToken()
      expect(token).toBe('legacy-plaintext-token')
      expect(mockDecryptString).not.toHaveBeenCalled()
    })

    it('getToken returns "" when the store holds nothing', async () => {
      const store = new ElectronTokenStore()
      const token = await store.getToken()
      expect(token).toBe('')
    })

    it('getToken returns "" when the stored value is not a string', async () => {
      backingStore['refreshToken'] = 42
      const store = new ElectronTokenStore()
      const token = await store.getToken()
      expect(token).toBe('')
    })

    it('getToken returns "" when decryptString throws', async () => {
      backingStore['refreshToken'] =
        'steam:v1:' + Buffer.from('x').toString('base64')
      mockDecryptString.mockImplementationOnce(() => {
        throw new Error('corrupt ciphertext')
      })
      const store = new ElectronTokenStore()

      const token = await store.getToken()
      expect(token).toBe('')
    })

    it('D-11: setToken stores plaintext and logs the exact warning when encryption is unavailable', async () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      const store = new ElectronTokenStore()

      await store.setToken('abc')

      expect(mockConfigStore.set).toHaveBeenCalledWith('refreshToken', 'abc')
      expect(mockLogWarning).toHaveBeenCalledWith(
        'safeStorage unavailable — storing Steam refresh token in plaintext',
        'Steam'
      )
    })

    it('isAvailable() returns false when safeStorage.isEncryptionAvailable() throws', async () => {
      mockIsEncryptionAvailable.mockImplementation(() => {
        throw new Error('Keychain unavailable')
      })
      const store = new ElectronTokenStore()

      await expect(store.isAvailable()).resolves.toBe(false)
    })

    it('clearToken leaves no readable token', async () => {
      const store = new ElectronTokenStore()
      await store.setToken('abc')
      await store.clearToken()

      const token = await store.getToken()
      expect(token).toBe('')
    })
  })

  describe('registry (setTokenStore/getTokenStore)', () => {
    it('getTokenStore() returns an ElectronTokenStore by default', () => {
      expect(getTokenStore()).toBeInstanceOf(ElectronTokenStore)
    })

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

    it('ElectronTokenStore satisfies TokenStore with no readToken() member (compile-level, asserted by tsc)', () => {
      // Assigning to the TokenStore-typed variable is itself the compile-level
      // proof that ElectronTokenStore satisfies the (now-widened) interface
      // with readToken? absent — tsc would fail this file if it did not.
      const store: TokenStore = new ElectronTokenStore()
      expect('readToken' in store).toBe(false)
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
