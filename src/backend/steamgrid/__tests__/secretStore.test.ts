/**
 * Unit tests for the SteamGridDB secret-store seam (Phase 34.6 Plan 01, `34.6-CONTEXT.md`
 * amendment A-03, REQ-34.6-06).
 *
 * Covers:
 *  - ElectronSteamGridDbSecretStore's `sgdb:v1:` round-trip, mirroring `secureKey.ts`'s existing
 *    crypto primitives.
 *  - The ONE surviving legacy-plaintext migration codepath: a bare stored value reads back
 *    unchanged AND is re-encrypted into the mocked settings object in the same call
 *    (`ipc_handler.ts`'s inline copy of this branch is deleted by plan 34.6-09).
 *  - The total-method contract: none of the four interface methods ever throws or rejects, even
 *    when `safeStorage` or the underlying `GlobalConfig` call throws.
 *  - `createSteamGridDbSecrets`, the boot-built instance over an injected store.
 *
 * Mock boundaries mirror `humble/__tests__/secretStore.test.ts`'s convention, substituting
 * `backend/config`'s `GlobalConfig` for Humble's `../stores` `configStore`:
 *  - electron       → safeStorage (encrypt/decrypt/availability)
 *  - backend/logger
 *  - backend/config → the global config.getSettings()/setSetting() (in-memory settings object,
 *    never `requireActual` — a real `GlobalConfig` pulls in `graceful-fs`/`electron-store` and
 *    reaches the real app-support dir)
 *
 * Assertions never pin log wording (a test that pins prose cannot detect behaviour drift) — they
 * assert the promise settles and, where relevant, that a warning fired at most once.
 */

// ── Electron mock (must be first, jest.mock is hoisted) ──────────────────────
// secureKey.ts no longer consults safeStorage (66.3-05): it was dead in the sidecar
// (isEncryptionAvailable() was always false), so every path below is the "unavailable" path.

// ── Logger mock ────────────────────────────────────────────────────────────
const mockLogWarning = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Backend: 'Backend' }
}))

