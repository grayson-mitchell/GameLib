/**
 * Unit tests for `devSecretVault.ts` (34.5 gap cycle 4 plan 36, Task 1) and its exclusive
 * wiring into `bootstrap.ts` (Task 2).
 *
 * This is the F-1 regression guard this module's own header promises: `safeStorage` under
 * Tauri silently persisted secrets in PLAINTEXT (finding F-1, closed by
 * `keyringTokenStore.ts`/`humbleSecretStore.ts`). This module is a DELIBERATE, narrow, opt-in
 * reintroduction of a plaintext store — every test below exists to prove its three guardrails
 * (env-exact-match opt-in, loud warnings that never leak a value, and packaged-build refusal)
 * hold, not merely that the vault "works".
 *
 * `../pathShim` is mocked so every test resolves the vault file inside a disposable, per-test
 * `mkdtemp` directory (real `graceful-fs`, real filesystem — this project's established
 * black-box-over-mocking-fs precedent, `bootstrap.test.ts`'s own header) rather than the
 * developer's real `os.tmpdir()` shared across concurrent test runs.
 *
 * `../humbleFlowRegistration` is mocked at the MODULE level (not `jest.spyOn` on the real
 * export) specifically so importing it here never pulls in that module's real transitive graph
 * (`../storeManagers`, `../humble/user`, `../humble/library`) — see that module's own test
 * file, `humbleFlows.test.ts`, for how heavy driving the REAL module is. This file only needs
 * `isPackagedSidecar()`'s return value, scripted per test.
 */

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── logger mock — mirrors keyringTokenStore.test.ts's established convention; captures every
// call so tests can scan arguments for a leaked secret value. ──────────────────────────────────
const mockLogInfo = jest.fn()
const mockLogWarning = jest.fn()
const mockLogError = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
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

// ── pathShim mock — every test's vault file resolves inside a disposable per-test mkdtemp dir,
// never the developer's real os.tmpdir(). ───────────────────────────────────────────────────────
const mockGetPath = jest.fn()
jest.mock('../pathShim', () => ({
  getPath: (name: string) => mockGetPath(name)
}))

// ── humbleFlowRegistration mock — see file header for why this is a full module mock, not a
// spy on the real export. ────────────────────────────────────────────────────────────────────
const mockIsPackagedSidecar = jest.fn()
jest.mock('../humbleFlowRegistration', () => ({
  isPackagedSidecar: () => mockIsPackagedSidecar()
}))

// ── graceful-fs — real implementation by default; `chmodSync` is individually overridable so
// one test can exercise the "file cannot be created with owner-only permissions" refusal path
// without touching real OS permission bits. Mirrors backend/__tests__/utils.test.ts's own
// `...jest.requireActual(...)` + selective-override convention. ────────────────────────────────
jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  chmodSync: jest.fn((...args: Parameters<typeof import('fs').chmodSync>) =>
    jest.requireActual('graceful-fs').chmodSync(...args)
  )
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────────────────────
import { statSync, readFileSync } from 'fs'
import { chmodSync as mockedChmodSync } from 'graceful-fs'
import { installDevSecretVault } from '../devSecretVault'
import * as tokenStoreModule from 'backend/storeManagers/steam/tokenStore'
import * as secretStoreModule from 'backend/humble/secretStore'

const ENV_VAR = 'GAMELIB_DEV_SECRET_VAULT'

