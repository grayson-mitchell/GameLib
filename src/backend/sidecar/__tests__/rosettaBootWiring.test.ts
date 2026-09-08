/**
 * Positive-direction proof for Block F (todo 2026-09-06, quick-260908-k3x): drives
 * `checkRosettaWhenMac()` through the REAL `init()` boot path, not a direct call, mirroring
 * `migrationsWiring.test.ts`'s mocking hygiene and reusing `bootstrapWirings.test.ts`'s
 * `online_monitor`/`axios`/`waitFor` shapes.
 *
 * This regression survived two phases behind a green `checkRosettaInstall.test.ts` -- a
 * function test that proved the function itself worked and said nothing about whether
 * anything ever called it. Test 1 below is the RED-provable proof that closes that gap: it
 * was run against a pre-Block-F `bootstrap.ts` and failed with a genuine assertion failure
 * naming the missing call (recorded verbatim in this quick task's SUMMARY), not a
 * module-resolution error.
 *
 * `jest.unmock('i18next')` is load-bearing (same reason as `bootstrapWirings.test.ts`'s own
 * header): `src/backend/__mocks__/i18next.ts` is substituted for the real package in every
 * backend test file automatically, and its `t: (key) => key` stub would make Test 1(c)'s
 * ordering discriminator meaningless (a stub always echoes the key back, loaded catalog or
 * not).
 *
 * `backend/constants/environment` is PINNED (`isMac: true`), not host-derived -- this suite
 * must be deterministic on a Linux CI runner too, where `isMac` would otherwise be `false`
 * and the probe would never run at all.
 *
 * `child_process.exec` is mocked so the probe never shells a real `arch` binary; re-implemented
 * in `beforeEach` because `resetMocks: true` strips the factory-supplied implementation before
 * every test (same gotcha `migrationsWiring.test.ts` documents for its own `cp` mock).
 *
 * `dialog.showMessageBox` is spied on (not left to run for real) -- letting the real
 * `RUST_DIALOG_MESSAGE` forward run would arm a 60-second `requestRustInvoke` timer against a
 * bare `PassThrough` that answers nothing, which is the live `pnpm test:ci` red this repo has
 * already paid for once (`sidecarRpc.ts:339`).
 *
 * NO `jest.isolateModules()` here, deliberately -- the two tests below must share
 * `bootstrap.ts`'s module state (`rosettaCheckInitialized`), the same way
 * `migrationsWiring.test.ts`'s pair does, so Test 2 can prove idempotence against the guard
 * Test 1 already tripped.
 *
 * NO per-suite `jest.mock('os', ...)` -- `src/backend/jest.setupContainment.ts` already
 * redirects `os.homedir()` project-wide for the backend jest project (gotcha 4).
 */

// ── online_monitor — full-surface mock (mirrors bootstrapWirings.test.ts's own block: the
// real function reads `net.isOnline()` from `electron`, which the generic automock does not
// provide) ───────────────────────────────────────────────────────────────────────────────────
jest.mock('../../online_monitor', () => ({
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((callback: () => unknown) => callback()),
  onConnectivityChange: jest.fn()
}))

// ── axios — scriptable, never a real network call (mirrors bootstrapWirings.test.ts) ───────
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn((url: string) => {
      if (typeof url === 'string' && url.includes('release-data.json')) {
        return Promise.resolve({
          data: { anticheatFiles: { shaMac: 'mock-sha', shaLinux: 'mock-sha' } }
        })
      }
      if (typeof url === 'string' && url.includes('games.json')) {
        return Promise.resolve({ data: '[]' })
      }
      return Promise.reject(
        new Error(`rosettaBootWiring.test.ts: unexpected axios.get URL "${url}"`)
      )
    }),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

// ── backend/constants/environment — PINNED isMac:true so this suite is deterministic
// regardless of the host OS running it (gotcha: a host-derived isMac would silently no-op
// this whole suite on a Linux CI runner) ────────────────────────────────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: true,
  isLinux: false,
  isSteamDeckGameMode: false,
  isFlatpak: false
}))

// ── backend/config — avoid a real on-disk config.json write while leaving the real i18next
// path intact (mirrors bootstrapWirings.test.ts / settingsFlows.test.ts). The factory's
// `get` implementation below is a declaration only -- `resetMocks: true` strips it before
// EVERY test (the same gotcha this file's header names for `child_process.exec`), so it is
// re-asserted in `beforeEach` too. Without that, `GlobalConfig.get()` returns `undefined`,
// `.getSettings()` throws inside `init()`'s own try/catch, and `i18nReady` never gets
// reassigned off its initial `Promise.resolve()` -- silently racing `checkRosettaInstall()`
// ahead of a real i18next load instead of proving the fix waits for it.
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn(() => ({
      getSettings: () => ({ language: 'en' }),
      setSetting: jest.fn(),
      set: jest.fn(),
      flush: jest.fn()
    }))
  }
}))

// ── child_process — the probe's own transport, scriptable per test ─────────────────────────
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  exec: jest.fn()
}))

// ── i18next — DEFEAT Jest's project-wide automatic manual mock (see header) ────────────────
jest.unmock('i18next')

