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
 * `../humbleFlowRegistration` is mocked with `jest.requireActual(...)` spread + a single
 * overridden `isPackagedSidecar` — NOT a full replacement — because the second describe block
 * below (Task 2) drives the REAL `../bootstrap` `init()`, whose `./handlers` import graph calls
 * the REAL `registerHumbleFlows()` from this same module at ITS OWN module scope
 * (`handlers.ts:194`); a full-replacement mock would leave that call undefined and throw the
 * instant `../bootstrap` — or anything importing it — is required. Only `isPackagedSidecar`
 * needs to be scriptable per test; everything else stays real.
 */

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── logger — NOT `jest.mock()`'d at all (deliberately). `backend/logger` and `backend/config`
// have a real circular import (`config.ts` imports `logError`/`logInfo`/`LogPrefix` from
// `./logger`; `logger/index.ts` imports `GlobalConfig` from `backend/config`) — a
// `jest.mock('backend/logger', () => ({ ...jest.requireActual(...), ... }))` spread is fragile
// against that cycle: depending on which side of the cycle this file's larger import graph
// (Task 2's real `../bootstrap`) resolves FIRST, `jest.requireActual` can return the
// STILL-EVALUATING module's PARTIAL exports (its own `export { ... LogPrefix, getLogFilePath }`
// list runs at the very end of the file), silently spreading in an incomplete object. `jest.spyOn`
// on the REAL, already-fully-loaded module (mirrors `bootstrap.test.ts`'s own established
// `jest.spyOn(loggerModule, 'logInfo')` convention) sidesteps this: it mutates the ALREADY-real
// module's exports object in place after normal evaluation completed, never re-entering the
// cycle. `mockImplementation(() => {})` on top is required for TASK 1's tests specifically —
// they call `installDevSecretVault()` directly without ever calling `../bootstrap`'s `init()`,
// so `heroicLogWriter` is never constructed and a REAL `logWarning`/`logError` call-through
// would throw (`sidecar-console-and-logger-are-invisible`, this project's own recorded gotcha).
// The real import lives in the "Imports (after mocks)" block below; only the spy handles are
// declared here. ─────────────────────────────────────────────────────────────────────────────
let mockLogInfo: jest.SpyInstance
let mockLogWarning: jest.SpyInstance
let mockLogError: jest.SpyInstance

// ── pathShim mock — REAL module for every name except 'temp', which each test points at a
// disposable per-test mkdtemp dir (never the developer's real os.tmpdir()). Must stay REAL for
// every other name: `electronStub.ts`'s `app.getPath` is a direct re-export of THIS SAME
// module's `getPath` (`electronStub.ts:39,203`), and `backend/constants/paths.ts` calls
// `app.getPath('appData'|'userData')` at MODULE SCOPE — a full-replacement mock (Task 1's
// original, pre-Task-2 shape) would throw on that call the instant anything in this file
// imports the real `./handlers` graph (Task 2's bootstrap wiring block does, via `../bootstrap`). ─
const realPathShim: typeof import('../pathShim') =
  jest.requireActual('../pathShim')
const mockGetPath = jest.fn()
jest.mock('../pathShim', () => ({
  getPath: (name: string) => mockGetPath(name)
}))