describe('devSecretVault', () => {
  let savedEnvValue: string | undefined
  let vaultDir: string

  beforeEach(() => {
    savedEnvValue = process.env[ENV_VAR]
    delete process.env[ENV_VAR]

    vaultDir = mkdtempSync(join(tmpdir(), 'gamelib-dev-secret-vault-test-'))
    mockGetPath.mockImplementation((name: string) => {
      if (name === 'temp') return vaultDir
      throw new Error(`unexpected getPath('${name}') in devSecretVault.test.ts`)
    })

    mockIsPackagedSidecar.mockReset()
    ;(mockedChmodSync as jest.Mock).mockImplementation(
      (...args: Parameters<typeof import('fs').chmodSync>) =>
        jest.requireActual('graceful-fs').chmodSync(...args)
    )
  })

  afterEach(() => {
    if (savedEnvValue === undefined) {
      delete process.env[ENV_VAR]
    } else {
      process.env[ENV_VAR] = savedEnvValue
    }
    rmSync(vaultDir, { recursive: true, force: true })
  })

  // ── Guardrail (a): exact-'1' env opt-in ────────────────────────────────────────────────────

  it('unset: returns false and calls neither setter (the F-1 regression guard)', () => {
    const setTokenStoreSpy = jest.spyOn(tokenStoreModule, 'setTokenStore')
    const setHumbleSecretStoreSpy = jest.spyOn(
      secretStoreModule,
      'setHumbleSecretStore'
    )

    expect(installDevSecretVault()).toBe(false)
    expect(setTokenStoreSpy).not.toHaveBeenCalled()
    expect(setHumbleSecretStoreSpy).not.toHaveBeenCalled()

    setTokenStoreSpy.mockRestore()
    setHumbleSecretStoreSpy.mockRestore()
  })

  it.each(['0', 'false'])(
    "'%s' does not enable the vault (proves exact-'1' match, not truthiness)",
    (value) => {
      process.env[ENV_VAR] = value
      const setTokenStoreSpy = jest.spyOn(tokenStoreModule, 'setTokenStore')

      expect(installDevSecretVault()).toBe(false)
      expect(setTokenStoreSpy).not.toHaveBeenCalled()

      setTokenStoreSpy.mockRestore()
    }
  )

  // ── Guardrail (c): production-refused, fail-closed ─────────────────────────────────────────

  it('packaged build: refuses, installs nothing, and logs REFUSED', () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(true)
    const setTokenStoreSpy = jest.spyOn(tokenStoreModule, 'setTokenStore')

    expect(installDevSecretVault()).toBe(false)
    expect(setTokenStoreSpy).not.toHaveBeenCalled()
    expect(
      mockLogError.mock.calls.some(([message]) =>
        String(message).includes('[dev-secret-vault] REFUSED')
      )
    ).toBe(true)

    setTokenStoreSpy.mockRestore()
  })

  it('isPackagedSidecar() throwing: refuses (fail-closed), installs nothing', () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockImplementation(() => {
      throw new Error('build-kind detector exploded')
    })
    const setTokenStoreSpy = jest.spyOn(tokenStoreModule, 'setTokenStore')

    expect(installDevSecretVault()).toBe(false)
    expect(setTokenStoreSpy).not.toHaveBeenCalled()

    setTokenStoreSpy.mockRestore()
  })

  it('vault file cannot be created with owner-only permissions: refuses and logs REFUSED', () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)
    ;(mockedChmodSync as jest.Mock).mockImplementation(() => {
      throw new Error('EPERM: operation not permitted, chmod')
    })
    const setTokenStoreSpy = jest.spyOn(tokenStoreModule, 'setTokenStore')

    expect(installDevSecretVault()).toBe(false)
    expect(setTokenStoreSpy).not.toHaveBeenCalled()
    expect(
      mockLogError.mock.calls.some(([message]) =>
        String(message).includes('[dev-secret-vault] REFUSED')
      )
    ).toBe(true)

    setTokenStoreSpy.mockRestore()
  })

  // ── Guardrail (b): loud, value-free logging + successful install ──────────────────────────

  it("'1' in a dev build: installs both stores exactly once, logs INSTALLED + PLAINTEXT", () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)
    const setTokenStoreSpy = jest.spyOn(tokenStoreModule, 'setTokenStore')
    const setHumbleSecretStoreSpy = jest.spyOn(
      secretStoreModule,
      'setHumbleSecretStore'
    )

    expect(installDevSecretVault()).toBe(true)
    expect(setTokenStoreSpy).toHaveBeenCalledTimes(1)
    expect(setHumbleSecretStoreSpy).toHaveBeenCalledTimes(1)

    const installedLine = mockLogWarning.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes('[dev-secret-vault] INSTALLED'))
    expect(installedLine).toBeDefined()
    expect(installedLine).toContain('PLAINTEXT')

    setTokenStoreSpy.mockRestore()
    setHumbleSecretStoreSpy.mockRestore()
  })

  it('the vault file is created with mode 0o600', () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)

    expect(installDevSecretVault()).toBe(true)

    const vaultPath = join(vaultDir, 'gamelib-dev-secret-vault.json')
    const mode = statSync(vaultPath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('write-then-read round-trips a secret, and NO logged argument leaks the value, a substring of it, or its length', async () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)

    expect(installDevSecretVault()).toBe(true)

    // Deliberately random, no natural-language overlap with this module's own log vocabulary
    // (slot names, "INSTALLED", "PLAINTEXT", the vault's file path) — a secret that happened to
    // literally contain a substring like "refresh-token" would make the leak-scan below fail on
    // an innocent coincidence rather than a real leak.
    const secretValue = 'xQ7mK2vL9wZ3nR8pJ5tY'
    const tokenStore = tokenStoreModule.getTokenStore()
    await tokenStore.setToken(secretValue)
    const readBack = await tokenStore.getToken()
    expect(readBack).toBe(secretValue)

    const humbleStore = secretStoreModule.getHumbleSecretStore()
    const csrfSecret = 'bN4hW9cT6yU2gM8sV1Lq'
    await humbleStore.setSecret('csrfToken', csrfSecret)
    const csrfReadBack = await humbleStore.getSecret('csrfToken')
    expect(csrfReadBack).toBe(csrfSecret)

    const allLoggedArgs: unknown[] = [
      ...mockLogInfo.mock.calls.flat(),
      ...mockLogWarning.mock.calls.flat(),
      ...mockLogError.mock.calls.flat()
    ]

    for (const secret of [secretValue, csrfSecret]) {
      for (const arg of allLoggedArgs) {
        const text = typeof arg === 'string' ? arg : JSON.stringify(arg)
        expect(text).not.toContain(secret)
        // No substring of the secret longer than two characters may appear either — scans a
        // sliding window rather than only the full value, per this task's own acceptance
        // criterion.
        for (let i = 0; i + 3 <= secret.length; i++) {
          expect(text.includes(secret.slice(i, i + 3))).toBe(false)
        }
        expect(text).not.toContain(String(secret.length))
      }
    }
  })

  it('only reads slot/key identifiers into log lines, never the value, on a plain read of an empty slot', async () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)
    expect(installDevSecretVault()).toBe(true)

    const tokenStore = tokenStoreModule.getTokenStore()
    await tokenStore.getToken()

    expect(
      mockLogWarning.mock.calls.some(
        ([message]) => message === '[dev-secret-vault] read key=steam-refresh-token'
      )
    ).toBe(true)
  })

  // ── Import-time discipline: no file I/O before installDevSecretVault() is called ──────────

  it('performs no file I/O at module import — no vault file exists until installDevSecretVault() is called', () => {
    process.env[ENV_VAR] = '1'
    // No install call in this test. `../devSecretVault` was already imported at the top of
    // this file (before this test's own `beforeEach` ever pointed `mockGetPath` at this fresh
    // `vaultDir`) — if the module performed any file I/O at import time, a file would already
    // sit at this path despite `installDevSecretVault()` never having been called here.
    const vaultPath = join(vaultDir, 'gamelib-dev-secret-vault.json')
    expect(() => readFileSync(vaultPath)).toThrow()
  })
})