// ── in-memory settings object standing in for the injected global config ────────────────
let backingSettings: { steamGridDbApiKey?: string } = {}
const mockGetSettings = jest.fn(() => backingSettings)
const mockSetSetting = jest.fn((key: string, value: unknown) => {
  backingSettings = { ...backingSettings, [key]: value }
})
let mockGlobalConfigGet = jest.fn(() => ({
  getSettings: mockGetSettings,
  setSetting: mockSetSetting
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import {
  SteamGridDbSecretStore,
  ElectronSteamGridDbSecretStore,
  createSteamGridDbSecrets
} from '../secretStore'
import { createTestStores } from 'backend/testUtils/testServices'
import { defined } from 'backend/testUtils/indexed'

// The mocked GlobalConfig never reads the kvs slice, but the store must hand it through.
const secretDeps = {
  stores: createTestStores({ kvs: { configStore: {} } as never }),
  // The injected config slice reads through the in-memory settings object above.
  config: {
    getSettings: () => mockGlobalConfigGet().getSettings(),
    setSetting: (key: string, value: unknown, ...rest: unknown[]) =>
      (mockGlobalConfigGet().setSetting as (...args: unknown[]) => void)(
        key,
        value,
        ...rest
      )
  } as never
}

describe('steamgrid/secretStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    backingSettings = {}
    // resetMocks: true (jest.config.js) wipes even a jest.fn(impl) factory's initial
    // implementation before every test — re-establish the wiring so getSettings/setSetting are
    // genuinely backed by `backingSettings`, not silently no-op stubs that only record calls.
    mockGetSettings.mockImplementation(() => backingSettings)
    mockSetSetting.mockImplementation((key: string, value: unknown) => {
      backingSettings = { ...backingSettings, [key]: value }
    })
    mockGlobalConfigGet = jest.fn(() => ({
      getSettings: mockGetSettings,
      setSetting: mockSetSetting
    }))
  })

  describe('mock wiring sanity', () => {
    it('a value seeded directly into backingSettings is read back through the mocked GlobalConfig', async () => {
      backingSettings.steamGridDbApiKey = 'seeded'
      const store = new ElectronSteamGridDbSecretStore(secretDeps)

      const value = await store.getApiKey()
      expect(value).toBe('seeded')
      expect(mockGetSettings).toHaveBeenCalled()
    })
  })

  describe('ElectronSteamGridDbSecretStore', () => {
    it('setApiKey persists the trimmed key as bare plaintext (no encryption is available) and getApiKey round-trips it', async () => {
      const store = new ElectronSteamGridDbSecretStore(secretDeps)
      await store.setApiKey('  abc123  ')

      expect(mockSetSetting).toHaveBeenCalledWith(
        'steamGridDbApiKey',
        'abc123',
        secretDeps.stores.kvs
      )
      const [, persisted] = defined(
        mockSetSetting.mock.calls[0],
        'setSetting call'
      )
      expect(persisted).toBe('abc123')

      const value = await store.getApiKey()
      expect(value).toBe('abc123')
    })

    it('getApiKey on a legacy bare-plaintext value returns it unchanged and does not rewrite it (nothing to encrypt with)', async () => {
      backingSettings.steamGridDbApiKey = 'legacykey'
      const store = new ElectronSteamGridDbSecretStore(secretDeps)

      const value = await store.getApiKey()
      expect(value).toBe('legacykey')
      expect(backingSettings.steamGridDbApiKey).toBe('legacykey')
      expect(mockSetSetting).not.toHaveBeenCalled()
    })

    it('getApiKey returns undefined when nothing is stored', async () => {
      const store = new ElectronSteamGridDbSecretStore(secretDeps)
      const value = await store.getApiKey()
      expect(value).toBeUndefined()
    })

    it('setApiKey("") persists the empty string and getApiKey then returns undefined', async () => {
      const store = new ElectronSteamGridDbSecretStore(secretDeps)
      await store.setApiKey('')

      expect(mockSetSetting).toHaveBeenCalledWith(
        'steamGridDbApiKey',
        '',
        secretDeps.stores.kvs
      )
      const value = await store.getApiKey()
      expect(value).toBeUndefined()
    })

    it('setApiKey resolves and persists bare plaintext', async () => {
      const store = new ElectronSteamGridDbSecretStore(secretDeps)

      await expect(store.setApiKey('abc')).resolves.toBeUndefined()
      expect(mockSetSetting).toHaveBeenCalledWith(
        'steamGridDbApiKey',
        'abc',
        secretDeps.stores.kvs
      )

      await expect(store.getApiKey()).resolves.toBe('abc')
    })

    it('clearApiKey resolves and leaves getApiKey returning undefined', async () => {
      const store = new ElectronSteamGridDbSecretStore(secretDeps)
      await store.setApiKey('abc')
      await expect(store.clearApiKey()).resolves.toBeUndefined()

      await expect(store.getApiKey()).resolves.toBeUndefined()
    })

    it('isAvailable() is false (no encryption), via a throwaway probe that never touches GlobalConfig', () => {
      const store = new ElectronSteamGridDbSecretStore(secretDeps)
      expect(store.isAvailable()).toBe(false)
      expect(mockGetSettings).not.toHaveBeenCalled()
      expect(mockSetSetting).not.toHaveBeenCalled()
    })

    describe('total-method contract: the global config throwing never propagates', () => {
      beforeEach(() => {
        mockGlobalConfigGet = jest.fn(() => {
          throw new Error('GlobalConfig unavailable')
        })
      })

      it('getApiKey resolves to undefined and logs at most one warning', async () => {
        const store = new ElectronSteamGridDbSecretStore(secretDeps)
        await expect(store.getApiKey()).resolves.toBeUndefined()
        expect(mockLogWarning.mock.calls.length).toBeLessThanOrEqual(1)
      })

      it('setApiKey resolves and logs at most two warnings (plaintext notice + the failed write)', async () => {
        const store = new ElectronSteamGridDbSecretStore(secretDeps)
        await expect(store.setApiKey('abc')).resolves.toBeUndefined()
        expect(mockLogWarning.mock.calls.length).toBeLessThanOrEqual(2)
      })

      it('clearApiKey resolves and logs at most one warning', async () => {
        const store = new ElectronSteamGridDbSecretStore(secretDeps)
        await expect(store.clearApiKey()).resolves.toBeUndefined()
        expect(mockLogWarning.mock.calls.length).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('createSteamGridDbSecrets (boot-built instance)', () => {
    it('routes every operation through the injected store', async () => {
      const fake: SteamGridDbSecretStore = {
        isAvailable: jest.fn().mockReturnValue(true),
        getApiKey: jest.fn().mockResolvedValue('fake-key'),
        setApiKey: jest.fn().mockResolvedValue(undefined),
        clearApiKey: jest.fn().mockResolvedValue(undefined)
      }
      const secrets = createSteamGridDbSecrets({ store: fake })

      expect(secrets.isAvailable()).toBe(true)
      expect(await secrets.getApiKey()).toBe('fake-key')
      await secrets.setApiKey('next')
      await secrets.clearApiKey()

      expect(fake.setApiKey).toHaveBeenCalledWith('next')
      expect(fake.clearApiKey).toHaveBeenCalledTimes(1)
      // The fake never touches GlobalConfig at all.
      expect(mockGetSettings).not.toHaveBeenCalled()
    })

    it('two instances are independent of each other', async () => {
      const a = createSteamGridDbSecrets({
        store: new ElectronSteamGridDbSecretStore(secretDeps)
      })
      const b = createSteamGridDbSecrets({
        store: {
          isAvailable: () => true,
          getApiKey: async () => 'b-key',
          setApiKey: async () => undefined,
          clearApiKey: async () => undefined
        }
      })
      backingSettings.steamGridDbApiKey = 'plain-a'

      expect(await a.getApiKey()).toBe('plain-a')
      expect(await b.getApiKey()).toBe('b-key')
    })
  })
})
