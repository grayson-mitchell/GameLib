/**
 * Quick 261016-n7s Task 1 (end-to-end): a successful `nile library sync`
 * clears a latched Amazon `expired` flag through `refreshNile()`'s new
 * observer. The expiry probe itself is untouched -- its zero-installed run
 * stays `unknown` by design (A4, F-49-R1-4) and never writes; this is the
 * only clear path that does not require a Reconnect login.
 *
 * `runRunnerCommand` is spied and driven through `options.onOutput`, so no
 * binary is spawned, which is how the isolated half of the fake-HOME
 * two-profile rule holds by construction.
 */
import { sendFrontendMessage } from 'backend/ipc'
import { configStore as nileConfigStore } from 'backend/storeManagers/nile/electronStores'
import {
  __resetSignInEpochsForTests,
  bumpSignInEpoch
} from 'backend/signInProbe/sessionEpoch'
import {
  __resetSignInProbeOutcomesForTests,
  getSignInProbeOutcomes
} from 'backend/signInProbe/outcomes'
import {
  NILE_LIBRARY_SYNC_SUCCESS_MARKER,
  NILE_REFRESH_FAILURE_MARKER
} from 'backend/signInProbe/classify'
import type { FakeFlagStore } from 'backend/signInProbe/__tests__/fakeFlagStore'
import type { CallRunnerOptions, ExecResult } from 'common/types'
import NileLibraryManager from '../library'

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Nile: 'Nile', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({
  clearCache: jest.fn(),
  getFileSize: jest.fn(),
  getNileBin: jest.fn(() => ({ dir: '', bin: 'nile' })),
  removeSpecialcharacters: jest.fn((s: string) => s)
}))
jest.mock('backend/launcher', () => ({ callRunner: jest.fn() }))
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn(),
  addHandler: jest.fn(),
  addTestOnlyListener: jest.fn()
}))

// Breaks the F2 storeManagers import cycle -- both library.ts (via
// backend/utils -> index.ts) and user.ts (direct) resolve through here.
jest.mock('../..', () => ({ libraryManagerMap: {} }))

// Plain-object fake stores (immune to resetMocks), one per store verdict.ts
// reaches, plus the nile module's non-config exports library.ts also imports.
jest.mock('backend/storeManagers/nile/electronStores', () => ({
  configStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore(),
  installStore: { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
  libraryStore: { get: jest.fn(() => []), set: jest.fn() }
}))
jest.mock('backend/storeManagers/legendary/electronStores', () => ({
  legendaryConfigStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/gog/electronStores', () => ({
  configStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/storeManagers/steam/electronStores', () => ({
  configStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))
jest.mock('backend/humble/electronStores', () => ({
  configStore: jest
    .requireActual<
      typeof import('backend/signInProbe/__tests__/fakeFlagStore')
    >('backend/signInProbe/__tests__/fakeFlagStore')
    .makeFakeFlagStore()
}))

const flag = nileConfigStore as unknown as FakeFlagStore
const sendMock = sendFrontendMessage as unknown as jest.Mock

/** F5's drive pattern: feed chunks through `onOutput`, no binary spawned. */
function armRunner(
  mgr: NileLibraryManager,
  chunks: string[],
  result: { error?: string; abort?: boolean; stderr?: string } = {}
) {
  jest
    .spyOn(mgr, 'runRunnerCommand')
    .mockImplementation((_argv: string[], options?: CallRunnerOptions) => {
      chunks.forEach((chunk) => options?.onOutput?.(chunk, {} as never))
      return Promise.resolve({
        stdout: '',
        stderr: result.stderr ?? '',
        error: result.error,
        abort: result.abort ?? false
      })
    })
}

/** `refreshNile` is private; go at it directly per F5. */
async function callRefreshNile(mgr: NileLibraryManager): Promise<ExecResult> {
  return (
    mgr as unknown as { refreshNile(): Promise<ExecResult> }
  ).refreshNile()
}

// The real shape from F1: `INFO [LIBRARY]:` + TAB + space + the phrase, so
// the arm proves substring matching against observed text, not a
// hand-trimmed literal.
const SUCCESS_CHUNK = `INFO [LIBRARY]:\t ${NILE_LIBRARY_SYNC_SUCCESS_MARKER}`

beforeEach(() => {
  flag.reset()
  __resetSignInEpochsForTests()
  __resetSignInProbeOutcomesForTests()
})

describe('Amazon: a successful library sync clears a latched flag (quick 261016-n7s)', () => {
  it('a clean sync carrying the success phrase deletes expired, marks healthy and publishes once', async () => {
    flag.data.set('expired', true)
    const mgr = new NileLibraryManager()
    armRunner(mgr, [SUCCESS_CHUNK])

    await callRefreshNile(mgr)

    expect(flag.data.has('expired')).toBe(false)
    expect(flag.deletes).toContain('expired')
    expect(getSignInProbeOutcomes().nile).toBe('healthy')
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith('signInProbeOutcomes', {
      outcomes: expect.objectContaining({ nile: 'healthy' })
    })
  })

  it('a failed refresh (400, non-zero exit) leaves a latched flag set and never clears it', async () => {
    flag.data.set('expired', true)
    const mgr = new NileLibraryManager()
    armRunner(mgr, [`${NILE_REFRESH_FAILURE_MARKER} <Response [400]>`], {
      error: 'Process exited with code 1'
    })

    await callRefreshNile(mgr)

    // classifyNileLibrarySync returns 'unknown' here, so applySignInVerdict's
    // 'unknown' branch never touches the flag (verdict.ts: "unknown NEVER
    // writes"). The outcome is still recorded/published as 'unknown', mirroring
    // pass.ts: only a 'stale' result skips the record+publish.
    expect(flag.data.get('expired')).toBe(true)
    expect(flag.deletes).not.toContain('expired')
    expect(getSignInProbeOutcomes().nile).toBe('unknown')
  })

  it('an epoch bump mid-flight (a fresh sign-in landing during the spawn) makes the verdict stale: the flag is left untouched and nothing is published (T-49-10)', async () => {
    flag.data.set('expired', true)
    const mgr = new NileLibraryManager()
    jest
      .spyOn(mgr, 'runRunnerCommand')
      .mockImplementation((_argv: string[], options?: CallRunnerOptions) => {
        options?.onOutput?.(SUCCESS_CHUNK, {} as never)
        // Simulates a sign-in completing while this spawn is still in flight --
        // the epoch was already captured before runRunnerCommand was called.
        bumpSignInEpoch('nile')
        return Promise.resolve({
          stdout: '',
          stderr: '',
          error: undefined,
          abort: false
        })
      })

    await callRefreshNile(mgr)

    expect(flag.data.get('expired')).toBe(true)
    expect(flag.deletes).not.toContain('expired')
    expect(getSignInProbeOutcomes().nile).toBeUndefined()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('a synchronous throw inside the observer resolves cleanly, with no unhandled rejection and nothing published (F6)', async () => {
    const mgr = new NileLibraryManager()
    jest.spyOn(mgr, 'runRunnerCommand').mockImplementation(() => {
      throw new Error('forced for quick 261016-n7s F6 throw-safety')
    })

    await expect(callRefreshNile(mgr)).resolves.toEqual({
      stderr: '',
      stdout: ''
    })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
