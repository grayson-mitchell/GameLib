/**
 * Unit tests for `SidecarSteamGridDbSecretStore` / `installSidecarSteamGridDbSecretStore()`
 * (Phase 34.6 Plan 02, `34.6-CONTEXT.md` amendment A-03, second and final half; REQ-34.6-06).
 *
 * Mirrors `humbleSecretStore.test.ts`'s mocking convention: `requestRustInvoke` (from
 * `../sidecarRpc`) is mocked with an in-memory per-channel program + call log, so each test can
 * script a resolve/reject outcome and assert on exactly what was sent. `../../steamgrid/secretStore`
 * is NOT mocked — the real registry (`setSteamGridDbSecretStore`/`getSteamGridDbSecretStore`) is
 * exercised so the install() test proves an actual registry swap, not a mocked one. `../keyringTokenStore`
 * is likewise NOT mocked — `SidecarKeyringSlotStore` is exercised for real against the mocked RPC
 * layer, exactly as `humbleSecretStore.test.ts` does.
 *
 * `../../config` (`GlobalConfig`) IS mocked with an in-memory settings object standing in for the
 * shared `AppSettings` shape (mirrors `steamgrid/__tests__/secretStore.test.ts`'s own convention,
 * substituted here for Humble's `configStore` electron-store mock) — never `requireActual`, since
 * a real `GlobalConfig` pulls in `graceful-fs`/`electron-store` and reaches the real app-support
 * dir (`tests-clobbering-real-steam-store`).
 *
 * `../../steamgrid/secureKey` IS mocked directly, with controllable `isEncryptedValue`/
 * `decryptApiKey` fakes — this sidesteps needing to also mock the `electron` package's
 * `safeStorage` (which `secureKey.ts` itself wraps) just to prove the migration's ciphertext
 * branch hands the DECRYPTED plaintext to the keyring, never the raw `sgdb:v1:` string.
 *
 * Three assertions below are specifically about THIS plan's own hazards (A-03), not generic
 * coverage — see the "A-03 hazard assertions" describe block: (1) `setApiKey` never writes
 * `GlobalConfig`, (2) a mismatched migration readback leaves the plaintext in place, (3) a
 * `sgdb:v1:`-prefixed migration source is decrypted before it ever reaches the keyring.
 */

// ── sidecarRpc mock — fake Rust responder, in-memory program + call log ─────
jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