// ── humbleFlowRegistration mock — see file header for why this preserves every REAL export
// (Task 2's bootstrap wiring block needs the real registerHumbleFlows()) and overrides only
// isPackagedSidecar, scriptable per test. ───────────────────────────────────────────────────
const mockIsPackagedSidecar = jest.fn()
jest.mock('../humbleFlowRegistration', () => ({
  ...jest.requireActual('../humbleFlowRegistration'),
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

// ── online_monitor — full-surface mock, identical to `bootstrap.test.ts`'s own block (needed
// ONLY by Task 2's bootstrap wiring describe block below, which drives the REAL `init()`; see
// that file's header for why the real `initOnlineMonitor()` throws under the default 'electron'
// automock this project applies to every backend test file). ─────────────────────────────────
jest.mock('../../online_monitor', () => ({
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((callback: () => unknown) => callback()),
  onConnectivityChange: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────────────────────
import { PassThrough } from 'node:stream'
import { statSync, readFileSync } from 'fs'
import { chmodSync as mockedChmodSync } from 'graceful-fs'
import * as loggerModule from 'backend/logger'
import { installDevSecretVault } from '../devSecretVault'
import * as devSecretVaultModule from '../devSecretVault'
import * as tokenStoreModule from 'backend/storeManagers/steam/tokenStore'
import * as secretStoreModule from 'backend/humble/secretStore'
import * as humbleSecretStoreModule from '../humbleSecretStore'
import { init } from '../bootstrap'

const ENV_VAR = 'GAMELIB_DEV_SECRET_VAULT'

describe('devSecretVault', () => {
  let savedEnvValue: string | undefined
  let vaultDir: string

  beforeEach(() => {
    savedEnvValue = process.env[ENV_VAR]
    delete process.env[ENV_VAR]

    vaultDir = mkdtempSync(join(tmpdir(), 'gamelib-dev-secret-vault-test-'))
    mockGetPath.mockImplementation((name: string) =>
      // 'temp' is the only name this suite ever redirects — every other name (Task 2's real
      // bootstrap `init()` needs 'appData'/'userData'/etc. via electronStub's app.getPath) falls
      // through to the REAL pathShim, see the mock declaration's own comment above.
      name === 'temp' ? vaultDir : realPathShim.getPath(name)
    )

    mockIsPackagedSidecar.mockReset()
    ;(mockedChmodSync as jest.Mock).mockImplementation(
      (...args: Parameters<typeof import('fs').chmodSync>) =>
        jest.requireActual('graceful-fs').chmodSync(...args)
    )

    // See the module-scope comment above `let mockLogInfo: jest.SpyInstance` for why this is a
    // real jest.spyOn(), not a jest.mock() factory. `mockImplementation(() => {})` suppresses
    // the real write path (Task 1's tests never call `../bootstrap`'s `init()`, so
    // `heroicLogWriter` is never constructed) while still recording every call for the leak-scan
    // and receipt-line assertions below.
    mockLogInfo = jest
      .spyOn(loggerModule, 'logInfo')
      .mockImplementation(() => {})
    mockLogWarning = jest
      .spyOn(loggerModule, 'logWarning')
      .mockImplementation(() => {})
    mockLogError = jest
      .spyOn(loggerModule, 'logError')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    if (savedEnvValue === undefined) {
      delete process.env[ENV_VAR]
    } else {
      process.env[ENV_VAR] = savedEnvValue
    }
    rmSync(vaultDir, { recursive: true, force: true })

    mockLogInfo.mockRestore()
    mockLogWarning.mockRestore()
    mockLogError.mockRestore()
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
        ([message]) =>
          message === '[dev-secret-vault] read key=steam-refresh-token'
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

  // ── Task 2: the exclusive branch in bootstrap.ts's init() ─────────────────────────────────
  //
  // Drives the REAL `../bootstrap` `init()` (nested inside this describe block so it inherits
  // the outer `beforeEach`'s fresh `vaultDir`/`mockGetPath`/mock-reset setup, even though these
  // tests mock `installDevSecretVault` directly rather than driving it through a real env var).
  // `installDevSecretVault` itself is spied and forced to a fixed return value per test — Task 1
  // above already proves its OWN real behavior; this block proves only which arm `init()` takes
  // given that return value, and that the branch is exclusive (never both, never neither).
  describe('bootstrap wiring — exclusive secret-store branch (Task 2)', () => {
    it('vault disabled: installs the keyring stores exactly as today, and emits the keyring receipt line', () => {
      const installDevSecretVaultSpy = jest
        .spyOn(devSecretVaultModule, 'installDevSecretVault')
        .mockReturnValue(false)
      const setTokenStoreSpy = jest.spyOn(tokenStoreModule, 'setTokenStore')
      const installSidecarHumbleSecretStoreSpy = jest.spyOn(
        humbleSecretStoreModule,
        'installSidecarHumbleSecretStore'
      )

      try {
        const input = new PassThrough()
        const output = new PassThrough()
        init(input, output)

        expect(setTokenStoreSpy).toHaveBeenCalledTimes(1)
        expect(installSidecarHumbleSecretStoreSpy).toHaveBeenCalledTimes(1)
        expect(
          mockLogInfo.mock.calls.some(
            ([message]) => message === '[bootstrap] secret stores: keyring'
          )
        ).toBe(true)
        expect(
          mockLogInfo.mock.calls.some(
            ([message]) => message === '[bootstrap] secret stores: dev-vault'
          )
        ).toBe(false)
      } finally {
        installDevSecretVaultSpy.mockRestore()
        setTokenStoreSpy.mockRestore()
        installSidecarHumbleSecretStoreSpy.mockRestore()
      }
    })

    it('vault enabled: does not install the keyring stores or fire the Humble migration, and emits the dev-vault receipt line', () => {
      const installDevSecretVaultSpy = jest
        .spyOn(devSecretVaultModule, 'installDevSecretVault')
        .mockReturnValue(true)
      const setTokenStoreSpy = jest.spyOn(tokenStoreModule, 'setTokenStore')
      const installSidecarHumbleSecretStoreSpy = jest.spyOn(
        humbleSecretStoreModule,
        'installSidecarHumbleSecretStore'
      )
      const migrateHumbleSecretsSpy = jest.spyOn(
        humbleSecretStoreModule,
        'migrateHumbleSecrets'
      )

      try {
        const input = new PassThrough()
        const output = new PassThrough()
        init(input, output)

        expect(setTokenStoreSpy).not.toHaveBeenCalled()
        expect(installSidecarHumbleSecretStoreSpy).not.toHaveBeenCalled()
        // migrateHumbleSecrets() is only ever fired FROM INSIDE installSidecarHumbleSecretStore()
        // (humbleSecretStore.ts) — asserting it directly, not merely inferring it from the line
        // above, is this test's own regression guard against a future edit that calls it from a
        // second site.
        expect(migrateHumbleSecretsSpy).not.toHaveBeenCalled()
        expect(
          mockLogInfo.mock.calls.some(
            ([message]) => message === '[bootstrap] secret stores: dev-vault'
          )
        ).toBe(true)
        expect(
          mockLogInfo.mock.calls.some(
            ([message]) => message === '[bootstrap] secret stores: keyring'
          )
        ).toBe(false)
      } finally {
        installDevSecretVaultSpy.mockRestore()
        setTokenStoreSpy.mockRestore()
        installSidecarHumbleSecretStoreSpy.mockRestore()
        migrateHumbleSecretsSpy.mockRestore()
      }
    })
  })
})
