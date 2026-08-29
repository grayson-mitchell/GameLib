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
 *  - The `setSteamGridDbSecretStore`/`getSteamGridDbSecretStore` registry swap point.
 *
 * Mock boundaries mirror `humble/__tests__/secretStore.test.ts`'s convention, substituting
 * `backend/config`'s `GlobalConfig` for Humble's `../electronStores` `configStore`:
 *  - electron       → safeStorage (encrypt/decrypt/availability)
 *  - backend/logger
 *  - backend/config → GlobalConfig.get().getSettings()/setSetting() (in-memory settings object,
 *    never `requireActual` — a real `GlobalConfig` pulls in `graceful-fs`/`electron-store` and
 *    reaches the real app-support dir)
 *
 * Assertions never pin log wording (a test that pins prose cannot detect behaviour drift) — they
 * assert the promise settles and, where relevant, that a warning fired at most once.
 */

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
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Backend: 'Backend' }
}))

// ── backend/config mock — in-memory settings object standing in for GlobalConfig ────────────────
let backingSettings: { steamGridDbApiKey?: string } = {}
const mockGetSettings = jest.fn(() => backingSettings)
const mockSetSetting = jest.fn((key: string, value: unknown) => {
  backingSettings = { ...backingSettings, [key]: value }
})
let mockGlobalConfigGet = jest.fn(() => ({
  getSettings: mockGetSettings,
  setSetting: mockSetSetting
}))
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: () => mockGlobalConfigGet()
  }
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import {
  SteamGridDbSecretStore,
  ElectronSteamGridDbSecretStore,
  setSteamGridDbSecretStore,
  getSteamGridDbSecretStore
} from '../secretStore'

