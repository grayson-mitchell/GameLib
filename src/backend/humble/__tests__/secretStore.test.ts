/**
 * Unit tests for the Humble secret-store seam (Phase 34.4.1 Plan 12, gap-cycle
 * closure for F-1/S-10, REQ-34.4.1-02/REQ-34.4.1-GAP-02).
 *
 * Covers:
 *  - ElectronHumbleSecretStore behavioral parity with the pre-seam
 *    encryptCookie/decryptCookie/encryptionAvailable free functions that used
 *    to live in `user.ts` — byte-identical Electron behavior is this plan's
 *    hard constraint (this plan is a pure refactor, no behavior change).
 *  - The legacy plaintext read/write fallback (no-prefix on read, plaintext
 *    write when encryption is unavailable) — this is DELIBERATE, preserved
 *    shipped behavior, not a bug.
 *  - `sessionCookie` and `csrfToken` are independently addressable; writing
 *    one never disturbs the other.
 *  - The setHumbleSecretStore/getHumbleSecretStore registry swap point.
 *  - Structural proof: this module contains no `backend/sidecar` import and
 *    no `encryptionDegraded` reference (that flag stays in `user.ts`).
 *
 * Mock boundaries mirror `storeManagers/steam/__tests__/tokenStore.test.ts`'s
 * convention:
 *  - electron          → safeStorage (encrypt/decrypt/availability)
 *  - backend/logger
 *  - ../electronStores → configStore (in-memory map, not electron-store)
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
  }
}))

// ── Logger mock ────────────────────────────────────────────────────────────
const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logError: jest.fn(),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Backend: 'Backend' }
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
  })
}
jest.mock('../electronStores', () => ({
  configStore: mockConfigStore
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import {
  HumbleSecretStore,
  ElectronHumbleSecretStore,
  setHumbleSecretStore,
  getHumbleSecretStore
} from '../secretStore'

describe('secretStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    backingStore = {}
    mockIsEncryptionAvailable.mockReturnValue(true)
    mockEncryptString.mockImplementation((s: string) => Buffer.from(s))
    mockDecryptString.mockImplementation((b: Buffer) => b.toString())
    // resetMocks: true (jest.config.js) wipes even a jest.fn(impl) factory's
    // initial implementation before every test — re-establish the in-memory
    // configStore backing so get_nodefault/set/delete are genuinely wired to
    // `backingStore`, not silently no-op stubs that only record calls.
    mockConfigStore.get_nodefault.mockImplementation(
      (key: string) => backingStore[key]
    )
    mockConfigStore.set.mockImplementation((key: string, value: unknown) => {
      backingStore[key] = value
    })
    mockConfigStore.delete.mockImplementation((key: string) => {
      delete backingStore[key]
    })
    // Reset the module-level registry to a fresh ElectronHumbleSecretStore
    // between tests so registry-swap tests don't leak into unrelated tests.
    setHumbleSecretStore(new ElectronHumbleSecretStore())
  })

  describe('ElectronHumbleSecretStore', () => {
    it('setSecret writes a humble:v1:-prefixed ciphertext under sessionCookie, not raw plaintext', async () => {
      const store = new ElectronHumbleSecretStore()
      await store.setSecret('sessionCookie', 'abc')

      expect(mockConfigStore.set).toHaveBeenCalledWith(
        'sessionCookie',
        expect.stringMatching(/^humble:v1:/)
      )
      const [, storedValue] = mockConfigStore.set.mock.calls[0]
      expect(storedValue).not.toBe('abc')
    })

    it('getSecret round-trips a setSecret value back to the original plaintext', async () => {
      const store = new ElectronHumbleSecretStore()
      await store.setSecret('sessionCookie', 'abc')

      const value = await store.getSecret('sessionCookie')
      expect(value).toBe('abc')
    })

    it('getSecret returns a legacy (no humble:v1: prefix) stored value verbatim', async () => {
      backingStore['sessionCookie'] = 'legacy-plaintext-cookie'
      const store = new ElectronHumbleSecretStore()

      const value = await store.getSecret('sessionCookie')
      expect(value).toBe('legacy-plaintext-cookie')
      expect(mockDecryptString).not.toHaveBeenCalled()
    })

    it('getSecret returns "" when the store holds nothing', async () => {
      const store = new ElectronHumbleSecretStore()
      const value = await store.getSecret('sessionCookie')
      expect(value).toBe('')
    })

    it('getSecret returns "" when the stored value is not a string', async () => {
      backingStore['sessionCookie'] = 42
      const store = new ElectronHumbleSecretStore()
      const value = await store.getSecret('sessionCookie')
      expect(value).toBe('')
    })

    it('getSecret returns "" when decryptString throws (and logs a warning, never throws itself)', async () => {
      backingStore['sessionCookie'] =
        'humble:v1:' + Buffer.from('x').toString('base64')
      mockDecryptString.mockImplementationOnce(() => {
        throw new Error('corrupt ciphertext')
      })
      const store = new ElectronHumbleSecretStore()

      const value = await store.getSecret('sessionCookie')
      expect(value).toBe('')
      expect(mockLogWarning).toHaveBeenCalled()
    })

    it('a prefixed value read while encryption is unavailable returns "" without throwing', async () => {
      backingStore['sessionCookie'] =
        'humble:v1:' + Buffer.from('x').toString('base64')
      mockIsEncryptionAvailable.mockReturnValue(false)
      const store = new ElectronHumbleSecretStore()

      const value = await store.getSecret('sessionCookie')
      expect(value).toBe('')
      expect(mockDecryptString).not.toHaveBeenCalled()
    })

    it('setSecret stores plaintext and logs the exact warning when encryption is unavailable', async () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      const store = new ElectronHumbleSecretStore()

      await store.setSecret('sessionCookie', 'abc')

      expect(mockConfigStore.set).toHaveBeenCalledWith('sessionCookie', 'abc')
      expect(mockLogWarning).toHaveBeenCalledWith(
        'safeStorage unavailable — storing Humble session in plaintext (degraded encryption)',
        'Backend'
      )
    })

    it('isAvailable() returns false when safeStorage.isEncryptionAvailable() throws (never propagates)', async () => {
      mockIsEncryptionAvailable.mockImplementation(() => {
        throw new Error('Keychain unavailable')
      })
      const store = new ElectronHumbleSecretStore()

      await expect(store.isAvailable()).resolves.toBe(false)
    })

    it('setSecret("csrfToken", ...) leaves the stored sessionCookie untouched', async () => {
      const store = new ElectronHumbleSecretStore()
      await store.setSecret('sessionCookie', 'session-value')
      await store.setSecret('csrfToken', 'csrf-value')

      const sessionValue = await store.getSecret('sessionCookie')
      expect(sessionValue).toBe('session-value')
    })

    it('sessionCookie and csrfToken are addressable independently', async () => {
      const store = new ElectronHumbleSecretStore()
      await store.setSecret('sessionCookie', 'session-value')
      await store.setSecret('csrfToken', 'csrf-value')

      expect(await store.getSecret('sessionCookie')).toBe('session-value')
      expect(await store.getSecret('csrfToken')).toBe('csrf-value')
    })

    it('clearSecrets removes both secret keys and resolves without throwing', async () => {
      const store = new ElectronHumbleSecretStore()
      await store.setSecret('sessionCookie', 'session-value')
      await store.setSecret('csrfToken', 'csrf-value')

      await expect(store.clearSecrets()).resolves.toBeUndefined()

      expect(await store.getSecret('sessionCookie')).toBe('')
      expect(await store.getSecret('csrfToken')).toBe('')
    })
  })

  describe('registry (setHumbleSecretStore/getHumbleSecretStore)', () => {
    it('getHumbleSecretStore() returns an ElectronHumbleSecretStore by default', () => {
      expect(getHumbleSecretStore()).toBeInstanceOf(ElectronHumbleSecretStore)
    })

    it('setHumbleSecretStore(fake) swaps the active store', async () => {
      const fake: HumbleSecretStore = {
        isAvailable: jest.fn().mockResolvedValue(true),
        getSecret: jest.fn().mockResolvedValue('fake-secret'),
        setSecret: jest.fn().mockResolvedValue(undefined),
        clearSecrets: jest.fn().mockResolvedValue(undefined)
      }

      setHumbleSecretStore(fake)
      expect(getHumbleSecretStore()).toBe(fake)

      const value = await getHumbleSecretStore().getSecret('sessionCookie')
      expect(value).toBe('fake-secret')
      expect(fake.getSecret).toHaveBeenCalledWith('sessionCookie')

      // The fake never touches configStore at all.
      expect(mockConfigStore.get_nodefault).not.toHaveBeenCalled()
    })
  })

  describe('structural guards', () => {
    it('source contains no reference to backend/sidecar', () => {
      const src = readFileSync(join(__dirname, '../secretStore.ts'), 'utf-8')
      expect(src).not.toMatch(/backend\/sidecar/)
    })

    it('source contains no reference to encryptionDegraded — the flag stays in user.ts', () => {
      const src = readFileSync(join(__dirname, '../secretStore.ts'), 'utf-8')
      expect(src).not.toMatch(/encryptionDegraded/)
    })
  })
})
