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
 * `../isPackagedSidecar` is mocked (Phase 35 plan 04 repointed this from
 * `../humbleFlowRegistration`, which now merely re-exports the symbol). The mock is a full
 * replacement, which is safe ONLY because that module has exactly one export. It was NOT safe
 * against `../humbleFlowRegistration`, and the reason is worth keeping: the second describe
 * block below (Task 2) drives the REAL `../bootstrap` `init`, whose `./handlers` import graph
 * calls the REAL `registerHumbleFlows()` at ITS OWN module scope (`handlers.ts:194`), so a
 * full-replacement mock of that module would leave the call undefined and throw the instant
 * `../bootstrap` — or anything importing it — is required. If this mock is ever pointed back at
 * a multi-export module, restore the `jest.requireActual(...)` spread with it.
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
// they call `createDevSecretVault()` directly without ever calling `../bootstrap`'s `init`,
// so `heroicLogWriter` is never constructed and a REAL `logWarning`/`logError` call-through
// would throw (`sidecar-console-and-logger-are-invisible`, this project's own recorded gotcha).
// The real import lives in the "Imports (after mocks)" block below; only the spy handles are
// declared here. ─────────────────────────────────────────────────────────────────────────────
let mockLogInfo: jest.SpyInstance
let mockLogWarning: jest.SpyInstance
let mockLogError: jest.SpyInstance

// ── pathShim mock — REAL module for every name except 'temp', which each test points at a
// disposable per-test mkdtemp dir (never the developer's real os.tmpdir()). Must stay REAL for
// every other name: `platform/index.ts`'s `app.getPath` is a direct re-export of THIS SAME
// module's `getPath` (`platform/index.ts:39,203`), and `backend/constants/paths.ts` calls
// `app.getPath('appData'|'userData')` at MODULE SCOPE — a full-replacement mock (Task 1's
// original, pre-Task-2 shape) would throw on that call the instant anything in this file
// imports the real `./handlers` graph (Task 2's bootstrap wiring block does, via `../bootstrap`). ─
const realPathShim: typeof import('../pathShim') =
  jest.requireActual('../pathShim')
// Phase 35 Plan 05 (D-04): a DEFAULT implementation is required at module scope, not just in
// `beforeEach`. `backend/store_backend.ts` resolves its cwd from `pathShim.getPath('userData')`,
// and `backend/cache.ts` constructs `new CacheStore()` at MODULE SCOPE — so this mock is called
// during the import graph below, long before any `beforeEach` runs. Without a default it
// returned `undefined` and `join(undefined, 'store_cache')` threw. Before the swap the same
// construction went through `electron-store` -> `app.getPath()` -> the `electron` automock, so
// it never reached this mock at import time. `resetMocks: true` clears this default before each
// test, which is harmless: `beforeEach` below installs the same fall-through plus the 'temp'
// redirect.
const mockGetPath = jest.fn((name: string) => realPathShim.getPath(name))
jest.mock('../pathShim', () => ({
  getPath: (name: string) => mockGetPath(name)
}))