// ── logger mock ──────────────────────────────────────────────────────────────
const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
jest.mock('../../logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logDebug: jest.fn(),
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

// ── backend/config mock — in-memory settings object standing in for GlobalConfig ────────────────
let backingSettings: { steamGridDbApiKey?: string } = {}
const mockGetSettings = jest.fn(() => backingSettings)
const mockSetSetting = jest.fn((key: string, value: unknown) => {
  backingSettings = { ...backingSettings, [key]: value }
})
const mockGlobalConfigGet = jest.fn(() => ({
  getSettings: mockGetSettings,
  setSetting: mockSetSetting
}))
jest.mock('../../config', () => ({
  GlobalConfig: { get: mockGlobalConfigGet }
}))

// ── steamgrid/secureKey mock — controllable ciphertext detection/decryption ─────────────────────
const mockIsEncryptedValue = jest.fn((s: string) => s.startsWith('sgdb:v1:'))
const mockDecryptApiKey = jest.fn((s: string) =>
  s.startsWith('sgdb:v1:') ? '' : s
)
jest.mock('../../steamgrid/secureKey', () => ({
  isEncryptedValue: (s: string) => mockIsEncryptedValue(s),
  decryptApiKey: (s: string) => mockDecryptApiKey(s)
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { requestRustInvoke } from '../sidecarRpc'
import { KEYRING_SLOT_STEAMGRID_API_KEY } from '../keyringTokenStore'
import {
  SidecarSteamGridDbSecretStore,
  installSidecarSteamGridDbSecretStore,
  migrateSteamGridDbApiKey,
  resetSidecarSteamGridDbSecretStoreCachesForTests
} from '../steamgridSecretStore'
import { getSteamGridDbSecretStore } from '../../steamgrid/secretStore'

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

const mockRequestRustInvoke = requestRustInvoke as jest.Mock

let program: Record<string, ProgrammedOutcome> = {}
let callLog: Array<{ channel: string; args: unknown[] }> = []

function programChannel(channel: string, outcome: ProgrammedOutcome): void {
  program[channel] = outcome
}

describe('SidecarSteamGridDbSecretStore', () => {
  beforeEach(() => {
    program = {}
    callLog = []
    backingSettings = {}
    // This project's Backend jest config sets `resetMocks: true` -- every jest.fn() (including
    // the ones backing the GlobalConfig/secureKey mocks below) has its implementation wiped
    // before each test, not just its call log. Every mock implementation used across more than
    // one test must therefore be re-established here.
    mockGetSettings.mockImplementation(() => backingSettings)
    mockSetSetting.mockImplementation((key: string, value: unknown) => {
      backingSettings = { ...backingSettings, [key]: value }
    })
    mockGlobalConfigGet.mockImplementation(() => ({
      getSettings: mockGetSettings,
      setSetting: mockSetSetting
    }))
    mockIsEncryptedValue.mockImplementation((s: string) =>
      s.startsWith('sgdb:v1:')
    )
    mockDecryptApiKey.mockImplementation((s: string) =>
      s.startsWith('sgdb:v1:') ? '' : s
    )
    // Must run before any test body issues a read -- see keyringTokenStore.ts's own doc comment
    // on SidecarKeyringSlotStore's process-lifetime cache and why a fresh
    // `new SidecarSteamGridDbSecretStore()` per test does NOT give a fresh cache (the underlying
    // SLOT_STORE is a module-level singleton).
    resetSidecarSteamGridDbSecretStoreCachesForTests()
    mockRequestRustInvoke.mockImplementation(
      (channel: string, args: unknown[]) => {
        callLog.push({ channel, args })
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

  // ── getApiKey() ──────────────────────────────────────────────────────────
  describe('getApiKey()', () => {
    it('returns the value stored in the steamgrid-api-key keyring slot', async () => {
      programChannel('keyring_get', { type: 'resolve', value: 'my-api-key' })
      const store = new SidecarSteamGridDbSecretStore()

      await expect(store.getApiKey()).resolves.toBe('my-api-key')
      expect(callLog).toStrictEqual([
        {
          channel: 'keyring_get',
          args: [KEYRING_SLOT_STEAMGRID_API_KEY]
        }
      ])
    })

    it('resolves to undefined, never rejects, when the keyring_get invoke rejects', async () => {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })
      const store = new SidecarSteamGridDbSecretStore()

      await expect(store.getApiKey()).resolves.toBeUndefined()
    })

    it('resolves to undefined when the slot has no entry yet (healthy first-run case)', async () => {
      programChannel('keyring_get', { type: 'resolve', value: null })
      const store = new SidecarSteamGridDbSecretStore()

      await expect(store.getApiKey()).resolves.toBeUndefined()
    })
  })

  // ── setApiKey() ──────────────────────────────────────────────────────────
  describe('setApiKey()', () => {
    it("sends keyring_set with the value and the steamgrid-api-key slot", async () => {
      programChannel('keyring_set', { type: 'resolve', value: true })
      const store = new SidecarSteamGridDbSecretStore()

      await store.setApiKey('a-real-key')

      expect(callLog).toStrictEqual([
        {
          channel: 'keyring_set',
          args: ['a-real-key', KEYRING_SLOT_STEAMGRID_API_KEY]
        }
      ])
    })
  })

  // ── clearApiKey() ────────────────────────────────────────────────────────
  describe('clearApiKey()', () => {
    it('resolves even when the underlying keyring_delete rejects', async () => {
      programChannel('keyring_delete', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })
      const store = new SidecarSteamGridDbSecretStore()

      await expect(store.clearApiKey()).resolves.toBeUndefined()
    })
  })

  // ── installSidecarSteamGridDbSecretStore() ──────────────────────────────
  describe('installSidecarSteamGridDbSecretStore()', () => {
    it('installs a SidecarSteamGridDbSecretStore instance into the registry and logs exactly one keyring receipt line', () => {
      installSidecarSteamGridDbSecretStore()

      expect(getSteamGridDbSecretStore()).toBeInstanceOf(
        SidecarSteamGridDbSecretStore
      )
      const receiptCalls = mockLogInfo.mock.calls.filter((call) =>
        String(call[0]).includes(
          '[bootstrap] steamgrid secret store: keyring'
        )
      )
      expect(receiptCalls).toHaveLength(1)
    })

    it('dispatches the migration fire-and-forget -- install() itself returns void, never a Promise the caller might await', () => {
      backingSettings.steamGridDbApiKey = 'plaintext-key'
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', {
        type: 'resolve',
        value: 'plaintext-key'
      })

      // installSidecarSteamGridDbSecretStore()'s own return type is `void`, not `Promise<void>` —
      // bootstrap.ts calls it as a plain synchronous statement immediately followed by the
      // `'[bootstrap] secret stores: keyring'` logInfo line, never `await`ed. If the migration
      // were awaited internally, this call would return a Promise instead.
      const result = installSidecarSteamGridDbSecretStore()

      expect(result).toBeUndefined()
      expect(getSteamGridDbSecretStore()).toBeInstanceOf(
        SidecarSteamGridDbSecretStore
      )
    })

    it('never throws even when installation is called repeatedly (safe on every bootstrap.ts re-run)', () => {
      expect(() => installSidecarSteamGridDbSecretStore()).not.toThrow()
      expect(() => installSidecarSteamGridDbSecretStore()).not.toThrow()
      expect(getSteamGridDbSecretStore()).toBeInstanceOf(
        SidecarSteamGridDbSecretStore
      )
    })
  })

  // ── migrateSteamGridDbApiKey() — one-time plaintext-to-keyring migration ────────────────────
  describe('migrateSteamGridDbApiKey() (one-time plaintext-to-keyring migration)', () => {
    it('given a working keyring, writes the plaintext to the keyring, reads it back, THEN clears the GlobalConfig setting', async () => {
      backingSettings.steamGridDbApiKey = 'plaintext-api-key'
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', {
        type: 'resolve',
        value: 'plaintext-api-key'
      })

      await migrateSteamGridDbApiKey()

      expect(callLog).toEqual([
        {
          channel: 'keyring_set',
          args: ['plaintext-api-key', KEYRING_SLOT_STEAMGRID_API_KEY]
        },
        { channel: 'keyring_get', args: [KEYRING_SLOT_STEAMGRID_API_KEY] }
      ])
      expect(backingSettings.steamGridDbApiKey).toBe('')
    })

    it('a rejecting keyring write LEAVES the plaintext in place, and logs exactly one warning', async () => {
      backingSettings.steamGridDbApiKey = 'plaintext-api-key'
      programChannel('keyring_set', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })

      await migrateSteamGridDbApiKey()

      expect(backingSettings.steamGridDbApiKey).toBe('plaintext-api-key')
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
      // keyring_get must never have been attempted -- a failed write skips the readback entirely.
      expect(callLog.some((c) => c.channel === 'keyring_get')).toBe(false)
    })

    it('a rejecting keyring readback LEAVES the plaintext in place and logs exactly one warning', async () => {
      backingSettings.steamGridDbApiKey = 'plaintext-api-key'
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })

      await migrateSteamGridDbApiKey()

      expect(backingSettings.steamGridDbApiKey).toBe('plaintext-api-key')
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
    })

    it('with the GlobalConfig setting already absent, performs NO keyring write', async () => {
      // backingSettings starts empty (beforeEach) -- no key was ever configured, or a prior
      // migration already ran.
      await migrateSteamGridDbApiKey()

      expect(callLog).toEqual([])
      expect(mockLogWarning).not.toHaveBeenCalled()
    })

    it('never logs the plaintext API key value on any migration failure path', async () => {
      const SECRET = 'super-secret-migration-value-xyz'
      backingSettings.steamGridDbApiKey = SECRET
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', {
        type: 'resolve',
        value: 'mismatched-value'
      })

      await migrateSteamGridDbApiKey()

      for (const call of mockLogWarning.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SECRET)
      }
    })
  })

  // ── A-03 hazard assertions (this plan's own correctness requirements, not generic coverage) ──
  describe('A-03 hazard assertions', () => {
    it('[never-writes-config] setApiKey never writes GlobalConfig\'s steamGridDbApiKey setting', async () => {
      programChannel('keyring_set', { type: 'resolve', value: true })
      const store = new SidecarSteamGridDbSecretStore()

      await store.setApiKey('abc')

      expect(backingSettings.steamGridDbApiKey).toBeUndefined()
      expect(mockSetSetting).not.toHaveBeenCalled()
    })

    it('[read-back-mismatch] a MISMATCHED readback LEAVES the plaintext in place -- never rounded up to success', async () => {
      backingSettings.steamGridDbApiKey = 'plaintext-api-key'
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', {
        type: 'resolve',
        value: 'a-completely-different-value'
      })

      await migrateSteamGridDbApiKey()

      expect(backingSettings.steamGridDbApiKey).toBe('plaintext-api-key')
      expect(mockSetSetting).not.toHaveBeenCalled()
    })

    it('[ciphertext] a pre-existing sgdb:v1: value is decrypted BEFORE being handed to the keyring -- the keyring never receives ciphertext', async () => {
      backingSettings.steamGridDbApiKey = 'sgdb:v1:some-base64-ciphertext'
      mockDecryptApiKey.mockReturnValueOnce('the-real-decrypted-plaintext')
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', {
        type: 'resolve',
        value: 'the-real-decrypted-plaintext'
      })

      await migrateSteamGridDbApiKey()

      expect(callLog).toEqual([
        {
          channel: 'keyring_set',
          args: [
            'the-real-decrypted-plaintext',
            KEYRING_SLOT_STEAMGRID_API_KEY
          ]
        },
        { channel: 'keyring_get', args: [KEYRING_SLOT_STEAMGRID_API_KEY] }
      ])
      // The raw ciphertext string must never appear as an argument to any RPC call.
      for (const call of callLog) {
        expect(call.args).not.toContain('sgdb:v1:some-base64-ciphertext')
      }
      expect(backingSettings.steamGridDbApiKey).toBe('')
    })

    it('[ciphertext, undecryptable] a sgdb:v1: value that decrypts to empty (sidecar cannot decrypt it) LEAVES it in place and logs exactly one warning', async () => {
      backingSettings.steamGridDbApiKey = 'sgdb:v1:some-base64-ciphertext'
      mockDecryptApiKey.mockReturnValueOnce('')

      await migrateSteamGridDbApiKey()

      expect(callLog).toEqual([])
      expect(backingSettings.steamGridDbApiKey).toBe(
        'sgdb:v1:some-base64-ciphertext'
      )
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
    })
  })
})