describe('steamgrid/secretStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    backingSettings = {}
    mockIsEncryptionAvailable.mockReturnValue(true)
    mockEncryptString.mockImplementation((s: string) => Buffer.from(s))
    mockDecryptString.mockImplementation((b: Buffer) => b.toString())
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

    // Reset the module-level registry to a fresh ElectronSteamGridDbSecretStore between tests so
    // registry-swap tests don't leak into unrelated tests.
    setSteamGridDbSecretStore(new ElectronSteamGridDbSecretStore())
  })

  describe('mock wiring sanity', () => {
    it('a value seeded directly into backingSettings is read back through the mocked GlobalConfig', async () => {
      backingSettings.steamGridDbApiKey =
        'sgdb:v1:' + Buffer.from('seeded').toString('base64')
      const store = new ElectronSteamGridDbSecretStore()

      const value = await store.getApiKey()
      expect(value).toBe('seeded')
      expect(mockGetSettings).toHaveBeenCalled()
    })
  })

  describe('ElectronSteamGridDbSecretStore', () => {
    it('setApiKey persists a sgdb:v1:-prefixed value, not raw plaintext, and getApiKey round-trips it', async () => {
      const store = new ElectronSteamGridDbSecretStore()
      await store.setApiKey('  abc123  ')

      expect(mockSetSetting).toHaveBeenCalledWith(
        'steamGridDbApiKey',
        expect.stringMatching(/^sgdb:v1:/)
      )
      const [, persisted] = mockSetSetting.mock.calls[0]
      expect(persisted).not.toBe('abc123')

      const value = await store.getApiKey()
      expect(value).toBe('abc123')
    })

    it('getApiKey on a legacy bare-plaintext value returns it unchanged AND re-encrypts it in the same call', async () => {
      backingSettings.steamGridDbApiKey = 'legacykey'
      const store = new ElectronSteamGridDbSecretStore()

      const value = await store.getApiKey()
      expect(value).toBe('legacykey')
      expect(backingSettings.steamGridDbApiKey).toMatch(/^sgdb:v1:/)
      expect(mockSetSetting).toHaveBeenCalledWith(
        'steamGridDbApiKey',
        expect.stringMatching(/^sgdb:v1:/)
      )
    })

    it('getApiKey returns undefined when nothing is stored', async () => {
      const store = new ElectronSteamGridDbSecretStore()
      const value = await store.getApiKey()
      expect(value).toBeUndefined()
    })

    it('setApiKey("") persists the empty string and getApiKey then returns undefined', async () => {
      const store = new ElectronSteamGridDbSecretStore()
      await store.setApiKey('')

      expect(mockSetSetting).toHaveBeenCalledWith('steamGridDbApiKey', '')
      const value = await store.getApiKey()
      expect(value).toBeUndefined()
    })

    it('when safeStorage.isEncryptionAvailable throws, setApiKey still resolves and persists bare plaintext', async () => {
      mockIsEncryptionAvailable.mockImplementation(() => {
        throw new Error('Keychain unavailable')
      })
      const store = new ElectronSteamGridDbSecretStore()

      await expect(store.setApiKey('abc')).resolves.toBeUndefined()
      expect(mockSetSetting).toHaveBeenCalledWith('steamGridDbApiKey', 'abc')

      await expect(store.getApiKey()).resolves.toBe('abc')
    })

    it('clearApiKey resolves and leaves getApiKey returning undefined', async () => {
      const store = new ElectronSteamGridDbSecretStore()
      await store.setApiKey('abc')
      await expect(store.clearApiKey()).resolves.toBeUndefined()

      await expect(store.getApiKey()).resolves.toBeUndefined()
    })

    it('isAvailable() reflects safeStorage availability via a throwaway probe, never touching GlobalConfig', () => {
      const store = new ElectronSteamGridDbSecretStore()
      expect(store.isAvailable()).toBe(true)

      mockIsEncryptionAvailable.mockReturnValue(false)
      expect(store.isAvailable()).toBe(false)
      expect(mockGetSettings).not.toHaveBeenCalled()
      expect(mockSetSetting).not.toHaveBeenCalled()
    })

    it('isAvailable() returns false (never throws) when the encrypt probe itself throws', () => {
      mockEncryptString.mockImplementation(() => {
        throw new Error('encrypt failed')
      })
      const store = new ElectronSteamGridDbSecretStore()

      expect(() => store.isAvailable()).not.toThrow()
      expect(store.isAvailable()).toBe(false)
    })

    describe('total-method contract: GlobalConfig.get() throwing never propagates', () => {
      beforeEach(() => {
        mockGlobalConfigGet = jest.fn(() => {
          throw new Error('GlobalConfig unavailable')
        })
      })

      it('getApiKey resolves to undefined and logs at most one warning', async () => {
        const store = new ElectronSteamGridDbSecretStore()
        await expect(store.getApiKey()).resolves.toBeUndefined()
        expect(mockLogWarning.mock.calls.length).toBeLessThanOrEqual(1)
      })

      it('setApiKey resolves and logs at most one warning', async () => {
        const store = new ElectronSteamGridDbSecretStore()
        await expect(store.setApiKey('abc')).resolves.toBeUndefined()
        expect(mockLogWarning.mock.calls.length).toBeLessThanOrEqual(1)
      })

      it('clearApiKey resolves and logs at most one warning', async () => {
        const store = new ElectronSteamGridDbSecretStore()
        await expect(store.clearApiKey()).resolves.toBeUndefined()
        expect(mockLogWarning.mock.calls.length).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('registry (setSteamGridDbSecretStore/getSteamGridDbSecretStore)', () => {
    it('getSteamGridDbSecretStore() returns an ElectronSteamGridDbSecretStore by default', () => {
      expect(getSteamGridDbSecretStore()).toBeInstanceOf(
        ElectronSteamGridDbSecretStore
      )
    })

    it('setSteamGridDbSecretStore(fake) swaps the active store', async () => {
      const fake: SteamGridDbSecretStore = {
        isAvailable: jest.fn().mockReturnValue(true),
        getApiKey: jest.fn().mockResolvedValue('fake-key'),
        setApiKey: jest.fn().mockResolvedValue(undefined),
        clearApiKey: jest.fn().mockResolvedValue(undefined)
      }

      setSteamGridDbSecretStore(fake)
      expect(getSteamGridDbSecretStore()).toBe(fake)

      const value = await getSteamGridDbSecretStore().getApiKey()
      expect(value).toBe('fake-key')
      expect(fake.getApiKey).toHaveBeenCalled()

      // The fake never touches GlobalConfig at all.
      expect(mockGetSettings).not.toHaveBeenCalled()
    })
  })
})