// ── isPackagedSidecar mock — repointed by Phase 35 plan 04 from '../humbleFlowRegistration'
// to '../isPackagedSidecar', because that plan MOVED the function so app.isPackaged could
// become a third caller of one derivation rather than a second copy of it (T-35-11).
//
// A FULL replacement is correct here, unlike the requireActual-spread this previously needed:
// the reason for that spread was that '../humbleFlowRegistration' also exports the REAL
// registerHumbleFlows(), which the bootstrap-wiring describe block below drives through
// handlers.ts's module scope. '../isPackagedSidecar' exports this one function and nothing
// else, so replacing it wholesale strands nothing. humbleFlowRegistration re-exports the same
// symbol; because it re-exports from the module mocked here, the real registrar sees the
// scripted value too. ───────────────────────────────────────────────────────────────────────
const mockIsPackagedSidecar = jest.fn()
jest.mock('../isPackagedSidecar', () => ({
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
// ONLY by Task 2's bootstrap wiring describe block below, which drives the REAL `init`; see
// that file's header for why the real `initOnlineMonitor()` throws under the default 'electron'
// automock this project applies to every backend test file). ─────────────────────────────────

// ── Imports (after mocks) ────────────────────────────────────────────────────────────────────
import { statSync, readFileSync } from 'fs'
import { chmodSync as mockedChmodSync } from 'graceful-fs'
import * as loggerModule from 'backend/logger'
import { createDevSecretVault } from '../devSecretVault'
import * as devSecretVaultModule from '../devSecretVault'
import * as tokenStoreModule from 'backend/storeManagers/steam/tokenStore'
import * as humbleSecretStoreModule from '../humbleSecretStore'
import { bootFresh } from './helpers/sidecarHarness'

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
      // bootstrap `init` needs 'appData'/'userData'/etc. via platformApi's app.getPath) falls
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
    // the real write path (Task 1's tests never call `../bootstrap`'s `init`, so
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

  it('unset: returns null and builds nothing (the F-1 regression guard)', () => {
    expect(createDevSecretVault()).toBeNull()
  })

  it.each(['0', 'false'])(
    "'%s' does not enable the vault (proves exact-'1' match, not truthiness)",
    (value) => {
      process.env[ENV_VAR] = value

      expect(createDevSecretVault()).toBeNull()
    }
  )

  // ── Guardrail (c): production-refused, fail-closed ─────────────────────────────────────────

  it('packaged build: refuses, builds nothing, and logs REFUSED', () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(true)

    expect(createDevSecretVault()).toBeNull()
    expect(
      mockLogError.mock.calls.some(([message]) =>
        String(message).includes('[dev-secret-vault] REFUSED')
      )
    ).toBe(true)
  })

  it('isPackagedSidecar() throwing: refuses (fail-closed), builds nothing', () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockImplementation(() => {
      throw new Error('build-kind detector exploded')
    })

    expect(createDevSecretVault()).toBeNull()
  })

  it('vault file cannot be created with owner-only permissions: refuses and logs REFUSED', () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)
    ;(mockedChmodSync as jest.Mock).mockImplementation(() => {
      throw new Error('EPERM: operation not permitted, chmod')
    })

    expect(createDevSecretVault()).toBeNull()
    expect(
      mockLogError.mock.calls.some(([message]) =>
        String(message).includes('[dev-secret-vault] REFUSED')
      )
    ).toBe(true)
  })

  // ── Guardrail (b): loud, value-free logging + successful install ──────────────────────────

  it("'1' in a dev build: builds all three stores once, logs INSTALLED + PLAINTEXT", () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)

    const vault = createDevSecretVault()
    if (!vault) throw new Error('expected the dev vault to be built')
    expect(vault.tokenStore).toBeDefined()
    expect(vault.humbleSecretStore).toBeDefined()
    expect(vault.steamGridDbSecretStore).toBeDefined()

    const installedLine = mockLogWarning.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes('[dev-secret-vault] INSTALLED'))
    expect(installedLine).toBeDefined()
    expect(installedLine).toContain('PLAINTEXT')
  })

  it('the vault file is created with mode 0o600', () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)

    const vault = createDevSecretVault()
    if (!vault) throw new Error('expected the dev vault to be built')

    const vaultPath = join(vaultDir, 'gamelib-dev-secret-vault.json')
    const mode = statSync(vaultPath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('write-then-read round-trips a secret, and NO logged argument leaks the value, a substring of it, or its length', async () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)

    const vault = createDevSecretVault()
    if (!vault) throw new Error('expected the dev vault to be built')

    // Deliberately random, no natural-language overlap with this module's own log vocabulary
    // (slot names, "INSTALLED", "PLAINTEXT", the vault's file path) — a secret that happened to
    // literally contain a substring like "refresh-token" would make the leak-scan below fail on
    // an innocent coincidence rather than a real leak.
    const secretValue = 'xQ7mK2vL9wZ3nR8pJ5tY'
    const tokenStore = vault.tokenStore
    await tokenStore.setToken(secretValue)
    const readBack = await tokenStore.getToken()
    expect(readBack).toBe(secretValue)

    const humbleStore = vault.humbleSecretStore
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
    const vault = createDevSecretVault()
    if (!vault) throw new Error('expected the dev vault to be built')

    const tokenStore = vault.tokenStore
    await tokenStore.getToken()

    expect(
      mockLogWarning.mock.calls.some(
        ([message]) =>
          message === '[dev-secret-vault] read key=steam-refresh-token'
      )
    ).toBe(true)
  })

  it('a store and a wipe of the Steam slot emit distinct, strictly-pinned direction lines, and the wipe leaves the slot present-and-empty on disk at mode 0600', async () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)
    const vault = createDevSecretVault()
    if (!vault) throw new Error('expected the dev vault to be built')

    // Deliberately random, no natural-language overlap with this module's own log vocabulary —
    // see the sibling round-trip test above for why that matters.
    const secretValue = 'hT3kN7cQ1wE9mX5jR2vY'
    const tokenStore = vault.tokenStore
    await tokenStore.setToken(secretValue)
    await tokenStore.clearToken()

    expect(
      mockLogWarning.mock.calls.some(
        ([message]) =>
          message ===
          '[dev-secret-vault] write key=steam-refresh-token op=store'
      )
    ).toBe(true)
    expect(
      mockLogWarning.mock.calls.some(
        ([message]) =>
          message === '[dev-secret-vault] write key=steam-refresh-token op=wipe'
      )
    ).toBe(true)
    expect(
      mockLogWarning.mock.calls.some(
        ([message]) =>
          message === '[dev-secret-vault] write key=steam-refresh-token'
      )
    ).toBe(false)

    const vaultPath = join(vaultDir, 'gamelib-dev-secret-vault.json')
    const onDisk: Record<string, unknown> = JSON.parse(
      readFileSync(vaultPath, 'utf-8')
    )
    expect(onDisk['steam-refresh-token']).toBe('')
    const mode = statSync(vaultPath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('clearing both Humble secrets emits a strictly-pinned wipe line for each slot, and leaves both present-and-empty on disk', async () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)
    const vault = createDevSecretVault()
    if (!vault) throw new Error('expected the dev vault to be built')

    const humbleStore = vault.humbleSecretStore
    await humbleStore.setSecret('sessionCookie', 'kR8mT2vN5wQ9cX1jH4pL')
    await humbleStore.setSecret('csrfToken', 'gY6bW3fD8sA1nZ7uE2qJ')
    await humbleStore.clearSecrets()

    expect(
      mockLogWarning.mock.calls.some(
        ([message]) =>
          message === '[dev-secret-vault] write key=sessionCookie op=wipe'
      )
    ).toBe(true)
    expect(
      mockLogWarning.mock.calls.some(
        ([message]) =>
          message === '[dev-secret-vault] write key=csrfToken op=wipe'
      )
    ).toBe(true)

    const vaultPath = join(vaultDir, 'gamelib-dev-secret-vault.json')
    const onDisk: Record<string, unknown> = JSON.parse(
      readFileSync(vaultPath, 'utf-8')
    )
    expect(onDisk['sessionCookie']).toBe('')
    expect(onDisk['csrfToken']).toBe('')
  })

  it('clearing the SteamGridDB API key emits a strictly-pinned wipe line', async () => {
    process.env[ENV_VAR] = '1'
    mockIsPackagedSidecar.mockReturnValue(false)
    const vault = createDevSecretVault()
    if (!vault) throw new Error('expected the dev vault to be built')

    const steamGridDbStore = vault.steamGridDbSecretStore
    await steamGridDbStore.setApiKey('pV4tK9nC6yB2mR8gS5wE')
    await steamGridDbStore.clearApiKey()

    expect(
      mockLogWarning.mock.calls.some(
        ([message]) =>
          message === '[dev-secret-vault] write key=steamGridDbApiKey op=wipe'
      )
    ).toBe(true)
  })

  // ── Import-time discipline: no file I/O before createDevSecretVault() is called ──────────

  it('performs no file I/O at module import — no vault file exists until createDevSecretVault() is called', () => {
    process.env[ENV_VAR] = '1'
    // No install call in this test. `../devSecretVault` was already imported at the top of
    // this file (before this test's own `beforeEach` ever pointed `mockGetPath` at this fresh
    // `vaultDir`) — if the module performed any file I/O at import time, a file would already
    // sit at this path despite `createDevSecretVault()` never having been called here.
    const vaultPath = join(vaultDir, 'gamelib-dev-secret-vault.json')
    expect(() => readFileSync(vaultPath)).toThrow()
  })

  // ── Task 2: the exclusive branch in bootstrap.ts's init ─────────────────────────────────
  //
  // Drives the REAL `../bootstrap` `init` (nested inside this describe block so it inherits
  // the outer `beforeEach`'s fresh `vaultDir`/`mockGetPath`/mock-reset setup, even though these
  // tests mock `createDevSecretVault` directly rather than driving it through a real env var).
  // `createDevSecretVault` itself is spied and forced to a fixed return value per test — Task 1
  // above already proves its OWN real behavior; this block proves only which arm `init` takes
  // given that return value, and that the branch is exclusive (never both, never neither).
  describe('bootstrap wiring — exclusive secret-store branch (Task 2)', () => {
    // D-08: one boot per case in a fresh registry. The spied modules are required from THAT
    // registry (a top-level import would be a stale instance after resetModules), the logger
    // spies are re-pointed at the fresh logger, then the boot happens exactly once.
    function freshRegistry() {
      jest.resetModules()
      /* eslint-disable @typescript-eslint/no-require-imports */
      const freshLogger = require('backend/logger') as typeof loggerModule
      const freshVault =
        require('../devSecretVault') as typeof devSecretVaultModule
      const freshTokenStore =
        require('backend/storeManagers/steam/tokenStore') as typeof tokenStoreModule
      const freshHumbleStore =
        require('../humbleSecretStore') as typeof humbleSecretStoreModule
      /* eslint-enable @typescript-eslint/no-require-imports */
      mockLogInfo = jest
        .spyOn(freshLogger, 'logInfo')
        .mockImplementation(() => {})
      mockLogWarning = jest
        .spyOn(freshLogger, 'logWarning')
        .mockImplementation(() => {})
      mockLogError = jest
        .spyOn(freshLogger, 'logError')
        .mockImplementation(() => {})
      return { freshVault, freshTokenStore, freshHumbleStore }
    }

    it('vault disabled: installs the keyring stores exactly as today, and emits the keyring receipt line', () => {
      const { freshVault, freshTokenStore, freshHumbleStore } = freshRegistry()
      const createDevSecretVaultSpy = jest
        .spyOn(freshVault, 'createDevSecretVault')
        .mockReturnValue(null)
      const setTokenStoreSpy = jest.spyOn(freshTokenStore, 'setTokenStore')
      const installSidecarHumbleSecretStoreSpy = jest.spyOn(
        freshHumbleStore,
        'installSidecarHumbleSecretStore'
      )

      try {
        bootFresh({ reuseRegistry: true })

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
        createDevSecretVaultSpy.mockRestore()
        setTokenStoreSpy.mockRestore()
        installSidecarHumbleSecretStoreSpy.mockRestore()
      }
    })

    it('vault enabled: installs the vault token store, not the keyring stores, fires no Humble migration, and emits the dev-vault receipt line', () => {
      const { freshVault, freshTokenStore, freshHumbleStore } = freshRegistry()
      const fakeVault = {
        tokenStore: {
          isAvailable: async () => true,
          getToken: async () => '',
          setToken: async () => undefined,
          clearToken: async () => undefined
        },
        humbleSecretStore: {
          isAvailable: async () => true,
          getSecret: async () => '',
          setSecret: async () => undefined,
          clearSecrets: async () => undefined
        },
        steamGridDbSecretStore: {
          isAvailable: () => true,
          getApiKey: async () => undefined,
          setApiKey: async () => undefined,
          clearApiKey: async () => undefined
        }
      }
      const createDevSecretVaultSpy = jest
        .spyOn(freshVault, 'createDevSecretVault')
        .mockReturnValue(fakeVault)
      const setTokenStoreSpy = jest.spyOn(freshTokenStore, 'setTokenStore')
      const installSidecarHumbleSecretStoreSpy = jest.spyOn(
        freshHumbleStore,
        'installSidecarHumbleSecretStore'
      )
      const migrateHumbleSecretsSpy = jest.spyOn(
        freshHumbleStore,
        'migrateHumbleSecrets'
      )

      try {
        bootFresh({ reuseRegistry: true })

        expect(setTokenStoreSpy).toHaveBeenCalledTimes(1)
        expect(setTokenStoreSpy).toHaveBeenCalledWith(fakeVault.tokenStore)
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
        createDevSecretVaultSpy.mockRestore()
        setTokenStoreSpy.mockRestore()
        installSidecarHumbleSecretStoreSpy.mockRestore()
        migrateHumbleSecretsSpy.mockRestore()
      }
    })
  })
})
