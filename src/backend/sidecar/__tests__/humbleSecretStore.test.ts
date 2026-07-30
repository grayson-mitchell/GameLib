/**
 * Unit tests for `SidecarHumbleSecretStore` / `installSidecarHumbleSecretStore()` (Phase 34.4.1
 * gap-cycle plan 13, Task 1 — closing F-1 BLOCKING / REQ-34.4.1-02 / REQ-34.4.1-GAP-02).
 *
 * Mirrors `keyringTokenStore.test.ts`'s mocking convention: `requestRustInvoke` (from
 * `../sidecarRpc`) is mocked with an in-memory per-channel program + call log, so each test can
 * script a resolve/reject outcome and assert on exactly what was sent. `../humble/secretStore`
 * is NOT mocked — the real registry (`setHumbleSecretStore`/`getHumbleSecretStore`) is exercised
 * so the install() test proves an actual registry swap, not a mocked one.
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

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { requestRustInvoke } from '../sidecarRpc'
import {
  KEYRING_SLOT_STEAM_REFRESH_TOKEN,
  KEYRING_SLOT_HUMBLE_SESSION,
  KEYRING_SLOT_HUMBLE_CSRF
} from '../keyringTokenStore'
import {
  SidecarHumbleSecretStore,
  installSidecarHumbleSecretStore
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
  })

  // Structural proof: no path to configStore/electronStores, and no reference to the Steam
  // slot's literal string, outside comments -- the exact clobber D-GAP-01 exists to prevent.
  it('source contains no reference to configStore/electronStores', () => {
    const src = readFileSync(join(__dirname, '../humbleSecretStore.ts'), 'utf-8')
    expect(src).not.toMatch(/configStore|electronStores/)
  })

  it('source (excluding comments) contains no reference to the literal steam-refresh-token slot name', () => {
    const src = readFileSync(join(__dirname, '../humbleSecretStore.ts'), 'utf-8')
    const codeOnly = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    expect(codeOnly).not.toMatch(/steam-refresh-token/)
  })
})