import { PassThrough } from 'node:stream'
import { exec } from 'child_process'
import i18next from 'i18next'
import { GlobalConfig } from 'backend/config'
import { dialog } from '../../platform'
import { init } from '../bootstrap'

const mockedExec = exec as unknown as jest.Mock
const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock

/** Polls a predicate with real timers -- the probe and dialog are floated off `init()`. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return predicate()
}

describe('sidecar bootstrap runs the Rosetta probe (todo 2026-09-06, quick-260908-k3x)', () => {
  beforeEach(() => {
    // resetMocks: true wipes factory-supplied implementations before EVERY test (the same
    // gotcha migrationsWiring.test.ts documents for its own `cp` mock).
    mockedExec.mockImplementation(
      (_cmd: string, cb: (error: Error | null, result?: unknown) => void) => {
        cb(
          new Error(
            'arch: posix_spawnp: /usr/sbin/sysctl: Bad CPU type in executable'
          )
        )
      }
    )
    // Same `resetMocks: true` gotcha applies to `backend/config`'s factory -- without this,
    // `GlobalConfig.get()` returns `undefined` and `init()`'s i18next block throws inside its
    // own try/catch before ever reassigning `i18nReady`.
    mockedGlobalConfigGet.mockReturnValue({
      getSettings: () => ({ language: 'en' }),
      setSetting: jest.fn(),
      set: jest.fn(),
      flush: jest.fn()
    })
  })

  it('THE POINT OF THIS FIX: a failed probe reaches dialog.showMessageBox with the loaded catalog title, from init() alone', async () => {
    let capturedTitleAtCallTime: string | undefined
    const showMessageBoxSpy = jest
      .spyOn(dialog, 'showMessageBox')
      .mockImplementation(async () => {
        // The ordering discriminator (same technique as gamelibNamespaceLoad.test.ts): a
        // default-carrying t() call cannot distinguish "i18next chained correctly" from
        // "statement order happened to work", because the en catalog string and
        // checkRosettaInstall()'s inline default are byte-identical. Calling with NO
        // default argument is what makes the two states observably different: loaded
        // catalog -> "Rosetta not found"; unloaded -> the raw key echoed back.
        capturedTitleAtCallTime = i18next.t('box.warning.rosetta.title')
        return { response: 0, checkboxChecked: false }
      })

    init(new PassThrough(), new PassThrough())

    // (a) the probe ran, from boot -- pre-fix this never became true no matter how long you
    // waited: init() had no call chain reaching checkRosettaInstall() at all.
    expect(
      await waitFor(() =>
        mockedExec.mock.calls.some(
          (call) =>
            typeof call[0] === 'string' &&
            call[0].includes('arch -x86_64') &&
            call[0].includes('sysctl.proc_translated')
        )
      )
    ).toBe(true)

    // (b) the dialog fired exactly once, with the loaded-catalog title.
    expect(await waitFor(() => showMessageBoxSpy.mock.calls.length === 1)).toBe(
      true
    )
    expect(showMessageBoxSpy).toHaveBeenCalledTimes(1)
    const dialogOptions = showMessageBoxSpy.mock.calls[0][0] as {
      title?: string
    }
    expect(dialogOptions.title).toBe('Rosetta not found')

    // (c) the ordering discriminator itself: at the moment the dialog stub was invoked, a
    // default-free t() call already resolved to the real catalog string, not the raw key --
    // proving the chain waited for the loaded catalog rather than relying on statement order.
    expect(capturedTitleAtCallTime).toBe('Rosetta not found')
    expect(capturedTitleAtCallTime).not.toBe('box.warning.rosetta.title')
  }, 8000)
  // ^ explicit per-test timeout, longer than waitFor()'s own 5000ms default: without this,
  // jest's default 5000ms test timeout races waitFor()'s internal timeout and can kill the
  // test with "Exceeded timeout of 5000 ms" before the `expect(await waitFor(...)).toBe(true)`
  // assertion itself gets to run and fail cleanly -- confirmed against the pre-Block-F tree
  // (quick-260908-k3x RED proof, recorded verbatim in that quick task's SUMMARY).

  // KNOWN VACUITY, recorded rather than hidden (same words migrationsWiring.test.ts uses for
  // its own idempotence test): this test also passes against a bootstrap.ts with NO Rosetta
  // wiring at all. It is meaningful solely in sequence with the test above, which is what
  // establishes that the probe runs at all. Never read a green here as evidence of wiring.
  it('is once-guarded: a second and third init() does not re-probe', async () => {
    jest.spyOn(dialog, 'showMessageBox').mockResolvedValue({
      response: 0,
      checkboxChecked: false
    })

    const callsBeforeReinit = mockedExec.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' && call[0].includes('sysctl.proc_translated')
    ).length

    init(new PassThrough(), new PassThrough())
    init(new PassThrough(), new PassThrough())
    await new Promise((resolve) => setTimeout(resolve, 100))

    const callsAfterReinit = mockedExec.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' && call[0].includes('sysctl.proc_translated')
    ).length

    expect(callsAfterReinit).toBe(callsBeforeReinit)
  })
})
