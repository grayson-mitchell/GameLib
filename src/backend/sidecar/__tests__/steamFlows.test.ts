/**
 * Behavioural dispatch coverage for `handleLaunch` against the production sidecar wiring
 * (Phase 34.5 gap cycle 6, plan 34.5-46).
 *
 * `skeletonFlows.test.ts` is this cycle's Steam-side regression detector and stays
 * untouched — its Test 2/Test 3 `launch` coverage both pass `runner: 'steam'`, so a
 * runner-blind handler and a runner-aware one are indistinguishable to them. This file
 * exists for the coverage hole that shape leaves: a NON-steam runner's dispatch, and the
 * unknown-runner fail-closed guard.
 *
 * Drives the REAL sidecar RPC server in-process, exactly as `skeletonFlows.test.ts` does —
 * a real invoke frame written to stdin, real emitted frames read back — so this exercises
 * `handlers.ts`'s `registerSteamFlows()` registration and the real transport, not a
 * hand-built call to `handleLaunch` (a test reconstructing the call site is a replica and
 * drifts silently; this phase has an in-cycle precedent in plan 34.5-45's
 * `shortcutsFlows.test.ts` finding, where a mock asserted the defect as correct).
 *
 * `backend/storeManagers` and `storeManagers/steam/games` are DELIBERATELY left unmocked —
 * mocking either would erase the very dispatch this test exists to observe. Only
 * `backend/launcher`'s `launchEventCallback` is mocked, to keep the assertion about
 * DISPATCH (was the right function called, with the right runner) rather than about a real
 * non-Steam launch succeeding end to end.
 */

// ── os — same disposable-homedir redirect as skeletonFlows.test.ts. Without it this suite
// would reach the developer's real `~/Library/Application Support/GameLib` store files. ──
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-steamflows-test-home-${process.pid}`)
  }
})

// ── electron / electron-store — route Jest's own module resolution at the real sidecar
// shims, same as skeletonFlows.test.ts (see that file's header for the full reasoning). ──
jest.mock('electron', () => jest.requireActual('../../platform'))
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — init() wires the real online monitor, which would otherwise make a live
// network call from this suite. Same stub as skeletonFlows.test.ts. ──────────────────────
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
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

// ── backend/utils mock — no real on-disk Steam install to scan in CI. ────────────────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── backend/constants/environment mock — pins the native (non-bottle) Steam branch
// deterministically regardless of the host OS running this test. ─────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── SteamUser mock — mirrors skeletonFlows.test.ts / library.test.ts's LIB-01
// convention; automocked, no factory. ──────────────────────────────────────────────────────
jest.mock('../../storeManagers/steam/user')

// ── backend/launcher mock — the ONLY store-manager-adjacent mock in this file. Isolates
// the assertion to DISPATCH (was launchEventCallback called, with runner='gog') rather than
// a real GOG launch succeeding — a real launch would need a real install path, wine
// version, etc. that this test has no business constructing.
const launchEventCallbackMock = jest.fn()
jest.mock('../../launcher', () => ({
  launchEventCallback: (...args: unknown[]) => launchEventCallbackMock(...args)
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────────────────
import { startSidecar, writeInvoke } from './helpers/sidecarHarness'
import { getSteamLibraries } from 'backend/utils'

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('sidecar Steam flows — runner-aware launch dispatch (gap cycle 6, plan 34.5-46)', () => {
  beforeEach(() => {
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    launchEventCallbackMock.mockReset()
    launchEventCallbackMock.mockResolvedValue({ status: 'done' })
  })

  // Test A (the defect, RED before Task 1's fix): a launch invoke for runner='gog'
  // produces ZERO openExternal frames whose URL is steam://. Against the pre-fix handler
  // (`new SteamGame(appName)` unconditionally) this test FAILS because
  // steam://rungameid/... is emitted — that failure is the point of it; see the SUMMARY
  // for the verbatim RED output captured at authoring time.
  it("Test A: a launch invoke for runner='gog' dispatches to launchEventCallback with runner='gog' and emits no steam:// openExternal frame", async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'launch-gog-1', 'launch', [
      { appName: '1207659037', runner: 'gog' }
    ])
    await flush()

    // Asserted FIRST and deliberately: against the pre-fix handler this is the assertion
    // that fails, and its failure output names the actual steam:// URL that was wrongly
    // emitted for a GOG title — the decisive RED evidence, not merely "dispatch didn't
    // happen".
    const openExternal = frames.filter(
      (frame) =>
        frame.kind === 'openExternal' &&
        typeof (frame.args as unknown[] | undefined)?.[0] === 'string' &&
        ((frame.args as unknown[])[0] as string).startsWith('steam://')
    )
    expect(openExternal).toHaveLength(0)

    expect(launchEventCallbackMock).toHaveBeenCalledTimes(1)
    expect(launchEventCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ runner: 'gog', appName: '1207659037' })
    )

    const response = frames.find((frame) => frame.id === 'launch-gog-1')
    expect(response).toMatchObject({
      id: 'launch-gog-1',
      ok: true,
      result: { status: 'done' }
    })
  })

  // Test B (the guard): an unrecognised runner — absent, and each of a prototype-chain
  // name — responds { status: 'error' }, emits no openExternal frame, and calls no
  // manager/launchEventCallback at all.
  describe('Test B: unknown-runner guard', () => {
    const badRunners: Array<{ label: string; runner: unknown }> = [
      { label: 'absent', runner: undefined },
      { label: "'STEAM' (wrong case)", runner: 'STEAM' },
      { label: "'constructor'", runner: 'constructor' }
    ]

    it.each(badRunners)(
      'runner=$label responds { status: "error" }, emits no openExternal frame, and calls no manager',
      async ({ runner, label }) => {
        const { input, frames } = startSidecar()
        const args: Record<string, unknown> = { appName: 'some-app-id' }
        if (runner !== undefined) {
          args.runner = runner
        }
        writeInvoke(input, `launch-bad-${label}`, 'launch', [args])
        await flush()

        expect(launchEventCallbackMock).not.toHaveBeenCalled()

        const openExternal = frames.find(
          (frame) => frame.kind === 'openExternal'
        )
        expect(openExternal).toBeUndefined()

        const response = frames.find(
          (frame) => frame.id === `launch-bad-${label}`
        )
        expect(response).toMatchObject({
          id: `launch-bad-${label}`,
          ok: true,
          result: { status: 'error' }
        })
      }
    )
  })

  // Test C (Steam parity): a numeric appId Steam launch still emits
  // steam://rungameid/<id> and responds { status: 'done' } — the same assertion
  // skeletonFlows.test.ts Test 2 makes, restated here so THIS file alone can detect a
  // Steam regression from a change scoped to this test file's own mocks.
  it("Test C: a launch invoke for runner='steam' still emits steam://rungameid/<id> and responds done", async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'launch-steam-1', 'launch', [
      { appName: '999002', runner: 'steam' }
    ])
    await flush()

    expect(launchEventCallbackMock).not.toHaveBeenCalled()

    const openExternal = frames.find((frame) => frame.kind === 'openExternal')
    expect(openExternal).toBeDefined()
    const url = (openExternal?.args as unknown[])[0] as string
    expect(url).toBe('steam://rungameid/999002')

    const response = frames.find((frame) => frame.id === 'launch-steam-1')
    expect(response).toMatchObject({
      id: 'launch-steam-1',
      ok: true,
      result: { status: 'done' }
    })
  })
})
