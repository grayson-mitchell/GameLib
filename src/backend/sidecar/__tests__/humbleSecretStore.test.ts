/**
 * Unit tests for `SidecarHumbleSecretStore` / `installSidecarHumbleSecretStore()` (Phase 34.4.1
 * gap-cycle plan 13 — closing F-1 BLOCKING / REQ-34.4.1-02 / REQ-34.4.1-GAP-02).
 *
 * Mirrors `keyringTokenStore.test.ts`'s mocking convention: `requestRustInvoke` (from
 * `../sidecarRpc`) is mocked with an in-memory per-channel program + call log, so each test can
 * script a resolve/reject outcome and assert on exactly what was sent. `../humble/secretStore`
 * is NOT mocked — the real registry (`setHumbleSecretStore`/`getHumbleSecretStore`) is exercised
 * so the install() test proves an actual registry swap, not a mocked one.
 *
 * Task 2 adds the one-time plaintext-migration tests below. `../../humble/electronStores` IS
 * mocked with an in-memory backing object (never `requireActual` — `tests-clobbering-real-steam-store`
 * documents that an unmocked electron-store reaches the REAL app-support dir and `afterAll` is
 * not a safety net).
 *
 * 34.4.1 gap cycle 2 plan 26 (F-9's read-count half, user-approved scope widening) added a
 * process-lifetime read cache to `SidecarKeyringSlotStore`. `SidecarHumbleSecretStore` delegates
 * to `SLOT_STORES`, a MODULE-LEVEL singleton created once when `../humbleSecretStore` is first
 * imported — every `new SidecarHumbleSecretStore()` in every test below shares the SAME two
 * underlying slot-store instances (and this project's Jest config has no `resetModules`, so that
 * singleton persists for this whole test FILE's run, not just one `it()`). Without an explicit
 * reset, an earlier test's successfully-cached read would silently shadow a later test's own
 * scripted `requestRustInvoke` outcome. `resetSidecarHumbleSecretStoreCachesForTests()` (imported
 * above) is the isolation seam for exactly this — called from `beforeEach` below.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

// ── sidecarRpc mock — fake Rust responder, in-memory program + call log ─────
jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

// ── logger mock ──────────────────────────────────────────────────────────────
const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
jest.mock('../../logger', () => ({
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

// ── electronStores mock — in-memory map standing in for configStore (Task 2 migration) ─────────
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
jest.mock('../../humble/electronStores', () => ({
  configStore: mockConfigStore
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { requestRustInvoke } from '../sidecarRpc'
import {
  KEYRING_SLOT_STEAM_REFRESH_TOKEN,
  KEYRING_SLOT_HUMBLE_SESSION,
  KEYRING_SLOT_HUMBLE_CSRF
} from '../keyringTokenStore'
import {
  SidecarHumbleSecretStore,
  installSidecarHumbleSecretStore,
  migrateOneSecret,
  migrateHumbleSecrets,
  resetSidecarHumbleSecretStoreCachesForTests
} from '../humbleSecretStore'
import { getHumbleSecretStore } from '../../humble/secretStore'

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

const mockRequestRustInvoke = requestRustInvoke as jest.Mock

let program: Record<string, ProgrammedOutcome> = {}
let callLog: Array<{ channel: string; args: unknown[] }> = []

function programChannel(channel: string, outcome: ProgrammedOutcome): void {
  program[channel] = outcome
}

describe('SidecarHumbleSecretStore', () => {
  beforeEach(() => {
    program = {}
    callLog = []
    backingStore = {}
    // Must run before any test body issues a read -- see this file's header doc comment on the
    // module-level SLOT_STORES singleton and why a fresh `new SidecarHumbleSecretStore()` per
    // test does NOT give a fresh cache.
    resetSidecarHumbleSecretStoreCachesForTests()
    mockConfigStore.get_nodefault.mockImplementation((key: string) => backingStore[key])
    mockConfigStore.set.mockImplementation((key: string, value: unknown) => {
      backingStore[key] = value
    })
    mockConfigStore.delete.mockImplementation((key: string) => {
      delete backingStore[key]
    })
    mockRequestRustInvoke.mockImplementation((channel: string, args: unknown[]) => {
      callLog.push({ channel, args })
      const outcome = program[channel]
      if (!outcome) {
        return Promise.reject(new Error(`no outcome programmed for channel: ${channel}`))
      }
      return outcome.type === 'resolve'
        ? Promise.resolve(outcome.value)
        : Promise.reject(outcome.error)
    })
  })

  // Behavior: setSecret('sessionCookie', v) sends keyring_set with the value and the
  // humble-session slot -- never steam-refresh-token.
  it("setSecret('sessionCookie', v) sends keyring_set with the humble-session slot, never steam-refresh-token", async () => {
    programChannel('keyring_set', { type: 'resolve', value: true })
    const store = new SidecarHumbleSecretStore()

    await store.setSecret('sessionCookie', 'cookie-value')

    expect(callLog).toStrictEqual([
      { channel: 'keyring_set', args: ['cookie-value', KEYRING_SLOT_HUMBLE_SESSION] }
    ])
    for (const call of callLog) {
      expect(call.args).not.toContain(KEYRING_SLOT_STEAM_REFRESH_TOKEN)
    }
  })

  // Behavior: setSecret('csrfToken', v) sends keyring_set with the humble-csrf slot.
  it("setSecret('csrfToken', v) sends keyring_set with the humble-csrf slot, distinct from humble-session", async () => {
    programChannel('keyring_set', { type: 'resolve', value: true })
    const store = new SidecarHumbleSecretStore()

    await store.setSecret('csrfToken', 'csrf-value')

    expect(callLog).toStrictEqual([
      { channel: 'keyring_set', args: ['csrf-value', KEYRING_SLOT_HUMBLE_CSRF] }
    ])
  })

  // Behavior: getSecret returns '' when keyring_get resolves null (healthy first run) and logs
  // nothing for that case.
  it('getSecret returns "" without logging when keyring_get reports no entry (null)', async () => {
    programChannel('keyring_get', { type: 'resolve', value: null })
    const store = new SidecarHumbleSecretStore()

    await expect(store.getSecret('sessionCookie')).resolves.toBe('')
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  // Behavior: getSecret returns '' and logs exactly one warning naming the channel when
  // requestRustInvoke rejects.
  it('getSecret returns "" and logs exactly one warning naming the channel when keyring_get rejects', async () => {
    programChannel('keyring_get', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarHumbleSecretStore()

    await expect(store.getSecret('sessionCookie')).resolves.toBe('')
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
    const [warningArg] = mockLogWarning.mock.calls[0]
    expect(String(warningArg)).toContain('keyring_get')
  })

  // Behavior: setSecret never throws to its caller when the keyring rejects; it logs once and
  // resolves.
  it('setSecret resolves and logs exactly one warning when keyring_set rejects (never throws)', async () => {
    programChannel('keyring_set', {
      type: 'reject',
      error: new Error('keyring:unavailable:NoStorageAccess')
    })
    const store = new SidecarHumbleSecretStore()

    await expect(store.setSecret('sessionCookie', 'x')).resolves.toBeUndefined()
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  // Behavior: clearSecrets() deletes BOTH slots, and resolves even if one delete rejects.
  it('clearSecrets() issues a delete for BOTH slots and resolves even if one rejects', async () => {
    programChannel('keyring_delete', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarHumbleSecretStore()

    await expect(store.clearSecrets()).resolves.toBeUndefined()

    const deleteCalls = callLog.filter((c) => c.channel === 'keyring_delete')
    expect(deleteCalls).toHaveLength(2)
    expect(deleteCalls).toEqual(
      expect.arrayContaining([
        { channel: 'keyring_delete', args: [KEYRING_SLOT_HUMBLE_SESSION] },
        { channel: 'keyring_delete', args: [KEYRING_SLOT_HUMBLE_CSRF] }
      ])
    )
  })

  it('clearSecrets() deletes both slots when both resolve successfully', async () => {
    programChannel('keyring_delete', { type: 'resolve', value: true })
    const store = new SidecarHumbleSecretStore()

    await store.clearSecrets()

    const deleteCalls = callLog.filter((c) => c.channel === 'keyring_delete')
    expect(deleteCalls).toHaveLength(2)
  })

  // Behavior: isAvailable() resolves false rather than throwing when keyring_available rejects.
  it('isAvailable() resolves false when keyring_available rejects', async () => {
    programChannel('keyring_available', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarHumbleSecretStore()

    await expect(store.isAvailable()).resolves.toBe(false)
  })

  it('isAvailable() resolves true when keyring_available reports true', async () => {
    programChannel('keyring_available', { type: 'resolve', value: true })
    const store = new SidecarHumbleSecretStore()

    await expect(store.isAvailable()).resolves.toBe(true)
  })

  // Behavior: no method ever logs the secret value, on any path.
  it('never logs the secret value on any path (setSecret failure, getSecret failure)', async () => {
    const SECRET = 'super-secret-cookie-value-xyz'
    programChannel('keyring_set', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    programChannel('keyring_get', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarHumbleSecretStore()

    await store.setSecret('sessionCookie', SECRET)
    await store.getSecret('sessionCookie')

    for (const call of mockLogWarning.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(SECRET)
    }
  })

  describe('installSidecarHumbleSecretStore()', () => {
    it('installs a SidecarHumbleSecretStore instance into the registry and logs a keyring-backed confirmation line', () => {
      installSidecarHumbleSecretStore()

      expect(getHumbleSecretStore()).toBeInstanceOf(SidecarHumbleSecretStore)
      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.stringContaining(
          'Humble secret store installed: keyring-backed (humble-session/humble-csrf slots)'
        ),
        'Backend'
      )
    })

    it('fires the migration without blocking (returns before any keyring call settles)', async () => {
      // A never-resolving keyring_set proves install() itself did not await migration.
      mockRequestRustInvoke.mockImplementation((channel: string, args: unknown[]) => {
        callLog.push({ channel, args })
        return new Promise(() => {
          /* never settles */
        })
      })
      backingStore['sessionCookie'] = 'plaintext-cookie'

      expect(() => installSidecarHumbleSecretStore()).not.toThrow()
      expect(getHumbleSecretStore()).toBeInstanceOf(SidecarHumbleSecretStore)
    })
  })

  // ── One-time plaintext migration (Task 2, D-GAP-01/T-34.4.1-57) ────────────────────────────────

  describe('migrateOneSecret (one-time plaintext-to-keyring migration)', () => {
    it('given a working keyring, writes the plaintext to the keyring, reads it back, THEN deletes the configStore key and clears encryptionDegraded', async () => {
      backingStore['sessionCookie'] = 'plaintext-cookie-value'
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', { type: 'resolve', value: 'plaintext-cookie-value' })

      await migrateOneSecret('sessionCookie')

      expect(callLog).toEqual([
        { channel: 'keyring_set', args: ['plaintext-cookie-value', KEYRING_SLOT_HUMBLE_SESSION] },
        { channel: 'keyring_get', args: [KEYRING_SLOT_HUMBLE_SESSION] }
      ])
      expect(backingStore['sessionCookie']).toBeUndefined()
      expect(backingStore['encryptionDegraded']).toBe(false)
    })

    it('a rejecting keyring write LEAVES the plaintext in place, does not touch encryptionDegraded, and logs exactly one warning', async () => {
      backingStore['sessionCookie'] = 'plaintext-cookie-value'
      programChannel('keyring_set', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })

      await migrateOneSecret('sessionCookie')

      expect(backingStore['sessionCookie']).toBe('plaintext-cookie-value')
      expect(backingStore['encryptionDegraded']).toBeUndefined()
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
      // keyring_get must never have been attempted -- a failed write skips the readback entirely.
      expect(callLog.some((c) => c.channel === 'keyring_get')).toBe(false)
    })

    it('a rejecting keyring readback LEAVES the plaintext in place and logs exactly one warning', async () => {
      backingStore['sessionCookie'] = 'plaintext-cookie-value'
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })

      await migrateOneSecret('sessionCookie')

      expect(backingStore['sessionCookie']).toBe('plaintext-cookie-value')
      expect(backingStore['encryptionDegraded']).toBeUndefined()
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
    })

    it('a MISMATCHED readback LEAVES the plaintext in place -- never rounded up to success', async () => {
      backingStore['sessionCookie'] = 'plaintext-cookie-value'
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', { type: 'resolve', value: 'a-completely-different-value' })

      await migrateOneSecret('sessionCookie')

      expect(backingStore['sessionCookie']).toBe('plaintext-cookie-value')
      expect(backingStore['encryptionDegraded']).toBeUndefined()
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
    })

    it('with the configStore key already absent, performs NO keyring write (runs at most once per successful move)', async () => {
      // backingStore starts empty (beforeEach) -- sessionCookie was never stored, or a prior
      // migration already ran.
      await migrateOneSecret('sessionCookie')

      expect(callLog).toEqual([])
      expect(mockLogWarning).not.toHaveBeenCalled()
    })

    it("migrates csrfToken independently onto the humble-csrf slot, distinct from the session's humble-session slot", async () => {
      backingStore['csrfToken'] = 'plaintext-csrf-value'
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', { type: 'resolve', value: 'plaintext-csrf-value' })

      await migrateOneSecret('csrfToken')

      expect(callLog).toEqual([
        { channel: 'keyring_set', args: ['plaintext-csrf-value', KEYRING_SLOT_HUMBLE_CSRF] },
        { channel: 'keyring_get', args: [KEYRING_SLOT_HUMBLE_CSRF] }
      ])
      expect(backingStore['csrfToken']).toBeUndefined()
    })

    it('never logs the plaintext secret value on any migration failure path', async () => {
      const SECRET = 'super-secret-migration-value-xyz'
      backingStore['sessionCookie'] = SECRET
      programChannel('keyring_set', { type: 'resolve', value: true })
      programChannel('keyring_get', { type: 'resolve', value: 'mismatched-value' })

      await migrateOneSecret('sessionCookie')

      for (const call of mockLogWarning.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SECRET)
      }
    })
  })

  describe('migrateHumbleSecrets (both secrets, independently)', () => {
    it("a failed csrfToken migration does not roll back a successful sessionCookie migration", async () => {
      backingStore['sessionCookie'] = 'session-plaintext'
      backingStore['csrfToken'] = 'csrf-plaintext'
      mockRequestRustInvoke.mockImplementation((channel: string, args: unknown[]) => {
        callLog.push({ channel, args })
        const slot = channel === 'keyring_set' ? args[1] : args[0]
        if (slot === KEYRING_SLOT_HUMBLE_SESSION) {
          if (channel === 'keyring_set') return Promise.resolve(true)
          if (channel === 'keyring_get') return Promise.resolve('session-plaintext')
        }
        if (slot === KEYRING_SLOT_HUMBLE_CSRF && channel === 'keyring_set') {
          return Promise.reject(new Error('keyring:unavailable:PlatformFailure'))
        }
        return Promise.reject(new Error(`unexpected channel/slot: ${channel}/${String(slot)}`))
      })

      await migrateHumbleSecrets()

      // sessionCookie migrated successfully...
      expect(backingStore['sessionCookie']).toBeUndefined()
      expect(backingStore['encryptionDegraded']).toBe(false)
      // ...while csrfToken's failed migration left its plaintext untouched.
      expect(backingStore['csrfToken']).toBe('csrf-plaintext')
    })

    it('after a successful migration, getSecret() resolves the same value it would have resolved via a live keyring, proving the move is lossless', async () => {
      // A stateful fake Keychain (keyed by slot) rather than a fixed scripted value -- this is
      // what makes the "before" read meaningfully distinct from the "after" read: BEFORE
      // migration runs, the keyring genuinely holds nothing for this slot (getSecret resolves
      // '' -- no entry yet, the honest pre-migration state); only AFTER migrateHumbleSecrets()
      // writes it does a live getSecret() read return the migrated value.
      const keyringState = new Map<string, string>()
      mockRequestRustInvoke.mockImplementation((channel: string, args: unknown[]) => {
        callLog.push({ channel, args })
        if (channel === 'keyring_set') {
          const [value, slot] = args as [string, string]
          keyringState.set(slot, value)
          return Promise.resolve(true)
        }
        if (channel === 'keyring_get') {
          const [slot] = args as [string]
          return Promise.resolve(keyringState.get(slot) ?? null)
        }
        return Promise.reject(new Error(`unexpected channel: ${channel}`))
      })
      backingStore['sessionCookie'] = 'round-trip-value'

      const store = new SidecarHumbleSecretStore()
      const before = await store.getSecret('sessionCookie')
      await migrateHumbleSecrets()
      const after = await store.getSecret('sessionCookie')

      expect(before).toBe('') // honest pre-migration state: nothing in the keyring yet
      expect(after).toBe('round-trip-value')
      expect(backingStore['sessionCookie']).toBeUndefined()
    })
  })

  // ── Read caching, inherited from SidecarKeyringSlotStore (34.4.1 gap cycle 2 plan 26) ───────

  describe('read caching (inherited from SidecarKeyringSlotStore via the shared SLOT_STORES singleton)', () => {
    it('getSecret() caches a successful read -- a second call for the same key issues NO further keyring_get', async () => {
      programChannel('keyring_get', { type: 'resolve', value: 'cookie-value' })
      const store = new SidecarHumbleSecretStore()

      await expect(store.getSecret('sessionCookie')).resolves.toBe('cookie-value')
      await expect(store.getSecret('sessionCookie')).resolves.toBe('cookie-value')

      expect(callLog).toStrictEqual([
        { channel: 'keyring_get', args: [KEYRING_SLOT_HUMBLE_SESSION] }
      ])
    })

    it('sessionCookie and csrfToken cache INDEPENDENTLY -- reading one never suppresses a real read of the other', async () => {
      programChannel('keyring_get', { type: 'resolve', value: 'shared-scripted-value' })
      const store = new SidecarHumbleSecretStore()

      await store.getSecret('sessionCookie')
      await store.getSecret('csrfToken')

      const getCalls = callLog.filter((c) => c.channel === 'keyring_get')
      expect(getCalls).toHaveLength(2)
      expect(getCalls).toEqual(
        expect.arrayContaining([
          { channel: 'keyring_get', args: [KEYRING_SLOT_HUMBLE_SESSION] },
          { channel: 'keyring_get', args: [KEYRING_SLOT_HUMBLE_CSRF] }
        ])
      )
    })

    it('clearSecrets() invalidates BOTH slots\' caches -- a disconnect can never resurrect a stale cached session or csrf value', async () => {
      programChannel('keyring_get', { type: 'resolve', value: 'pre-disconnect-value' })
      const store = new SidecarHumbleSecretStore()

      await expect(store.getSecret('sessionCookie')).resolves.toBe('pre-disconnect-value')
      await expect(store.getSecret('csrfToken')).resolves.toBe('pre-disconnect-value')

      programChannel('keyring_delete', { type: 'resolve', value: true })
      await store.clearSecrets()

      // Both deletes succeeded -- the confirmed-empty value is now cached, and getSecret() must
      // resolve '' WITHOUT resurrecting the pre-disconnect cached value and WITHOUT a further
      // keyring_get round trip.
      await expect(store.getSecret('sessionCookie')).resolves.toBe('')
      await expect(store.getSecret('csrfToken')).resolves.toBe('')
      expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(2)
    })

    it('setSecret() invalidates that slot\'s cache -- a subsequent getSecret() for the same key returns the newly-set value, never a stale one', async () => {
      programChannel('keyring_get', { type: 'resolve', value: 'old-cookie' })
      const store = new SidecarHumbleSecretStore()

      await expect(store.getSecret('sessionCookie')).resolves.toBe('old-cookie')

      programChannel('keyring_set', { type: 'resolve', value: true })
      await store.setSecret('sessionCookie', 'new-cookie')

      await expect(store.getSecret('sessionCookie')).resolves.toBe('new-cookie')
      expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(1)
    })

    it('isAvailable() caches its result -- a second call issues NO further keyring_available', async () => {
      programChannel('keyring_available', { type: 'resolve', value: true })
      const store = new SidecarHumbleSecretStore()

      await expect(store.isAvailable()).resolves.toBe(true)
      await expect(store.isAvailable()).resolves.toBe(true)

      expect(callLog).toStrictEqual([
        { channel: 'keyring_available', args: [KEYRING_SLOT_HUMBLE_SESSION] }
      ])
    })
  })

  // Structural proof: no reference to the Steam slot's literal string, outside comments -- the
  // exact clobber D-GAP-01 exists to prevent. (Task 1's sibling "no configStore/electronStores
  // reference" structural check was valid only before Task 2's migration logic legitimately
  // added a read/delete of configStore for the one-time plaintext migration below -- superseded
  // by the migration-specific structural/behavioral tests in this file's own describe block.)
  it('source (excluding comments) contains no reference to the literal steam-refresh-token slot name', () => {
    const src = readFileSync(join(__dirname, '../humbleSecretStore.ts'), 'utf-8')
    const codeOnly = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    expect(codeOnly).not.toMatch(/steam-refresh-token/)
  })
})
